// Golden tests for lib/sort.js — the tab sort filter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sortItems, RATING_SORT_ORDER } from '../lib/sort.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/sort-cases.json', import.meta.url), 'utf8'),
);

function makeCtx() {
  const entry = (id, tab) => (fx.state[tab] || {})[id] || {};
  return {
    activeTab: fx.activeTab,
    getRating: (id, tab) => entry(id, tab).rating || 'none',
    getLastUpdated: (id, tab) => entry(id, tab).lastUpdated || 0,
  };
}

test('default sort returns the same array instance untouched', () => {
  const ctx = makeCtx();
  const out = sortItems(fx.items, 'default', ctx);
  assert.equal(out, fx.items);
  assert.deepEqual(out.map(i => i.id), fx.items.map(i => i.id));
});

for (const sort of ['year', 'title', 'rating', 'updated']) {
  test(`sort=${sort} golden order`, () => {
    const ctx = makeCtx();
    const out = sortItems(fx.items, sort, ctx);
    assert.deepEqual(out.map(i => i.id), fx.expected[sort], `sort=${sort}`);
    // Input array must not be mutated
    assert.deepEqual(fx.items.map(i => i.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  });
}

test('rating order table is loved < liked < mixed < disliked < none', () => {
  assert.deepEqual(RATING_SORT_ORDER, {
    loved: 0, liked: 1, mixed: 2, disliked: 3, none: 4,
  });
});

test('unknown rating value sinks last like none', () => {
  const ctx = makeCtx();
  ctx.getRating = (id) => (id === 'a' ? 'bizarre' : 'loved');
  const out = sortItems(fx.items.slice(0, 2), 'rating', ctx);
  assert.deepEqual(out.map(i => i.id), ['b', 'a']);
});

test('items sort by their _watchlist_source_tab state, not the active tab', () => {
  const ctx = makeCtx();
  // 'f' has rating only under the crime tab; under scifi it would be none.
  const out = sortItems(fx.items, 'rating', ctx);
  assert.ok(out.findIndex(i => i.id === 'f') < out.findIndex(i => i.id === 'c'));
});
