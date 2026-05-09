# Changelog

All notable changes to WatchTrack are tracked here. Versions follow `major.moderate.minor`:

- **Major** — architectural shift or fundamentally new core capability
- **Moderate** — significant feature addition (new tabs, new systems)
- **Minor** — bug fix, content correction, or non-architectural refinement

The `service-worker.js` cache name (`scifi-tracker-vN`) tracks deployments rather than semantic versions, and is bumped any time cached assets change. The mapping is noted per release.

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
