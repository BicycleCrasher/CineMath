# CinéMath → Native (Kotlin Multiplatform) — Design Spec

**Date:** 2026-06-21
**Status:** Draft for review
**Author:** Brainstorming session (Claude Code)
**Supersedes/relates to:** existing PWA (CinéMath v8.0.0 / app v5.36.0 / Worker → v9.0.0)

---

## 1. Goal & motivation

Re-platform CinéMath from a PWA (+ TWA wrapper) to a **native Kotlin Multiplatform app**, still for personal use but more robust. The user explicitly wants all four of:

- **Native capabilities** — FCM push, background sync, secure credential storage (Android Keystore), biometric-grade secret handling, native share/deep-links.
- **Reliability / offline** — durable local storage that survives browser eviction; true offline.
- **Install / distribution** — a properly built, self-updating installable app (Play internal-testing optional).
- **Performance / feel** — native UI on both surfaces.

### Locked decisions (from brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Native rewrite on Kotlin Multiplatform (KMP)** | User intends future **iOS/desktop** expansion; KMP shares the engine/data layer beyond Android. |
| 2 | **Targets: phone + Android TV (v1)**; iOS/desktop future | Both interaction models (touch + D-pad) are first-class day one. |
| 3 | **Hybrid recommendation engine** | Server-side (Worker) when online for freshness; on-device Kotlin fallback for true offline. Single canonical algorithm, golden-tested. |
| 4 | **v1 = full feature parity** | Baseline core + Plex + Trakt + FCM push + AI chat/extras all in v1. |
| 5 | **Cloudflare Worker backend stays** | D1/R2/KV/Workers-AI, catalogs, and the recs *algorithm* are reused, not rewritten. |

### Scope reality

Full parity is a multi-month solo effort (re-implementing a ~10,000-line app, twice the UI). Mitigation: **build everything, ship in runnable internal milestones** (§9). The existing PWA keeps running in parallel until the final milestone, so there is never a feature gap.

---

## 2. Architecture overview

Fat shared core; thin per-surface UI. Everything non-visual lives in `:shared` (commonMain), written once, ready for an iOS target later.

```
cinemath-native/
├─ :shared            (KMP — commonMain: all non-UI logic)
│   ├─ domain         catalog/item/profile models; recommendation engine (pure Kotlin)
│   ├─ data           repositories; offline-first cache; sync/merge
│   ├─ network        Ktor client → existing Worker + TMDB
│   ├─ persistence    SQLDelight database (replaces IndexedDB)
│   └─ presentation   KMP ViewModels exposing StateFlow
├─ :app-phone         (Android app — Compose Material3, touch)
├─ :app-tv            (Android app — Compose + androidx.tv, D-pad/focus)
└─ (:app-ios          FUTURE — SwiftUI or Compose MP over the same :shared)
```

### Tech stack (all KMP-friendly, mainstream)

- **Persistence:** SQLDelight (typed SQL, multiplatform).
- **Networking:** Ktor client + kotlinx.serialization.
- **DI:** Koin. **Async:** coroutines + Flow. **State:** MVI-style ViewModels → `StateFlow`.
- **Secrets:** Android Keystore via encrypted DataStore.
- **Push:** Firebase Cloud Messaging (FCM).
- **Background:** WorkManager (sync flush + streaming-leaving checks).
- **Build:** Gradle KMP plugin + version catalogs.

### What stays untouched

The Cloudflare Worker, D1/R2/KV bindings, the `/data/*.json` catalogs, and the recommendation *algorithm*. The recs engine is **ported** to pure Kotlin in `:shared` (the on-device half of the hybrid); the Worker keeps serving server-side recs when online.

> **Future option (not v1):** KMP can compile the same Kotlin recs engine to **Kotlin/JS** and drop it into the Worker, eliminating the "logic in two places" duplication. Documented as a later optimization.

---

## 3. Data flow (offline-first)

```
Compose UI → ViewModel (StateFlow) → Repository (:shared)
                                         ├─ read:  SQLDelight cache first  → render instantly
                                         ├─ fetch: Ktor → Worker/TMDB      → refresh cache
                                         └─ write: optimistic local update + enqueue → WorkManager → /sync
```

Every screen reads from the local DB → fully usable offline. Network refreshes the cache in the background; the sync queue reconciles on reconnect using the Worker's **per-item `lastUpdated` last-writer-wins merge** (no blob clobber).

---

## 4. Domain & data layer

### 4.1 Domain models (`:shared/domain`)

Ported faithfully from the existing JSON so catalogs load unchanged:

- `Catalog` → `Section` → `Item(title, year, dir, country, runtime, priority, tags[], whyPriority, pitch, critics[], aliases[], tmdbId, contentType)`.
- `CatalogManifest` — tab list + Auteur director list.
- `ItemState(key = "tab:itemId", status, rating, reactionTags[], notes, lastUpdated)`.
- **Sealed enums** for status / rating / reaction-tag values (replaces magic strings — audit tech-debt item).
- `Profile` wrapper so multi-profile is a clean future add, not a migration scramble.

### 4.2 SQLDelight schema (replaces IndexedDB)

```
item_state(key PK, status, rating, tags_json, notes, last_updated)   -- user tracking
catalog_cache(tab PK, json, etag, fetched_at)                        -- the 24 catalogs
tmdb_cache(tmdb_id PK, json, fetched_at)                             -- enrichment, TTL-evicted
plex_library(rating_key PK, norm_title, year, ...)                   -- matched library
sync_queue(id PK, key, payload, attempts, created_at)               -- outbound, offline-durable
```

TTL eviction on `tmdb_cache` fixes the unbounded-cache finding from the audit.

### 4.3 Recommendation engine (`:shared/domain/recs`)

Pure-Kotlin port of `computeRecsForTab`:

1. Score source items: loved = 2, liked = 1, within the active tab(s).
2. Fold in TMDB similar/recommended (from `tmdb_cache`).
3. Mood-archetype overlap — 6 moods → reaction-tag clusters; count overlap.
4. Time-budget runtime filter (quick / standard / long).
5. Dedupe across active tabs → `{ recommended, discover }`.

**Single canonical implementation** with a **golden-test suite** pinning Kotlin output against the current JS output, so the on-device half and the Worker's server-side half cannot silently diverge. This is the safeguard for the Hybrid decision.

### 4.4 First-run migration (no risky local migration)

Existing devices already push state to the Worker (`SYNC_KV:user:HASH`). On first native launch the app **pairs, then pulls full state from the Worker**, seeding SQLDelight. The PWA keeps running and syncing to the same Worker, so both stay consistent during transition. No IndexedDB→native data migration is performed.

---

## 5. Integrations (v1 must-haves)

- **Auth & pairing:** reuse v8/v9 bootstrap + QR pairing. Native app registers a device, stores the bearer token in **Keystore**. Plex/Trakt creds remain in the Worker credential vault — the client never holds raw secrets.
- **Plex:** `GET /plex/library` → cache in `plex_library`; title-match via a **single shared `normalizeTitle`** in `:shared` (consolidates 3 duplicated regexes). "Play on Plex" → native `Intent` deep-link (`plex://…`) with WebView fallback. Webhook-driven watched status flows via the Worker → sync.
- **Trakt:** native OAuth **device flow** (show code, poll). Push on watch/rate; pull history + ratings on launch (8+ → loved, 5–7 → liked). All via existing Worker routes.
- **FCM push:** native replacement for Web Push. Client registers an FCM token → new Worker route stores it; the existing daily `/cron/check-alerts` sends FCM messages for "leaving streaming soon." Notification tap deep-links to the item via native nav.
- **AI chat + extras:** chat hits `POST /chat` unchanged (with the candidate-length cap from the audit). Hall of Fame / palate, stats dashboard, and triage-history AI tag-prediction port as feature screens reading cached data.

---

## 6. UI: phone vs. TV

Both are Compose over the same `:shared` ViewModels; they diverge only in navigation, focus, and layout density. A small shared Compose design module maps the dark theme (`--ink` / `--accent` → Material3 color scheme, Great Vibes wordmark).

### 6.1 Phone (`:app-phone`, Material3, touch)

- Bottom nav / drawer for 24 tabs + Watchlist; `LazyColumn` of item cards.
- Wizard as vertical step flow: time → mood → genre → results (Recommended / Discover lists).
- **Triage swipe deck:** Compose `pointerInput` drag gestures (love/like/skip/finished).
- **Decisive surfacing** from day one (audit item B): top 3–5 recs, rest behind "more."

### 6.2 TV (`:app-tv`, androidx.tv `tv-material`, D-pad)

- Focus-first nav — `TvLazyRow`/`TvLazyColumn`, explicit `focusRequester` chains, visible focus rings (port CSS D-pad ring styling to Compose focus states).
- Wizard + **side-by-side film + TV recs panel** in 16:9 landscape.
- **Fixes the audit's critical TV bug by construction:** wizard empty-state always has a focusable "Browse all unrated" action — D-pad can never get stranded.
- Triage maps swipes → D-pad directions + colored remote buttons.

### 6.3 Accessibility (close the audit gaps this pass)

Semantic roles, deliberate focus order, content descriptions on icon-only controls, WCAG-AA contrast verification.

---

## 7. Error handling & resilience

- **Network:** calls return a `Result`-style sealed type; repositories degrade to cache, never crash. Ktor timeouts + exponential-backoff retry. Offline = read-only-from-cache; writes queue.
- **Sync conflicts:** per-item `lastUpdated` last-writer-wins. `sync_queue` survives process death; WorkManager flush with bounded retries → dead-letter after N.
- **Bad data:** catalog JSON validated on load (kotlinx.serialization strict + schema guard); a malformed item is skipped + logged, not a silent crash.
- **Auth:** rejected token → re-pair flow, no lockout. Plex/Trakt failures isolated so one broken integration never takes down the app.

---

## 8. Testing

- **Recs golden tests:** fixture suite pinning Kotlin engine output to current JS results (hybrid divergence guard).
- **Unit (commonTest):** scoring, `normalizeTitle`, state-merge, mood/time filters, TTL eviction.
- **DB:** SQLDelight in-memory tests for DAOs + migrations.
- **Integration:** Ktor `MockEngine` for Worker/TMDB/Trakt flows.
- **UI:** Compose UI tests for both surfaces, including an explicit **TV D-pad focus-traversal test** (incl. the empty-state focus trap).

---

## 9. Delivery milestones (build everything, ship in runnable slices)

| Milestone | Deliverable | Usable? |
|-----------|-------------|---------|
| **M1 — Skeleton** | KMP scaffold, SQLDelight, Ktor, pairing → pull real state from Worker. Catalog browse + status/rating/tags (phone). | Yes |
| **M2 — Recs core** | Kotlin recs engine + golden tests, wizard, triage deck (phone). | Yes |
| **M3 — TV surface** | `:app-tv` focus nav, side-by-side recs, TV triage. | Yes (TV) |
| **M4 — Integrations** | Plex, Trakt, AI chat + extras. | Yes |
| **M5 — Native muscle** | FCM alerts, Keystore secrets, WorkManager background sync, offline hardening. | Yes |
| **M6 — Polish & ship** | a11y pass, perf, signed APKs, GitHub Releases (+ optional Play internal testing). | Ship |

The PWA keeps running until M6 lands — no gap.

---

## 10. Folded-in improvements (from the codebase audit)

Opportunistically resolved by the rewrite rather than as separate work:

- Magic strings → sealed enums.
- 3 duplicated `normalizeTitle` regexes → one shared util.
- Unbounded TMDB cache → TTL eviction.
- Silent catalog-parse crashes → validated load.
- `/chat` token-budget overflow → candidate-length cap.
- TV wizard empty-state focus trap → focusable fallback by construction.
- Accessibility gaps → semantic roles + contrast pass.
- Decisive surfacing (audit item B) → top 3–5 recs by default.

Deferred (not v1, tracked separately): confidence signals (A), calendar-aware defaults (E), onboarding flow (H), multi-profile/companion (C — `Profile` wrapper leaves the door open), anti-recommendations (D), must-watch lists (G), critic concordance (F).

---

## 11. Open questions for implementation-planning

1. **Catalog delivery:** bundle `/data/*.json` as app assets with an update-check against GitHub Pages, or have the Worker serve catalogs? (Affects offline-first vs. freshness.)
2. **One app or two:** ship `:app-phone` and `:app-tv` as separate APKs, or a single APK with a TV leanback `<activity>` + phone activity? (Both consume the same `:shared`.)
3. **Play Store:** internal-testing track wanted, or GitHub Releases sideload only (current model)?
4. **FCM project:** new Firebase project + Worker FCM server key — acceptable dependency?
5. **Biometric app lock:** in scope for v1 native-capabilities, or later?
```
