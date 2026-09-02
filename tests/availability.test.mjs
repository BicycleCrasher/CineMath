// Golden tests for lib/availability.js — snapshot slicing and the watch ladder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIERS,
  PLAYABLE_SCORE,
  snapshotFromTmdb,
  rankAvailability,
  isPlayableOnMyServices,
  providerChips,
  rankTonight,
  diffSnapshots,
} from '../lib/availability.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/availability-cases.json', import.meta.url), 'utf8'),
);

const snapshot = () => snapshotFromTmdb(fx.tmdb, fx.regions);
const rankFor = (key) => {
  const p = fx.profiles[key];
  return rankAvailability({
    avail: snapshot(),
    regions: fx.regions,
    subIds: p.subIds,
    plexServer: p.plexServer || null,
    plexDiscover: p.plexDiscover || null,
    liveNames: p.liveNames || null,
  });
};

// --- snapshot ------------------------------------------------------------

test('tier order is flatrate, free, ads, rent, buy', () => {
  assert.deepEqual(TIERS, ['flatrate', 'free', 'ads', 'rent', 'buy']);
});

test('snapshotFromTmdb golden', () => {
  const snap = snapshot();
  assert.ok(snap.at > 0, 'snapshot is stamped');
  assert.deepEqual({ ...snap, at: 0 }, fx.expected.snapshot);
});

test('snapshotFromTmdb keeps only the selected regions', () => {
  const snap = snapshot();
  assert.deepEqual(Object.keys(snap.byRegion), ['US', 'GB']);
  assert.equal(snap.byRegion.CA, undefined, 'CA was not requested');
  assert.equal(snap.byRegion.DE, undefined, 'DE was not requested');
});

test('snapshotFromTmdb drops empty tiers and non-https links', () => {
  const snap = snapshot();
  assert.equal('rent' in snap.byRegion.GB, false, 'empty rent tier is dropped');
  assert.equal(snap.byRegion.US.link, 'https://www.themoviedb.org/movie/1-heat/watch?locale=US');
  assert.equal('link' in snap.byRegion.GB, false, 'http link is dropped');
});

test('snapshotFromTmdb accepts the bare results map and junk input', () => {
  const bare = snapshotFromTmdb(fx.tmdb.results, fx.regions);
  assert.deepEqual(bare.byRegion, snapshot().byRegion);
  for (const junk of [null, undefined, {}, { results: null }, 'nope']) {
    const snap = snapshotFromTmdb(junk, fx.regions);
    assert.deepEqual(snap.byRegion, {}, JSON.stringify(junk));
    assert.deepEqual(snap.regions, ['US', 'GB']);
    assert.ok(typeof snap.at === 'number');
  }
  assert.deepEqual(snapshotFromTmdb(fx.tmdb, null).byRegion, {});
});

test('snapshotFromTmdb normalizes and dedupes the region list', () => {
  const snap = snapshotFromTmdb(fx.tmdb, ['us', 'US', ' gb ']);
  assert.deepEqual(snap.regions, ['US', 'GB']);
});

// --- ranking goldens -----------------------------------------------------

for (const key of Object.keys(fx.profiles)) {
  test(`rankAvailability golden — ${key}`, () => {
    const got = rankFor(key);
    const want = fx.expected.ranked[key];
    assert.deepEqual(got.best, want.best);
    assert.deepEqual(got.playable, want.playable);
    assert.deepEqual(got.elsewhere, want.elsewhere);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(got.byRegion).map(([r, list]) => [r, list.map(e => `${e.providerId}:${e.tier}`)]),
      ),
      want.byRegion,
    );
  });
}

test('playable is exactly the entries scoring at least 600', () => {
  for (const key of Object.keys(fx.profiles)) {
    const { playable, elsewhere, best } = rankFor(key);
    for (const e of playable) assert.ok(e.score >= PLAYABLE_SCORE, `${key}: ${e.providerId} ${e.score}`);
    for (const e of elsewhere) assert.ok(e.score < PLAYABLE_SCORE, `${key}: ${e.providerId} ${e.score}`);
    assert.equal(best, playable[0] || null);
    // Sorted by score descending across the whole ladder.
    const all = playable.concat(elsewhere);
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].score >= all[i].score, key);
  }
});

test('home-region enabled subscriptions score 900, sorted by registry order', () => {
  const { playable } = rankFor('home-subs');
  assert.deepEqual(
    playable.filter(e => e.score === 900).map(e => e.providerId),
    ['netflix', 'hulu'],
  );
  const netflix = playable.find(e => e.providerId === 'netflix' && e.region === 'US');
  assert.equal(netflix.tier, 'flatrate');
  assert.equal(netflix.home, true);
  assert.equal(netflix.source, 'tmdb');
  assert.equal(netflix.name, 'Netflix');
});

test('an enabled service in a non-home region is playable but ranks below home', () => {
  const { playable, elsewhere } = rankFor('vpn');
  assert.deepEqual(playable.map(e => `${e.providerId}@${e.region}`), ['tmdb:39@GB']);
  assert.equal(playable[0].score, 600);
  assert.equal(playable[0].home, false);
  // Everything the user does not subscribe to stays out of the playable list.
  assert.ok(elsewhere.every(e => e.score < 600));
});

test('the VPN penalty grows with each extra region', () => {
  const avail = {
    byRegion: { US: {}, GB: { flatrate: [8] }, CA: { flatrate: [8] }, AU: { flatrate: [8] } },
  };
  const { playable, elsewhere } = rankAvailability({
    avail, regions: ['US', 'GB', 'CA', 'AU'], subIds: ['netflix'],
  });
  const scores = playable.concat(elsewhere).map(e => `${e.region}:${e.score}`);
  assert.deepEqual(scores, ['GB:600', 'CA:590', 'AU:580']);
});

test('rent and buy never reach the playable list, enabled stores get +20', () => {
  const { elsewhere } = rankFor('home-subs');
  const rent = elsewhere.find(e => e.tier === 'rent');
  const buy = elsewhere.find(e => e.tier === 'buy' && e.providerId === 'googleplay');
  assert.equal(rent.providerId, 'appletv-store');
  assert.equal(rent.score, 220, 'Apple TV store is enabled in this profile');
  assert.equal(buy.score, 200, 'Google Play is not');
});

test('not-enabled providers score by tier and region', () => {
  const { elsewhere } = rankFor('none');
  const score = (id, region) => elsewhere.find(e => e.providerId === id && e.region === region).score;
  assert.equal(score('tubi', 'US'), 400, 'home free/ads');
  assert.equal(score('netflix', 'US'), 300, 'home flatrate');
  assert.equal(score('netflix', 'GB'), 250, 'other region flatrate');
  assert.equal(score('tubi', 'GB'), 150, 'other region free/ads');
});

test('a Plex server hit outranks everything', () => {
  const { best, playable } = rankFor('plex-server');
  assert.equal(best.providerId, 'plex-server');
  assert.equal(best.score, 1000);
  assert.equal(best.tier, 'plex');
  assert.equal(best.source, 'plex-server');
  assert.equal(best.region, 'US');
  assert.equal(playable[1].providerId, 'netflix');
});

test('Plex Discover deep URLs attach to matching TMDB entries and add new ones', () => {
  const { playable, best } = rankFor('discover');
  const netflix = playable.find(e => e.providerId === 'netflix' && e.region === 'US');
  assert.equal(netflix.deepUrl, 'https://www.netflix.com/title/60021793');
  assert.equal(netflix.score, 950, '900 + 50 for the deep URL');
  assert.equal(netflix.source, 'tmdb', 'still a TMDB row, now with a deep URL');
  assert.equal(best.providerId, 'netflix', 'registry order breaks the 950 tie');

  // AMC+ is not in the TMDB snapshot at all — Discover contributes it.
  const amc = playable.find(e => e.providerId === 'amc');
  assert.equal(amc.source, 'plex-discover');
  assert.equal(amc.tier, 'flatrate');
  assert.equal(amc.deepUrl, 'https://www.amcplus.com/movies/heat');
  assert.equal(amc.score, 950);
});

test('Plex Discover rows are ignored when insecure, out of region, or unknown', () => {
  const { playable, elsewhere } = rankFor('discover');
  const all = playable.concat(elsewhere);
  const hulu = all.find(e => e.providerId === 'hulu');
  assert.equal(hulu.deepUrl, null, 'http:// deep URLs are refused');
  assert.equal(hulu.score, 300, 'and the score keeps no bonus');
  assert.equal(all.some(e => e.region === 'DE'), false, 'DE is not a selected region');
  assert.equal(all.some(e => e.name === 'Now TV' && e.source === 'plex-discover'), false,
    'the "now" platform slug matches no registry entry');
});

test('offerType maps onto TMDB tiers, unknown values fall back to flatrate', () => {
  const rows = [
    { platform: 'tubi', url: 'https://tubitv.com/x', offerType: 'free', country: 'us' },
    { platform: 'pluto', url: 'https://pluto.tv/x', offerType: 'ads', country: 'us' },
    { platform: 'vudu', url: 'https://vudu.com/x', offerType: 'rent', country: 'us' },
    { platform: 'googleplay', url: 'https://play.google.com/x', offerType: 'buy', country: 'us' },
    { platform: 'mubi', url: 'https://mubi.com/x', offerType: 'wat', country: 'us' },
  ];
  const { playable, elsewhere } = rankAvailability({
    avail: { byRegion: { US: {} } },
    regions: ['US'],
    subIds: [],
    plexDiscover: { availability: rows },
  });
  const tiers = {};
  for (const e of playable.concat(elsewhere)) tiers[e.providerId] = e.tier;
  assert.deepEqual(tiers, {
    tubi: 'free', pluto: 'ads', fandango: 'rent', googleplay: 'buy', mubi: 'flatrate',
  });
});

test('duplicate provider/region/tier rows collapse to the best score', () => {
  const { playable, elsewhere } = rankAvailability({
    avail: { byRegion: { US: { flatrate: [8] } } },
    regions: ['US'],
    subIds: ['netflix'],
    plexDiscover: {
      availability: [
        { platform: 'netflix', url: 'https://a.example.com/1', offerType: 'subscription', country: 'us' },
        { platform: 'netflix', url: 'https://b.example.com/2', offerType: 'subscription', country: 'us' },
      ],
    },
  });
  const all = playable.concat(elsewhere);
  assert.equal(all.length, 1);
  assert.equal(all[0].score, 950);
  assert.equal(all[0].deepUrl, 'https://a.example.com/1', 'first deep URL wins');
});

test('rankAvailability copes with an empty or missing snapshot', () => {
  for (const avail of [null, undefined, {}, { byRegion: null }]) {
    const r = rankAvailability({ avail, regions: fx.regions, subIds: ['netflix'] });
    assert.equal(r.best, null);
    assert.deepEqual(r.playable, []);
    assert.deepEqual(r.elsewhere, []);
    assert.deepEqual(r.byRegion, {});
  }
  assert.equal(rankAvailability().best, null);
});

test('liveNames override registry names, uncurated ids fall back to tmdb:<id>', () => {
  const withNames = rankAvailability({
    avail: snapshot(), regions: fx.regions, subIds: [], liveNames: fx.liveNames,
  });
  const now = withNames.elsewhere.find(e => e.providerId === 'tmdb:39');
  assert.equal(now.name, 'Now TV');
  const without = rankAvailability({ avail: snapshot(), regions: fx.regions, subIds: [] });
  assert.equal(without.elsewhere.find(e => e.providerId === 'tmdb:39').name, 'tmdb:39');
});

// --- derived helpers -----------------------------------------------------

test('isPlayableOnMyServices goldens', () => {
  for (const [key, p] of Object.entries(fx.profiles)) {
    assert.equal(
      isPlayableOnMyServices(snapshot(), fx.regions, p.subIds),
      fx.expected.playableOnMyServices[key],
      key,
    );
  }
});

test('isPlayableOnMyServices ignores rent/buy and unknown snapshots', () => {
  const snap = snapshot();
  // Apple TV store is enabled, but the title is only rent/buy there.
  assert.equal(isPlayableOnMyServices(snap, ['US'], ['appletv-store']), false);
  assert.equal(isPlayableOnMyServices(snap, ['US'], ['hulu']), true);
  assert.equal(isPlayableOnMyServices(null, ['US'], ['hulu']), false);
  assert.equal(isPlayableOnMyServices(snap, [], ['hulu']), false);
});

test('providerChips goldens', () => {
  for (const [key, p] of Object.entries(fx.profiles)) {
    assert.deepEqual(providerChips(snapshot(), fx.regions, p.subIds, 3), fx.expected.chips[key], key);
  }
});

test('providerChips puts the home region first and honours max', () => {
  const snap = snapshot();
  const subs = ['netflix', 'hulu', 'tmdb:39'];
  const chips = providerChips(snap, fx.regions, subs, 3);
  assert.deepEqual(chips.map(c => `${c.providerId}@${c.region}`), ['netflix@US', 'hulu@US', 'tmdb:39@GB']);
  assert.deepEqual(chips.map(c => c.home), [true, true, false]);
  assert.equal(providerChips(snap, fx.regions, subs, 1).length, 1);
  assert.equal(providerChips(snap, fx.regions, subs).length, 3, 'max defaults to 3');
  // Netflix is in both regions but only chips once.
  assert.equal(chips.filter(c => c.providerId === 'netflix').length, 1);
});

test('rankTonight sorts by score, then recency, then title', () => {
  const out = rankTonight(fx.tonight);
  assert.deepEqual(out.map(i => i.ref), [
    'scifi|c', 'scifi|b', 'scifi|a', 'scifi|d', 'scifi|e',
  ]);
  // Pure: a new array, original order untouched.
  assert.notEqual(out, fx.tonight);
  assert.deepEqual(fx.tonight.map(i => i.ref), [
    'scifi|a', 'scifi|b', 'scifi|c', 'scifi|d', 'scifi|e',
  ]);
  assert.deepEqual(rankTonight(null), []);
});

test('diffSnapshots golden', () => {
  assert.deepEqual(diffSnapshots(fx.diff.prev, fx.diff.next, fx.diff.subIds), fx.expected.diff);
});

test('diffSnapshots only reports enabled providers and streaming tiers', () => {
  const prev = { byRegion: { US: { flatrate: [8], rent: [2] } } };
  const next = { byRegion: { US: { flatrate: [8, 337], rent: [], buy: [2, 3] } } };
  assert.deepEqual(diffSnapshots(prev, next, ['disney']), {
    arrived: [{ region: 'US', tmdbId: 337 }],
    left: [],
  });
  assert.deepEqual(diffSnapshots(prev, next, ['appletv-store']), { arrived: [], left: [] },
    'rent/buy churn is not an arrival');
  assert.deepEqual(diffSnapshots(prev, next, []), { arrived: [], left: [] });
});

test('diffSnapshots treats a tier change within streaming as no change', () => {
  const prev = { byRegion: { US: { free: [73] } } };
  const next = { byRegion: { US: { ads: [73] } } };
  assert.deepEqual(diffSnapshots(prev, next, ['tubi']), { arrived: [], left: [] });
});

test('diffSnapshots with no previous snapshot is empty', () => {
  assert.deepEqual(diffSnapshots(null, fx.diff.next, fx.diff.subIds), { arrived: [], left: [] });
  assert.deepEqual(diffSnapshots(fx.diff.prev, null, fx.diff.subIds), { arrived: [], left: [] });
});
