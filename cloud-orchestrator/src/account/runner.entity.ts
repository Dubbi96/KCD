import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('runners')
export class Runner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'api_token', length: 255, unique: true })
  apiToken: string;

  @Column({ length: 20, default: 'web' })
  platform: 'web' | 'ios' | 'android';

  @Column({ length: 50, default: 'offline' })
  status: 'online' | 'offline' | 'busy';

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.runners)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
