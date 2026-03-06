import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Represents a physical/virtual device registered by a Runner.
 * Devices are auto-discovered by Runner's device-scanner and reported via heartbeat.
 * Users "borrow" a device to create a mirror/recording session.
 */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'runner_id' })
  runnerId: string;

  /** UDID (iOS), serial (Android), or 'browser' (web) */
  @Column({ name: 'device_udid', length: 255 })
  deviceUdid: string;

  @Column({ length: 20 })
  platform: 'ios' | 'android' | 'web';

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  version: string | null;

  @Column({ type: 'varchar', length: 50, default: 'available' })
  status: 'available' | 'in_use' | 'offline';

  /** User who currently has this device borrowed */
  @Column({ type: 'uuid', name: 'borrowed_by', nullable: true })
  borrowedBy: string | null;

  @Column({ name: 'borrowed_at', type: 'timestamptz', nullable: true })
  borrowedAt: Date | null;

  /** Active session ID when borrowed */
  @Column({ type: 'uuid', name: 'active_session_id', nullable: true })
  activeSessionId: string | null;

  /** Last time runner reported this device in heartbeat */
  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'NOW()' })
  lastSeenAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
