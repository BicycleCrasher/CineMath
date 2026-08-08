// Golden tests for lib/runtime.js — runtime parsing and time-budget filtering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIME_BUDGETS, parseRuntimeMin, fitsTimeBudget } from '../lib/runtime.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/runtime-cases.json', import.meta.url), 'utf8'),
);

test('parseRuntimeMin golden cases', () => {
  for (const c of fx.parseRuntime) {
    assert.equal(
      parseRuntimeMin({ runtime: c.runtime }),
      c.expected,
      `parseRuntimeMin(${JSON.stringify(c.runtime)})${c.note ? ' — ' + c.note : ''}`,
    );
  }
});

test('parseRuntimeMin handles missing item / missing runtime', () => {
  assert.equal(parseRuntimeMin(null), null);
  assert.equal(parseRuntimeMin(undefined), null);
  assert.equal(parseRuntimeMin({}), null);
  assert.equal(parseRuntimeMin({ runtime: { odd: 'object' } }), null);
});

test('fitsTimeBudget golden cases', () => {
  for (const c of fx.fitsBudget) {
    assert.equal(
      fitsTimeBudget({ runtime: c.runtime }, c.budget),
      c.expected,
      `fitsTimeBudget(${JSON.stringify(c.runtime)}, ${JSON.stringify(c.budget)})`,
    );
  }
});

test('budget buckets escalate: quick < short < standard < long < any', () => {
  assert.equal(TIME_BUDGETS.quick.max, 30);
  assert.equal(TIME_BUDGETS.short.max, 90);
  assert.equal(TIME_BUDGETS.standard.max, 120);
  assert.equal(TIME_BUDGETS.long.max, 180);
  assert.equal(TIME_BUDGETS.any.max, Infinity);
});

test('unknown budget key keeps everything', () => {
  assert.equal(fitsTimeBudget({ runtime: '500 min' }, 'nonexistent-bucket'), true);
});
