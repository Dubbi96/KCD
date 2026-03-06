import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { StreamItem } from './stream-item.entity';

@Entity('streams')
export class Stream {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 20, default: 'AUTO' })
  mode: 'AUTO' | 'HUMAN';

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'order_no', default: 0 })
  orderNo: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => StreamItem, (item) => item.stream)
  items: StreamItem[];
}
