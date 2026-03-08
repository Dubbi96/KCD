import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as cronParser from 'cron-parser';
import { Schedule } from './schedule.entity';
import { PlannedRun } from './planned-run.entity';
import { CreateScheduleDto, CronPreviewDto } from './dto/create-schedule.dto';
import { RunService } from '../run/run.service';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule) private scheduleRepo: Repository<Schedule>,
    @InjectRepository(PlannedRun) private plannedRunRepo: Repository<PlannedRun>,
    @Inject(forwardRef(() => RunService)) private runService: RunService,
  ) {}

  async create(tenantId: string, dto: CreateScheduleDto) {
    if (dto.type === 'CRON' && !dto.cronExpr) {
      throw new BadRequestException('cronExpr is required for CRON type');
    }
    if (dto.type === 'AT' && !dto.runAt) {
      throw new BadRequestException('runAt is required for AT type');
    }
    if (dto.type === 'AFTER' && !dto.afterStreamId) {
      throw new BadRequestException('afterStreamId is required for AFTER type');
    }

    const schedule = this.scheduleRepo.create({ tenantId, ...dto });
    await this.scheduleRepo.save(schedule);

    // Pre-compute planned runs
    if (dto.type === 'CRON') {
      await this.maintainLookahead(schedule);
    } else if (dto.type === 'AT' && dto.runAt) {
      const planned = this.plannedRunRepo.create({
        tenantId,
        scheduleId: schedule.id,
        streamId: schedule.streamId,
        plannedAt: dto.runAt,
      });
      await this.plannedRunRepo.save(planned);
    }

    return schedule;
  }

  async findAll(tenantId: string) {
    return this.scheduleRepo.find({
      where: { tenantId },
      order: { orderNo: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const schedule = await this.scheduleRepo.findOne({ where: { id, tenantId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateScheduleDto>) {
    const schedule = await this.findOne(tenantId, id);
    Object.assign(schedule, dto);
    return this.scheduleRepo.save(schedule);
  }

  async remove(tenantId: string, id: string) {
    const schedule = await this.findOne(tenantId, id);
    await this.scheduleRepo.remove(schedule);
  }

  async getPlannedRuns(tenantId: string, scheduleId?: string) {
    const where: any = { tenantId };
    if (scheduleId) where.scheduleId = scheduleId;
    return this.plannedRunRepo.find({
      where,
      order: { plannedAt: 'ASC' },
      take: 50,
    });
  }

  async cronPreview(dto: CronPreviewDto) {
    try {
      const interval = cronParser.parseExpression(dto.cronExpr, {
        tz: dto.timezone || 'Asia/Seoul',
      });
      const times: string[] = [];
      const count = dto.count || 5;
      for (let i = 0; i < count; i++) {
        times.push(interval.next().toISOString());
      }
      return { cronExpr: dto.cronExpr, timezone: dto.timezone, nextTimes: times };
    } catch (e) {
      throw new BadRequestException(`Invalid cron expression: ${e.message}`);
    }
  }

  async runNow(tenantId: string, scheduleId: string) {
    const schedule = await this.findOne(tenantId, scheduleId);
    const result = await this.runService.createRunFromSchedule(tenantId, schedule);
    return result;
  }

  async maintainLookahead(schedule: Schedule) {
    if (schedule.type !== 'CRON' || !schedule.cronExpr) return;

    const existingCount = await this.plannedRunRepo.count({
      where: { scheduleId: schedule.id, status: 'PLANNED' },
    });
    const needed = schedule.lookaheadCount - existingCount;
    if (needed <= 0) return;

    const lastPlanned = await this.plannedRunRepo.findOne({
      where: { scheduleId: schedule.id },
      order: { plannedAt: 'DESC' },
    });

    const startDate = lastPlanned
      ? new Date(Number(lastPlanned.plannedAt))
      : new Date();

    const interval = cronParser.parseExpression(schedule.cronExpr, {
      currentDate: startDate,
      tz: schedule.timezone || 'Asia/Seoul',
    });

    const newPlanned: PlannedRun[] = [];
    for (let i = 0; i < needed; i++) {
      const next = interval.next();
      const pr = this.plannedRunRepo.create({
        tenantId: schedule.tenantId,
        scheduleId: schedule.id,
        streamId: schedule.streamId,
        plannedAt: next.getTime(),
      });
      newPlanned.push(pr);
    }
    if (newPlanned.length > 0) {
      await this.plannedRunRepo.save(newPlanned);
    }
  }

  /**
   * Process AFTER triggers — called when a Run associated with a Stream finishes.
   * Finds AFTER schedules whose afterStreamId matches the completed stream,
   * checks triggerOn condition, and creates a PlannedRun.
   */
  async processAfterTriggers(
    tenantId: string,
    streamId: string,
    runStatus: 'completed' | 'failed',
    sourceRunId: string,
  ) {
    if (!streamId) return;

    const afterSchedules = await this.scheduleRepo.find({
      where: { tenantId, type: 'AFTER', afterStreamId: streamId, enabled: true },
    });

    for (const schedule of afterSchedules) {
      // Check triggerOn condition
      const shouldTrigger =
        schedule.triggerOn === 'ANY' ||
        (schedule.triggerOn === 'DONE' && runStatus === 'completed') ||
        (schedule.triggerOn === 'FAIL' && runStatus === 'failed');

      if (!shouldTrigger) continue;

      // Overlap policy: SKIP if there's already an active run for this schedule
      if (schedule.overlapPolicy === 'SKIP') {
        const activeCount = await this.plannedRunRepo.count({
          where: { scheduleId: schedule.id, status: In(['QUEUED', 'RUNNING']) },
        });
        if (activeCount > 0) continue;
      }

      // Apply delay if configured
      const plannedAt = Date.now() + (schedule.delayMs || 0);

      const pr = this.plannedRunRepo.create({
        tenantId,
        scheduleId: schedule.id,
        streamId: schedule.streamId,
        plannedAt,
        sourceRunId,
      });
      await this.plannedRunRepo.save(pr);

      // If no delay, process immediately
      if (!schedule.delayMs) {
        try {
          await this.plannedRunRepo.update(pr.id, { status: 'QUEUED' });
          const result = await this.runService.createRunFromSchedule(tenantId, schedule, pr.id);
          await this.plannedRunRepo.update(pr.id, {
            status: 'RUNNING',
            runId: result.run.id,
          });
        } catch (e) {
          console.error(`Failed to process AFTER trigger ${schedule.id}:`, e.message);
          await this.plannedRunRepo.update(pr.id, { status: 'PLANNED' });
        }
      }
      // If delayed, processDuePlannedRuns will pick it up on the next tick
    }
  }

  async processDuePlannedRuns() {
    const now = Date.now();
    // Optimized: filter by plannedAt in DB query with LIMIT
    const dueRuns = await this.plannedRunRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.schedule', 'schedule')
      .where('pr.status = :status', { status: 'PLANNED' })
      .andWhere('pr.plannedAt <= :now', { now })
      .orderBy('pr.plannedAt', 'ASC')
      .take(100)
      .getMany();

    // Group by scheduleId for misfire policy
    const bySchedule = new Map<string, typeof dueRuns>();
    for (const pr of dueRuns) {
      const key = pr.scheduleId;
      if (!bySchedule.has(key)) bySchedule.set(key, []);
      bySchedule.get(key)!.push(pr);
    }

    for (const [, scheduledRuns] of bySchedule) {
      const schedule = scheduledRuns[0].schedule;
      if (!schedule || !schedule.enabled) {
        for (const pr of scheduledRuns) {
          await this.plannedRunRepo.update(pr.id, { status: 'SKIPPED' });
        }
        continue;
      }

      // Apply misfire policy when multiple runs for the same schedule are due
      let toExecute = scheduledRuns;
      if (scheduledRuns.length > 1) {
        const policy = schedule.misfirePolicy || 'RUN_LATEST_ONLY';
        if (policy === 'SKIP_ALL') {
          for (const pr of scheduledRuns) {
            await this.plannedRunRepo.update(pr.id, { status: 'SKIPPED' });
          }
          continue;
        } else if (policy === 'RUN_LATEST_ONLY') {
          // Skip all except the most recent (last in ASC order)
          for (let i = 0; i < scheduledRuns.length - 1; i++) {
            await this.plannedRunRepo.update(scheduledRuns[i].id, { status: 'SKIPPED' });
          }
          toExecute = [scheduledRuns[scheduledRuns.length - 1]];
        }
        // RUN_ALL: execute all (default behavior)
      }

      for (const pr of toExecute) {
        // Overlap policy: SKIP if there's already an active run for this schedule
        if (schedule.overlapPolicy === 'SKIP') {
          const activeCount = await this.plannedRunRepo.count({
            where: { scheduleId: schedule.id, status: In(['QUEUED', 'RUNNING']) },
          });
          if (activeCount > 0) {
            await this.plannedRunRepo.update(pr.id, { status: 'SKIPPED' });
            continue;
          }
        }

        try {
          await this.plannedRunRepo.update(pr.id, { status: 'QUEUED' });
          const result = await this.runService.createRunFromSchedule(
            pr.tenantId,
            schedule,
            pr.id,
          );
          await this.plannedRunRepo.update(pr.id, {
            status: 'RUNNING',
            runId: result.run.id,
          });

          // Maintain lookahead for CRON schedules
          if (schedule.type === 'CRON') {
            await this.maintainLookahead(schedule);
          }
        } catch (e) {
          console.error(`Failed to process planned run ${pr.id}:`, e.message);
          await this.plannedRunRepo.update(pr.id, { status: 'PLANNED' });
        }
      }
    }
  }
}
