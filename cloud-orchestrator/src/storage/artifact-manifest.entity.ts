import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * Artifact Manifest — tracks every generated artifact for a run/scenario.
 * Enables drill-down views in the dashboard and retention management.
 */
@Entity('artifact_manifests')
export class ArtifactManifest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Index()
  @Column({ name: 'run_id' })
  runId: string;

  @Column({ name: 'scenario_run_id', nullable: true })
  scenarioRunId: string;

  @Column({ name: 'step_id', nullable: true })
  stepId: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId: string;

  @Column({ name: 'artifact_type', length: 50 })
  artifactType: 'report_html' | 'report_json' | 'screenshot' | 'video' | 'recording' | 'log' | 'trace';

  @Column({ length: 500 })
  path: string;

  @Column({ nullable: true, length: 1024 })
  url: string;

  @Column({ name: 'storage_backend', length: 20, default: 'local' })
  storageBackend: 'local' | 's3';

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column({ name: 'content_type', length: 100, nullable: true })
  contentType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
