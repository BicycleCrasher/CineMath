// Golden tests for lib/plex-discover.js — Discover parsers + watchlist sync plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseGuids,
  itemFromMetadata,
  parseSearch,
  parseWatchlist,
  parseAvailability,
  pickBestSearchHit,
  planWatchlistSync,
} from '../lib/plex-discover.js';
import { plexNormalizeKey } from '../lib/normalize.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/plex-discover-cases.json', import.meta.url), 'utf8'),
);

// --- guids ---------------------------------------------------------------

test('parseGuids reads tmdb, imdb and tvdb ids from Guid[]', () => {
  assert.deepEqual(parseGuids({
    Guid: [{ id: 'tmdb://949' }, { id: 'imdb://tt0113277' }, { id: 'tvdb://12345' }],
  }), { tmdb: 949, imdb: 'tt0113277', tvdb: 12345 });
});

test('parseGuids falls back to the scalar guid when it uses a known scheme', () => {
  assert.deepEqual(parseGuids({ guid: 'tmdb://949' }), { tmdb: 949, imdb: null, tvdb: null });
  assert.deepEqual(parseGuids({ guid: 'plex://movie/5d776831' }),
    { tmdb: null, imdb: null, tvdb: null });
  assert.deepEqual(parseGuids({ guid: 'com.plexapp.agents.imdb://tt0113277?lang=en' }),
    { tmdb: null, imdb: null, tvdb: null }, 'legacy agent guids are not ours to parse');
});

test('parseGuids tolerates junk and keeps the first id per scheme', () => {
  assert.deepEqual(parseGuids(null), { tmdb: null, imdb: null, tvdb: null });
  assert.deepEqual(parseGuids({}), { tmdb: null, imdb: null, tvdb: null });
  assert.deepEqual(parseGuids({ Guid: 'nope' }), { tmdb: null, imdb: null, tvdb: null });
  assert.deepEqual(parseGuids({ Guid: [null, { id: 'tmdb://x' }, { id: 'tmdb://1' }, { id: 'tmdb://2' }] }),
    { tmdb: 1, imdb: null, tvdb: null });
  assert.deepEqual(parseGuids({ Guid: ['tmdb://7'] }), { tmdb: 7, imdb: null, tvdb: null },
    'plain strings work too');
});

// --- metadata items ------------------------------------------------------

test('itemFromMetadata normalizes ratingKey, year, type and thumb', () => {
  assert.deepEqual(itemFromMetadata({ ratingKey: 42, title: 'Heat', year: '1995', type: 'tv' }), {
    ratingKey: '42', title: 'Heat', year: 1995, type: 'show',
    guids: { tmdb: null, imdb: null, tvdb: null }, thumb: null,
  });
  assert.equal(itemFromMetadata({ year: 0 }).year, null);
  assert.equal(itemFromMetadata({ year: 'soon' }).year, null);
  assert.equal(itemFromMetadata({ type: 'movie' }).type, 'movie');
  assert.equal(itemFromMetadata({ type: 'show' }).type, 'show');
  assert.equal(itemFromMetadata({}).type, null);
  assert.equal(itemFromMetadata(null), null);
});

// --- search shapes -------------------------------------------------------

test('parseSearch handles the nested SearchResults shape', () => {
  const items = parseSearch(fx.search.nested);
  const want = fx.expected.search.nested;
  assert.deepEqual(items.map(i => i.ratingKey), want.ratingKeys);
  assert.deepEqual(items.map(i => i.type), want.types);
  assert.deepEqual(items[0].guids, want.firstGuids);
  assert.deepEqual(items[items.length - 1].guids, want.lastGuids);
  assert.equal(items[0].thumb, want.firstThumb);
});

test('parseSearch handles the flat SearchResult shape', () => {
  assert.deepEqual(
    parseSearch(fx.search.flat).map(i => i.ratingKey),
    fx.expected.search.flat.ratingKeys,
  );
});

test('parseSearch handles a plain Metadata list', () => {
  const items = parseSearch(fx.search.metadataOnly);
  const want = fx.expected.search.metadataOnly;
  assert.deepEqual(items.map(i => i.ratingKey), want.ratingKeys);
  assert.deepEqual(items.map(i => i.type), want.types);
  assert.deepEqual(items[0].guids, want.firstGuids);
  assert.equal(items[0].year, want.firstYear);
  assert.equal(items[0].thumb, want.firstThumb);
});

test('parseSearch returns [] for empty or unrecognized payloads', () => {
  assert.deepEqual(parseSearch(fx.search.emptyContainer), []);
  assert.deepEqual(parseSearch(fx.search.garbage), []);
  assert.deepEqual(parseSearch(null), []);
  assert.deepEqual(parseSearch({ MediaContainer: { SearchResults: [{}] } }), []);
});

// --- watchlist -----------------------------------------------------------

test('parseWatchlist reports items and the true total size', () => {
  const paged = parseWatchlist(fx.watchlist.paged);
  assert.equal(paged.items.length, fx.expected.watchlist.paged.count);
  assert.equal(paged.totalSize, fx.expected.watchlist.paged.totalSize);
  assert.deepEqual(paged.items.map(i => i.ratingKey), fx.expected.watchlist.paged.ratingKeys);
  assert.equal(paged.items[1].type, 'show');
  assert.equal(paged.items[0].guids.tmdb, 438631);
});

test('parseWatchlist falls back to size, then to the item count', () => {
  assert.equal(parseWatchlist(fx.watchlist.sizeOnly).totalSize, fx.expected.watchlist.sizeOnly.totalSize);
  assert.equal(parseWatchlist(fx.watchlist.noCounts).totalSize, fx.expected.watchlist.noCounts.totalSize);
  assert.deepEqual(parseWatchlist(fx.watchlist.empty), { items: [], totalSize: 0 });
  assert.deepEqual(parseWatchlist(null), { items: [], totalSize: 0 });
});

// --- availability --------------------------------------------------------

for (const key of ['singular', 'plural', 'unknownShape', 'empty']) {
  test(`parseAvailability golden — ${key}`, () => {
    assert.deepEqual(parseAvailability(fx.availability[key]), fx.expected.availability[key]);
  });
}

test('parseAvailability exposes _rawKeys so a debug probe can find the real field', () => {
  const got = parseAvailability(fx.availability.unknownShape);
  assert.deepEqual(got.availability, [], 'we do not guess at unknown shapes');
  assert.ok(got._rawKeys.includes('Streams'), 'but we report what was actually there');
});

test('parseAvailability drops non-https offer URLs and lowercases the country', () => {
  const got = parseAvailability(fx.availability.singular);
  assert.equal(got.availability[0].country, 'us');
  assert.equal(got.availability[0].url, 'https://www.netflix.com/title/60021793');
  assert.equal(got.availability[1].url, null, 'http:// offer URL is refused');
});

test('parseAvailability tolerates junk', () => {
  assert.deepEqual(parseAvailability(null), { availability: [], _rawKeys: [] });
  assert.deepEqual(parseAvailability({ MediaContainer: { Metadata: [] } }), { availability: [], _rawKeys: [] });
  assert.deepEqual(
    parseAvailability({ MediaContainer: { Metadata: [{ Availability: [null, 'x', {}] }] } }),
    { availability: [{ platform: '', title: '', url: null, offerType: '', country: '' }], _rawKeys: ['Availability'] },
  );
});

// --- hit selection -------------------------------------------------------

test('pickBestSearchHit goldens', () => {
  const hits = parseSearch(fx.search.nested);
  for (const c of fx.pick) {
    const got = pickBestSearchHit(hits, c.want, plexNormalizeKey);
    assert.equal(got ? got.ratingKey : null, c.expect, c.why);
  }
});

test('pickBestSearchHit defaults to plexNormalizeKey and handles empty input', () => {
  const hits = parseSearch(fx.search.nested);
  assert.equal(pickBestSearchHit(hits, { title: 'Heat', year: 1995 }).ratingKey, '5d776831');
  assert.equal(pickBestSearchHit([], { tmdbId: 949 }), null);
  assert.equal(pickBestSearchHit(null, { tmdbId: 949 }), null);
});

// --- sync plan -----------------------------------------------------------

for (const c of fx.sync) {
  test(`planWatchlistSync — ${c.why}`, () => {
    const got = planWatchlistSync({ ...c.in, now: fx.now });
    assert.deepEqual(got.push, c.expect.push);
    assert.deepEqual(got.queueLocally, c.expect.queueLocally);
    assert.deepEqual(got.unqueueLocally, c.expect.unqueueLocally);
    assert.deepEqual(got.orphans.map(o => o.ratingKey), c.expect.orphanKeys);
    assert.deepEqual(got.mirrorNext, c.expect.mirrorNext);
  });
}

test('planWatchlistSync leaves watched/skip/watching items unmirrored', () => {
  for (const status of ['watched', 'skip', 'watching']) {
    const plan = planWatchlistSync({
      localQueued: [],
      remote: [{ ratingKey: 'r9', matchedRef: 'scifi|x', matchedStatus: status }],
      mirror: { 'scifi|x': { ratingKey: 'r9', syncedAt: 1, origin: 'app' } },
      now: fx.now,
    });
    assert.deepEqual(plan, { push: [], queueLocally: [], unqueueLocally: [], orphans: [], mirrorNext: {} }, status);
  }
});

test('planWatchlistSync treats a missing status as untracked', () => {
  const plan = planWatchlistSync({
    localQueued: [],
    remote: [{ ratingKey: 'r1', matchedRef: 'scifi|d' }],
    mirror: {},
    now: fx.now,
  });
  assert.deepEqual(plan.queueLocally, [{ ref: 'scifi|d', ratingKey: 'r1' }]);
  assert.deepEqual(plan.mirrorNext['scifi|d'], { ratingKey: 'r1', syncedAt: fx.now, origin: 'plex' });
});

test('planWatchlistSync is idempotent once both sides agree', () => {
  const first = planWatchlistSync({
    localQueued: [{ ref: 'scifi|dune', status: 'queued' }],
    remote: [],
    mirror: {},
    now: fx.now,
  });
  assert.deepEqual(first.push, ['scifi|dune']);

  // The app pushes, mirrors what it pushed, and re-syncs: nothing left to do.
  const mirror = { 'scifi|dune': { ratingKey: 'r1', syncedAt: fx.now, origin: 'app' } };
  const remote = [{ ratingKey: 'r1', matchedRef: 'scifi|dune', matchedStatus: 'queued' }];
  const second = planWatchlistSync({ localQueued: [{ ref: 'scifi|dune', status: 'queued' }], remote, mirror, now: fx.now });
  assert.deepEqual(second.push, []);
  assert.deepEqual(second.unqueueLocally, []);
  assert.deepEqual(second.queueLocally, []);
  const third = planWatchlistSync({
    localQueued: [{ ref: 'scifi|dune', status: 'queued' }], remote, mirror: second.mirrorNext, now: fx.now,
  });
  assert.deepEqual(third, second);
});

test('planWatchlistSync defaults now to the current time and tolerates junk input', () => {
  const before = Date.now();
  const plan = planWatchlistSync({
    localQueued: null,
    remote: [{ ratingKey: 'r1', matchedRef: 'a|b', matchedStatus: 'none' }],
    mirror: null,
  });
  assert.ok(plan.mirrorNext['a|b'].syncedAt >= before);
  assert.deepEqual(planWatchlistSync(), {
    push: [], queueLocally: [], unqueueLocally: [], orphans: [], mirrorNext: {},
  });
  assert.deepEqual(planWatchlistSync({}), {
    push: [], queueLocally: [], unqueueLocally: [], orphans: [], mirrorNext: {},
  });
});
