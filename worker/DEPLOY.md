# WatchTrack Worker — Deployment Guide (v2)

This Cloudflare Worker is the brain of WatchTrack's Plex integration:

- Receives webhooks from your Plex server when you watch something
- Caches TMDB metadata for movies and TV (streaming providers, episode counts, etc.)
- Logs every Plex viewing event (durable history, queryable later)
- Exposes endpoints WatchTrack uses for sync and enrichment

Free tier of Cloudflare is fine for personal use.

## Prerequisites

You need:
- Cloudflare account (already have)
- Plex Pass on your Plex server (already have — lifetime)
- TMDB API key (v4 Read Access Token — get one at themoviedb.org/signup, then **Settings → API → Generate v4 token**)
- A shared secret you generate (32+ random characters)

## If upgrading from the v1 worker

The v1 worker had only EVENTS + CONFIG namespaces and one purpose: webhooks. The v2 worker adds two more namespaces and several new endpoints. **Your existing v1 setup keeps working** — v2 is a strict superset. Just:

1. Deploy the new worker.js
2. Add the two new KV bindings (VIEWED + METADATA)
3. Add the TMDB token to CONFIG KV

That's it. Existing Plex webhooks, EVENTS data, and shared-secret all continue to function.

## Step-by-step (fresh install)

### 1. Generate a shared secret

In your terminal:
```bash
openssl rand -hex 32
```

Or in any browser console:
```javascript
[...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('')
```

Save the output. You'll paste it into 4 places: Cloudflare CONFIG KV, Plex webhook URL, WatchTrack Settings, and any direct testing of endpoints.

### 2. Create five KV namespaces

Cloudflare dashboard → **Workers & Pages → KV** → **Create a namespace**. Name them exactly:

- `WATCHTRACK_EVENTS` — webhook event queue (TTL'd, drained by WatchTrack on poll)
- `WATCHTRACK_CONFIG` — shared secret + TMDB token
- `WATCHTRACK_VIEWED` — durable Plex viewing history (no TTL, every play kept)
- `WATCHTRACK_METADATA` — TMDB enrichment cache (30-day TTL)
- `WATCHTRACK_PROMOTIONS` — orphan promotions persisted across devices (no TTL)

### 3. Populate CONFIG KV

Click into `WATCHTRACK_CONFIG`. Add these keys:

| Key | Value |
|---|---|
| `secret` | the shared secret from step 1 |
| `tmdb_token` | your TMDB v4 Read Access Token |
| `plex_url` | your Plex server base URL (no trailing slash) — populated automatically by WatchTrack's "Save to Worker" button |
| `plex_token` | your X-Plex-Token — populated automatically by WatchTrack's "Save to Worker" button |

`plex_url` and `plex_token` can be left blank initially; WatchTrack writes them via `POST /plex/configure` the first time you click "Save to Worker" in Settings. They are required for any of the `/plex/*` proxy endpoints to function.

### 4. Create the Worker

**Important:** create a code worker, NOT a "static assets" worker. The path that works:
1. **Workers & Pages → Create**
2. Select **Start with Hello World** (NOT "Connect to Git")
3. Name it `watchtrack-plex`
4. Click Deploy
5. Click **Edit code** at top right
6. **Replace all** code with the contents of `worker.js` from this folder
7. Click **Save and deploy**

Save the URL — looks like `https://watchtrack-plex.YOURNAME.workers.dev`.

### 5. Bind all five KV namespaces

Worker page → **Settings tab → Bindings → Add binding** (×5):

| Variable name | KV namespace |
|---|---|
| `EVENTS` | WATCHTRACK_EVENTS |
| `CONFIG` | WATCHTRACK_CONFIG |
| `VIEWED` | WATCHTRACK_VIEWED |
| `METADATA` | WATCHTRACK_METADATA |
| `PROMOTIONS` | WATCHTRACK_PROMOTIONS |

Variable names are CASE-SENSITIVE and must match exactly. The Worker code references `env.EVENTS`, `env.CONFIG`, etc.

After adding all four, click **Save and deploy**.

### 6. Verify the worker

Visit `https://watchtrack-plex.YOURNAME.workers.dev/health` — should respond `WatchTrack-Plex bridge online (v5.3 — DELETE in CORS)`.

Then test the secret + KV bindings:
```
https://watchtrack-plex.YOURNAME.workers.dev/events?secret=YOUR_SHARED_SECRET&since=0
```
Expected: `{"events":[]}`

Then test TMDB:
```
https://watchtrack-plex.YOURNAME.workers.dev/metadata/lookup?secret=YOUR_SHARED_SECRET&title=Inception&year=2010&type=movie
```
Expected: A JSON blob with `found: true`, `tmdbId: 27205`, watchProviders, etc.

If `found: false`, the title genuinely doesn't match anything in TMDB. If you get `{"error": "TMDB token not configured"}`, the `tmdb_token` key in CONFIG KV is missing or misnamed.

### 7. Plex webhook (if not already done in v1)

app.plex.tv → Settings → top-right gear → your server → **Webhooks** → **Add Webhook**:

```
https://watchtrack-plex.YOURNAME.workers.dev/webhook/YOUR_SHARED_SECRET
```

Save. Plex will POST to that URL every time you scrobble or rate something.

### 8. WatchTrack Settings (existing — unchanged from v1)

Settings → Plex Webhook Bridge:
- Worker URL: `https://watchtrack-plex.YOURNAME.workers.dev` (no path, no secret)
- Shared Secret: your secret
- Test poll → should say "Worker reachable, secret accepted."
- Save.

## Endpoints reference

- `GET /health` — Health check (no auth)
- `POST /webhook/{secret}` — Plex Pass webhook receiver. Library-section whitelist applies (1, 2 only).
- `GET /events?secret=X&since=TS` — WatchTrack polls for new scrobble events
- `POST /events/ack` — WatchTrack acks events processed (deletes from EVENTS)
- `GET /metadata/lookup?secret=X&title=T&year=Y&type=movie|tv` — TMDB enrichment, cached 30 days
- `POST /metadata/bulk` — Batch TMDB lookups (≤50 per call)
- `POST /viewed/ingest` — Bulk-ingest historical Plex views (used once for backfill from `/status/sessions/history/all`)
- `GET /viewed/list?secret=X&cursor=...` — Paginated list of every Plex view (for the WT History modal)
- `POST /promotions/add` — Persist orphan promotion to catalog
- `GET /promotions?secret=X` — List all stored promotions
- `DELETE /promotions/{tab}/{itemId}?secret=X` — Remove a promotion
- `POST /plex/configure` — Body `{ secret, plexUrl, plexToken }`. Stores Plex URL + token in CONFIG KV. Used once by WatchTrack's "Save to Worker" button.
- `GET /plex/identity?secret=X` — Server-to-server probe of Plex `/identity`. Replaces the direct browser fetch that breaks under the seedbox's TLS handshake.
- `GET /plex/library?secret=X` — Returns `{ items: [{title, year, ratingKey, type, librarySectionID}, ...] }` aggregated across every movie/show section.
- `POST /plex/scrobble` — Body `{ secret, ratingKey }`. Marks the item watched on Plex.
- `GET /plex/history?secret=X&start=N&size=N` — Returns Plex's raw paginated `MediaContainer` for `/status/sessions/history/all`.

## v5.6 — streaming-leaving alerts

The Worker can now monitor TMDB watch/providers for the user's queued
and watching items, and queue notifications when a provider drops a
title. Setup needs three small additions to a working v5.5 deployment.

### 1. Create a sixth KV namespace

Workers & Pages → KV → Create a namespace, name it `WATCHTRACK_ALERTS`.

Bind it to the Worker as `ALERTS`:

| Variable name | KV namespace |
|---|---|
| `ALERTS` | WATCHTRACK_ALERTS |

Save and deploy.

### 2. Add a Cron Trigger

Worker → **Settings → Triggers → Cron Triggers → Add Cron Trigger**.

Cron expression: `0 13 * * *` (daily, 13:00 UTC = 8 AM Central).

The Worker's `scheduled` handler calls `runAlertsCheck` automatically
when the trigger fires. No URL needs to be configured on the trigger
itself — the platform routes `scheduled` events to the Worker directly.

### 3. (Optional) Manual trigger for testing

Visit `https://watchtrack-plex.YOURNAME.workers.dev/cron/check-alerts?secret=YOUR_SHARED_SECRET`.

You should get JSON like `{"usersChecked":1,"notificationsQueued":0,"lookupsRun":12,"ranAt":...}`. Subsequent runs detect provider changes between TMDB
fetches and queue notifications under `ALERTS:notif:{userHash}:{ts}`.

### Storage usage

Worst case for one user with 50 queued items: one snapshot value (~5 KB)
plus a notification queue of typically 0–3 entries during a streaming
month, each ≤ 0.5 KB. Free tier KV (1,000 writes/day, 100,000 reads/day)
is more than enough for personal use.

### Endpoints reference (v5.6 additions)

- `POST /alerts/subscribe` — body `{ secret, userHash, region, items }`. The client posts its current queued+watching item manifest each time the subscription is refreshed.
- `POST /alerts/unsubscribe` — body `{ secret, userHash }`.
- `GET /alerts/status?secret=X&user=HASH` — current subscription record.
- `GET /alerts/notifications?secret=X&user=HASH&since=TS` — pending notifications since the given timestamp.
- `POST /alerts/notifications/seen` — body `{ secret, userHash, keys }` clears delivered notifications.
- `GET /cron/check-alerts?secret=X` — manual trigger of the daily walk.

### Why polling, not Web Push

Web Push from a Cloudflare Worker requires implementing VAPID JWT
signing and AES128GCM payload encryption inline — a few hundred lines
of crypto code and a one-time VAPID keypair. For a single-user
personal tracker that opens daily, the polling model in app.js
(`alertsCheckNotifications` on visibility-change and bootstrap)
delivers the same UX with simpler code and no cross-device key
management. If a future iteration needs out-of-app delivery (e.g.
notifications while WatchTrack is closed), Web Push can layer on top
without changing the existing endpoints.

## Quotas & cost

- **Workers free tier:** 100,000 requests/day. Personal use is well within.
- **KV free tier:** 1,000 writes + 100,000 reads/day. Heaviest day = first ingest of full history (~340 writes).
- **TMDB:** No hard rate limits at our usage; ~720 catalog enrichment calls would be one-time, then cache.
- **No credit card required** for any of these.

## Library whitelist

The worker hardcodes `LIBRARY_WHITELIST = new Set(['1', '2'])`. If you add a new Plex library section, edit `worker.js`, update the set, redeploy. Anything from a non-whitelisted library is silently dropped at ingest.

## Updating the Worker

Cloudflare → your worker → Edit code → replace contents → Save and deploy. KV bindings persist.

## Security

The shared secret is the only auth. If it leaks: rotate by updating in 3 places (Cloudflare CONFIG KV, Plex webhook URL, WatchTrack Settings). The TMDB token is read-only and only allows TMDB queries — leak is low-impact.
