// Golden tests for lib/content-type.js — which reaction-tag set an item gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveContentType,
  TAB_DEFAULT_CONTENT_TYPE,
  CATEGORY_TO_CONTENT_TYPE,
} from '../lib/content-type.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/content-type-cases.json', import.meta.url), 'utf8'),
);

test('resolveContentType golden cases', () => {
  for (const c of fx.cases) {
    assert.equal(
      resolveContentType(c.item, c.sourceTab, c.activeTab),
      c.expected,
      c.name,
    );
  }
});

test('every tab default is a film-* or tv-* type', () => {
  for (const [tab, type] of Object.entries(TAB_DEFAULT_CONTENT_TYPE)) {
    assert.match(type, /^(film|tv)-/, `${tab} -> ${type}`);
  }
});

test('category map covers exactly the four mapped british-comedy categories', () => {
  assert.deepEqual(Object.keys(CATEGORY_TO_CONTENT_TYPE).sort(), [
    'game', 'news-comedy', 'panel', 'sitcom',
  ]);
  // 'specials' intentionally unmapped so it falls through to other categories.
  assert.equal(CATEGORY_TO_CONTENT_TYPE.specials, undefined);
});

test('TV tabs resolve to tv-* types and film tabs to film-*', () => {
  assert.equal(TAB_DEFAULT_CONTENT_TYPE['scifi'], 'film-scifi');
  assert.equal(TAB_DEFAULT_CONTENT_TYPE['scifi-tv'], 'tv-scifi');
  assert.equal(TAB_DEFAULT_CONTENT_TYPE['british-comedy'], 'tv-sitcom');
});
