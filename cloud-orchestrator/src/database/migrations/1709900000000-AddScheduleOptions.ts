import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleOptions1709900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "headless" boolean DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "options" jsonb DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schedules" DROP COLUMN IF EXISTS "headless"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedules" DROP COLUMN IF EXISTS "options"`,
    );
  }
}
