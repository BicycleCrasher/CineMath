// Worker /state/* + /cron/migrate-state-to-d1 tests.
//
// Runtime note: wrangler's local runtime (workerd) can't start in every
// sandbox, so this suite runs the Worker module directly under Node 22:
//   - D1 is emulated with node:sqlite (real SQLite, so the
//     ON CONFLICT ... DO UPDATE ... WHERE excluded.last_updated >
//     item_state.last_updated semantics are exercised for real).
//   - KV namespaces are Map-backed mocks implementing get/put/list.
//   - worker/worker.js is ESM-syntax with a .js extension in a CJS
//     package, so we copy it to a temp .mjs before dynamic import.
// The schema applied is the actual migration file
// worker/migrations/004_item_state.sql — no duplicated DDL here.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret';
const HASH = 'a'.repeat(64); // fake SHA-256(plex_token) hex

// --- Minimal KV mock (get/put/list/delete, prefix listing) ---
function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, opts) {
      const v = store.has(key) ? store.get(key) : null;
      if (v == null) return null;
      if (opts && (opts === 'json' || opts.type === 'json')) {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v;
    },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).slice(0, limit)
        .map(name => ({ name }));
      return { keys, list_complete: true, cursor: null };
    },
  };
}

// --- D1 adapter over node:sqlite (prepare/bind/run/all/first + D1 shapes) ---
function makeD1(db) {
  return {
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a.map(v => v === undefined ? null : v); return api; },
        async run() {
          const r = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async all() {
          return { success: true, results: db.prepare(sql).all(...args) };
        },
        async first() {
          return db.prepare(sql).get(...args) ?? null;
        },
      };
      return api;
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}

let worker, env, db;

function req(path, init) {
  return new Request(`https://worker.test${path}`, init);
}

function seedBlob(items) {
  // Shape mirrors app.js syncPush(): { v, settings, state, pushedAt, ... }
  return JSON.stringify({
    v: 1,
    settings: { streamingRegion: 'US' },
    state: items,
    pushedAt: 1700000000000,
    pushedFrom: 'test',
    reason: 'test',
  });
}

before(async () => {
  // Import the worker (copy to .mjs so Node treats it as ESM).
  const tmp = mkdtempSync(join(tmpdir(), 'cinemath-worker-'));
  const mod = join(tmp, 'worker-under-test.mjs');
  copyFileSync(join(ROOT, 'worker', 'worker.js'), mod);
  worker = (await import(pathToFileURL(mod).href)).default;

  // Real SQLite with the real migration applied.
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(ROOT, 'worker', 'migrations', '004_item_state.sql'), 'utf8'));

  env = {
    CONFIG: makeKV({ secret: SECRET, rate_limit_per_minute: '0' }),
    SYNC_KV: makeKV({
      [`user:${HASH}`]: seedBlob({
        'scifi': {
          'blade-runner-1982': { status: 'watched', rating: 'loved', reactionTags: ['Hall of Fame'], notes: 'still holds up', lastUpdated: 1700000001000 },
          'arrival-2016': { status: 'queued', lastUpdated: 1700000002000 },
        },
        'british-comedy': {
          'detectorists-2014': { status: 'watching', notes: '', lastUpdated: 1700000003000 },
        },
      }),
    }),
    D1_VIEWED: null, // set below (needs db)
  };
  env.D1_VIEWED = makeD1(db);
});

function rowCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM item_state').get().n;
}
function getRow(id) {
  return db.prepare('SELECT * FROM item_state WHERE user_hash=? AND item_id=?').get(HASH, id);
}

test('migration endpoint requires the shared secret', async () => {
  const resp = await worker.fetch(req('/cron/migrate-state-to-d1?secret=wrong', { method: 'POST' }), env);
  assert.equal(resp.status, 403);
});

test('migrate-state-to-d1 backfills the SYNC_KV blob into item_state', async () => {
  const resp = await worker.fetch(req(`/cron/migrate-state-to-d1?secret=${SECRET}`, { method: 'POST' }), env);
  assert.equal(resp.status, 200);
  const summary = await resp.json();
  assert.equal(summary.blobs, 1);
  assert.equal(summary.itemsScanned, 3);
  assert.equal(summary.upserted, 3);
  assert.equal(summary.rowErrors, 0);
  assert.equal(rowCount(), 3);

  const br = getRow('blade-runner-1982');
  assert.equal(br.status, 'watched');
  assert.equal(br.rating, 'loved');
  assert.deepEqual(JSON.parse(br.reaction_tags), ['Hall of Fame']);
  assert.equal(br.notes, 'still holds up');
  assert.equal(br.last_updated, 1700000001000);
  assert.equal(br.source, 'kv-migration');
  assert.equal(br.tab, 'scifi');
});

test('migrate-state-to-d1 is idempotent: second run changes nothing', async () => {
  const beforeRows = db.prepare('SELECT item_id, last_updated, status FROM item_state ORDER BY item_id').all();
  const resp = await worker.fetch(req(`/cron/migrate-state-to-d1?secret=${SECRET}`, { method: 'POST' }), env);
  assert.equal(resp.status, 200);
  const summary = await resp.json();
  assert.equal(summary.itemsScanned, 3);
  assert.equal(summary.upserted, 0);       // every row skipped as stale
  assert.equal(summary.skippedStale, 3);
  assert.equal(rowCount(), 3);             // row count identical
  const afterRows = db.prepare('SELECT item_id, last_updated, status FROM item_state ORDER BY item_id').all();
  assert.deepEqual(afterRows, beforeRows); // byte-identical rows
});

test('migrate-state-to-d1 re-run applies only blob items newer than stored rows', async () => {
  // Bump one blob item to a newer lastUpdated with a changed status;
  // leave the others untouched (now stale vs. D1).
  const raw = await env.SYNC_KV.get(`user:${HASH}`);
  const blob = JSON.parse(raw);
  blob.state['scifi']['arrival-2016'] = { status: 'watched', rating: 'liked', lastUpdated: 1700000009000 };
  await env.SYNC_KV.put(`user:${HASH}`, JSON.stringify(blob));

  const resp = await worker.fetch(req(`/cron/migrate-state-to-d1?secret=${SECRET}`, { method: 'POST' }), env);
  const summary = await resp.json();
  assert.equal(summary.upserted, 1);
  assert.equal(summary.skippedStale, 2);
  assert.equal(rowCount(), 3);             // still no new rows

  const arrival = getRow('arrival-2016');
  assert.equal(arrival.status, 'watched');
  assert.equal(arrival.rating, 'liked');
  assert.equal(arrival.last_updated, 1700000009000);
});

test('POST /state/upsert: newer lastUpdated wins, stale write is skipped', async () => {
  // Newer write updates the row.
  let resp = await worker.fetch(req('/state/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: SECRET, userHash: HASH, source: 'app-test',
      items: [{
        itemId: 'blade-runner-1982', tab: 'scifi', title: 'Blade Runner', year: 1982,
        status: 'watched', rating: 'loved', reactionTags: ['Hall of Fame', 'Rewatch'],
        notes: 'directors cut', lastUpdated: 1700000010000,
      }],
    }),
  }), env);
  assert.equal(resp.status, 200);
  let body = await resp.json();
  assert.equal(body.upserted, 1);
  assert.equal(body.skippedStale, 0);
  let row = getRow('blade-runner-1982');
  assert.equal(row.notes, 'directors cut');
  assert.equal(row.title, 'Blade Runner');
  assert.equal(row.year, 1982);
  assert.equal(row.last_updated, 1700000010000);

  // Stale write (older lastUpdated) must NOT clobber.
  resp = await worker.fetch(req('/state/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: SECRET, userHash: HASH,
      items: [{ itemId: 'blade-runner-1982', tab: 'scifi', status: 'none', lastUpdated: 1699999999000 }],
    }),
  }), env);
  body = await resp.json();
  assert.equal(body.upserted, 0);
  assert.equal(body.skippedStale, 1);
  row = getRow('blade-runner-1982');
  assert.equal(row.status, 'watched');           // unchanged
  assert.equal(row.last_updated, 1700000010000); // unchanged
});

test('POST /state/upsert inserts brand-new rows and rejects bad input', async () => {
  const resp = await worker.fetch(req('/state/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret: SECRET, userHash: HASH,
      items: [
        { itemId: 'severance-2022', tab: 'scifi-tv', status: 'watching', lastUpdated: 1700000020000 },
        { tab: 'scifi-tv' }, // missing itemId → per-item error, not request failure
      ],
    }),
  }), env);
  const body = await resp.json();
  assert.equal(body.upserted, 1);
  assert.equal(body.errors, 1);
  assert.equal(rowCount(), 4);

  const forbidden = await worker.fetch(req('/state/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: 'wrong', userHash: HASH, items: [{ itemId: 'x', tab: 'y' }] }),
  }), env);
  assert.equal(forbidden.status, 403);

  const badHash = await worker.fetch(req('/state/upsert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, userHash: 'not-hex!', items: [{ itemId: 'x', tab: 'y' }] }),
  }), env);
  assert.equal(badHash.status, 400);
});

test('GET /state/tab returns only that tab, newest first', async () => {
  const resp = await worker.fetch(req(`/state/tab?secret=${SECRET}&user=${HASH}&tab=scifi`), env);
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.tab, 'scifi');
  assert.equal(body.items.length, 2);
  assert.deepEqual(body.items.map(i => i.item_id), ['blade-runner-1982', 'arrival-2016']); // 10000 > 9000
  const other = await worker.fetch(req(`/state/tab?secret=${SECRET}&user=${HASH}&tab=british-comedy`), env);
  assert.equal((await other.json()).items.length, 1);
});

test('GET /state/counts aggregates per tab and status', async () => {
  const resp = await worker.fetch(req(`/state/counts?secret=${SECRET}&user=${HASH}`), env);
  assert.equal(resp.status, 200);
  const body = await resp.json();
  assert.equal(body.total, 4);
  assert.equal(body.tabs['scifi'].watched, 2);
  assert.equal(body.tabs['scifi-tv'].watching, 1);
  assert.equal(body.tabs['british-comedy'].watching, 1);
});

test('GET /state/tab and /state/counts require secret + valid hash', async () => {
  assert.equal((await worker.fetch(req(`/state/tab?secret=wrong&user=${HASH}&tab=scifi`), env)).status, 403);
  assert.equal((await worker.fetch(req(`/state/tab?secret=${SECRET}&user=zz&tab=scifi`), env)).status, 400);
  assert.equal((await worker.fetch(req(`/state/tab?secret=${SECRET}&user=${HASH}`), env)).status, 400);
  assert.equal((await worker.fetch(req(`/state/counts?secret=wrong&user=${HASH}`), env)).status, 403);
});
