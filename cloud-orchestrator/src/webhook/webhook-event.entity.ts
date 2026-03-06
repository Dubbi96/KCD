import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'webhook_id' })
  webhookId: string;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column('jsonb')
  payload: any;

  @Column({ default: 'pending' })
  status: string;

  @Column({ default: 0 })
  attempt: number;

  @Column({ name: 'max_attempts', default: 5 })
  maxAttempts: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
