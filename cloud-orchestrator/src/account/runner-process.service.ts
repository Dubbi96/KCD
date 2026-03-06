/**
 * Runner Process Manager
 *
 * Manages local-runner child processes.
 * When a runner is created in Cloud, this service spawns a local-runner process
 * with the correct env vars and a unique port.
 * When a runner is deleted, it kills the process.
 * On Cloud startup, runners are marked offline — start explicitly via dashboard.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Runner } from './runner.entity';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as net from 'net';

interface ManagedProcess {
  process: ChildProcess;
  port: number;
  runnerId: string;
  tenantId: string;
}

@Injectable()
export class RunnerProcessService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('RunnerProcessService');
  private processes = new Map<string, ManagedProcess>();
  private readonly localRunnerDir = path.resolve(__dirname, '../../../local-runner');
  private readonly basePort = 5001;

  constructor(
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
  ) {}

  async onModuleInit() {
    // Mark all existing runners as offline on startup.
    // Runners are only started explicitly via API (POST /account/runners/:id/start)
    // or auto-spawned when first created via POST /account/runners.
    const runners = await this.runnerRepo.find();
    if (runners.length > 0) {
      this.logger.log(`Found ${runners.length} existing runner(s). Marking offline (start manually via dashboard).`);
      await this.runnerRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'offline' })
        .execute();
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down all runner processes...');
    for (const [runnerId, managed] of this.processes) {
      this.killProcess(runnerId);
    }
  }

  /**
   * Spawn a local-runner child process for the given runner.
   */
  async spawnRunner(runner: Runner): Promise<number> {
    if (this.processes.has(runner.id)) {
      this.logger.warn(`Runner ${runner.name} already has a running process. Skipping.`);
      const existing = this.processes.get(runner.id)!;
      return existing.port;
    }

    const port = await this.findAvailablePort();

    const cloudApiUrl = `http://localhost:${process.env.PORT || 4000}/api/v1`;

    // Local dev: enable all platforms so a single runner can handle web + mobile devices.
    // The primary platform is used for BullMQ queue routing; additional platforms enable
    // on-demand Appium/tunnel support for physically connected devices.
    const allPlatforms = new Set<string>(['web', 'ios', 'android']);
    allPlatforms.add(runner.platform || 'web');

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      TENANT_ID: runner.tenantId,
      RUNNER_ID: runner.id,
      RUNNER_API_TOKEN: runner.apiToken,
      CLOUD_API_URL: cloudApiUrl,
      LOCAL_API_PORT: String(port),
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || '6379',
      RUNNER_PLATFORMS: Array.from(allPlatforms).join(','),
    };

    // iOS-specific env vars — always pass through so on-demand iOS works
    env.XCODE_ORG_ID = process.env.XCODE_ORG_ID || '';
    env.XCODE_SIGNING_ID = process.env.XCODE_SIGNING_ID || 'Apple Development';
    env.WDA_BUNDLE_ID = process.env.WDA_BUNDLE_ID || '';
    env.DERIVED_DATA_PATH = process.env.DERIVED_DATA_PATH || '';
    env.TUNNEL_SCRIPT_PATH = process.env.TUNNEL_SCRIPT_PATH || '';

    this.logger.log(`Spawning runner "${runner.name}" (${runner.id}) on port ${port}...`);

    const child = spawn('npx', ['ts-node', 'src/main.ts'], {
      cwd: this.localRunnerDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    const managed: ManagedProcess = {
      process: child,
      port,
      runnerId: runner.id,
      tenantId: runner.tenantId,
    };
    this.processes.set(runner.id, managed);

    // Log stdout/stderr with runner name prefix
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        this.logger.log(`[${runner.name}:${port}] ${line}`);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        this.logger.warn(`[${runner.name}:${port}] ${line}`);
      }
    });

    child.on('exit', (code) => {
      this.logger.warn(`Runner "${runner.name}" process exited with code ${code}`);
      this.processes.delete(runner.id);
      // Update status to offline
      this.runnerRepo.update(runner.id, { status: 'offline' }).catch(() => {});
    });

    child.on('error', (err) => {
      this.logger.error(`Runner "${runner.name}" process error: ${err.message}`);
      this.processes.delete(runner.id);
    });

    // Store port in runner metadata
    await this.runnerRepo
      .createQueryBuilder()
      .update()
      .set({
        metadata: { ...((runner.metadata as any) || {}), localApiPort: port, localApiHost: 'localhost' } as any,
      })
      .where('id = :id', { id: runner.id })
      .execute();

    return port;
  }

  /**
   * Kill the runner process.
   */
  killProcess(runnerId: string): boolean {
    const managed = this.processes.get(runnerId);
    if (!managed) return false;

    this.logger.log(`Killing runner process ${runnerId} (port ${managed.port})...`);
    try {
      managed.process.kill('SIGTERM');
    } catch {
      try { managed.process.kill('SIGKILL'); } catch {}
    }
    this.processes.delete(runnerId);
    return true;
  }

  /**
   * Restart a runner process (kill + respawn).
   */
  async restartRunner(runner: Runner): Promise<number> {
    this.killProcess(runner.id);
    // Wait a moment for port release
    await new Promise((r) => setTimeout(r, 1000));
    return this.spawnRunner(runner);
  }

  /**
   * Get status of all managed processes.
   */
  getStatus(): Array<{ runnerId: string; port: number; pid: number | undefined; alive: boolean }> {
    const result: Array<{ runnerId: string; port: number; pid: number | undefined; alive: boolean }> = [];
    for (const [runnerId, managed] of this.processes) {
      result.push({
        runnerId,
        port: managed.port,
        pid: managed.process.pid,
        alive: !managed.process.killed && managed.process.exitCode === null,
      });
    }
    return result;
  }

  isRunning(runnerId: string): boolean {
    const managed = this.processes.get(runnerId);
    return !!managed && !managed.process.killed && managed.process.exitCode === null;
  }

  getPort(runnerId: string): number | undefined {
    return this.processes.get(runnerId)?.port;
  }

  /**
   * Find the next available port starting from basePort.
   */
  private async findAvailablePort(): Promise<number> {
    const usedPorts = new Set(
      Array.from(this.processes.values()).map((p) => p.port),
    );

    for (let port = this.basePort; port < this.basePort + 100; port++) {
      if (usedPorts.has(port)) continue;
      const available = await this.isPortAvailable(port);
      if (available) return port;
    }

    throw new Error('No available ports found in range 5001-5100');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port);
    });
  }
}
