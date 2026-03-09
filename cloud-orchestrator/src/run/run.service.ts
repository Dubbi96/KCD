import { Injectable, NotFoundException, BadRequestException, Inject, Optional, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Run } from './run.entity';
import { ScenarioRun } from './scenario-run.entity';
import { Scenario } from '../scenario/scenario.entity';
import { RunQueueService } from './run-queue.service';
import { ReportService } from './report.service';
import { CreateRunDto } from './dto/create-run.dto';
import { Schedule } from '../schedule/schedule.entity';
import { WebhookService } from '../webhook/webhook.service';
import { StreamService } from '../stream/stream.service';
import { GroupService } from '../group/group.service';
import { ScheduleService } from '../schedule/schedule.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class RunService {
  private readonly logger = new Logger('RunService');

  constructor(
    @InjectRepository(Run) private runRepo: Repository<Run>,
    @InjectRepository(ScenarioRun) private scenarioRunRepo: Repository<ScenarioRun>,
    @InjectRepository(Scenario) private scenarioRepo: Repository<Scenario>,
    private runQueueService: RunQueueService,
    private reportService: ReportService,
    private storageService: StorageService,
    @Optional() @Inject(WebhookService) private webhookService?: WebhookService,
    @Optional() @Inject(forwardRef(() => StreamService)) private streamService?: StreamService,
    @Optional() @Inject(forwardRef(() => GroupService)) private groupService?: GroupService,
    @Optional() @Inject(forwardRef(() => ScheduleService)) private scheduleService?: ScheduleService,
  ) {}

  async createRun(tenantId: string, dto: CreateRunDto) {
    // Load each scenario to use its actual platform (not the run-level fallback)
    const scenarios = await this.scenarioRepo.find({
      where: { id: In(dto.scenarioIds), tenantId },
    });
    const platformMap = new Map(scenarios.map(s => [s.id, s.platform]));

    // Determine run-level platform from actual scenarios.
    // If all scenarios share the same platform, use that; otherwise use dto fallback.
    const uniquePlatforms = new Set(scenarios.map(s => s.platform).filter(Boolean));
    const resolvedPlatform = uniquePlatforms.size === 1
      ? [...uniquePlatforms][0]
      : dto.platform;

    const run = this.runRepo.create({
      tenantId,
      mode: dto.mode || 'batch',
      status: 'queued',
      scenarioIds: dto.scenarioIds,
      targetPlatform: resolvedPlatform,
      options: dto.options || {},
      authProfileId: dto.authProfileId,
      concurrency: dto.concurrency || 1,
      totalScenarios: dto.scenarioIds.length,
      runnerId: dto.runnerId,
      scheduleId: dto.scheduleId,
      streamId: dto.streamId,
      plannedRunId: dto.plannedRunId,
    });
    await this.runRepo.save(run);

    // Create scenario_runs — each SR uses its scenario's own platform
    const scenarioRuns: ScenarioRun[] = [];
    for (let i = 0; i < dto.scenarioIds.length; i++) {
      const scenarioId = dto.scenarioIds[i];
      const srPlatform = platformMap.get(scenarioId) || dto.platform;
      const sr = this.scenarioRunRepo.create({
        tenantId,
        runId: run.id,
        scenarioId,
        sequenceNo: i,
        platform: srPlatform,
        status: dto.mode === 'chain' && i > 0 ? 'pending' : 'queued',
      });
      scenarioRuns.push(sr);
    }
    await this.scenarioRunRepo.save(scenarioRuns);

    // Dispatch jobs to KCP — use each SR's platform so iOS jobs go to iOS runners
    for (const sr of scenarioRuns) {
      if (sr.status === 'queued') {
        const kcpJobId = await this.runQueueService.enqueueScenarioJob({
          tenantId,
          scenarioRunId: sr.id,
          runId: run.id,
          scenarioId: sr.scenarioId,
          sequenceNo: sr.sequenceNo,
          platform: sr.platform as any,
          options: dto.options || {},
          attempt: 1,
          requiredLabels: (dto.options as any)?.requiredLabels,
        });
        if (kcpJobId) {
          sr.kcpJobId = kcpJobId;
          await this.scenarioRunRepo.save(sr);
        }
      }
    }

    return { run, scenarioRuns };
  }

  async createRunFromSchedule(tenantId: string, schedule: Schedule, plannedRunId?: string) {
    if (!schedule.streamId) {
      throw new BadRequestException('Schedule has no streamId');
    }
    if (!this.streamService || !this.groupService) {
      throw new BadRequestException('StreamService or GroupService not available');
    }

    // 1. Load Stream with items
    const stream = await this.streamService.findOne(tenantId, schedule.streamId);
    if (!stream.items?.length) {
      this.logger.warn(`Schedule ${schedule.id}: Stream ${schedule.streamId} has no items`);
      throw new BadRequestException('Stream has no items');
    }

    // 2. Resolve StreamItems → scenarioIds (expand Groups)
    const scenarioIds: string[] = [];
    for (const item of stream.items) {
      if (item.type === 'SCENARIO') {
        scenarioIds.push(item.refId);
      } else if (item.type === 'GROUP') {
        const group = await this.groupService.findOne(tenantId, item.refId);
        scenarioIds.push(...(group.scenarioIds || []));
      }
    }

    if (!scenarioIds.length) {
      this.logger.warn(`Schedule ${schedule.id}: Stream resolved to no scenarios`);
      throw new BadRequestException('Stream resolved to no scenarios');
    }

    // 3. Determine run-level platform: use schedule setting as fallback,
    //    but each scenario's own platform is used per-ScenarioRun in createRun
    const fallbackPlatform = schedule.targetPlatform || 'web';

    // 4. Merge schedule options with headless setting
    const runOptions: Record<string, any> = {
      ...(schedule.options || {}),
      headless: schedule.headless !== false, // default true for scheduled runs
    };

    // 5. Create Run — createRun loads each scenario's actual platform
    return this.createRun(tenantId, {
      scenarioIds,
      mode: 'stream',
      platform: fallbackPlatform,
      options: runOptions,
      scheduleId: schedule.id,
      streamId: schedule.streamId,
      plannedRunId,
    });
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

      // Cancel KCP jobs
      await Promise.allSettled(
        cancellableSrs
          .filter((sr) => sr.kcpJobId)
          .map((sr) => this.runQueueService.cancelJob(sr.kcpJobId)),
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
    if (status === 'running') {
      sr.startedAt = new Date();
      // Set run to 'running' and record startedAt on first scenario start
      await this.markRunStarted(sr.runId);
    }
    if (['passed', 'failed', 'infra_failed'].includes(status)) {
      sr.completedAt = new Date();
      if (result?.durationMs) sr.durationMs = result.durationMs;
      if (result?.error) sr.error = result.error;
      if (result?.resultJson) sr.resultJson = result.resultJson;
    }
    await this.scenarioRunRepo.save(sr);

    // Emit per-scenario webhook events (Katab canonical format)
    if (['passed', 'failed', 'infra_failed'].includes(status) && this.webhookService) {
      // Load scenario name for webhook display
      const scenario = await this.scenarioRepo.findOne({ where: { id: sr.scenarioId } });
      const scenarioName = scenario?.name || sr.scenarioId.slice(0, 8);

      const eventType = status === 'passed' ? 'scenario.passed' : 'scenario.failed';
      this.webhookService.emitEvent(sr.tenantId, eventType, {
        timestamp: new Date().toISOString(),
        run: { id: sr.runId },
        scenario: {
          scenarioId: sr.scenarioId,
          scenarioName,
          scenarioRunId: sr.id,
          status: sr.status,
          attempt: sr.attempt,
          durationMs: sr.durationMs,
          error: sr.error || null,
        },
      }).catch((err) => this.logger.error(`Scenario webhook error: ${err.message}`));
    }

    // Check if all scenario runs for this run are complete
    await this.checkRunCompletion(sr.runId);

    // If chain mode, enqueue next scenario
    if (['passed', 'failed'].includes(status)) {
      await this.enqueueNextInChain(sr);
    }

    return sr;
  }

  private async markRunStarted(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run || run.status !== 'queued') return;
    run.status = 'running';
    run.startedAt = new Date();
    await this.runRepo.save(run);
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

    // Calculate duration
    let durationMs = 0;
    if (run.startedAt && run.completedAt) {
      durationMs = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
    } else {
      durationMs = scenarioRuns.reduce((sum, sr) => sum + (sr.durationMs || 0), 0);
    }

    // Generate and upload report to S3 (per-tenant)
    // S3 URL only — localhost fallback is useless in external webhook messages
    let reportUrl: string | null = null;
    try {
      const htmlReport = await this.reportService.generateHtmlReport(run.tenantId, run.id);
      reportUrl = await this.storageService.uploadHtmlReport(run.tenantId, run.id, htmlReport);
      if (!reportUrl) {
        // No S3 — use dashboard API URL as fallback
        reportUrl = this.storageService.buildReportUrl(run.tenantId, run.id);
      }
    } catch (err: any) {
      this.logger.error(`Report upload error: ${err.message}`);
      reportUrl = this.storageService.buildReportUrl(run.tenantId, run.id);
    }

    // Persist report URL on run entity
    if (reportUrl) {
      run.reportUrl = reportUrl;
      await this.runRepo.save(run);
    }

    // Load scenario names for webhook display
    const scenarioIds = scenarioRuns.map(sr => sr.scenarioId);
    const scenarioEntities = await this.scenarioRepo.find({ where: { id: In(scenarioIds) } });
    const nameMap = new Map(scenarioEntities.map(s => [s.id, s.name]));

    // Emit webhook in Katab canonical format
    if (this.webhookService) {
      const eventType = run.status === 'completed' ? 'run.completed' : 'run.failed';
      const sortedSrs = scenarioRuns.sort((a, b) => a.sequenceNo - b.sequenceNo);
      this.webhookService.emitEvent(run.tenantId, eventType, {
        timestamp: new Date().toISOString(),
        run: {
          id: run.id,
          mode: run.mode,
          status: run.status,
          platform: run.targetPlatform,
          scenarioCount: scenarioRuns.length,
          passedCount: passed,
          failedCount: failed,
          durationMs,
          error: run.error || null,
        },
        scenarios: sortedSrs.map((sr) => ({
          scenarioId: sr.scenarioId,
          scenarioName: nameMap.get(sr.scenarioId) || sr.scenarioId.slice(0, 8),
          scenarioRunId: sr.id,
          sequenceNo: sr.sequenceNo,
          status: sr.status,
          attempt: sr.attempt,
          durationMs: sr.durationMs,
          error: sr.error || null,
          reportUrl: reportUrl || undefined,
          reportPath: reportUrl ? `runs/${run.id}/report.html` : undefined,
        })),
        reportUrl: reportUrl || undefined,
      }).catch((err) => this.logger.error(`Webhook emit error: ${err.message}`));
    }

    // Update PlannedRun status to DONE (must await — overlap policy checks for RUNNING status)
    if (run.plannedRunId) {
      try {
        await this.updatePlannedRunStatus(run.plannedRunId, run.status);
      } catch (err: any) {
        this.logger.error(`PlannedRun update error: ${err.message}`);
      }
    }

    // Process AFTER triggers — fire schedules that depend on this stream's completion
    if (run.streamId && this.scheduleService) {
      this.scheduleService.processAfterTriggers(
        run.tenantId,
        run.streamId,
        run.status as 'completed' | 'failed',
        run.id,
      ).catch((err) => this.logger.error(`AFTER trigger error: ${err.message}`));
    }
  }

  private async updatePlannedRunStatus(plannedRunId: string, runStatus: string) {
    const { PlannedRun } = await import('../schedule/planned-run.entity');
    const plannedRunRepo = this.runRepo.manager.getRepository(PlannedRun);
    // DONE for both completed and failed (the run did execute).
    // SKIPPED is only for runs that were never executed.
    const status = ['completed', 'failed'].includes(runStatus) ? 'DONE' : 'SKIPPED';
    await plannedRunRepo.update(plannedRunId, { status: status as any });
  }

  private async enqueueNextInChain(completedSr: ScenarioRun) {
    const run = await this.runRepo.findOne({ where: { id: completedSr.runId } });
    if (!run || run.mode !== 'chain') return;

    // ── Chain Variables: collect exported variables from completed scenario ──
    let chainVars: Record<string, string> = { ...(run.options?.chainVariables || {}) };

    if (completedSr.status === 'passed' && completedSr.resultJson?.variables) {
      const scenario = await this.scenarioRepo.findOne({ where: { id: completedSr.scenarioId } });
      const chainExports: string[] = scenario?.scenarioData?.chainExports || [];

      if (chainExports.length > 0) {
        for (const key of chainExports) {
          if (completedSr.resultJson.variables[key] !== undefined) {
            chainVars[key] = completedSr.resultJson.variables[key];
          }
        }
        this.logger.log(`Chain exports from ${completedSr.scenarioId}: ${chainExports.join(', ')}`);
      }
    }

    // ── Find next pending scenario ──
    const nextSr = await this.scenarioRunRepo.findOne({
      where: { runId: completedSr.runId, sequenceNo: completedSr.sequenceNo + 1, status: 'pending' },
    });
    if (!nextSr) return;

    // ── Chain Variables: check required variables on next scenario ──
    const nextScenario = await this.scenarioRepo.findOne({ where: { id: nextSr.scenarioId } });
    const chainRequires: string[] = nextScenario?.scenarioData?.chainRequires || [];

    if (chainRequires.length > 0) {
      const missing = chainRequires.filter(key => !(key in chainVars));
      if (missing.length > 0) {
        this.logger.warn(`Skipping scenario ${nextSr.scenarioId}: missing chain variables [${missing.join(', ')}]`);
        nextSr.status = 'skipped';
        nextSr.error = `Missing required chain variables: ${missing.join(', ')}`;
        nextSr.completedAt = new Date();
        await this.scenarioRunRepo.save(nextSr);

        await this.checkRunCompletion(nextSr.runId);
        await this.enqueueNextInChain(nextSr);
        return;
      }
    }

    // ── Persist chain variables into run options ──
    const runOptions = { ...(run.options || {}), chainVariables: chainVars };
    run.options = runOptions;
    await this.runRepo.save(run);

    // ── Enqueue next scenario with chain variables ──
    nextSr.status = 'queued';
    await this.scenarioRunRepo.save(nextSr);
    const kcpJobId = await this.runQueueService.enqueueScenarioJob({
      tenantId: run.tenantId,
      scenarioRunId: nextSr.id,
      runId: run.id,
      scenarioId: nextSr.scenarioId,
      sequenceNo: nextSr.sequenceNo,
      platform: nextSr.platform as any,
      options: runOptions,
      attempt: 1,
    });
    if (kcpJobId) {
      nextSr.kcpJobId = kcpJobId;
      await this.scenarioRunRepo.save(nextSr);
    }
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
      // Cancel the KCP job — KRC detects cancellation and stops execution
      if (sr.kcpJobId) {
        await this.runQueueService.cancelJob(sr.kcpJobId);
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
      const kcpJobId = await this.runQueueService.enqueueScenarioJob({
        tenantId,
        scenarioRunId: sr.id,
        runId: run.id,
        scenarioId: sr.scenarioId,
        sequenceNo: sr.sequenceNo,
        platform: sr.platform as any,
        options: run.options,
        attempt: sr.attempt,
      });
      if (kcpJobId) {
        sr.kcpJobId = kcpJobId;
        await this.scenarioRunRepo.save(sr);
      }
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

    // Cancel the KCP job — KRC detects cancellation and stops execution
    if (sr.kcpJobId) {
      await this.runQueueService.cancelJob(sr.kcpJobId);
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
    const kcpJobId = await this.runQueueService.enqueueScenarioJob({
      tenantId,
      scenarioRunId: sr.id,
      runId: run.id,
      scenarioId: sr.scenarioId,
      sequenceNo: sr.sequenceNo,
      platform: sr.platform as any,
      options: run.options,
      attempt: sr.attempt,
    });
    if (kcpJobId) {
      sr.kcpJobId = kcpJobId;
      await this.scenarioRunRepo.save(sr);
    }
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
