// Tests for the v8.1.0 streaming-provider routes (/providers,
// /providers/regions) in worker/worker.js.
//
// Same approach as tests/worker-routes.test.mjs: import the Worker module
// directly and call `worker.fetch(new Request(...), env)` with in-memory KV
// fakes. `globalThis.fetch` is stubbed per test so no TMDB call leaves the
// process, and restored in t.after so a failure can't leak the stub into
// another suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/worker.js';

const SECRET = 'test-shared-secret';
const BASE = 'https://worker.test';

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

function makeEnv(config = {}) {
  return {
    CONFIG: memKV({ secret: SECRET, tmdb_token: 'tmdb-test-token', ...config }),
    EVENTS: memKV(),
    VIEWED: memKV(),
    METADATA: memKV(),
    PROMOTIONS: memKV(),
    SYNC_KV: memKV(),
    ALERTS: memKV(),
    USERS: memKV(),
  };
}

async function call(env, path, init = {}) {
  const resp = await worker.fetch(new Request(BASE + path, init), env);
  const text = await resp.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: resp.status, body };
}

function jsonOk(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// TMDB's provider lists overlap heavily between movie and tv — Netflix
// appears in both, so the union has to de-duplicate it.
const MOVIE_PROVIDERS = {
  results: [
    {
      provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg',
      display_priority: 5, display_priorities: { US: 0, GB: 3 },
    },
    { provider_id: 15, provider_name: 'Hulu', logo_path: '/hulu.jpg', display_priority: 2 },
  ],
};
const TV_PROVIDERS = {
  results: [
    {
      provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg',
      display_priority: 5, display_priorities: { US: 0, GB: 3 },
    },
    { provider_id: 9, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg', display_priority: 2 },
    // No display_priority at all → falls back to 999 and sorts last.
    { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/disney.jpg' },
  ],
};

const REGIONS_RESPONSE = {
  results: [
    { iso_3166_1: 'US', english_name: 'United States of America', native_name: 'United States' },
    { iso_3166_1: 'CA', english_name: 'Canada', native_name: 'Canada' },
    { iso_3166_1: 'GB', english_name: 'United Kingdom', native_name: 'United Kingdom' },
  ],
};

// Installs a fetch stub that answers the TMDB provider endpoints and
// records every request. Returns the call log.
function stubTmdb(t, { movie = MOVIE_PROVIDERS, tv = TV_PROVIDERS, regions = REGIONS_RESPONSE, status = 200 } = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: (init && init.headers) || {} });
    if (status !== 200) return new Response('nope', { status });
    if (url.includes('/watch/providers/regions')) return jsonOk(regions);
    if (url.includes('/watch/providers/movie')) return jsonOk(movie);
    if (url.includes('/watch/providers/tv')) return jsonOk(tv);
    throw new Error('unexpected fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

test('GET /providers unions movie+tv, de-dupes, and sorts by regional priority', async (t) => {
  const calls = stubTmdb(t);
  const env = makeEnv();
  const r = await call(env, `/providers?secret=${SECRET}&region=US`);

  assert.equal(r.status, 200);
  assert.equal(r.body.region, 'US');
  assert.equal(r.body.cached, false);
  assert.ok(typeof r.body.cachedAt === 'number');
  assert.deepEqual(r.body.providers, [
    // display_priorities.US (0) wins over the global display_priority (5)
    { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 0 },
    // priority tie at 2 → name order
    { provider_id: 9, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg', display_priority: 2 },
    { provider_id: 15, provider_name: 'Hulu', logo_path: '/hulu.jpg', display_priority: 2 },
    // no priority of any kind → 999
    { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/disney.jpg', display_priority: 999 },
  ]);

  // One movie + one tv call, both with the TMDB bearer token.
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.headers.Authorization === 'Bearer tmdb-test-token'));
  assert.ok(calls.some(c => c.url.endsWith('/watch/providers/movie?watch_region=US')));
  assert.ok(calls.some(c => c.url.endsWith('/watch/providers/tv?watch_region=US')));
});

test('GET /providers serves the second call from the METADATA cache', async (t) => {
  const calls = stubTmdb(t);
  const env = makeEnv();

  const first = await call(env, `/providers?secret=${SECRET}&region=US`);
  assert.equal(first.body.cached, false);
  assert.equal(calls.length, 2);  // one movie + one tv fetch

  const second = await call(env, `/providers?secret=${SECRET}&region=US`);
  assert.equal(second.body.cached, true);
  assert.equal(calls.length, 2, 'cache hit must not re-fetch TMDB');
  assert.deepEqual(second.body.providers, first.body.providers);
  assert.equal(second.body.cachedAt, first.body.cachedAt);
  assert.ok(await env.METADATA.get('providers:US'));
});

test('GET /providers normalizes a lowercase region', async (t) => {
  const calls = stubTmdb(t);
  const env = makeEnv();
  const r = await call(env, `/providers?secret=${SECRET}&region=gb`);

  assert.equal(r.status, 200);
  assert.equal(r.body.region, 'GB');
  assert.ok(calls.every(c => c.url.includes('watch_region=GB')));
  // GB priority for Netflix is 3, so Amazon/Hulu (2) sort ahead of it.
  assert.deepEqual(r.body.providers.map(p => p.provider_id), [9, 15, 8, 337]);
  assert.ok(await env.METADATA.get('providers:GB'));
});

test('GET /providers defaults to US when no region is given', async (t) => {
  const calls = stubTmdb(t);
  const r = await call(makeEnv(), `/providers?secret=${SECRET}`);
  assert.equal(r.body.region, 'US');
  assert.ok(calls.every(c => c.url.includes('watch_region=US')));
});

test('GET /providers rejects a malformed region with 400 and never calls TMDB', async (t) => {
  const calls = stubTmdb(t);
  for (const bad of ['USA', 'U', 'U1', '12', '']) {
    const r = await call(makeEnv(), `/providers?secret=${SECRET}&region=${encodeURIComponent(bad)}`);
    if (bad === '') {
      // empty → default US, which is valid
      assert.equal(r.status, 200, 'empty region falls back to US');
      continue;
    }
    assert.equal(r.status, 400, `region=${bad}`);
    assert.ok(/Invalid region/.test(r.body.error), `region=${bad}`);
  }
  assert.equal(calls.length, 2, 'only the valid default-US request should reach TMDB');
});

test('provider routes 403 without the shared secret', async (t) => {
  const calls = stubTmdb(t);
  const env = makeEnv();
  const noSecret = await call(env, '/providers?region=US');
  const wrongSecret = await call(env, '/providers?secret=nope&region=US');
  const regions = await call(env, '/providers/regions');

  assert.equal(noSecret.status, 403);
  assert.equal(wrongSecret.status, 403);
  assert.equal(regions.status, 403);
  assert.equal(calls.length, 0);
});

test('provider routes 400 when tmdb_token is not configured', async (t) => {
  const calls = stubTmdb(t);
  const env = makeEnv();
  await env.CONFIG.delete('tmdb_token');

  const providers = await call(env, `/providers?secret=${SECRET}&region=US`);
  const regions = await call(env, `/providers/regions?secret=${SECRET}`);

  assert.equal(providers.status, 400);
  assert.deepEqual(providers.body, { error: 'TMDB token not configured' });
  assert.equal(regions.status, 400);
  assert.deepEqual(regions.body, { error: 'TMDB token not configured' });
  assert.equal(calls.length, 0);
});

test('GET /providers returns 502 when TMDB fails', async (t) => {
  stubTmdb(t, { status: 500 });
  const r = await call(makeEnv(), `/providers?secret=${SECRET}&region=US`);
  assert.equal(r.status, 502);
  assert.ok(/TMDB providers 500/.test(r.body.error));
});

test('GET /providers/regions returns {code,name} sorted by name, then caches', async (t) => {
  const calls = stubTmdb(t);
  const env = makeEnv();

  const first = await call(env, `/providers/regions?secret=${SECRET}`);
  assert.equal(first.status, 200);
  assert.equal(first.body.cached, false);
  assert.deepEqual(first.body.regions, [
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States of America' },
  ]);
  assert.equal(calls.length, 1);

  const second = await call(env, `/providers/regions?secret=${SECRET}`);
  assert.equal(second.body.cached, true);
  assert.equal(calls.length, 1, 'cache hit must not re-fetch TMDB');
  assert.ok(await env.METADATA.get('providers:regions'));
});
