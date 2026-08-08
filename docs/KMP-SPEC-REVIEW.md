# Review: CinéMath → Native (KMP) Design Spec

**Date:** 2026-08-08
**Subject:** `docs/superpowers/specs/2026-06-21-cinemath-native-kmp-design.md` (main @ 542bd83)
**Status:** Internal review for decision — approve/reject the numbered recommendations in §6 individually.

All file:line citations below were verified by reading the code on this branch (identical to main @ 542bd83 for all cited files). Where the review references tonight's other overnight branches (`overnight/w1-tests`, `overnight/w2-srr-d1`), those are unmerged work-in-progress and are cited by commit subject, not line number.

---

## Executive summary

The spec is a competent architecture sketch with a sound platform stack, but it makes three consequential errors that should be corrected before any implementation planning:

1. **It misstates where sync conflict resolution lives.** The spec twice credits the Worker with a "per-item `lastUpdated` last-writer-wins merge (no blob clobber)" (§3, §7). The Worker does no such thing — `/sync/put` stores an opaque whole blob in KV (`worker/worker.js:1564–1589`); the per-item merge is **client-side JavaScript** (`syncApplyRemote`, `app.js:6998`). A KMP client that trusts the spec's data-flow diagram would reintroduce the exact blob-clobber bug the merge was written to fix. The SRR-to-D1 work (branch `overnight/w2-srr-d1`) moves per-item state server-side and is the actual fix — on any platform (§3 below).

2. **Its auth model doesn't exist yet on the Worker.** The spec's §5 says the native client "stores the bearer token in Keystore … the client never holds raw secrets." Today, bearer auth (`resolveAuth`, `worker/worker.js:353`) covers only sync, user/device, pairing, and admin routes — roughly 13 of 66 route handlers. The other ~46 authenticated routes (all of Trakt, Plex, alerts, chat, palate, metadata, viewed, promotions) still require the **legacy shared secret**, passed in the URL query string or JSON body (49 `checkSecret` call sites; see §4). A spec-conformant KMP client cannot call most of the API. Migrating those routes to bearer auth is real Worker work absent from the milestone plan.

3. **"v1 = full feature parity" is the single largest risk in the document, and the spec's own "Scope reality" section concedes it without changing the decision.** The true surface is ~15 subsystems across 10,103 lines of `app.js` (310 top-level function declarations), 2,969 lines of HTML/CSS UI, and a 66-handler Worker API — times two Compose surfaces (phone + TV). §1 proposes a smaller, defensible v1.

Separately: the spec repeatedly cites a "codebase audit" (items A–H, "critical TV bug", "unbounded-cache finding"). No audit document exists in the repo — the only occurrences of "audit" under `docs/` are inside the spec itself. Those claims are currently unverifiable and at least one is stale (§5).

---

## 1. Parity-in-v1 risk

### 1.1 The actual feature surface

Counted on this branch (identical to main @ 542bd83):

- `app.js`: **10,103 lines**, **310** top-level `function`/`async function` declarations (317 counting nested ones).
- `worker/worker.js`: **3,357 lines**, **66 route handler blocks** covering **68 distinct method+path patterns** (two handlers each serve two paths: `/` + `/health` at `worker/worker.js:912`, `/pair/begin` + `/pair/begin/owned` at `worker/worker.js:2113`), plus a `scheduled` cron entry point (`worker/worker.js:3077`).
- UI: `index.html` 728 lines (224 `id=` anchors), `styles.css` 2,241 lines.
- Content: 24 catalogs + manifest under `data/` (25 JSON files).

Subsystem inventory, each verified by function anchor:

| Subsystem | Representative anchors |
|---|---|
| Catalog browse, tabs, sorting, per-item state | `switchTab` `app.js:4283`, `sortItems` `app.js:2425`, `getRating`/`getStatus`/`getTags` `app.js:2923+` |
| Reaction-tag system, content-type resolution | `getTagSetForItem` `app.js:202`, Hall of Fame auto-promote `app.js:3247–3254` |
| Wizard (time → mood → genre → results) | `wizardShow` `app.js:8793`, `wizardRender` `app.js:8869`, `wizardHandleAction` `app.js:9105`, `MOOD_ARCHETYPES` `app.js:6638` |
| Recommendation engine | `computeRecsForTab` `app.js:7640`, `moodScore` `app.js:6653` |
| Triage (swipe deck, quick triage, rate+tag, history) | `startTriage` `app.js:9380`, `renderTriage` `app.js:9394`, `renderRateTagTriage` `app.js:9465`, `triageAction` `app.js:9624`, `openQuickTriage` `app.js:8042`, `openTriageHistory` `app.js:8220` |
| TV mode / D-pad | `isTVMode` `app.js:473`, focusable cards `app.js:4070`, voice-search routing `app.js:4171`, Bravia rIC workaround `app.js:4462`, TWA back-button handling `app.js:9889–9920` |
| Sync (push, per-item merge, QR pull-fill) | `syncPush` `app.js:6942`, `syncApplyRemote` `app.js:6998`, `pullFillFromKV` `app.js:7065` |
| Multi-user auth, pairing, QR | `authFetch` `app.js:656`, `pairBlankDeviceStart` `app.js:961`, `pairConfirmStart` `app.js:1023`, `generatePairUrl` `app.js:7379`, `renderPairQr` `app.js:7402` |
| Plex (library match, bulk sync, scrobble) | `plexNormalizeKey` `app.js:516`, `fetchPlexLibrary` `app.js:539`, `applyBulkSyncRules` `app.js:1665` |
| Trakt (device OAuth, push/pull, token refresh) | `traktApiCall` `app.js:3006`, `traktRefreshTokens` `app.js:3036`, `traktPullSync` `app.js:3146`, rating mapping `app.js:3218` |
| Streaming-leaving alerts (client half) | `alertsBuildItemsManifest` `app.js:6760`, `alertsSubscribe` `app.js:6833`, `alertsCheckNotifications` `app.js:6891` |
| Chat concierge | `sendChatMessage` `app.js:8657` (Worker: `/chat` `worker/worker.js:1783`) |
| Stats dashboard (donuts, bars, histograms, line charts) | `updateStats` `app.js:3338`, `renderStats` `app.js:6317`, `statsDonut`/`statsStackedBars`/`statsHistogram`/`statsLineChart` `app.js:6237–6293` |
| Palate / AI tag prediction | `palateUpsert` `app.js:1438` (Worker: `/palate/predict-tags` `worker/worker.js:1357`) |
| Onboarding, promotions, watchlist, backups | `onboardingConnectTrakt` `app.js:870`, `exportPromotionsAsJsonPatch` `app.js:5637`, `buildWatchlistCatalog` `app.js:3714`, pre-migration IDB backup `app.js:2703, 2805–2823` |

The spec's §1 table lists five decisions; decision 4 ("v1 = full feature parity") commits to reimplementing **all of the above**, plus every Worker-facing client behavior, in Kotlin, twice over at the UI layer (Compose phone + Compose TV). The spec's own "Scope reality" line — "a multi-month solo effort" — is the honest assessment, but the mitigation offered (runnable internal milestones, PWA runs in parallel) manages *sequencing*, not *scope*. The finish line is unchanged: nothing retires until M6, so the parity bet is all-or-nothing on Lincoln's sustained solo attention across six milestones.

### 1.2 Cost realism

Points the spec underweights:

- **The UI is the majority of the port.** Roughly half of `app.js` is DOM rendering and event wiring (13 top-level `render*` functions plus per-feature modal/wiring code), backed by 2,241 lines of CSS. None of it transfers; Compose reimplementation is from scratch, and the TV surface adds a second focus/navigation model the PWA gets "for free" today from one DOM.
- **Two client codebases during the entire transition.** Until M6, every behavior change (catalog schema tweak, new tag, sync fix) lands twice: once in the PWA that is still the daily driver, once in the KMP app. The spec never budgets this double-maintenance tax.
- **Hidden Worker work.** The bearer-auth migration for ~46 routes (§4), an FCM registration route + FCM sending in `runAlertsCheck` (`worker/worker.js:3091`), and (if decided) Worker-served catalogs are all server-side deliverables buried inside client milestones M4–M5.
- **Quirk-compatibility decisions.** A "faithful port" must decide, item by item, whether to preserve behaviors like the `computeRecsForTab` recommended-bucket dead path (§2.3) or fix them — each such decision invalidates golden fixtures or perpetuates a bug.

A realistic solo estimate for full parity across M1–M6 is on the order of several months of consistent effort, with the risk profile of a rewrite: the value ships only if the last milestone lands.

### 1.3 Phased alternative (recommendation 1)

Redefine v1 so the native app can *replace the PWA on one surface* long before parity:

- **v1 (native phone, PWA retires nothing yet):** pairing + bearer auth, catalog browse, per-item status/rating/tags/notes, SRR sync against the D1 `/state/*` endpoints from `overnight/w2-srr-d1`, Plex library match + "Play on Plex", wizard + triage with the ported recs engine. This is spec-M1+M2 plus Plex-read — the daily-use core.
- **v2:** Trakt, alerts via FCM (with the Worker route work costed explicitly), TV surface.
- **v3:** chat concierge, palate/AI tag prediction, stats dashboard, promotions, admin screens — or deliberately never: these are low-frequency screens the PWA (or a plain web view) can keep serving indefinitely.

This converts a single all-or-nothing bet into three independently shippable, independently cancellable bets.

---

## 2. Golden-test dependency

The spec's hybrid-recs decision (§1 table row 3) and §8 both rest on "a single canonical algorithm, golden-tested." Golden tests require language-portable fixtures pinned against current JS behavior. Tonight's `overnight/w1-tests` branch builds exactly that class of artifact; here is the coverage map.

### 2.1 What exists after tonight (branch `overnight/w1-tests`, verified read-only in its worktree)

| Extracted lib | Fixture file | Covers (app anchor) |
|---|---|---|
| `lib/normalize.js` | `tests/fixtures/normalize-cases.json` | `plexNormalizeKey` / `plexNormalizeKeyTitleOnly` (`app.js:516, 530`) |
| — (worker helpers) | `tests/fixtures/worker-normalize-cases.json` | Worker `normalizeTitle` (`worker/worker.js:92`), gzip/b64u helpers |
| `lib/sort.js` | `tests/fixtures/sort-cases.json` | `sortItems` comparators (`app.js:2425`) |
| `lib/bulk-sync.js` | `tests/fixtures/bulk-sync-cases.json` | `applyBulkSyncRules` (`app.js:1665`) |
| `lib/recs.js` | `tests/fixtures/recs-cases.json` | `computeRecsForTab` (`app.js:7640`) + `moodScoreFromTags` |
| `lib/runtime.js` | `tests/fixtures/runtime-cases.json` | time-budget runtime parsing |
| `lib/content-type.js` | `tests/fixtures/content-type-cases.json` | content-type resolution feeding `getTagSetForItem` (`app.js:202`) |
| `lib/plex-match.js` | `tests/fixtures/plex-match-cases.json` | scrobble-event → catalog matching |

The fixture files are plain JSON and explicitly written to be language-portable (the W1 test headers say so) — a Kotlin `commonTest` suite can consume them directly. This is the strongest enabler the KMP plan has gained since the spec was written.

### 2.2 What the spec needs that will still be missing

From spec §8's own test list plus its data-flow claims:

1. **State merge** — `syncApplyRemote`'s per-item `lastUpdated` merge and `pullFillFromKV`'s fill-empty semantics (`app.js:6998, 7065`). No fixture exists. This is the single most dangerous gap: it is the algorithm that protects user data during the dual-client transition period, and it is exactly the code the spec wrongly believes lives in the Worker. (If the W2 SRR cutover completes first, the merge moves server-side and the KMP client needs a *different*, simpler contract test instead — see §3.)
2. **Mood archetype configuration** — `MOOD_ARCHETYPES` (`app.js:6638`) itself is not fixture-pinned; W1's recs fixtures exercise the overlap-scoring function with a sample tag cluster, not the six full mood → tag-cluster mappings.
3. **Wizard step flow** — step transitions, breadcrumbs, continue-item gathering (`wizardGatherContinueItems` `app.js:9226`). Untested; would need either fixtures or acceptance that the Compose wizard is a re-design, not a port.
4. **Triage state machine** — `startTriage`/`triageAction` outcomes (`app.js:9380, 9624`). Untested.
5. **Alerts manifest** — `alertsBuildItemsManifest` (`app.js:6760`) defines the `/alerts/subscribe` payload the Worker cron consumes. Untested, and the shape exists nowhere but this function (§4).
6. **Trakt pull mapping** — the 8+→loved / 5–7→liked rule is one line (`app.js:3218`) inside the untested 200-line `traktPullSync`.
7. **TTL eviction** — spec §8 lists it, but the client-side enrichment cache (`CATALOG_ENRICHMENT_KEY`, `app.js:2189–2210`, plain localStorage, no TTL) has no eviction to test; this is new behavior to design, not port. (Note the *Worker-side* TMDB cache already has a 30-day TTL — `METADATA_TTL`, `worker/worker.js:50, 846, 899` — see §5.)

### 2.3 A caution the golden tests surfaced

W1's recs suite pins a real quirk: under the app's own contract, `computeRecsForTab`'s "Recommended" classification path can never emit anything. `getRating` returns the string `'none'` when unrated (`app.js:2923`), which is truthy, so the guard `if (status !== 'none' || rating) continue;` (`app.js:7719`) skips every candidate with a catalog match in the selected tabs — and candidates with matches only in other tabs are dropped by the `matches.length === 0` branch. Only `discover` is ever populated from this block.

Implication for the spec: "port faithfully + golden-test" **pins bugs as spec**. Before the Kotlin port begins, each pinned quirk needs an explicit keep/fix decision, and fixed behaviors need the JS side patched first so both implementations track the *intended* algorithm. The spec should name this step; it currently assumes the JS output is the desired canon.

---

## 3. What the rewrite does and doesn't fix

Sorting the spec's motivating problems into platform problems (need a native app) vs data/architecture problems (fixed on the server or in shared logic, benefiting every client including the current PWA):

### Genuinely platform problems — the rewrite is the fix

- **FCM push** (Web Push on Android/TWA is second-class; the current alerts client is poll-on-visibility, `alertsCheckNotifications` `app.js:6891`).
- **Background sync / WorkManager** — the PWA can only sync while a tab is alive.
- **Storage eviction** — IndexedDB/localStorage are evictable browser storage; the pre-migration backup dance at `app.js:2703, 2805–2823` exists because of this.
- **Keystore-grade secret storage** — today the shared API secret and Trakt client secret/tokens sit in localStorage (`app.js:1393–1401, 1483–1492`).
- **TV input feel** — D-pad focus is hand-rolled over DOM (`app.js:4070, 4462, 9889–9920`); Compose TV focus primitives are structurally better.

### Data/architecture problems — fixed regardless of platform, and partly being fixed tonight

- **Blob-sync conflicts.** The spec's §3 diagram claims the Worker performs per-item LWW merge. It does not: `/sync/put` validates only that the body parses as JSON and stores the whole blob (`worker/worker.js:1583–1586`); `/sync/get` returns it verbatim (`worker/worker.js:1537`). The per-item merge is client code (`syncApplyRemote`, `app.js:6998`, whose own comment documents the TV-clobbers-phone incident it fixed). Two consequences: (a) the safety property depends on every client reimplementing the merge correctly — precisely the duplication the spec elsewhere argues against; (b) the real fix is server-side per-item state, which is what `overnight/w2-srr-d1` builds (D1 `item_state` migration, `/state/*` endpoints, client dual-write — commits 1662c26, b5ed960, a88cb12). **If W2 lands, the KMP spec's §3 and §4.4 should be rewritten around `/state/*`, and the client-side merge becomes legacy.**
- **Algorithm duplication.** "Logic in two places" is a code-organization problem; W1's extraction of `lib/recs.js` + portable fixtures narrows it tonight, in JS, without any rewrite. The spec's own future option (compile Kotlin recs to JS for the Worker) concedes this is orthogonal to going native.
- **normalizeTitle triplication.** Verified: `plexNormalizeKey` + `plexNormalizeKeyTitleOnly` (`app.js:516, 530`) + Worker `normalizeTitle` (`worker/worker.js:92`) — three copies of the same regex chain. W1 extracted and fixture-pinned all three; unifying them is refactoring work, not platform work.
- **Unbounded client enrichment cache, silent catalog-parse failures, magic strings.** All fixable in the PWA in days; listing them as rewrite payoffs (spec §10) inflates the rewrite's apparent value. The honest framing: the rewrite is an *occasion* to do them, not the *means*.

### Not fixed by the rewrite at all

- **The shared-secret API surface** (§4). Moving to Kotlin changes nothing about 46 routes authenticating via a query-string/body secret; the Keystore only gives that secret a nicer home. The security payoff the spec promises requires Worker-side auth migration that no milestone owns.
- **Catalog pipeline** — `data/*.json` authoring, lint, promotions flow are untouched (correctly noted by the spec).

---

## 4. Worker contract a KMP client would consume

Enumerated from the single dispatch chain in `export default fetch` (`worker/worker.js:904–3357`): 66 handler blocks, 68 method+path patterns. Auth legend: **Q** = shared secret in URL query (`?secret=`), **B** = shared secret in JSON body, **T** = bearer token + `X-Device-Id` headers (`requireBearer`, `worker/worker.js:383`), **A** = bearer + admin role (`requireAdmin`, `worker/worker.js:390`), **–** = none/other.

| Method | Path | Auth | Line | Notes on shape |
|---|---|---|---|---|
| GET | `/`, `/health` | – | 912 | plain text |
| POST | `/webhook/{secret}` | path | 953 | Plex webhook multipart; server-to-server |
| GET | `/events` | Q | 1047 | scrobble event queue |
| POST | `/events/ack` | B | 1070 | |
| GET | `/metadata/lookup` | Q | 1083 | response = `tmdbLookup` result; **shape implicit** (`worker/worker.js:814–899`) |
| POST | `/metadata/bulk` | B | 1097 | batches `tmdbLookup`; **shape implicit** |
| POST | `/viewed/ingest` | B | 1121 | Plex-history-shaped entries; hardcoded `LIBRARY_WHITELIST` |
| GET | `/viewed/list` | Q | 1158 | |
| POST | `/promotions/add` | B | 1202 | |
| GET | `/promotions` | Q | 1223 | |
| DELETE | `/promotions/{id}` | Q | 1241 | |
| POST | `/palate/upsert` | B | 1259 | payload defined only by `palateUpsert` (`app.js:1438`) |
| GET | `/palate/archived` | Q | 1310 | |
| GET | `/palate/list` | Q | 1326 | |
| POST | `/palate/predict-tags` | B | 1357 | Workers-AI call; response shape implicit |
| POST | `/plex/configure` | B | 1418 | writes creds to vault |
| GET | `/plex/identity` | Q | 1432 | |
| GET | `/plex/library` | Q | 1451 | consumed by `fetchPlexLibrary` (`app.js:539`) |
| POST | `/plex/scrobble` | B | 1490 | |
| GET | `/plex/history` | Q | 1506 | feeds `applyBulkSyncRules` (`app.js:1665`); **entry shape implicit** |
| GET | `/sync/get` | T or Q | 1537 | returns raw blob; **blob schema exists only in `syncPush` (`app.js:6942`)** |
| PUT | `/sync/put` | T or Q | 1564 | whole-blob store; validation = "parses as JSON" only |
| POST | `/alerts/subscribe` | B | 1614 | `items` manifest shape defined only by `alertsBuildItemsManifest` (`app.js:6760`) |
| GET | `/alerts/vapid-public` | – | 1643 | |
| POST | `/alerts/unsubscribe` | B | 1650 | |
| GET | `/alerts/status` | Q | 1663 | |
| GET | `/alerts/notifications` | Q | 1675 | |
| POST | `/alerts/notifications/seen` | B | 1700 | |
| GET | `/alerts/test-fire` | Q | 1723 | |
| GET | `/cron/backup-state` | Q | 1748 | ops-only |
| GET | `/cron/migrate-viewed-to-d1` | Q | 1760 | ops-only |
| POST | `/chat` | B | 1783 | best-documented route (comment block `worker/worker.js:1774–1782`); `candidates` shape still client-defined |
| GET | `/cron/check-alerts` | Q | 1902 | ops-only |
| POST | `/migrate` | Q | 1922 | one-time v8 migration |
| GET | `/user/me` | T | 1969 | |
| POST | `/admin/invites/create` | A | 2030 | |
| GET | `/admin/invites/list` | A | 2069 | |
| DELETE | `/admin/invites/{code}` | A | 2094 | |
| POST | `/pair/begin`, `/pair/begin/owned` | T (owned) / – | 2113 | |
| GET | `/pair/info` | – (session id) | 2150 | |
| POST | `/pair/confirm` | T | 2169 | |
| GET | `/pair/wait` | – (session id) | 2235 | SSE/poll |
| POST | `/admin/reconnect/create` | A | 2282 | |
| POST | `/reconnect` | – (code) | 2325 | |
| POST | `/devices/{id}/rename` | T | 2391 | |
| DELETE | `/devices/{id}` | T | 2409 | |
| POST | `/admin/users/{id}/revoke` | A | 2424 | |
| GET | `/admin/users/list` | A | 2454 | |
| POST | `/admin/users/{id}/rename` | A | 2494 | |
| POST | `/register` | – (invite code) | 2508 | |
| PUT | `/user/settings` | T | 2571 | |
| GET | `/bootstrap/status` | Q | 2621 | |
| POST | `/bootstrap/credentials` | B | 2655 | |
| POST | `/api/trakt/device-code-init` | Q | 2743 | |
| POST | `/api/trakt/device-code-poll` | B or Q | 2763 | |
| POST | `/api/trakt/scrobble` | Q (+`?user=`) | 2837 | |
| POST | `/api/trakt/unwatch` | Q | 2861 | |
| POST | `/api/trakt/rate` | Q | 2881 | |
| POST | `/api/trakt/unrate` | Q | 2901 | |
| POST | `/api/trakt/watchlist-add` | Q | 2921 | |
| GET | `/api/trakt/history` | Q | 2941 | pass-through of Trakt API shapes |
| GET | `/api/trakt/ratings` | Q | 2958 | pass-through of Trakt API shapes |
| GET | `/api/trakt/me` | Q | 2974 | |
| POST | `/api/trakt/disconnect` | Q | 2989 | |
| POST | `/api/watch/mark` | Q | 3016 | |
| GET | `/api/watch/history` | Q | 3048 | |

Plus `scheduled` cron (`worker/worker.js:3077`) running `runAlertsCheck` (`:3091`) and `runStateBackup` (`:3212`, gzip → R2 `state/{date}/{hash}.json.gz`) — not client-facing but part of the system a native client depends on for alerts and disaster recovery.

### Contract problems for a KMP client

1. **Auth is three-way inconsistent** — ~30 routes take the secret in the query string, ~14 in the body, 13 use bearer/admin, and `/sync/*` accept either. Query-string secrets appear in Cloudflare logs and any intermediary. The spec's Keystore story requires either (a) migrating ~46 routes to `requireBearer` — unplanned Worker work — or (b) shipping the shared secret to the native client, contradicting spec §5.
2. **No schema source of truth.** The most important shapes — the sync blob, the alerts item manifest, `/chat` candidates, Plex history entries, `tmdbLookup` results — are defined only by `app.js` call sites (lines cited in the table). Ktor + kotlinx.serialization is *strict by default*; every one of these must be reverse-engineered into Kotlin data classes with no authority to check against. One drifting optional field = runtime deserialization failure.
3. **Inconsistent error contract.** Failures are variously plain-text `'Forbidden'`/`'Bad user hash'` (e.g. `worker/worker.js:1545–1548`) and JSON `{error}` via `jsonResponse` (e.g. `:1972`). A typed client needs one convention.
4. **Recommendation:** before any Kotlin is written, produce `docs/WORKER-API.md` (or an OpenAPI file) from this table, add JSON-schema validation of the key request bodies in the Worker itself, and make W1-style fixtures for the sync blob and alerts manifest. This document's table is a starting skeleton.

---

## 5. Factual corrections to the spec

1. **§3 / §7 — "the Worker's per-item `lastUpdated` last-writer-wins merge (no blob clobber)":** false today. Worker `/sync/put` is a whole-blob store (`worker/worker.js:1564–1589`); the per-item merge is client-side (`syncApplyRemote`, `app.js:6998`). True only if/when `overnight/w2-srr-d1` lands.
2. **§5 — "the client never holds raw secrets":** false for the API secret itself, which the current client keeps in localStorage (`app.js:1393, 1401`) and must keep sending because ~46 routes accept nothing else (§4). Plex/Trakt vault claim is accurate (`/bootstrap/credentials`, `worker/worker.js:2655`; server-side Trakt proxy routes `worker/worker.js:2743–3013`).
3. **§4.2 — "TTL eviction on `tmdb_cache` fixes the unbounded-cache finding":** the Worker's TMDB cache already has a 30-day TTL (`METADATA_TTL`, `worker/worker.js:50`, applied at `:846, :899`). The genuinely unbounded cache is the client's localStorage enrichment index (`app.js:2189–2210`). The spec's fix is aimed at the wrong cache tier.
4. **Audit references (§1, §4.2, §6.2, §10):** no audit document exists in the repo; the only `docs/` matches for "audit" are the spec itself. Items A–H, the "critical TV bug", and severity claims are unverifiable as written. Either commit the audit or strip the references.
5. **Accurate claims worth confirming for the record:** three duplicated title-normalization regex chains — verified (`app.js:516, 530`; `worker/worker.js:92`). Trakt mapping 8+→loved / 5–7→liked — verified (`app.js:3218`). 24 catalogs — verified (25 files in `data/` incl. manifest). First-run migration via pull-from-Worker rather than local IndexedDB migration — sound, and consistent with `pullFillFromKV` semantics (`app.js:7065`).

---

## 6. Recommendations (approve/reject individually)

1. **Reject "v1 = full parity"; adopt the phased v1 in §1.3** (core tracking + SRR sync + Plex + wizard/triage/recs on phone). Re-scope spec §9's milestones so something can *replace* the PWA on the phone at the end of phase 1, and chat/palate/stats/admin are explicitly deferred or permanently left to the web surface.
2. **Rewrite spec §3/§4.4 around the SRR-to-D1 model** (`overnight/w2-srr-d1`'s `/state/*` endpoints) instead of the KV blob + client merge, and delete the incorrect claim that the Worker merges per-item today. Land the SRR cutover *before* the native client exists — it removes the most dangerous piece of logic (the merge) from the client entirely, for the PWA too.
3. **Add a Worker workstream to the plan: bearer-auth migration** of the ~46 shared-secret routes (§4.1) plus one FCM registration route and FCM sending in `runAlertsCheck`. Without it the spec's Keystore/security story is not achievable. Estimate it as its own milestone, not a rider on M4/M5.
4. **Make the API contract explicit before writing any Ktor code:** commit `docs/WORKER-API.md` (seeded from §4's table), add server-side validation for the sync blob, alerts manifest, and chat candidates, and standardize the error envelope to JSON `{error}`.
5. **Close the golden-fixture gaps in JS first** (state merge / pull-fill, mood archetype table, Trakt pull mapping, alerts manifest, triage transitions — §2.2), extending tonight's `overnight/w1-tests` pattern. Cheap now, mandatory before a port; each fixture is also a regression test for the PWA immediately.
6. **Run a quirk triage over the pinned golden behaviors** (starting with the dead "Recommended" path in `computeRecsForTab`, §2.3): decide keep vs fix, patch the JS for the "fix" cases, and re-pin fixtures — so the Kotlin port targets intended behavior, not fossilized bugs.
7. **Commit the audit or remove audit references from the spec** (§5.4). A decision doc should not cite evidence that is not in the repo.
8. **Defer the KMP build decision until 1–5 are done.** Notably, items 2–5 are pure wins for the current PWA even if the rewrite is never approved — they de-risk the rewrite while standing alone. The go/no-go on Kotlin can then be made against a spec whose data-flow, auth model, and test substrate are real.

---

## Appendix: verification notes

- Counts measured on this branch (files identical to main @ 542bd83): `app.js` 10,103 lines; top-level function declarations 310 (`grep -cE '^(async )?function '`), 317 including indented; `worker/worker.js` 3,357 lines; 49 `checkSecret` call sites (`grep -c checkSecret`); route handlers enumerated from `grep -nE "if \(\(?path" worker/worker.js` (67 matches minus the two rate-limit classifier lines at `:780–781`, plus the double-path handlers noted in §1.1).
- `overnight/w1-tests` and `overnight/w2-srr-d1` were inspected read-only in their worktrees on the night of 2026-08-07/08; their contents may change before merge. Nothing in this review modifies them.
- The spec's version header ("CinéMath v8.0.0 / app v5.36.0 / Worker → v9.0.0") is consistent with `CHANGELOG.md` (8.0.0 — 2026-05-13) and the Worker's v9.0.0 rate-limit/auth comments (`worker/worker.js:916–922`).
