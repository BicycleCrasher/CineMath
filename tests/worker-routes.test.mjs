// Route-table parity suite for worker/worker.js.
//
// Approach (documented per the refactor brief): the worker is an ES
// module with `export default { fetch }` and only uses Web-platform
// APIs that Node 22 ships natively (Request/Response/FormData,
// crypto.subtle, TransformStream), so we import the module directly
// and call `worker.fetch(new Request(...), mockEnv)` — no wrangler
// child process needed. KV namespaces are in-memory fakes; D1 is left
// unbound and the scenarios stick to routes that tolerate that
// (matching a fresh deployment with no D1 binding).
//
// Parity proof: every scenario also runs against the PRE-refactor
// worker (`git show 542bd83:worker/worker.js`, written to a temp file
// and imported) and the {status, content-type, body} triples are
// deep-compared after normalizing volatile fields (timestamps, random
// ids). Scenarios exercising the NEW `Authorization: Bearer <secret>`
// transport are marked parity:false and instead assert the expected
// differential: old worker 403s, new worker accepts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_SHA = '542bd83';
const SECRET = 'test-shared-secret';
const BASE = 'https://worker.test';
const USER_HASH = 'abcdef1234567890';

// ── In-memory KV fake (subset the worker uses) ──────────────────────
function memKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = store.has(key) ? store.get(key) : null;
      if (v == null) return null;
      if (opts === 'json' || (opts && opts.type === 'json')) {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v;
    },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    async list(opts = {}) {
      const prefix = opts.prefix || '';
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort()
        .map(name => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
    _store: store,
  };
}

function makeEnv() {
  return {
    CONFIG: memKV({ secret: SECRET }),
    EVENTS: memKV(),
    VIEWED: memKV(),
    METADATA: memKV(),
    PROMOTIONS: memKV(),
    SYNC_KV: memKV(),
    ALERTS: memKV(),
    USERS: memKV(),
    // D1_VIEWED deliberately unbound — scenarios use routes that
    // tolerate a missing D1 binding.
  };
}

// ── request helper ──────────────────────────────────────────────────
async function call(worker, env, path, init = {}) {
  const req = new Request(BASE + path, init);
  const resp = await worker.fetch(req, env);
  const text = await resp.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return {
    status: resp.status,
    contentType: resp.headers.get('Content-Type'),
    body: normalize(body),
  };
}

// Replace volatile values (timestamps, random ids) so old/new runs of
// the same scenario compare equal.
const VOLATILE_KEYS = new Set(['ts', 'createdAt', 'cachedAt', 'ranAt', 'expiresAt', 'subscribedAt', 'id', 'watchedTs']);
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = VOLATILE_KEYS.has(k) ? '<volatile>' : normalize(val);
    }
    return out;
  }
  if (typeof v === 'string' && /^evt_\d+_/.test(v)) return '<volatile>';
  return v;
}

function jsonReq(method, obj, headers = {}) {
  return { method, body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json', ...headers } };
}

function webhookForm(payload) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  return fd;
}

async function sha256Hex(str) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── scenarios ───────────────────────────────────────────────────────
// Each returns an array of normalized results. `expect(results)` runs
// assertions against the CURRENT worker; parity scenarios additionally
// deep-compare old-vs-new result arrays. `expectOld` (optional) runs
// against the baseline for differential (non-parity) scenarios.
const SCENARIOS = [
  {
    name: 'GET / health check', parity: true,
    async run(w) { return [await call(w, makeEnv(), '/')]; },
    expect(r) {
      assert.equal(r[0].status, 200);
      assert.match(r[0].body, /bridge online/);
    },
  },
  {
    name: 'OPTIONS preflight returns 204', parity: true,
    async run(w) { return [await call(w, makeEnv(), '/events', { method: 'OPTIONS' })]; },
    expect(r) { assert.equal(r[0].status, 204); },
  },
  {
    name: 'unknown path returns 404', parity: true,
    async run(w) { return [await call(w, makeEnv(), '/definitely-not-a-route')]; },
    expect(r) { assert.equal(r[0].status, 404); assert.equal(r[0].body, 'Not found'); },
  },
  {
    name: 'GET /events auth failures (missing + wrong query secret)', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, '/events'),
        await call(w, env, '/events?secret=wrong'),
      ];
    },
    expect(r) {
      assert.equal(r[0].status, 403); assert.equal(r[0].body, 'Forbidden');
      assert.equal(r[1].status, 403); assert.equal(r[1].body, 'Forbidden');
    },
  },
  {
    name: 'GET /events with valid query secret', parity: true,
    async run(w) { return [await call(w, makeEnv(), `/events?secret=${SECRET}`)]; },
    expect(r) { assert.equal(r[0].status, 200); assert.deepEqual(r[0].body, { events: [] }); },
  },
  {
    name: 'GET /events with wrong Bearer secret still 403', parity: true,
    async run(w) {
      return [await call(w, makeEnv(), '/events', { headers: { Authorization: 'Bearer nope' } })];
    },
    expect(r) { assert.equal(r[0].status, 403); assert.equal(r[0].body, 'Forbidden'); },
  },
  {
    name: 'NEW: GET /events with Bearer shared secret', parity: false,
    async run(w) {
      return [await call(w, makeEnv(), '/events', { headers: { Authorization: `Bearer ${SECRET}` } })];
    },
    expect(r) { assert.equal(r[0].status, 200); assert.deepEqual(r[0].body, { events: [] }); },
    expectOld(r) { assert.equal(r[0].status, 403); },
  },
  {
    name: 'POST /events/ack body-secret happy path + wrong secret + bad JSON', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, '/events/ack', jsonReq('POST', { secret: SECRET, eventIds: ['a', 'b'] })),
        await call(w, env, '/events/ack', jsonReq('POST', { secret: 'wrong', eventIds: [] })),
        await call(w, env, '/events/ack', { method: 'POST', body: 'not-json{{' }),
      ];
    },
    expect(r) {
      assert.deepEqual(r[0].body, { deleted: 2 });
      assert.equal(r[1].status, 403);
      assert.equal(r[2].status, 400);
      assert.match(r[2].body, /^Bad request: /);
    },
  },
  {
    name: 'NEW: POST /events/ack with Bearer secret, no body.secret', parity: false,
    async run(w) {
      return [await call(w, makeEnv(), '/events/ack',
        jsonReq('POST', { eventIds: [] }, { Authorization: `Bearer ${SECRET}` }))];
    },
    expect(r) { assert.equal(r[0].status, 200); assert.deepEqual(r[0].body, { deleted: 0 }); },
    expectOld(r) { assert.equal(r[0].status, 403); },
  },
  {
    name: 'GET /metadata/lookup validation after auth', parity: true,
    async run(w) { return [await call(w, makeEnv(), `/metadata/lookup?secret=${SECRET}`)]; },
    expect(r) { assert.equal(r[0].status, 400); assert.equal(r[0].body, 'Missing title or tmdbId'); },
  },
  {
    name: 'promotions add → list → delete → list round trip', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, '/promotions/add', jsonReq('POST', { secret: SECRET, tab: 'films', item: { id: 'f1', title: 'Stalker' } })),
        await call(w, env, `/promotions?secret=${SECRET}`),
        await call(w, env, `/promotions/films/f1?secret=${SECRET}`, { method: 'DELETE' }),
        await call(w, env, `/promotions?secret=${SECRET}`),
        await call(w, env, `/promotions/no-slash-here?secret=${SECRET}`, { method: 'DELETE' }),
      ];
    },
    expect(r) {
      assert.deepEqual(r[0].body, { ok: true, key: 'films|f1' });
      assert.equal(r[1].body.records.length, 1);
      assert.equal(r[1].body.records[0].tab, 'films');
      assert.deepEqual(r[2].body, { ok: true, deleted: 'films|f1' });
      assert.deepEqual(r[3].body, { records: [] });
      assert.equal(r[4].status, 400);
      assert.equal(r[4].body, 'Bad path');
    },
  },
  {
    name: 'POST /webhook/{secret}: wrong path secret, filtered library, whitelisted scrobble', parity: true,
    async run(w) {
      const env = makeEnv();
      const results = [
        await call(w, env, '/webhook/wrong-secret', { method: 'POST', body: webhookForm({ event: 'media.scrobble', Metadata: { librarySectionID: '1', title: 'X' } }) }),
        await call(w, env, `/webhook/${SECRET}`, { method: 'POST', body: webhookForm({ event: 'media.scrobble', Metadata: { librarySectionID: '9', title: 'Nope' } }) }),
        await call(w, env, `/webhook/${SECRET}`, { method: 'POST', body: webhookForm({ event: 'media.scrobble', Metadata: { librarySectionID: '1', title: 'Solaris', year: 1972, type: 'movie' } }) }),
      ];
      // The accepted scrobble must be visible via /events polling.
      results.push(await call(w, env, `/events?secret=${SECRET}&since=0`));
      return results;
    },
    expect(r) {
      assert.equal(r[0].status, 403);
      assert.equal(r[1].body, 'Filtered (library not whitelisted)');
      assert.equal(r[2].body, 'OK');
      assert.equal(r[3].body.events.length, 1);
      assert.equal(r[3].body.events[0].title, 'Solaris');
    },
  },
  {
    name: 'sync put/get round trip with legacy query secret', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, `/sync/put?secret=${SECRET}&user=${USER_HASH}`, { method: 'PUT', body: JSON.stringify({ hello: 'world' }) }),
        await call(w, env, `/sync/get?secret=${SECRET}&user=${USER_HASH}`),
        await call(w, env, `/sync/get?secret=${SECRET}&user=beefbeefbeefbeef`),
        await call(w, env, `/sync/get?secret=${SECRET}&user=ZZ`),
        await call(w, env, `/sync/put?secret=${SECRET}&user=${USER_HASH}`, { method: 'PUT', body: 'not json' }),
        await call(w, env, `/sync/get?secret=wrong&user=${USER_HASH}`),
      ];
    },
    expect(r) {
      assert.equal(r[0].body, 'ok');
      assert.deepEqual(r[1].body, { hello: 'world' });
      assert.equal(r[2].status, 404);
      assert.equal(r[3].status, 400); assert.equal(r[3].body, 'Bad user hash');
      assert.equal(r[4].status, 400); assert.equal(r[4].body, 'Invalid JSON');
      assert.equal(r[5].status, 403);
    },
  },
  {
    name: 'NEW: sync put with Bearer shared secret (legacy user-hash keying)', parity: false,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, `/sync/put?user=${USER_HASH}`, { method: 'PUT', body: JSON.stringify({ v: 1 }), headers: { Authorization: `Bearer ${SECRET}` } }),
        await call(w, env, `/sync/get?user=${USER_HASH}`, { headers: { Authorization: `Bearer ${SECRET}` } }),
      ];
    },
    expect(r) {
      assert.equal(r[0].body, 'ok');
      assert.deepEqual(r[1].body, { v: 1 });
    },
    expectOld(r) { assert.equal(r[0].status, 403); assert.equal(r[1].status, 403); },
  },
  {
    name: 'sync put/get via device bearer token (X-Device-Id path unchanged)', parity: true,
    async run(w) {
      const env = makeEnv();
      const token = 'device-token-123';
      await env.USERS.put('device:dev-1', JSON.stringify({
        userId: 'user-uuid-1', authTokenHash: await sha256Hex(token), lastSeen: Date.now(),
      }));
      const hdrs = { Authorization: `Bearer ${token}`, 'X-Device-Id': 'dev-1' };
      return [
        await call(w, env, '/sync/put', { method: 'PUT', body: JSON.stringify({ scoped: true }), headers: hdrs }),
        await call(w, env, '/sync/get', { headers: hdrs }),
        await call(w, env, '/sync/get', { headers: { Authorization: 'Bearer wrong-token', 'X-Device-Id': 'dev-1' } }),
      ];
    },
    expect(r) {
      assert.equal(r[0].body, 'ok');
      assert.deepEqual(r[1].body, { scoped: true });
      assert.equal(r[2].status, 403); // falls through to legacy path → Forbidden
    },
  },
  {
    name: 'alerts routes: status/subscribe/vapid validation', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, `/alerts/status?secret=${SECRET}`),
        await call(w, env, `/alerts/status?secret=${SECRET}&user=${USER_HASH}`),
        await call(w, env, '/alerts/subscribe', jsonReq('POST', { secret: SECRET, userHash: 'NOT-HEX' })),
        await call(w, env, '/alerts/subscribe', jsonReq('POST', { secret: SECRET, userHash: USER_HASH, region: 'us', items: [] })),
        await call(w, env, `/alerts/status?secret=${SECRET}&user=${USER_HASH}`),
        await call(w, env, '/alerts/vapid-public'),
        await call(w, env, '/alerts/unsubscribe', jsonReq('POST', { secret: SECRET, userHash: USER_HASH })),
      ];
    },
    expect(r) {
      assert.equal(r[0].status, 400); assert.equal(r[0].body, 'Missing user');
      assert.deepEqual(r[1].body, { enabled: false });
      assert.equal(r[2].status, 400); assert.equal(r[2].body, 'Bad user hash');
      assert.deepEqual(r[3].body, { ok: true, region: 'US', itemCount: 0, hasPush: false });
      assert.equal(r[4].body.enabled, true);
      assert.equal(r[5].status, 400); assert.deepEqual(r[5].body, { error: 'VAPID not configured' });
      assert.deepEqual(r[6].body, { ok: true });
    },
  },
  {
    name: 'bearer-only routes reject unauthenticated callers', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, '/user/me'),
        await call(w, env, `/user/me?secret=${SECRET}`), // legacy secret w/o admin singleton → still 401
        await call(w, env, '/admin/invites/create', { method: 'POST' }),
        await call(w, env, '/devices/some-id', { method: 'DELETE' }),
        await call(w, env, '/user/settings', jsonReq('PUT', {})),
      ];
    },
    expect(r) {
      for (const res of r) {
        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'unauthorized' });
      }
    },
  },
  {
    name: 'public identity routes validate input', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, '/register', jsonReq('POST', {})),
        await call(w, env, '/register', jsonReq('POST', { invite: 'nope' })),
        await call(w, env, '/pair/info'),
        await call(w, env, '/pair/info?session=missing'),
        await call(w, env, '/reconnect', jsonReq('POST', {})),
      ];
    },
    expect(r) {
      assert.equal(r[0].status, 400); assert.deepEqual(r[0].body, { error: 'invite required' });
      assert.equal(r[1].status, 404); assert.deepEqual(r[1].body, { error: 'invite not found or expired' });
      assert.equal(r[2].status, 400); assert.deepEqual(r[2].body, { error: 'session required' });
      assert.equal(r[3].status, 404);
      assert.equal(r[4].status, 400); assert.deepEqual(r[4].body, { error: 'reconnectCode required' });
    },
  },
  {
    name: 'GET /bootstrap/status with non-hex user id', parity: true,
    async run(w) { return [await call(w, makeEnv(), `/bootstrap/status?secret=${SECRET}&user=not-hex!`)]; },
    expect(r) { assert.deepEqual(r[0].body, { bootstrapped: false, plex: false, trakt: false }); },
  },
  {
    name: 'Trakt proxy: user validation + device-code-poll query-secret fallback', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, `/api/trakt/scrobble?secret=${SECRET}`, jsonReq('POST', { tmdbId: 1 })),
        await call(w, env, `/api/trakt/device-code-poll?secret=${SECRET}`, jsonReq('POST', {})),
        await call(w, env, '/api/trakt/device-code-poll', jsonReq('POST', { secret: 'wrong' })),
        await call(w, env, `/api/trakt/history?secret=wrong&user=${USER_HASH}`),
      ];
    },
    expect(r) {
      assert.equal(r[0].status, 400); assert.deepEqual(r[0].body, { error: 'user required' });
      assert.equal(r[1].status, 400); assert.deepEqual(r[1].body, { error: 'user (user_id) required' });
      assert.equal(r[2].status, 403);
      assert.equal(r[3].status, 403);
    },
  },
  {
    name: 'watch history routes: missing D1 + user validation', parity: true,
    async run(w) {
      const env = makeEnv();
      return [
        await call(w, env, `/api/watch/history?secret=${SECRET}&user=${USER_HASH}`),
        await call(w, env, `/api/watch/history?secret=${SECRET}`),
        await call(w, env, `/api/watch/mark?secret=${SECRET}`, jsonReq('POST', { tmdbId: 5 })),
      ];
    },
    expect(r) {
      assert.equal(r[0].status, 500); assert.deepEqual(r[0].body, { error: 'D1_VIEWED binding missing' });
      assert.equal(r[1].status, 400); assert.deepEqual(r[1].body, { error: 'user required' });
      assert.equal(r[2].status, 400); assert.deepEqual(r[2].body, { error: 'user required' });
    },
  },
  {
    name: 'GET /viewed/list falls back to KV without D1', parity: true,
    async run(w) {
      const env = makeEnv();
      await env.VIEWED.put('view:100_a', JSON.stringify({ id: 'a', title: 'Mirror', ts: 100 }));
      return [await call(w, env, `/viewed/list?secret=${SECRET}`)];
    },
    expect(r) {
      assert.equal(r[0].body.source, 'kv');
      assert.equal(r[0].body.records.length, 1);
      assert.equal(r[0].body.records[0].title, 'Mirror');
    },
  },
  {
    name: 'GET /palate/archived tolerates missing D1', parity: true,
    async run(w) { return [await call(w, makeEnv(), `/palate/archived?secret=${SECRET}`)]; },
    expect(r) { assert.deepEqual(r[0].body, { ids: [] }); },
  },
];

// ── load workers ────────────────────────────────────────────────────
const currentWorker = (await import(pathToFileURL(join(REPO_ROOT, 'worker', 'worker.js')).href)).default;

let baselineWorker = null;
let baselineLoadError = null;
try {
  const src = execFileSync('git', ['show', `${BASELINE_SHA}:worker/worker.js`], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const dir = mkdtempSync(join(tmpdir(), 'cinemath-worker-baseline-'));
  const file = join(dir, 'worker-baseline.mjs');
  writeFileSync(file, src);
  baselineWorker = (await import(pathToFileURL(file).href)).default;
} catch (e) {
  baselineLoadError = e;
}

// ── run ─────────────────────────────────────────────────────────────
test('refactored worker: route behavior', async (t) => {
  for (const s of SCENARIOS) {
    await t.test(s.name, async () => {
      const results = await s.run(currentWorker);
      s.expect(results);
    });
  }
});

test('parity against pre-refactor worker (542bd83)', { skip: baselineWorker ? false : `baseline unavailable: ${baselineLoadError?.message}` }, async (t) => {
  for (const s of SCENARIOS) {
    await t.test(s.name, async () => {
      const oldResults = await s.run(baselineWorker);
      if (s.parity) {
        const newResults = await s.run(currentWorker);
        assert.deepEqual(newResults, oldResults,
          'refactored worker must return byte-identical (normalized) responses');
      } else if (s.expectOld) {
        s.expectOld(oldResults);
      }
    });
  }
});
