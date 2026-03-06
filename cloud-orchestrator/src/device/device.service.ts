import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Device } from './device.entity';
import { DeviceSession } from './device-session.entity';
import { Runner } from '../account/runner.entity';
import { CreateDeviceSessionDto } from './dto/create-session.dto';

@Injectable()
export class DeviceService {
  private logger = new Logger('DeviceService');

  constructor(
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
  ) {}

  // ─── Device Resource Pool ───────────────────────────

  /**
   * Upsert devices reported by a runner heartbeat.
   * - Insert new devices
   * - Update existing (name, model, version, lastSeenAt)
   * - Mark devices NOT in this heartbeat as offline (unless in_use)
   */
  async syncDevicesFromHeartbeat(
    runnerId: string,
    tenantId: string,
    platform: string,
    reportedDevices: Array<{ id: string; platform: string; name: string; model?: string; version?: string }>,
  ) {
    const now = new Date();

    // Only sync physical devices (iOS/Android) reported by runner heartbeat.
    // Web sessions don't need a device in the pool — they're started directly.
    const reportedUdids: string[] = [];
    for (const d of reportedDevices) {
      reportedUdids.push(d.id);
      await this.deviceRepo
        .createQueryBuilder()
        .insert()
        .into(Device)
        .values({
          tenantId,
          runnerId,
          deviceUdid: d.id,
          platform: d.platform as any,
          name: d.name,
          model: d.model || undefined,
          version: d.version || undefined,
          lastSeenAt: now,
        } as any)
        .orUpdate(['name', 'model', 'version', 'last_seen_at', 'updated_at'], ['runner_id', 'device_udid'])
        .execute()
        .catch(() => {});

      // Mark available if was offline and not in_use
      await this.deviceRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'available', lastSeenAt: now })
        .where('runner_id = :runnerId AND device_udid = :udid AND status = :status', {
          runnerId,
          udid: d.id,
          status: 'offline',
        })
        .execute();
    }

    // Mark devices NOT in heartbeat as offline (unless in_use)
    if (reportedUdids.length > 0) {
      await this.deviceRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'offline' })
        .where('runner_id = :runnerId AND device_udid NOT IN (:...udids) AND status = :status', {
          runnerId,
          udids: reportedUdids,
          status: 'available',
        })
        .execute();
    } else {
      // No devices reported — mark all non-in_use as offline
      await this.deviceRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'offline' })
        .where('runner_id = :runnerId AND status = :status', {
          runnerId,
          status: 'available',
        })
        .execute();
    }
  }

  /**
   * Mark all devices for a runner as offline (e.g., runner went offline).
   */
  async markRunnerDevicesOffline(runnerId: string) {
    await this.deviceRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'offline' })
      .where('runner_id = :runnerId AND status = :status', { runnerId, status: 'available' })
      .execute();
  }

  // ─── Device Listing ─────────────────────────────────

  /**
   * List all registered devices for a tenant.
   */
  async listDevices(tenantId: string) {
    const devices = await this.deviceRepo.find({
      where: { tenantId },
      order: { platform: 'ASC', name: 'ASC' },
    });

    // Enrich with runner info
    const runnerIds = [...new Set(devices.map((d) => d.runnerId))];
    const runners =
      runnerIds.length > 0
        ? await this.runnerRepo.find({ where: { id: In(runnerIds) } })
        : [];
    const runnerMap = new Map(runners.map((r) => [r.id, r]));

    return devices.map((d) => {
      const runner = runnerMap.get(d.runnerId);
      const isOnline =
        runner?.lastHeartbeatAt &&
        Date.now() - new Date(runner.lastHeartbeatAt).getTime() < 90_000;
      return {
        id: d.id,
        deviceUdid: d.deviceUdid,
        platform: d.platform,
        name: d.name,
        model: d.model,
        version: d.version,
        status: isOnline ? d.status : 'offline',
        borrowedBy: d.borrowedBy,
        borrowedAt: d.borrowedAt,
        activeSessionId: d.activeSessionId,
        lastSeenAt: d.lastSeenAt,
        runnerId: d.runnerId,
        runnerName: runner?.name,
        runnerOnline: !!isOnline,
      };
    });
  }

  // ─── Borrow / Return ────────────────────────────────

  /**
   * Borrow a device: mark it as in_use and create a mirror session.
   */
  async borrowDevice(tenantId: string, userId: string, dto: CreateDeviceSessionDto) {
    // Find the device in our pool
    const device = await this.deviceRepo.findOne({
      where: { id: dto.deviceId, tenantId },
    });
    if (!device) throw new NotFoundException('Device not found in resource pool');

    // Check availability
    if (device.status === 'in_use') {
      throw new BadRequestException('Device is already borrowed by another user');
    }
    if (device.status === 'offline') {
      throw new BadRequestException('Device is offline — runner may be disconnected');
    }

    // Find runner
    const runner = await this.runnerRepo.findOne({
      where: { id: device.runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    const isOnline =
      runner.lastHeartbeatAt &&
      Date.now() - new Date(runner.lastHeartbeatAt).getTime() < 90_000;
    if (!isOnline) throw new BadRequestException('Runner is offline');

    // Use the device's actual platform, not the runner's nominal platform
    // (runners support all platforms — web, ios, android)
    const platform = device.platform;
    const rc = dto.recordingConfig || {};
    const deviceType = dto.deviceType || rc.deviceType;

    // 1) Create DB session record
    const session = this.sessionRepo.create({
      tenantId,
      runnerId: device.runnerId,
      platform,
      deviceId: device.deviceUdid,
      createdBy: userId,
      status: 'creating',
      options: {
        bundleId: dto.bundleId,
        appPackage: dto.appPackage,
        appActivity: dto.appActivity,
        url: dto.url,
        fps: dto.fps || 2,
        recordingConfig: {
          browser: rc.browser,
          viewport: rc.viewport,
          deviceType,
          sessionName: rc.sessionName,
          authProfileId: rc.authProfileId,
          baseURL: rc.baseURL,
          mirror: rc.mirror,
          mirrorPort: rc.mirrorPort,
          controlOptions: rc.controlOptions,
        },
      },
    });
    await this.sessionRepo.save(session);

    // 2) Mark device as in_use
    device.status = 'in_use';
    device.borrowedBy = userId;
    device.borrowedAt = new Date();
    device.activeSessionId = session.id;
    await this.deviceRepo.save(device);

    // 3) Call runner to create the actual session (Appium/Playwright)
    try {
      const runnerUrl = this.getRunnerUrl(runner);
      this.logger.log(
        `Borrowing device ${device.deviceUdid} → creating session on runner: ${runnerUrl}/sessions`,
      );

      let res: Response;
      try {
        res = await fetch(`${runnerUrl}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            deviceId: device.deviceUdid,
            bundleId: dto.bundleId,
            appPackage: dto.appPackage,
            appActivity: dto.appActivity,
            url: dto.url,
            fps: dto.fps || 2,
            browser: rc.browser,
            viewport: rc.viewport,
            deviceType,
            controlOptions: rc.controlOptions,
          }),
          signal: AbortSignal.timeout(130_000),
        });
      } catch (fetchErr: any) {
        const hint =
          fetchErr.cause?.code === 'ECONNREFUSED'
            ? ` — runner process may not be running on ${runnerUrl}`
            : '';
        await this.failBorrow(session, device, `Cannot reach runner: ${fetchErr.message}${hint}`);
        throw new BadRequestException(session.errorMessage);
      }

      if (!res.ok) {
        const text = await res.text();
        await this.failBorrow(session, device, `Runner returned ${res.status}: ${text.slice(0, 500)}`);
        throw new BadRequestException(session.errorMessage);
      }

      const runnerSession: any = await res.json();
      session.runnerSessionId = runnerSession.id;
      session.status = runnerSession.status === 'error' ? 'error' : 'active';
      session.deviceName = `${platform}:${device.deviceUdid.slice(0, 12)}`;
      if (runnerSession.status === 'error') {
        session.errorMessage = 'Session failed on runner';
        device.status = 'available';
        (device as any).borrowedBy = null;
        (device as any).borrowedAt = null;
        (device as any).activeSessionId = null;
        await this.deviceRepo.save(device);
      }
      await this.sessionRepo.save(session);

      this.logger.log(`Device borrowed: ${device.deviceUdid} → session ${session.id}`);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      await this.failBorrow(session, device, err.message);
      throw new BadRequestException(`Failed to borrow device: ${err.message}`);
    }

    return session;
  }

  private async failBorrow(session: DeviceSession, device: Device, errorMessage: string) {
    session.status = 'error';
    session.errorMessage = errorMessage;
    await this.sessionRepo.save(session).catch(() => {});

    device.status = 'available';
    (device as any).borrowedBy = null;
    (device as any).borrowedAt = null;
    (device as any).activeSessionId = null;
    await this.deviceRepo.save(device).catch(() => {});
  }

  /**
   * Start a web recording session — no physical device needed.
   * Finds an online runner and creates a Playwright session directly.
   */
  async startWebSession(
    tenantId: string,
    userId: string,
    dto: { url: string; fps?: number; deviceType?: string; recordingConfig?: any },
  ) {
    if (!dto.url) throw new BadRequestException('URL is required for web sessions');

    // Find an online runner in this tenant
    const runners = await this.runnerRepo.find({ where: { tenantId } });
    const onlineRunner = runners.find(
      (r) =>
        r.lastHeartbeatAt &&
        Date.now() - new Date(r.lastHeartbeatAt).getTime() < 90_000,
    );
    if (!onlineRunner) throw new BadRequestException('No online runner available');

    const rc = dto.recordingConfig || {};

    // Create DB session record
    const session = this.sessionRepo.create({
      tenantId,
      runnerId: onlineRunner.id,
      platform: 'web',
      deviceId: 'browser',
      createdBy: userId,
      status: 'creating',
      options: {
        url: dto.url,
        fps: dto.fps || 2,
        recordingConfig: {
          browser: rc.browser,
          viewport: rc.viewport,
          deviceType: dto.deviceType || rc.deviceType,
          sessionName: rc.sessionName,
          authProfileId: rc.authProfileId,
          baseURL: rc.baseURL || dto.url,
          controlOptions: rc.controlOptions,
        },
      },
    });
    await this.sessionRepo.save(session);

    // Call runner to create the Playwright session
    try {
      const runnerUrl = this.getRunnerUrl(onlineRunner);
      this.logger.log(`Starting web session on runner: ${runnerUrl}/sessions`);

      const res = await fetch(`${runnerUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'web',
          url: dto.url,
          fps: dto.fps || 2,
          deviceType: dto.deviceType || rc.deviceType,
          viewport: rc.viewport,
          browser: rc.browser,
          controlOptions: rc.controlOptions,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text();
        session.status = 'error';
        session.errorMessage = `Runner returned ${res.status}: ${text.slice(0, 500)}`;
        await this.sessionRepo.save(session);
        throw new BadRequestException(session.errorMessage);
      }

      const runnerSession: any = await res.json();
      session.runnerSessionId = runnerSession.id;
      session.status = 'active';
      session.deviceName = 'web:browser';
      await this.sessionRepo.save(session);

      this.logger.log(`Web session started: ${session.id}`);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      session.status = 'error';
      session.errorMessage = err.message;
      await this.sessionRepo.save(session).catch(() => {});
      throw new BadRequestException(`Failed to start web session: ${err.message}`);
    }

    return session;
  }

  /**
   * Return a borrowed device: close session and mark available.
   */
  async returnDevice(tenantId: string, sessionId: string) {
    const session = await this.getSession(tenantId, sessionId);

    // Call runner to close session
    if (session.runnerSessionId && session.status !== 'closed' && session.status !== 'error') {
      try {
        const runner = await this.runnerRepo.findOne({ where: { id: session.runnerId } });
        if (runner) {
          const runnerUrl = this.getRunnerUrl(runner);
          await fetch(`${runnerUrl}/sessions/${session.runnerSessionId}`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(10_000),
          });
        }
      } catch (err: any) {
        this.logger.warn(`Failed to close session on runner: ${err.message}`);
      }
    }

    session.status = 'closed';
    session.closedAt = new Date();
    await this.sessionRepo.save(session);

    // Release device back to pool
    const device = await this.deviceRepo.findOne({
      where: { runnerId: session.runnerId, deviceUdid: session.deviceId, tenantId },
    });
    if (device && device.activeSessionId === sessionId) {
      device.status = 'available';
      (device as any).borrowedBy = null;
      (device as any).borrowedAt = null;
      (device as any).activeSessionId = null;
      await this.deviceRepo.save(device);
      this.logger.log(`Device returned: ${device.deviceUdid}`);
    }

    return session;
  }

  // ─── Session CRUD (keep for backward compat) ───────

  /**
   * Create session — delegates to borrowDevice.
   */
  async createSession(tenantId: string, userId: string, dto: CreateDeviceSessionDto) {
    return this.borrowDevice(tenantId, userId, dto);
  }

  async listSessions(tenantId: string) {
    return this.sessionRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getSession(tenantId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, tenantId },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /**
   * Close session — delegates to returnDevice.
   */
  async closeSession(tenantId: string, sessionId: string) {
    return this.returnDevice(tenantId, sessionId);
  }

  /**
   * Save recording from runner as a scenario.
   */
  async saveRecording(
    tenantId: string,
    sessionId: string,
    events: any[],
    scenarioName?: string,
    tags?: string[],
  ) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return this.convertToKatabScenario(session, events, scenarioName, tags);
  }

  async updateSessionStatus(
    sessionId: string,
    status: DeviceSession['status'],
    runnerSessionId?: string,
    errorMessage?: string,
  ) {
    const update: any = { status };
    if (runnerSessionId) update.runnerSessionId = runnerSessionId;
    if (errorMessage) update.errorMessage = errorMessage;
    if (status === 'closed') update.closedAt = new Date();
    await this.sessionRepo.update(sessionId, update);
  }

  // ─── Helpers ────────────────────────────────────────

  private getRunnerUrl(runner: Runner): string {
    const host = (runner.metadata as any)?.localApiHost || 'localhost';
    const port = (runner.metadata as any)?.localApiPort || 5001;
    return `http://${host}:${port}`;
  }

  private convertToKatabScenario(
    session: DeviceSession,
    events: any[],
    name?: string,
    tags?: string[],
  ): Record<string, any> {
    const rc = (session.options as any)?.recordingConfig || {};
    const now = Date.now();

    const katabEvents = events.map((e, idx) => {
      const event: Record<string, any> = {
        type: this.mapEventType(e.type, session.platform),
        timestamp: e.timestamp || now,
        stepNo: idx + 1,
      };

      if (e.elementMeta) {
        const preferredLocators = this.buildPreferredLocators(e.elementMeta, session.platform);
        if (preferredLocators.length > 0) {
          event.selector = this.locatorToSelector(preferredLocators[0]);
          event.meta = {
            element: this.buildElementMeta(e.elementMeta),
            preferredLocators,
          };
        }
      }

      if (e.x !== undefined) event.coordinates = { x: e.x, y: e.y };
      if (e.endX !== undefined) {
        event.from = event.coordinates;
        event.to = { x: e.endX, y: e.endY };
        delete event.coordinates;
      }
      if (e.text) event.value = e.text;
      if (e.url) event.url = e.url;
      if (e.duration) event.duration = e.duration;

      return event;
    });

    const scenario: Record<string, any> = {
      id: session.id,
      name: name || `Recording ${session.platform} ${new Date().toISOString().slice(0, 16)}`,
      platform: session.platform,
      startedAt: new Date(session.createdAt).getTime(),
      stoppedAt: now,
      events: katabEvents,
      version: 1,
    };

    if (session.platform === 'web') {
      scenario.metadata = {
        browser: rc.browser || 'chromium',
        viewport: rc.viewport,
        baseURL: rc.baseURL || (session.options as any)?.url,
        deviceType: rc.deviceType,
      };
    } else {
      scenario.deviceType = session.platform;
      scenario.deviceId = session.deviceId;
      if (session.platform === 'ios') {
        scenario.bundleId = (session.options as any)?.bundleId;
      } else {
        scenario.package = (session.options as any)?.appPackage;
      }
    }

    if (tags && tags.length > 0) scenario.tags = tags;
    return scenario;
  }

  private buildPreferredLocators(meta: Record<string, any>, platform: string): any[] {
    const locators: any[] = [];
    if (meta.testId) locators.push({ kind: 'testid', value: meta.testId });
    if (meta.role) locators.push({ kind: 'role', value: meta.role, name: meta.label || meta.name });
    if (platform === 'web') {
      if (meta.label) locators.push({ kind: 'label', value: meta.label });
      if (meta.placeholder) locators.push({ kind: 'placeholder', value: meta.placeholder });
      if (meta.title) locators.push({ kind: 'title', value: meta.title });
      if (meta.textContent || meta.text) locators.push({ kind: 'text', value: meta.textContent || meta.text });
      if (meta.css || meta.cssSelector) locators.push({ kind: 'css', value: meta.css || meta.cssSelector });
    } else {
      if (meta.accessibilityId) locators.push({ kind: 'label', value: meta.accessibilityId });
      if (meta.label && meta.label !== meta.accessibilityId) locators.push({ kind: 'label', value: meta.label });
      if (meta.name) locators.push({ kind: 'text', value: meta.name });
      if (meta.resourceId) locators.push({ kind: 'css', value: meta.resourceId });
      if (meta.contentDesc) locators.push({ kind: 'text', value: meta.contentDesc });
      if (meta.textContent || meta.text) {
        const textVal = meta.textContent || meta.text;
        if (!locators.some((l) => l.value === textVal)) locators.push({ kind: 'text', value: textVal });
      }
    }
    return locators;
  }

  private buildElementMeta(meta: Record<string, any>): Record<string, any> {
    const el: Record<string, any> = {};
    if (meta.type) el.type = meta.type;
    if (meta.label) el.label = meta.label;
    if (meta.name) el.name = meta.name;
    if (meta.accessibilityId) el.accessibilityId = meta.accessibilityId;
    if (meta.testId) el.testId = meta.testId;
    if (meta.textContent || meta.text) el.textContent = meta.textContent || meta.text;
    if (meta.role) el.role = meta.role;
    if (meta.placeholder) el.placeholder = meta.placeholder;
    if (meta.title) el.title = meta.title;
    if (meta.cssSelector || meta.css) el.cssSelector = meta.cssSelector || meta.css;
    if (meta.resourceId) el.resourceId = meta.resourceId;
    if (meta.contentDesc) el.contentDesc = meta.contentDesc;
    if (meta.boundingBox) el.boundingBox = meta.boundingBox;
    if (meta.visible !== undefined) el.isVisible = meta.visible;
    if (meta.enabled !== undefined) el.isEnabled = meta.enabled;
    return el;
  }

  private locatorToSelector(locator: any): string {
    switch (locator.kind) {
      case 'testid': return `[data-testid="${locator.value}"]`;
      case 'role': return locator.name ? `role=${locator.value}[name="${locator.name}"]` : `role=${locator.value}`;
      case 'label': return `label=${locator.value}`;
      case 'placeholder': return `placeholder=${locator.value}`;
      case 'title': return `title=${locator.value}`;
      case 'text': return `text=${locator.value}`;
      case 'css': return locator.value;
      case 'xpath': return `xpath=${locator.value}`;
      default: return locator.value;
    }
  }

  private mapEventType(rawType: string, platform: string): string {
    const map: Record<string, string> = {
      tap: platform === 'web' ? 'click' : 'tap',
      swipe: 'swipe',
      type: platform === 'web' ? 'fill' : 'type',
      key: 'keyboard',
      back: 'back',
      home: 'home',
      scroll: 'scroll',
      click: 'click',
      fill: 'fill',
      navigate: 'navigate',
    };
    return map[rawType] || rawType;
  }
}
