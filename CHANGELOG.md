# Changelog

All notable changes to WatchTrack are tracked here. Versions follow `major.moderate.minor`:

- **Major** — architectural shift or fundamentally new core capability
- **Moderate** — significant feature addition (new tabs, new systems)
- **Minor** — bug fix, content correction, or non-architectural refinement

The `service-worker.js` cache name (`scifi-tracker-vN`) tracks deployments rather than semantic versions, and is bumped any time cached assets change. The mapping is noted per release.

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
