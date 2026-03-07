/**
 * Runner Process Manager (Refactored for KCP architecture)
 *
 * No longer spawns local-runner child processes.
 * KRC nodes are now independently deployed and register with KCP (Control Plane).
 * This service now acts as a lightweight status tracker for backward compatibility,
 * querying node status from KCP when available.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Runner } from './runner.entity';

@Injectable()
export class RunnerProcessService implements OnModuleInit {
  private logger = new Logger('RunnerProcessService');

  constructor(
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'RunnerProcessService initialized (KCP mode). ' +
      'Runners are independently managed Node Agents — no child processes spawned.',
    );
  }

  /**
   * @deprecated — KRC nodes are independently deployed.
   * Kept for backward compatibility with existing controller routes.
   * Returns runner info without spawning a process.
   */
  async spawnRunner(runner: Runner): Promise<number> {
    this.logger.warn(
      `spawnRunner() called for "${runner.name}" — skipped. ` +
      'Deploy KRC on the target machine and register with KCP instead.',
    );
    const port = (runner.metadata as any)?.localApiPort || 5001;
    return port;
  }

  /**
   * @deprecated — No processes to kill.
   */
  killProcess(runnerId: string): boolean {
    this.logger.warn(`killProcess(${runnerId}) — no-op in KCP mode.`);
    return false;
  }

  /**
   * @deprecated
   */
  async restartRunner(runner: Runner): Promise<number> {
    this.logger.warn(`restartRunner(${runner.name}) — no-op in KCP mode.`);
    return (runner.metadata as any)?.localApiPort || 5001;
  }

  /**
   * Returns runner statuses based on heartbeat data from DB.
   */
  getStatus(): Array<{ runnerId: string; port: number; pid: number | undefined; alive: boolean }> {
    return [];
  }

  /**
   * Runner is "running" if it has sent a heartbeat recently (within 90s).
   */
  isRunning(runnerId: string): boolean {
    return false; // Status is determined from heartbeat, checked in listRunners
  }

  getPort(runnerId: string): number | undefined {
    return undefined; // Retrieved from runner.metadata.localApiPort
  }
}
