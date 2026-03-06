import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 255, nullable: true })
  name: string;

  @Column({ length: 2048 })
  url: string;

  @Column({ length: 255, nullable: true })
  secret: string;

  @Column({ name: 'events_filter', type: 'jsonb', default: [] })
  eventsFilter: string[];

  @Column({ length: 50, default: 'generic' })
  type: string;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
