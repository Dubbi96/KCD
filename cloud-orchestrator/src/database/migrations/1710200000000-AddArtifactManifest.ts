import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArtifactManifest1710200000000 implements MigrationInterface {
  name = 'AddArtifactManifest1710200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "artifact_manifests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" varchar NOT NULL,
        "run_id" varchar NOT NULL,
        "scenario_run_id" varchar,
        "step_id" varchar,
        "session_id" varchar,
        "artifact_type" varchar(50) NOT NULL,
        "path" varchar(500) NOT NULL,
        "url" varchar(1024),
        "storage_backend" varchar(20) NOT NULL DEFAULT 'local',
        "size_bytes" bigint NOT NULL DEFAULT 0,
        "content_type" varchar(100),
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_artifact_manifests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_am_tenant_id" ON "artifact_manifests" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_am_run_id" ON "artifact_manifests" ("run_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "artifact_manifests"`);
  }
}
