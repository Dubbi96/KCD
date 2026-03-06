import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 20, default: 'chain' })
  mode: 'chain' | 'batch' | 'single';

  @Column({ name: 'scenario_ids', type: 'jsonb', default: [] })
  scenarioIds: string[];

  @Column({ type: 'jsonb', default: {} })
  options: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
