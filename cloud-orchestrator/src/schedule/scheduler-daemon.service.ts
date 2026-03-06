import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleService } from './schedule.service';

@Injectable()
export class SchedulerDaemon implements OnModuleInit, OnModuleDestroy {
  private intervalHandle: NodeJS.Timeout | null = null;
  private tickIntervalMs: number;

  constructor(
    private scheduleService: ScheduleService,
    private config: ConfigService,
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
    try {
      await this.scheduleService.processDuePlannedRuns();
    } catch (e) {
      console.error('Scheduler tick error:', e.message);
    }
  }
}
