import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    private runService: RunService,
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
    return this.runService.createRunFromSchedule(tenantId, schedule);
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

  async processDuePlannedRuns() {
    const now = Date.now();
    // Optimized: filter by plannedAt in DB query with LIMIT
    const dueRuns = await this.plannedRunRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.schedule', 'schedule')
      .where('pr.status = :status', { status: 'PLANNED' })
      .andWhere('pr.planned_at <= :now', { now })
      .orderBy('pr.planned_at', 'ASC')
      .take(100)
      .getMany();

    for (const pr of dueRuns) {
      if (!pr.schedule || !pr.schedule.enabled) {
        await this.plannedRunRepo.update(pr.id, { status: 'SKIPPED' });
        continue;
      }

      try {
        await this.plannedRunRepo.update(pr.id, { status: 'QUEUED' });
        const run = await this.runService.createRunFromSchedule(
          pr.tenantId,
          pr.schedule,
        );
        await this.plannedRunRepo.update(pr.id, {
          status: 'RUNNING',
          runId: run.id,
        });

        // Maintain lookahead for CRON schedules
        if (pr.schedule.type === 'CRON') {
          await this.maintainLookahead(pr.schedule);
        }
      } catch (e) {
        console.error(`Failed to process planned run ${pr.id}:`, e.message);
        await this.plannedRunRepo.update(pr.id, { status: 'PLANNED' });
      }
    }
  }
}
