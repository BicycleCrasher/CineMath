// Tests for the Worker's pure helpers (worker/worker.js named exports).
// Node 22 provides CompressionStream/DecompressionStream and WebCrypto
// natively, matching the Cloudflare Workers runtime for these helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeTitle,
  gzipString,
  safeJsonParse,
  b64uEncode,
  b64uDecode,
} from '../worker/worker.js';
import { plexNormalizeKeyTitleOnly } from '../lib/normalize.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/worker-normalize-cases.json', import.meta.url), 'utf8'),
);

test('normalizeTitle golden cases', () => {
  for (const c of fx.cases) {
    assert.equal(normalizeTitle(c.title), c.expected, `normalizeTitle(${JSON.stringify(c.title)})`);
  }
});

test('normalizeTitle stays in lockstep with app plexNormalizeKeyTitleOnly (intentional duplication)', () => {
  for (const c of fx.cases) {
    assert.equal(
      normalizeTitle(c.title),
      plexNormalizeKeyTitleOnly(c.title),
      `parity for ${JSON.stringify(c.title)}`,
    );
  }
});

async function gunzipBytes(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

test('gzipString roundtrips through DecompressionStream', async () => {
  const payload = JSON.stringify({ title: 'Amélie', tags: ['Stayed with me'], n: 42 });
  const gz = await gzipString(payload);
  assert.ok(gz instanceof Uint8Array);
  // gzip magic bytes
  assert.equal(gz[0], 0x1f);
  assert.equal(gz[1], 0x8b);
  assert.equal(await gunzipBytes(gz), payload);
});

test('gzipString compresses repetitive payloads and roundtrips empty string', async () => {
  const big = 'watched,'.repeat(10000);
  const gz = await gzipString(big);
  assert.ok(gz.length < big.length / 10, `expected strong compression, got ${gz.length}`);
  assert.equal(await gunzipBytes(gz), big);

  const empty = await gzipString('');
  assert.equal(await gunzipBytes(empty), '');
});

test('safeJsonParse returns parsed value or fallback', () => {
  assert.deepEqual(safeJsonParse('{"a":1}', null), { a: 1 });
  assert.equal(safeJsonParse('not json', 'fallback'), 'fallback');
  assert.equal(safeJsonParse(undefined, 7), 7);
  assert.deepEqual(safeJsonParse('[1,2]', []), [1, 2]);
});

test('b64uEncode/b64uDecode roundtrip and use URL-safe alphabet', () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
  const enc = b64uEncode(bytes);
  assert.doesNotMatch(enc, /[+/=]/, 'must be base64url without padding');
  assert.deepEqual(new Uint8Array(b64uDecode(enc)), bytes);
});
