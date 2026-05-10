# Fonts

## great-vibes.woff2

Bundled web font for the calligraphic "Ciné" half of the CinéMath wordmark.

**Source:** [Great Vibes](https://fonts.google.com/specimen/Great+Vibes) — Open Font License (OFL).

### How to install the file

The repo ships without the binary for license-tracking cleanliness. Drop the `woff2` file in once:

1. Open https://fonts.google.com/specimen/Great+Vibes
2. Click **Get font** → **Download all** — you'll get a `.zip` containing `GreatVibes-Regular.ttf`
3. Convert the TTF to WOFF2 using either:
   - Web tool: https://cloudconvert.com/ttf-to-woff2 (no install)
   - CLI: `npm i -g ttf2woff2 && ttf2woff2 < GreatVibes-Regular.ttf > great-vibes.woff2`
4. Save the result here as `fonts/great-vibes.woff2` (~30–40 KB)

The `@font-face` rule in `styles.css` looks for `fonts/great-vibes.woff2`.
The service-worker's `ASSETS` array precaches it.

Until the file is dropped in, the app falls back through the CSS fallback chain
(Snell Roundhand → Edwardian Script ITC → Apple Chancery → Brush Script MT →
generic cursive). Looks acceptable on macOS; varies on Android TV WebView.
