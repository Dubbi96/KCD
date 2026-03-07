import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKcpJobId1709700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scenario_runs" ADD COLUMN IF NOT EXISTS "kcp_job_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scenario_runs" DROP COLUMN IF EXISTS "kcp_job_id"`,
    );
  }
}
