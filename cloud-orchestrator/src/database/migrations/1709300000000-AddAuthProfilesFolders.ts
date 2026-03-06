import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthProfilesFolders1709300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Auth Profiles table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS auth_profiles (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        description VARCHAR(500),
        domain VARCHAR(500) NOT NULL,
        cookies JSONB DEFAULT '[]',
        local_storage JSONB DEFAULT '{}',
        session_storage JSONB DEFAULT '{}',
        headers JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_auth_profiles_tenant ON auth_profiles(tenant_id)`);

    // Folders table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        parent_id UUID,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_folders_tenant ON folders(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)`);

    // Add folder_id and tc_id to scenarios
    await queryRunner.query(`ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS folder_id UUID`);
    await queryRunner.query(`ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS tc_id VARCHAR(255)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_scenarios_folder ON scenarios(folder_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_scenarios_folder`);
    await queryRunner.query(`ALTER TABLE scenarios DROP COLUMN IF EXISTS tc_id`);
    await queryRunner.query(`ALTER TABLE scenarios DROP COLUMN IF EXISTS folder_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS folders`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth_profiles`);
  }
}
