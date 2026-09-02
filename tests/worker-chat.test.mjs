// Tests for /chat candidate sanitization in worker/worker.js (issue #4).
//
// Every candidate field is interpolated into the AI prompt, so an over-long
// title, pitch or tag inflates the token budget and can push the reply past
// the 400-token output cap into truncated JSON. These tests capture the
// prompt handed to env.AI.run and assert each field is capped.
//
// Same harness as tests/worker-providers.test.mjs: import the Worker module
// directly and call worker.fetch with in-memory fakes. env.AI is a local stub,
// so nothing leaves the process and globalThis.fetch is never touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/worker.js';

const SECRET = 'test-shared-secret';
const BASE = 'https://worker.test';

function memKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = store.has(key) ? store.get(key) : null;
      if (v == null) return null;
      if (opts === 'json' || (opts && opts.type === 'json')) {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v;
    },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
    async list(opts = {}) {
      const prefix = opts.prefix || '';
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort()
        .map(name => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
    _store: store,
  };
}

// Captures the messages array so a test can inspect the rendered prompt.
function makeEnv() {
  const captured = { calls: [] };
  return {
    env: {
      CONFIG: memKV({ secret: SECRET }),
      EVENTS: memKV(),
      VIEWED: memKV(),
      METADATA: memKV(),
      PROMOTIONS: memKV(),
      SYNC_KV: memKV(),
      ALERTS: memKV(),
      USERS: memKV(),
      AI: {
        async run(model, opts) {
          captured.calls.push({ model, opts });
          return { response: { reply: 'ok', pick: null } };
        },
      },
    },
    captured,
  };
}

async function chat(env, body) {
  const resp = await worker.fetch(new Request(BASE + '/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, userHash: 'abc123', message: 'something funny', ...body }),
  }), env);
  const text = await resp.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: resp.status, body: parsed };
}

// The line describing one candidate in the prompt.
function candidateLine(captured, itemId) {
  const messages = captured.calls[0].opts.messages;
  const userMsg = messages[messages.length - 1].content;
  return userMsg.split('\n').find(l => l.includes(`itemId:"${itemId}"`)) || '';
}

test('candidate title is capped at 300 chars', async () => {
  const { env, captured } = makeEnv();
  const r = await chat(env, {
    candidates: [{ tabId: 'comedy', itemId: 'x-1', title: 'T'.repeat(5000), year: 1999, type: 'movie' }],
  });
  assert.equal(r.status, 200);
  const line = candidateLine(captured, 'x-1');
  assert.ok(line.includes('T'.repeat(300)), 'keeps the first 300 chars');
  assert.ok(!line.includes('T'.repeat(301)), 'drops everything past 300');
});

test('candidate dir is capped at 100 chars', async () => {
  const { env, captured } = makeEnv();
  await chat(env, {
    candidates: [{ tabId: 'comedy', itemId: 'x-2', title: 'Fine', dir: 'D'.repeat(900) }],
  });
  const line = candidateLine(captured, 'x-2');
  assert.ok(line.includes('D'.repeat(100)));
  assert.ok(!line.includes('D'.repeat(101)));
});

test('pitch stays capped at 200 chars after the refactor', async () => {
  const { env, captured } = makeEnv();
  await chat(env, {
    candidates: [{ tabId: 'comedy', itemId: 'x-3', title: 'Fine', pitch: 'P'.repeat(900) }],
  });
  const line = candidateLine(captured, 'x-3');
  assert.ok(line.includes('P'.repeat(200)));
  assert.ok(!line.includes('P'.repeat(201)));
});

test('tags are capped per tag as well as by count', async () => {
  const { env, captured } = makeEnv();
  await chat(env, {
    candidates: [{
      tabId: 'comedy', itemId: 'x-4', title: 'Fine',
      tags: ['G'.repeat(500), 'b', 'c', 'd', 'e', 'f', 'g'],
    }],
  });
  const line = candidateLine(captured, 'x-4');
  assert.ok(line.includes('G'.repeat(40)), 'first tag truncated to 40');
  assert.ok(!line.includes('G'.repeat(41)));
  assert.ok(!line.includes(', f'), 'only the first 5 tags survive');
});

test('runtime, tabId and itemId are capped too', async () => {
  const { env, captured } = makeEnv();
  await chat(env, {
    candidates: [{
      tabId: 'A'.repeat(400), itemId: 'B'.repeat(400),
      title: 'Fine', runtime: 'R'.repeat(400),
    }],
  });
  const messages = captured.calls[0].opts.messages;
  const userMsg = messages[messages.length - 1].content;
  assert.ok(userMsg.includes('A'.repeat(100)) && !userMsg.includes('A'.repeat(101)));
  assert.ok(userMsg.includes('B'.repeat(100)) && !userMsg.includes('B'.repeat(101)));
  assert.ok(userMsg.includes('R'.repeat(40)) && !userMsg.includes('R'.repeat(41)));
});

test('a hostile payload cannot blow up the prompt size', async () => {
  const { env, captured } = makeEnv();
  // 200 candidates (capped to 50) each carrying ~10 KB of text.
  const candidates = Array.from({ length: 200 }, (_, i) => ({
    tabId: 'comedy', itemId: `spam-${i}`, title: 'T'.repeat(5000),
    dir: 'D'.repeat(5000), pitch: 'P'.repeat(5000),
    tags: Array.from({ length: 50 }, () => 'G'.repeat(500)),
  }));
  const r = await chat(env, { candidates });
  assert.equal(r.status, 200);
  const messages = captured.calls[0].opts.messages;
  const userMsg = messages[messages.length - 1].content;
  // 50 candidates x (300 + 100 + 200 + 5*40 tags + framing) stays well under
  // 64 KB; without the caps this payload renders about 2 MB of prompt.
  assert.ok(userMsg.length < 64 * 1024, `prompt was ${userMsg.length} bytes`);
  assert.equal((userMsg.match(/itemId:"spam-/g) || []).length, 50, 'candidate count still capped at 50');
});

test('missing and non-array candidate fields degrade safely', async () => {
  const { env, captured } = makeEnv();
  const r = await chat(env, {
    candidates: [
      { tabId: 'comedy', itemId: 'x-5' },
      { tabId: 'comedy', itemId: 'x-6', title: null, tags: 'not-an-array', pitch: undefined },
      null,
    ],
  });
  assert.equal(r.status, 200);
  const line = candidateLine(captured, 'x-6');
  assert.ok(line.length > 0, 'renders a line rather than throwing');
});
