// Golden tests for lib/providers.js — the streaming provider registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROVIDERS,
  PROVIDER_BY_ID,
  KIND_ORDER,
  DEFAULT_SUB_IDS,
  matchTmdbProvider,
  providerIdForTmdb,
  matchPlexPlatform,
  resolveEnabled,
  isEnabledTmdb,
  providersForRegion,
  registryOrder,
  migrateLegacySubs,
  webSearchUrl,
} from '../lib/providers.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/providers-cases.json', import.meta.url), 'utf8'),
);

// --- registry invariants -------------------------------------------------

test('provider ids are unique and PROVIDER_BY_ID covers them', () => {
  const ids = PROVIDERS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate provider id');
  assert.equal(PROVIDER_BY_ID.size, PROVIDERS.length);
  for (const p of PROVIDERS) assert.equal(PROVIDER_BY_ID.get(p.id), p);
});

test('every entry has a sane kind, regions, names and home URL', () => {
  for (const p of PROVIDERS) {
    assert.ok(KIND_ORDER.includes(p.kind), `${p.id}: bad kind ${p.kind}`);
    assert.match(p.id, /^[a-z0-9][a-z0-9-]*$/, `${p.id}: bad id`);
    assert.ok(p.name && typeof p.name === 'string', `${p.id}: missing name`);
    assert.ok(Array.isArray(p.tmdbIds), `${p.id}: tmdbIds must be an array`);
    assert.ok(Array.isArray(p.tmdbNames) && p.tmdbNames.length, `${p.id}: needs tmdbNames`);
    assert.ok(Array.isArray(p.legacyNames), `${p.id}: legacyNames must be an array`);
    assert.ok(Array.isArray(p.plexPlatforms), `${p.id}: plexPlatforms must be an array`);
    if (p.regions !== 'global') {
      assert.ok(Array.isArray(p.regions) && p.regions.length, `${p.id}: bad regions`);
      for (const r of p.regions) assert.match(r, /^[A-Z]{2}$/, `${p.id}: bad region ${r}`);
    }
    assert.ok(p.web && typeof p.web.home === 'string', `${p.id}: missing web.home`);
    assert.match(p.web.home, /^https:\/\//, `${p.id}: web.home must be https`);
    if (p.web.search) {
      assert.match(p.web.search, /^https:\/\//, `${p.id}: web.search must be https`);
      assert.ok(p.web.search.includes('{q}'), `${p.id}: web.search needs a {q} slot`);
    }
  }
});

test('android package names look like real package names', () => {
  const PKG = /^[a-z][a-zA-Z0-9_.]+$/;
  for (const p of PROVIDERS) {
    if (!p.android) continue;
    for (const slot of ['tv', 'mobile']) {
      const pkg = p.android[slot];
      if (pkg === undefined) continue;
      assert.match(pkg, PKG, `${p.id}.android.${slot}`);
      assert.ok(pkg.includes('.'), `${p.id}.android.${slot} needs a dotted package`);
    }
  }
});

test('TMDB provider ids are numeric and claimed by exactly one entry', () => {
  const owner = new Map();
  for (const p of PROVIDERS) {
    for (const id of (p.tmdbIds || []).concat(p.storeTmdbIds || [])) {
      assert.equal(typeof id, 'number', `${p.id}: tmdb id must be numeric`);
      assert.ok(Number.isInteger(id) && id > 0, `${p.id}: bad tmdb id ${id}`);
      assert.ok(!owner.has(id), `tmdb id ${id} claimed by ${owner.get(id)} and ${p.id}`);
      owner.set(id, p.id);
    }
  }
});

test('entries with TMDB ids or android packages are flagged for verification', () => {
  for (const p of PROVIDERS) {
    const needsVerify = (p.tmdbIds && p.tmdbIds.length) || p.storeTmdbIds || p.android;
    if (needsVerify) assert.equal(p.verify, true, `${p.id} should carry verify:true`);
    else assert.equal(p.verify, undefined, `${p.id} has nothing to verify`);
  }
});

test('every legacy name resolves back to its own entry', () => {
  for (const p of PROVIDERS) {
    for (const name of p.legacyNames) {
      assert.deepEqual(migrateLegacySubs([name]), [p.id], `legacy name ${name}`);
    }
    assert.deepEqual(migrateLegacySubs([p.name]), [p.id], `display name ${p.name}`);
  }
});

test('DEFAULT_SUB_IDS are all curated ids', () => {
  for (const id of DEFAULT_SUB_IDS) assert.ok(PROVIDER_BY_ID.has(id), `unknown default ${id}`);
  assert.equal(new Set(DEFAULT_SUB_IDS).size, DEFAULT_SUB_IDS.length);
});

test('registryOrder follows PROVIDERS and sinks uncurated ids', () => {
  assert.equal(registryOrder('netflix'), 0);
  assert.ok(registryOrder('netflix') < registryOrder('2ndtry'));
  assert.equal(registryOrder('tmdb:257'), PROVIDERS.length);
  assert.equal(registryOrder(null), PROVIDERS.length);
});

// --- matching ------------------------------------------------------------

test('matchTmdbProvider goldens', () => {
  fx.tmdbMatch.forEach((c, i) => {
    const got = matchTmdbProvider(c.in);
    assert.equal(got ? got.id : null, fx.expected.tmdbMatch[i], `${c.why}: ${JSON.stringify(c.in)}`);
  });
});

test('matchTmdbProvider collapses ad-supported and premium tiers', () => {
  assert.equal(matchTmdbProvider({ provider_name: 'Netflix with Ads' }).id, 'netflix');
  assert.equal(matchTmdbProvider({ provider_name: 'Peacock Premium Plus' }).id, 'peacock');
  assert.equal(matchTmdbProvider({ provider_name: 'PBS Masterpiece Amazon Channel' }).id, 'pbs-masterpiece');
  assert.equal(matchTmdbProvider(null), null);
});

test('providerIdForTmdb never loses an id it cannot curate', () => {
  assert.equal(providerIdForTmdb({ provider_id: 8, provider_name: 'Netflix' }), 'netflix');
  assert.equal(providerIdForTmdb({ provider_id: 257, provider_name: 'fuboTV' }), 'tmdb:257');
  assert.equal(providerIdForTmdb({ provider_name: 'Totally Unknown' }), null);
  assert.equal(providerIdForTmdb({}), null);
});

test('matchPlexPlatform goldens', () => {
  fx.plexPlatform.forEach((slug, i) => {
    const got = matchPlexPlatform(slug);
    assert.equal(got ? got.id : null, fx.expected.plexPlatform[i], `slug ${JSON.stringify(slug)}`);
  });
});

test('resolveEnabled expands curated ids into TMDB ids and names', () => {
  const enabled = resolveEnabled(['netflix', 'prime', 'tmdb:39', 'bogus', '']);
  assert.deepEqual([...enabled.curated].sort(), ['netflix', 'prime']);
  // Prime's store tier (10) rides along with the subscription ids.
  for (const id of [8, 1796, 9, 119, 10, 39]) assert.ok(enabled.tmdbIds.has(id), `missing ${id}`);
  assert.ok(enabled.names.has('amazon prime video'));
  assert.ok(!enabled.tmdbIds.has(337));
});

test('isEnabledTmdb matches by id, then by name', () => {
  const enabled = resolveEnabled(['netflix']);
  assert.equal(isEnabledTmdb({ provider_id: 1796 }, enabled), true);
  assert.equal(isEnabledTmdb(8, enabled), true);
  assert.equal(isEnabledTmdb({ provider_id: 99999, provider_name: 'Netflix with Ads' }, enabled), true);
  assert.equal(isEnabledTmdb({ provider_id: 337 }, enabled), false);
  assert.equal(isEnabledTmdb(null, enabled), false);
});

// --- region listing ------------------------------------------------------

for (const key of ['US', 'GB', 'US-offline']) {
  test(`providersForRegion golden — ${key}`, () => {
    const region = key.slice(0, 2);
    const live = key.endsWith('offline') ? [] : fx.live[region];
    const got = providersForRegion(region, live, fx.subIds);
    assert.deepEqual(got, fx.expected.providersForRegion[key]);
  });
}

test('providersForRegion sorts enabled first, then kind, priority, name', () => {
  const rows = providersForRegion('US', fx.live.US, fx.subIds);
  const enabledCount = rows.filter(r => r.enabled).length;
  assert.equal(enabledCount, 3);
  rows.slice(0, enabledCount).forEach(r => assert.equal(r.enabled, true));
  rows.slice(enabledCount).forEach(r => assert.equal(r.enabled, false));
  let lastKind = -1;
  for (const r of rows.slice(enabledCount)) {
    const k = KIND_ORDER.indexOf(r.kind);
    assert.ok(k >= lastKind, `kind order broken at ${r.id}`);
    lastKind = k;
  }
});

test('providersForRegion collapses live ad tiers into one curated row', () => {
  const rows = providersForRegion('US', fx.live.US, fx.subIds);
  const netflix = rows.filter(r => r.id === 'netflix');
  assert.equal(netflix.length, 1, 'Netflix and "Netflix basic with Ads" must be one row');
  assert.deepEqual(netflix[0].tmdbIds, [8, 1796]);
  assert.equal(netflix[0].logoPath, '/netflix.jpg', 'first matching live logo wins');
  assert.equal(netflix[0].priority, 0, 'lowest display_priority wins');
  assert.equal(netflix[0].curated, true);
});

test('providersForRegion keeps uncurated live providers as tmdb: ids', () => {
  const rows = providersForRegion('US', fx.live.US, fx.subIds);
  const fubo = rows.find(r => r.id === 'tmdb:257');
  assert.deepEqual(fubo, {
    id: 'tmdb:257',
    name: 'fuboTV',
    logoPath: '/fubo.jpg',
    tmdbIds: [257],
    kind: 'subscription',
    enabled: true,
    curated: false,
    priority: 7,
  });
});

test('providersForRegion respects curated region lists', () => {
  const us = providersForRegion('US', [], []).map(r => r.id);
  const gb = providersForRegion('GB', [], []).map(r => r.id);
  assert.ok(us.includes('hulu') && us.includes('peacock'));
  assert.ok(!gb.includes('hulu'), 'Hulu is US-only');
  assert.ok(gb.includes('iplayer'), 'BBC iPlayer is GB-only');
  assert.ok(!us.includes('iplayer'));
  // 'global' entries show up everywhere.
  for (const id of ['netflix', 'prime', 'disney']) {
    assert.ok(us.includes(id) && gb.includes(id), id);
  }
});

test('providersForRegion trusts live data over the curated region hint', () => {
  const rows = providersForRegion('DE', [
    { provider_id: 15, provider_name: 'Hulu', logo_path: '/hulu.jpg', display_priority: 4 },
  ], []);
  const hulu = rows.find(r => r.id === 'hulu');
  assert.ok(hulu, 'a live row adds a curated entry we did not expect in this region');
  assert.equal(hulu.logoPath, '/hulu.jpg');
});

// --- migration -----------------------------------------------------------

test('migrateLegacySubs goldens', () => {
  fx.migrate.forEach((c, i) => {
    assert.deepEqual(migrateLegacySubs(c.in), fx.expected.migrate[i], c.why);
  });
});

test('the legacy default profile migrates exactly to DEFAULT_SUB_IDS', () => {
  const legacy = [
    'Hulu', 'Disney+', 'Max', 'Amazon Prime Video', 'Apple TV+', 'Paramount+',
    'PBS Masterpiece (via Prime)', 'National Theatre at Home', 'Dropout', '2nd Try',
  ];
  assert.deepEqual(migrateLegacySubs(legacy), DEFAULT_SUB_IDS);
});

test('migrateLegacySubs is idempotent and non-mutating', () => {
  const input = ['Hulu', 'HBO Max', 'Max', 'tmdb:39', 'Nonesuch'];
  const copy = input.slice();
  const once = migrateLegacySubs(input);
  const twice = migrateLegacySubs(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(migrateLegacySubs(twice), once);
  assert.deepEqual(input, copy, 'input array must not be mutated');
  assert.deepEqual(once, ['hulu', 'max', 'tmdb:39']);
});

test('migrateLegacySubs tolerates junk input', () => {
  assert.deepEqual(migrateLegacySubs(null), []);
  assert.deepEqual(migrateLegacySubs('Hulu'), []);
  assert.deepEqual(migrateLegacySubs([null, 42, {}, ' Hulu ']), ['hulu']);
});

// --- urls ----------------------------------------------------------------

test('webSearchUrl goldens', () => {
  fx.webSearch.forEach((c, i) => {
    const entry = c.id ? PROVIDER_BY_ID.get(c.id) : null;
    assert.equal(webSearchUrl(entry, c.title, c.name), fx.expected.webSearch[i], JSON.stringify(c));
  });
});

test('webSearchUrl encodes the query and falls back to Google', () => {
  assert.equal(
    webSearchUrl(PROVIDER_BY_ID.get('netflix'), 'Q & A'),
    'https://www.netflix.com/search?q=Q%20%26%20A',
  );
  assert.equal(
    webSearchUrl(null, 'Q & A', 'fuboTV'),
    'https://www.google.com/search?q=fuboTV%20Q%20%26%20A',
  );
  // No provider name and no entry: just the title.
  assert.equal(webSearchUrl(null, 'Heat'), 'https://www.google.com/search?q=Heat');
  // Entries without a search template (Pluto, Plex, MGM+) fall back too.
  assert.match(webSearchUrl(PROVIDER_BY_ID.get('pluto'), 'Heat'), /^https:\/\/www\.google\.com\/search/);
});
