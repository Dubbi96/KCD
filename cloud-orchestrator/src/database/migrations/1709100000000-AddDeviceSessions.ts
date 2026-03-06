import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceSessions1709100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        runner_id UUID NOT NULL REFERENCES runners(id),
        runner_session_id VARCHAR(255),
        platform VARCHAR(20) NOT NULL,
        device_id VARCHAR(255) NOT NULL,
        device_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'creating',
        created_by UUID,
        options JSONB DEFAULT '{}',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_device_sessions_tenant ON device_sessions(tenant_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_device_sessions_runner ON device_sessions(runner_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_device_sessions_status ON device_sessions(status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS device_sessions`);
  }
}
