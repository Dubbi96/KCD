#!/usr/bin/env node
/**
 * Migrate Katab_Stack data into KCD PostgreSQL database.
 *
 * Reads JSON files from Katab_Stack directories and inserts into:
 *   - scenarios (27 files)
 *   - groups (11 files)
 *   - auth_profiles (3 files)
 *   - streams + stream_items (from 13 processes)
 *
 * Usage:
 *   node scripts/migrate-katab-stack.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// --- Config ---
const KATAB_STACK_DIR = path.resolve(__dirname, '../../Katab_Stack');
const TENANT_ID = 'f6288ead-25f7-411d-80fc-994e0475e8a4'; // KT_SKYLIFE

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'katab',
  password: process.env.DB_PASSWORD || 'katab_secret',
  database: process.env.DB_NAME || 'katab_orchestrator',
};

// --- Helpers ---
function readJsonDir(dirName) {
  const dirPath = path.join(KATAB_STACK_DIR, dirName);
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const content = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8'));
      return content;
    });
}

function escStr(s) {
  if (s == null) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

function escJson(obj) {
  if (obj == null) return 'NULL';
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

function escArr(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const items = arr.map(s => `"${String(s).replace(/"/g, '\\"')}"`).join(',');
  return `'{${items}}'::text[]`;
}

// --- Migration Functions ---

async function migrateScenarios(client) {
  const scenarios = readJsonDir('scenarios');
  console.log(`[scenarios] Found ${scenarios.length} files`);

  let inserted = 0;
  for (const s of scenarios) {
    const id = s.id;
    const name = s.name || 'Unnamed';
    const platform = s.platform || 'web';
    const description = s.description || s.testMeta?.feature || null;
    const version = s.version || 1;

    // Build tags from testMeta
    const tags = [];
    if (s.testMeta?.module) tags.push(s.testMeta.module);
    if (s.testMeta?.type) tags.push(s.testMeta.type);
    if (s.testMeta?.priority) tags.push(s.testMeta.priority);
    if (s.testMeta?.tcId) tags.push(s.testMeta.tcId);
    if (s.tags) tags.push(...s.tags);

    try {
      await client.query(`
        INSERT INTO scenarios (id, tenant_id, name, description, platform, scenario_data, version, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          scenario_data = EXCLUDED.scenario_data,
          tags = EXCLUDED.tags,
          updated_at = now()
      `, [id, TENANT_ID, name, description, platform, JSON.stringify(s), version, tags]);
      inserted++;
    } catch (e) {
      console.error(`  [SKIP] scenario ${name} (${id}): ${e.message}`);
    }
  }
  console.log(`  Inserted/updated: ${inserted}/${scenarios.length}`);
}

async function migrateGroups(client) {
  const groups = readJsonDir('groups');
  console.log(`[groups] Found ${groups.length} files`);

  let inserted = 0;
  for (const g of groups) {
    const id = g.id;
    const name = g.name || 'Unnamed Group';
    const mode = g.mode || 'chain';
    const scenarioIds = g.scenarioIds || [];
    const options = g.options || {};

    try {
      await client.query(`
        INSERT INTO groups (id, tenant_id, name, mode, scenario_ids, options)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          scenario_ids = EXCLUDED.scenario_ids,
          options = EXCLUDED.options,
          updated_at = now()
      `, [id, TENANT_ID, name, mode, JSON.stringify(scenarioIds), JSON.stringify(options)]);
      inserted++;
    } catch (e) {
      console.error(`  [SKIP] group ${name} (${id}): ${e.message}`);
    }
  }
  console.log(`  Inserted/updated: ${inserted}/${groups.length}`);
}

async function migrateAuthProfiles(client) {
  const profiles = readJsonDir('auth-profiles');
  console.log(`[auth_profiles] Found ${profiles.length} files`);

  let inserted = 0;
  for (const p of profiles) {
    const id = p.id;
    const name = p.name || 'Unnamed Profile';

    try {
      await client.query(`
        INSERT INTO auth_profiles (id, tenant_id, name, profile_data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          profile_data = EXCLUDED.profile_data,
          updated_at = now()
      `, [id, TENANT_ID, name, JSON.stringify(p)]);
      inserted++;
    } catch (e) {
      // auth_profiles might have different schema, try alternative
      try {
        await client.query(`
          INSERT INTO auth_profiles (id, tenant_id, name, domain, cookies)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            domain = EXCLUDED.domain,
            cookies = EXCLUDED.cookies,
            updated_at = now()
        `, [id, TENANT_ID, name, p.domain || '', JSON.stringify(p.cookies || [])]);
        inserted++;
      } catch (e2) {
        console.error(`  [SKIP] auth_profile ${name} (${id}): ${e2.message}`);
      }
    }
  }
  console.log(`  Inserted/updated: ${inserted}/${profiles.length}`);
}

async function migrateProcesses(client) {
  const processes = readJsonDir('processes');
  console.log(`[processes → streams] Found ${processes.length} files`);

  let inserted = 0;
  for (const p of processes) {
    const streamId = p.id;
    const name = p.name || 'Unnamed Process';
    const description = p.description || '';

    try {
      // Create stream from process
      await client.query(`
        INSERT INTO streams (id, tenant_id, name, mode, description, enabled)
        VALUES ($1, $2, $3, 'AUTO', $4, true)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `, [streamId, TENANT_ID, name, description]);

      // Extract scenario/group references from linkedScenarios
      // (nodeIds are graph node IDs, not scenario IDs)
      const links = p.linkedScenarios || [];
      let orderNo = 0;

      // Delete existing items for this stream first
      await client.query(`DELETE FROM stream_items WHERE stream_id = $1`, [streamId]);

      for (const link of links) {
        const type = link.type === 'group' ? 'GROUP' : 'SCENARIO';
        const refId = link.refId;
        try {
          await client.query(`
            INSERT INTO stream_items (stream_id, tenant_id, type, ref_id, order_no)
            VALUES ($1, $2, $3, $4, $5)
          `, [streamId, TENANT_ID, type, refId, orderNo++]);
        } catch (e) {
          console.error(`    [SKIP item] ${type} ${refId}: ${e.message}`);
        }
      }

      // Create a default schedule for each process (disabled by default)
      const scheduleId = streamId.replace(/^.{4}/, 'aaaa'); // Derive a deterministic schedule ID
      await client.query(`
        INSERT INTO schedules (id, tenant_id, name, stream_id, type, cron_expr, timezone, enabled)
        VALUES ($1, $2, $3, $4, 'CRON', '0 9 * * 1-5', 'Asia/Seoul', false)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          stream_id = EXCLUDED.stream_id
      `, [scheduleId, TENANT_ID, `Schedule: ${name}`, streamId]);

      inserted++;
    } catch (e) {
      console.error(`  [SKIP] process ${name} (${streamId}): ${e.message}`);
    }
  }
  console.log(`  Inserted/updated: ${inserted}/${processes.length}`);
}

// --- Main ---
async function main() {
  console.log('=== Katab_Stack → KCD Migration ===');
  console.log(`Source: ${KATAB_STACK_DIR}`);
  console.log(`Tenant: KT_SKYLIFE (${TENANT_ID})`);
  console.log();

  // Verify source directory
  if (!fs.existsSync(KATAB_STACK_DIR)) {
    console.error(`ERROR: Katab_Stack directory not found: ${KATAB_STACK_DIR}`);
    process.exit(1);
  }

  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('Connected to PostgreSQL\n');

  try {
    // Verify tenant exists
    const tenantCheck = await client.query('SELECT id, name FROM tenants WHERE id = $1', [TENANT_ID]);
    if (tenantCheck.rows.length === 0) {
      console.error(`ERROR: Tenant not found: ${TENANT_ID}`);
      process.exit(1);
    }
    console.log(`Tenant: ${tenantCheck.rows[0].name}\n`);

    // Run migrations in order (scenarios first, then groups, then processes that reference them)
    await migrateScenarios(client);
    console.log();
    await migrateGroups(client);
    console.log();
    await migrateAuthProfiles(client);
    console.log();
    await migrateProcesses(client);
    console.log();

    // Summary
    const counts = await client.query(`
      SELECT
        (SELECT count(*) FROM scenarios WHERE tenant_id = $1) as scenarios,
        (SELECT count(*) FROM groups WHERE tenant_id = $1) as groups,
        (SELECT count(*) FROM auth_profiles WHERE tenant_id = $1) as auth_profiles,
        (SELECT count(*) FROM streams WHERE tenant_id = $1) as streams,
        (SELECT count(*) FROM stream_items WHERE tenant_id = $1) as stream_items,
        (SELECT count(*) FROM schedules WHERE tenant_id = $1) as schedules
    `, [TENANT_ID]);

    console.log('=== Migration Complete ===');
    console.log('KT_SKYLIFE data counts:');
    const c = counts.rows[0];
    console.log(`  Scenarios:    ${c.scenarios}`);
    console.log(`  Groups:       ${c.groups}`);
    console.log(`  Auth Profiles:${c.auth_profiles}`);
    console.log(`  Streams:      ${c.streams}`);
    console.log(`  Stream Items: ${c.stream_items}`);
    console.log(`  Schedules:    ${c.schedules}`);

  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
