# Changelog

All notable changes to WatchTrack are tracked here. Versions follow `major.moderate.minor`:

- **Major** — architectural shift or fundamentally new core capability
- **Moderate** — significant feature addition (new tabs, new systems)
- **Minor** — bug fix, content correction, or non-architectural refinement

The `service-worker.js` cache name (`scifi-tracker-vN`) tracks deployments rather than semantic versions, and is bumped any time cached assets change. The mapping is noted per release.

---

## 6.6.0 — 2026-05-10
**Service worker cache:** `scifi-tracker-v104` → `v105`

### Watch Card refinement + chat-pass tracking

Two follow-ups to v6.5's chat: actionable buttons that match the
"talk to bot, click watch" loop, and learning from rejection.

**Watch Card buttons.** The previous "Mark watching / Queue it / Pass"
trio replaced with **Watch Trailer**, **Play Now**, and **Pass**.

- **Watch Trailer** — same YouTube link as before, just renamed for
  consistency with the action vocabulary.
- **Play Now** — tries Plex deep link first if the item is in your
  library; falls back to JustWatch via the TMDB watchProviders region
  link if not. Hidden if neither's available. Clicking the Plex
  variant also flips status to `watching` so the rest of the app
  reflects the action, matching the existing item-card Play on Plex
  behavior.
- **Pass** — kept, now drives the new pass-tracking system.

**Chat-pass tracking.** New localStorage map `watchtrack-chat-passes`
keyed by `tabId:itemId` records every Pass click in the chat. The
chat candidate builder now:

- Drops anything with **2 or more passes** entirely (and the second
  pass also calls `setStatus('skip', ...)` so it's filtered everywhere
  in the app).
- **Deprioritizes** items with one pass — they sink in the candidate
  ranking but stay reachable in case the user changes their mind.

The bot was getting smart enough at picking from your taste data
that letting it re-suggest something you'd already passed on felt
sticky. Two strikes is the right balance for "I'm not interested" —
one accidental click doesn't permanently kill an item, two does.

The pass map syncs across devices through the existing IndexedDB →
SYNC_KV cross-device sync (it's a regular localStorage key under
the `watchtrack-` prefix), so passing on the phone applies on the TV
too.

---

## 6.5.0 — 2026-05-10
**Service worker cache:** `scifi-tracker-v103` → `v104`
**Requires Worker patch:** worker.js v5.12. New `[ai]` binding in `wrangler.toml` (Workers AI). Token already has `Workers AI: Read` from the most recent edit, no further setup.

### Round 2 / R9 — Workers AI chat: "Tell me what to watch"

The product vision's first concrete shape. New wizard root option, right above "Looking for something to watch":

> **Tell me what to watch** — Talk to the bot, it picks one for you.

Tap → chat modal opens → freeform input ("something tense but not bleak", "rainy-day comfort", "a Coen brothers I haven't seen yet") → bot responds with a 1-2 sentence reply naming a pick AND a "Watch Card" rendering of that pick: title, year, director, runtime, pitch, why-it's-being-suggested, trailer button, streaming providers in your region, and Mark watching / Queue / Pass actions.

**Worker side (v5.12):**
- New `[ai]` binding declared in `wrangler.toml` (Workers AI inference, no namespace ID required).
- `POST /chat` accepts `{ secret, userHash, message, history?, candidates? }`. Pulls last 30 viewing-history rows from D1 (now possible because of v6.4's migration), composes a system + context + user prompt, calls `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with a strict-JSON output instruction, and returns `{ reply, pick: { tabId, itemId, why } | null }`.
- The model is told to ground recommendations in observable taste signals — recent viewing patterns, applied reaction tags, director affinity — so the "why" line cites specific evidence rather than generic mood-matching.
- Failure modes are handled: missing AI binding → 500 with explanation; D1 read failure → degrade gracefully (still respond, just less personalized); JSON parse failure → return raw text in `reply`, set `pick: null`.

**Client side:**
- `voiceSearchInto` reused from the search modals — the chat input has a 🎤 button. Free-form mood queries are exactly the case where typing on a Bravia remote is brutal.
- `buildChatCandidates()` walks every catalog tab, weights queued (3) > watching (2) > unrated (1) > rated (skip), caps at 50. The bot picks from this curated subset rather than the full ~720-item catalog (token budget).
- `_chatHistory` keeps the last 8 turns for multi-turn context within one session. Cleared on each modal open.
- Watch Card rendering reuses existing helpers (`getTrailerKey`, `getEnrichmentForItem`, `getStreamingRegion`) so pick metadata matches what the rest of the app shows.
- Cmd/Ctrl+Enter sends; Enter alone inserts a newline (textarea default — multi-line mood descriptions feel natural).

**The bigger arc.** Per the product vision: "user opens app, talks to bot, clicks watch." This release ships the chat as **option (A)** — a wizard-root entry alongside the existing structured 3-button flow. Once the chat handles the common cases reliably, **option (C)** (chat AS the wizard root) becomes the natural next step in v7.0.

R10 (Vectorize) is what makes the chat scale gracefully to "more like this" buttons and to a catalog larger than 50-item context windows can hold. The pieces sit ready.

---

## 6.4.0 — 2026-05-10
**Service worker cache:** unchanged (Worker-only release)
**Requires Worker patch:** worker.js v5.11. New D1 database (`watchtrack-viewed`) and `D1_VIEWED` binding in `wrangler.toml`. Token needs additional scope `Account → D1: Edit`. After deploy, hit `/cron/migrate-viewed-to-d1?secret=…` once to seed the database. See `worker/DEPLOY.md` v5.11 section.

### Round 2 / R8 — Plex viewing history migrated to D1

VIEWED KV (one record per key, full-scan to aggregate) replaced by a
D1 SQL database with proper indexes on ts, title, type+ts, and
grandparent_title+ts. Period in Review and historical analytics
queries are now O(index lookup) instead of O(full KV scan).

**Schema:**
```sql
CREATE TABLE views (
  id TEXT PRIMARY KEY, event TEXT, ts INTEGER, rating_key TEXT,
  guid TEXT, title TEXT, year INTEGER, type TEXT, library_section_id TEXT,
  grandparent_title TEXT, parent_index INTEGER, ep_index INTEGER,
  rating REAL, source TEXT
);
```
Plus four covering indexes for the query patterns the app uses.

**Dual-write transition.** `/webhook` and `/viewed/ingest` write to
**both** VIEWED KV and D1 during the v5.11 window. `/viewed/list`
reads from D1, falls back to KV if D1 is empty (pre-migration). One
future release will drop the KV write once D1 has soaked; the KV
namespace itself stays as a read-only archive.

**`INSERT OR IGNORE`** on the primary key (event id) keeps the
migration backfill idempotent — running
`/cron/migrate-viewed-to-d1?secret=…` multiple times is safe.

---

## 6.3.0 — 2026-05-10
**Service worker cache:** unchanged (Worker-only release)
**Requires Worker patch:** worker.js v5.10. New R2 bucket (`watchtrack-backups`) and `BACKUPS` binding in `wrangler.toml`. Token needs additional scope `Account → Workers R2 Storage: Edit`. See `worker/DEPLOY.md` v5.10 section for the one-time R2 enable + bucket creation + token scope.

### Round 2 / R7 — Daily R2 state backups + Workers observability

The first piece of the durability + observability foundation laid
out in the Round 2 follow-up plan.

**Daily R2 backups.** The cron handler now runs two tasks in
parallel: the existing alerts check and a new `runStateBackup` walk.
Backup gzips every `SYNC_KV:user:HASH` blob via the native
`CompressionStream` API (no pako, no other deps) and writes to R2
under `state/{YYYY-MM-DD}/{userHash}.json.gz` with `httpMetadata`
declaring `Content-Encoding: gzip` so curl-with-`--compressed` works
end-to-end. State JSON typically compresses ~60-70% — annualized
storage for one user is ~8 MB. Free tier holds ~1,250 user-years.

**Recovery path.** To restore a specific date's snapshot:
```bash
curl --compressed "https://<r2-public-url>/state/2026-05-10/<userHash>.json.gz"
```
…then PUT the result to `/sync/put?user=<userHash>&secret=<...>`. R2
buckets aren't publicly readable by default; for restore convenience
you can either configure a custom domain or temporarily generate a
signed URL via the dashboard. Out of scope for this release; the
data lands durably regardless.

**Manual trigger.** New `/cron/backup-state?secret=X` endpoint hits
the same code path the scheduled handler runs. Useful for verifying
setup before the daily run fires.

**Workers observability.** `console.log` lines at every meaningful
junction:
- `[cron] start ... / done in Nms` per scheduled run
- `[alerts] checking N subscribers / done {summary}` per check
- `[push] sent / 410 Gone / failed` per Web Push attempt
- `[backup] backing up N users / done {summary}` per backup walk
- `[rate-limit] 429 for ip ...` on every rate-limit hit

Visible in Workers → Logs in the Cloudflare dashboard. Free tier
covers personal usage easily.

---

## 6.2.0 — 2026-05-10
**Service worker cache:** `scifi-tracker-v102` → `v103`

### Removal — Export and Import buttons + modals

The header `Export` and `Import` buttons are gone, along with the
three associated dialogs (`#export-modal`, `#import-modal`,
`#import-summary-modal`) and the `buildImportDiagnostic` /
`renderImportDiagnostic` helpers that drove the import summary view.

**Why now.** State durability is fully covered by other systems that
shipped over the last two rounds:
- IndexedDB primary store (v6.0) — survives localStorage clears.
- Cross-device sync via Worker (v5.31) — every device with the same
  Plex token mirrors automatically.
- Daily R2 backups (v6.3.0, next release) — durable, dated snapshots
  that don't depend on any device staying online.

The remaining "share JSON with Claude" use case will be replaced by
the AI chat flow (v6.5.0+, planned), which talks directly to your
state instead of asking you to copy-paste a 13 KB JSON blob.

If you ever genuinely need an export today, `JSON.stringify(state)`
in the DevTools console returns the exact same payload the old
button produced — the underlying `state` object is unchanged.

---

## 6.1.4 — 2026-05-09
**Service worker cache:** unchanged (tooling change)

### Tooling — Auto-deploy Cloudflare Worker on push

Closes the last manual paste in the release loop. New
`.github/workflows/deploy-worker.yml` runs on push to main when
`worker/worker.js`, `worker/wrangler.toml`, or the workflow itself
changes. It uses `cloudflare/wrangler-action@v3` to package the Worker
per `worker/wrangler.toml` and `wrangler deploy` it directly.

`worker/wrangler.toml` is the canonical declaration of the Worker:
name, entry, compatibility date, all 7 KV bindings (EVENTS, CONFIG,
VIEWED, METADATA, PROMOTIONS, SYNC_KV, ALERTS) with their Cloudflare
namespace IDs, and the daily cron trigger (`0 13 * * *`). Bindings
declared here OVERWRITE the dashboard-configured ones at deploy time —
which is the right behavior; it keeps the toml as the source of truth.

**Required GitHub secrets** (Settings → Secrets and variables → Actions):
- `CLOUDFLARE_API_TOKEN` — Custom token with scope `Account → Workers Scripts: Edit`. Recommend ~1-year TTL, no IP filter (GitHub Actions runs from rotating Azure ranges).
- `CLOUDFLARE_ACCOUNT_ID` — 32-char hex from any Worker's right sidebar in the Cloudflare dashboard.

After this commit, the release loop becomes: edit `worker/worker.js`,
push to main, walk away. The auto-bump-cache workflow handles the
client-side `app.min.js` rebuild and SW cache version. The deploy
workflow handles the Worker. Manual Cloudflare dashboard interaction
is now reserved for KV value writes (e.g. configuring VAPID keys),
not code.

---

## 6.1.3 — 2026-05-09
**Service worker cache:** unchanged (Worker-only release)
**Requires Worker patch:** worker.js v5.9 — adds `/alerts/test-fire?secret=X&user=HASH` debug endpoint that sends a fake test notification through the user's stored push subscription. Useful for verifying end-to-end Web Push delivery without waiting on an organic TMDB provider drop. Returns the same `{ok, status, error}` shape as `sendWebPush`.

## 6.1.2 — 2026-05-09
**Service worker cache:** unchanged (workflow change only)

### Tooling — Auto-rebuild app.min.js in the SW cache-bump workflow

Closes the recurring trap that caused 6.1.0's wizard not to ship.
`.github/workflows/sw-cache-bump.yml` now also runs esbuild to rebuild
`app.min.js` when `app.js` changed in the push, and folds both the
rebuild and the cache bump into a single bot commit. Push `app.js`
direct to main and the rest happens automatically — no need to
remember `npm run build:min`.

The workflow detects which files actually changed and composes the
commit message accordingly:

- `chore(sw): rebuild app.min.js + auto-bump cache to vN` — both ran
- `chore(sw): rebuild app.min.js (SW cache untouched)` — user already
  bumped the SW cache themselves; only the rebuild was needed
- `chore(sw): auto-bump cache to vN` — `app.min.js` was already up to
  date (deterministic rebuild produced identical output)

If neither needed work, the workflow exits cleanly without a commit.

Loop prevention is unchanged — `if: github.actor != 'github-actions[bot]'`
guards against the bot triggering itself, and `app.min.js` is not in
the workflow trigger paths so the bot's own commit doesn't re-fire.

---

## 6.1.1 — 2026-05-09
**Service worker cache:** `scifi-tracker-v101` → `v102`

### Fix — Ship 6.1.0's wizard (rebuild minified bundle, invalidate SW cache)

6.1.0's wizard rewrite was committed in `app.js` but the production
`app.min.js` wasn't rebuilt — so the deployed app served v6.0's
2-button wizard root despite the source having v6.1's 3-button root.
The auto-bump-cache workflow correctly bumped the SW cache to v101
when assets changed, but it ran against the *unbuilt* `app.min.js`,
so the cached bundle was the stale one.

This release rebuilds `app.min.js` from the v6.1.0 source and bumps
the SW cache to v102 so installed clients re-download the new bundle
on next load.

**Workflow gap to address.** Pushing app.js without rebuilding
app.min.js will recur. Two ways to close it: either fold the rebuild
into a single pre-commit step locally, or add a GitHub Action that
runs esbuild and commits app.min.js when app.js changes. Existing
build-min.yml only runs on PRs and posts a size comment; it doesn't
commit. A small auto-commit-min.yml would be the cleanest fix.

---

## 6.1.0 — 2026-05-09

### Feature/Refactor — Wizard redesign: time → mood → genre → side-by-side recs

The "What are you doing?" wizard's "Looking for something to watch" path
is rebuilt around the user's actual mental model: time first, mood
second, genre third, then a side-by-side film/TV recommendation panel
that respects all three filters.

**Old flow (5.34.x and earlier):**
```
What doing? → Find new → Film or TV? → Time → Genre (per-tab) → Mood → Recs
```

**New flow (6.1.0):**
```
What doing? → Looking for something to watch → Time → Mood → Genre (family) → Side-by-side recs
```

**Root reorganized to 3 buttons:**
1. **Looking for something to watch** — the new flow
2. **Continue something I'm watching** — straight to the in-progress list
3. **Rating** — unchanged

The separate "Rewatch a favorite" path is dropped. Rewatch-able items
naturally surface in the new flow because the recs engine considers
loved/liked items in the genre family.

**Genre families** — picking "Sci-Fi" now means both films AND TV. The
`GENRE_FAMILIES` constant defines 14 families:
- Sci-Fi (scifi + scifi-tv)
- Crime (crime + crime-tv)
- Spy (espionage + spy-tv)
- Drama, Horror, Fantasy, Cons & Courtroom (each: film tab + tv tab)
- Comedy (comedy + comedy-tv + british-comedy)
- Heroes & Comics (heroes-comics + heroes-comics-tv)
- Heist, Foreign, Auteur, Pre-1960, Musicals (film-only families)

`familyFilmTabs(family)` and `familyTvTabs(family)` partition each
family's tabs by content kind for the recs panel.

**Side-by-side recommendations:**
- Header strip: "[genre] · [time budget] · [mood]" — context recap
- Two-column CSS grid: Films left, TV right
- Each column independently runs `computeRecsForTab(tabs, { timeBudget,
  mood })`
- Within each column: Recommended section + Discover section
- Trailer ▶ buttons remain on rec items where enrichment has the key
- Mobile (< 600px) collapses to single column

**Empty states are per-column** — if there are no Loved/Liked films
yet but plenty of TV, the films column shows "rate some films first"
without blocking the TV column.

### Fix — D-pad navigation feels off in matrix grids ("text position not button position")

Defensive CSS rule ensures all matrix-grid buttons fill their cells:

```css
.wizard-step.matrix .wizard-btn,
.settings-card-grid .settings-card {
  width: 100%;
  box-sizing: border-box;
}
```

Without this, button widths can shrink to content (especially on
flex/grid layouts that don't auto-stretch in some WebView versions),
making the D-pad's `getBoundingClientRect()` based scoring jump to
neighbors that look "near the text" rather than "next in the visual
grid." With explicit width:100%, every button has a predictable cell-
sized rect and the existing 2× perpendicular-distance penalty in the
keydown algorithm picks the right neighbor.

Also: every wizard step now auto-focuses its first button after render
(via `requestAnimationFrame` so layout has settled), so D-pad nav stays
alive across step transitions instead of falling back to body.

**Roadmap status (decision-helper roadmap from 5.27.0 onward):**

| Phase | Status |
|-------|--------|
| 1. Settings card grid | ✅ 5.27.x |
| 2. Cross-platform sync | ✅ 5.31.x |
| 3a. Time budget filter | ✅ 5.32.0 |
| 3b. Mood archetype filter | ✅ 5.33.0 |
| 3c. Trailer embed | ✅ 5.34.0 |
| 3d. Streaming-leaving alerts | ✅ 5.39.0 (parallel work) |
| **4. Wizard redesign + nav defenses** | ✅ **6.1.0 (this release — completes the roadmap)** |

---

---

## 6.0.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v84` → `v100` (major reset)

### Round 2 / R6 — IndexedDB primary store

Earns the major version bump — the persistence layer is fundamentally
re-rooted, even though no callsite signature changes.

**Architecture.** A new in-memory `_kv` Map is the synchronous source
of truth at runtime, hydrated from IndexedDB at boot. Every write
(`lsSet`) updates the cache and fire-and-forgets a write to IDB.
Reads (`lsGet`) only ever hit the cache — sub-microsecond, no async,
no quota concerns. localStorage is no longer in the read path; it's
read once at the first boot of v6.0 to migrate any pre-v6 keys into
IDB and then ignored.

**Why cache-backed instead of fully async.** A pure async refactor
would cascade through 75 callsites including `setStatus`,
`setRating`, `render`, `saveState` — every state-touching path
would need to be `async/await`. The cache wrapper preserves the
synchronous signatures the codebase already relies on while still
moving the durable store off localStorage's 5 MB cap onto IDB's
effectively-unbounded space. Same user-visible benefit, none of the
async cascade.

**The mechanical change.** All 75 `localStorage.getItem/setItem/removeItem`
callsites were renamed to `lsGet/lsSet/lsDel`. The hydrate function
itself still reads `localStorage.length / .key / .getItem` for the
one-time migration walk — those three references are the only
remaining direct localStorage usage.

**One-time migration.** On first boot of v6.0 (gated by an
`migrated-v6.0` flag in IDB), `hydrate()` walks every
`watchtrack-*` and `scifi-tracker-*` key in localStorage and writes
them into IDB if IDB doesn't already have them. The IDB version
wins on conflict — that's the freshest snapshot when the v5.41
mirror was active. Plus a belt-and-suspenders archive of the
entire localStorage contents lands under
`localstorage-backup:v5.41-pre-v6` for one-version recovery.

**Saved state mirroring.** The dedicated v5.41 mirror layer
(`idbMirrorState`) is removed. `saveState()` now just calls
`lsSet(STORAGE_KEY, ...)` once — that single write covers both the
in-memory cache and the IDB-durable store.

**Why no semantic break for users.** Every UI flow, every external
integration, every saved field reads and writes the same way it did
in v5.41. The shape of state, the sync layer, Trakt push/pull,
Plex webhooks, alerts — all unchanged. The bump to 6.0 reflects the
internal architecture, not the user surface.

**Recovery.** If v6.0 has a bug that loses the IDB write path,
localStorage retains its existing values for one minor version (the
migration doesn't clear them; they just become inert). A rollback to
v5.41 would re-read them from localStorage as before.

---

## 5.46.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v83` → `v84`

### Round 2 / R5 — Fuzzy search ranking

`doSearch()` adds a typo-tolerant tier behind every exact-match tier.
Type "tinkr tailr" — Tinker Tailor Soldier Spy still surfaces.

**Algorithm.** Standard two-row Levenshtein DP, capped at distance 2.
Once any row exceeds the cap, the function bails early and returns
`cap+1` — saves a chunk of work on long-string vs short-query
comparisons. The fuzzy match walks each whitespace-token in the
title and reports a hit if any token is within Levenshtein ≤ 2 of
the full query.

**Ranking.** New tier 6, behind the existing 0–5 (startsWith,
includes, director, country, section, pitch). Exact matches always
win; fuzzy hits show below them. Tier 6 only runs when the query
is at least 4 characters, because Levenshtein-2 on a 3-char query
would match too much noise.

**Scope.** Title only in this release. Director/country could
follow if you find typo-tolerant search on those fields useful.

---

## 5.45.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v82` → `v83`

### Round 2 / R4 — Trakt TV pull-sync

`traktPullSync()` now also pulls `/sync/history/shows` and
`/sync/ratings/shows` alongside the movie endpoints it already
queried. Trakt returns one entry per series when any of its episodes
have been watched, which maps cleanly to WatchTrack's
mark-the-show-as-watched behavior.

Series are matched against catalog items by title+year (the same
`traktItemId` normalization film pull already used). Matches in any
TV-tab catalog (`*-tv` plus `british-comedy`) flip the show to
`watched` if it isn't already, and apply ratings (8+ → loved, 5–7
→ liked) if the local item has no rating yet.

Sync-complete summary now reports both halves:
> "Sync complete — N film watched, M rated; X show watched, Y rated."

This closes the bidirectional Trakt loop for TV. Push for shows
already worked since v5.29.0; v5.45.0 adds the missing pull half.

---

## 5.44.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v81` → `v82`
**Requires Worker patch:** worker.js v5.8 — adds Web Push delivery for streaming-leaving alerts. Three new CONFIG KV keys (`vapid_public`, `vapid_private`, `vapid_subject`) — one-time VAPID keypair generation snippet in `worker/DEPLOY.md` v5.8 section.

### Round 2 / R3 — Web Push for alerts

The polling model from v5.39.0 stays in place; this layers real Web
Push on top so notifications fire while WatchTrack is closed, not
just when you next open it.

**Worker side (v5.8).** ~150 lines of pure WebCrypto, no
dependencies. VAPID JWT via ECDSA P-256 (RFC 8292), payload
encryption via aes128gcm (RFC 8291) — ephemeral ECDH against the
subscriber's `p256dh`, HKDF-derived content key + nonce, AES-GCM
encrypt with single padding byte, header concat `salt(16) || rs(4) ||
idlen(1) || as_public(65)`. New `GET /alerts/vapid-public` endpoint
returns the application-server key for client subscription.
`POST /alerts/subscribe` now accepts a `push` field carrying
`{ endpoint, keys: { p256dh, auth } }`. The cron handler, after
queueing a polling notification, also calls `sendWebPush` when the
subscriber has push data. A 410 Gone response from the push service
clears the `push` field so subsequent runs skip stale subscriptions.

**Service worker.** New `push` event handler that calls
`self.registration.showNotification(...)` with the payload's title,
body, icon, and tag. Click handling unchanged from v5.39.0. SW cache
bumped to `v82`.

**Client.** `alertsSubscribe()` now best-effort acquires a push
subscription from `navigator.serviceWorker.ready.pushManager`, fetches
the VAPID public key from the Worker, calls `pushManager.subscribe`
with `userVisibleOnly: true`, and includes the resulting
`endpoint`+`keys` in the subscribe POST. If push acquisition fails
(no SW ready, no PushManager, browser blocked, etc.) the subscribe
still succeeds and the polling model takes over — both paths coexist.

**Polling fallback retained on purpose.** If push delivery fails
silently (subscription expired before the cron's 410 cleanup catches
it, OS-level notification suppression, etc.) the next visibility
change still pulls the queued notification and surfaces it via
`new Notification(...)`.

**Setup steps** (per `worker/DEPLOY.md` v5.8 section):
1. Generate VAPID keypair via the browser-console snippet.
2. Paste `vapid_public`, `vapid_private`, `vapid_subject` into
   `WATCHTRACK_CONFIG` KV.
3. Paste new `worker.js` into the Cloudflare dashboard. `/health`
   should report v5.8.
4. Toggle streaming alerts off and back on once to refresh the
   subscription with push data attached.

---

## 5.43.0 — 2026-05-09
**Service worker cache:** unchanged (Worker-only release)
**Requires Worker patch:** worker.js v5.7 — adds per-IP rate limiting via a `CF-Connecting-IP`-keyed bucket in `CONFIG` KV with 60s TTL.

### Round 2 / R2 — Worker rate limiting

Defensive layer against secret leakage. Every authenticated route is
now guarded by a per-IP token bucket: 60 requests per minute by
default, configurable via a new `rate_limit_per_minute` key in
`CONFIG` KV (set to `0` to disable). `/` and `/health` are exempt
along with CORS preflights.

When the cap is hit, the Worker returns `429 Rate limit exceeded`
with `Retry-After: 60`. The client doesn't currently retry — that's
the right behavior, because hitting the limit during normal usage
would mean something's wrong (a runaway client loop, or the secret
has actually leaked).

**Storage cost.** One `CONFIG.put('rate:{ip}', count, ttl=60)` per
request that passes the limit. With three devices active and normal
usage, daily KV writes are well under the free-tier 1000/day cap.

**Why per-IP, not per-secret.** A leaked secret can be used from any
IP. Per-IP throttling caps a flood from one source while leaving your
own devices unaffected. The helper is parameterized to also support
a per-secret bucket later if needed.

See `worker/DEPLOY.md` v5.7 section for the deployment step (paste
new `worker.js` into the Cloudflare dashboard, no new bindings or
KV namespaces needed).

---

## 5.42.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v80` → `v81`

### Round 2 / R1 — Voice search, minified bundle, CSP, manifest categories

Four small improvements bundled as one polish release.

**Voice search.** A 🎤 button now sits beside the search input and the
notes-search input. Tap to dictate; the transcript is written into the
field and dispatches an `input` event so the existing debounced
`doSearch` / `doNotesSearch` runs unchanged. Reuses the `_voiceActive`
lock from v5.37.0's voice notes — only one mic is live at a time.
Feature-detected: the button hides on devices without
`SpeechRecognition`. Especially useful on Bravia where typing is
brutal; works on phone too.

**Minified production bundle.** `app.min.js` is now built via
`npm run build:min` (esbuild, target es2020). `index.html` loads
`app.min.js` instead of `app.js`. The source `app.js` stays in the
repo as the readable artifact you edit. Result: 328 KB → 201 KB on
disk, roughly 60 KB gzipped on the wire — measurably faster cold
start, especially on Bravia where the JS parse cost dominates first
paint.

**Content-Security-Policy.** New `<meta http-equiv="Content-Security-Policy">`
in `<head>` with strict directives:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://image.tmdb.org;
connect-src 'self' https://*.workers.dev https://api.trakt.tv;
font-src 'self';
base-uri 'self';
form-action 'none';
frame-ancestors 'none';
```
`script-src 'self'` (no `'unsafe-inline'`) — the SW registration block
that used to live as an inline script in `index.html` is now appended
to the end of `app.js`, so no inline scripts remain. `style-src` keeps
`'unsafe-inline'` because runtime-applied `style="..."` attributes are
scattered through the codebase and refactoring them all isn't worth
the churn for this layer of defense.

**Manifest categories.** Two-line addition declaring `entertainment`
and `lifestyle` for richer install prompts on Android. Skipped iOS
splash images per your call.

---

## 5.41.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v79` → `v80`

### IndexedDB durability layer

WatchTrack now mirrors its state to IndexedDB on every save and falls
back to that mirror at bootstrap if `localStorage` is empty. Closes
the long-standing risk that a single accidental site-data clear
permanently wipes the user's watch history on a device.

**What changed.** A small module-level helper (`idbOpen`, `idbGet`,
`idbSet`, `idbMirrorState`, `idbMigrateOnce`, `idbRestoreIfNeeded`) is
added near the top of `app.js`. `saveState()` now also schedules a
1-second debounced write to IndexedDB under
`state-snapshot`. The bootstrap calls `idbRestoreIfNeeded()` before
`loadState()` — if `localStorage[STORAGE_KEY]` is missing but the
IndexedDB snapshot exists, the snapshot is replayed back into
`localStorage` so `loadState()` finds it. On first boot of v5.41.0,
`idbMigrateOnce()` snapshots every `watchtrack-*` and `scifi-tracker-*`
key into IndexedDB under `localstorage-backup:v5.41-bootstrap` as a
single archive value — a "seatbelt" copy in case any restore goes
sideways.

**What didn't change.** Every existing `localStorage` callsite still
works exactly as before. No async cascade through the codebase.
Synchronous reads and writes remain the source of truth; IndexedDB is
purely an additive backup. The full async-state-layer migration is
deferred — the value-to-risk ratio of a 118-callsite refactor was
poor relative to this much smaller change that addresses the real
durability concern.

**Why v5.41 and not v6.0.** No semantic break for users. State shape,
sync layer, Trakt push/pull, Plex webhook flow — all unchanged. A
future major version that flips reads to IndexedDB-first (with the
async signature change that entails) can claim the v6 bump.

---

## 5.40.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v78` → `v79`

### Feature — Find Gaps (Stage 5f)

A new **Find Gaps** header button surfaces titles the TMDB recommendation
graph suggests you'd enjoy but that aren't in any of your catalog tabs
yet. Closes the long-standing Stage 5f roadmap item.

**Algorithm.** Walks every watched item plus every loved/liked item
across all catalog tabs. For each, pulls the cached TMDB
`recommendations` and `similar` arrays from the enrichment store.
Aggregates into a frequency-ranked union, weighted by the source rating
(loved=3, liked=2, watched=1). Subtracts anything already present in
any catalog tab and anything the user has already dismissed via Skip.
Returns the top 50, rendered with title, year, score, and which
already-rated source titles contributed.

**UI.** A new Find Gaps button in the header opens the
`#find-gaps-modal` dialog (native `<dialog>`, opened via
`.showModal()`). Each candidate has Promote and Skip buttons.
Promote routes through the existing promote-modal/confirmPromote
pipeline — the gap is added to a new "X. TMDB Recommendations
(Promoted)" section in the chosen tab and synced to the Worker
Promotions KV. Skip stores the TMDB id under
`watchtrack-gap-skips` in localStorage so the same gap won't return.

**Source-count threshold.** No floor in v5.40.0 — even single-source
recommendations show up because the TMDB graph is sparse for
genre-specific titles. If the list is too noisy in practice, raise
`weight` thresholds in `findGaps()` or hide candidates with
`sourceCount === 1`.

**Why no Plex-history orphans yet.** The plan called for unioning
Plex viewing history orphans into the gap pool. Skipped in this
release because the existing Plex History modal already surfaces
orphans with explicit Promote actions, and bundling the same items
into Find Gaps would duplicate the surface. If a future iteration
wants a single unified gap stream, it's a couple lines added to the
candidate aggregation in `findGaps()`.

**Roadmap status:**

| Stage | Status |
|-------|--------|
| 5b. Persistent orphan promotions | ✅ 5.13.x |
| 5c. TWA APK packaging | ✅ |
| 5d. Multi-select / period review | ✅ 5.20.x |
| 5e. Recommendation engine | ✅ 5.27.x (wizard recs) |
| **5f. Find Gaps** | ✅ **5.40.0 (this release)** |

---

## 5.39.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v77` → `v78`
**Requires Worker patch:** worker.js v5.6 — adds `/alerts/*` and `/cron/check-alerts` endpoints, scheduled handler. Needs a new `WATCHTRACK_ALERTS` KV namespace bound as `ALERTS` and a Cron Trigger. See `worker/DEPLOY.md` v5.6 section.

### Feature — Streaming-leaving alerts (Phase 3d)

Daily cron compares TMDB watch/providers for every queued or watching
item against the prior snapshot; when a provider drops a title in the
user's region, a notification entry queues into KV and surfaces the
next time the app opens.

**Why polling, not Web Push.** Sending push notifications from a
Cloudflare Worker requires VAPID JWT signing plus AES128GCM payload
encryption — several hundred lines of crypto for a single-user
personal tracker. The polling path: cron writes to a KV queue, and
the client fetches pending notifications on visibility-change and
bootstrap, then surfaces them via the browser-native Notifications
API. WatchTrack is opened daily, so end-to-end latency is bounded by
"next time you open the app," which matches the use case.

**Worker side (v5.6):**
- New `ALERTS` KV namespace stores three key prefixes per user:
  `sub:{userHash}` for the subscription record (region + items
  manifest), `snap:{userHash}` for the last seen provider snapshot,
  and `notif:{userHash}:{ts}` for pending notification entries
  (30-day TTL).
- New endpoints: `POST /alerts/subscribe`, `POST /alerts/unsubscribe`,
  `GET /alerts/status`, `GET /alerts/notifications`,
  `POST /alerts/notifications/seen`, `GET /cron/check-alerts`.
- New `scheduled()` export — Cloudflare Cron Trigger calls
  `runAlertsCheck` directly. Recommended cron expression in
  `DEPLOY.md`: `0 13 * * *` (daily 13:00 UTC).
- `runAlertsCheck` walks subscribers, cross-checks each user's state
  in `SYNC_KV` to confirm items are still queued/watching, calls
  `tmdbLookup` (cache-first) for each, and diffs the flat-rate
  provider list for the user's region.

**Client side:**
- `alertsSubscribe()` requests notification permission, builds an
  items manifest from `state` (only items currently `queued` or
  `watching`), and POSTs to the Worker. `alertsUnsubscribe()` clears.
- `alertsCheckNotifications()` runs on app bootstrap and on every
  visibility-change. Fetches notifications from the Worker since the
  last poll timestamp, displays each via `new Notification(...)` with
  the icon and `tag` set so duplicates collapse, then marks them seen.
- `setStatus()` calls `alertsRefreshSubscription()` whenever an item
  enters or leaves the queued/watching set — keeps the Worker's
  manifest fresh without forcing the user to re-toggle. Re-subscribe
  is debounced 5 s to absorb bulk changes.
- New "Streaming-leaving alerts" section in the Settings card grid.
  Status badge shows ON/OFF; the section has Enable, Disable, and
  "Check now" buttons. Region uses the existing
  `getStreamingRegion()` setting (already used by streaming-provider
  badges).

**Service worker:** added `notificationclick` handler — focuses an
existing app window or opens a new one, with `?action=open-item&tab=…&id=…`
URL params for future deep-linking. Cache bumped to `v78`.

**One-time setup** (per `worker/DEPLOY.md` v5.6 section): create
`WATCHTRACK_ALERTS` KV namespace, bind as `ALERTS`, paste new
`worker.js`, add a Cron Trigger.

**Roadmap status:**

| Phase | Status |
|-------|--------|
| 1. Settings card grid | ✅ 5.27.x |
| 2. Cross-platform sync | ✅ 5.31.x |
| 3a. Time budget filter | ✅ 5.32.0 |
| 3b. Mood archetype filter | ✅ 5.33.0 |
| 3c. Trailer embed | ✅ 5.34.0 |
| **3d. Streaming-leaving alerts** | ✅ **5.39.0 (this release; Worker patch required)** |

---

## 5.38.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v76` → `v77`

### Native `<dialog>` migration

All 19 modal containers in `index.html` now use the native `<dialog>`
element. The change is purely structural — every modal still opens
the same way from the user's perspective, but the browser now provides
several behaviors we previously hand-rolled or didn't have at all.

**What changes for the user.** Pressing Escape closes the topmost
modal — previously this required a custom keydown listener. Modal
backgrounds dim via the native `::backdrop` pseudo-element. Focus
moves into the modal automatically when it opens and returns to the
trigger element when it closes. Screen-reader semantics improve
because `<dialog>` is properly announced as a modal.

**What changes in the code.**
- Every `<div class="modal" id="…">` in `index.html` is now
  `<dialog class="modal" id="…">`. The inner `.modal-content` wrapper
  stays as-is, so all child selectors still match.
- The CSS `.modal { position: fixed; inset: 0; background: rgba(...);
  display: none; }` and `.modal.active { display: flex; }` rules are
  replaced. New rules reset the `<dialog>` user-agent border, padding,
  and background; size to viewport bounds; flex-center the inner card
  via `.modal[open]`; and style the backdrop via `.modal::backdrop`.
- 50+ JS sites that toggled `.classList.add('active')` /
  `.classList.remove('active')` on modal elements now call
  `.showModal()` and `.close()` respectively. Local-variable references
  (`settingsModal`, `progressModal`, `modal`, `openModal`,
  `m.classList…` inside qsa-forEach) were migrated alongside the
  `getElementById(…)` references.
- `.modal.active` selectors in JS query strings are now `.modal[open]`.
- The triage wake-lock observer (5.37.0) now watches the `open`
  attribute instead of `class` — same behavior, native signal.
- The category-pill and filter-pill `.active` toggles are unchanged
  because those elements aren't modals.

**Why this is its own release.** The change touches every modal-opening
path in the app and is the riskiest UI migration on the roadmap. It
shipped alone so any regression has a single bisect point.

---

## 5.37.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v75` → `v76`

### Native web-platform pass — voice notes, shortcuts, transitions, share, wake lock

Six small features that each map to a single browser API already
supported on Sony Bravia / Google TV / Android Chrome. No new
dependencies. Feature-detection guards every site so older WebViews
fall through to existing behavior.

**Voice notes in TV mode (B1).** The notes textarea is hidden in TV
mode because D-pad typing is impractical, so item bodies now also
include a read-only `.notes-tv-display` block (shows whatever has
already been saved) and a 🎤 mic button. Tap the button to dictate;
tap again to stop. Transcribed text appends to the existing note via
the same `setNotes()` path the textarea uses, so Trakt/sync layers see
no difference. Uses `webkitSpeechRecognition` (or `SpeechRecognition`
where available); shows an alert on devices without speech support.

**Manifest shortcuts (B2).** Long-pressing the WatchTrack icon on
Android exposes four jump-in shortcuts: Triage Queue, Triage Suggested,
Search, Stats. Each routes via a new `?action=` URL parameter that
the bootstrap reads after the wizard renders, then triggers the
corresponding click — the existing button handlers do the work, so
all four behave exactly like opening the app and tapping the header
button.

**View Transitions on tab switch (B3).** `switchTab()` body is now
wrapped in `document.startViewTransition()` where supported (Chromium
≥ 111, which covers Bravia and Android Chrome). Native crossfade
between tabs replaces the abrupt content swap. Older engines fall
through unchanged.

**Page Visibility catch-up poll (B5).** A `visibilitychange` listener
fires `pollPlexWebhookEvents()` when the app returns from being
hidden. Plex polling is one-shot (only on startup and settings save),
so this is the cleanest place to fold in a refresh — when you
switch back from the Plex app to WatchTrack, any new scrobbles surface
immediately instead of waiting for the next manual trigger.

**Web Share for Period in Review (B6).** New "Share…" button next to
"Generate & download" in the Period-in-Review modal. Generates the
markdown report, shares it as a `File` via `navigator.share` where
file-share is supported (most modern phones), falls back to text-share
otherwise. Hidden entirely on devices without `navigator.share`. The
download path is unchanged for users who prefer it.

**Wake Lock during triage (B7).** When the triage modal opens,
`navigator.wakeLock.request('screen')` keeps the Bravia from dimming
mid-session. Released on close. Implemented via a `MutationObserver`
on `.triage-modal` so every entry/exit path — wizard triage, direct
triage, completion-close, back-button — works without touching the
existing handlers.

---

## 5.36.1 — 2026-05-09
**Service worker cache:** unchanged (tooling only, no user-facing change)

### Tooling — GitHub Actions workflows

Four CI workflows added under `.github/workflows/` to reduce manual
release friction. None ship to users — purely repo-side.

**`lint-catalogs.yml`** — runs `python3 scripts/lint-catalogs.py` on
every push to main and every PR that touches `data/*.json` or the lint
script itself. Fails the check if duplicates, missing fields, or invalid
JSON are detected.

**`sw-cache-bump.yml`** — auto-increments
`scifi-tracker-vN` in `service-worker.js` when any cached asset
(`app.js`, `styles.css`, `index.html`, `manifest.json`, `data/*.json`,
or any icon) is pushed to main without a same-push update to
`service-worker.js`. Commits the bump back as `github-actions[bot]`.
Replaces the manual bump every release.

**`build-min.yml`** — runs on PRs that touch `app.js`. Uses
`esbuild --minify --target=es2020` to compute minified + gzipped sizes,
posts a comment on the PR with a comparison table. Does **not** commit
the minified bundle — keeps the source-only deploy intact. To ship a
minified production build: run `npm run build:min` locally, swap the
output into `index.html` and the SW asset list, commit.

**`lighthouse.yml`** — runs Lighthouse CI against the app served by
`http-server` on a temporary GitHub-hosted runner. Soft-warn thresholds
in `.github/lighthouse-budget.json` (perf 0.85, a11y 0.90, best
practices 0.90, SEO 0.90, PWA 0.70). Posts a scorecard via the LHCI
temporary public storage URL.

A new `package.json` declares `esbuild` as the only devDep and exposes
`npm run lint:catalogs`, `npm run build:min`, `npm run size`. The site
itself has zero runtime deps — `package.json` exists only so CI can
install esbuild.

**One-time setup the first time these run:**
- Repo Settings → Actions → General → Workflow permissions: select
  **Read and write permissions** so `sw-cache-bump.yml` can push back.
- Actions tab on GitHub will show the four workflows; enable each if
  not already on.

---

## 5.36.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v74` → `v75`

### Tier A performance pass — render, search, scroll

Six targeted refactors aimed squarely at the Bravia / Google TV experience.
No behavioral change: every status, rating, tag, note, and Plex flow works
exactly as before. The catalog renders the same DOM. What changes is *how*
the app builds and updates that DOM.

**Off-screen items skip layout and paint.** `.item` now declares
`content-visibility: auto` with a `contain-intrinsic-size` hint, so cards
below the fold are not laid out or painted until they scroll near the
viewport. The Sci-Fi tab (~200 items) no longer pays full-tab rendering
cost on every tab switch; expanded cards still render fully because the
expanded class flips `content-visibility` back to `visible`.

**One delegated event listener replaces eight per item.** The previous
render attached eight separate `addEventListener` calls per card — for a
200-item tab, ~1,600 listeners installed and torn down on every status
change. R1 attaches a single click handler and a single focusout handler
to `#items-container` once on first render, then maintains a small
`_itemRegistry` Map keyed by item id. The handlers walk to the nearest
matching ancestor (`closest('.action-btn[data-action]')`, etc.) and
dispatch on the registry entry. `focusout` is used in place of `blur`
for notes because blur doesn't bubble to the container.

**Render calls coalesce into one frame.** `render()` is now a thin
wrapper that schedules `_renderImpl()` via `requestAnimationFrame` and
returns immediately if a render is already queued. The Trakt pull-sync
loop, which calls `setStatus()` for every matched item and used to
trigger one full render per item, now produces exactly one render no
matter how many state changes land in the same frame.

**Per-section visible counts precomputed.** The old loop called
`catalog.items.filter(...)` once per item-with-section-change to count
visible items in that section — quadratic inside a single render. The
new code makes one pass over the catalog up front, building a
`visibleCountBySection` Map. The render loop reads from the map in O(1).

**Tag set resolved once per item.** `getTagSetForItem(item)` and
`getTagSetForItem(item, itemTab)` resolved to the same set in every
case — `resolveContentType()` falls through to the same source-tab
either way. The duplicate call is removed.

**Search defers to idle time.** Both the title/director search and the
notes search wrap their per-keystroke work in `requestIdleCallback`
(falling back to `setTimeout(0)`). The 100 ms keystroke debounce is
preserved; the change just moves the actual catalog walk off the input
critical path so D-pad typing on TV stays responsive.

---

## 5.35.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v73` → `v74`

### TV-mode cleanup batch

Four targeted fixes for issues that surfaced on Google TV (TWA / .apk).
Wizard restructure and modular recs cards are queued for a planned redesign;
this release covers the small isolated fixes only.

**Removed redundant Settings collapsibles.** The 5.30.0 per-section toggle
headers fought the 5.27.0 card grid: navigating to a section via a card
showed only the header if the section had been collapsed previously, with
the form fields hidden behind a tiny chevron. The card grid is now the
only navigation; section bodies always render when a card is opened.
Removed the toggle UI, the body wrapper divs, and the
`watchtrack-settings-collapsed` localStorage state. The `data-section`
attributes stay because `setSettingsView()` uses them.

**Wizard now keeps focus alive across step transitions.** After every
`wizardRender()`, focus moves to the first `.wizard-btn` (via
`requestAnimationFrame` so it runs after layout). Without this, focus
fell back to `<body>` after each click and TV users had no D-pad target —
the wizard appeared frozen until they re-opened it.

**Tab-nav content-type filter.** A new sticky row above the tab nav with
an eye glyph and three pills: All / Film / TV. Active pill flips to a
gold background with black text. Filter persists in localStorage
(`watchtrack-tab-filter`). Virtual tabs (Watchlist, Auteur) remain visible
under all filters since they aggregate from both content types. If the
active tab is hidden by a filter change, the first visible tab takes over
so the user isn't stranded on a tab whose button is gone.

**Display mode adds `computer`. Reset visibility tied to it.**
- `getDetectedMode()` now returns `tv` | `computer` | `phone`. Computer is
  detected as not-TV with viewport ≥ 1024px and a fine pointer. Body class
  is one of `tv-mode` / `computer-mode` / `phone-mode`.
- The "Computer" radio in Settings → Display appears only when the
  detected mode is `computer`. That keeps the option list clean on phones
  and TVs while letting a laptop user preview each mode.
- Reset is hidden via CSS in `tv-mode`. On phone/computer, clicking Reset
  now opens an explicit confirmation modal that names the tab, shows the
  item count being affected, and warns that the reset is per-device — so
  cross-device sync from another device will overwrite it on next pull
  unless the user pushes from this device after resetting. Replaces the
  native `confirm()` dialog, which dismissed awkwardly on D-pad and
  carried no rollback information.

---

## 5.34.0 — 2026-05-09
**Requires Worker patch:** worker.js v5.5 — appends `videos` to TMDB lookup, returns `trailerKey`. Existing enrichments will refresh on the 30-day cache TTL automatically; force-refresh by re-running Pre-enrich catalog if you want trailers immediately.

### Feature — Trailer embed (Phase 3c of decision-helper roadmap)

The wizard's recommendations panel now shows a ▶ trailer button beside
each catalog-matched rec. One tap opens the YouTube trailer in the
default handler (YouTube app on Android/Google TV, browser tab on
desktop) — a 30-second commitment that often closes "should I watch
this?" decisions where the title alone doesn't.

**Worker side (v5.5):**
- `tmdbLookup` now appends `videos` to its TMDB details fetch
- After fetch, picks the best YouTube trailer:
  1. Official Trailer
  2. Any Trailer (non-official)
  3. Teaser
  4. First YouTube video of any type
- Stores the YouTube key as `trailerKey` on the cached enrichment
- Old enrichments without trailerKey are valid; they just won't show the
  button. Refresh on the 30-day TTL or via Pre-enrich.

**Client side:**
- `getTrailerKey(itemId)` reads from enrichment cache
- `trailerYouTubeUrl(key)` returns `https://www.youtube.com/watch?v=KEY`
- Recommended rec items render a separate `.trailer-btn` ▶ link next to
  the wizard-btn. Click opens YouTube in a new tab via standard `target="_blank"`
- D-pad-friendly: trailer button is its own focusable element, can be
  reached via right-arrow from the rec, or enter to open
- TV-mode upscale: 24px padding, 72px min-width, 20px ▶ glyph

**Why YouTube watch URL instead of embed:** TWA WebViews don't reliably
play embedded YouTube iframes (autoplay restrictions, container
sizing). Linking to youtube.com hands off to the OS — the YouTube app
handles playback natively, which is the better TV experience anyway.

**Roadmap status:**

| Phase | Status |
|-------|--------|
| 1. Settings card grid | ✅ 5.27.x |
| 2. Cross-platform sync | ✅ 5.31.x |
| 3a. Time budget filter | ✅ 5.32.0 |
| 3b. Mood archetype filter | ✅ 5.33.0 |
| **3c. Trailer embed** | ✅ **5.34.0 (this release; Worker patch required)** |
| 3d. Streaming-leaving alerts | next |

---

## 5.33.0 — 2026-05-09

### Feature — Mood archetype filter (Phase 3b of decision-helper roadmap)

The wizard's "Find something new" / "Pick something to rewatch" flows
now ask "What are you in the mood for?" between the genre pick and the
recommendations panel. Items are scored by reaction-tag overlap with
the chosen mood and surfaced accordingly.

**Six archetypes, each mapped to a tag cluster:**
- **Smart & demanding** — Smart structure, Performance-driven, Stayed
  with me, Mind-bending, Director's voice unmistakable, Tight
  structure, Subversive or knowing
- **Comfort** — Rewatchable, Endlessly rewatchable, Ensemble warmth,
  Comfort watch, Quotable, Format works, Host chemistry
- **Visceral** — Visually stunning, Genuinely unsettling, Great
  atmosphere, Bravura staging, Visually inventive, World-building
  sells it, Cult magnetism
- **Cathartic** — Emotionally resonant, Earned emotion, Stayed with
  me, Mythic weight
- **Light** — Laugh-out-loud funny, Joke density, Quotable, Powerhouse
  vocals, Triple-threat, Comfort watch
- **Any mood** — no filter

**Mechanics:**
- `MOOD_ARCHETYPES` constant maps each archetype to label + sub-label +
  tag cluster
- `moodScore(item, sourceTab, mood)` returns the count of overlapping
  tags between the item's applied `reactionTags` and the mood's
  cluster. Items with no tags score 0 (neutral, not penalized).
- Wizard flow: `genre-pick` → step `mood` → recs (new) or triage
  (rewatch)
- `computeRecsForTab(tabIds, { timeBudget, mood })` blends mood overlap
  into the rec score with weight 5 (each overlapping tag counts ~5×
  what a single TMDB rec match contributes). Soft filter — items with
  zero overlap aren't dropped, just ranked lower.
- `wizardLaunchTriage('watch')` sorts the queue by `_moodScore`
  descending so mood-aligned items appear first in triage too.
- Back nav: `mood` → `genre`, `recs` → `mood`. Users can adjust
  without restarting.

**Why soft filter (sort) rather than hard filter (drop):** items
without applied reactionTags score 0 but might still be a great
match — the user just hasn't tagged them yet. Hard filtering would
penalize untagged items, creating a chicken-and-egg where new items
never surface in mood searches. Sort-by-overlap surfaces tagged matches
first while keeping untagged items reachable.

**Roadmap status:**

| Phase | Status |
|-------|--------|
| 1. Settings card grid | ✅ 5.27.x |
| 2. Cross-platform sync | ✅ 5.31.x |
| 3a. Time budget filter | ✅ 5.32.0 |
| **3b. Mood archetype filter** | ✅ **5.33.0 (this release)** |
| 3c. Trailer embed | next |
| 3d. Streaming-leaving alerts | next+1 |

---

## 5.32.0 — 2026-05-09

### Feature — Time budget filter (Phase 3a of decision-helper roadmap)

The wizard's "Find something new" / "Pick something to rewatch" flows
now ask "How long do you have?" between the film/TV pick and the genre
pick. Recommendations and the watch-queue are filtered by item runtime
to match.

**Five buckets:**
- Quick (≤ 30 min)
- Short (≤ 90 min)
- Standard (≤ 2 hours)
- Long (≤ 3 hours)
- All evening (no limit)

**TV interpretation:** for TV catalogs the budget compares against the
**per-episode** runtime, not the series total. A 30-min budget surfaces
sitcoms; a 60-min budget includes drama-length episodes. Series total
runtime would mean nothing fits — you don't watch a whole season in one
sitting.

**Implementation:**
- `parseRuntimeMin(item)` parses runtime strings: "126 min", "1h 47m",
  "1 hr 47 min", "47 minutes", "47", or a raw number. Returns minutes
  or null if unparseable.
- `fitsTimeBudget(item, budget)` predicate. Items with unparseable
  runtime pass through (better false-positive than dropping items —
  the user can still see them and decide).
- `TIME_BUDGETS` constant maps each bucket to its max minutes and
  display label.
- Wizard flow: `session === 'new' || 'rewatch'` → step `time` → step
  `genre`. The `time` step uses the matrix grid layout with five
  buttons. wizardState gains `timeBudget` field.
- Filter integrations:
  - `wizardLaunchTriage('watch')` filters its queue against
    `wizardState.timeBudget`
  - `computeRecsForTab(tabIds, { timeBudget })` drops recommended items
    that don't fit. Discover (TMDB-orphan) candidates pass through —
    their runtime isn't always cached yet.
- TV-mode wizard buttons show "/ episode" suffix on the time labels
  for clarity ("≤ 30 min / episode").
- Back navigation: `genre` → `time` → `session`, so users can adjust
  the budget without restarting.

**Roadmap status:**

| Phase | Status |
|-------|--------|
| 1. Settings card grid | ✅ 5.27.x |
| 2. Cross-platform sync | ✅ 5.31.x |
| **3a. Time budget filter** | ✅ **5.32.0 (this release)** |
| 3b. Mood archetype filter | next |
| 3c. Trailer embed | next+1 |
| 3d. Streaming-leaving alerts | next+2 |

---

## 5.31.2 — 2026-05-09

### Fix — Settings modal reverted to old layout after sync pull

The Settings card grid (5.27.0) was injected via `buildSettingsCardGrid()`
called once at `setupModals()` time. After a sync pull triggered
`location.reload()`, the rebuild step wasn't reliably re-injecting the
cards in some environments — Settings would open with the old
stacked-sections layout instead of the card grid.

Moved `buildSettingsCardGrid()` from setup-time (one shot) into the
settings-btn click handler. The function has its own idempotency guard
(skips if the grid already exists in the DOM), so calling it on every
Settings open is cheap and guarantees the cards are present regardless
of what happened to the modal between opens — sync reloads, JS errors,
DOM mutations, anything.

---

## 5.31.1 — 2026-05-09

### Fix — Sync was reverting devices to older state ("clobber on pull")

5.31.0's `syncApplyRemote()` did a whole-state-blob replace based on a
single `pushedAt` timestamp. This meant: if Device A pushed its (small)
state to the Worker AFTER Device B last pushed, then when Device B
pulled, it would replace its richer local state with A's smaller state
— exactly the "revert to old version after syncing" symptom.

**Per-item merge instead of blob replace:**

- Each catalog state entry already carries a `lastUpdated` timestamp
  (set by `touchEntry()` on every status / rating / tag / notes change).
- `syncApplyRemote()` now iterates `remote.state[tab][id]` and compares
  each entry's `lastUpdated` against the local entry's. The newer one
  wins for that specific item. Items only on remote get added; items
  only on local stay; no destructive overwrites.
- Settings (which don't have per-key versioning) still apply as a
  blob — they're small and a recent settings push is intended to
  propagate.
- Removed the previous `lastPush >= remote.pushedAt` short-circuit. The
  per-item logic is always safe to run; the timestamp comparison
  happens per-entry, not per-blob.
- "Pull now" button no longer needs to "force-apply by clearing
  last-push." The merge logic naturally takes whatever is newer.

Sync is now safe regardless of which direction you push or how
out-of-sync devices are. Two devices with overlapping but partially
different state will converge on the union of latest edits per item.

---

## 5.31.0 — 2026-05-09
**Requires Worker patch:** see `worker-sync-patch.md` (new KV namespace + two endpoints).

### Feature — Cross-platform sync (Phase 2 of decision-helper roadmap)

Auto-syncs settings AND catalog state across every device that has Plex
+ Worker configured. Identity is the SHA-256 hash of the user's Plex
token (computed client-side, never sent to Worker as plaintext).

**What syncs:**
- Settings: Plex creds, Worker creds, Plex client ID, streaming region,
  my-subscriptions list, display mode, Trakt creds
- Entire catalog state: status / rating / reactionTags / notes /
  lastUpdated for every item across every tab

**Mechanics:**
- `syncOnLaunch()` runs in the bootstrap IIFE before catalog load.
  Fetches `/sync/get?user=<hash>&secret=<webhook>` from the Worker. If
  the remote blob's `pushedAt` timestamp is newer than the local
  `SYNC_LAST_PUSH_KEY`, the remote settings/state are applied.
- `syncMarkDirty()` is hooked into `saveState()`. Any state change
  schedules a 5-second debounced PUT.
- Manual **Push now** / **Pull now** buttons in the new Sync settings
  card.
- Conflict policy: last-write-wins by `pushedAt` timestamp.

**Authentication:**
- Identity: SHA-256 hash of Plex token via `crypto.subtle.digest`.
- Authorization: existing `WEBHOOK_SECRET` shared with the Worker. No
  new credentials needed.

**Sync settings card** shows last-push and last-pull timestamps, last
error if any, and Push/Pull buttons. Card status badge: NEEDS PLEX +
WORKER → READY → ACTIVE → IN SYNC.

**Worker side:** documented in `worker-sync-patch.md`. Two new
endpoints (`GET /sync/get`, `PUT /sync/put`), one new KV binding
(`SYNC_KV`), 1-year TTL on stored blobs, validates against existing
`WEBHOOK_SECRET`. ~25 lines of Worker code.

**Failure modes & safeguards:**
- 2 MB client-side payload cap (vs Cloudflare's 25 MB KV limit)
- Network errors written to localStorage; visible in the Sync card
- Stale-write protection: if remote blob is older than local
  last-push, apply is skipped
- 404 from /sync/get treated as "no data yet" — not an error

**Roadmap status:**

| Phase | Status |
|-------|--------|
| 1. Settings card grid | ✅ 5.27.x |
| **2. Cross-platform sync** | ✅ **5.31.0 (this release; Worker patch required)** |
| 3a. Time budget filter | next |
| 3b. Mood archetype filter | next+1 |
| 3c. Trailer embed | next+2 |
| 3d. Streaming-leaving alerts | next+3 |

---

## 5.30.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v70` → `v73`

### Quality-of-life improvements

**Catalog lint script** — `scripts/lint-catalogs.py` checks every genre catalog for duplicate `(title, year)` entries, missing required fields, and JSON syntax errors. Run manually before committing: `python3 scripts/lint-catalogs.py`. Exits 1 on any issue. Skips `auteur.json` and `catalogs.json`. Already caught the 6 duplicates fixed in this same release.

**Service worker update banner** — When a new version is detected, a gold banner appears at the bottom of the screen with a "Reload" button. Replaces the manual unregister-and-clear-cache dance. The SW now waits for an explicit `SKIP_WAITING` postMessage from the page (triggered by clicking Reload) before activating, then a `controllerchange` listener reloads the page. Banner sizing scales for TV mode (18px font, larger padding) and the focus ring uses white instead of the default accent color so it's visible against the gold background.

**Settings: collapsible sections** — Each settings section header (Display, Plex Integration, Plex Webhook Bridge, Trakt Integration) is now a focusable toggle button with a chevron indicator. Open/closed state persists in localStorage per section. First-load defaults: Display open; Plex/Webhook/Trakt open if their feature is configured, collapsed otherwise. TV mode gets larger touch targets (44px min-height) and Enter/Space keyboard activation for D-pad use.

**Trakt: TV show support** — Push hooks (`setStatus`, `setRating`) no longer skip TV shows. Marking a series Watched now pushes to Trakt's `/sync/history` with the show payload (no `watched_at`, which marks all aired episodes watched). Show ratings push to `/sync/ratings` at the series level. Pull-sync for TV shows is deferred — it requires episode-count heuristics to map Trakt's per-episode tracking onto WatchTrack's series-level statuses.

### Bug fixes

**6 duplicate catalog entries removed** —
- `scifi-tv.json` — Mr. Robot, Counterpart, Devs, DS9 removed from "C · High Priority — Recommended" (originals in main sections)
- `scifi-tv.json` — Severance removed from same section
- `cons-courtroom-tv.json` — Boston Legal section V removed; its `commitment`/`commitmentTag`/`contentType`/`tvCompletionMode` fields merged into the section IV entry
- `cons-courtroom.json` — Witness for the Prosecution removed from "Cross-Listed" section, kept in Foundational

---

## 5.29.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v69` → `v70`

### Feature — Trakt integration (bidirectional sync)

**Direct browser integration — no Worker**

Trakt's Cloudflare WAF blocks requests from Cloudflare Worker IP ranges, making a Worker proxy unworkable. All Trakt API calls go directly from the browser to `api.trakt.tv`, which is CORS-enabled. The Client ID and Client Secret are stored in localStorage — acceptable for a single-user personal PWA. The Plex Worker is unchanged.

**Settings — Trakt Integration section**

New section in Settings below Plex Webhook Bridge. Enter the Client ID and Client Secret from `trakt.tv/oauth/applications`, then click Connect Trakt to start the OAuth device code flow: the app displays a short code and instructs you to go to `trakt.tv/activate`. Once activated, WatchTrack stores the access and refresh tokens in localStorage and shows "Connected as @username." Tokens are refreshed automatically on 401; if the refresh fails the session clears and prompts reconnection.

**Pull sync (Trakt → WatchTrack)**

"Sync from Trakt" button fetches your full movie history and ratings from Trakt, matches against every genre catalog by title+year slug, and applies results without overwriting existing state. Rating mapping: Trakt 8–10 → Loved, 5–7 → Liked, 1–4 → no rating set (below WatchTrack's floor). Ends with a summary ("N watched, N rated").

**Push sync (WatchTrack → Trakt)**

`setStatus` and `setRating` now fire-and-forget directly to `api.trakt.tv` whenever Trakt is connected. Marking a film Watched pushes a history entry; setting back to None removes it. Setting a rating pushes the numeric score (Loved → 8, Liked → 6, cleared → removes rating). TV series are excluded from push (no `seasons` field check bypassed). If catalog enrichment has been run, the TMDB ID is included in payloads for exact matching.

---

## 5.28.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v68` → `v69`

### Feature — Virtual Auteur tab, auteur badge, reaction indicators on cards

**Virtual Auteur tab**

The Auteur tab is now driven entirely by a director list in `catalogs.json` rather than a static `auteur.json` file. On load, `auteurDirectorSet` is populated from the `directors` array on the auteur catalog entry. `buildAuteurCatalog()` scans every non-virtual genre catalog, collects items whose `dir` matches a listed director, deduplicates by computed item ID, and groups results into per-director sections. Items carry `_auteur_source_tab` and `_auteur_source_label` metadata so state operations route back to the source genre tab — the same aliasing pattern used by the Watchlist virtual tab.

Directors are currently: Ingmar Bergman, Akira Kurosawa, Federico Fellini, Andrei Tarkovsky, Denis Villeneuve, David Lynch, Paul Thomas Anderson, Joel & Ethan Coen, Robert Eggers. Adding or removing a director from the auteur view requires editing only the `directors` array in `catalogs.json`.

**64 auteur films migrated to genre catalogs**

All films formerly in `auteur.json` are now in their primary genre catalog under an "Auteur Filmographies" section, making them available for triage, filtering, and reaction tracking alongside other catalog content:

- `foreign.json` — Bergman (8 films), Kurosawa (5), Fellini (4), Tarkovsky (4), Villeneuve's Incendies
- `scifi.json` — Tarkovsky's Solaris; Villeneuve's Arrival, Blade Runner 2049
- `crime.json` — Villeneuve's Sicario; Lynch's Blue Velvet, Lost Highway; Coens' Miller's Crossing, Blood Simple
- `drama.json` — Villeneuve's Enemy; Lynch's The Elephant Man, Inland Empire; PTA's 6 films; Coens' 4 films
- `horror.json` — Lynch's Twin Peaks: Fire Walk With Me, Eraserhead
- `fantasy.json` — Eggers' The Northman

The virtual Auteur tab assembles these 71 films dynamically at render time; `auteur.json` is no longer referenced and has been removed from the service worker ASSETS list.

**Auteur badge on outer cards**

Every item card in every tab whose `dir` matches a listed director in `auteurDirectorSet` now displays a small outlined "AUTEUR" chip in the badge row. The badge is purely visual and requires no tag or status change.

**Reaction indicators on outer cards**

Positive and negative reaction tag counts are now visible on every outer card without expanding it. A green `+N` count appears when the item has positive reaction tags applied; a red `−N` count appears for negative tags. The counts are computed against the source tab's tag set (via `getTagSetForItem`) so films aliased in Auteur or Watchlist report correctly.

---

## 5.27.1 — 2026-05-09
**Service worker cache:** `scifi-tracker-v67` → `v68`

### Bug fix — Suggestion triage: inflated item count + empty card

**Root cause (two bugs, one symptom):**

1. **Inflated suggestion count**: `buildWatchlistCatalog` iterated all
   entries in `catalogs`, including the `'watchlist'` virtual catalog
   itself. Because `state['watchlist']` is always empty, every item in
   the already-built watchlist was treated as status `'none'` and
   re-added to the suggested list on every `render()` call — growing
   the count from ~374 real suggestions to 1974+ after a few renders.
   Fixed by skipping `tabId === 'watchlist'` in the `buildWatchlistCatalog`
   loop.

2. **Empty triage card**: a duplicate `escapeHtml` definition (removed in
   v5.26.11) broke the `meta` array: `item.year` is an integer, and the
   broken version used `(s || '').replace()` which throws a TypeError on
   non-strings. The exception fired after `triage-progress` was set
   (line 5201) but before `triage-card.innerHTML` was assigned (line 5205),
   so the progress counter appeared while the card stayed blank. The fix
   (`String(s ?? '')`) was already in v5.26.11; v5.27.1 contains the count
   fix above.

---

## 5.27.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v66` → `v67`

### Feature — "Start Watching" button in every item card + subscription-only watch modal with VPN lookup

**"Start Watching" in item cards**

A `▶ Start Watching` button now appears at the top of every item card's
action row when expanded. It opens the same Watch sub-modal used by the
triage flow — showing where the title is available on your subscriptions
and surfacing VPN options. Previously this modal was only reachable via
triage, not from browsing.

The status-button `querySelectorAll` now uses `[data-action]` to avoid
accidentally calling `setStatus` on the new button (which has no
`data-action` attribute).

**Watch modal: subscription-only, no rent/buy/ads**

`renderWatchProviders` previously showed all TMDB tiers: flatrate,
free-with-ads, rent, and buy. Now it shows only the `flatrate`
(subscription) tier — the services you already pay for. Rent, buy,
and ad-supported tiers are removed entirely.

- **Home region** (your configured region, default US): shows only
  providers matching your subscription list. If none of your subs carry
  it in your region, the card says so plainly.
- **Removed:** "Other ways to watch" section that listed non-subscription
  providers in your home region.

**VPN lookup — your subs abroad**

A new collapsible "Available on your subs abroad (VPN)" section lists
every other TMDB region where at least one of your known subscriptions
carries the title on `flatrate`. Entries are grouped by **service** (not
by region), so you can see at a glance which VPN country to pick:

```
Netflix    United Kingdom · Canada · Australia
Max        Canada
Disney+    Germany · Mexico
```

A tip line reminds you that your home region is set to US and instructs
to set PIA to any listed country before opening the service normally.
Only your own subscriptions appear here — no generic streaming noise.

---

## 5.26.11 — 2026-05-09
**Service worker cache:** `scifi-tracker-v65` → `v66`

### Fix — Suggestion triage crashed on heroes-comics items (TypeError in escapeHtml)

Two problems combined to break the triage card for any Heroes & Comics item.

**1. Duplicate `escapeHtml` definition — wrong version won.**
`app.js` had two `function escapeHtml(s)` declarations. The one at line 1
used `String(s ?? '')` and handles non-string inputs correctly. The second
declaration (introduced mid-file in an older refactor) used `(s || '').replace()`
— which does NOT coerce numbers to strings: `(126 || '')` evaluates to
`126` (the integer, which is truthy), and `Number.prototype.replace` doesn't
exist, throwing `TypeError: (intermediate value).replace is not a function`.

In JavaScript, two function declarations with the same name in the same
scope both get hoisted, and the second wins. The broken mid-file version was
overriding the correct top-level one.

**Fix:** removed the duplicate. The surviving definition at line 1 correctly
handles any input type via `String(s ?? '')`.

**2. `heroes-comics.json` had integer runtimes.**
The catalog added in v5.25.0 stored runtime as bare integers (`126`, `143`,
etc.) rather than strings (`"126 min"`). All other catalog files use strings.
This was harmless before v5.26.8 because the old `renderTriage` passed values
straight to `.join()` (which auto-coerces). The v5.26.8 escapeHtml fix
introduced `.map(escapeHtml)` on the meta array — exposing the type mismatch.

**Fix:** converted all 34 integer runtime values in `heroes-comics.json` to
`"N min"` strings, matching the format used by every other catalog.

---

## 5.26.10 — 2026-05-09
**Service worker cache:** `scifi-tracker-v64` → `v65`

### Fix — Escape / remote back button exited the app instead of navigating back

**Root causes (two, both fixed):**

**1. Missing key aliases for Android TV back button.**
Some Android TV WebViews send `key: 'GoBack'` or `key: 'BrowserBack'` for
the physical back button on the remote — not `'Escape'`. These values
weren't in the key-alias table, so the keydown handler returned early
without calling `e.preventDefault()`, leaving the TWA to handle the event
and finish the activity (exit the app).

Added `'GoBack'` and `'BrowserBack'` to the KEY_ALIASES map, both
normalising to `'Escape'`.

**2. No popstate interception for TWA physical back.**
Even when the keydown event fires correctly, some Android TV back-button
implementations go through the browser's history stack before dispatching
a key event. A TWA with no browser history to pop back to finishes the
activity at that layer, bypassing keydown entirely.

Fix: on `setupModals()` call, push a dummy `{ watchtrack: 'back' }` state
into the browser history. The TWA now pops that entry on back-press,
firing a `popstate` event instead of exiting. The `popstate` handler runs
`handleAppBack()` and immediately re-primes the history entry so the next
back press also fires `popstate`.

**3. Wizard not in the back-navigation hierarchy.**
The old Escape handler knew about modals and tab focus but not the wizard.
Pressing Escape on the wizard's root screen did nothing visible (it focused
a hidden tab button in the background app-shell). Pressing Escape on a
wizard sub-step also did nothing, forcing the user to find the on-screen
Back button.

**New hierarchy (`handleAppBack()`, shared by keydown and popstate):**
1. Modal open → close the topmost active modal
2. Wizard visible at a sub-step → `wizardGoBack()`
3. Wizard visible at root → stay (don't exit; the wizard IS the home screen)
4. Main view → focus the active tab button (D-pad starting point)

**4. Escape in a focused text input.**
Backspace correctly keeps native delete behaviour inside inputs. Escape
in an input now blurs the field and runs `handleAppBack()` — on TV the
remote's back button should never delete characters, it should close or
navigate back.

---

## 5.26.9 — 2026-05-09
**Service worker cache:** `scifi-tracker-v63` → `v64`

### Fix — Watch sub-modal selections blocked when opened from triage

When "Start watching" is pressed in triage, the watch modal opens while
the triage modal remains `.active` in the DOM. Both modals had the
`.modal.active` class simultaneously.

The focusin trap and D-pad scoping both used `document.querySelector(
'.modal.active')`, which returns the **first** match in DOM order.
`triage-modal` is earlier in the HTML than `watch-modal`, so every
focus event that landed on a watch-modal button was immediately stolen
back into the triage modal — making it impossible to click a platform
or "Mark as watching."

**Fix:** replace `querySelector` with `querySelectorAll(...).pop()` in
all three places that needed the topmost (last-opened) active modal:

1. **focusin trap** — correctly scoped to watch-modal while it's open
2. **Escape/Backspace handler** — dismisses watch-modal first, not triage
3. **D-pad searchRoot** — arrow-key navigation confined to watch-modal

```js
// Before — returns first .modal.active in DOM order (triage-modal)
document.querySelector('.modal.active')

// After — returns last .modal.active in DOM order (topmost, watch-modal)
Array.from(document.querySelectorAll('.modal.active')).pop() || null
```

---

## 5.26.8 — 2026-05-09
**Service worker cache:** `scifi-tracker-v62` → `v63`

### Fix — Three D-pad/triage code-quality fixes

**1. `scrollIntoView` no longer uses `smooth` behavior on D-pad moves.**
Every arrow-key navigation step called
`scrollIntoView({ behavior: 'smooth', ... })`. On Android TV WebViews
smooth scrolling is hardware-accelerated but still produces visible
stutter when fired continuously (every D-pad press). Removed
`behavior: 'smooth'`; the browser now defaults to `'auto'`/instant,
which is imperceptible and costs nothing on TV.

**2. D-pad body-focus path now respects modal scope.**
When focus falls to `document.body` (e.g., after innerHTML replacement
destroys the focused element during a triage re-render) and a D-pad key
is pressed, the handler tried to focus `.tab-btn.active` before searching
inside the modal. The tab button lives behind the modal overlay — it
received momentary focus, the `focusin` trap fired to pull focus back in,
and the user saw a brief focus-ring flicker on the background tab.

Fix: skip the `activeTab` shortcut entirely when a modal is open.
```js
// Before:
const activeTab = document.querySelector('.tab-btn.active');
// After:
const activeTab = !openModalRoot ? document.querySelector('.tab-btn.active') : null;
```

**3. `renderTriage` regular card now uses `escapeHtml()` consistently.**
The queue-triage and suggest-triage card injected `item.title`,
`item.pitch`, `item.whyPriority`, and `item._watchlist_source_label`
as raw strings. The `renderRateTagTriage` path (added in 5.26.0) already
used `escapeHtml()` throughout. Made the regular path match: all
user-visible strings are now escaped before insertion, preventing display
glitches if any catalog item's pitch or title contains `<`, `>`, or `&`.

---

## 5.27.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v62` → `v63`

### Feature — Settings card grid (Phase 1 of decision-helper roadmap)

Replaced the Settings modal's stacked-sections-with-collapsible-headers
layout with a card-grid entry point + focused detail panels. Mirrors
the wizard / triage / watch-modal patterns elsewhere in the app, which
the user identified as their preferred flow style.

**Card grid (initial view when Settings opens):**
- Display — phone vs TV layout
- Plex — media server connection (status: CONFIGURED / EMPTY)
- Worker — TMDB & scrobble bridge (status: CONFIGURED / EMPTY)
- Trakt — watch history sync (status: CONNECTED / EMPTY)
- Cross-Device Sync — placeholder for Phase 2 (status: COMING SOON)

Each card has a title (Didot serif), one-line description, and a
status badge (green = configured, gold = warn / coming soon, faint =
empty). 2-column grid on phone, 3-column in TV mode.

**Detail view (when a card is tapped):**
- Card grid hides, the corresponding section's full form shows
- "← Settings" back button at the top returns to the grid
- All existing field handlers (Save, Test, Pair, etc.) work unchanged
- Status indicators auto-refresh when returning to the grid

**Implementation:**
- `SETTINGS_CARDS` array defines each card with id / title / desc /
  statusFn
- `buildSettingsCardGrid()` injects the grid and back button into the
  existing `.settings-scroll` container at init time (idempotent —
  guards against double-build)
- `setSettingsView(view)` toggles visibility via inline display
  styles; called on card click and at modal-open with `'grid'`
- New `data-section="sync"` placeholder section ships with the card so
  the detail view has something to render until Phase 2 wires up the
  actual sync logic

**Phase 2 next:** extend the Cloudflare Worker with `/sync/{userHash}`
endpoints (KV-backed, keyed by hash of Plex token) so settings, state,
preferences, and viewing history sync automatically across devices.

---

## 5.26.7 — 2026-05-09
**Service worker cache:** `scifi-tracker-v61` → `v62`

### Fix — Pressing Enter on a focused item card on TV did nothing

D-pad navigation focuses on `.item` elements (they're in the keydown
handler's focusables selector). The keydown handler called
`focused.click()` to "activate" the focused element on Enter. But the
expand/collapse click handler is registered on the inner `.item-head`
child — not on `.item` itself. So `.item.click()` triggered no action;
the show didn't open on Enter press from the remote.

**Fix:** when Enter fires on a focused `.item`, look for an `.item-head`
child first and click that. Falls back to clicking the `.item` itself
if no child is found (defensive against future markup changes).

```js
const head = focused.querySelector('.item-head');
(head || focused).click();
```

Mouse/touch click on the `.item-head` already worked — only the D-pad
Enter path was broken. Affects every catalog tab, not just Heroes &
Comics.

---

## 5.26.6 — 2026-05-09
**Service worker cache:** `scifi-tracker-v60` → `v61`

### Fix — Wrong tag set on items triaged from the watchlist (e.g. sitcoms getting panel tags)

`resolveContentType(item)` had three resolution steps: explicit
`item.contentType` → `item.categories` map → `TAB_DEFAULT_CONTENT_TYPE[activeTab]`.

The third step's fallback used the GLOBAL `activeTab`. When triaging
from the wizard, `activeTab` is `'watchlist'`, which isn't in the
default map — so any item without categories (or that hit a code path
where categories were stripped) resolved to `'film-narrative'` instead
of its real source tab's default.

For british-comedy items specifically, the resolver almost always
returned the right thing because items have `categories: ['sitcom']`
or `['panel']`. But ANY item that lost categories metadata in transit,
OR future items added without categories, would silently get the wrong
tag set when rated from triage. Vicious is the symptom — sitcom
content showing tags written for panel shows or generic film.

**Fix:**
- `resolveContentType(item, sourceTab)` now accepts an optional
  `sourceTab` parameter
- Falls back to `item._watchlist_source_tab` if present (the enriched
  property set when items get added to the triage queue), then
  `activeTab`, then `'film-narrative'`
- `getTagSetForItem(item, sourceTab)` plumbs sourceTab through
- `renderRateTagTriage` now passes its `sourceTab` argument when calling
  `getTagSetForItem`

Result: a triaged Vicious resolves via `categories: ['sitcom']` →
`'tv-sitcom'` (already correct in your data); even if categories were
missing, the resolver would now use british-comedy's tab default
(`'tv-sitcom'`) instead of falling all the way to `'film-narrative'`.

**If you ever want item-specific overrides:** add `"contentType":
"tv-anthology"` (or any TAG_SETS key) directly to a catalog item's
JSON. Inside No. 9, for example, might benefit from being explicitly
`tv-anthology` rather than the `tv-sitcom` it currently inherits from
its category.

---

## 5.26.5 — 2026-05-09
**Service worker cache:** `scifi-tracker-v59` → `v60`

### Fix — Tag selection no longer boots focus out of the tag row

When toggling a tag chip in step 2 or 3 of the triage flow, the
re-render path replaced `.triage-card`'s innerHTML to update active
states. That destroyed the focused tag-button DOM node. Focus then
escaped to body, the 5.26.0 focusin listener detected the escape,
redirected to the first `.modal-actions button` — booting the user
from the tag row mid-tagging.

**Fix:** capture the clicked tag's `data-tag` value before re-rendering,
then after `renderRateTagTriage` rebuilds the DOM, re-query for the
same tag (`.triage-tag-btn[data-tag="…"]` with `CSS.escape`) and
`.focus()` it.

Result: tap-tap-tap through tags as fast as you want. Focus stays on
the chip you just toggled. To leave the tag row, press Down from the
bottom row to land on the first action button (Continue → / Save &
Next ✓), exactly as you'd expect.

---

## 5.26.4 — 2026-05-09
**Service worker cache:** `scifi-tracker-v58` → `v59`

### Fix — Item title visible at all times in triage flow

Previous renderRateTagTriage layouts had the item's title (the actual
movie or show) inside `.triage-card` — the scrollable body. When
stepping back from rating to the previous item, or scrolling within a
tag list, the title could disappear. Users had no persistent reference
for what they were rating.

**Header restructured:**

```
┌─────────────────────────────────────────────────────────────┐
│ [←]  [Tab Badge] Movie Title (2024)    Rate & tag watched   │  ← Fixed
│                                                  3 of 18    │  ← Fixed
├─────────────────────────────────────────────────────────────┤
│  Step 2 of 3 · Positive tags                                │  ← Card
│  [Stayed with me] [Rewatchable] [Visually stunning] ...    │   (scrollable)
├─────────────────────────────────────────────────────────────┤
│  [Continue →]                                                │  ← Footer
│  [Skip]              [Back]              [Close]             │   (pinned)
└─────────────────────────────────────────────────────────────┘
```

`h3#triage-title` becomes a flex container:
- Left: source badge + item title (Didot serif, 22px / 26px TV)
- Right: mode label ("Rate & tag watched items") right-justified, all caps

`triage-progress` ("3 of 18") moved beneath header, right-aligned in
accent gold.

Inside `.triage-card` the only context now is the step indicator
("Step 2 of 3 · Positive tags"). Item title removed from the scrollable
body so it doesn't repeat or scroll away.

Result: across step 1 → 2 → 3, AND across step 3 → 2 → 1 (Back), the
title stays put. User can always tell what they're rating.

---

## 5.26.3 — 2026-05-09
**Service worker cache:** `scifi-tracker-v57` → `v58`

### Fix — Modal still overflowing on Android TV WebView (real cause: vh quirk)

5.26.2 trimmed the triage card content but the user reported buttons
still appearing below the viewport. Diagnosis: Android TV WebView's
`vh` unit measures the **full window**, including any space reserved
for system UI overlays (top status bar, bottom action bar). The visible
area can be smaller than `100vh` reports, so `max-height: 92vh` could
still exceed the actually-visible space.

**Two-part fix:**

**1. Switch to `dvh` (dynamic viewport height).** `dvh` excludes any
system UI that's currently visible — what you can actually see. CSS
declared with `vh` fallback first, `dvh` second so older WebViews still
get the `vh` value:
```css
max-height: 85vh;     /* fallback for browsers without dvh */
max-height: 85dvh;    /* used on Chrome 108+, modern Android WebView */
```
Also tightened from 92 to 85 for additional breathing room.

**2. 2-column grid for triage action buttons.** Step 2 and step 3 each
have 4 action buttons (Continue/Skip/Back/Close). Old flex-row layout
risked horizontal overflow on narrower modal widths and made D-pad
navigation between them less predictable.

```css
#triage-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
#triage-actions .action-btn.primary {
  grid-column: 1 / -1;  /* Save & Next spans full width */
}
```

The `primary` action (Save & Next on step 3, Continue on step 2) gets
full-width emphasis, the other three buttons sit in a 2x2 below.

---

## 5.26.2 — 2026-05-09
**Service worker cache:** `scifi-tracker-v56` → `v57`

### Fix — Triage card stripped of context-irrelevant content

5.26.1 made modals scrollable to keep action buttons visible. But the
right answer was to ELIMINATE the overflow at its source — the rate/tag
flow doesn't need a long pitch/meta/why-priority block to be useful. If
you're rating something you've watched, the title alone is enough; if
you can't recall it, manually navigating to the tab gives you the full
description.

**Triage card now contains:**
- Source badge (small, tab context)
- Title with subtle (year) suffix
- Step-N-of-3 indicator
- Rating buttons OR tag chips per step

**Removed for the rate/tag flow:**
- Priority badge
- Full meta line (director · country · runtime)
- Why-priority callout
- Pitch paragraph

The sticky-footer layout from 5.26.1 stays as defensive coverage —
even if a future change makes the card taller, the action buttons are
still pinned to the bottom of the modal. But in normal use, content
now fits in the viewport without scrolling.

`.triage-year` styled small + dim so the year reads as a subtle
parenthetical rather than visual noise next to the title.

Other modals (Stats, Watch sub-modal, etc.) keep their full content —
the trim only applies to `renderRateTagTriage`.

---

## 5.26.1 — 2026-05-09
**Service worker cache:** `scifi-tracker-v55` → `v56`

### Fix — Modal content flowed off the bottom of the viewport

5.26.0's 3-step triage card had more vertical content than the prior
single-screen layout (step indicator + rate-buttons-or-tag-chips +
larger action row). On a 4K TV at logical 1080p the total height
exceeded the modal's `max-height: 80vh`, but `.modal-content` had no
`overflow` rule — so the bottom (action buttons) got pushed below the
visible viewport.

**Sticky-footer layout for all modals:**

`.modal-content` now uses `overflow: hidden; display: flex;
flex-direction: column;` with `max-height: 92vh` (was 80vh — slightly
more breathing room).

Children explicitly tagged as fixed don't shrink:
- `.modal-back` (top-left back arrow)
- `h3` (title)
- `.modal-actions` (bottom button row)
- `.triage-progress`

The "body" element (variable-content middle) is whichever of these is
present:
- `.triage-card` (Triage modal)
- `.stats-content` (Stats modal)
- `#watch-modal-body` (Watch sub-modal)
- `.modal-textarea` (Export, Import, Pair URL)
- `.search-results` (Search modal)

These get `flex: 1 1 auto; min-height: 0; overflow-y: auto;` — they
expand to fill available space and scroll internally when content
overflows. Action buttons stay pinned at the bottom of the modal,
always visible.

Result: open the triage modal, no matter how much content the current
step has, the rating/tag UI scrolls inside the card while Save & Next
/ Back / Close stay visible at the bottom.

---

## 5.26.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v54` → `v55`

### Fix — Triage now 3-step (rate → positive → critical) + hardened focus trap

**Triage modal split into three steps:**

5.24.0 grouped positive and critical tags together in one screen. On a
TV at couch distance the row got busy; users (correctly) wanted each
category to get its own focused step.

- **Step 1 — Rating** (Loved / Liked / Mixed / Disliked). Auto-advances
  to step 2 on selection.
- **Step 2 — Positive tags only**. Tag chips for positive reactions
  appropriate to the item's content type. Action buttons: *Continue →*
  to step 3, *Skip tagging* to advance to next item, *← Back to rating*,
  *Close*.
- **Step 3 — Critical tags only**. Tag chips for negative reactions.
  Action buttons: *Save & Next ✓*, *Skip critical*, *← Back to
  positive*, *Close*.

State tracked via `triageState.step` (1/2/3, reset to `null` between
items). `rate-loved-untagged` mode opens directly at step 2 (rating
already exists).

A small step indicator at the top of the card shows "Step N of 3 ·
[step name]" so the user always knows where they are in the flow.

**Hardened modal focus trap:**

5.19.0's trap relied on the D-pad keydown handler scoping its
focusables list to the open modal. That works for arrow-key
navigation, but doesn't catch focus that escapes via:
- Tab key (browser default tab order)
- Programmatic `.focus()` calls in app code (e.g., search input
  auto-focus that fires before the modal observer)
- Focus state that was already outside the modal when it opened

New global `focusin` listener: any time focus lands on an element,
checks if a modal is `.active`. If yes and the focused element is NOT
inside that modal (via `openModal.contains(target)`), focus immediately
redirects back to the first valid focusable inside the modal (priority:
.modal-actions button → .watch-btn-large → other content button →
input/textarea/select → .modal-back).

Result: while a modal is open, the only highlightable elements are
inside it — by any focus mechanism, not just D-pad arrows.

---

## 5.25.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v53` → `v54`

### Content — Heroes & Comics catalog populated

`data/heroes-comics.json` and `data/heroes-comics-tv.json` were
essentially empty (1 manual + 12 stub auto-promoted in films, 0 in TV).
Now populated with focused recommendation lists:

**Films (40 items)** distributed across the existing 9 sections:
- I. Marvel — MCU (8): Iron Man, Avengers, GotG, Winter Soldier, Doctor
  Strange, Black Panther, Infinity War, Endgame
- II. Marvel — Non-MCU (7): X-Men, X2, Spider-Man (2002), Spider-Verse
  Into & Across, Deadpool, Logan
- III. DC (7): Dark Knight, Joker (2019), Wonder Woman, The Batman,
  Aquaman, Suicide Squad (2021), Joker: Folie à Deux
- IV. Indie / Other Publishers (4): Watchmen (2009), V for Vendetta,
  Kick-Ass, Hellboy
- VI. Cosmic (1): GotG Vol. 3
- VIII. Team-Up (2): Deadpool & Wolverine, Thunderbolts*
- IX. Non-Comic Super-Powered (5): Incredibles, Unbreakable, Chronicle,
  Brightburn, Glass
- Z. Plex History (6): Kingsman 2, League of Extraordinary Gentlemen,
  New Mutants, X-Men Apocalypse, X-Men Dark Phoenix, X-Men First Class

**TV (8 items)** across 5 sections: WandaVision, Loki, X-Men '97
(Marvel D+), Daredevil (Marvel Netflix), Batman: TAS (Animated), The
Boys, Invincible, Watchmen HBO (Deconstructive).

Each item has full metadata: title, year, director (where applicable),
runtime, pitch, categories, contentType. The new triage modal (5.24.0)
is the recommended path to capture rating + reaction tags for these
items in your normal TV viewing flow.

### Companion artifacts

Two state-import JSONs sit alongside this update for paste-into-Import
in the app:
- `heroes-comics-state-import-films.json` — 35 items as Watched
- `heroes-comics-state-import-tv.json` — 4 Watched, 4 Queued

Apply by switching to the relevant tab (Heroes & Comics or Heroes &
Comics TV), opening Import, and pasting the file's contents.

---

## 5.24.0 — 2026-05-09
**Service worker cache:** `scifi-tracker-v52` → `v53`

### Feature — Progressive rate+tag triage flow (TV-friendly)

Renamed the wizard's "Recently watched, unrated" step to **"Watched but
untagged"** and broadened its filter to catch all watched items missing
reaction tags, not just unrated ones. Items rated Loved/Liked/Mixed/
Disliked but never tagged now flow through the same triage path as
truly-unrated items.

**New filter:** `getStatus(id, tab) === 'watched' && getTags(id, tab).length === 0`
(was `getStatus === 'watched' && !getRating(id, tab)`)

**New triage modal UX (progressive: rate → tag):**

- **Step 1 (no rating yet):** 4 large rating buttons in a 2×2 grid —
  Loved (green), Liked, Mixed, Disliked (red). 18px font, 18px padding;
  in TV mode bumps to 24px padding, 18px font. Clicking a rating saves
  it and auto-advances to step 2.

- **Step 2 (rating set, tags missing):** displays the tag chips
  appropriate to the item's content type (`getTagSetForItem(item)`),
  split into a Positive row (green border on active) and a Critical row
  (red border on active). Tap to toggle. Active state has tinted
  background + colored border. **Save & Next** commits and advances to
  the next item in the queue. **Back to rating** clears the rating so
  you can re-rate. **Close** exits triage.

- **Both steps:** progress counter (`5 / 18`), source badge, item title,
  meta (year · director · runtime · country), why-priority, pitch.

**Triage state extended:** `triageState.requestMode` now records the
wizard's launching mode (`rate-recent` or `rate-loved-untagged`) so
`renderTriage()` can dispatch to the new `renderRateTagTriage()` UI.
Other modes (`queue`, `suggest`, generic `wizard`) keep the existing
status-only triage card.

`rate-loved-untagged` shares the same UI but skips step 1 (rating
already exists) — opens directly to the tag chips.

**TV-mode upscale:** all interactive elements respect `body.tv-mode`
sizing rules — rate buttons grow to 24px padding/18px font, tag chips
to 12px padding/14px font, headings to 14px.

---

## 5.23.3 — 2026-05-08
**Service worker cache:** `scifi-tracker-v50` → `v51`

### Fix — Wizard top clipped: flex centering + content overflow

5.23.2 reduced the banner size, but the wizard banner kept clipping at
the top on the (4K — corrected from prior 1080p assumption) Sony Bravia.
Diagnosed: not actually a banner-size problem. The wizard CSS used
`display: flex; align-items: center; overflow-y: auto;` — when content
(banner + subtitle + step matrix + footer) exceeds viewport, flex
centering distributes the overflow EQUALLY above and below center, and
`overflow-y: auto` only scrolls forward from the natural content start,
making the top inaccessible.

**Two changes:**

1. `.wizard`: switched to `flex-direction: column; align-items: center;
   justify-content: flex-start`.
2. `.wizard-content`: added `margin: auto 0`. Auto margins on a flex
   item collapse to 0 when there's no extra space — content starts from
   the top and scrolls down naturally. When content fits, the auto
   margins distribute remaining space evenly above and below for the
   same vertical-centered look.

**Banner sizing on 4K:** TV-mode `max-width: 720px` was overly
conservative for a 4K viewport. Switched to viewport-relative
`max-width: 60vw` (with the same `max-height: 28vh` cap, slightly raised
from 24vh now that overflow is handled). On a 4K TV the banner can grow
to fill ~1080×608 vs. the previous 720×405; on phone the 480px max
remains.

---

## 5.23.2 — 2026-05-08
**Service worker cache:** `scifi-tracker-v49` → `v50`

### Fix — Wizard banner overflowed viewport on TV (top clipped)

5.23.0 sized the wizard banner to `max-width: 880px` in TV mode with no
`max-height` constraint. On a 1080p TV the 16:9 banner rendered at
880×495px — combined with the subtitle, the wizard step buttons, and
the footer, total content height exceeded the 1080px viewport. The
wizard's flex `align-items: center` then centered the overflowing stack,
pushing the banner's top above the visible area and clipping it.

**Constraints tightened:**

- Phone: `max-width: 480px`, `max-height: 26vh`, `object-fit: contain`
- TV mode: `max-width: 720px`, `max-height: 24vh`, `object-fit: contain`

The `max-height: Nvh` floor caps the banner at a fraction of the
viewport regardless of width settings — on a 1080p TV the banner now
renders at ~480×270 (height-capped), leaving ~76% of viewport for the
subtitle, action buttons, and footer.

`object-fit: contain` preserves the 16:9 aspect ratio when both
max-width and max-height fight; the image letterboxes itself rather
than distorting.

---

## 5.23.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v48` → `v49`

### Fix — Form fields show focus ring on D-pad navigation

A legacy CSS rule from V8 (`.modal-input:focus { outline: none; }`)
killed the focus outline on every textarea, input, and select that used
the `.modal-input` class. The 5.19.0 mode-agnostic `*:focus-visible`
rule with `!important` added the gold ring back — but only on browsers
that support `:focus-visible`. Older Chromium-based TV WebViews fall
back to plain `:focus`, where the legacy `outline: none` won.

Result: D-pad navigation WAS reaching the new pair-receive textarea
(and the existing search input, period-review fields, settings inputs,
etc.), but you couldn't see the focus ring — the field looked unfocused
even when it had focus.

Fix: apply the gold focus ring on both `:focus` and `:focus-visible` for
all form fields (`.modal-input`, `input`, `textarea`, `select`). Now
visible regardless of WebView's `:focus-visible` support.

Side benefit: every text input across the app gets the same prominent
focus indicator as buttons. Previously the form fields had a subtle
border-color change only.

---

## 5.23.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v47` → `v48`

### Feature — Wizard home screen uses hi-res banner instead of text title

The wizard home screen's `<h1 class="wizard-title">WatchTrack</h1>` is
replaced with the 1280×720 film-strip banner image
(`icons/wizard-banner.png`, 73 KB). Same banner aesthetic as the
`tv-banner.png` Leanback launcher artwork, scaled to a hero treatment on
the home screen.

- Banner is responsive: `max-width: 600px` on phone, `max-width: 880px`
  in `body.tv-mode` for the bigger viewport. `height: auto` preserves
  the 16:9 aspect ratio.
- The `<h1>` becomes an `<img class="wizard-banner">` with `alt` text
  preserving the screen-reader semantics ("WatchTrack — Film & TV
  Library").
- Added to the service-worker precache list, so the banner is available
  offline and on first launch after the cache rotation.
- The pre-existing `.wizard-title` CSS rule is kept (currently unused
  but available if any other surface needs the typographic title).

---

## 5.22.2 — 2026-05-08
**Service worker cache:** `scifi-tracker-v46` → `v47`

### Fix — D-pad navigation skipped textarea/select fields

The keydown handler's focusables selector listed `button, a, input` but
omitted `textarea`, `select`, and `[tabindex]`. So the new
`#pair-receive-input` textarea (added in 5.22.1) was unreachable by
D-pad — pressing arrow keys jumped right past it.

Both selectors (the directional-scoring focusables list AND the
first-focusable fallback) now include `textarea, select,
[tabindex]:not([tabindex="-1"])`. The Receive-setup paste field becomes
reachable on TV without a mouse.

This also benefits any other textarea or select in the app (notes
fields, period-review type/year/month dropdowns, etc.).

---

## 5.22.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v45` → `v46`

### Fix — Pair flow path-around for Google TV storage isolation

5.22.0 assumed the receiving TV would either route the pair URL directly
to the TWA, OR open it in Chrome and benefit from shared TWA/Chrome
localStorage at the same origin. On Google TV, neither holds: clicking
the link opens the URL in a separate browser app whose storage is
**sandboxed away from the WatchTrack TWA**. The config gets applied — to
the wrong sandbox.

**Fix:** Add a paste-based receive path that operates entirely INSIDE
the TWA, bypassing URL routing.

- New `applyConfigFromString(input)` helper: accepts either a full pair
  URL or just the base64 payload, normalizes, dispatches to the same
  underlying setters as `applyConfigFromUrl()`. Factored shared logic
  into `applyConfigPayload(b64)`.
- Settings → Plex Webhook Bridge gains a "Receive setup from another
  device" textarea + "Apply pasted setup" button. User pastes the URL
  from another device (typically via temporarily-paired Bluetooth
  keyboard's Ctrl+V), clicks Apply, page reloads with config in place.
- Pair modal's instruction text updated to recommend this paste path
  rather than the URL-routing path on TV setups.

This makes the flow reliable on any TWA host regardless of how OEM
browsers handle URL routing or storage isolation.

---

## 5.22.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v44` → `v45`

### Feature — Cross-device config pairing (URL-based credential transfer)

Typing a Cloudflare Worker URL and 32-character shared secret on a TV
remote is brutal. This release adds a one-shot URL-based pairing flow:

**On a device with a real keyboard** (phone, laptop, tablet):
- Settings → Plex Webhook Bridge → **Pair Another Device →**
- Modal opens displaying a URL of the form:
  `https://bicyclecrasher.github.io/WatchTrack/?config=BASE64ENCODEDJSON`
- The base64 payload contains: Worker URL, Worker secret, Plex token,
  Plex server URL, Plex client ID, streaming region, and your "My
  Subscriptions" list (version-tagged `v: 1`).
- **Copy** button puts the URL on the clipboard. **Share…** triggers
  `navigator.share` for Web Share API targets.

**On the receiving device** (TV, second phone, etc.):
- Open the URL however delivered (Cast Tab from Chrome, emailed link,
  bookmark sync, etc.).
- WatchTrack's bootstrap detects `?config=` BEFORE any other init runs,
  decodes the JSON, writes each field to localStorage via the existing
  setters (`setWebhookUrl`, `setWebhookSecret`, `setPlexToken`,
  `setPlexServerUrl`, `setPlexClientId`, `setStreamingRegion`,
  `setMySubscriptions`), strips the `config` param from the URL via
  `history.replaceState()`, and reloads.
- After reload, the receiving device is fully configured — the rest of
  init runs with `isPlexConfigured()` and `isWebhookConfigured()`
  returning true, the catalog enrichment sync kicks in, etc.

**Security notes (also surfaced in the pair modal):**
- The URL contains credentials in plaintext base64 (not encrypted).
  Anyone with the URL can talk to the user's Worker and Plex server.
- Mitigations: URL is auto-stripped from receiving device's history on
  apply. Generated fresh each time the pair button is tapped (no
  persistent token). Pair modal warns the user to treat the URL like a
  password.
- Future hardening: could route through the Worker as a one-time-use
  pair code (4 digits, 5-min TTL, KV-backed) — that requires Worker
  changes and is out of scope for this release.

**Plex API limitation context:** Plex's "linked streaming services" are
not exposed via API, so pairing can transfer the user's manual
subscription list (set in 5.21.0) but not the actual Plex Discover data.

---

## 5.21.3 — 2026-05-08
**Service worker cache:** `scifi-tracker-v43` → `v44`

### Fix — Watch sub-modal error message points to correct Settings section

The "TMDB worker not configured" message in the Watch sub-modal pointed
to "Settings → Plex Integration", but the actual section name in the
Settings modal is **Plex Webhook Bridge**. Updated the message to name
the correct section, list the two required fields (Worker URL + Shared
Secret), and reference `worker/DEPLOY.md` for deployment instructions.

The Plex section of the Watch sub-modal still works without the Worker —
"Watch on Plex" only requires `isPlexConfigured()` (token + server URL),
not `isWebhookConfigured()`. The Worker is only needed for the TMDB
watch-provider lookup (subscriptions / rent / buy / region data).

---

## 5.21.2 — 2026-05-08
**Service worker cache:** `scifi-tracker-v42` → `v43`

### Fix — Tabs page unresponsive on TV after wizard exit

Regression introduced by 5.19.0's `.modal-back` injection. Every modal
got a Back arrow at the top of its content; they live in the DOM at all
times, even when the modal is hidden via `.modal { display: none; }`.

The D-pad keydown handler's first-focusable fallback used:
`searchRoot.querySelector('.modal-back, .wizard-btn, .item, .tab-btn, button')`.
`querySelector` returns the first match in **DOM order**, which is now
always a hidden `.modal-back`. Calling `.focus()` on a `display: none`
element is a silent no-op, so the user pressed arrows and nothing
happened. Could only recover by Force-Closing the app.

**Two-part fix:**

1. **First-focusable fallback now filters for visibility** — uses
   `el.offsetParent !== null` (the same check the direction-scoring code
   already had) and excludes `.modal-back` from the selector. Prefers
   `.tab-btn.active` as the starting point when entering the tabs view.

2. **`wizardHide()` seeds focus on the active tab** — when you tap "or
   browse all 25 tabs →" or otherwise dismiss the wizard, focus moves to
   `.tab-btn.active` after a 50ms tick (giving the layout time to settle).
   Previously focus stayed on the now-hidden wizard-browse button,
   falling back to body.

Combined: D-pad on the tabs page now reliably picks up where you'd
expect, regardless of how you got there.

---

## 5.21.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v41` → `v42`

### Fix — Modal auto-focus + D-pad direction scoring

Two TV-mode regressions from 5.19.0/5.21.0:

**1. Auto-focus on Back button (top-left).** When a modal opened, the
MutationObserver focused the document-order-first focusable, which after
5.19.0 is always the injected `.modal-back` arrow. Pressing Down from
there made the next focus jump diagonal-ish to the bottom action buttons,
feeling like it skipped half the modal.

  → Auto-focus now prefers `.modal-actions button` first, then primary
  content buttons (`.watch-btn-large` etc.), then inputs, with
  `.modal-back` as last resort. Modal opens, focus is on Queue / Start
  watching / Close — what muscle memory expects. Back is still reachable
  via D-pad Up.

**2. D-pad "nearest in direction" picking the wrong button.** Old
algorithm scored candidates by `Math.hypot(dx, dy)` — pure Euclidean
distance — which meant a button slightly in the desired direction but
heavily offset perpendicularly could beat a button directly aligned but
slightly farther away. Combined with flex-wrap layouts in the new Watch
modal (rows of provider buttons of unequal counts), this caused
unpredictable jumps.

  → New scoring: `primary_axis_distance + 2 × perpendicular_axis_distance`.
  Heavy penalty for perpendicular offset, so D-pad strongly prefers
  axis-aligned moves. Direction cone tightened to 60° (`perpendicular ≤
  2 × primary`). The minimum-delta threshold raised from 5px to 10px to
  avoid catching elements in the same visual row when moving up/down.

Result: Down from a button in the middle of a wrap-row now reliably hits
the corresponding column in the next row, falling through to the
bottom action buttons when the row ends.

---

## 5.21.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v40` → `v41`

### Feature — Watch sub-modal in Triage (Plex-first, your-subs prioritized)

The Triage modal's "Start watching" action no longer just flips the item's
status — it now opens a Watch sub-modal that surfaces *where* to watch,
prioritized by what you actually have access to.

**Display order:**
1. **Plex personal server** (if `plexHasItem(item)` returns a match): the
   Watch modal shows ONLY a large "Open in Plex" button (deep-linked via
   `plex://play?metadataKey=…`) plus a collapsed "Other ways to watch"
   expander. If you own it on Plex, that's the answer — no reason to push
   subscriptions you'd be paying twice for.
2. **Your subscriptions** (TMDB watch-providers filtered by your owned
   list, marked with a gold ✓ and accent border): pulled from the new
   `MY_SUBS_KEY` localStorage list, defaulting to your configured profile
   (Hulu, Disney+, Max, Amazon Prime Video, Apple TV+, Paramount+, PBS
   Masterpiece, National Theatre at Home, Dropout, 2nd Try). Matched
   against TMDB names via `PROVIDER_ALIASES` (Disney Plus → Disney+,
   Paramount Plus with Showtime → Paramount+, etc.).
3. **Other ways to watch** in your region: the rest of TMDB's flatrate,
   free, ads, rent, buy tiers — same UI, no priority badge.
4. **Available in other regions** (collapsed expander): if the title has
   providers in countries other than yours, a list of regions and top
   providers is available without leaving the modal.

**Action buttons (bottom of modal):**
- *Mark watching (no platform)*: sets status without launching anything,
  for cases where you started elsewhere or want to track without picking.
- *Cancel*: closes the modal, no state change.
- *Tapping any provider button*: launches the deep-link search URL
  (existing `streamingSearchUrl()` map, extended in this release with
  Dropout, PBS Masterpiece, NT at Home, Mubi, Criterion, Shudder,
  BritBox, Acorn, AMC+, Starz), AND sets status to watching, AND
  advances the triage queue.

**Plex API limitation note:** Plex's "Linked Streaming Services" feature
(where you connect Netflix etc. inside the Plex app) is *not* exposed via
any official Plex API to third parties. The closest approximation —
implemented here — is the manual "My subscriptions" list. The default is
seeded from your configured profile and editable via `localStorage`
(future Settings UI planned).

**Niche services without TMDB representation** (Dropout, 2nd Try,
National Theatre at Home) stay in your subscription list but won't ever
appear as Watch buttons because TMDB doesn't index their catalog. They
serve as visual confirmation that the app is aware of them.

---

## 5.20.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v39` → `v40`

### Feature — Stats modal SVG charts

The Stats modal now renders four inline visualizations alongside the
existing text counts. All charts are pure SVG/CSS — zero dependencies, no
CDN fetches, fully offline-capable, and respect the existing dark/gold
typographic palette via CSS custom properties.

- **Ratings distribution** — donut chart with center total. Slices use
  `var(--watched)` (Loved), `var(--accent)` (Liked), `var(--watching)`
  (Mixed), `var(--skip)` (Disliked).
- **Activity over time** — 12-month line chart with filled area. Uses the
  per-item `lastUpdated` timestamps already in `state[tab][id]`.
- **By decade** — vertical bar histogram of catalog items by decade,
  sorted chronologically.
- **Per tab (top 10)** — horizontal stacked bars showing each tab's
  Watched / Watching / Queued / Untouched ratio, normalized to the
  largest tab so relative size is visible at a glance.

Four small helper functions (`statsDonut`, `statsLineChart`,
`statsHistogram`, `statsStackedBars`) generate the SVG and a matching
HTML legend. Total added code: ~120 lines JS, ~50 lines CSS.

In TV mode (`body.tv-mode`) charts and legends scale up: SVG max-width
240px → 320px, legend font 12px → 14px, stacked-bar height 10px → 14px.

---

## 5.19.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v38` → `v39`

### Feature/Fix — TV-mode-agnostic modal navigation, back buttons, focus rings

Root cause behind several TV symptoms (focus ring not updating, modals
unusable, remote-back exiting the app forcing a Force Close): the TWA
WebView on Google TV doesn't always match `detectTVMode()`'s UA regex, so
`body.tv-mode` wasn't applied — and every TV-mode-specific behavior was
gated behind that class. This release decouples those behaviors from the
mode class so they work regardless of detection.

**Focus rings (`styles.css`):** Dropped the `body.tv-mode *:focus` /
`body.phone-mode *:focus-visible` prefixed rules. The ring is now applied
globally via `*:focus-visible` (3px gold, `outline-offset: -3px`, fully
inset). `*:focus { outline: none; }` still suppresses the click-activation
ring, so touch users on phone don't see it.

**Keydown / remote back (`app.js`):** Removed the `tv-mode` gate from the
document `keydown` handler. Escape and Backspace (Android KEYCODE_BACK
maps to Backspace in WebView) now close any open modal regardless of
device mode. This is the fix for "back button exits the app." The handler
still early-returns inside text inputs so it won't hijack typing.

**Modal back button (`app.js` + `styles.css`):** A `← Back` arrow button is
now injected programmatically into every `.modal-content` at the top-left.
44×44px on phone, 56×56px in TV mode. Tapping or pressing Enter on it
closes the modal — a pointer/D-pad fallback for users who can't or
shouldn't have to use the remote back key.

**Modal focus management (`app.js`):**
- `MutationObserver` watches every `.modal` for the `active` class. When
  a modal opens, focus moves to the first interactive element inside it
  (typically the new `← Back` button).
- D-pad nav now scopes its focusables list to the open modal when one is
  active (focus trap). The user can no longer accidentally navigate from
  a modal control out into the underlying page.

**Net effect:** Triage modal, recommendations, search, stats, settings,
and every other modal are now navigable on the TV via D-pad, and the
remote back button closes them cleanly without exiting the app.

---

## 5.18.2 — 2026-05-08
**Service worker cache:** `scifi-tracker-v37` → `v38`

### Fix — Focus halo cropping at scroll-container edges (follow-up to 5.18.1)

5.18.1 set `outline-offset: -1px` on the TV-mode focus ring, but with a 3px
outline width, 2px of the halo still extended *outside* the element. Buttons
flush against the wizard `max-height: 60vh` overflow boundary still showed
clipped halo edges.

Math fix: `outline-offset` now matches the **negative** of `outline-width`,
so the entire ring sits inside the element's bounding box.

- TV mode: `outline: 3px` + `outline-offset: -3px`  (was `-1px`)
- Phone mode: `outline: 2px` + `outline-offset: -2px`  (was `2px`)

The phone-mode rule was also updated because the TWA WebView UA on Google TV
doesn't always match `detectTVMode()`'s regex, so the body can fall into
`phone-mode` even on a TV — and that path's halo was still extending outside.

Result: focus indicator is identical in size and color, but is fully contained
within the button on every screen, every container, every device mode.

---

## 5.18.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v36` → `v37`

### Fix — TV-mode focus halo clipping in tight grids

In TV mode the gold D-pad focus ring (`outline: 3px solid var(--accent)`) was
rendered with `outline-offset: 2px`, placing the halo 2px outside the focused
element's bounding box. On screens with closely-spaced focusable items — most
visibly the wizard "Pick a genre" matrix (8px grid gap) and any scroll-clipped
modal — the halo's outer edge could extend beyond container boundaries and
get visibly clipped, or visually overlap adjacent buttons.

`outline-offset` changed from `2px` to `-1px`, so the ring now sits 1px
*inside* the element edge (replacing the existing 1px neutral border on focus).
The focus indicator is still a bold 3px gold ring; it just no longer extends
beyond the element. Zero layout changes, no risk of clipping anywhere.

Also: `icons/tv-banner.png` regenerated from the new film-strip banner design
(replaces the auto-generated 320×180 banner from 5.17.0). Same filename,
same dimensions, no manifest or build-script changes required.

---

## 5.18.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v35` → `v36`

### Feature — Tappable header logo (reset to Watchlist)

The top-left header now displays a compact WT film-strip logo. Tapping it:
- Switches to the Watchlist tab
- Clears all category, sort, and filter state across every tab
- Closes any open modal
- Clears the search box
- Smooth-scrolls back to the top

Acts as a "soft refresh" — instantly returns to the curated Watchlist view without
re-running the wizard. Existing `⌂ Home` button (which opens the wizard) is preserved.

New asset: `icons/header-logo.svg`.

---

## 5.17.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v34` → `v35`

### Feature — TWA APK packaging for Google TV (Stage 5c)

Android TV packaging via Trusted Web Activity. Changes:

- `manifest.json`: orientation changed from `portrait` to `any` (Android TV is landscape; portrait lock causes letterboxing)
- `icons/tv-banner.png`: new 320×180 banner image for the Android TV Leanback launcher, generated from the existing 512×512 icon
- `worker/build-twa.sh`: guided build script that installs Bubblewrap, initializes the TWA project, patches AndroidManifest.xml for Leanback compatibility (LEANBACK_LAUNCHER intent filter, touchscreen not required, leanback feature, TV banner), and builds the signed APK

Separate `bicyclecrasher.github.io` user site repo created to host `/.well-known/assetlinks.json` for Digital Asset Links verification (required for fullscreen TWA without URL bar). Includes `.nojekyll` to prevent GitHub Pages from ignoring the `.well-known/` directory.

The PWA already has TV detection (`detectTVMode()` checks for "bravia" in UA) and full D-pad navigation support — no app.js changes needed.

---

## 5.16.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v33` → `v34`

### Feature — Catalog health report (Stage 5f)

New "Catalog Health" button in the Stats modal. Renders a full gap analysis covering:

- **Metadata completeness** — percentage coverage for director, runtime, country, critics, and priority fields, with expandable lists of items missing each
- **TMDB enrichment** — counts for unenriched items, stale enrichment (>30 days), and items missing recommendations/similar data
- **Reaction tags** — watched and rated items that have no reaction tags applied
- **Decade distribution** — visual bar chart of catalog spread across decades
- **Country diversity** — count of unique origins and top-12 breakdown
- **Tab sizes** — all tabs sorted smallest-first, thin tabs (<15 items) highlighted
- **Director concentration** — top-12 most represented directors, total unique count, single-entry count

---

## 5.15.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v32` → `v33`

### Feature — Genre-specific reaction tags

Replaced the two shared tag sets (`film-narrative` for all film tabs, `tv-prestige` for all TV tabs) with 21 genre-specific content types. Each tab now resolves to its own tailored set of positive and negative reaction tags:

- **Film:** scifi (Mind-bending, World-building, Hard sci-fi done right), espionage (Tradecraft feels real, Cat-and-mouse tension), crime (Great tension, Moral complexity), cons-courtroom (Great twist, Dialogue sparkles), horror (Genuinely unsettling, Great atmosphere), fantasy (World-building sells it, Mythic weight), heist (Ensemble chemistry, Plan is satisfying), comedy (Laugh-out-loud funny, Quotable), drama (Performance-driven, Oscar-bait feel), foreign (Culturally immersive, Culturally opaque), auteur (Director's voice unmistakable, Self-indulgent), pre-1960 (Still holds up, Acting style alienating), heroes-comics (Earned the stakes, Faithful adaptation, Origin-story fatigue)
- **TV:** each genre mirrors its film counterpart's flavor but swaps in TV-specific tags (Stuck the landing, Lost steam, Late-season decline, Procedural fatigue, Mythology collapses, etc.)
- Existing specialized types unchanged: tv-sitcom, tv-panel, tv-game, tv-doc-reality, tv-anthology, tv-limited, film-musical.
- Tags already saved on items that aren't in the new set are preserved silently (per existing design). They appear in the filter bar's "other" section if any items in the tab use them.

---

## 5.14.3 — 2026-05-08
**Service worker cache:** `scifi-tracker-v31` → `v32`

### Fixed — 3 TV promotion IDs mismatched runtime generator

RuPaul's Drag Race (comedy-tv), Mafia: Most Wanted (crime-tv), and Dune (scifi-tv) had `year: null` in the catalog but their hardcoded `id` fields used `-unknown` instead of `-null`. Runtime ID generation produces `-null`, so the "In repo" badge and deduplication never matched. Fixed all three IDs.

---

## 5.14.2 — 2026-05-08
**Worker version:** v5.2 → v5.3 (no service worker / app changes)

### Fixed — Promotion delete failing under CORS

#### The bug
`POST /promotions/add` and `GET /promotions` worked, but `DELETE /promotions/{tab}/{itemId}` failed with a CORS preflight rejection. The Worker's `Access-Control-Allow-Methods` header advertised only `GET, POST, OPTIONS`, so browsers rejected the DELETE preflight before the actual request reached the handler.

#### The fix
Worker CORS Allow-Methods now includes `DELETE`. Health string bumped to `v5.3 — DELETE in CORS`.

No app or service-worker changes — Worker-only redeploy.

---

## 5.14.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v30` → `v31`

### Content — 62 KV promotions committed to canonical catalogs

Auto-promoted items accumulated in `WATCHTRACK_PROMOTIONS` were merged into their respective `data/*.json` source files under a new `Z. Plex History (Auto-Promoted)` section per tab.

Counts: comedy +8, comedy-tv +1, cons-courtroom +1, crime +3, crime-tv +1, drama +7, espionage +2, heist +1, heroes-comics +12, horror +7, scifi +18, scifi-tv +1 (61 from Plex history + 1 from TMDB recommendation).

After redeploy, `mergePromotionsIntoCatalogs()` silently dedupes the KV entries against the canonical catalog. The KV entries themselves can be cleared at leisure via Settings → Plex Integration → Manage Promotions → Delete.

---

## 5.14.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v29` → `v30`

### Added — Stage 5e: Recommendation engine

The wizard's "Looking for something to watch → Start something new" branch now opens a Recommendations panel instead of going straight to triage. Recommendations are derived from your own ratings, scoped per genre tab.

#### How it works
For the genre you pick, the engine walks every item you've rated **Loved** or **Liked** in that tab (or across all film/TV tabs if you choose "Not Sure") and aggregates the TMDB `recommendations` and `similar` arrays cached in catalog enrichment. Each candidate accumulates a score of `Σ (Loved → 2, Liked → 1)` per source item, with deduplication on TMDB ID.

Candidates split into two sections:

- **Recommended for you** — items already in your catalog (in the selected tab) that you haven't watched, queued, or rated. Tap to jump to the item.
- **Discover** — TMDB candidates that are NOT in any of your catalogs. Tap to open the existing Promote modal, which adds the item under a new section `X. TMDB Recommendations (Promoted)` with status `queued`.

If your catalog hasn't been pre-enriched yet (no rec arrays cached), the panel offers a hint to run **Settings → Plex Integration → Pre-enrich catalog**. If you have no Loved/Liked items in the tab, the panel directs you to rate a few first.

A "Browse all unrated items" fallback button preserves the previous flow.

#### Data layer changes
- `catalogEnrichmentIdx` now persists `recommendations` and `similar` slim arrays per item alongside `tmdbId`/`type`/`year`/`posterPath`/`numberOfEpisodes`/`genres`.
- `enrichEntireCatalog()` skip-check tightened: items missing the new arrays are re-enriched on the next pass. **One-time UX cost: re-run "Pre-enrich catalog" once after upgrading.**
- The Worker has provided `recommendations`/`similar` since v5; this release just starts persisting them locally.

#### Promote-modal generalization
The Promote modal now branches on source: rec-sourced promotes write to a new section, set status to `queued` (not `watched`), and stamp a partial enrichment record so the same TMDB item disappears from Discover on the next render. Plex-history promotes are unchanged.

---

## 5.13.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v28` → `v29`

### Changed — Plex API calls now route through Cloudflare Worker

#### The driver
After a Plex Server update, the seedbox's frontend proxy began rejecting browser-originated TLS handshakes from cross-origin contexts. Direct fetches from `https://bicyclecrasher.github.io` to the seedbox returned `ERR_SSL_PROTOCOL_ERROR` despite the same URL working in the address bar. CORS allowlist tweaks weren't sufficient.

#### The fix
All Plex API calls now go through the Cloudflare Worker as a proxy. The Worker calls Plex server-to-server (no browser TLS context, no CORS), and returns responses to WatchTrack with permissive CORS.

#### Worker upgrades (v5.2)
- New CONFIG KV keys: `plex_url`, `plex_token` (set via /plex/configure)
- `POST /plex/configure` — store Plex URL + token in Worker
- `GET /plex/identity?secret=X` — test connection
- `GET /plex/library?secret=X` — fetch entire library (sections + items)
- `POST /plex/scrobble` — mark item watched on Plex
- `GET /plex/history?secret=X&start=N&size=N` — fetch paginated viewing history

#### WatchTrack changes
- New "Save to Worker" button in Settings → Plex Integration (one-time setup to push URL/token to Worker)
- `testPlexConnection()`, `fetchPlexLibrary()`, `plexMarkWatched()`, `fetchFullPlexHistory()` all refactored to call Worker endpoints
- localStorage Plex URL/token stays for UI display only; not the source of truth

#### Architectural benefit
- Plex token no longer needs to live in every browser's localStorage — it's at the Worker
- Future Plex/seedbox CORS changes don't break WatchTrack
- One less thing for users to manage if WatchTrack ever has multiple users

---

## 5.12.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v27` → `v28`

### Fixed — Service worker breaking Plex / Worker / TMDB cross-origin requests

#### The bug
The service worker's fetch handler intercepted ALL GET requests, including cross-origin ones to the Plex seedbox, Cloudflare Worker, and TMDB. When SW called `fetch(event.request)` for these, the request often failed (CORS preflight handling, opaque response semantics), the promise rejected, and the page got "Failed to fetch" with no useful error message.

This had been latent since the original SW was added, but became more visible after recent SW cache bumps re-activated the handler against newly-uncached cross-origin URLs.

#### The fix
1. **Same-origin gate**: SW fetch handler now early-returns for any request to a different origin. Cross-origin fetches (Plex, Worker, TMDB) pass through to the network with no SW involvement.
2. **Synthetic fallback on same-origin fetch failure**: if a same-origin fetch fails (offline, etc.), return a synthetic 504 response instead of letting the promise rejection propagate.
3. **Updated ASSETS list** to include musicals.json, heroes-comics.json, heroes-comics-tv.json — they were missing from the precache (offline mode wouldn't have served them).

---

## 5.12.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v26` → `v27`

### Added — Stage 5g: Wizard / guided-flow home screen

WatchTrack now opens to a guided-flow wizard instead of the catalog grid. The catalog browse experience is one tap away.

#### Flow architecture

```
Root: "What are you doing?"
├── Rating
│   ├── Recently watched, unrated → triage
│   ├── Things on my queue → triage
│   ├── Loved items missing tags → triage
│   └── Pick a specific tab → browse mode
└── Looking for something to watch
    ├── Film or TV?
    │   └── Continue / Start new / Rewatch
    │       ├── Continue → list of Watching items
    │       ├── Start new → genre matrix → triage
    │       └── Rewatch → genre matrix → triage (rewatchable-tagged first)
```

#### Key behaviors
- **Always starts fresh** on every app open — no preselected last choice
- **"Browse all 25 tabs →"** link in wizard footer falls back to existing tab grid
- **Home button** (⌂) in app header returns to wizard from anywhere
- **Genre matrix is dynamic**: only shows tabs of the chosen content type that have relevant items for the chosen session (unwatched/queued for "new"; watched+loved for "rewatch")
- **"Not Sure"** option in genre matrix → triage across all tabs of chosen content type
- **Triage launched from wizard** returns to wizard on completion (not catalog grid)

#### Triage scope expansions
The existing triage system supports cross-tab queues via `_watchlist_source_tab`. Wizard launches build custom queues:
- `rate-recent`: watched + unrated, sorted by lastUpdated
- `rate-queued`: queued items, all tabs
- `rate-loved-untagged`: loved + zero reactionTags
- `watch`: filtered by content type, session, genre with appropriate sort

#### Rewatch sort priority
"Rewatch an old favorite" sorts:
1. Items tagged Endlessly rewatchable / Rewatchable / Cult magnetism (any one)
2. Then loved before liked
3. Then lastUpdated

#### Architecture
- New top-level `<div id="wizard">` overlay; existing app structure wrapped in `<div id="app-shell">`
- Modals remain at body root so they overlay both wizard and app-shell
- Wizard state is in-memory only, never persisted
- "Always start fresh" honored: state resets on every wizardShow()

---

## 5.11.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v25` → `v26`

### Added — Stage 5d-1: Tag-filter pills

New filter row beneath the existing Watching/Queued/Watched filters. Filters items by their applied reaction tags.

- **Two pill rows**: positive tags (greenish) above, negative tags (reddish) below
- **Multi-select** with **AND/OR toggle**: AND requires all selected tags, OR requires any
- **Dynamic**: only shows tags actually applied to items in the current tab
- **Composes with status filter**: items must match both filters
- **Per-tab state**: in-memory only, resets on tab switch
- **Hidden on Watchlist** (heterogeneous tag set across content types is too noisy)
- **Clear button** to reset all selected tag filters
- AND/OR toggle only appears when 2+ tags are selected
- Orphan tags (in use but not in current tab's contentType set) appear in a third row with dashed borders

### Added — Stage 5d-2: Period in Review (markdown export)

New "Period in Review" button on the Stats modal. Generates a downloadable markdown report covering a chosen time window.

#### Period selection
- **Year**: pick any year that has data
- **Month**: pick year + month
- **Last 12 months**: rolling 12 months from today
- **Custom date range**: arbitrary start + end dates

#### Report contents
- **Headline stats**: items watched, started but not finished, queued, skipped — with delta vs. prior period
- **Rating distribution**: Loved / Liked / Mixed / Disliked counts with emojis
- **Top loved**: up to 20 most recent, with notes inline
- **Disliked list**: complete, with notes
- **Genres explored**: count per tab, sorted by volume
- **Top positive tags / negative tags**: 8 / 5 most-used
- **Monthly trend**: bar chart (text-rendered) — only shows for periods >60 days
- **Complete watched list**: every watched item in period, with rating emoji + date

Output is a `.md` file named `watchtrack-review-{label}.md`. Renders properly in GitHub, Notion, Obsidian, etc.

---

## 5.10.2 — 2026-05-08
**Service worker cache:** `scifi-tracker-v24` → `v25`

### Fixed — Seed state per-item merge (proper fix)

#### The deeper bug
v5.10.1 fixed the obvious case (entirely-new tab) but the merge gated on "tab is empty." If a user had touched even one item in a new tab during testing/preview, the seed for that tab was skipped — leaving 36 of 37 musicals unseeded.

#### The fix
Switched from per-tab merge to per-item merge:
- Iterate every (tab, itemId) pair in SEED_STATE
- If state[tab][itemId] doesn't exist, apply seed
- If user already has state for that item, skip — user data wins

Idempotent. Runs every load. Handles every future case automatically: new tabs, new items added to existing tabs, partial seeding after preview.

---

## 5.10.1 — 2026-05-08
**Service worker cache:** `scifi-tracker-v23` → `v24`

### Fixed — Seed state for new tabs not applied to existing installs

#### The bug
SEED_STATE only ran when `localStorage[STORAGE_KEY]` was completely empty (i.e., truly first install ever). For any user with months of existing state, adding seed entries for newly-introduced tabs (Musicals, Heroes & Comics) had no effect — the new tabs initialized empty.

#### The fix
On state load, after parsing existing localStorage state, iterate `catalogManifest` and for any tab whose state object is empty AND has entries in `SEED_STATE`, merge them in. Existing tabs with any state are untouched. New tabs get their seeds.

This is the right architectural fix: any future new tab added to the manifest with seed entries will now apply automatically on next page load, without overwriting existing user data on populated tabs.

---

## 5.10.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v22` → `v23`

### Added — Musicals reaction-tag taxonomy + seeded reactions

#### New contentType: `film-musical`
- Added as the 9th contentType in the system
- Musicals tab default is now `film-musical` (previously inherited `film-narrative`)
- Heroes & Comics film tab confirmed as `film-narrative`; Heroes & Comics TV as `tv-prestige`

#### Tag set (8 positive + 6 negative)
**Positive:** Score is the engine, Bravura staging, Powerhouse vocals, Triple-threat, Endlessly rewatchable, Earned emotion, Subversive or knowing, Cult magnetism

**Negative:** Score doesn't land, Vocally weak, Cuts mask the dance, Book is the problem, Joyless, Dated tropes

These replace the narrative-film tags (Rewatchable, Stayed with me, Visually stunning, etc.) with musical-specific axes covering score, performance, staging, book quality, tone, and cultural weight.

#### Catalog updates
- All 38 items in `data/musicals.json` updated to `contentType: "film-musical"`

#### Seed state (37 items)
- **Loved + tagged**: Singin' in the Rain (5 tags + notes), Rocky Horror, Wicked, Anastasia, Pitch Perfect 1/2/3, South Park: BLU
- **Disliked + tagged**: Les Misérables, Mamma Mia!, La La Land, White Christmas, Holiday Inn, Across the Universe
- **Mixed**: Mary Poppins Returns, Prince of Egypt
- **Liked (default for unflagged Watched items)**: 20 items (Disney Renaissance + most stage adaptations + classics)
- **Heroes & Comics**: Joker: Folie à Deux marked Watched (no rating; can be applied through UI)

---

## 5.9.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v21` → `v22`

### Added — Musicals tab (films only, populated)

New catalog tab: **Musicals**. Films-only (per user spec — no musical TV interest).

#### Sections (5)
- **I. Animated** — Disney Renaissance + non-Disney animated musicals (Anastasia, Prince of Egypt)
- **II. Stage Adaptations** — filmed versions of stage musicals
- **III. Original Screen Musicals** — written for film, including all-time-favorite Singin' in the Rain
- **IV. Jukebox & Bio-Musical** — songbook-driven and musician-life films
- **V. Cult & Auteur** — Rocky Horror, South Park: BLU

#### Categories (6)
animated, stage-adaptation, original-screen, jukebox, bio-musical, auteur, cult

#### Initial population (~26 items)
Curated from user's stated viewing history. Includes:
- All Disney Renaissance films (1989-1999)
- Stage adaptations watched (West Side Story 2021, Sound of Music, MFL, Grease, Sweeney Todd, Les Mis, Into the Woods, Hairspray, Mamma Mia, Annie 1982, Dreamgirls, Phantom 2004, Music Man)
- Original screen musicals watched (Singin' in the Rain ⭐, Mary Poppins / Returns, La La Land, White Christmas, Holiday Inn, Wizard of Oz, Across the Universe)
- Pitch Perfect trilogy
- Cult: Rocky Horror, South Park: BLU

User reactions captured in `whyPriority` fields per item. Items NOT pre-marked with status — user will mark them through normal UI flow on first open.

#### Architecture
- Total tabs: 24 → 25 (Watchlist + 24 alphabetical)
- No cross-listing into other genre tabs (forward-only rule applies)
- Multi-tagging within tab kept where appropriate (e.g., bio-musical items also tagged jukebox)

---

## 5.8.0 — 2026-05-08
**Service worker cache:** `scifi-tracker-v20` → `v21`

### Added — Heroes & Comics tabs (empty scaffolds)

Two new catalog tabs for superhero films and comic book adaptations:

- **Heroes & Comics** (films): 9 sections — Marvel MCU, Marvel Non-MCU, DC, Indie, Deconstructive, Cosmic, Street-Level, Team-Up, Non-Comic Super-Powered
- **Heroes & Comics TV**: 6 sections — Marvel Disney+, Marvel Netflix, DC, Animated, Deconstructive, Indie

Both tabs ship as empty scaffolds. Categories and section structure are defined; items will be populated via the orphan-promotion workflow.

### Scope decisions
- **Broader scope**: comic book adaptations + non-comic super-powered films (Unbreakable, Chronicle, The Incredibles, Brightburn). Not the broadest scope (Road to Perdition, A History of Violence stay in Crime/Drama).
- **No cross-listing across genre tabs**: this is a forward-only rule. Existing cross-listings remain. Auteur is the sole exception (different purpose).
- **Multi-tagging within a single tab kept**: items can have multiple categories within their tab.

### CATEGORY_LABELS additions
- Films: marvel-mcu, marvel-non-mcu, dc, indie, deconstructive, cosmic, street-level, team-up
- TV: marvel-disney-plus, marvel-netflix, animated

### Architecture
- Total tabs: 22 → 24 (Watchlist virtual tab + 23 alphabetical including 2 new)
- All four `tvTabs` sets in app.js updated to include heroes-comics-tv (5 occurrences confirmed via grep, including the type field)
- Manifest in `data/catalogs.json` and fallback manifest in `app.js` both updated

---

## 5.7.1 — 2026-05-07
**Service worker cache:** `scifi-tracker-v19` → `v20`

### Fixed — Worker timeout on /viewed/list
- `/viewed/list` was performing sequential KV reads on up to 1000 keys per request. With ~340 viewing records, this took 30+ seconds and tripped Cloudflare's 1101 timeout. Result: Plex History modal hung indefinitely with "Failed to fetch."
- Switched to parallel reads with 50-way concurrency (Promise.all batches). Now completes in <1 second for typical history sizes.
- Same fix applied preemptively to `/events` and `/promotions` endpoints (same sequential-read pattern, hadn't yet hit the wall but would have with growth).
- Worker version bumped to v5.1.

### Performance notes
- KV reads are ~30-100ms each. Sequential = O(N × 50ms). Parallel = O(50ms × ⌈N/50⌉).
- For 340 records: sequential ~17s, parallel ~340ms.
- Concurrency capped at 50 to stay well under Cloudflare's burst limits.

---

## 5.7.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v18` → `v19`

### Added — Stage 5b: Persistent orphan promotions (hybrid KV+GitHub)

Promotions in WatchTrack now persist across devices via Cloudflare KV. The history-modal "Promote" button writes to KV synchronously; on app boot, all KV promotions get merged into the catalog. Items committed to the canonical `data/*.json` files in the repo silently dedupe (canonical source wins).

#### Worker upgrades (v5)
- New KV namespace: `WATCHTRACK_PROMOTIONS` (no TTL — durable forever until manually deleted)
- `POST /promotions/add` — store a promotion under `${tab}|${itemId}` key
- `GET /promotions?secret=X` — list all stored promotions (called on app bootstrap)
- `DELETE /promotions/{tab}/{itemId}?secret=X` — remove a promotion (cleanup after committing to repo)

#### Promote button workflow (synchronous, Option A)
- Click Promote on an orphan in History modal
- Pick a destination tab in the existing promote modal
- Click confirm → POSTs to Worker → on success, runtime catalog updates and UI refreshes
- On Worker error: shows error message, item is NOT added (no silent failure)

#### Bootstrap merge
- On app load, if Webhook Bridge configured: fetches all promotions from KV
- Merges them into loaded catalogs as runtime items in a `X. Plex History (Promoted)` section
- **Silent dedupe (Option A)**: if a catalog JSON already has an item with the same id, the KV promotion is skipped. Canonical source wins. KV stays around as harmless cruft.

#### Manage Promotions modal
- New **Manage promotions** button in Settings → Plex Integration
- Lists all KV promotions sorted most-recent-first
- "In repo" badge appears on promotions that now exist in canonical catalog (cleanup candidates)
- Per-promotion **Delete** button (calls Worker DELETE endpoint)
- **Refresh** button re-fetches from Worker

#### Export as JSON patch (Option B — single combined file)
- New **Export as JSON patch** button in Promotions Manager
- Generates a single `.txt` file with sections per tab
- Each section shows the target file path (`data/{tab-id}.json`) and a JSON-formatted array of items to paste in
- Includes header with timestamp, total count, and instructions
- Filename: `watchtrack-promotions-YYYY-MM-DD.txt`
- Workflow: export → paste sections into appropriate catalog files in repo → commit & push → return to Manage Promotions and Delete the corresponding KV entries

### Architecture notes
- Promotions are de-facto YOUR promotions (single shared secret, no user concept) — fine for personal use
- Promotion IDs use the same scheme as catalog items (`title-year`); collisions across users would require multiple WatchTrack accounts, which doesn't apply here
- Deleting a promotion from KV doesn't remove the runtime item until next app load; no immediate-effect needed since the use case is post-commit cleanup

### Pending for Stage 5c
- TWA APK packaging via PWABuilder

### Pending for Stage 5d
- Multi-select tag operations
- Year-in-review / monthly export

### Pending for Stage 5e + 5f
- Recommendation engine using `recommendations` and `similar` arrays already returned from TMDB
- Catalog gap analysis with promote-to-catalog workflow (will reuse Stage 5b's promotion infrastructure)

---

## 5.6.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v17` → `v18`

### Added — Stage 5a: TMDB ID enrichment foundation

This release builds the foundation for upcoming features (recommendation engine, gap analysis) by ensuring every catalog item has a stable TMDB ID. Streaming-provider badges now load instantly on item expand instead of doing a search step every time.

#### Worker upgrades (v4)
- `tmdbLookup` now accepts an optional `tmdbId` parameter. When provided, fetches that ID directly from TMDB without a search step. Eliminates ambiguity for items already enriched.
- `/metadata/lookup` and `/metadata/bulk` endpoints accept `tmdbId` in their inputs.
- TMDB results now include `recommendations` and `similar` arrays (top 10 each) — preparation for Stage 5e (recommendation engine) and Stage 5f (gap analysis).
- Cache keys now use `tmdb-{id}` prefix when looking up by ID, separate from title-based keys.

#### Catalog enrichment storage (WatchTrack)
- New localStorage namespace: `watchtrack-catalog-enrichment`
- Maps `item.id` → `{ tmdbId, type, year, posterPath, numberOfEpisodes, genres, lastEnriched }`
- Loaded at app bootstrap, stays in memory
- Auto-populated on first streaming-badge load for each item (lazy enrichment continues to work)

#### Pre-enrich catalog button
- New **"Pre-enrich catalog"** button in Settings → Plex Integration
- Sweeps every catalog item, batches lookups to Worker (20 per call)
- Skips items enriched within last 30 days (idempotent / re-runnable)
- Progress modal shows live position
- Result modal shows: total items, processed this run, found on TMDB, errors
- Recommended one-time run after deploying v5.6 — subsequent runs are quick
- Roughly 30-90 seconds for 650 items

#### `tmdbLookupById` client helper
- Direct lookup by tmdbId, bypasses search step on Worker
- Used by streaming-provider rendering when enrichment index already has the tmdbId

### Pending for Stage 5b
- Persistent orphan promotions via Cloudflare KV + GitHub patch generation (hybrid model approved)

### Pending for Stage 5c
- TWA APK packaging via PWABuilder

### Pending for Stage 5d
- Multi-select tag operations (#5)
- Year-in-review / monthly export (#6)

### Pending for Stage 5e + 5f
- Recommendation engine ("what to watch tonight" + "more like X") drawing on `recommendations` and `similar` TMDB data
- Catalog gap analysis surfacing items similar to your loved set that aren't yet catalogued
- Promote-to-catalog workflow on suggestions (overlap with 5b)

---

## 5.5.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v16` → `v17`

### Added — Stage 4c: TMDB enrichment + Plex History modal + orphan promotion
This release closes out the Plex/Stage 4 initiative. WatchTrack is now a full curation, viewing, and recommendation system around Plex.

#### Worker upgrades (v3)
- New endpoint: `POST /metadata/bulk` — batch TMDB lookups (≤50 items per call); used by bulk-sync and catalog enrichment
- All previous endpoints retained

#### TMDB client in WatchTrack
- `tmdbLookup(title, year, type)` — single async lookup with localStorage cache (30-day TTL)
- `tmdbBulkLookup(items, progressCb)` — batched fetch through Worker `/metadata/bulk`
- Cache stored under `wt-tmdb-{type}:{normalized}:{year}` keys

#### Streaming-provider badges (on item cards)
- Lazily fetched from TMDB when item card expands
- Shows providers grouped by tier: Subscription / Free / Ads / Rent / Buy
- **Region selector dropdown** with 22 countries (US, GB, CA, AU, DE, FR, JP, KR, IT, ES, BR, MX, IN, NL, SE, NO, DK, FI, PL, IE, NZ, ZA)
- Each provider button is a clickable link to that service's search page (Netflix/Hulu/Max/Disney+/Prime/AppleTV+/Paramount+/Peacock/BBC iPlayer/Crunchyroll/YouTube/etc.)
- Region preference persists per device in localStorage
- For unknown providers, falls back to a Google search

#### TV completion rule (now active)
- Bulk-sync now fetches total-episode counts via TMDB during sync
- Applies completion threshold per `tvCompletionMode`:
  - `strict` (default): 95% of episodes watched → mark series Watched
  - `flexible`: 80% threshold (for long-running shows like House, Always Sunny)
  - `episodic`: never auto-mark watched (Top Gear, panel shows, SNL-style series)
- Runs alongside the existing 5+ distinct episodes → Loved rule

#### Plex History modal
- New header button: **Plex History**
- Displays every Plex view from the durable VIEWED KV
- Aggregated per-title (movies) and per-show (TV) with play counts and last-viewed dates
- **Filter dropdown**: All / Orphans only / In catalog / Movies / TV
- **Sort dropdown**: Most recent / Title A-Z / Most plays
- **Search input** for filtering by title
- Click a matched item → jumps to it in the catalog with highlight animation
- Refresh button re-fetches from Worker

#### Orphan promotion workflow
- Orphan items in History modal show a **Promote** button
- Promote modal: pick destination tab → adds item to a "Plex History (Promoted)" section in that tab
- Auto-marks watched (movies) or watching+loved (TV with 5+ distinct)
- After promote, history modal refreshes to reflect the new catalog match
- Catalog promotions live only in the device's runtime — not persisted to JSON files (that requires a Git push). Promotions add value for current session; for permanent additions, the catalog files in the repo would need updating.

### Architecture notes
- TMDB enrichment is purely additive — never modifies WatchTrack state directly
- All TMDB calls go through the Worker (single source of truth, single cache)
- Streaming-provider data updates as TMDB updates (30-day cache TTL)
- History modal data lives in Cloudflare KV; cache-on-fetch in WatchTrack avoids repeated network calls
- Promotion creates runtime catalog entries that work for the current session but don't persist across devices — the long-term path is to surface frequently-watched orphans for manual catalog curation

---

## 5.4.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v15` → `v16`

### Added — Stage 4b: Bulk-sync from Plex history
- New **"Sync from Plex history"** button in Settings → Plex Integration
- Fetches the full Plex history (`/status/sessions/history/all`, paginated, 500/page)
- Posts every entry to the Worker for durable storage in `WATCHTRACK_VIEWED` KV
- Applies state-change rules to WatchTrack catalog matches:
  - **Movies**: any matched movie → marked Watched
  - **TV shows** with 5+ distinct episodes watched → marked Loved
  - **TV shows** with any matched episode → marked Watching (does not auto-mark Watched in this stage; deferred to Stage 4c when TMDB provides total-episode counts for the 95%/80% rules)
- **Idempotent**: safe to re-run. Already-watched movies stay watched; already-loved shows stay loved.
- **Library whitelist** enforced both client-side and Worker-side (sections 1, 2 only)

### UI
- Progress modal during sync (status text + progress bar)
- Detailed results modal showing:
  - Total entries fetched / stored / filtered
  - Movies: distinct seen, matched, newly-watched, orphan count
  - TV: distinct shows, matched, watching, loved, orphan count
  - Top 15 movie orphans (by play count)
  - All TV orphans (by distinct episode count)
- Confirmation dialog before run (explains what will happen, says safe to re-run)

### Architecture notes
- Bulk sync calls Plex directly (CORS works on your seedbox) for paginated history fetch
- Then POSTs to Worker `/viewed/ingest` in batches of 200 entries
- State changes happen client-side after ingest succeeds (rule application)
- Orphans (items watched on Plex but not in WT catalog) live only in the Worker's `VIEWED` KV — they don't pollute WT state, but persist for Stage 4c's Plex History modal

### Pending for Stage 4c
- Total-episode-count lookup via TMDB for the 95%/80% completion thresholds (currently only "watching + loved" applies, never auto-marks series as watched)
- Streaming-provider badges on items
- Plex History modal showing all logged views including orphans
- Catalog-promotion workflow ("Promote orphan to catalog" buttons)

---

## 5.3.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v14` → `v15`

### Added — Stage 4a: Metadata + history foundation
This release lays the groundwork for bulk Plex history sync and TMDB enrichment. Stage 4b (UI for bulk sync) and 4c (streaming-provider badges) follow in subsequent releases.

#### Worker upgrades (v2)
- New endpoint: `GET /metadata/lookup?title=X&year=Y&type=movie|tv` — TMDB lookup with 30-day KV cache. Returns title, overview, runtime, episode counts, watch providers per region, top 5 cast, poster path, vote average.
- New endpoint: `POST /viewed/ingest` — bulk-import historical Plex viewing data (used once for backfill from `/status/sessions/history/all`).
- New endpoint: `GET /viewed/list?secret=X&cursor=...` — paginated list of every Plex view (durable, no TTL). Will power the future Plex History modal.
- Webhook handler now writes to `WATCHTRACK_VIEWED` (durable history) in addition to `WATCHTRACK_EVENTS` (TTL'd queue).
- Library whitelist hardcoded to sections 1+2 (movies + TV); other libraries silently dropped at ingest.

#### New KV namespaces
- `WATCHTRACK_VIEWED` — every Plex view, durable, no TTL
- `WATCHTRACK_METADATA` — TMDB enrichment cache, 30-day TTL
- `WATCHTRACK_CONFIG` extended with `tmdb_token` key

#### Catalog additions (5)
- **House MD** → Drama TV (`tvCompletionMode: 'flexible'`)
- **The Blacklist** → Crime TV (`tvCompletionMode: 'flexible'`)
- **Matlock (2024)** → Crime TV (`tvCompletionMode: 'episodic'`)
- **Boston Legal** → Cons & Courtroom TV (`tvCompletionMode: 'flexible'`)
- **Will & Grace** → Comedy TV (`tvCompletionMode: 'flexible'`)
- **QI XL alias** added to QI for matching purposes

#### Schema additions
- Catalog items now support `aliases` array — alternate titles to match against (e.g., QI matches "QI XL")
- Catalog items now support `tvCompletionMode` field with values `'strict'` (95% threshold), `'flexible'` (80% threshold), `'episodic'` (never auto-mark series watched)

#### Matcher improvements
- `plexNormalizeKey()` now strips parenthetical disambiguators, replaces `&` with "and", strips apostrophes (curly + straight + backtick), then collapses non-alphanumeric
- New `plexNormalizeKeyTitleOnly()` — TV shows match by series title only since Plex history doesn't carry series first-aired year on episode events
- Year-fuzz tolerance (±1) for movies — handles cases where TMDB / catalog / Plex disagree by one year on release date
- Aliases checked when matching both Plex library items and webhook events

#### Documentation
- `worker/DEPLOY.md` updated to v2 with all four KV namespaces + TMDB token setup
- `docs/DRYRUN-BENCHMARK.md` — preserved analysis of Plex history file as baseline for measuring future matcher improvements

### Pending for Stage 4b
- WatchTrack "Sync from Plex history" button in Settings → Plex Integration
- Plex History endpoint client (fetches `/status/sessions/history/all` from Plex server)
- Bulk apply logic with rules: movies → watched; TV ≥5 distinct episodes → loved; TV ≥95%/80% (per `tvCompletionMode`) → watched; otherwise watching
- Results modal showing matched/orphan/applied counts

### Pending for Stage 4c
- Streaming-provider badges on items ("Available on: Netflix, Hulu") via cached `/metadata/lookup` calls
- Search-on-service buttons that open Netflix/Hulu/Max/etc. with the title pre-typed
- Plex History modal — read-only view of all viewing including catalog orphans
- Catalog-promotion workflow for orphans

---

## 5.2.1 — 2026-05-07
**Service worker cache:** `scifi-tracker-v13` → `v14`

### Fixed
- Settings modal Save/Cancel buttons were inaccessible when content overflowed the viewport. Now: settings sections scroll independently while title and action buttons stay pinned to top/bottom. Modal also widened slightly (500px → 600px on phone, 900px in TV mode) to accommodate the Plex sections.

---

## 5.2.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v12` → `v13`

### Added — Plex webhook bridge (Stage 3 of TV/Plex initiative)
- **Cloudflare Worker** (`worker/worker.js`) for receiving Plex Pass webhooks and serving them to WatchTrack
- **Worker endpoints:**
  - `POST /webhook/{secret}` — Plex server posts scrobble/rate events here
  - `GET /events?secret=X&since=TIMESTAMP` — WatchTrack polls for new events
  - `POST /events/ack` — WatchTrack confirms processed events (deletes from KV)
- **WatchTrack-side polling:** on app launch, fetches new events, applies them, acks
- **Settings → Plex Webhook Bridge** section with Worker URL + Shared Secret fields + Test poll button
- **Event matching:** title+year normalized; movies → marks `watched`; TV episodes → marks parent show as `watching` (so a single episode doesn't mark a whole series watched)
- **Deployment guide** in `worker/DEPLOY.md` — full Cloudflare setup walkthrough

### Architecture
- Webhook bridge is **purely additive**: only ever marks items as watched/watching, never removes state
- Events stored in Cloudflare KV with 7-day TTL — auto-cleanup if WatchTrack never polls
- Shared-secret authentication; Worker rejects requests with wrong secret
- Free-tier Cloudflare Workers + KV (well within quota for personal use)
- Plex Pass required on the Plex side (lifetime subscription works)

### Pending for Stage 4
- TWA APK packaging via PWABuilder for installable Android TV app

---

## 5.1.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v11` → `v12`

### Added — TV mode (Stage 2 of TV/Plex initiative)
- **TV mode display** — auto-detected via user-agent (Bravia, Google TV, Chromecast, etc.) and viewport heuristics (large landscape + no touch). Manual override available in Settings.
- **TV-optimized layout** — larger fonts, increased spacing, simpler controls, hidden notes textarea (D-pad typing is impractical).
- **D-pad / arrow-key navigation** — focus rings on every focusable element; arrow keys navigate items; Enter activates; Escape/Backspace closes modals.
- **Spatial focus algorithm** — finds the nearest focusable element in the direction of the arrow press, weighted to prefer aligned elements.
- All `.item` cards now `tabindex="0"` and visibly focused in TV mode.

### Added — Settings modal (consolidated)
- New **Settings** header button opens a modal with Display + Plex sections
- Display section: Auto / Phone / TV radio buttons (persist to localStorage)
- Plex section: Server URL, Auth Token, Server Identifier inputs + Test Connection + Refresh Library
- Replaces previous scattered configuration

### Added — Plex integration scaffolding
- Plex auth token / server URL / clientIdentifier stored in localStorage (never sent anywhere except plex.tv API calls)
- `fetchPlexLibrary()` retrieves library catalog and caches in-memory
- `plexHasItem(item)` matches WatchTrack items by title+year against Plex library
- **`⊕ Plex` badge** appears on items present in your library
- **`▶ Play on Plex` button** appears on matched items; launches the Plex Android TV app via `plex://` deep link
- Status auto-updates to "watching" when launching playback
- Fallback to Plex web client if deep link doesn't fire

### Architecture notes
- Plex layer is purely additive: never removes WatchTrack state, never modifies items not in your library
- All Plex API calls are direct from browser to your seedbox/plex.tv (no third-party intermediary)
- Library cache rebuilds on Settings save / Refresh Library / app startup
- Webhook reception (Stage 3) and full bidirectional sync deferred to next session

### Pending for Stage 3
- Cloudflare Worker for receiving Plex Pass webhooks (real-time "watched on Plex" → "watched in WatchTrack")
- TWA APK packaging via PWABuilder for installable Android TV app

---

## 5.0.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v10` → `v11`

### Added — Watchlist tab + multi-feature release (architectural)
- **Watchlist** tab (virtual, first in nav) aggregating across all 21 catalogs:
  - **A. Currently Watching** — items with status `watching`
  - **B. Your Queue** — items with status `queued`, sorted most-recently-touched first
  - **C. System Suggestions** — items with no status set but tagged `priority: high` or `priority: med` in their catalog. Provides genre-spanning meta-suggestions.
  - Each item displays a source-tab badge; status/rating/tag changes route to the source tab's state.
- **Tab navigation reordered**: Watchlist first, then all other tabs alphabetical (Auteur, British Comedy, Classics, Comedy, Comedy TV, Cons & Courtroom, Cons & Courtroom TV, Crime, Crime TV, Drama, Drama TV, Fantasy, Fantasy TV, Foreign, Heist, Horror, Horror TV, Sci-Fi, Sci-Fi TV, Spy, Spy TV).
- **Default tab on first load** is now Watchlist.

### Added — Search (header button)
- Modal with live search across every catalog
- Matches title, director, country, section name, and pitch text
- Ranking: title-prefix > title-substring > director > country > section > pitch
- Tapping a result jumps to that item's tab and highlights it briefly

### Added — Notes search (header button)
- Searches across all your saved notes
- Returns matching items with snippet preview
- Tapping result jumps to source tab + item

### Added — Stats dashboard (header button)
- Status counts (watched / watching / queued / skipped / rated)
- Rating distribution with percentages
- Activity (items updated last 7 / 30 days)
- Longest queue across tabs
- Top reaction tags
- Per-tab watched ratios (top 10)

### Added — Triage modes (two header buttons)
- **Triage Queue** — focused single-item review of your queued items with options: Keep / Start Watching / Drop / Pass
- **Triage Suggested** — focused review of system suggestions with options: Queue / Start Watching / Not For Me / Skip For Now
- Both walk through the relevant Watchlist section in priority/recency order

### Added — Sort within sections (per-tab in-memory)
- Sort dropdown in filter row (default / Recently updated / Year newest / Title A→Z / My rating)
- Per-tab memory (in-memory only, never persisted)
- Default sort within "Queued" section: most-recently-touched first

### Added — Last-updated timestamps
- Every state mutation (status, rating, tag, notes) writes a `lastUpdated` timestamp
- Existing entries without timestamps continue to work; sort to the bottom of "Recently updated"
- No retroactive backfill

### Added — Import diagnostics modal
- Replaces generic "Progress restored" alert
- Shows: total entries imported, tabs covered, matched/orphaned IDs, ratings/tags/notes counts
- Lists orphaned IDs by tab so you can spot ID-mismatch issues

### Architecture notes
- Mutators (`setStatus`, `setRating`, `toggleTag`, `setNotes`, `cycleStatus`) accept an optional `tab` argument
- Watchlist proxies carry `_watchlist_source_tab` metadata; UI handlers route mutations to the source tab
- `loadCatalogs` skips entries flagged `virtual: true` in the manifest
- New `getActiveCatalog()` helper transparently rebuilds the synthetic Watchlist on demand

---

## 4.1.1 — 2026-05-07
**Service worker cache:** `scifi-tracker-v10`

### Fixed
- Renamed PWA in `manifest.json` from "Cerebral Sci-Fi Tracker" / "Sci-Fi" to "WatchTrack" / "WatchTrack" — installed app now displays the correct name on home screen after reinstall
- Updated `README.md` to reflect the current 21-tab structure, category filter behavior, and content-type-aware reaction tags; preserved original deployment-guide voice and structure

### Added
- `CHANGELOG.md` (this file)

---

## 4.1.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v9` → `v10`

### Added — Phase 3: Full category retrofit
- Category filtering now works across all 21 tabs (was British Comedy only in 4.0)
- ~50 distinct category keys defined and given pretty labels
- Multi-category tagging on items: a Coens film shows under both Drama → "Coens" and Auteur → "Coens"
- Section-level category tagging with item-level overrides where needed
- 134 item-level overrides applied for cross-listing precision

### Categorization detail per tab
- **Sci-Fi** · mainstream · cerebral · apocalyptic · foundational
- **Spy** · cold-war · modern · historical · paranoia-thriller
- **Crime** · neo-noir · scorsese-lane · gritty
- **Cons & Courtroom** · con-artist · courtroom · twist · sorkin
- **Horror** · slow-burn · gothic · supernatural · psychological · classic
- **Fantasy** · epic · adventure · modern · mythological
- **Heist** · heist · con · twist
- **Comedy** · satire · dark · ensemble · classic
- **Drama** · epic · character-study · period
- **Foreign** · 11 country categories + thriller / foundational
- **Auteur** · 18 director categories
- **Classics** · foundational · courtroom · western · noir
- **Sci-Fi TV** · limited · ongoing · already-watched
- **Spy TV** · cold-war · modern · le-carré · historical · international
- **Crime TV** · hbo-prestige · british-cozy · nordic-noir · procedural · international
- **Cons & Courtroom TV** · long-con · courtroom · heist-series
- **Horror TV** · flanagan · slow-burn · anthology · gothic · supernatural
- **Fantasy TV** · epic · historical · gritty · mythological
- **Comedy TV** · ensemble · dark
- **British Comedy** · panel · sitcom · game · news-comedy · specials (existing from 3.1)
- **Drama TV** · sorkin · hbo · amc · network · streaming

### Audited
- Zero items uncategorized across all 22 catalog files
- Resolver verified on 13 representative items across content types

---

## 4.0.0 — 2026-05-07
**Service worker cache:** `scifi-tracker-v7` → `v8`

### Changed — Content-type-aware reaction tags (architectural)
- The flat 6-positive / 6-negative tag list is replaced with eight distinct tag sets, one per content type
- Tag bar now adapts to what's being rated: a sitcom shows sitcom-relevant tags, a panel show shows host/format tags, a doc-reality show shows visual/educational tags, etc.

### Added
- 8 content types: `film-narrative`, `tv-prestige`, `tv-limited`, `tv-sitcom`, `tv-panel`, `tv-game`, `tv-doc-reality`, `tv-anthology`
- Content-type resolution cascade: explicit per-item override → category mapping (British Comedy) → tab default
- Item-level overrides for special cases:
  - Top Gear, The Grand Tour → `tv-doc-reality`
  - Documentary Now! → `tv-anthology`
  - Black Mirror → `tv-anthology`
  - Studio 60 (in Comedy TV and Drama TV) → `tv-prestige`

### Tag sets defined
- **film-narrative** ✅ Rewatchable · Stayed with me · Visually stunning · Smart structure · Emotionally resonant · Want more like this  ❌ Too slow · Too bleak · Too cold · Style over substance · Premise didn't land · Dated badly
- **tv-prestige** ✅ Stuck the landing · Stayed with me · Performance-driven · Smart structure · Emotionally resonant · Want more like this · Rewatchable  ❌ Lost steam · Late-season decline · Too bleak · Stretched thin · Premise wore out · Dated badly
- **tv-limited** ✅ Stuck the landing · Stayed with me · Performance-driven · Tight structure · Emotionally resonant · Visually stunning · Want more like this  ❌ Padded · Too bleak · Premise didn't land · Style over substance · Dated badly
- **tv-sitcom** ✅ Rewatchable · Quotable · Ensemble warmth · Joke density · Smart structure · Stayed with me · Emotionally resonant · Want more like this · Stuck the landing  ❌ Cringe-driven · Sentimental · Dated badly · Premise wore thin · Lead overworked
- **tv-panel** ✅ Host chemistry · Quotable · Comfort watch · Strong recurring guests · Joke density · Format works · Want more like this  ❌ Host doesn't land · Too topical · Format wears thin · Guests don't gel · Mean-spirited
- **tv-game** ✅ Great host · Format design · Difficulty pitched right · Comfort watch · Contestant chemistry · Quotable moments · Want more like this  ❌ Host weak · Too easy · Too hard · Format dated · Lifeless
- **tv-doc-reality** ✅ Host chemistry · Visually stunning · Stayed with me · Educational · Comfort watch · Rewatchable · Want more like this  ❌ Talking-heads heavy · Padded · Sensationalized · Style over substance · Dated badly
- **tv-anthology** ✅ Variable but rewards · Quotable · Stayed with me · Smart structure · Emotionally resonant · Rewatchable · Want more like this  ❌ Inconsistent · Style over substance · Premise didn't land · Stretched thin · Aged badly

### Migration
- Zero data loss: all existing reactionTags in localStorage preserved exactly
- Tags not in the new active set for an item's content type stay in saved data but aren't shown as buttons (silent preservation)

---

## 3.1.0 — 2026-05-06
**Service worker cache:** `scifi-tracker-v5` → `v7`

### Added — British Comedy tab and category filter system
- New tab: **British Comedy** (21st tab) with 36 entries across panel shows, sitcoms, game shows, news comedy, and annual specials
- Category filter system (engine):
  - Second pill row above status filters, populated dynamically from each catalog's section categories
  - Filters items by `status × category` (AND-combined)
  - Per-tab memory: returning to a tab restores its last category filter
  - Auto-clear after 30 seconds away from a tab (cancels if you return)
  - Auto-clear all category filters after 5 minutes of app being backgrounded
  - In-memory only — never persisted to localStorage, never affects ratings/state
- Multi-category section tagging (a section can belong to multiple categories)

### Pre-seeded loved shows in British Comedy
- QI, 8 Out of 10 Cats Does Countdown, Would I Lie To You?, Taskmaster, Vicious, Pointless, Only Connect, University Challenge, Big Fat Quiz of the Year (all loved); plain 8 Out of 10 Cats marked Mixed

---

## 3.0.1 — 2026-05-06

### Fixed
- Two catalog files (`fantasy-tv.json`, `horror-tv.json`) had invalid JSON escape sequences (`\'` in string values, illegal in JSON). The v3.0.0 import had silently failed for users with these tabs because the broken catalogs prevented complete app load. Both files corrected.
- Diagnosed import-into-state migration that appeared as a silent no-op: the issue was the broken catalogs, not the import itself

---

## 3.0.0 — 2026-05-06
**Service worker cache:** `scifi-tracker-v5`

### Added — Stage 3: TV across all genres (architectural)
- Tab count expanded from 13 → 20
- New tabs:
  - **Sci-Fi TV** (merged old Limited + Ongoing into one combined tab)
  - **Spy TV** — Le Carré tradition, Slow Horses, The Bureau, Americans, etc.
  - **Crime TV** — HBO prestige, British cozy, Nordic noir, procedural
  - **Cons & Courtroom TV** — Better Call Saul, Damages, Goliath, Hustle, Sneaky Pete
  - **Horror TV** — Buffy, Hannibal, Flanagan canon, anthologies
  - **Fantasy TV** — Game of Thrones, Shōgun, House of the Dragon, etc.
  - **Comedy TV** — workplace ensembles, Sorkin half-hour, warm-comedy lane
  - **Drama TV** — Sorkin, HBO crime-drama pillar, AMC prestige
- New film tab: **Cons & Courtroom** — twist-driven plot architecture
- **Foreign** rebuilt: narrowed arthouse, expanded thriller-leaning international (Korean, French, Argentine, etc.)

### Renamed
- `films.json` → `scifi.json` (the original sci-fi tab is now explicitly Sci-Fi)
- Active tab default: `films` → `scifi`

### Migration
- Migration tool created to translate v2.x exports to v3.0 schema
- 85/85 entries verified preserved through the films→scifi + tv-limited+tv-ongoing→scifi-tv merge

---

## 2.0.0 — 2026-05-06
**Service worker cache:** `scifi-tracker-v4`

### Added — Stage 2: Multi-genre expansion
- Tab count expanded to 13: Films · Limited · Ongoing · Spy · Crime · Horror · Fantasy · Heist · Comedy · Drama · Foreign · Auteur · Classics
- Curated catalogs across all 13 genres with priority tagging, taste-calibrated `whyPriority` pitches, and critical reception notes
- Six new film genres added in this stage: Cons-adjacent crime, Horror, Fantasy, Heist, Comedy, Drama, Foreign, Auteur retrospectives, Pre-1960 Classics

---

## 1.1.0 — earlier 2026
**Service worker cache:** `scifi-tracker-v3`

### Added
- Multi-tab structure: Films · Limited · Ongoing
- Status × rating × reaction tag schema
- Export / import for state portability

---

## 1.0.0 — earlier 2026
**Service worker cache:** `scifi-tracker-v1`

### Added — Initial release
- First deployable PWA: single-tab sci-fi film tracker
- GitHub Pages deployment, Android home-screen install, offline support
- localStorage persistence
- Initial sci-fi catalog of curated films with status (queued / watching / watched / skipped) and rating (loved / liked / mixed / disliked)
