# Cloudflare Worker — Sync Patch (v5.28.0)

Adds two endpoints — `GET /sync/get` and `PUT /sync/put` — backed by a new KV
namespace. The client (`app.js`) auto-pulls on launch and auto-pushes 5 seconds
after the last state change, keyed by a SHA-256 hash of the user's Plex token.

## 1. Create the KV namespace

In your Cloudflare dashboard:

1. Workers & Pages → KV → Create a namespace
2. Name: `WATCHTRACK_SYNC` (the binding name in your Worker is what matters; the
   namespace name itself is cosmetic)
3. Note the namespace ID

## 2. Bind it in `wrangler.toml`

Add a new entry alongside your existing 5 KV bindings:

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_NAMESPACE_ID_HERE"
```

The binding name `SYNC_KV` is what the Worker code below references.

## 3. Add the endpoint handlers

Inside your existing Worker's `fetch` handler, add the following two route
branches alongside the existing `/metadata/lookup`, `/plex/scrobble`, etc.
handlers:

```js
// === Sync endpoints (v5.28.0) ===
if (url.pathname === '/sync/get' && request.method === 'GET') {
  const userHash = url.searchParams.get('user');
  const secret = url.searchParams.get('secret');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  if (!userHash || !/^[a-f0-9]{16,64}$/i.test(userHash)) {
    return new Response('bad user hash', { status: 400 });
  }
  const data = await env.SYNC_KV.get(`user:${userHash}`, 'json');
  if (!data) {
    return new Response('null', {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

if (url.pathname === '/sync/put' && request.method === 'PUT') {
  const userHash = url.searchParams.get('user');
  const secret = url.searchParams.get('secret');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  if (!userHash || !/^[a-f0-9]{16,64}$/i.test(userHash)) {
    return new Response('bad user hash', { status: 400 });
  }
  const bodyText = await request.text();
  if (bodyText.length > 25 * 1024 * 1024) {  // 25 MB KV limit
    return new Response('payload too large', { status: 413 });
  }
  // Validate it parses as JSON
  try {
    JSON.parse(bodyText);
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }
  // Store raw — saves a re-stringify
  await env.SYNC_KV.put(`user:${userHash}`, bodyText, {
    expirationTtl: 60 * 60 * 24 * 365,  // 1 year TTL — auto-expire dead users
  });
  return new Response('ok');
}
```

The shared secret check uses your existing `WEBHOOK_SECRET` — no new secret
needed. Authentication model:

- **Plex token** = identity (hashed client-side, never sent to Worker as plaintext)
- **WEBHOOK_SECRET** = authorization (proves the requester is using a configured
  WatchTrack client)

A bad actor with the Worker URL but not the secret can't read or write anything.

## 4. CORS (if needed)

If your Worker doesn't already wildcard-allow CORS, add headers to the responses:

```js
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
// Handle preflight
if (request.method === 'OPTIONS' && url.pathname.startsWith('/sync/')) {
  return new Response(null, { status: 204, headers: cors });
}
// Add cors to existing responses by spreading: { ...cors, 'content-type': '...' }
```

## 5. Deploy

```bash
cd worker
wrangler deploy
```

Verify with:

```bash
curl 'https://YOUR_WORKER_URL/sync/get?user=test&secret=YOUR_SECRET'
# expect: 404 null

curl -X PUT 'https://YOUR_WORKER_URL/sync/put?user=test&secret=YOUR_SECRET' \
  -H 'content-type: application/json' \
  -d '{"v":1,"hello":"world"}'
# expect: ok

curl 'https://YOUR_WORKER_URL/sync/get?user=test&secret=YOUR_SECRET'
# expect: {"v":1,"hello":"world"}
```

## 6. On the WatchTrack client

After deploying the Worker patch, open the WatchTrack app on any configured
device:

- Settings → **Cross-Device Sync** card → status should change from
  "NEEDS PLEX + WORKER" to "READY" or "ACTIVE"
- Tap **Push now** to write your current state to the Worker
- On a second device with the same Plex token configured, open the app — it
  will auto-pull on launch, status becomes "IN SYNC"

## Storage / cost considerations

- KV free tier: 100 K reads / 1 K writes per day. Each app-launch is one read;
  each settings change → debounced into one write (max ~10/min during heavy
  rating sessions).
- KV value size limit: 25 MB. Client caps at 2 MB to leave headroom — a state
  blob with thousands of catalog entries is typically 50-500 KB.
- TTL: 1 year. If a user stops using the app for >1 year, their sync blob is
  garbage-collected automatically.

## Future hardening

- Add a `version` field on the blob and reject lower versions (rolling upgrades)
- Add a `deviceId` UUID per client and store last 5 device IDs that pushed (for
  conflict diagnostics)
- Compress blobs with `Compression Streams API` before PUT (browser native, no deps)
