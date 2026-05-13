# Pending GitHub Issues

Post these with: `gh issue create --repo BicycleCrasher/WatchTrack --title "..." --body "..."`
(Requires `gh auth login` first.)

---

## Issue 1 — Wizard recs: empty state has no action button (TV users stuck)

**Labels:** bug, TV, wizard

### Problem

When the wizard recs step produces no results (no enrichment, no loved/liked items, or nothing matching the time + mood filter), the panel shows only a plain-text message. The only way out is the Back button.

In the **old** recs panel (pre-6.1) there was a "Browse all unrated items in {genre}" button as a fallback. That was removed in the 6.1.0 redesign when the panel became the side-by-side Films + TV layout.

This is especially painful on TV. On the Sony Bravia, pressing Back works, but there is **no focusable button** in the recs content area — the D-pad has nowhere to go except the modal-back button in the header. Users who don't have anything enriched yet (common for new installs) land here immediately with no forward path.

### Reproduction

1. Open the wizard → Looking for something to watch → pick a time → pick a mood → pick a genre you have no loved/liked items in.
2. Recs panel renders; one or both columns shows the empty-state message.
3. No button in the content area to focus or click.

### Suggested fix

Add a fallback button inside `renderRecsCol` (in `wizardRender`, recs step) for each empty-state variant:

```js
if (recs.sourceCount === 0) {
  return `<div class="wizard-recs-empty">No Loved/Liked ${kindLabel} yet — rate some first.</div>
          <button class="wizard-btn" data-action="recs-fallback" ...>Browse all unrated ${kindLabel}</button>`;
}
```

The `recs-fallback` action handler already exists in `wizardHandleAction` — it just has no button generating it anymore. Wiring it back up restores the old behavior with minimal code.

**Simplest stopgap:** ensure at least one `.wizard-btn` is always rendered inside the step so D-pad always has a target.

---

## Issue 3 — Triage History Round 2: null entry crash if pool/round1 desync (app.js:7160)

**Labels:** bug, triage

### Problem

In `thRenderRound2()` (app.js line 7160):

```js
const entry = pool.find(p => p.tabId === r1.tabId && p.itemId === r1.itemId) || pool[idx];
const { item, tabId } = entry;  // TypeError if both lookups return undefined
```

If the `.find()` returns `undefined` **and** `pool[idx]` is also `undefined` (e.g. pool was mutated mid-session, or round1 somehow has more entries than pool), the destructuring throws an uncaught TypeError and Round 2 crashes.

Partial fix already applied inline (2026-05-12): added `if (!entry) { _thState.idx += 1; return thRender(); }` guard. This skips the crashed card rather than hard-crashing, but does not address the root cause.

### Root cause to investigate

Confirm whether pool length can ever be shorter than round1 length. If not, the guard is sufficient. If yes (e.g. items deleted between Round 1 pick and Round 2 render), consider rebuilding pool from `catalogs` at Round 2 start.

---

## Issue 4 — Worker /chat: unvalidated candidate strings allow token-budget exhaustion

**Labels:** security, worker

### Problem

The `/chat` endpoint embeds `body.candidates` directly into the AI prompt (worker.js ~line 1207–1213) without capping individual field lengths. An over-large `pitch` or `title` field passed by the client inflates the Workers AI token budget, can hit the 400-token output cap, and may produce truncated or malformed JSON responses.

Fields that need length caps before prompt insertion:
- `c.title` — no cap (currently uncapped; should be ≤ 300 chars)
- `c.dir` — no cap (≤ 100 chars)
- `c.pitch` — already caps at 200 via `String(c.pitch).slice(0, 200)` — **OK**
- `c.tags` — already caps at 5 tags — **OK**
- `history[].content` — already caps at 2000 chars — **OK**

Also, `h.role` is normalized (line 1229: `h.role === 'assistant' ? 'assistant' : 'user'`) — **OK**.

### Suggested fix

```js
const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
  .slice(0, 50)
  .map(c => ({ ...c, title: String(c.title || '').slice(0, 300), dir: String(c.dir || '').slice(0, 100) }));
```

---

## Issue 2 — node_modules accidentally committed (commit f6243aa)

**Labels:** chore, git

### Problem

Commit `f6243aa` ("Rename 'Pre-1960' to 'Classics' and tweak wizard back", 2026-05-11) accidentally committed 12 `node_modules/` files:

```
node_modules/.bin/esbuild
node_modules/.package-lock.json
node_modules/@esbuild/darwin-x64/bin/esbuild   ← 10 MB binary
node_modules/esbuild/bin/esbuild               ← 10 MB binary
... (8 more)
```

The `.gitignore` (added in `e210bbd`) does not include `node_modules/`. These are macOS-arm64 binaries that won't run in CI (Ubuntu) and bloat the repo.

### Fix

1. Add `node_modules/` to `.gitignore`.
2. Remove the tracked files: `git rm -r --cached node_modules/`
3. Commit: `"chore: untrack node_modules, add to .gitignore"`

The GitHub Actions workflow uses `npm install` before esbuild runs, so CI is unaffected.
