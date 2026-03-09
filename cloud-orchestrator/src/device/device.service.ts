import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import { Device } from './device.entity';
import { DeviceSession } from './device-session.entity';
import { Runner } from '../account/runner.entity';
import { CreateDeviceSessionDto } from './dto/create-session.dto';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { RunnerTunnelGateway } from './runner-tunnel.gateway';

@Injectable()
export class DeviceService {
  private logger = new Logger('DeviceService');

  constructor(
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    private cpService: ControlPlaneService,
    private runnerTunnel: RunnerTunnelGateway,
  ) {}

  // ─── Device Resource Pool (heartbeat sync) ────────

  async syncDevicesFromHeartbeat(
    runnerId: string,
    tenantId: string,
    platform: string,
    reportedDevices: Array<{ id: string; platform: string; name: string; model?: string; version?: string }>,
  ) {
    const now = new Date();
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

      // Mark available if was offline and NOT borrowed
      await this.deviceRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'available', lastSeenAt: now })
        .where('runner_id = :runnerId AND device_udid = :udid AND status = :status AND borrowed_by IS NULL', {
          runnerId,
          udid: d.id,
          status: 'offline',
        })
        .execute();
    }

    // Mark devices NOT in heartbeat as offline (unless borrowed/in_use)
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

  async markRunnerDevicesOffline(runnerId: string) {
    await this.deviceRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'offline' })
      .where('runner_id = :runnerId AND status = :status', { runnerId, status: 'available' })
      .execute();
  }

  // ─── Device Listing ─────────────────────────────────

  async listDevices(tenantId: string, userId?: string) {
    // KCP = source of truth for device inventory
    const kcpDevices: any[] = await this.cpService.getDevices();
    const runners = await this.runnerRepo.find({ where: { tenantId } });

    const runnerByHost = new Map<string, Runner>();
    for (const r of runners) {
      const meta = r.metadata as any;
      if (meta?.localApiHost && meta?.localApiPort) {
        runnerByHost.set(`${meta.localApiHost}:${meta.localApiPort}`, r);
      }
    }

    const nodes: any[] = (await this.cpService.getNodes()) || [];
    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

    // Load borrow state globally (across all tenants) to prevent cross-tenant conflicts
    const borrowedDevices = await this.deviceRepo.find({
      where: { borrowedBy: Not(IsNull()) },
    });
    const globalBorrowMap = new Map(borrowedDevices.map(d => [d.deviceUdid, d]));

    // Also load current tenant's device records for session info
    const localDevices = await this.deviceRepo.find({ where: { tenantId } });
    const localMap = new Map(localDevices.map(d => [d.deviceUdid, d]));

    const runnerById = new Map(runners.map(r => [r.id, r]));

    return kcpDevices.map((d: any) => {
      const node = nodeMap.get(d.nodeId);
      const hostKey = node ? `${node.host}:${node.port}` : '';
      const localDevice = localMap.get(d.deviceUdid);
      // Resolve runner: prefer runnerId from device record, then host:port match
      const runner = (localDevice?.runnerId ? runnerById.get(localDevice.runnerId) : undefined)
        || runnerByHost.get(hostKey);
      const isOnline = node?.status === 'online';
      const globalBorrow = globalBorrowMap.get(d.deviceUdid);

      return {
        id: d.id,
        deviceUdid: d.deviceUdid,
        platform: d.platform,
        name: d.name,
        model: d.model || d.osVersion,
        version: d.osVersion,
        status: globalBorrow ? 'in_use' : (isOnline ? d.status : 'offline'),
        borrowedBy: globalBorrow?.borrowedBy || null,
        borrowedByMe: userId ? globalBorrow?.borrowedBy === userId : false,
        borrowedAt: globalBorrow?.borrowedAt || null,
        activeSessionId: localDevice?.activeSessionId || null,
        lastSeenAt: d.lastSeenAt,
        runnerId: runner?.id,
        runnerName: runner?.name || node?.name,
        runnerOnline: !!isOnline,
        nodeId: d.nodeId,
      };
    });
  }

  // ─── Borrow / Return (device reservation only) ────

  /**
   * Reserve a device for this tenant/user.
   * Does NOT create a KRC session — just marks as borrowed.
   * User can later create sessions (mirror/recording) or run tests on this device.
   */
  async reserveDevice(tenantId: string, userId: string, kcpDeviceId: string) {
    // 1. Verify device exists and is available in KCP
    const kcpDevices: any[] = await this.cpService.getDevices();
    const kcpDevice = kcpDevices.find((d: any) => d.id === kcpDeviceId);
    if (!kcpDevice) throw new NotFoundException('Device not found in resource pool');

    if (kcpDevice.status === 'leased') {
      throw new BadRequestException('Device is already in use by another node');
    }
    if (kcpDevice.status === 'offline') {
      throw new BadRequestException('Device is offline — runner may be disconnected');
    }

    // 2. Check borrow state globally (any tenant) to prevent cross-tenant conflicts
    const existingBorrow = await this.deviceRepo.findOne({
      where: { deviceUdid: kcpDevice.deviceUdid, borrowedBy: Not(IsNull()) },
    });
    if (existingBorrow) {
      throw new BadRequestException('이 디바이스는 이미 다른 사용자가 대여 중입니다.');
    }

    // Find or create local device record for this tenant
    let localDevice = await this.deviceRepo.findOne({
      where: { deviceUdid: kcpDevice.deviceUdid, tenantId },
    });

    // 3. Create/update local device record with borrow info
    if (!localDevice) {
      // Find runner
      const nodes: any[] = (await this.cpService.getNodes()) || [];
      const node = nodes.find((n: any) => n.id === kcpDevice.nodeId);
      const runners = await this.runnerRepo.find({ where: { tenantId } });
      const runner = runners.find(r => {
        const meta = r.metadata as any;
        return meta?.localApiHost === node?.host && meta?.localApiPort === node?.port;
      }) || runners[0];

      localDevice = this.deviceRepo.create({
        tenantId,
        runnerId: runner?.id || 'unknown',
        deviceUdid: kcpDevice.deviceUdid,
        platform: kcpDevice.platform,
        name: kcpDevice.name,
        model: kcpDevice.model || kcpDevice.osVersion,
        version: kcpDevice.osVersion,
      });
    }

    localDevice.borrowedBy = userId;
    localDevice.borrowedAt = new Date();
    localDevice.status = 'in_use';
    await this.deviceRepo.save(localDevice);

    this.logger.log(`Device reserved: ${kcpDevice.deviceUdid} by user ${userId}`);

    return {
      id: kcpDeviceId,
      deviceUdid: kcpDevice.deviceUdid,
      platform: kcpDevice.platform,
      name: kcpDevice.name,
      status: 'in_use',
      borrowedBy: userId,
      borrowedAt: localDevice.borrowedAt,
    };
  }

  /**
   * Return a borrowed device — close any active sessions and release.
   */
  async releaseDevice(tenantId: string, kcpDeviceId: string) {
    // Find KCP device to get UDID
    const kcpDevices: any[] = await this.cpService.getDevices();
    const kcpDevice = kcpDevices.find((d: any) => d.id === kcpDeviceId);
    const deviceUdid = kcpDevice?.deviceUdid;

    if (!deviceUdid) throw new NotFoundException('Device not found');

    const localDevice = await this.deviceRepo.findOne({
      where: { deviceUdid, tenantId },
    });

    if (!localDevice || !localDevice.borrowedBy) {
      throw new BadRequestException('Device is not borrowed');
    }

    // Close all active sessions on this device
    const activeSessions = await this.sessionRepo.find({
      where: { tenantId, deviceId: deviceUdid, status: In(['creating', 'active', 'recording']) },
    });

    for (const session of activeSessions) {
      await this.closeSessionOnRunner(session);
      session.status = 'closed';
      session.closedAt = new Date();
      await this.sessionRepo.save(session);
    }

    // Release borrow
    localDevice.borrowedBy = null;
    localDevice.borrowedAt = null;
    localDevice.activeSessionId = null;
    localDevice.status = 'available';
    await this.deviceRepo.save(localDevice);

    this.logger.log(`Device returned: ${deviceUdid}`);

    return {
      id: kcpDeviceId,
      deviceUdid,
      status: 'available',
      closedSessions: activeSessions.length,
    };
  }

  // ─── Session Lifecycle (on borrowed devices) ──────

  /**
   * Create a mirror/recording session on a device.
   * If the device is not yet borrowed, auto-borrows it first.
   */
  async createSessionOnBorrowedDevice(tenantId: string, userId: string, dto: CreateDeviceSessionDto) {
    // 1. Find KCP device
    const kcpDevices: any[] = await this.cpService.getDevices();
    const kcpDevice = kcpDevices.find((d: any) => d.id === dto.deviceId);
    if (!kcpDevice) throw new NotFoundException('Device not found in resource pool');

    // 2. Auto-borrow if not already borrowed by this tenant
    let localDevice = await this.deviceRepo.findOne({
      where: { deviceUdid: kcpDevice.deviceUdid, tenantId },
    });

    if (!localDevice?.borrowedBy) {
      await this.reserveDevice(tenantId, userId, dto.deviceId);
      localDevice = await this.deviceRepo.findOne({
        where: { deviceUdid: kcpDevice.deviceUdid, tenantId },
      });
    }

    // 3. Find runner — prefer runnerId from local device record (set by heartbeat sync),
    //    then fall back to KCP node host:port matching, then any online runner.
    const runners = await this.runnerRepo.find({ where: { tenantId } });
    let runner: Runner | undefined;

    // 3a. Match by runnerId from the device record (most reliable)
    if (localDevice?.runnerId) {
      runner = runners.find((r) => r.id === localDevice!.runnerId);
    }

    // 3b. Match by KCP node host:port
    if (!runner) {
      const nodes: any[] = (await this.cpService.getNodes()) || [];
      const node = nodes.find((n: any) => n.id === kcpDevice.nodeId);
      if (!node || node.status !== 'online') {
        throw new BadRequestException('Node hosting this device is offline');
      }
      runner = runners.find((r) => {
        const meta = r.metadata as any;
        return meta?.localApiHost === node.host && meta?.localApiPort === node.port;
      });
    }

    // 3c. Fallback: any runner with recent heartbeat
    if (!runner) {
      runner = runners.find(
        (r) => r.lastHeartbeatAt && Date.now() - new Date(r.lastHeartbeatAt).getTime() < 90_000,
      );
    }
    if (!runner) throw new BadRequestException('No runner available for this tenant');

    const platform = kcpDevice.platform;
    const rc = dto.recordingConfig || {};
    const deviceType = dto.deviceType || rc.deviceType;

    // 4. Create DB session record
    const session = this.sessionRepo.create({
      tenantId,
      runnerId: runner.id,
      platform,
      deviceId: kcpDevice.deviceUdid,
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

    // 5. Call KRC to create the actual session (Appium/Playwright)
    try {
      const sessionPayload = {
        platform,
        deviceId: kcpDevice.deviceUdid,
        bundleId: dto.bundleId,
        appPackage: dto.appPackage,
        appActivity: dto.appActivity,
        url: dto.url,
        fps: dto.fps || 2,
        browser: rc.browser,
        viewport: rc.viewport,
        deviceType,
        controlOptions: rc.controlOptions,
      };

      let runnerSession: any;

      // Prefer tunnel (cloud mode — KRC behind NAT)
      if (this.runnerTunnel.isConnected(runner.id)) {
        this.logger.log(`Creating session via tunnel on runner ${runner.name} for device ${kcpDevice.deviceUdid}`);
        try {
          runnerSession = await this.runnerTunnel.sendCommand(runner.id, 'create-session', sessionPayload);
        } catch (tunnelErr: any) {
          const msg = tunnelErr.message || '';
          if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('not reachable')) {
            session.status = 'error';
            session.errorMessage = `Runner에서 Appium 서버에 연결할 수 없습니다. Appium이 시작되었는지 확인해주세요.`;
            await this.sessionRepo.save(session).catch(() => {});
            throw new BadRequestException(session.errorMessage);
          }
          if (msg.includes('timed out')) {
            session.status = 'error';
            session.errorMessage = `세션 생성 시간이 초과되었습니다. WDA/Appium 빌드에 시간이 걸릴 수 있습니다. 잠시 후 다시 시도해주세요.`;
            await this.sessionRepo.save(session).catch(() => {});
            throw new BadRequestException(session.errorMessage);
          }
          throw tunnelErr;
        }
      } else {
        // Fallback: direct HTTP (local dev)
        const runnerUrl = this.getRunnerUrl(runner);
        this.logger.log(`Creating session on runner: ${runnerUrl}/sessions for device ${kcpDevice.deviceUdid}`);

        let res: Response;
        try {
          res = await fetch(`${runnerUrl}/sessions`, {
            method: 'POST',
            headers: this.getRunnerHeaders(runner),
            body: JSON.stringify(sessionPayload),
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

        runnerSession = await res.json();
      }

      session.runnerSessionId = runnerSession.id;
      session.status = runnerSession.status === 'error' ? 'error' : 'active';
      session.deviceName = `${platform}:${kcpDevice.deviceUdid.slice(0, 12)}`;
      if (runnerSession.status === 'error') {
        session.errorMessage = 'Session failed on runner';
      }
      await this.sessionRepo.save(session);

      // Update local device with active session
      if (localDevice) {
        localDevice.activeSessionId = session.id;
        await this.deviceRepo.save(localDevice);
      }

      this.logger.log(`Session created: ${session.id} on device ${kcpDevice.deviceUdid}`);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      session.status = 'error';
      const rawMsg = err.message || 'Unknown error';
      // Provide actionable error message for common KRC failures
      let userMsg: string;
      if (rawMsg.includes('fetch failed') || rawMsg.includes('ECONNREFUSED')) {
        userMsg = `Runner에서 Appium 서버에 연결할 수 없습니다. KRC가 정상 실행 중인지, Appium이 시작되었는지 확인해주세요. (${rawMsg})`;
      } else if (rawMsg.includes('tunnel not connected')) {
        userMsg = `Runner 터널이 연결되어 있지 않습니다. KRC가 실행 중인지 확인해주세요.`;
      } else if (rawMsg.includes('timed out')) {
        userMsg = `Runner 응답 시간이 초과되었습니다. Appium 세션 생성에 시간이 오래 걸릴 수 있습니다. 다시 시도해주세요.`;
      } else {
        userMsg = `세션 생성 실패: ${rawMsg}`;
      }
      session.errorMessage = userMsg;
      await this.sessionRepo.save(session).catch(() => {});
      throw new BadRequestException(userMsg);
    }

    return session;
  }

  /**
   * Close a session — device stays borrowed.
   * To fully return the device, use POST /devices/:id/return.
   */
  async closeSession(tenantId: string, sessionId: string) {
    const session = await this.getSession(tenantId, sessionId);

    await this.closeSessionOnRunner(session);

    session.status = 'closed';
    session.closedAt = new Date();
    await this.sessionRepo.save(session);

    // Clear activeSessionId on local device (if this was the active session)
    const localDevice = await this.deviceRepo.findOne({
      where: { tenantId, activeSessionId: sessionId },
    });
    if (localDevice) {
      localDevice.activeSessionId = null;
      await this.deviceRepo.save(localDevice);
    }

    this.logger.log(`Session closed: ${sessionId} (device stays borrowed)`);
    return session;
  }

  /**
   * Start a web recording session — no physical device needed.
   */
  async startWebSession(
    tenantId: string,
    userId: string,
    dto: { url: string; fps?: number; deviceType?: string; recordingConfig?: any },
  ) {
    if (!dto.url) throw new BadRequestException('URL is required for web sessions');

    const runners = await this.runnerRepo.find({ where: { tenantId } });
    const onlineRunner = runners.find(
      (r) =>
        r.lastHeartbeatAt &&
        Date.now() - new Date(r.lastHeartbeatAt).getTime() < 90_000,
    );
    if (!onlineRunner) throw new BadRequestException('No online runner available');

    const rc = dto.recordingConfig || {};

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

    try {
      // Prefer tunnel (cloud mode — KRC behind NAT)
      if (this.runnerTunnel.isConnected(onlineRunner.id)) {
        this.logger.log(`Starting web session via tunnel for runner ${onlineRunner.name}`);
        const result = await this.runnerTunnel.sendCommand(onlineRunner.id, 'create-session', {
          platform: 'web',
          url: dto.url,
          fps: dto.fps || 2,
          deviceType: dto.deviceType || rc.deviceType,
          viewport: rc.viewport,
          browser: rc.browser,
          controlOptions: rc.controlOptions,
        });
        session.runnerSessionId = result.id;
        session.status = 'active';
        session.deviceName = 'web:browser';
        await this.sessionRepo.save(session);
        this.logger.log(`Web session started via tunnel: ${session.id} (runner session: ${result.id})`);
      } else {
        // Fallback: direct HTTP (local dev where KCD can reach KRC)
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
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      session.status = 'error';
      session.errorMessage = err.message;
      await this.sessionRepo.save(session).catch(() => {});
      throw new BadRequestException(`Failed to start web session: ${err.message}`);
    }

    return session;
  }

  // ─── Session CRUD ─────────────────────────────────

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

  // ─── Backward compat aliases ──────────────────────

  /** @deprecated Use reserveDevice + createSessionOnBorrowedDevice */
  async borrowDevice(tenantId: string, userId: string, dto: CreateDeviceSessionDto) {
    return this.createSessionOnBorrowedDevice(tenantId, userId, dto);
  }

  /** @deprecated Use closeSession */
  async returnDevice(tenantId: string, sessionId: string) {
    return this.closeSession(tenantId, sessionId);
  }

  /** @deprecated Use createSessionOnBorrowedDevice */
  async createSession(tenantId: string, userId: string, dto: CreateDeviceSessionDto) {
    return this.createSessionOnBorrowedDevice(tenantId, userId, dto);
  }

  // ─── Private Helpers ──────────────────────────────

  private async closeSessionOnRunner(session: DeviceSession) {
    if (session.runnerSessionId && session.status !== 'closed' && session.status !== 'error') {
      try {
        const runner = await this.runnerRepo.findOne({ where: { id: session.runnerId } });
        if (!runner) return;

        // Prefer tunnel (cloud mode)
        if (this.runnerTunnel.isConnected(runner.id)) {
          await this.runnerTunnel.sendCommand(runner.id, 'close-session', {
            sessionId: session.runnerSessionId,
          }, 10_000);
        } else {
          // Fallback: direct HTTP (local dev)
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
  }

  private getRunnerUrl(runner: Runner): string {
    const host = (runner.metadata as any)?.localApiHost || 'localhost';
    const port = (runner.metadata as any)?.localApiPort || 5001;
    return `http://${host}:${port}`;
  }

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
