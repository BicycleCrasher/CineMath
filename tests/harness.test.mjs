// Smoke test proving the node:test harness runs. Real suites live alongside
// this file; fixtures under tests/fixtures/ are language-portable JSON used
// as golden parity cases for any future port.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('harness boots', () => {
  assert.equal(1 + 1, 2);
});
