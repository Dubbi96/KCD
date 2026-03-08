import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('storage_settings')
export class StorageSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', unique: true })
  tenantId: string;

  @Column({ name: 's3_bucket', nullable: true })
  s3Bucket: string;

  @Column({ name: 's3_region', length: 50, default: 'ap-northeast-2' })
  s3Region: string;

  @Column({ name: 's3_prefix', length: 255, default: 'reports' })
  s3Prefix: string;

  @Column({ name: 's3_access_key_id', nullable: true })
  s3AccessKeyId: string;

  @Column({ name: 's3_secret_access_key', nullable: true })
  s3SecretAccessKey: string;

  /** CloudFront 등 CDN URL — 설정 시 리포트 URL이 CDN 직접 접근이 됨 */
  @Column({ name: 'report_base_url', nullable: true })
  reportBaseUrl: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
