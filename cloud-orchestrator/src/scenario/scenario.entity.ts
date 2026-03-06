import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('scenarios')
export class Scenario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 500 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 20, default: 'web' })
  platform: 'web' | 'ios' | 'android';

  @Column({ name: 'scenario_data', type: 'jsonb' })
  scenarioData: Record<string, any>;

  @Column({ default: 1 })
  version: number;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ name: 'folder_id', nullable: true })
  folderId: string;

  @Column({ name: 'tc_id', nullable: true, length: 255 })
  tcId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
