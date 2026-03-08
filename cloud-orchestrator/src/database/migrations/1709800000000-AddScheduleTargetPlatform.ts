import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleTargetPlatform1709800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "target_platform" varchar(20) DEFAULT 'web'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schedules" DROP COLUMN IF EXISTS "target_platform"`,
    );
  }
}
