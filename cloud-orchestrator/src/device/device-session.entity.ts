import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('device_sessions')
export class DeviceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'runner_id' })
  runnerId: string;

  /** Session ID on the runner side */
  @Column({ name: 'runner_session_id', nullable: true })
  runnerSessionId: string;

  @Column({ length: 20 })
  platform: 'ios' | 'android' | 'web';

  @Column({ name: 'device_id', length: 255 })
  deviceId: string;

  @Column({ name: 'device_name', length: 255, nullable: true })
  deviceName: string;

  @Column({ length: 50, default: 'creating' })
  status: 'creating' | 'active' | 'recording' | 'closing' | 'closed' | 'error';

  @Column({ name: 'created_by', nullable: true })
  createdBy: string; // user ID

  @Column({ type: 'jsonb', default: {} })
  options: Record<string, any>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;
}
