// Golden tests for lib/bulk-sync.js — the Plex full-history bulk-sync rules.
// State is an in-memory { tab: { itemId: { status, rating } } } map driven
// through the same accessor shape app.js injects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyBulkSyncRules, PLEX_BULK_LIBRARY_WHITELIST } from '../lib/bulk-sync.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/bulk-sync-cases.json', import.meta.url), 'utf8'),
);

function makeDeps(initialState) {
  const state = structuredClone(initialState);
  const entry = (id, tab) => (state[tab] = state[tab] || {}, state[tab][id] = state[tab][id] || {});
  return {
    state,
    deps: {
      catalogs: fx.catalogs,
      getStatus: (id, tab) => entry(id, tab).status || 'none',
      setStatus: (id, status, tab) => { entry(id, tab).status = status; },
      getRating: (id, tab) => entry(id, tab).rating || 'none',
      setRating: (id, rating, tab) => { entry(id, tab).rating = rating; },
    },
  };
}

test('whitelist only admits Plex libraries 1 and 2', () => {
  assert.deepEqual([...PLEX_BULK_LIBRARY_WHITELIST].sort(), ['1', '2']);
});

test('applyBulkSyncRules golden scenario: report counters', () => {
  const { deps } = makeDeps(fx.initialState);
  const report = applyBulkSyncRules(fx.entries, fx.episodeCounts, deps);
  for (const [k, v] of Object.entries(fx.expectedReport)) {
    assert.equal(report[k], v, `report.${k}`);
  }
});

test('applyBulkSyncRules golden scenario: final state', () => {
  const { deps } = makeDeps(fx.initialState);
  applyBulkSyncRules(fx.entries, fx.episodeCounts, deps);
  for (const [tab, items] of Object.entries(fx.expectedFinalState)) {
    for (const [id, want] of Object.entries(items)) {
      if (want.status !== undefined) {
        assert.equal(deps.getStatus(id, tab), want.status, `${tab}/${id} status`);
      }
      if (want.rating !== undefined) {
        assert.equal(deps.getRating(id, tab), want.rating, `${tab}/${id} rating`);
      }
    }
  }
});

test('orphans carry play counts and distinct-episode counts', () => {
  const { deps } = makeDeps(fx.initialState);
  const report = applyBulkSyncRules(fx.entries, fx.episodeCounts, deps);
  assert.deepEqual(report.movieOrphans, [
    { title: 'Unknown Indie Film', year: 2015, plays: 2 },
  ]);
  assert.deepEqual(report.showOrphans, [
    { show: 'Some Unknown Show', distinct: 2, plays: 2 },
  ]);
});

test('already-watched movie is matched but not re-marked', () => {
  const { deps } = makeDeps(fx.initialState);
  const report = applyBulkSyncRules(
    [{ librarySectionID: '1', type: 'movie', title: 'Primer', year: 2004 }],
    {}, deps,
  );
  assert.equal(report.moviesMatchedToCatalog, 1);
  assert.equal(report.moviesMarkedWatched, 0);
});

test('strict mode needs >= 95% of episodes; just below stays watching', () => {
  const { deps } = makeDeps({});
  // Devs has 8 episodes (episodeCounts.devs = 8); 7 distinct = 87.5% < 95%
  const entries = Array.from({ length: 7 }, (_, i) => ({
    librarySectionID: '2', type: 'episode', grandparentTitle: 'Devs',
    parentIndex: 1, index: i + 1,
  }));
  const report = applyBulkSyncRules(entries, fx.episodeCounts, deps);
  assert.equal(report.showsMarkedWatched, 0);
  assert.equal(report.showsMarkedWatching, 1);
  assert.equal(deps.getStatus('devs-2020', 'scifi-tv'), 'watching');
  // 7 distinct >= 5 still trips the loved rule
  assert.equal(deps.getRating('devs-2020', 'scifi-tv'), 'loved');
});

test('missing episodeCounts entry means a show can only reach watching', () => {
  const { deps } = makeDeps({});
  const entries = Array.from({ length: 20 }, (_, i) => ({
    librarySectionID: '2', type: 'episode', grandparentTitle: 'The Expanse',
    parentIndex: 1, index: i + 1,
  }));
  const report = applyBulkSyncRules(entries, {}, deps);
  assert.equal(report.showsMarkedWatched, 0);
  assert.equal(deps.getStatus('the-expanse-2015', 'scifi-tv'), 'watching');
});

test('non-whitelisted library entries are ignored entirely', () => {
  const { deps } = makeDeps({});
  const report = applyBulkSyncRules(
    [{ librarySectionID: '7', type: 'movie', title: 'Moon', year: 2009 }],
    {}, deps,
  );
  assert.equal(report.moviesProcessed, 0);
  assert.equal(deps.getStatus('moon-2009', 'scifi'), 'none');
});
