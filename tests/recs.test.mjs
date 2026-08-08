// Golden tests for lib/recs.js — the wizard's recommendation engine
// (computeRecsForTab) and mood tag-overlap scoring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRecsForTab, moodScoreFromTags } from '../lib/recs.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/recs-cases.json', import.meta.url), 'utf8'),
);

function makeDeps(overrides = {}) {
  const entry = (id, tab) => (fx.state[tab] || {})[id] || {};
  return {
    catalogs: fx.catalogs,
    getRating: (id, tab) => entry(id, tab).rating || 'none',
    getStatus: (id, tab) => entry(id, tab).status || 'none',
    getEnrichmentForItem: (id) => fx.enrichment[id] || null,
    moodScore: (item, tabId, mood) =>
      moodScoreFromTags(entry(item.id, tabId).reactionTags || [], ['Mind-bending']),
    ...overrides,
  };
}

test('golden scenario: sources, discover scoring, dedupe, self-exclusion', () => {
  const out = computeRecsForTab(['scifi'], {}, makeDeps());
  assert.equal(out.sourceCount, fx.expectations.sourceCount);
  assert.equal(out.anyEnriched, fx.expectations.anyEnriched);
  assert.deepEqual(
    out.discover.map(d => ({ tmdbId: d.tmdbId, score: d.score, title: d.title })),
    fx.expectations.discoverIdsByScore,
  );
  // Self-recommendation (Arrival -> Arrival, tmdbId 100) must not appear anywhere.
  assert.ok(!out.discover.some(d => d.tmdbId === 100));
  assert.ok(!out.recommended.some(r => r.tmdbId === 100));
});

test('pinned quirk: Recommended is empty because app-contract getRating is always truthy', () => {
  // tmdbId 400 (Solaris) matches the untouched catalog item "stalker", but
  // `if (status !== 'none' || rating) continue;` fires for every match since
  // getRating returns the truthy string 'none' for unrated items. Suspected
  // latent bug preserved verbatim from app.js — this test documents it and
  // will fail loudly if someone fixes it without updating the fixtures.
  const out = computeRecsForTab(['scifi'], {}, makeDeps());
  assert.equal(out.recommended.length, 0);
  // ...and catalog-matched candidates do NOT leak into Discover either.
  assert.ok(!out.discover.some(d => d.tmdbId === 400));
  assert.ok(!out.discover.some(d => d.tmdbId === 500));
});

test('with a falsy-when-unrated getRating, an untouched catalog match IS recommended', () => {
  // Shows the quirk is the only thing standing between Solaris and the
  // Recommended bucket: same data, rating accessor returning '' when unrated.
  const deps = makeDeps({
    getRating: (id, tab) => ((fx.state[tab] || {})[id] || {}).rating || '',
  });
  const out = computeRecsForTab(['scifi'], {}, deps);
  const solaris = out.recommended.find(r => r.tmdbId === 400);
  assert.ok(solaris, 'Solaris should be recommended');
  assert.equal(solaris.catalogTab, 'scifi');
  assert.equal(solaris.catalogItemId, 'stalker');
  // Primer (tmdbId 500) is also untouched -> recommended as well.
  const primer = out.recommended.find(r => r.tmdbId === 500);
  assert.ok(primer, 'Primer should be recommended');
  assert.equal(primer.catalogItemId, 'primer');
  // Moon (liked) still contributes as a source, not a candidate target.
  assert.ok(!out.recommended.some(r => r.tmdbId === 101));
});

test('time budget filters recommended items by the matched catalog item runtime', () => {
  const deps = makeDeps({
    getRating: (id, tab) => ((fx.state[tab] || {})[id] || {}).rating || '',
  });
  // Stalker is 161 min: fits 'long' (<=180) but not 'standard' (<=120).
  const long = computeRecsForTab(['scifi'], { timeBudget: 'long' }, deps);
  assert.ok(long.recommended.some(r => r.tmdbId === 400));
  const standard = computeRecsForTab(['scifi'], { timeBudget: 'standard' }, deps);
  assert.ok(!standard.recommended.some(r => r.tmdbId === 400));
  // Budget-dropped items don't fall back into Discover.
  assert.ok(!standard.discover.some(d => d.tmdbId === 400));
});

test('mood adds 5x tag-overlap to recommended scores', () => {
  const deps = makeDeps({
    getRating: (id, tab) => ((fx.state[tab] || {})[id] || {}).rating || '',
    // stalker has 2 overlapping mood tags in this stub
    moodScore: (item) => (item.id === 'stalker' ? 2 : 0),
  });
  const out = computeRecsForTab(['scifi'], { mood: 'cerebral' }, deps);
  const solaris = out.recommended.find(r => r.tmdbId === 400);
  assert.equal(solaris.score, 2 + 5 * 2); // base weight 2 (loved Arrival) + mood 10
  // mood 'any' adds nothing
  const outAny = computeRecsForTab(['scifi'], { mood: 'any' }, deps);
  assert.equal(outAny.recommended.find(r => r.tmdbId === 400).score, 2);
});

test('unknown tabs contribute nothing and anyEnriched is false without rec arrays', () => {
  const out = computeRecsForTab(['nonexistent-tab'], {}, makeDeps());
  assert.equal(out.sourceCount, 0);
  assert.equal(out.anyEnriched, false);
  assert.deepEqual(out.recommended, []);
  assert.deepEqual(out.discover, []);
});

test('moodScoreFromTags counts overlap; empty or missing tags score 0', () => {
  assert.equal(moodScoreFromTags(['A', 'B', 'C'], ['B', 'C', 'D']), 2);
  assert.equal(moodScoreFromTags([], ['B']), 0);
  assert.equal(moodScoreFromTags(null, ['B']), 0);
  assert.equal(moodScoreFromTags(['A'], []), 0);
});
