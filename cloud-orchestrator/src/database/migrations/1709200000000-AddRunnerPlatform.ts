import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRunnerPlatform1709200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE runners
      ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'web' NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_runners_platform ON runners(platform)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_runners_platform`);
    await queryRunner.query(`ALTER TABLE runners DROP COLUMN IF EXISTS platform`);
  }
}
