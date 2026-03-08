#!/usr/bin/env npx ts-node
/**
 * migrate-kt-skylife.ts
 *
 * Migrates KT_SKYLIFE data (scenarios, groups, streams, schedules) from the
 * local Katab_Stack file system + SQLite database to a cloud KCD instance.
 *
 * Usage:
 *   npx ts-node scripts/migrate-kt-skylife.ts \
 *     --api-url https://api.katab.io \
 *     --email admin@katab.io \
 *     --password xxx
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

// ─── CLI argument parsing ──────────────────────────────────────────────

function parseArgs(): { apiUrl: string; email: string; password: string } {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    map[key] = args[i + 1];
  }
  if (!map['api-url'] || !map['email'] || !map['password']) {
    console.error(
      'Usage: npx ts-node scripts/migrate-kt-skylife.ts --api-url <url> --email <email> --password <password>',
    );
    process.exit(1);
  }
  return { apiUrl: map['api-url'], email: map['email'], password: map['password'] };
}

// ─── HTTP helpers ──────────────────────────────────────────────────────

let AUTH_TOKEN = '';

async function apiRequest<T = any>(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: any,
): Promise<T> {
  const url = `${baseUrl}/api/v1${urlPath}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${urlPath} failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

// ─── Sign in ───────────────────────────────────────────────────────────

async function signIn(apiUrl: string, email: string, password: string): Promise<string> {
  console.log(`\n[auth] Signing in as ${email}...`);
  const result = await apiRequest<{ token: string }>(apiUrl, 'POST', '/auth/sign-in', {
    email,
    password,
  });
  if (!result?.token) {
    throw new Error('Sign-in response did not contain a token');
  }
  console.log('[auth] Signed in successfully.');
  return result.token;
}

// ─── File-system helpers ───────────────────────────────────────────────

const SCENARIOS_DIR = path.join(
  process.env.HOME || '/Users/gangjong-won',
  'Katab',
  'Katab_Stack',
  'scenarios',
);
const GROUPS_DIR = path.join(
  process.env.HOME || '/Users/gangjong-won',
  'Katab',
  'Katab_Stack',
  'groups',
);
const SQLITE_PATH = path.join(
  process.env.HOME || '/Users/gangjong-won',
  '.katab',
  'katab.db',
);

function readJsonFiles<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) {
    console.warn(`  [warn] Directory not found: ${dir}`);
    return [];
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  console.log(`  Found ${files.length} JSON files in ${dir}`);
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    return JSON.parse(raw) as T;
  });
}

// ─── Types for local data ──────────────────────────────────────────────

// The scenario JSON file IS the scenarioData itself (contains id, name, platform, events, etc.)
interface LocalScenario {
  id: string;
  name: string;
  description?: string;
  platform?: string;
  events?: any[];
  tags?: string[];
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
  tcId?: string;
  version?: number;
  [key: string]: any;
}

interface LocalGroup {
  id: string;
  name: string;
  mode?: string;
  scenarioIds?: string[];
  options?: Record<string, any>;
  [key: string]: any;
}

interface LocalStream {
  id: string;
  name: string;
  mode?: string;
  description?: string;
  enabled?: number | boolean;
}

interface LocalStreamItem {
  id: string;
  stream_id: string;
  type: string;
  ref_id: string;
  order_no: number;
}

interface LocalSchedule {
  id: string;
  name: string;
  stream_id?: string;
  type: string;
  cron_expr?: string;
  timezone?: string;
  run_at?: number;
  delay_ms?: number;
  after_stream_id?: string;
  trigger_on?: string;
  overlap_policy?: string;
  misfire_policy?: string;
  target_platform?: string;
  headless?: number | boolean;
  options?: string;
  enabled?: number | boolean;
}

// ─── Idempotency check ────────────────────────────────────────────────

async function fetchExistingByName<T extends { name: string }>(
  apiUrl: string,
  urlPath: string,
): Promise<Map<string, T>> {
  const items = await apiRequest<T[]>(apiUrl, 'GET', urlPath);
  const map = new Map<string, T>();
  if (Array.isArray(items)) {
    for (const item of items) {
      map.set(item.name, item);
    }
  }
  return map;
}

// ─── Migration steps ──────────────────────────────────────────────────

async function migrateScenarios(apiUrl: string): Promise<Map<string, string>> {
  console.log('\n=== Migrating Scenarios ===');
  const oldToNew = new Map<string, string>();

  const localScenarios = readJsonFiles<LocalScenario>(SCENARIOS_DIR);
  if (!localScenarios.length) {
    console.log('  No scenarios to migrate.');
    return oldToNew;
  }

  // Fetch existing scenarios for idempotency
  const existing = await fetchExistingByName<any>(apiUrl, '/scenarios');

  for (const sc of localScenarios) {
    const existingScenario = existing.get(sc.name);
    if (existingScenario) {
      console.log(`  [skip] Scenario "${sc.name}" already exists (id=${existingScenario.id})`);
      oldToNew.set(sc.id, existingScenario.id);
      continue;
    }

    try {
      // The file itself IS the scenarioData — pass the entire object
      const created = await apiRequest<any>(apiUrl, 'POST', '/scenarios', {
        name: sc.name,
        description: sc.description || '',
        platform: sc.platform || 'web',
        scenarioData: sc,
        tags: sc.tags || [],
      });
      oldToNew.set(sc.id, created.id);
      console.log(`  [ok] Scenario "${sc.name}" -> ${created.id}`);
    } catch (err: any) {
      console.error(`  [error] Scenario "${sc.name}": ${err.message}`);
    }
  }

  console.log(`  Migrated ${oldToNew.size}/${localScenarios.length} scenarios.`);
  return oldToNew;
}

async function migrateGroups(
  apiUrl: string,
  scenarioIdMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('\n=== Migrating Groups ===');
  const oldToNew = new Map<string, string>();

  const localGroups = readJsonFiles<LocalGroup>(GROUPS_DIR);
  if (!localGroups.length) {
    console.log('  No groups to migrate.');
    return oldToNew;
  }

  const existing = await fetchExistingByName<any>(apiUrl, '/groups');

  for (const g of localGroups) {
    const existingGroup = existing.get(g.name);
    if (existingGroup) {
      console.log(`  [skip] Group "${g.name}" already exists (id=${existingGroup.id})`);
      oldToNew.set(g.id, existingGroup.id);
      continue;
    }

    // Map old scenario IDs to new ones
    const mappedScenarioIds = (g.scenarioIds || [])
      .map((oldId) => scenarioIdMap.get(oldId))
      .filter(Boolean) as string[];

    const unmapped = (g.scenarioIds || []).filter((oldId) => !scenarioIdMap.has(oldId));
    if (unmapped.length) {
      console.warn(
        `  [warn] Group "${g.name}": ${unmapped.length} scenario IDs could not be mapped: ${unmapped.join(', ')}`,
      );
    }

    try {
      const created = await apiRequest<any>(apiUrl, 'POST', '/groups', {
        name: g.name,
        mode: g.mode || 'chain',
        scenarioIds: mappedScenarioIds,
        options: g.options || {},
      });
      oldToNew.set(g.id, created.id);
      console.log(`  [ok] Group "${g.name}" -> ${created.id}`);
    } catch (err: any) {
      console.error(`  [error] Group "${g.name}": ${err.message}`);
    }
  }

  console.log(`  Migrated ${oldToNew.size}/${localGroups.length} groups.`);
  return oldToNew;
}

async function migrateStreams(
  apiUrl: string,
  scenarioIdMap: Map<string, string>,
  groupIdMap: Map<string, string>,
  db: Database.Database,
): Promise<Map<string, string>> {
  console.log('\n=== Migrating Streams ===');
  const oldToNew = new Map<string, string>();

  let localStreams: LocalStream[] = [];
  try {
    localStreams = db.prepare('SELECT * FROM streams').all() as LocalStream[];
  } catch {
    console.warn('  [warn] Could not read streams table from SQLite.');
    return oldToNew;
  }

  if (!localStreams.length) {
    console.log('  No streams to migrate.');
    return oldToNew;
  }
  console.log(`  Found ${localStreams.length} streams in SQLite.`);

  const existing = await fetchExistingByName<any>(apiUrl, '/streams');

  for (const s of localStreams) {
    const existingStream = existing.get(s.name);
    if (existingStream) {
      console.log(`  [skip] Stream "${s.name}" already exists (id=${existingStream.id})`);
      oldToNew.set(s.id, existingStream.id);
      continue;
    }

    // Read stream items for this stream
    let localItems: LocalStreamItem[] = [];
    try {
      localItems = db
        .prepare('SELECT * FROM stream_items WHERE stream_id = ? ORDER BY order_no ASC')
        .all(s.id) as LocalStreamItem[];
    } catch {
      console.warn(`  [warn] Could not read stream_items for stream "${s.name}".`);
    }

    // Map item refIds to new IDs
    const mappedItems = localItems
      .map((item) => {
        let newRefId: string | undefined;
        if (item.type === 'SCENARIO') {
          newRefId = scenarioIdMap.get(item.ref_id);
        } else if (item.type === 'GROUP') {
          newRefId = groupIdMap.get(item.ref_id);
        }
        if (!newRefId) {
          console.warn(
            `  [warn] Stream "${s.name}": could not map ${item.type} ref_id=${item.ref_id}`,
          );
          return null;
        }
        return { type: item.type, refId: newRefId };
      })
      .filter(Boolean) as { type: string; refId: string }[];

    try {
      const created = await apiRequest<any>(apiUrl, 'POST', '/streams', {
        name: s.name,
        mode: s.mode || 'AUTO',
        description: s.description || '',
        items: mappedItems,
      });
      oldToNew.set(s.id, created.id);
      console.log(
        `  [ok] Stream "${s.name}" -> ${created.id} (${mappedItems.length} items)`,
      );
    } catch (err: any) {
      console.error(`  [error] Stream "${s.name}": ${err.message}`);
    }
  }

  console.log(`  Migrated ${oldToNew.size}/${localStreams.length} streams.`);
  return oldToNew;
}

async function migrateSchedules(
  apiUrl: string,
  streamIdMap: Map<string, string>,
  db: Database.Database,
): Promise<void> {
  console.log('\n=== Migrating Schedules ===');

  let localSchedules: LocalSchedule[] = [];
  try {
    localSchedules = db.prepare('SELECT * FROM schedules').all() as LocalSchedule[];
  } catch {
    console.warn('  [warn] Could not read schedules table from SQLite.');
    return;
  }

  if (!localSchedules.length) {
    console.log('  No schedules to migrate.');
    return;
  }
  console.log(`  Found ${localSchedules.length} schedules in SQLite.`);

  const existing = await fetchExistingByName<any>(apiUrl, '/schedules');

  let migrated = 0;
  for (const sch of localSchedules) {
    const existingSchedule = existing.get(sch.name);
    if (existingSchedule) {
      console.log(`  [skip] Schedule "${sch.name}" already exists (id=${existingSchedule.id})`);
      migrated++;
      continue;
    }

    // Map stream references to new IDs
    const newStreamId = sch.stream_id ? streamIdMap.get(sch.stream_id) : undefined;
    const newAfterStreamId = sch.after_stream_id
      ? streamIdMap.get(sch.after_stream_id)
      : undefined;

    if (sch.stream_id && !newStreamId) {
      console.warn(
        `  [warn] Schedule "${sch.name}": could not map stream_id=${sch.stream_id}`,
      );
    }
    if (sch.after_stream_id && !newAfterStreamId) {
      console.warn(
        `  [warn] Schedule "${sch.name}": could not map after_stream_id=${sch.after_stream_id}`,
      );
    }

    // Parse options if stored as JSON string
    let options: Record<string, any> = {};
    if (sch.options) {
      try {
        options = typeof sch.options === 'string' ? JSON.parse(sch.options) : sch.options;
      } catch {
        // ignore
      }
    }

    try {
      const payload: Record<string, any> = {
        name: sch.name,
        type: sch.type || 'CRON',
        enabled: sch.enabled === 1 || sch.enabled === true,
      };
      if (newStreamId) payload.streamId = newStreamId;
      if (sch.cron_expr) payload.cronExpr = sch.cron_expr;
      if (sch.timezone) payload.timezone = sch.timezone;
      if (sch.run_at) payload.runAt = sch.run_at;
      if (sch.delay_ms) payload.delayMs = sch.delay_ms;
      if (newAfterStreamId) payload.afterStreamId = newAfterStreamId;
      if (sch.trigger_on) payload.triggerOn = sch.trigger_on;
      if (sch.overlap_policy) payload.overlapPolicy = sch.overlap_policy;
      if (sch.misfire_policy) payload.misfirePolicy = sch.misfire_policy;
      if (sch.target_platform) payload.targetPlatform = sch.target_platform;
      if (sch.headless !== undefined) payload.headless = sch.headless === 1 || sch.headless === true;
      if (Object.keys(options).length) payload.options = options;

      const created = await apiRequest<any>(apiUrl, 'POST', '/schedules', payload);
      console.log(`  [ok] Schedule "${sch.name}" -> ${created.id}`);
      migrated++;
    } catch (err: any) {
      console.error(`  [error] Schedule "${sch.name}": ${err.message}`);
    }
  }

  console.log(`  Migrated ${migrated}/${localSchedules.length} schedules.`);
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const { apiUrl, email, password } = parseArgs();

  // 1. Authenticate
  AUTH_TOKEN = await signIn(apiUrl, email, password);

  // 2. Open SQLite
  let db: Database.Database;
  if (fs.existsSync(SQLITE_PATH)) {
    console.log(`\n[db] Opening SQLite: ${SQLITE_PATH}`);
    db = new Database(SQLITE_PATH, { readonly: true });
  } else {
    console.warn(`\n[db] SQLite not found at ${SQLITE_PATH}; streams/schedules will be skipped.`);
    db = null as any;
  }

  try {
    // 3. Scenarios (files)
    const scenarioIdMap = await migrateScenarios(apiUrl);

    // 4. Groups (files)
    const groupIdMap = await migrateGroups(apiUrl, scenarioIdMap);

    // 5. Streams (SQLite) — create API supports items in payload
    let streamIdMap = new Map<string, string>();
    if (db) {
      streamIdMap = await migrateStreams(apiUrl, scenarioIdMap, groupIdMap, db);
    }

    // 6. Schedules (SQLite)
    if (db) {
      await migrateSchedules(apiUrl, streamIdMap, db);
    }

    console.log('\n=== Migration Complete ===\n');
  } finally {
    if (db) db.close();
  }
}

main().catch((err) => {
  console.error('\n[fatal]', err);
  process.exit(1);
});
