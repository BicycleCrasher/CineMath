# SRR → D1 `item_state` cutover runbook

Status: **dual-write phase** (shipped on branch `overnight/w2-srr-d1`).
The SYNC_KV blob (`/sync/get` + `/sync/put`) is still the canonical
Status/Rating/Reaction (SRR) store. The app now additionally:

- marks items dirty in `touchEntry()` on every SRR change,
- batch-POSTs dirty items to `POST /state/upsert` when a tab is left
  (`switchTab`) and when an expanded item card is collapsed,
- shadow-reads `GET /state/tab` on tab open and `GET /state/counts` on
  app open (results are cached/logged, **never applied to state**).

All new client calls are guarded and silent on failure — the app is
byte-for-byte identical in behavior when the Worker is unreachable.
Nothing below happens automatically. Cutover is your call, run by hand.

## What's new in this branch

| Piece | Where |
| --- | --- |
| Schema | `worker/migrations/004_item_state.sql` — `item_state(user_hash, item_id)` PK, per-item `last_updated` |
| Endpoints | `GET /state/tab`, `POST /state/upsert`, `GET /state/counts`, `POST /cron/migrate-state-to-d1` in `worker/worker.js` |
| Client hooks | `stateD1*` functions in `app.js` (near the sync section) + 4 one-line call sites |
| Tests | `tests/worker-state.test.mjs` (node:test; real SQLite via `node:sqlite`) |

Conflict policy everywhere:
`INSERT ... ON CONFLICT(user_hash, item_id) DO UPDATE ... WHERE
excluded.last_updated > item_state.last_updated` — per-item newest
wins; stale writes are no-ops; re-running anything is idempotent.

Auth matches the legacy `/sync/*` routes: shared secret + client-side
`SHA-256(plex_token)` user hash. (When the v9 bearer refactor reaches
these routes, switch them to `requireBearer` in the same pass as
`/sync/*`.)

## Morning-after steps (manual, in order)

Everything below runs against **production** — do it from your own
machine, not a sandbox. `$WORKER` = your worker URL, `$SECRET` = the
shared secret from CONFIG KV.

### 1. Deploy

Merge the branch; the deploy-worker GitHub Action ships `worker.js`.
(Or `cd worker && wrangler deploy` manually.)

### 2. Create the prod table

```sh
cd worker
wrangler d1 migrations apply watchtrack-viewed --remote
```

or paste `migrations/004_item_state.sql` into the Cloudflare dashboard
D1 console. Idempotent (`IF NOT EXISTS` throughout).

### 3. Run the one-time KV backfill

```sh
curl -X POST "$WORKER/cron/migrate-state-to-d1?secret=$SECRET"
```

Expected response shape:

```json
{ "blobs": 1, "itemsScanned": N, "upserted": N, "skippedStale": 0,
  "parseErrors": 0, "rowErrors": 0, "ranAt": ... }
```

Run it a second time to prove idempotency: `upserted` should be 0 (or
only items you touched in the app between the two runs) and
`skippedStale` ≈ N. Safe to re-run any time — dual-write and the
backfill use the same newest-wins upsert.

Notes:
- It walks both `user:{hash}` (legacy) and `state:{userId}` (v9) blobs.
- Blob entries carry no title/year, so those columns start NULL and
  fill in as the app's dual-write path touches items.
- Not chunked: SYNC_KV holds one blob per user (single-digit keys). If
  it ever 1101s on CPU, split by running it once per user after
  temporarily filtering — or just re-run; completed rows skip as stale.

### 4. Verify

```sh
# Aggregates match your mental model of the app:
curl "$WORKER/state/counts?secret=$SECRET&user=$YOUR_HASH"

# Spot-check one tab against what the app shows:
curl "$WORKER/state/tab?secret=$SECRET&user=$YOUR_HASH&tab=scifi"
```

`$YOUR_HASH` is `SHA-256(plex_token)` hex — grab it from the app
console with `await getUserHash()`.

Direct SQL (dashboard console or `wrangler d1 execute watchtrack-viewed
--remote --command ...`):

```sql
SELECT COUNT(*) FROM item_state;
SELECT tab, status, COUNT(*) FROM item_state GROUP BY tab, status;
-- Recent dual-writes arriving? source is 'app-tab-close' / 'app-item-close':
SELECT source, COUNT(*), MAX(last_updated) FROM item_state GROUP BY source;
```

Then use the app normally for a few days and re-check that
`app-*`-sourced rows keep appearing and their SRR values match the app.

### 5. Future flag-flip (NOT part of this branch)

When D1 has proven itself (rows tracking the app faithfully for a
while), the cutover is a client change:

1. In `syncOnLaunch()` / tab open, apply `GET /state/tab` results to
   `state` (per-item `lastUpdated` merge, same algorithm as
   `syncApplyRemote`) instead of shadow-reading.
2. Make `stateD1PushDirty` the primary write path (add a debounce like
   `syncMarkDirty`'s 5s if desired).
3. Keep the SYNC_KV blob for `settings` only (it still syncs Plex
   creds, region, subscriptions — `item_state` deliberately does not).
4. After a comfortable soak, stop merging blob `state` on pull.

Suggest gating step 1–2 behind a localStorage flag
(e.g. `watchtrack-srr-d1-canonical=1`) so a single device can trial it.

## Rollback

Dual-write phase is riskless to abandon:

- **Client:** revert the app.js commit (hooks are additive; the four
  call sites are `typeof`-guarded so partial reverts also can't throw).
- **Worker:** revert the worker.js commit — the `/state/*` routes
  disappear; nothing else references `item_state`.
- **Data:** `DROP TABLE item_state;` (or just leave it — nothing reads
  it once the routes are gone). The SYNC_KV blob was never modified by
  any of this, so there is nothing to restore.
- **After a future flag-flip:** flip the flag back; the blob dual-write
  never stopped, so KV is at most one debounce behind D1. Worst case,
  R2 daily snapshots (`/cron/backup-state`) still cover the blob.

## Known caveats (recorded on purpose)

- PK is `(user_hash, item_id)` per the store design: an item id that
  exists in two tabs collapses to one row whose `tab` is the most
  recently updated one. SRR is per-title in practice, so acceptable;
  revisit if per-tab divergence ever matters.
- `/state/*` uses the legacy secret+hash auth, not v9 bearer — align
  when `/sync/*` gets its bearer-only pass.
- `GET /state/tab` shadow reads add one Worker/D1 round trip per tab
  switch. Fine at this scale; drop the call (one line in `switchTab`)
  if it ever shows up in D1 metrics.
