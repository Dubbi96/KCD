import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Schedule } from './schedule.entity';
import { PlannedRun } from './planned-run.entity';
import { ScheduleService } from './schedule.service';
import { SchedulerDaemon } from './scheduler-daemon.service';
import { ScheduleController } from './schedule.controller';
import { RunModule } from '../run/run.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, PlannedRun]),
    ConfigModule,
    RunModule,
  ],
  providers: [ScheduleService, SchedulerDaemon],
  controllers: [ScheduleController],
  exports: [ScheduleService],
})
export class ScheduleModule {}
