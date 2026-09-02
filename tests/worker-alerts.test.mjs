// Tests for the v8.1.0 alerts cron in worker/worker.js: multi-region
// snapshots, the v1 → v2 snapshot upgrade, and "now streaming" arrivals.
//
// The cron is driven through GET /cron/check-alerts?secret= (the same code
// path the scheduled handler runs). TMDB is stubbed via globalThis.fetch and
// restored in t.after; every item carries a tmdbId so tmdbLookup skips the
// search call and issues exactly one details request.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/worker.js';

const SECRET = 'test-shared-secret';
const BASE = 'https://worker.test';
const USER = 'abcdef1234567890';
const REF = 'films|m1';

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
    CONFIG: memKV({ secret: SECRET, tmdb_token: 'tmdb-test-token' }),
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

const P = {
  netflix: { provider_id: 8, provider_name: 'Netflix' },
  hulu: { provider_id: 15, provider_name: 'Hulu' },
  disney: { provider_id: 337, provider_name: 'Disney Plus' },
  tubi: { provider_id: 73, provider_name: 'Tubi' },
};

// One TMDB details response with whatever watch/providers map the test wants.
function stubTmdb(t, resultsByRegion) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/movie/949')) {
      return new Response(JSON.stringify({
        id: 949, title: 'Heat', release_date: '1995-12-15',
        'watch/providers': { results: resultsByRegion },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('unexpected fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

// The cron only fires for items still queued/watching in SYNC_KV.
function seedUser(env, sub) {
  env.SYNC_KV._store.set(`user:${USER}`, JSON.stringify({
    state: { films: { m1: { status: 'queued' } } },
  }));
  env.ALERTS._store.set(`sub:${USER}`, JSON.stringify({
    enabled: true,
    subscribedAt: Date.now(),
    items: [{ tabId: 'films', itemId: 'm1', title: 'Heat', year: 1995, type: 'movie', tmdbId: 949 }],
    push: null,
    ...sub,
  }));
}

async function notifications(env) {
  const list = await env.ALERTS.list({ prefix: `notif:${USER}:` });
  return Promise.all(list.keys.map(async k => JSON.parse(await env.ALERTS.get(k.name))));
}

async function snapshot(env) {
  return JSON.parse(await env.ALERTS.get(`snap:${USER}`));
}

// ── tests ───────────────────────────────────────────────────────────

test('a v1 snapshot still fires the leaving alert and is upgraded to v2', async (t) => {
  const env = makeEnv();
  stubTmdb(t, {
    US: { flatrate: [P.netflix] },              // Hulu dropped it
    GB: { flatrate: [P.netflix, P.disney] },
  });
  seedUser(env, { region: 'US', regions: ['US', 'GB'], providerIds: [8, 337] });
  // v1 snapshot: home-region flatrate provider NAMES, no version marker.
  env.ALERTS._store.set(`snap:${USER}`, JSON.stringify({
    [REF]: { providers: ['Hulu', 'Netflix'], ts: Date.now() - 86400000 },
  }));

  const r = await call(env, `/cron/check-alerts?secret=${SECRET}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.usersChecked, 1);
  assert.equal(r.body.notificationsQueued, 1);

  const notifs = await notifications(env);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].kind, 'leaving');
  assert.equal(notifs[0].title, 'Heat leaving Hulu');
  assert.ok(notifs[0].body.includes('no longer streaming on Hulu in US'));
  assert.equal(notifs[0].itemRef, REF);
  assert.equal(notifs[0].tabId, 'films');
  assert.equal(notifs[0].itemId, 'm1');

  // No arrivals off a v1 snapshot even though Disney Plus is enabled and
  // newly present in GB — the v1 record carries no per-region history.
  assert.ok(!notifs.some(n => n.kind === 'arrived'));

  const snap = await snapshot(env);
  assert.equal(snap[REF].v, 2);
  assert.deepEqual(snap[REF].byRegion, {
    US: { flatrate: [8], free: [], ads: [] },
    GB: { flatrate: [8, 337], free: [], ads: [] },
  });
  assert.deepEqual(snap[REF].names, { 8: 'Netflix', 337: 'Disney Plus' });
  assert.ok(typeof snap[REF].ts === 'number');
});

test('a v2 snapshot fires arrivals only for enabled providers in regions with prior data', async (t) => {
  const env = makeEnv();
  stubTmdb(t, {
    US: { flatrate: [P.netflix, P.disney] },   // Disney Plus is new + enabled
    GB: { flatrate: [P.hulu] },                // Hulu is new but NOT enabled
    CA: { flatrate: [P.disney] },              // enabled, but no prior CA data
  });
  seedUser(env, { region: 'US', regions: ['US', 'GB', 'CA'], providerIds: [8, 337] });
  env.ALERTS._store.set(`snap:${USER}`, JSON.stringify({
    [REF]: {
      v: 2,
      byRegion: {
        US: { flatrate: [8], free: [], ads: [] },
        GB: { flatrate: [], free: [], ads: [] },
        // CA deliberately absent — first time this region is watched.
      },
      names: { 8: 'Netflix' },
      ts: Date.now() - 86400000,
    },
  }));

  const r = await call(env, `/cron/check-alerts?secret=${SECRET}`);
  assert.equal(r.body.notificationsQueued, 1);

  const notifs = await notifications(env);
  assert.equal(notifs.length, 1);
  assert.deepEqual(
    {
      kind: notifs[0].kind, title: notifs[0].title, body: notifs[0].body,
      region: notifs[0].region, providerIds: notifs[0].providerIds,
      itemRef: notifs[0].itemRef, tabId: notifs[0].tabId, itemId: notifs[0].itemId,
    },
    {
      kind: 'arrived',
      title: 'Heat now on Disney Plus',
      body: 'Heat (1995) is now streaming on Disney Plus in US.',
      region: 'US',
      providerIds: [337],
      itemRef: REF,
      tabId: 'films',
      itemId: 'm1',
    });

  const snap = await snapshot(env);
  assert.deepEqual(snap[REF].byRegion.CA, { flatrate: [337], free: [], ads: [] });
});

test('arrivals count the free and ads tiers, not just flatrate', async (t) => {
  const env = makeEnv();
  stubTmdb(t, { US: { flatrate: [P.netflix], free: [P.tubi], ads: [P.tubi] } });
  seedUser(env, { region: 'US', providerIds: [73] });
  env.ALERTS._store.set(`snap:${USER}`, JSON.stringify({
    [REF]: { v: 2, byRegion: { US: { flatrate: [8], free: [], ads: [] } }, names: { 8: 'Netflix' }, ts: 1 },
  }));

  await call(env, `/cron/check-alerts?secret=${SECRET}`);
  const notifs = await notifications(env);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].kind, 'arrived');
  assert.deepEqual(notifs[0].providerIds, [73], 'a provider is announced once even when it appears in two tiers');
  assert.equal(notifs[0].title, 'Heat now on Tubi');

  const snap = await snapshot(env);
  assert.deepEqual(snap[REF].byRegion.US, { flatrate: [8], free: [73], ads: [73] });
});

test('the first run seeds the snapshot without sending anything', async (t) => {
  const env = makeEnv();
  stubTmdb(t, { US: { flatrate: [P.netflix, P.disney] }, GB: { flatrate: [P.disney] } });
  seedUser(env, { region: 'US', regions: ['US', 'GB'], providerIds: [8, 337] });

  const first = await call(env, `/cron/check-alerts?secret=${SECRET}`);
  assert.equal(first.body.usersChecked, 1);
  assert.equal(first.body.lookupsRun, 1);
  assert.equal(first.body.notificationsQueued, 0);
  assert.deepEqual(await notifications(env), []);

  const snap = await snapshot(env);
  assert.equal(snap[REF].v, 2);
  assert.deepEqual(snap[REF].byRegion.US, { flatrate: [8, 337], free: [], ads: [] });

  // Second run over unchanged data stays silent too.
  const second = await call(env, `/cron/check-alerts?secret=${SECRET}`);
  assert.equal(second.body.notificationsQueued, 0);
  assert.deepEqual(await notifications(env), []);
});

test('with no providerIds stored, arrivals never fire but leaving still does', async (t) => {
  const env = makeEnv();
  stubTmdb(t, { US: { flatrate: [P.disney] } });
  seedUser(env, { region: 'US' });  // pre-v8.1.0 subscription shape
  env.ALERTS._store.set(`snap:${USER}`, JSON.stringify({
    [REF]: { v: 2, byRegion: { US: { flatrate: [8], free: [], ads: [] } }, names: { 8: 'Netflix' }, ts: 1 },
  }));

  await call(env, `/cron/check-alerts?secret=${SECRET}`);
  const notifs = await notifications(env);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].kind, 'leaving');
  assert.equal(notifs[0].title, 'Heat leaving Netflix');
});

test('the home region is snapshotted even when it is missing from regions', async (t) => {
  const env = makeEnv();
  stubTmdb(t, { US: { flatrate: [P.netflix] }, GB: { flatrate: [P.hulu] } });
  seedUser(env, { region: 'US', regions: ['GB'], providerIds: [8] });

  await call(env, `/cron/check-alerts?secret=${SECRET}`);
  const snap = await snapshot(env);
  assert.deepEqual(Object.keys(snap[REF].byRegion).sort(), ['GB', 'US']);
});

test('items no longer queued or watching are skipped', async (t) => {
  const env = makeEnv();
  const calls = stubTmdb(t, { US: { flatrate: [] } });
  seedUser(env, { region: 'US', providerIds: [8] });
  env.SYNC_KV._store.set(`user:${USER}`, JSON.stringify({
    state: { films: { m1: { status: 'watched' } } },
  }));

  const r = await call(env, `/cron/check-alerts?secret=${SECRET}`);
  assert.equal(r.body.lookupsRun, 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(await snapshot(env), {});
});

test('POST /alerts/subscribe stores regions and providerIds, and validates both', async () => {
  const env = makeEnv();
  const post = (body) => call(env, '/alerts/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, userHash: USER, ...body }),
  });

  const r = await post({
    region: 'us',
    regions: ['us', 'GB', 'gb', 'BAD', '', 'CA', 'DE', 'FR', 'IT', 'ES', 'JP'],
    providerIds: [8, '337', 8, 'nope', 73],
    items: [],
  });
  assert.equal(r.status, 200);
  // Response shape is unchanged from v5.6 — clients parse it as-is.
  assert.deepEqual(r.body, { ok: true, region: 'US', itemCount: 0, hasPush: false });

  const stored = JSON.parse(await env.ALERTS.get(`sub:${USER}`));
  assert.deepEqual(stored.regions, ['US', 'GB', 'CA', 'DE', 'FR', 'IT'], 'uppercased, de-duped, invalid dropped, capped at 6');
  assert.deepEqual(stored.providerIds, [8, 337, 73], 'coerced to ints, de-duped, non-numeric dropped');

  // Absent/unusable fields leave the stored record in its pre-v8.1.0 shape.
  await post({ region: 'US', items: [], regions: ['BAD'], providerIds: ['x'] });
  const legacy = JSON.parse(await env.ALERTS.get(`sub:${USER}`));
  assert.ok(!('regions' in legacy));
  assert.ok(!('providerIds' in legacy));
});

test('GET /alerts/test-fire?kind=arrived returns an arrival-shaped notification', async () => {
  const env = makeEnv();
  seedUser(env, {
    region: 'US',
    regions: ['GB', 'US'],
    push: { endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } },
  });

  const arrived = await call(env, `/alerts/test-fire?secret=${SECRET}&user=${USER}&kind=arrived`);
  assert.equal(arrived.status, 200);
  assert.equal(arrived.body.kind, 'arrived');
  assert.equal(arrived.body.notification.kind, 'arrived');
  assert.equal(arrived.body.notification.region, 'GB', 'uses the first watched region');
  assert.ok(/now on/.test(arrived.body.notification.title));
  assert.ok(Array.isArray(arrived.body.notification.providerIds));
  // VAPID is not configured in the test env, so no push actually goes out.
  assert.equal(arrived.body.ok, false);

  const plain = await call(env, `/alerts/test-fire?secret=${SECRET}&user=${USER}`);
  assert.equal(plain.body.kind, 'test');
  assert.equal(plain.body.notification.kind, undefined);
  assert.equal(plain.body.notification.title, 'CinéMath test notification');
});
