import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageSettings1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_settings" (
        "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tenant_id" uuid NOT NULL UNIQUE,
        "s3_bucket" varchar(255),
        "s3_region" varchar(50) DEFAULT 'ap-northeast-2',
        "s3_prefix" varchar(255) DEFAULT 'reports',
        "s3_access_key_id" varchar(255),
        "s3_secret_access_key" varchar(255),
        "report_base_url" varchar(2048),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_settings"`);
  }
}
