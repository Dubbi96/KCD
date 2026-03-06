import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ScenarioRun } from './scenario-run.entity';

@Entity('runs')
export class Run {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 20, nullable: true })
  mode: 'single' | 'batch' | 'chain' | 'stream';

  @Column({ length: 20, default: 'queued' })
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

  @Column({ name: 'scenario_ids', type: 'jsonb', default: [] })
  scenarioIds: string[];

  @Column({ name: 'target_platform', length: 20, nullable: true })
  targetPlatform: 'web' | 'ios' | 'android';

  @Column({ type: 'jsonb', default: {} })
  options: Record<string, any>;

  @Column({ name: 'auth_profile_id', nullable: true })
  authProfileId: string;

  @Column({ default: 1 })
  concurrency: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ name: 'total_scenarios', default: 0 })
  totalScenarios: number;

  @Column({ name: 'passed_count', default: 0 })
  passedCount: number;

  @Column({ name: 'failed_count', default: 0 })
  failedCount: number;

  @Column({ name: 'stream_id', nullable: true })
  streamId: string;

  @Column({ name: 'schedule_id', nullable: true })
  scheduleId: string;

  @Column({ name: 'planned_run_id', nullable: true })
  plannedRunId: string;

  @Column({ name: 'runner_id', nullable: true })
  runnerId: string;

  @OneToMany(() => ScenarioRun, (sr) => sr.run)
  scenarioRuns: ScenarioRun[];
}
