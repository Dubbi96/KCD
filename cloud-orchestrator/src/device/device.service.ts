import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Device } from './device.entity';
import { DeviceSession } from './device-session.entity';
import { Runner } from '../account/runner.entity';
import { CreateDeviceSessionDto } from './dto/create-session.dto';
import { ControlPlaneService } from '../control-plane/control-plane.service';

@Injectable()
export class DeviceService {
  private logger = new Logger('DeviceService');

  constructor(
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    private cpService: ControlPlaneService,
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
   * List all devices from KCP (source of truth for device inventory).
   * KRC reports devices to KCP via heartbeat — KCP is account-independent.
   * KCD enriches with runner info for borrow/session operations.
   */
  async listDevices(tenantId: string) {
    // 1) Get devices from KCP (account-independent, all nodes)
    const kcpDevices: any[] = await this.cpService.getDevices();

    // 2) Get all tenant runners to map KCP nodes → KCD runners for borrow
    const runners = await this.runnerRepo.find({ where: { tenantId } });

    // Build nodeHost:port → runner mapping from runner metadata
    const runnerByHost = new Map<string, Runner>();
    for (const r of runners) {
      const meta = r.metadata as any;
      if (meta?.localApiHost && meta?.localApiPort) {
        runnerByHost.set(`${meta.localApiHost}:${meta.localApiPort}`, r);
      }
    }

    // 3) Get KCP nodes to map nodeId → host:port
    const nodes: any[] = (await this.cpService.getNodes()) || [];
    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

    return kcpDevices.map((d: any) => {
      const node = nodeMap.get(d.nodeId);
      const hostKey = node ? `${node.host}:${node.port}` : '';
      const runner = runnerByHost.get(hostKey);
      const isOnline = node?.status === 'online';

      return {
        id: d.id,
        deviceUdid: d.deviceUdid,
        platform: d.platform,
        name: d.name,
        model: d.model || d.osVersion,
        version: d.osVersion,
        status: isOnline ? d.status : 'offline',
        borrowedBy: d.tenantId === tenantId ? d.tenantId : null,
        borrowedAt: null,
        activeSessionId: null,
        lastSeenAt: d.lastSeenAt,
        runnerId: runner?.id,
        runnerName: runner?.name || node?.name,
        runnerOnline: !!isOnline,
        nodeId: d.nodeId,
      };
    });
  }

  // ─── Borrow / Return ────────────────────────────────

  /**
   * Borrow a device: mark it as in_use and create a mirror session.
   */
  async borrowDevice(tenantId: string, userId: string, dto: CreateDeviceSessionDto) {
    // 1) Find device from KCP (source of truth)
    const kcpDevices: any[] = await this.cpService.getDevices();
    const kcpDevice = kcpDevices.find((d: any) => d.id === dto.deviceId);
    if (!kcpDevice) throw new NotFoundException('Device not found in resource pool');

    if (kcpDevice.status === 'leased') {
      throw new BadRequestException('Device is already borrowed by another user');
    }
    if (kcpDevice.status === 'offline') {
      throw new BadRequestException('Device is offline — runner may be disconnected');
    }

    // 2) Get node info from KCP to find runner host:port
    const nodes: any[] = (await this.cpService.getNodes()) || [];
    const node = nodes.find((n: any) => n.id === kcpDevice.nodeId);
    if (!node || node.status !== 'online') {
      throw new BadRequestException('Node hosting this device is offline');
    }

    // 3) Find the KCD runner that matches this KCP node (by host:port)
    const runners = await this.runnerRepo.find({ where: { tenantId } });
    let runner = runners.find((r) => {
      const meta = r.metadata as any;
      return meta?.localApiHost === node.host && meta?.localApiPort === node.port;
    });

    // Fallback: find any online runner in tenant (for KCD-spawned runners)
    if (!runner) {
      runner = runners.find(
        (r) => r.lastHeartbeatAt && Date.now() - new Date(r.lastHeartbeatAt).getTime() < 90_000,
      );
    }
    if (!runner) throw new BadRequestException('No runner available for this tenant. Create a runner first.');

    const platform = kcpDevice.platform;
    // Construct a device-like object for the rest of the flow
    const device = {
      deviceUdid: kcpDevice.deviceUdid,
      runnerId: runner.id,
      platform,
      status: kcpDevice.status,
    } as any;
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

    // 2) Call runner to create the actual session (Appium/Playwright)
    try {
      const runnerUrl = this.getRunnerUrl(runner);
      this.logger.log(
        `Borrowing device ${device.deviceUdid} → creating session on runner: ${runnerUrl}/sessions`,
      );

      let res: Response;
      try {
        res = await fetch(`${runnerUrl}/sessions`, {
          method: 'POST',
          headers: this.getRunnerHeaders(runner),
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
        session.status = 'error';
        session.errorMessage = `Cannot reach runner: ${fetchErr.message}${hint}`;
        await this.sessionRepo.save(session).catch(() => {});
        throw new BadRequestException(session.errorMessage);
      }

      if (!res.ok) {
        const text = await res.text();
        session.status = 'error';
        session.errorMessage = `Runner returned ${res.status}: ${text.slice(0, 500)}`;
        await this.sessionRepo.save(session).catch(() => {});
        throw new BadRequestException(session.errorMessage);
      }

      const runnerSession: any = await res.json();
      session.runnerSessionId = runnerSession.id;
      session.status = runnerSession.status === 'error' ? 'error' : 'active';
      session.deviceName = `${platform}:${device.deviceUdid.slice(0, 12)}`;
      if (runnerSession.status === 'error') {
        session.errorMessage = 'Session failed on runner';
      }
      await this.sessionRepo.save(session);

      this.logger.log(`Device borrowed: ${device.deviceUdid} → session ${session.id}`);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      session.status = 'error';
      session.errorMessage = err.message;
      await this.sessionRepo.save(session).catch(() => {});
      throw new BadRequestException(`Failed to borrow device: ${err.message}`);
    }

    return session;
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
        headers: this.getRunnerHeaders(onlineRunner),
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
            headers: this.getRunnerHeaders(runner),
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

    this.logger.log(`Device session closed: ${session.deviceId}`);

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

  /** Build headers for KCD → KRC calls (includes runner auth token) */
  private getRunnerHeaders(runner: Runner): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (runner.apiToken) {
      headers['Authorization'] = `Bearer ${runner.apiToken}`;
    }
    return headers;
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
