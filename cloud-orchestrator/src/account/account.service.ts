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

  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    private runnerProcess: RunnerProcessService,
  ) {}

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

    this.logger.log(
      `Runner "${runner.name}" created. ` +
      `Deploy KRC on target machine with RUNNER_API_TOKEN=${apiToken}`,
    );

    return runner;
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

      return {
        ...r,
        processRunning: isAlive && r.status === 'online',
        localPort: (r.metadata as any)?.localApiPort,
        localHost: (r.metadata as any)?.localApiHost,
      };
    });
  }

  async deleteRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

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

    return {
      runnerId: runner.id,
      name: runner.name,
      status: 'independent',
      message: 'KRC nodes are independently managed. Restart the KRC process on the target machine.',
    };
  }

  async stopRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    await this.runnerRepo.update(runnerId, { status: 'offline' });
    return {
      runnerId: runner.id,
      name: runner.name,
      status: 'marked_offline',
      message: 'Runner marked offline. Stop the KRC process on the target machine to fully shut down.',
    };
  }

  async startRunner(tenantId: string, runnerId: string) {
    const runner = await this.runnerRepo.findOne({
      where: { id: runnerId, tenantId },
    });
    if (!runner) throw new NotFoundException('Runner not found');

    return {
      runnerId: runner.id,
      name: runner.name,
      status: 'independent',
      message: 'KRC nodes are independently managed. Start the KRC process on the target machine.',
      apiToken: runner.apiToken,
    };
  }

  getRunnerProcessStatus() {
    return {
      mode: 'kcp',
      message: 'Runners are independently deployed KRC Node Agents. Check KCP for node status.',
      processes: [],
    };
  }

  async updateRunnerHeartbeat(
    runnerId: string,
    status: 'online' | 'offline' | 'busy',
    extra?: { devices?: any[]; activeSessions?: number; localApiPort?: number; localApiHost?: string },
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
