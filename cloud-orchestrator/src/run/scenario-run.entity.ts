import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Run } from './run.entity';

@Entity('scenario_runs')
export class ScenarioRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'run_id' })
  runId: string;

  @Column({ name: 'scenario_id' })
  scenarioId: string;

  @Column({ name: 'sequence_no', default: 0 })
  sequenceNo: number;

  @Column({ length: 20, nullable: true })
  platform: string;

  @Column({ length: 30, default: 'pending' })
  status: string;

  @Column({ default: 1 })
  attempt: number;

  @Column({ name: 'worker_id', nullable: true })
  workerId: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs: number;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ name: 'result_json', type: 'jsonb', nullable: true })
  resultJson: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Run, (run) => run.scenarioRuns)
  @JoinColumn({ name: 'run_id' })
  run: Run;
}
