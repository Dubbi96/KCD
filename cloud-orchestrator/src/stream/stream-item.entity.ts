import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Stream } from './stream.entity';

@Entity('stream_items')
export class StreamItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stream_id' })
  streamId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 20 })
  type: 'SCENARIO' | 'GROUP';

  @Column({ name: 'ref_id' })
  refId: string;

  @Column({ name: 'order_no', default: 0 })
  orderNo: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Stream, (stream) => stream.items)
  @JoinColumn({ name: 'stream_id' })
  stream: Stream;
}
