import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('auth_profiles')
export class AuthProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 500, nullable: true })
  domain: string;

  @Column({ name: 'profile_data', type: 'jsonb' })
  profileData: {
    cookies?: any[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
    headers?: Record<string, string>;
  };

  @Column({ name: 'domain_patterns', type: 'text', array: true, default: '{}' })
  domainPatterns: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
