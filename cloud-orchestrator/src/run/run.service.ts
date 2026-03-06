import { Injectable, NotFoundException, BadRequestException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Run } from './run.entity';
import { ScenarioRun } from './scenario-run.entity';
import { RunQueueService } from './run-queue.service';
import { CreateRunDto } from './dto/create-run.dto';
import { Schedule } from '../schedule/schedule.entity';
import { WebhookService } from '../webhook/webhook.service';

@Injectable()
export class RunService {
  constructor(
    @InjectRepository(Run) private runRepo: Repository<Run>,
    @InjectRepository(ScenarioRun) private scenarioRunRepo: Repository<ScenarioRun>,
    private runQueueService: RunQueueService,
    @Optional() @Inject(WebhookService) private webhookService?: WebhookService,
  ) {}

  async createRun(tenantId: string, dto: CreateRunDto) {
    const run = this.runRepo.create({
      tenantId,
      mode: dto.mode || 'batch',
      status: 'queued',
      scenarioIds: dto.scenarioIds,
      targetPlatform: dto.platform,
      options: dto.options || {},
      authProfileId: dto.authProfileId,
      concurrency: dto.concurrency || 1,
      totalScenarios: dto.scenarioIds.length,
      runnerId: dto.runnerId,
    });
    await this.runRepo.save(run);

    // Create scenario_runs
    const scenarioRuns: ScenarioRun[] = [];
    for (let i = 0; i < dto.scenarioIds.length; i++) {
      const sr = this.scenarioRunRepo.create({
        tenantId,
        runId: run.id,
        scenarioId: dto.scenarioIds[i],
        sequenceNo: i,
        platform: dto.platform,
        status: dto.mode === 'chain' && i > 0 ? 'pending' : 'queued',
      });
      scenarioRuns.push(sr);
    }
    await this.scenarioRunRepo.save(scenarioRuns);

    // Enqueue jobs to BullMQ (tenant-specific queue -> picked up by Runner)
    for (const sr of scenarioRuns) {
      if (sr.status === 'queued') {
        await this.runQueueService.enqueueScenarioJob({
          tenantId,
          scenarioRunId: sr.id,
          runId: run.id,
          scenarioId: sr.scenarioId,
          sequenceNo: sr.sequenceNo,
          platform: dto.platform,
          options: dto.options || {},
          attempt: 1,
        });
      }
    }

    return { run, scenarioRuns };
  }

  async createRunFromSchedule(tenantId: string, schedule: Schedule) {
    // Retrieve stream items and create a run
    // For now, we assume streamId maps to a set of scenarioIds stored in the stream
    const run = this.runRepo.create({
      tenantId,
      mode: 'stream',
      status: 'queued',
      scenarioIds: [],
      targetPlatform: 'web',
      options: {},
      scheduleId: schedule.id,
      streamId: schedule.streamId,
      totalScenarios: 0,
    });
    await this.runRepo.save(run);
    return run;
  }

  async listRuns(tenantId: string, limit = 20, offset = 0) {
    const [runs, total] = await this.runRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { runs, total, limit, offset };
  }

  async getRunDetail(tenantId: string, runId: string) {
    const run = await this.runRepo.findOne({
      where: { id: runId, tenantId },
      relations: ['scenarioRuns'],
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async cancelRun(tenantId: string, runId: string) {
    const run = await this.getRunDetail(tenantId, runId);
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      throw new NotFoundException('Run already finished');
    }

    // Batch-cancel pending/queued scenario runs
    const cancellableSrs = run.scenarioRuns.filter((sr) =>
      ['pending', 'queued'].includes(sr.status),
    );
    if (cancellableSrs.length > 0) {
      const ids = cancellableSrs.map((sr) => sr.id);
      await this.scenarioRunRepo
        .createQueryBuilder()
        .update()
        .set({ status: 'cancelled' })
        .where('id IN (:...ids)', { ids })
        .execute();

      // Remove jobs from queues
      await Promise.allSettled(
        cancellableSrs.map((sr) =>
          this.runQueueService.removeJob(tenantId, sr.platform, sr.id),
        ),
      );
    }

    run.status = 'cancelled';
    await this.runRepo.save(run);
    return run;
  }

  async updateScenarioRunStatus(
    scenarioRunId: string,
    status: string,
    result?: { durationMs?: number; error?: string; resultJson?: any },
    tenantId?: string,
  ) {
    const where: any = { id: scenarioRunId };
    if (tenantId) where.tenantId = tenantId; // Tenant isolation for runner callbacks
    const sr = await this.scenarioRunRepo.findOne({ where });
    if (!sr) throw new NotFoundException('ScenarioRun not found');

    sr.status = status;
    if (status === 'running') sr.startedAt = new Date();
    if (['passed', 'failed', 'infra_failed'].includes(status)) {
      sr.completedAt = new Date();
      if (result?.durationMs) sr.durationMs = result.durationMs;
      if (result?.error) sr.error = result.error;
      if (result?.resultJson) sr.resultJson = result.resultJson;
    }
    await this.scenarioRunRepo.save(sr);

    // Check if all scenario runs for this run are complete
    await this.checkRunCompletion(sr.runId);

    // If chain mode, enqueue next scenario
    if (['passed', 'failed'].includes(status)) {
      await this.enqueueNextInChain(sr);
    }

    return sr;
  }

  private async checkRunCompletion(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) return;

    const scenarioRuns = await this.scenarioRunRepo.find({ where: { runId } });
    const allDone = scenarioRuns.every((sr) =>
      ['passed', 'failed', 'infra_failed', 'skipped', 'cancelled'].includes(sr.status),
    );
    if (!allDone) return;

    const passed = scenarioRuns.filter((sr) => sr.status === 'passed').length;
    const failed = scenarioRuns.filter((sr) =>
      ['failed', 'infra_failed'].includes(sr.status),
    ).length;

    run.status = failed > 0 ? 'failed' : 'completed';
    run.passedCount = passed;
    run.failedCount = failed;
    run.completedAt = new Date();
    await this.runRepo.save(run);

    // Emit webhook event on run completion
    if (this.webhookService) {
      const eventType = run.status === 'completed' ? 'run.completed' : 'run.failed';
      this.webhookService.emitEvent(run.tenantId, eventType, {
        runId: run.id,
        status: run.status,
        passedCount: passed,
        failedCount: failed,
        totalScenarios: scenarioRuns.length,
        completedAt: run.completedAt,
      }).catch((err) => console.error('Webhook emit error:', err.message));
    }
  }

  private async enqueueNextInChain(completedSr: ScenarioRun) {
    const run = await this.runRepo.findOne({ where: { id: completedSr.runId } });
    if (!run || run.mode !== 'chain') return;

    const nextSr = await this.scenarioRunRepo.findOne({
      where: { runId: completedSr.runId, sequenceNo: completedSr.sequenceNo + 1, status: 'pending' },
    });
    if (!nextSr) return;

    nextSr.status = 'queued';
    await this.scenarioRunRepo.save(nextSr);
    await this.runQueueService.enqueueScenarioJob({
      tenantId: run.tenantId,
      scenarioRunId: nextSr.id,
      runId: run.id,
      scenarioId: nextSr.scenarioId,
      sequenceNo: nextSr.sequenceNo,
      platform: nextSr.platform as any,
      options: run.options,
      attempt: 1,
    });
  }

  async pauseRun(tenantId: string, runId: string) {
    const run = await this.getRunDetail(tenantId, runId);
    if (!['queued', 'running'].includes(run.status)) {
      throw new BadRequestException('Run cannot be paused in its current state');
    }

    const targetSrs = run.scenarioRuns.filter((sr) =>
      ['running', 'queued'].includes(sr.status),
    );

    for (const sr of targetSrs) {
      if (sr.status === 'running') {
        await this.runQueueService.publishPauseControl({
          action: 'kill',
          scenarioRunId: sr.id,
          tenantId,
        });
      }
      if (sr.status === 'queued') {
        await this.runQueueService.removeJob(tenantId, sr.platform, sr.id);
      }
      sr.status = 'paused';
      await this.scenarioRunRepo.save(sr);
    }

    run.status = 'paused';
    await this.runRepo.save(run);
    return run;
  }

  async resumeRun(tenantId: string, runId: string) {
    const run = await this.getRunDetail(tenantId, runId);
    if (run.status !== 'paused') {
      throw new BadRequestException('Run is not paused');
    }

    const pausedSrs = run.scenarioRuns.filter((sr) => sr.status === 'paused');

    for (const sr of pausedSrs) {
      sr.status = 'queued';
      await this.scenarioRunRepo.save(sr);
      await this.runQueueService.enqueueScenarioJob({
        tenantId,
        scenarioRunId: sr.id,
        runId: run.id,
        scenarioId: sr.scenarioId,
        sequenceNo: sr.sequenceNo,
        platform: sr.platform as any,
        options: run.options,
        attempt: sr.attempt,
      });
    }

    run.status = 'running';
    await this.runRepo.save(run);
    return run;
  }

  async pauseScenarioRun(tenantId: string, scenarioRunId: string) {
    const sr = await this.scenarioRunRepo.findOne({
      where: { id: scenarioRunId, tenantId },
    });
    if (!sr) throw new NotFoundException('ScenarioRun not found');
    if (!['running', 'queued'].includes(sr.status)) {
      throw new BadRequestException('Scenario run cannot be paused in its current state');
    }

    if (sr.status === 'running') {
      await this.runQueueService.publishPauseControl({
        action: 'kill',
        scenarioRunId: sr.id,
        tenantId,
      });
    }
    if (sr.status === 'queued') {
      await this.runQueueService.removeJob(tenantId, sr.platform, sr.id);
    }

    sr.status = 'paused';
    await this.scenarioRunRepo.save(sr);
    return sr;
  }

  async resumeScenarioRun(tenantId: string, scenarioRunId: string) {
    const sr = await this.scenarioRunRepo.findOne({
      where: { id: scenarioRunId, tenantId },
    });
    if (!sr) throw new NotFoundException('ScenarioRun not found');
    if (sr.status !== 'paused') {
      throw new BadRequestException('Scenario run is not paused');
    }

    const run = await this.runRepo.findOne({ where: { id: sr.runId } });
    if (!run) throw new NotFoundException('Run not found');

    sr.status = 'queued';
    await this.scenarioRunRepo.save(sr);
    await this.runQueueService.enqueueScenarioJob({
      tenantId,
      scenarioRunId: sr.id,
      runId: run.id,
      scenarioId: sr.scenarioId,
      sequenceNo: sr.sequenceNo,
      platform: sr.platform as any,
      options: run.options,
      attempt: sr.attempt,
    });
    return sr;
  }

  async getQueueStats(tenantId: string) {
    const platforms = ['web', 'ios', 'android'] as const;
    const stats = await Promise.all(
      platforms.map((p) => this.runQueueService.getQueueStats(tenantId, p)),
    );
    return stats;
  }
}
