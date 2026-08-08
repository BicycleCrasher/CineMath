// === List sorting ===
// Extracted from app.js sortItems. Pure given (items, sort, ctx); the app
// wrapper supplies the active tab and the per-tab rating / lastUpdated
// accessors. 'default' preserves catalog/section order and returns the
// SAME array instance (callers rely on that no-copy fast path).
//
// Rating sort order (best first); unrated ('none' or unknown) sinks last.
export const RATING_SORT_ORDER = { 'loved': 0, 'liked': 1, 'mixed': 2, 'disliked': 3, 'none': 4 };

// ctx: { activeTab, getRating(id, tab), getLastUpdated(id, tab) }
export function sortItems(items, sort, ctx) {
  if (sort === 'default') return items;  // catalog/section order preserved
  const arr = items.slice();
  if (sort === 'year') {
    arr.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  } else if (sort === 'title') {
    arr.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'rating') {
    const rorder = RATING_SORT_ORDER;
    arr.sort((a, b) => {
      const ta = a._watchlist_source_tab || ctx.activeTab;
      const tb = b._watchlist_source_tab || ctx.activeTab;
      const ra = rorder[ctx.getRating(a.id, ta)] ?? 4;
      const rb = rorder[ctx.getRating(b.id, tb)] ?? 4;
      return ra - rb || a.title.localeCompare(b.title);
    });
  } else if (sort === 'updated') {
    arr.sort((a, b) => {
      const ta = a._watchlist_source_tab || ctx.activeTab;
      const tb = b._watchlist_source_tab || ctx.activeTab;
      return (ctx.getLastUpdated(b.id, tb) || 0) - (ctx.getLastUpdated(a.id, ta) || 0) || a.title.localeCompare(b.title);
    });
  }
  return arr;
}
