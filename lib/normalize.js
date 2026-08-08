// === Title/year normalization for Plex <-> catalog matching ===
// Extracted verbatim from app.js so a future Kotlin Multiplatform port can
// replicate the exact same keys. Golden cases: tests/fixtures/normalize-cases.json.
//
// NOTE: worker/worker.js `normalizeTitle` (worker/worker.js:92) implements the
// SAME normalization as plexNormalizeKeyTitleOnly. The duplication is
// intentional (worker is deployed standalone); keep both in sync.

// Movies: normalized "title|year" key.
export function plexNormalizeKey(title, year) {
  if (!title) return '';
  let t = title.toLowerCase();
  // Strip parenthetical disambiguators like "(BBC, 1979)" or "(2024)"
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ');
  // Replace & with "and"
  t = t.replace(/&/g, ' and ');
  // Strip apostrophes (curly + straight + backtick)
  t = t.replace(/[\u2019\u2018'`]/g, '');
  // Collapse all non-alphanumeric to nothing
  t = t.replace(/[^a-z0-9]+/g, '');
  return t.slice(0, 60) + '|' + (year || '');
}

// TV shows: match by title only, no year — Plex history has no series year
export function plexNormalizeKeyTitleOnly(title) {
  if (!title) return '';
  let t = title.toLowerCase();
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ');
  t = t.replace(/&/g, ' and ');
  t = t.replace(/[\u2019\u2018'`]/g, '');
  t = t.replace(/[^a-z0-9]+/g, '');
  return t.slice(0, 60);
}
