import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds a default admin account for local development.
 * Email: admin@katab.io  /  Password: password123
 * Idempotent — skips if the user already exists.
 */
export class SeedDevAdmin1709500000000 implements MigrationInterface {
  name = 'SeedDevAdmin1709500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip if admin user already exists
    const existing = await queryRunner.query(
      `SELECT id FROM users WHERE email = 'admin@katab.io' LIMIT 1`,
    );
    if (existing.length > 0) return;

    // Create default tenant
    await queryRunner.query(`
      INSERT INTO tenants (id, name, slug, plan, max_runners, max_schedules, max_monthly_runs)
      VALUES (
        'cdab158a-3f36-42ec-af84-f4511c3aa6da',
        'Katab Dev',
        'katab-dev',
        'free',
        10,
        50,
        10000
      )
      ON CONFLICT (slug) DO NOTHING
    `);

    // Create default admin user (password: password123)
    // bcrypt hash generated with 12 rounds
    await queryRunner.query(`
      INSERT INTO users (tenant_id, email, password_hash, name, role, is_active)
      VALUES (
        'cdab158a-3f36-42ec-af84-f4511c3aa6da',
        'admin@katab.io',
        '$2b$12$hz1Kun.vF2ZrwvVAgxapPe6vyUqRfDuyeM7gp5R5y0Ew8CDe2x5Q2',
        'Admin',
        'owner',
        true
      )
      ON CONFLICT (email) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM users WHERE email = 'admin@katab.io'`);
  }
}
