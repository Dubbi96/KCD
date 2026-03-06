import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Runner } from './runner.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ length: 50, default: 'free' })
  plan: string;

  @Column({ name: 'max_runners', default: 3 })
  maxRunners: number;

  @Column({ name: 'max_schedules', default: 10 })
  maxSchedules: number;

  @Column({ name: 'max_monthly_runs', default: 500 })
  maxMonthlyRuns: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => Runner, (runner) => runner.tenant)
  runners: Runner[];
}
