import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('schedules')
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'stream_id', nullable: true })
  streamId: string;

  @Column({ length: 20, default: 'CRON' })
  type: 'CRON' | 'AT' | 'AFTER';

  @Column({ name: 'cron_expr', length: 100, nullable: true })
  cronExpr: string;

  @Column({ length: 100, default: 'Asia/Seoul' })
  timezone: string;

  @Column({ name: 'run_at', type: 'bigint', nullable: true })
  runAt: number;

  @Column({ name: 'delay_ms', default: 0 })
  delayMs: number;

  @Column({ name: 'after_stream_id', nullable: true })
  afterStreamId: string;

  @Column({ name: 'trigger_on', length: 20, default: 'DONE' })
  triggerOn: 'DONE' | 'FAIL' | 'ANY';

  @Column({ name: 'overlap_policy', length: 20, default: 'SKIP' })
  overlapPolicy: 'SKIP' | 'QUEUE';

  @Column({ name: 'misfire_policy', length: 30, default: 'RUN_LATEST_ONLY' })
  misfirePolicy: 'RUN_ALL' | 'RUN_LATEST_ONLY' | 'SKIP_ALL';

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'lookahead_count', default: 5 })
  lookaheadCount: number;

  @Column({ name: 'order_no', default: 0 })
  orderNo: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
