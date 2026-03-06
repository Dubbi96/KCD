import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceResourcePool1709400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        runner_id UUID NOT NULL REFERENCES runners(id),
        device_udid VARCHAR(255) NOT NULL,
        platform VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        model VARCHAR(255),
        version VARCHAR(50),
        status VARCHAR(50) DEFAULT 'available',
        borrowed_by UUID,
        borrowed_at TIMESTAMPTZ,
        active_session_id UUID,
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(runner_id, device_udid)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_devices_tenant ON devices(tenant_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_devices_runner ON devices(runner_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_devices_status ON devices(status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS devices`);
  }
}
