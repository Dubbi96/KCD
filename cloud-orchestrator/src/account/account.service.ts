import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Runner } from './runner.entity';
import { DeviceSession } from '../device/device-session.entity';
import { CreateRunnerDto } from './dto/create-runner.dto';
import { RunnerProcessService } from './runner-process.service';

@Injectable()
export class AccountService {
  private logger = new Logger('AccountService');
  private readonly runnerMode: 'external' | 'embedded';

  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    private runnerProcess: RunnerProcessService,
  ) {
    this.runnerMode = (process.env.RUNNER_MANAGEMENT_MODE as any) || 'external';
    this.logger.log(`Runner management mode: ${this.runnerMode}`);
  }

  private get isEmbedded(): boolean {
    return this.runnerMode === 'embedded';
  }

  async getTenant(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async getTenantMembers(tenantId: string) {
    return this.userRepo.find({
      where: { tenantId },
      select: ['id', 'email', 'name', 'role', 'isActive', 'createdAt'],
    });
  }

  // === Runner Management ===

  private static readonly MAX_RUNNERS_PER_TENANT = 10;
  private static readonly HEARTBEAT_TIMEOUT_MS = 90_000;

  async createRunner(tenantId: string, dto: CreateRunnerDto) {
    const count = await this.runnerRepo.count({ where: { tenantId } });
    if (count >= AccountService.MAX_RUNNERS_PER_TENANT) {
      throw new BadRequestException(`Runner limit reached (max ${AccountService.MAX_RUNNERS_PER_TENANT} per account)`);
    }

    const apiToken = `ktr_${uuid().replace(/-/g, '')}`;
    const runner = this.runnerRepo.create({
      tenantId,
      name: dto.name,
      platform: dto.platform,
      apiToken,
      metadata: dto.metadata || {},
    });
    await this.runnerRepo.save(runner);

    if (this.isEmbedded) {
      try {
        const port = await this.runnerProcess.spawnRunner(runner);
        this.logger.log(`Runner "${runner.name}" spawned on port ${port}`);
      } catch (e: any) {
        this.logger.error(`Failed to auto-spawn runner: ${e.message}`);
      }
    } else {
      this.logger.log(`Runner "${runner.name}" registered (external mode)`);
    }

    const serverHost = process.env.SERVER_HOST || 'localhost';
    const serverPort = process.env.PORT || '4000';
    const kcpUrl = process.env.KCP_API_URL || `http://${serverHost}:4100/api`;
    const cloudApiUrl = `http://${serverHost}:${serverPort}/api/v1`;

    return {
      ...runner,
      setupGuide: this.isEmbedded ? undefined : {
        runnerId: runner.id,
        apiToken: runner.apiToken,
        envVars: {
          RUNNER_ID: runner.id,
          RUNNER_API_TOKEN: runner.apiToken,
          CLOUD_API_URL: cloudApiUrl,
          CONTROL_PLANE_URL: kcpUrl,
          RUNNER_PLATFORMS: runner.platform || 'web',
          LOCAL_API_PORT: '5001',
          LOCAL_API_BIND: '0.0.0.0',
        },
        command: `cd KRC && RUNNER_ID=${runner.id} RUNNER_API_TOKEN=${runner.apiToken} CLOUD_API_URL=${cloudApiUrl} CONTROL_PLANE_URL=${kcpUrl} RUNNER_PLATFORMS=${runner.platform || 'web'} npx ts-node src/main.ts`,
      },
    };
  }

  async listRunners(tenantId: string) {
    const runners = await this.runnerRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    const now = Date.now();
    return runners.map((r) => {
      const heartbeatAge = r.lastHeartbeatAt
        ? now - new Date(r.lastHeartbeatAt).getTime()
        : Infinity;
      const isAlive = heartbeatAge < AccountService.HEARTBEAT_TIMEOUT_MS;

      const processUp = this.isEmbedded
        ? this.runnerProcess.isRunning(r.id)
        : false;

      return {
        ...r,
        runnerMode: this.runnerMode,
        processRunning: processUp || (isAlive && r.status === 'online'),
        localPort: this.isEmbedded
          ? (this.runnerProcess.getPort(r.id) || (r.metadata as any)?.localApiPort)
          : (r.metadata as any)?.localApiPort,
        localHost: (r.metadata as any)?.localApiHost,
      };
    });
  }

  async deleteRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    // Kill the process first
    this.runnerProcess.killProcess(runnerId);

    // Delete all device sessions referencing this runner
    await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .where('runner_id = :runnerId', { runnerId })
      .execute();

    // Delete all devices referencing this runner
    await this.runnerRepo.manager.query(
      `DELETE FROM devices WHERE runner_id = $1`,
      [runnerId],
    );

    // Null out runner reference on runs
    await this.runnerRepo.manager.query(
      `UPDATE runs SET runner_id = NULL WHERE runner_id = $1`,
      [runnerId],
    );

    await this.runnerRepo.remove(runner);
    this.logger.log(`Runner deleted: ${runner.name} (${runnerId})`);
  }

  async restartRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    if (this.isEmbedded) {
      const port = await this.runnerProcess.restartRunner(runner);
      return { runnerId: runner.id, name: runner.name, port, status: 'restarting' };
    }
    return {
      runnerId: runner.id, name: runner.name, status: 'external',
      message: 'Runner is externally managed. Restart the KRC agent on the host machine.',
    };
  }

  async stopRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    if (this.isEmbedded) {
      this.runnerProcess.killProcess(runnerId);
    }
    await this.runnerRepo.update(runnerId, { status: 'offline' });
    return { runnerId: runner.id, name: runner.name, status: 'stopped' };
  }

  async startRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    if (this.isEmbedded) {
      const port = await this.runnerProcess.spawnRunner(runner);
      return { runnerId: runner.id, name: runner.name, port, status: 'starting' };
    }

    const serverHost = process.env.SERVER_HOST || 'localhost';
    const serverPort = process.env.PORT || '4000';
    const kcpUrl = process.env.KCP_API_URL || `http://${serverHost}:4100/api`;
    const cloudApiUrl = `http://${serverHost}:${serverPort}/api/v1`;

    return {
      runnerId: runner.id, name: runner.name, status: 'external',
      message: 'Runner is externally managed. Start KRC on the host machine with the following env vars.',
      setupGuide: {
        runnerId: runner.id,
        apiToken: runner.apiToken,
        envVars: {
          RUNNER_ID: runner.id,
          RUNNER_API_TOKEN: runner.apiToken,
          CLOUD_API_URL: cloudApiUrl,
          CONTROL_PLANE_URL: kcpUrl,
          RUNNER_PLATFORMS: runner.platform || 'web',
          LOCAL_API_PORT: '5001',
          LOCAL_API_BIND: '0.0.0.0',
        },
      },
    };
  }

  getRunnerProcessStatus() {
    return this.runnerProcess.getStatus();
  }

  async updateRunnerHeartbeat(
    runnerId: string,
    status: 'online' | 'offline' | 'busy',
    extra?: Record<string, any>,
  ) {
    if (extra) {
      await this.runnerRepo
        .createQueryBuilder()
        .update()
        .set({
          status,
          lastHeartbeatAt: new Date(),
          metadata: {
            devices: extra.devices || [],
            activeSessions: extra.activeSessions || 0,
            localApiPort: extra.localApiPort || 5001,
            localApiHost: extra.localApiHost || 'localhost',
            supportedPlatforms: extra.supportedPlatforms,
            maxConcurrentJobs: extra.maxConcurrentJobs,
            activeJobCount: extra.activeJobCount,
            lastDeviceReport: new Date().toISOString(),
          } as any,
        })
        .where('id = :id', { id: runnerId })
        .execute();
    } else {
      await this.runnerRepo.update(runnerId, { status, lastHeartbeatAt: new Date() });
    }
  }

  async findRunnerByToken(apiToken: string) {
    return this.runnerRepo.findOne({ where: { apiToken } });
  }
}
