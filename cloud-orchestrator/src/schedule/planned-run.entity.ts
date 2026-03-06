import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Schedule } from './schedule.entity';

@Entity('planned_runs')
export class PlannedRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'schedule_id' })
  scheduleId: string;

  @Column({ name: 'stream_id', nullable: true })
  streamId: string;

  @Column({ name: 'planned_at', type: 'bigint' })
  plannedAt: number;

  @Column({ length: 20, default: 'PLANNED' })
  status: 'PLANNED' | 'QUEUED' | 'RUNNING' | 'DONE' | 'SKIPPED' | 'CANCELLED';

  @Column({ name: 'run_id', nullable: true })
  runId: string;

  @Column({ name: 'source_run_id', nullable: true })
  sourceRunId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Schedule)
  @JoinColumn({ name: 'schedule_id' })
  schedule: Schedule;
}
