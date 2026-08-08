// Golden tests for lib/plex-match.js — how a Plex scrobble event finds its
// catalog item. Covers year ±1 fuzz, diacritics, aliases, TV-vs-film
// branching, and non-scrobble event filtering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findCatalogMatchForScrobble,
  itemMatchesMovieKey,
  itemMatchesTvKey,
} from '../lib/plex-match.js';
import { plexNormalizeKey, plexNormalizeKeyTitleOnly } from '../lib/normalize.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/plex-match-cases.json', import.meta.url), 'utf8'),
);

test('findCatalogMatchForScrobble golden cases', () => {
  for (const c of fx.events) {
    const hit = findCatalogMatchForScrobble(fx.catalogs, c.event);
    if (c.expected === null) {
      assert.equal(hit, null, c.name);
    } else {
      assert.ok(hit, `${c.name}: expected a match, got null`);
      assert.equal(hit.tabId, c.expected.tabId, `${c.name}: tabId`);
      assert.equal(hit.item.id, c.expected.itemId, `${c.name}: itemId`);
      assert.equal(hit.isMovie, c.expected.isMovie, `${c.name}: isMovie`);
    }
  }
});

test('itemMatchesMovieKey year fuzz is exactly ±1', () => {
  const item = { id: 'x', title: 'Moon', year: 2009 };
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', 2008)), true);
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', 2009)), true);
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', 2010)), true);
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', 2007)), false);
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', 2011)), false);
});

test('itemMatchesMovieKey with no item year only fuzzes to null-year key', () => {
  // item.year falsy -> fuzz candidates use null, i.e. "moon|" both times.
  const item = { id: 'x', title: 'Moon', year: null };
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', null)), true);
  assert.equal(itemMatchesMovieKey(item, plexNormalizeKey('Moon', 2009)), false);
});

test('itemMatchesTvKey ignores year entirely and honors aliases', () => {
  const item = { id: 'qi', title: 'QI', year: 2003, aliases: ['QI XL'] };
  assert.equal(itemMatchesTvKey(item, plexNormalizeKeyTitleOnly('QI XL')), true);
  assert.equal(itemMatchesTvKey(item, plexNormalizeKeyTitleOnly('QI')), true);
  assert.equal(itemMatchesTvKey(item, plexNormalizeKeyTitleOnly('QI Something Else')), false);
});

test('first tab in catalog iteration order wins', () => {
  const catalogs = {
    a: { items: [{ id: 'dup-a', title: 'Duplicate', year: 2000 }] },
    b: { items: [{ id: 'dup-b', title: 'Duplicate', year: 2000 }] },
  };
  const hit = findCatalogMatchForScrobble(catalogs, {
    event: 'media.scrobble', type: 'movie', title: 'Duplicate', year: 2000,
  });
  assert.equal(hit.tabId, 'a');
  assert.equal(hit.item.id, 'dup-a');
});
