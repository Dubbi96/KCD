import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioRun } from './scenario-run.entity';

@Injectable()
export class ArtifactSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ArtifactSweeper');
  private intervalHandle: NodeJS.Timeout | null = null;

  /** How often the sweep runs (1 hour) */
  private readonly TICK_MS = 60 * 60 * 1000;

  /** Passed scenario-run artifacts kept for 24 hours */
  private readonly PASS_TTL_HOURS = 24;

  /** Failed / infra-failed scenario-run artifacts kept for 7 days */
  private readonly FAIL_TTL_HOURS = 168;

  constructor(
    @InjectRepository(ScenarioRun)
    private scenarioRunRepo: Repository<ScenarioRun>,
  ) {}

  onModuleInit() {
    this.logger.log(`Artifact sweeper starting (tick every ${this.TICK_MS / 1000}s)`);
    this.intervalHandle = setInterval(() => this.sweep(), this.TICK_MS);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('Artifact sweeper stopped');
  }

  async sweep() {
    this.logger.log('Starting artifact sweep...');

    const now = Date.now();
    const passThreshold = new Date(now - this.PASS_TTL_HOURS * 3600 * 1000);
    const failThreshold = new Date(now - this.FAIL_TTL_HOURS * 3600 * 1000);

    // Clear result_json from passed scenario runs older than PASS_TTL
    const passedCleared = await this.scenarioRunRepo
      .createQueryBuilder()
      .update()
      .set({ resultJson: () => 'NULL' })
      .where('status = :status', { status: 'passed' })
      .andWhere('result_json IS NOT NULL')
      .andWhere('completed_at < :threshold', { threshold: passThreshold })
      .execute();

    // Clear result_json from failed/infra_failed scenario runs older than FAIL_TTL
    const failedCleared = await this.scenarioRunRepo
      .createQueryBuilder()
      .update()
      .set({ resultJson: () => 'NULL' })
      .where('status IN (:...statuses)', { statuses: ['failed', 'infra_failed'] })
      .andWhere('result_json IS NOT NULL')
      .andWhere('completed_at < :threshold', { threshold: failThreshold })
      .execute();

    const total =
      (passedCleared.affected || 0) + (failedCleared.affected || 0);

    if (total > 0) {
      this.logger.log(
        `Swept ${total} artifacts (passed: ${passedCleared.affected}, failed: ${failedCleared.affected})`,
      );
    }
  }
}
