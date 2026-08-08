// === Content-type resolution ===
// Extracted from app.js. Decides which reaction-tag set an item gets:
// 1. explicit item.contentType override wins,
// 2. British-comedy style category mapping,
// 3. per-tab default (source tab preferred, then the caller's active tab),
// 4. film-narrative as final fallback.
// Golden cases: tests/fixtures/content-type-cases.json.

// Default content type per tab. Items in British Comedy resolve via category.
// Items can override at the catalog level via `contentType` on the item or section.
export const TAB_DEFAULT_CONTENT_TYPE = {
  'scifi': 'film-scifi',
  'scifi-tv': 'tv-scifi',
  'espionage': 'film-espionage',
  'spy-tv': 'tv-espionage',
  'crime': 'film-crime',
  'crime-tv': 'tv-crime',
  'cons-courtroom': 'film-cons-courtroom',
  'cons-courtroom-tv': 'tv-cons-courtroom',
  'horror': 'film-horror',
  'horror-tv': 'tv-horror',
  'fantasy': 'film-fantasy',
  'fantasy-tv': 'tv-fantasy',
  'heist': 'film-heist',
  'comedy': 'film-comedy',
  'comedy-tv': 'tv-sitcom',
  'british-comedy': 'tv-sitcom',
  'drama': 'film-drama',
  'drama-tv': 'tv-drama',
  'foreign': 'film-foreign',
  'auteur': 'film-auteur',
  'pre1960': 'film-pre1960',
  'musicals': 'film-musical',
  'heroes-comics': 'film-heroes',
  'heroes-comics-tv': 'tv-heroes'
};

// British-comedy category → content type mapping (when item has categories[]).
// `specials` is intentionally absent so it falls through to the OTHER category in the array.
export const CATEGORY_TO_CONTENT_TYPE = {
  'panel': 'tv-panel',
  'news-comedy': 'tv-panel',
  'game': 'tv-game',
  'sitcom': 'tv-sitcom'
};

// V5.26.6: resolveContentType accepts an optional sourceTab parameter so
// items being rendered outside their home tab (e.g. in the watchlist or
// triage queue) still fall back to the right per-tab default. The third
// parameter is the app's current active tab (injected by the app.js wrapper
// so this stays pure).
export function resolveContentType(item, sourceTab, activeTab) {
  // 1. Explicit item override wins
  if (item && item.contentType) return item.contentType;
  // 2. British Comedy: look at item categories
  if (item && Array.isArray(item.categories) && item.categories.length > 0) {
    for (const cat of item.categories) {
      if (CATEGORY_TO_CONTENT_TYPE[cat]) return CATEGORY_TO_CONTENT_TYPE[cat];
    }
  }
  // 3. Source tab default (preferred), then activeTab default, then film-narrative
  const tab = sourceTab || (item && (item._watchlist_source_tab || item._auteur_source_tab)) || activeTab;
  return TAB_DEFAULT_CONTENT_TYPE[tab] || 'film-narrative';
}
