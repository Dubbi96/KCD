import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRunReportUrl1710100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "report_url" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "runs" DROP COLUMN IF EXISTS "report_url"
    `);
  }
}
