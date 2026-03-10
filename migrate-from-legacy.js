#!/usr/bin/env node
/**
 * Katab_Stack → KCD 데이터 이관 스크립트
 *
 * 소스: Katab_Stack (JSON files + SQLite)
 * 대상: KCD PostgreSQL (katab_orchestrator)
 *
 * 사용법:
 *   # 1) SQL 파일 생성만 (DB 연결 불필요)
 *   node migrate-from-legacy.js --dry-run
 *
 *   # 2) 직접 DB에 INSERT (KCD PostgreSQL 실행 중이어야 함)
 *   node migrate-from-legacy.js
 *
 * 환경변수:
 *   TENANT_ID  — 대상 테넌트 UUID (필수, KCD 로그인 후 확인)
 *   DB_HOST    — PostgreSQL 호스트 (default: localhost)
 *   DB_PORT    — PostgreSQL 포트 (default: 5432)
 *   DB_USER    — PostgreSQL 유저 (default: katab)
 *   DB_PASS    — PostgreSQL 패스워드 (default: katab_secret)
 *   DB_NAME    — PostgreSQL DB명 (default: katab_orchestrator)
 *   LEGACY_DIR — Katab_Stack 경로 (default: ../Katab_Stack)
 *   SQLITE_DB  — SQLite 경로 (default: ~/.katab/katab.db)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Config ──────────────────────────────────────
const TENANT_ID = process.env.TENANT_ID || '__TENANT_ID__';
const LEGACY_DIR = process.env.LEGACY_DIR || path.resolve(__dirname, '../Katab_Stack');
const SQLITE_PATH = process.env.SQLITE_DB || path.join(os.homedir(), '.katab', 'katab.db');
const DRY_RUN = process.argv.includes('--dry-run');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'katab',
  password: process.env.DB_PASS || 'katab_secret',
  database: process.env.DB_NAME || 'katab_orchestrator',
};

const OUTPUT_SQL = path.join(__dirname, 'migration-output.sql');

// ─── Helpers ─────────────────────────────────────
/** Epoch ms → PostgreSQL timestamp string */
function epochToTimestamp(epochMs) {
  if (!epochMs) return 'NOW()';
  return `'${new Date(epochMs).toISOString()}'::timestamptz`;
}

/** Escape single quotes for SQL */
function esc(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

/** JSON → escaped SQL string */
function jsonEsc(obj) {
  if (obj === null || obj === undefined) return "'{}'::jsonb";
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

/** Array → PostgreSQL array literal */
function pgArray(arr) {
  if (!arr || !arr.length) return "'{}'";
  return `ARRAY[${arr.map(s => esc(s)).join(',')}]`;
}

// ─── Read Source Data ────────────────────────────

function readScenarios() {
  const dir = path.join(LEGACY_DIR, 'scenarios');
  if (!fs.existsSync(dir)) { console.warn('  [WARN] scenarios 디렉토리 없음:', dir); return []; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  console.log(`  시나리오: ${files.length}개`);
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    return data;
  });
}

function readGroups() {
  const dir = path.join(LEGACY_DIR, 'groups');
  if (!fs.existsSync(dir)) { console.warn('  [WARN] groups 디렉토리 없음:', dir); return []; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  console.log(`  그룹: ${files.length}개`);
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    return data;
  });
}

function readSQLite() {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.warn('  [WARN] SQLite DB 없음:', SQLITE_PATH);
    return { streams: [], streamItems: [], schedules: [] };
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error('  [ERROR] better-sqlite3 미설치. npm install better-sqlite3 후 재실행하세요.');
    console.error('  또는 --dry-run 모드에서 SQLite 없이 JSON 파일만 이관할 수 있습니다.');
    return { streams: [], streamItems: [], schedules: [] };
  }

  const db = new Database(SQLITE_PATH, { readonly: true });

  const streams = db.prepare('SELECT * FROM streams').all();
  const streamItems = db.prepare('SELECT * FROM stream_items').all();
  const schedules = db.prepare('SELECT * FROM schedules').all();

  console.log(`  스트림: ${streams.length}개`);
  console.log(`  스트림 항목: ${streamItems.length}개`);
  console.log(`  스케쥴: ${schedules.length}개`);

  db.close();
  return { streams, streamItems, schedules };
}

// ─── Generate SQL ────────────────────────────────

function generateSQL(scenarios, groups, { streams, streamItems, schedules }) {
  const lines = [];

  lines.push('-- ═══════════════════════════════════════════════════');
  lines.push('-- Katab_Stack → KCD 데이터 이관 DML');
  lines.push(`-- 생성일: ${new Date().toISOString()}`);
  lines.push('-- ═══════════════════════════════════════════════════');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // Tenant ID 변수 설정
  if (TENANT_ID === '__TENANT_ID__') {
    lines.push("-- ⚠️  아래 tenant_id를 실제 값으로 변경하세요!");
    lines.push("-- KCD 로그인 → DB에서 SELECT id FROM tenants; 로 확인");
  }
  lines.push(`DO $$ DECLARE tid UUID := '${TENANT_ID}'; $$ BEGIN END $$;`);
  lines.push('');

  // 실제 INSERT에서 사용할 tid
  const tid = TENANT_ID === '__TENANT_ID__'
    ? "(SELECT id FROM tenants LIMIT 1)"
    : `'${TENANT_ID}'`;

  // ─── 1. Scenarios ──────────────────────────────
  lines.push('-- ─── 1. 시나리오 (scenarios) ──────────────────────');
  lines.push(`-- 총 ${scenarios.length}개`);
  lines.push('');

  for (const s of scenarios) {
    const platform = s.platform || 'web';
    const tags = s.tags || [];
    const version = s.version || 1;
    const tcId = s.tcId || null;
    const folderId = s.folderId || null;
    const desc = s.description || null;

    lines.push(`INSERT INTO scenarios (id, tenant_id, name, description, platform, scenario_data, version, tags, tc_id, folder_id, created_at, updated_at)`);
    lines.push(`VALUES (`);
    lines.push(`  ${esc(s.id)},`);
    lines.push(`  ${tid},`);
    lines.push(`  ${esc(s.name)},`);
    lines.push(`  ${esc(desc)},`);
    lines.push(`  ${esc(platform)},`);
    lines.push(`  ${jsonEsc(s)},`);
    lines.push(`  ${version},`);
    lines.push(`  ${pgArray(tags)},`);
    lines.push(`  ${esc(tcId)},`);
    lines.push(`  ${esc(folderId)},`);
    lines.push(`  ${epochToTimestamp(s.startedAt || s.createdAt)},`);
    lines.push(`  ${epochToTimestamp(s.stoppedAt || s.updatedAt || s.startedAt || s.createdAt)}`);
    lines.push(`) ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  scenario_data = EXCLUDED.scenario_data,`);
    lines.push(`  name = EXCLUDED.name,`);
    lines.push(`  updated_at = EXCLUDED.updated_at;`);
    lines.push('');
  }

  // ─── 2. Groups ─────────────────────────────────
  lines.push('-- ─── 2. 그룹 (groups) ─────────────────────────────');
  lines.push(`-- 총 ${groups.length}개`);
  lines.push('');

  for (const g of groups) {
    const mode = g.mode || 'chain';
    const scenarioIds = g.scenarioIds || [];
    const options = g.options || {};

    lines.push(`INSERT INTO groups (id, tenant_id, name, mode, scenario_ids, options, created_at, updated_at)`);
    lines.push(`VALUES (`);
    lines.push(`  ${esc(g.id)},`);
    lines.push(`  ${tid},`);
    lines.push(`  ${esc(g.name)},`);
    lines.push(`  ${esc(mode)},`);
    lines.push(`  ${jsonEsc(scenarioIds)},`);
    lines.push(`  ${jsonEsc(options)},`);
    lines.push(`  ${epochToTimestamp(g.createdAt)},`);
    lines.push(`  ${epochToTimestamp(g.updatedAt || g.createdAt)}`);
    lines.push(`) ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  scenario_ids = EXCLUDED.scenario_ids,`);
    lines.push(`  options = EXCLUDED.options,`);
    lines.push(`  name = EXCLUDED.name,`);
    lines.push(`  updated_at = EXCLUDED.updated_at;`);
    lines.push('');
  }

  // ─── 3. Streams ────────────────────────────────
  lines.push('-- ─── 3. 실행 흐름 (streams) ───────────────────────');
  lines.push(`-- 총 ${streams.length}개`);
  lines.push('');

  for (const s of streams) {
    lines.push(`INSERT INTO streams (id, tenant_id, name, mode, description, enabled, order_no, created_at)`);
    lines.push(`VALUES (`);
    lines.push(`  ${esc(s.id)},`);
    lines.push(`  ${tid},`);
    lines.push(`  ${esc(s.name)},`);
    lines.push(`  ${esc(s.mode)},`);
    lines.push(`  ${esc(s.description)},`);
    lines.push(`  ${s.enabled ? 'true' : 'false'},`);
    lines.push(`  ${s.order_no || 0},`);
    lines.push(`  ${epochToTimestamp(s.created_at)}`);
    lines.push(`) ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  name = EXCLUDED.name,`);
    lines.push(`  mode = EXCLUDED.mode,`);
    lines.push(`  description = EXCLUDED.description;`);
    lines.push('');
  }

  // ─── 4. Stream Items ──────────────────────────
  lines.push('-- ─── 4. 실행 흐름 항목 (stream_items) ─────────────');
  lines.push(`-- 총 ${streamItems.length}개`);
  lines.push('');

  for (const si of streamItems) {
    lines.push(`INSERT INTO stream_items (id, stream_id, tenant_id, type, ref_id, order_no, created_at)`);
    lines.push(`VALUES (`);
    lines.push(`  ${esc(si.id)},`);
    lines.push(`  ${esc(si.stream_id)},`);
    lines.push(`  ${tid},`);
    lines.push(`  ${esc(si.type)},`);
    lines.push(`  ${esc(si.ref_id)},`);
    lines.push(`  ${si.order_no || 0},`);
    lines.push(`  ${epochToTimestamp(si.created_at)}`);
    lines.push(`) ON CONFLICT (id) DO NOTHING;`);
    lines.push('');
  }

  // ─── 5. Schedules ─────────────────────────────
  lines.push('-- ─── 5. 스케쥴 (schedules) ────────────────────────');
  lines.push(`-- 총 ${schedules.length}개`);
  lines.push('');

  for (const sc of schedules) {
    // Determine target_platform from stream items (best guess)
    const streamName = (streams.find(s => s.id === sc.stream_id) || {}).name || '';
    let targetPlatform = 'web';
    if (streamName.toLowerCase().startsWith('ios')) targetPlatform = 'ios';
    else if (streamName.toLowerCase().startsWith('android')) targetPlatform = 'android';

    lines.push(`INSERT INTO schedules (id, tenant_id, name, stream_id, type, cron_expr, timezone, run_at, delay_ms, after_stream_id, trigger_on, overlap_policy, misfire_policy, enabled, lookahead_count, target_platform, headless, options, order_no, created_at, updated_at)`);
    lines.push(`VALUES (`);
    lines.push(`  ${esc(sc.id)},`);
    lines.push(`  ${tid},`);
    lines.push(`  ${esc(sc.name)},`);
    lines.push(`  ${esc(sc.stream_id)},`);
    lines.push(`  ${esc(sc.type)},`);
    lines.push(`  ${esc(sc.cron_expr)},`);
    lines.push(`  ${esc(sc.timezone)},`);
    lines.push(`  ${sc.run_at || 'NULL'},`);
    lines.push(`  ${sc.delay_ms || 0},`);
    lines.push(`  ${esc(sc.after_stream_id)},`);
    lines.push(`  ${esc(sc.trigger_on)},`);
    lines.push(`  ${esc(sc.overlap_policy)},`);
    lines.push(`  ${esc(sc.misfire_policy)},`);
    lines.push(`  ${sc.enabled ? 'true' : 'false'},`);
    lines.push(`  ${sc.lookahead_count || 5},`);
    lines.push(`  ${esc(targetPlatform)},`);
    lines.push(`  true,`);
    lines.push(`  '{}',`);
    lines.push(`  ${sc.order_no || 0},`);
    lines.push(`  ${epochToTimestamp(sc.created_at)},`);
    lines.push(`  ${epochToTimestamp(sc.created_at)}`);
    lines.push(`) ON CONFLICT (id) DO UPDATE SET`);
    lines.push(`  name = EXCLUDED.name,`);
    lines.push(`  enabled = EXCLUDED.enabled;`);
    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push(`-- ✅ 이관 완료: 시나리오 ${scenarios.length}, 그룹 ${groups.length}, 스트림 ${streams.length}, 스트림항목 ${streamItems.length}, 스케쥴 ${schedules.length}`);

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────

async function main() {
  console.log('=== Katab_Stack → KCD 데이터 이관 ===');
  console.log(`소스: ${LEGACY_DIR}`);
  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log('');

  // Read source data
  console.log('[1/2] 소스 데이터 읽는 중...');
  const scenarios = readScenarios();
  const groups = readGroups();
  const sqliteData = readSQLite();
  console.log('');

  // Generate SQL
  console.log('[2/2] SQL 생성 중...');
  const sql = generateSQL(scenarios, groups, sqliteData);

  // Write SQL file
  fs.writeFileSync(OUTPUT_SQL, sql, 'utf-8');
  console.log(`  SQL 파일 생성: ${OUTPUT_SQL}`);
  console.log('');

  if (DRY_RUN) {
    console.log('=== Dry-run 완료. SQL 파일을 확인하세요. ===');
    console.log('');
    console.log('실행 방법:');
    console.log(`  PGPASSWORD=${DB_CONFIG.password} psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d ${DB_CONFIG.database} -f ${OUTPUT_SQL}`);
    return;
  }

  // Execute against PostgreSQL
  let pg;
  try {
    pg = require('pg');
  } catch {
    console.log('  pg 패키지 미설치 — SQL 파일만 생성됨');
    console.log('  직접 실행하려면: npm install pg && node migrate-from-legacy.js');
    console.log('  또는 psql로 실행:');
    console.log(`  PGPASSWORD=${DB_CONFIG.password} psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d ${DB_CONFIG.database} -f ${OUTPUT_SQL}`);
    return;
  }

  const client = new pg.Client(DB_CONFIG);
  try {
    await client.connect();
    console.log('  PostgreSQL 연결 성공');

    // Get tenant_id if not set
    if (TENANT_ID === '__TENANT_ID__') {
      const result = await client.query('SELECT id, name FROM tenants LIMIT 1');
      if (result.rows.length === 0) {
        console.error('  [ERROR] tenants 테이블이 비어있습니다. 먼저 회원가입 하세요.');
        return;
      }
      const tenant = result.rows[0];
      console.log(`  테넌트 자동 감지: ${tenant.name} (${tenant.id})`);
      // Re-generate with actual tenant_id
      const sqlFinal = sql.replace(
        new RegExp("\\(SELECT id FROM tenants LIMIT 1\\)", 'g'),
        `'${tenant.id}'`
      );
      await client.query(sqlFinal);
    } else {
      await client.query(sql);
    }

    console.log('  ✅ 이관 완료!');
  } catch (err) {
    console.error('  [ERROR] DB 실행 실패:', err.message);
    console.log('  SQL 파일로 수동 실행하세요:', OUTPUT_SQL);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
