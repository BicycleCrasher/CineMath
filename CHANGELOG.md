# Changelog

All notable changes to WatchTrack are tracked here. Versions follow `major.moderate.minor`:

- **Major** — architectural shift or fundamentally new core capability
- **Moderate** — significant feature addition (new tabs, new systems)
- **Minor** — bug fix, content correction, or non-architectural refinement

The `service-worker.js` cache name (`scifi-tracker-vN`) tracks deployments rather than semantic versions, and is bumped any time cached assets change. The mapping is noted per release.

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
