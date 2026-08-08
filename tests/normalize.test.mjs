// Golden tests for lib/normalize.js — the Plex/catalog title-matching keys.
// Fixtures are language-portable JSON (tests/fixtures/normalize-cases.json)
// so a Kotlin Multiplatform port can assert the exact same cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plexNormalizeKey, plexNormalizeKeyTitleOnly } from '../lib/normalize.js';

const cases = JSON.parse(
  readFileSync(new URL('./fixtures/normalize-cases.json', import.meta.url), 'utf8'),
);

test('plexNormalizeKey golden cases', () => {
  for (const c of cases.movieKey) {
    assert.equal(
      plexNormalizeKey(c.title, c.year),
      c.expected,
      `plexNormalizeKey(${JSON.stringify(c.title)}, ${JSON.stringify(c.year)})`,
    );
  }
});

test('plexNormalizeKeyTitleOnly golden cases', () => {
  for (const c of cases.titleOnly) {
    assert.equal(
      plexNormalizeKeyTitleOnly(c.title),
      c.expected,
      `plexNormalizeKeyTitleOnly(${JSON.stringify(c.title)})`,
    );
  }
});

test('movie key is titleOnly key plus |year suffix', () => {
  for (const c of cases.movieKey) {
    if (!c.title) continue;
    const full = plexNormalizeKey(c.title, c.year);
    const titlePart = plexNormalizeKeyTitleOnly(c.title);
    assert.ok(
      full.startsWith(titlePart + '|'),
      `${full} should start with ${titlePart}|`,
    );
  }
});

test('undefined title returns empty string', () => {
  assert.equal(plexNormalizeKey(undefined, 2000), '');
  assert.equal(plexNormalizeKeyTitleOnly(undefined), '');
});
