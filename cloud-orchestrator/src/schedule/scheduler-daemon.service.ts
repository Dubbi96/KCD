import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ScheduleService } from './schedule.service';

/** PostgreSQL advisory lock ID for scheduler daemon (unique across KCD instances) */
const SCHEDULER_ADVISORY_LOCK_ID = 200_001;

@Injectable()
export class SchedulerDaemon implements OnModuleInit, OnModuleDestroy {
  private intervalHandle: NodeJS.Timeout | null = null;
  private tickIntervalMs: number;

  constructor(
    private scheduleService: ScheduleService,
    private config: ConfigService,
    private dataSource: DataSource,
  ) {
    this.tickIntervalMs = this.config.get<number>('SCHEDULER_TICK_MS', 30000);
  }

  onModuleInit() {
    console.log(`Scheduler daemon starting (tick every ${this.tickIntervalMs}ms)`);
    this.intervalHandle = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log('Scheduler daemon stopped');
  }

  private async tick() {
    // Acquire advisory lock to prevent duplicate scheduling across KCD instances
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const [{ acquired }] = await queryRunner.query(
        `SELECT pg_try_advisory_lock(${SCHEDULER_ADVISORY_LOCK_ID}) AS acquired`,
      );

      if (!acquired) {
        // Another KCD instance holds the lock — skip this tick
        return;
      }

      try {
        await this.scheduleService.processDuePlannedRuns();
      } finally {
        await queryRunner.query(
          `SELECT pg_advisory_unlock(${SCHEDULER_ADVISORY_LOCK_ID})`,
        );
      }
    } catch (e) {
      console.error('Scheduler tick error:', e.message);
    } finally {
      await queryRunner.release();
    }
  }
}
