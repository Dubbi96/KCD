import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1709000000000 implements MigrationInterface {
  name = 'InitialSchema1709000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === Account / Tenant ===
    await queryRunner.query(`
      CREATE TABLE tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        plan VARCHAR(50) DEFAULT 'free',
        max_runners INTEGER DEFAULT 3,
        max_schedules INTEGER DEFAULT 10,
        max_monthly_runs INTEGER DEFAULT 500,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_users_tenant ON users(tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_users_email ON users(email)`);

    // === Runner Registration ===
    await queryRunner.query(`
      CREATE TABLE runners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        api_token VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'offline' CHECK(status IN ('online','offline','busy')),
        last_heartbeat_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_runners_tenant ON runners(tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_runners_token ON runners(api_token)`);

    // === Scenarios ===
    await queryRunner.query(`
      CREATE TABLE scenarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        platform VARCHAR(20) DEFAULT 'web' CHECK(platform IN ('web','ios','android')),
        scenario_data JSONB NOT NULL,
        version INTEGER DEFAULT 1,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_scenarios_tenant ON scenarios(tenant_id)`);

    // === Groups (Scenario Groups) ===
    await queryRunner.query(`
      CREATE TABLE groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        mode VARCHAR(20) DEFAULT 'chain' CHECK(mode IN ('chain','batch','single')),
        scenario_ids JSONB NOT NULL DEFAULT '[]',
        options JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_groups_tenant ON groups(tenant_id)`);

    // === Streams ===
    await queryRunner.query(`
      CREATE TABLE streams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        mode VARCHAR(20) DEFAULT 'AUTO' CHECK(mode IN ('AUTO','HUMAN')),
        description TEXT,
        enabled BOOLEAN DEFAULT true,
        order_no INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_streams_tenant ON streams(tenant_id)`);

    await queryRunner.query(`
      CREATE TABLE stream_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(20) CHECK(type IN ('SCENARIO','GROUP')),
        ref_id UUID NOT NULL,
        order_no INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_stream_items_stream ON stream_items(stream_id)`);

    // === Schedules ===
    await queryRunner.query(`
      CREATE TABLE schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
        type VARCHAR(20) DEFAULT 'CRON' CHECK(type IN ('CRON','AT','AFTER')),
        cron_expr VARCHAR(100),
        timezone VARCHAR(100) DEFAULT 'Asia/Seoul',
        run_at BIGINT,
        delay_ms INTEGER DEFAULT 0,
        after_stream_id UUID,
        trigger_on VARCHAR(20) DEFAULT 'DONE' CHECK(trigger_on IN ('DONE','FAIL','ANY')),
        overlap_policy VARCHAR(20) DEFAULT 'SKIP' CHECK(overlap_policy IN ('SKIP','QUEUE')),
        misfire_policy VARCHAR(30) DEFAULT 'RUN_LATEST_ONLY' CHECK(misfire_policy IN ('RUN_ALL','RUN_LATEST_ONLY','SKIP_ALL')),
        enabled BOOLEAN DEFAULT true,
        lookahead_count INTEGER DEFAULT 5,
        order_no INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_schedules_tenant ON schedules(tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_schedules_stream ON schedules(stream_id)`);

    // === Planned Runs ===
    await queryRunner.query(`
      CREATE TABLE planned_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
        stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
        planned_at BIGINT NOT NULL,
        status VARCHAR(20) DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','QUEUED','RUNNING','DONE','SKIPPED','CANCELLED')),
        run_id UUID,
        source_run_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_planned_runs_tenant ON planned_runs(tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_planned_runs_schedule ON planned_runs(schedule_id)`);
    await queryRunner.query(`CREATE INDEX idx_planned_runs_status ON planned_runs(status, planned_at)`);

    // === Runs ===
    await queryRunner.query(`
      CREATE TABLE runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        mode VARCHAR(20) CHECK(mode IN ('single','batch','chain','stream')),
        status VARCHAR(20) DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled','paused')),
        scenario_ids JSONB DEFAULT '[]',
        target_platform VARCHAR(20) CHECK(target_platform IN ('web','ios','android')),
        options JSONB DEFAULT '{}',
        auth_profile_id UUID,
        concurrency INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error TEXT,
        total_scenarios INTEGER DEFAULT 0,
        passed_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        stream_id UUID,
        schedule_id UUID,
        planned_run_id UUID,
        runner_id UUID REFERENCES runners(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_runs_tenant ON runs(tenant_id)`);
    await queryRunner.query(`CREATE INDEX idx_runs_status ON runs(tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_runs_created ON runs(tenant_id, created_at DESC)`);

    // === Scenario Runs ===
    await queryRunner.query(`
      CREATE TABLE scenario_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        scenario_id UUID NOT NULL,
        sequence_no INTEGER DEFAULT 0,
        platform VARCHAR(20),
        status VARCHAR(30) DEFAULT 'pending' CHECK(status IN ('pending','queued','running','passed','failed','infra_failed','skipped','cancelled','paused')),
        attempt INTEGER DEFAULT 1,
        worker_id VARCHAR(255),
        resource_id VARCHAR(255),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER,
        error TEXT,
        result_json JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_scenario_runs_run ON scenario_runs(run_id)`);
    await queryRunner.query(`CREATE INDEX idx_scenario_runs_tenant ON scenario_runs(tenant_id)`);

    // === Resources (per tenant) ===
    await queryRunner.query(`
      CREATE TABLE resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        target VARCHAR(20) CHECK(target IN ('web','ios','android')),
        name VARCHAR(255),
        enabled BOOLEAN DEFAULT true,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_resources_tenant ON resources(tenant_id)`);

    // === Webhooks ===
    await queryRunner.query(`
      CREATE TABLE webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255),
        url VARCHAR(2048) NOT NULL,
        secret VARCHAR(255),
        events_filter JSONB DEFAULT '[]',
        type VARCHAR(50) DEFAULT 'generic',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id)`);

    // === Webhook Events (Outbox) ===
    await queryRunner.query(`
      CREATE TABLE webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        event_type VARCHAR(100),
        payload JSONB,
        status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed','exhausted')),
        attempt INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 5,
        next_retry_at TIMESTAMP WITH TIME ZONE,
        last_error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        delivered_at TIMESTAMP WITH TIME ZONE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_webhook_events_status ON webhook_events(status, next_retry_at)`);

    // === Auth Profiles (per tenant) ===
    await queryRunner.query(`
      CREATE TABLE auth_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(500),
        profile_data JSONB NOT NULL,
        domain_patterns TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_auth_profiles_tenant ON auth_profiles(tenant_id)`);

    // === Usage Tracking ===
    await queryRunner.query(`
      CREATE TABLE usage_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        run_count INTEGER DEFAULT 0,
        scenario_run_count INTEGER DEFAULT 0,
        total_duration_ms BIGINT DEFAULT 0,
        UNIQUE(tenant_id, month)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_usage_tenant_month ON usage_records(tenant_id, month)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'usage_records', 'auth_profiles', 'webhook_events', 'webhooks',
      'resources', 'scenario_runs', 'runs', 'planned_runs', 'schedules',
      'stream_items', 'streams', 'groups', 'scenarios', 'runners',
      'users', 'tenants',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
  }
}
