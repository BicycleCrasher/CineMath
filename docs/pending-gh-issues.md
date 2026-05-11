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
