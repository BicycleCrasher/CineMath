# XSS Audit — `app.js` innerHTML sinks

Branch: `overnight/s1-xss-audit` (based on `main` @ 542bd83)
Scope: every `innerHTML` assignment in `app.js` (~102 sites). `service-worker.js` untouched; worker code out of scope for fixes (noted where relevant).

## Methodology

1. **Enumeration** — every `.innerHTML =` (and `+=`) assignment in `app.js` was located and its template examined.
2. **Data-flow classification** — three classifier passes traced each interpolated expression back to its source and assigned one of five verdicts:
   - `safe-static` — no interpolation, or only compile-time string literals.
   - `safe-numeric` — only locally computed numbers / boolean-ternary literals reach the markup.
   - `safe-escaped` — every externally influenced string passes through `escapeHtml()` (or `encodeURIComponent` for URL parts).
   - `borderline` — an interpolated value is *plausibly* constrained (numeric year, enum, slug, TMDB poster path) but nothing in `app.js` proves it; escaped-by-accident rather than by construction.
   - `unsafe` — at least one externally controlled string reaches HTML without escaping.
3. **Threat model** — "external" means: worker JSON responses (pair info, invites, devices, history, promotions, chat, palate predictions), Plex server metadata, TMDB metadata (including values cached in localStorage), catalog JSON files (`data/*.json` — treated as externally controlled per the audit rubric even though first-party in practice), cross-device-sync KV state, the `?config=BASE64` pairing payload, and user free text (notes, invite display names).
4. **Verification** — every `unsafe` and `borderline` site was re-read in a verification pass before any edit was made; the fix agent confirmed each site's data flow independently. **All classifier verdicts were confirmed; no reclassifications were needed.** Helper functions were also verified: `streamingSearchUrl()` (static templates + `encodeURIComponent`), `trailerYouTubeUrl()` (`encodeURIComponent`), the four `stats*` chart helpers (labels escaped), `priorityLabel()`/`ratingLabel()` (closed maps), `qr.createSvgTag()` (numeric geometry only), and the vendored QR library.
5. **Fix policy** — minimal change only: wrap external interpolations in the existing `escapeHtml()` (defined at `app.js:1` / `app.js:1370`); attribute contexts stay double-quoted and get escaping; URL contexts use `encodeURIComponent` / scheme validation matching patterns already in the file. No rendering restructures. Behavior for benign data is unchanged (`escapeHtml` is the identity on strings without `&<>"'`).

## Fixes applied

All 20 confirmed-unsafe sites were fixed, plus 10 borderline sites whose fix was a trivial `escapeHtml()` wrap (identity for benign data — annotated "hardened" below).

### Unsafe sites fixed

**1054 — pair-confirm device detail** (worker `/pair/info`; `userAgent` is attacker-device-controlled)
```js
// before
<div><strong>Device:</strong> ${info.userAgent || 'Unknown'}</div>
<div><strong>IP:</strong> ${info.ip || 'Hidden'}</div>
// after
<div><strong>Device:</strong> ${escapeHtml(info.userAgent || 'Unknown')}</div>
<div><strong>IP:</strong> ${escapeHtml(info.ip || 'Hidden')}</div>
```

**1233 — admin invite rows** (`suggestedDisplayName` is admin free text round-tripped through the worker)
```js
// before
<div><strong>${inv.code}</strong> · ${status}</div>
...${inv.suggestedDisplayName ? `for "${inv.suggestedDisplayName}" · ` : ''}
// after
<div><strong>${escapeHtml(inv.code)}</strong> · ${escapeHtml(status)}</div>
...${inv.suggestedDisplayName ? `for "${escapeHtml(inv.suggestedDisplayName)}" · ` : ''}
```

**2375/2391/2395 — streaming providers** (TMDB `provider_name`; `region` from localStorage / `?config=` payload)
```js
// before
`Not available in ${region}`                                   // ×2
`...rel="noopener">${p.provider_name}</a>`
// after
`Not available in ${escapeHtml(region)}`                       // ×2
`...rel="noopener">${escapeHtml(p.provider_name)}</a>`
```

**3396 — tab buttons** (catalog manifest `c.id`/`c.label`)
```js
// before
data-tab="${c.id}">${c.label}</button>
// after
data-tab="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>
```

**3441 — category pills** (catalog JSON / KV-promotion category keys; `prettyCategory` does not escape)
```js
// before
data-category="${p.key}">${p.label}</button>
// after
data-category="${escapeHtml(p.key)}">${escapeHtml(p.label)}</button>
```

**4035 — section headers** (catalog JSON section names/descriptions)
```js
// before
<div class="section-num">${parts[0]}</div>
<h2 class="section-title">${parts.slice(1).join('.').trim()}</h2>
<p class="section-desc">${item.sectionDesc}</p>
// after — all three wrapped in escapeHtml()
```

**4117 — main item card** (catalog JSON + runtime Plex/TMDB-promoted items). Escaped: `item.title`, every `metaLine` component (`year`/`dir`/`network`/`country`/`runtime`), `item.seasons`, `item.pitch`, `item.commitment`, `sourceLabel`, `item.whyPriority`, critic `c.who`/`c.quote`, `plexMatch.ratingKey` (data-plex-key attr), `item.id` (textarea data-id attr). Representative:
```js
// before
<h3 class="item-title">${item.title}</h3> ... <p class="pitch">${item.pitch || ''}</p>
`<button class="plex-play-btn" data-plex-key="${plexMatch.ratingKey}">`
// after
<h3 class="item-title">${escapeHtml(item.title)}</h3> ... <p class="pitch">${escapeHtml(item.pitch || '')}</p>
`<button class="plex-play-btn" data-plex-key="${escapeHtml(plexMatch.ratingKey)}">`
```

**6402/6413 — renderStats** (catalog title incl. promoted tabs; tag keys from synced state)
```js
// before
<strong>${longestQueue.tab} (${longestQueue.count})</strong> ... <span>${tag}</span>
// after
<strong>${escapeHtml(longestQueue.tab)} (${longestQueue.count})</strong> ... <span>${escapeHtml(tag)}</span>
```

**6502/6506/6564/6572/6579 — renderCatalogHealth** (catalog titles, item labels, countries, directors — all now `escapeHtml`'d)
```js
// before
`<div class="health-item">${x.label} <span class="health-tab">${x.tab}</span></div>`
`<span>${c}</span>` / `<span>${info.title}</span>` / `<span>${d}</span>`
// after — each interpolation wrapped in escapeHtml()
```

**5450 — promote-tab select options** (catalog manifest), same fix at **8766** (Find Gaps promote) and **9208** (wizard recs-promote):
```js
// before
.map(c => `<option value="${c.id}">${c.label}</option>`)
// after
.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
```

**5602 — promotions manager meta** (KV `p.item.year`, catalog `tabLabel`)
```js
// before
const meta = `${p.item.year || '?'} · ${tabLabel}${dateStr ? ' · added ' + dateStr : ''}`;
// after
const meta = `${escapeHtml(p.item.year || '?')} · ${escapeHtml(tabLabel)}${dateStr ? ' · added ' + dateStr : ''}`;
```

**6153/6210 + 6179 — search & notes search via `highlightMatch()`** (titles, directors, tab labels, full note bodies were interpolated raw). `highlightMatch` now escapes the three slices around the `<mark>` (offsets computed on the raw string, so highlighting is unchanged); data attributes escaped too; notes-search title/badge escaped:
```js
// before
return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + q.length) + '</mark>' + text.slice(idx + q.length);
// after
return escapeHtml(text.slice(0, idx)) + '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(text.slice(idx + q.length));
```

**7568/7570/7596 — watch modal region** (localStorage value settable verbatim by the `?config=BASE64` pairing payload — the highest-severity finding: a crafted link plants HTML that executes whenever the watch modal renders)
```js
// before
`On your subscriptions — ${region}` / `Not on your subscriptions in ${region}.` / `<strong>${region}</strong>`
// after — all three wrapped in escapeHtml(region)
```

**7929 — AI chat Watch Card** (TMDB `providers.link` raw in `href`, trailer key raw in URL, region and year raw)
```js
// before
} else if (providers && providers.link) {
  playUrl = providers.link;
...
href="https://www.youtube.com/watch?v=${trailerKey}" ... href="${playUrl}"
// after
} else if (providers && typeof providers.link === 'string' && /^https:\/\//i.test(providers.link)) {
  playUrl = providers.link;      // https-only allowlist blocks javascript: URLs
...
href="${trailerYouTubeUrl(trailerKey)}" ... href="${escapeHtml(playUrl)}"
```
(`trailerYouTubeUrl` already existed and `encodeURIComponent`s the key — this matches the pattern used at 9038.) Also `escapeHtml(item.year || '?')` and `escapeHtml(region)`.

**8468 — triage tag-confirmation confidence badge** (raw LLM JSON relayed unvalidated by the worker)
```js
// before
`<span class="th-conf th-conf--${pred.confidence}">${pred.confidence}</span>`
// after
`<span class="th-conf th-conf--${escapeHtml(pred.confidence)}">${escapeHtml(pred.confidence)}</span>`
```

**8981 — wizard continue-list** (catalog title raw; data attrs raw)
```js
// before
data-tab="${x.tab}" data-id="${x.item.id}"> ... <span class="wizard-list-meta">${tabLabel}</span>
// after
data-tab="${escapeHtml(x.tab)}" data-id="${escapeHtml(x.item.id)}"> ... ${escapeHtml(tabLabel)}
```

### Borderline sites hardened (trivial `escapeHtml` wraps)

| Line | What was hardened |
|---|---|
| 1327 | `${d.kind}` (worker device kind, plausibly enum) |
| 3792 | `data-tab`/`data-id` on now-watching banner buttons |
| 5390–5397 | history row `meta` text, `data-year` attr, `inCatalog.tabId` badge |
| 7501 | `href="${escapeHtml(plexUrl)}"` (Plex `ratingKey` embedded in deep link) |
| 8092–8104 | quick-triage `posterPath` in `src`, `pick.year`, `qt-pri--${priority}` class |
| 8279–8286 | triage round-1 `posterPath`, `item.year`, `rating-badge ${currentRating}` class |
| 8474 | triage round-2 `item.year` |
| 8579 | disagreed-list `x.year` |
| 8732–8737 | Find Gaps `data-tmdb-id` ×3 (still `parseInt`'d on read) |
| 9036/9055–9056 | wizard recs `r.year` (text + `data-year`), `r.tmdbId` (`data-tmdb-id`) |
| 9479 | rate/tag triage header `item.year` |

All are identity transforms for benign data (numeric years/ids, enum kinds, `/hash.jpg` poster paths, slug tab ids).

## Full classification table

Line numbers refer to the pre-fix file (main @ 542bd83). Verdicts are the confirmed classifier verdicts; **Action** records what this pass did.

| Line | Context | Data sources | Verdict | Action |
|---|---|---|---|---|
| 1054 | pairConfirmStart — pair device detail | worker `/pair/info`: userAgent (attacker-controlled UA), ip; expiresAt via Date | unsafe | fixed |
| 1222 | refreshAdminInviteList — clear list | static `''` | safe-static | — |
| 1224 | refreshAdminInviteList — "No invites yet." | static literal | safe-static | — |
| 1233 | refreshAdminInviteList — invite rows | worker invites: code, consumedBy, suggestedDisplayName (free text), plexEnabled | unsafe | fixed |
| 1316 | refreshDevicesSection — clear list | static `''` | safe-static | — |
| 1318 | refreshDevicesSection — "No devices bound." | static literal | safe-static | — |
| 1325 | refreshDevicesSection — device row | worker `/user/me` devices: name/userAgent escaped; `d.kind` raw | borderline | hardened |
| 2301 | loadStreamingProviders — clear slot | static `''` | safe-static | — |
| 2307 | loadStreamingProviders — loading indicator | static literal | safe-static | — |
| 2314 | loadStreamingProviders — clear slot | static `''` | safe-static | — |
| 2397 | renderStreamingProviders — region select + badges | TMDB provider_name raw; `region` from localStorage raw; hrefs safe (encodeURIComponent) | unsafe | fixed |
| 3395 | buildTabs — tab buttons | catalogs.json manifest c.id/c.label raw | unsafe | fixed |
| 3418 | buildCategoryFilters — clear | static `''` | safe-static | — |
| 3431 | buildCategoryFilters — clear | static `''` | safe-static | — |
| 3441 | buildCategoryFilters — category pills | catalog JSON / KV-promotion category keys; prettyCategory does not escape | unsafe | fixed |
| 3515 | buildFilters — sort + filter buttons | hardcoded literals, numeric counts, ternary comparisons only | safe-numeric | — |
| 3543 | buildTagPills — clear | static `''` | safe-static | — |
| 3551 | buildTagPills — clear | static `''` | safe-static | — |
| 3564 | buildTagPills — clear | static `''` | safe-static | — |
| 3626 | buildTagPills — tag pills | hardcoded TAG_SETS + state tags, all escapeHtml'd | safe-escaped | — |
| 3792 | renderWatchingNowBanner | title/tabLabel escaped; data-tab/data-id raw (catalog ids) | borderline | hardened |
| 3997 | _renderImpl — clear container | static `''` | safe-static | — |
| 4035 | _renderImpl — section header | catalog JSON section names + sectionDesc raw | unsafe | fixed |
| 4117 | _renderImpl — main item card | catalog JSON + Plex/TMDB-promoted: title, meta, pitch, critics, badges, whyPriority, ratingKey, item.id — raw; notes escaped | unsafe | fixed |
| 4367 | app-logo handler — clear search results | static `''` | safe-static | — |
| 4450 | search modal open — clear | static `''` | safe-static | — |
| 4485 | notes-search modal open — clear | static `''` | safe-static | — |
| 4512 | stats button → renderStats (6317) | numeric counters; catalog title @6402 raw; synced tag keys @6413 raw; chart helpers escape labels | unsafe | fixed (6402, 6413) |
| 4524 | catalog-health button → renderCatalogHealth (6448) | catalog titles/labels/countries/directors raw in collapsible() + stat lines | unsafe | fixed (6502/6506/6564/6572/6579) |
| 4630 | buildSettingsCardGrid — card grid | SETTINGS_CARDS hardcoded literals | safe-static | — |
| 4646 | buildSettingsCardGrid — sync section | static template, no interpolation | safe-static | — |
| 4883 | bulk-sync → renderBulkSyncReport (6037) | numeric counters; Plex titles escaped @6060/6068 | safe-escaped | — |
| 4920 | catalog-enrich result modal | integer counters only | safe-numeric | — |
| 5258 | openHistoryModal — clear | static `''` | safe-static | — |
| 5266 | openHistoryModal — clear | static `''` | safe-static | — |
| 5369 | renderHistoryList — clear | static `''` | safe-static | — |
| 5387 | renderHistoryList — history rows | title escaped; it.year raw (text + data-year); inCatalog.tabId raw | borderline | hardened |
| 5450 | openPromoteModal — tab options | catalogs.json c.id/c.label raw | unsafe | fixed |
| 5572 | openPromotionsManager — clear | static `''` | safe-static | — |
| 5585 | renderPromotionsManager — empty state | static literal | safe-static | — |
| 5602 | renderPromotionsManager — rows | most escaped; p.item.year + catalog tabLabel raw in meta | unsafe | fixed |
| 5703 | openPeriodReviewModal — year options | getFullYear() numbers | safe-numeric | — |
| 5708 | openPeriodReviewModal — month options | hardcoded month names + index | safe-static | — |
| 6125 | doSearch — min-chars empty state | static literal | safe-static | — |
| 6151 | doSearch — "No matches." | static literal | safe-static | — |
| 6153 | doSearch — result rows | catalog titles/dirs/tab labels via non-escaping highlightMatch; data attrs raw | unsafe | fixed (incl. highlightMatch) |
| 6190 | doNotesSearch — min-chars empty state | static literal | safe-static | — |
| 6208 | doNotesSearch — "No matches in your notes." | static literal | safe-static | — |
| 6210 | doNotesSearch — result rows | note bodies (user/synced free text) + titles/labels via highlightMatch, raw | unsafe | fixed |
| 7369 | updateSyncStatusUI | computed timestamps; error string escaped | safe-escaped | — |
| 7405 | renderPairQr — QR lib missing | static literal | safe-static | — |
| 7420 | renderPairQr — URL too long | static literal | safe-static | — |
| 7424 | renderPairQr — createSvgTag | vendored QR lib emits numeric SVG geometry only | safe-numeric | — |
| 7487 | openWatchModal — loading placeholder | static literal | safe-static | — |
| 7501 | openWatchModal — Plex deep link | plexUrl embeds unvalidated Plex ratingKey in quoted href | borderline | hardened |
| 7533 | renderWatchProviders — not-configured notice | static literal | safe-static | — |
| 7549 | renderWatchProviders — no-availability notice | static literal | safe-static | — |
| 7599 | renderWatchProviders — subs/VPN sections | `region` raw ×3 (settable via `?config=` payload); providers escaped; URLs encoded | unsafe | fixed |
| 7874 | openChatModal — clear history | static `''` | safe-static | — |
| 7929 | appendWatchCard — AI chat Watch Card | TMDB providers.link raw in href; trailerKey raw in URL; region + year raw; texts escaped | unsafe | fixed |
| 8071 | qtRenderStack — clear | static `''` | safe-static | — |
| 8074 | qtRenderStack — end-of-deck | static literal | safe-static | — |
| 8099 | qtBuildCard — swipe card | posterPath raw in src; year raw; priority raw in class; texts escaped | borderline | hardened |
| 8281 | thRenderRound1 — rating card | posterPath raw in src; year raw; currentRating raw in class; texts escaped | borderline | hardened |
| 8288 | thRenderRound1 — rating buttons | static literals | safe-static | — |
| 8350 | thRenderLoading — analyzing card | static literal | safe-static | — |
| 8353 | thRenderLoading — cancel button | static literal | safe-static | — |
| 8468 | thRedrawRound2Card — tag confirmation | pred.confidence (unvalidated LLM JSON via worker) raw in class + text; tags escaped | unsafe | fixed |
| 8476 | thRedrawRound2Card — actions | static literals | safe-static | — |
| 8536 | thOpenTagEdit — chip list | hardcoded TAG_SETS, escaped | safe-escaped | — |
| 8539 | thOpenTagEdit — actions | static literals | safe-static | — |
| 8575 | thRenderDisagreed — list | titles escaped; x.year raw | borderline | hardened |
| 8582 | thRenderDisagreed — actions | static literals | safe-static | — |
| 8616 | thRenderDone — summary | local counter | safe-numeric | — |
| 8622 | thRenderDone — close button | static literal | safe-static | — |
| 8719 | renderFindGaps — clear (no sources) | static `''` | safe-static | — |
| 8724 | renderFindGaps — clear (no candidates) | static `''` | safe-static | — |
| 8728 | renderFindGaps — candidate rows | text escaped; c.tmdbId raw in 3 data attrs | borderline | hardened |
| 8766 | renderFindGaps — promote options | catalogs.json c.id/c.label raw | unsafe | fixed |
| 8826 | _wizardSetBreadcrumb — root crumb | hardcoded literals only | safe-static | — |
| 8854 | _wizardSetBreadcrumb — crumb trail | hardcoded consts (TIME_BUDGETS/MOOD_ARCHETYPES/GENRE_FAMILIES) | safe-static | — |
| 8882 | wizardRender — root buttons | static literals | safe-static | — |
| 8908 | wizardRender — rate buttons | static literals | safe-static | — |
| 8932 | wizardRender — mood buttons | hardcoded MOOD_ARCHETYPES | safe-static | — |
| 8942 | wizardRender — time-budget buttons | hardcoded TIME_BUDGETS | safe-static | — |
| 8949 | wizardRender — film/tv step | static literals | safe-static | — |
| 8957 | wizardRender — session step | static literals | safe-static | — |
| 8977 | wizardRender — continue empty state | static literal | safe-static | — |
| 8981 | wizardRender — continue-list items | title escaped; catalog tabLabel raw; data-tab/data-id raw | unsafe | fixed |
| 9002 | wizardRender — genre buttons | hardcoded GENRE_FAMILIES; labels escaped | safe-escaped | — |
| 9075 | wizardRender — recs step | free text escaped; r.year/r.tmdbId raw in text + data attrs; trailer URL encoded | borderline | hardened |
| 9208 | wizardHandleAction recs-promote — options | catalogs.json c.id/c.label raw | unsafe | fixed |
| 9399 | renderTriage — complete card | static literal | safe-static | — |
| 9401 | renderTriage — close button | static literal | safe-static | — |
| 9430 | renderTriage — item card | all fields escapeHtml'd / constrained maps | safe-escaped | — |
| 9441 | renderTriage — queue actions | static literals | safe-static | — |
| 9449 | renderTriage — suggestions actions | static literals | safe-static | — |
| 9474 | renderRateTagTriage — header | title/label escaped; item.year raw | borderline | hardened |
| 9536 | renderRateTagTriage — step card | local int, constrained maps, escaped tags | safe-escaped | — |
| 9560 | renderRateTagTriage — actions | static literals | safe-static | — |

## Borderline items left for review (not fixed)

None require immediate action — every borderline site received its trivial escape — but the underlying values remain unvalidated at the source:

- **`plexDeepLinkUrl()` (app.js:590)** — `ratingKey` is still embedded structurally into the `plex://` URL. The href is now attribute-escaped at both call sites that template it, but a `/^\d+$/` validation (or `encodeURIComponent(ratingKey)`) inside `plexDeepLinkUrl` would make the URL safe by construction for all future callers.
- **`getStreamingRegion()` / `applyConfigPayload()` (app.js:1955 / 7465)** — the region string is now escaped at every render site, but it is still stored unvalidated from the `?config=BASE64` payload. Validating against `STREAMING_REGIONS` codes at write time would close the class entirely.
- **`data-type="${it.type}"` (history rows) and rating/status class interpolations** — derived from constrained enums today; left as-is where the classifier verified the constraint.

## Recommendations

1. **Validate at the boundary, not just the sink.** The two systemic sources — the `?config=` pairing payload and worker-relayed LLM output (`/palate/predict-tags` confidence) — should be schema-validated on ingestion (region against `STREAMING_REGIONS`, confidence against `['high','medium','low']`). Escaping at render is now in place, but allowlisting makes intent explicit.
2. **Deduplicate `escapeHtml`.** It is defined twice (app.js:1 and app.js:1370, the latter winning at runtime). Keep one definition — preferably the `String(s ?? '')` variant — to avoid divergence.
3. **Prefer `textContent`/`dataset` for new code.** Several sites (e.g. item cards at 4067) already use `el.dataset.id = ...` safely; templated `data-*` attributes should follow that pattern rather than string interpolation.
4. **Consider a tiny `html` tagged-template helper** that auto-escapes interpolations, so future sinks are safe by default instead of by discipline.
5. **CSP.** A `Content-Security-Policy` (e.g. `script-src 'self'`) on the hosting layer would convert any residual markup injection into a non-executing defect.
6. **Worker-side hardening (out of scope here):** cap/sanitize `userAgent` stored for pair sessions, and validate the LLM JSON schema in `worker/worker.js` (~1403) before returning it.
