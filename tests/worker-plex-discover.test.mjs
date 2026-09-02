// Tests for the v8.1.0 Plex Discover routes in worker/worker.js:
//   GET /plex/discover/whoami | search | metadata
//   GET /plex/watchlist, PUT /plex/watchlist/add | remove
//
// The Worker does the fetching; lib/plex-discover.js does the parsing, so
// these tests feed the Worker the raw Plex JSON shapes and assert on the
// composed response. `globalThis.fetch` is stubbed per test and restored in
// t.after.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/worker.js';

const SECRET = 'test-shared-secret';
const PLEX_TOKEN = 'plex-account-token';
const BASE = 'https://worker.test';
const DISCOVER = 'https://discover.provider.plex.tv';

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
    CONFIG: memKV({
      secret: SECRET,
      plex_url: 'https://plex.example.com',
      plex_token: PLEX_TOKEN,
      ...config,
    }),
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

function jsonOk(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// `routes` maps a substring of the request URL to a handler that gets
// (url, init, callIndexForThatRoute) and returns a Response.
function stubPlex(t, routes) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: (init && init.method) || 'GET', headers: (init && init.headers) || {} });
    for (const [needle, fn] of Object.entries(routes)) {
      if (url.includes(needle)) {
        const nth = calls.filter(c => c.url.includes(needle)).length - 1;
        return fn(url, init, nth);
      }
    }
    throw new Error('unexpected fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

async function sha256Hex(str) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── fixtures ────────────────────────────────────────────────────────
// Plex Discover search: the nested SearchResults[].SearchResult[].Metadata shape.
const SEARCH_JSON = {
  MediaContainer: {
    size: 2,
    SearchResults: [{
      id: 'external',
      SearchResult: [
        {
          score: 0.9,
          Metadata: {
            ratingKey: '5d776831', title: 'Heat', year: 1995, type: 'movie',
            thumb: '/library/metadata/5d776831/thumb',
            Guid: [{ id: 'tmdb://949' }, { id: 'imdb://tt0113277' }],
          },
        },
        {
          score: 0.4,
          Metadata: {
            ratingKey: '5d776999', title: 'Heat', year: 1986, type: 'movie',
            Guid: [{ id: 'tmdb://31411' }],
          },
        },
      ],
    }],
  },
};

const METADATA_JSON = {
  MediaContainer: {
    Metadata: [{
      ratingKey: '5d776831', title: 'Heat', year: 1995, type: 'movie',
      guid: 'plex://movie/5d776831',
      Guid: [{ id: 'tmdb://949' }, { id: 'imdb://tt0113277' }, { id: 'tvdb://0' }],
      Availability: [
        { platform: 'netflix', title: 'Netflix', url: 'https://www.netflix.com/title/886643', offerType: 'subscription', country: 'US' },
        { platform: 'appletv', title: 'Apple TV', url: 'http://insecure.example.com/x', offerType: 'buy', country: 'US' },
      ],
    }],
  },
};

function watchlistPage(items, totalSize) {
  return { MediaContainer: { size: items.length, totalSize, Metadata: items } };
}
const WL_ITEM_A = { ratingKey: '111', title: 'Sicario', year: 2015, type: 'movie', Guid: [{ id: 'tmdb://273481' }] };
const WL_ITEM_B = { ratingKey: '222', title: 'Severance', year: 2022, type: 'show', Guid: [{ id: 'tmdb://95396' }] };
const WL_ITEM_C = { ratingKey: '333', title: 'Dune', year: 2021, type: 'movie', Guid: [{ id: 'tmdb://438631' }] };

// ── tests ───────────────────────────────────────────────────────────

test('Plex Discover requests carry the token and a stable client identifier', async (t) => {
  const calls = stubPlex(t, {
    '/api/v2/user': () => jsonOk({ id: 42, username: 'lincoln', title: 'Lincoln' }),
  });
  const env = makeEnv();

  const first = await call(env, `/plex/discover/whoami?secret=${SECRET}`);
  const second = await call(env, `/plex/discover/whoami?secret=${SECRET}`);

  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { ok: true, username: 'lincoln', id: 42 });
  assert.deepEqual(second.body, first.body);

  const expectedClientId = 'cinemath-worker-' + (await sha256Hex(SECRET)).slice(0, 12);
  for (const c of calls) {
    assert.equal(c.headers['X-Plex-Token'], PLEX_TOKEN);
    assert.equal(c.headers['X-Plex-Client-Identifier'], expectedClientId);
    assert.equal(c.headers['X-Plex-Product'], 'CineMath');
    assert.equal(c.headers['X-Plex-Version'], '8.1.0');
    assert.equal(c.headers['X-Plex-Platform'], 'Web');
    assert.equal(c.headers.Accept, 'application/json');
  }
  assert.equal(calls[0].headers['X-Plex-Client-Identifier'], calls[1].headers['X-Plex-Client-Identifier']);
  assert.equal(calls[0].url, 'https://plex.tv/api/v2/user');
});

test('whoami prefers the PLEX_TOKEN secret over the CONFIG KV copy', async (t) => {
  const calls = stubPlex(t, { '/api/v2/user': () => jsonOk({ id: 1, username: 'x' }) });
  const env = makeEnv();
  env.PLEX_TOKEN = 'secret-vault-token';

  await call(env, `/plex/discover/whoami?secret=${SECRET}`);
  assert.equal(calls[0].headers['X-Plex-Token'], 'secret-vault-token');
});

test('whoami returns 502 when plex.tv rejects the token', async (t) => {
  stubPlex(t, { '/api/v2/user': () => new Response('unauthorized', { status: 401 }) });
  const r = await call(makeEnv(), `/plex/discover/whoami?secret=${SECRET}`);
  assert.equal(r.status, 502);
  assert.ok(/Plex user 401/.test(r.body.error));
});

test('search parses the SearchResults[].SearchResult[].Metadata shape and caches it', async (t) => {
  const calls = stubPlex(t, { '/library/search': () => jsonOk(SEARCH_JSON) });
  const env = makeEnv();

  const first = await call(env, `/plex/discover/search?secret=${SECRET}&query=Heat&type=movie&year=1995`);
  assert.equal(first.status, 200);
  assert.equal(first.body.cached, false);
  assert.equal(first.body.hits.length, 2);
  assert.deepEqual(first.body.hits[0], {
    ratingKey: '5d776831',
    title: 'Heat',
    year: 1995,
    type: 'movie',
    guids: { tmdb: 949, imdb: 'tt0113277', tvdb: null },
    thumb: '/library/metadata/5d776831/thumb',
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith(`${DISCOVER}/library/search?query=Heat`));
  assert.ok(calls[0].url.includes('searchTypes=movies'));
  assert.ok(calls[0].url.includes('includeMetadata=1'));
  assert.ok(calls[0].url.includes('limit=10'));

  // Same normalized title/year → cache hit, no second call.
  const second = await call(env, `/plex/discover/search?secret=${SECRET}&query=heat&type=movie&year=1995`);
  assert.equal(second.body.cached, true);
  assert.deepEqual(second.body.hits, first.body.hits);
  assert.equal(calls.length, 1, 'cache hit must not re-fetch Plex');
  assert.ok(await env.METADATA.get('plexsearch:movie:heat:1995'));

  // A different year is a different cache key.
  await call(env, `/plex/discover/search?secret=${SECRET}&query=Heat&type=movie&year=1986`);
  assert.equal(calls.length, 2);
});

test('search maps type=tv to searchTypes=tv and 400s on an empty query', async (t) => {
  const calls = stubPlex(t, { '/library/search': () => jsonOk(SEARCH_JSON) });
  const env = makeEnv();

  await call(env, `/plex/discover/search?secret=${SECRET}&query=Severance&type=tv`);
  assert.ok(calls[0].url.includes('searchTypes=tv'));

  const empty = await call(env, `/plex/discover/search?secret=${SECRET}&query=%20`);
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.body, { error: 'Missing query' });
  assert.equal(calls.length, 1, 'validation must run before the fetch');
});

test('metadata returns guids + availability and caches by ratingKey', async (t) => {
  const calls = stubPlex(t, { '/library/metadata/': () => jsonOk(METADATA_JSON) });
  const env = makeEnv();

  const r = await call(env, `/plex/discover/metadata?secret=${SECRET}&ratingKey=5d776831`);
  assert.equal(r.status, 200);
  assert.equal(r.body.ratingKey, '5d776831');
  assert.equal(r.body.title, 'Heat');
  assert.equal(r.body.year, 1995);
  assert.equal(r.body.type, 'movie');
  assert.deepEqual(r.body.guids, { tmdb: 949, imdb: 'tt0113277', tvdb: 0 });
  assert.deepEqual(r.body.availability, [
    { platform: 'netflix', title: 'Netflix', url: 'https://www.netflix.com/title/886643', offerType: 'subscription', country: 'us' },
    // non-https deep links are dropped to null by the parser
    { platform: 'appletv', title: 'Apple TV', url: null, offerType: 'buy', country: 'us' },
  ]);
  assert.equal(r.body._rawKeys, undefined, 'no _rawKeys without debug=1');
  assert.equal(calls[0].url, `${DISCOVER}/library/metadata/5d776831?includeAvailabilities=1`);

  const cachedHit = await call(env, `/plex/discover/metadata?secret=${SECRET}&ratingKey=5d776831`);
  assert.equal(cachedHit.body.cached, true);
  assert.equal(calls.length, 1, 'cache hit must not re-fetch Plex');
  assert.ok(await env.METADATA.get('plexmeta:5d776831'));
});

test('metadata debug=1 adds _rawKeys and bypasses the cache', async (t) => {
  const calls = stubPlex(t, { '/library/metadata/': () => jsonOk(METADATA_JSON) });
  const env = makeEnv();

  const first = await call(env, `/plex/discover/metadata?secret=${SECRET}&ratingKey=5d776831&debug=1`);
  assert.equal(first.status, 200);
  assert.ok(Array.isArray(first.body._rawKeys));
  assert.ok(first.body._rawKeys.includes('Availability'), '_rawKeys reports the raw Plex field names');
  assert.ok(first.body._rawKeys.includes('Guid'));
  assert.equal(first.body.cached, false);
  assert.equal(await env.METADATA.get('plexmeta:5d776831'), null, 'debug probe must not populate the cache');

  const second = await call(env, `/plex/discover/metadata?secret=${SECRET}&ratingKey=5d776831&debug=1`);
  assert.equal(second.body.cached, false);
  assert.equal(calls.length, 2, 'debug=1 always hits Plex');
});

test('metadata reports an empty availability list plus _rawKeys on an unknown shape', async (t) => {
  stubPlex(t, {
    '/library/metadata/': () => jsonOk({
      MediaContainer: { Metadata: [{ ratingKey: '9', title: 'X', type: 'movie', streamingServices: [{ platform: 'nope' }] }] },
    }),
  });
  const r = await call(makeEnv(), `/plex/discover/metadata?secret=${SECRET}&ratingKey=9&debug=1`);
  assert.deepEqual(r.body.availability, []);
  assert.ok(r.body._rawKeys.includes('streamingServices'), 'the probe surfaces the real field name');
});

test('metadata rejects a malformed ratingKey with 400 before fetching', async (t) => {
  const calls = stubPlex(t, { '/library/metadata/': () => jsonOk(METADATA_JSON) });
  const env = makeEnv();

  for (const bad of ['', '../secrets', '5d77/6831', 'abc def', 'key-with-dash']) {
    const r = await call(env, `/plex/discover/metadata?secret=${SECRET}&ratingKey=${encodeURIComponent(bad)}`);
    assert.equal(r.status, 400, `ratingKey=${bad}`);
    assert.deepEqual(r.body, { error: 'Invalid ratingKey' });
  }
  assert.equal(calls.length, 0);
});

test('watchlist paginates until totalSize is reached', async (t) => {
  const calls = stubPlex(t, {
    '/library/sections/watchlist/all': (url, init, nth) => (nth === 0
      ? jsonOk(watchlistPage([WL_ITEM_A, WL_ITEM_B], 3))
      : jsonOk(watchlistPage([WL_ITEM_C], 3))),
  });

  const r = await call(makeEnv(), `/plex/watchlist?secret=${SECRET}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.totalSize, 3);
  assert.deepEqual(r.body.items.map(i => i.ratingKey), ['111', '222', '333']);
  assert.deepEqual(r.body.items[1], {
    ratingKey: '222', title: 'Severance', year: 2022, type: 'show',
    guids: { tmdb: 95396, imdb: null, tvdb: null }, thumb: null,
  });

  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.ok(c.url.startsWith(`${DISCOVER}/library/sections/watchlist/all?`));
    assert.ok(c.url.includes('includeExternalMedia=1'));
    assert.ok(c.url.includes('includeGuids=1'));
    assert.equal(c.headers['X-Plex-Container-Size'], '100');
  }
  assert.equal(calls[0].headers['X-Plex-Container-Start'], '0');
  assert.equal(calls[1].headers['X-Plex-Container-Start'], '2');
});

test('watchlist stops on an empty page and is never cached', async (t) => {
  // Keyed off the container-start header rather than a call counter so
  // the second request below walks the same two pages again.
  const calls = stubPlex(t, {
    '/library/sections/watchlist/all': (url, init) => (init.headers['X-Plex-Container-Start'] === '0'
      // Plex under-reports totalSize sometimes; an empty page ends the walk.
      ? jsonOk(watchlistPage([WL_ITEM_A], 99))
      : jsonOk(watchlistPage([], 99))),
  });
  const env = makeEnv();

  const r = await call(env, `/plex/watchlist?secret=${SECRET}`);
  assert.equal(r.body.items.length, 1);
  assert.equal(calls.length, 2);
  assert.equal([...env.METADATA._store.keys()].length, 0, 'the watchlist must never be cached');

  await call(env, `/plex/watchlist?secret=${SECRET}`);
  assert.equal(calls.length, 4, 'every request re-reads Plex');
});

test('watchlist add/remove PUT the right action URL and pass Plex status through', async (t) => {
  const calls = stubPlex(t, {
    '/actions/addToWatchlist': () => new Response('', { status: 200 }),
    '/actions/removeFromWatchlist': () => new Response('nope', { status: 404 }),
  });
  const env = makeEnv();

  const added = await call(env, `/plex/watchlist/add?secret=${SECRET}&ratingKey=5d776831`, { method: 'PUT' });
  assert.equal(added.status, 200);
  assert.deepEqual(added.body, { ok: true, status: 200 });
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, `${DISCOVER}/actions/addToWatchlist?ratingKey=5d776831`);
  assert.equal(calls[0].headers['X-Plex-Token'], PLEX_TOKEN);

  const removed = await call(env, `/plex/watchlist/remove?secret=${SECRET}&ratingKey=5d776831`, { method: 'PUT' });
  assert.deepEqual(removed.body, { ok: false, status: 404 });
  assert.equal(calls[1].url, `${DISCOVER}/actions/removeFromWatchlist?ratingKey=5d776831`);
});

test('watchlist add rejects a malformed ratingKey with 400', async (t) => {
  const calls = stubPlex(t, { '/actions/': () => new Response('', { status: 200 }) });
  const r = await call(makeEnv(), `/plex/watchlist/add?secret=${SECRET}&ratingKey=../../evil`, { method: 'PUT' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'Invalid ratingKey' });
  assert.equal(calls.length, 0);
});

test('every Discover route 400s when no Plex token is configured', async (t) => {
  const calls = stubPlex(t, { 'plex': () => jsonOk({}) });
  const env = makeEnv();
  await env.CONFIG.delete('plex_token');

  const responses = [
    await call(env, `/plex/discover/whoami?secret=${SECRET}`),
    await call(env, `/plex/discover/search?secret=${SECRET}&query=Heat`),
    await call(env, `/plex/discover/metadata?secret=${SECRET}&ratingKey=5d776831`),
    await call(env, `/plex/watchlist?secret=${SECRET}`),
    await call(env, `/plex/watchlist/add?secret=${SECRET}&ratingKey=5d776831`, { method: 'PUT' }),
    await call(env, `/plex/watchlist/remove?secret=${SECRET}&ratingKey=5d776831`, { method: 'PUT' }),
  ];
  for (const r of responses) {
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'Plex not configured' });
  }
  assert.equal(calls.length, 0);
});

test('every Discover route 403s without the shared secret', async (t) => {
  const calls = stubPlex(t, { 'plex': () => jsonOk({}) });
  const env = makeEnv();

  const responses = [
    await call(env, '/plex/discover/whoami'),
    await call(env, '/plex/discover/search?query=Heat'),
    await call(env, '/plex/discover/metadata?ratingKey=5d776831'),
    await call(env, '/plex/watchlist'),
    await call(env, '/plex/watchlist/add?ratingKey=5d776831', { method: 'PUT' }),
    await call(env, '/plex/watchlist/remove?ratingKey=5d776831', { method: 'PUT' }),
  ];
  for (const r of responses) assert.equal(r.status, 403);
  assert.equal(calls.length, 0);
});

test('the shared secret is also accepted as a Bearer token on a PUT watchlist route', async (t) => {
  const calls = stubPlex(t, { '/actions/addToWatchlist': () => new Response('', { status: 200 }) });
  const r = await call(makeEnv(), '/plex/watchlist/add?ratingKey=5d776831', {
    method: 'PUT', headers: { Authorization: `Bearer ${SECRET}` },
  });
  assert.deepEqual(r.body, { ok: true, status: 200 });
  assert.equal(calls.length, 1);
});
