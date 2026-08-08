// === Plex scrobble/history -> catalog matching ===
// Pure matching logic extracted from app.js applyPlexEvent (and shared by the
// bulk-sync rules in lib/bulk-sync.js). Movies match on normalized title+year
// with a ±1 year fuzz (Plex vs TMDB years disagree around festival releases);
// TV matches on title only because Plex episode events don't carry the series
// first-aired year. Catalog items may list alternate titles in `aliases`.
import { plexNormalizeKey, plexNormalizeKeyTitleOnly } from './normalize.js';

// True when the item's title or any alias, keyed with the item's year or
// year ±1, equals movieKey.
export function itemMatchesMovieKey(item, movieKey) {
  const titlesToCheck = [item.title].concat(Array.isArray(item.aliases) ? item.aliases : []);
  for (const t of titlesToCheck) {
    if (plexNormalizeKey(t, item.year) === movieKey) return true;
    for (const dy of [-1, 1]) {
      if (plexNormalizeKey(t, item.year ? item.year + dy : null) === movieKey) return true;
    }
  }
  return false;
}

// True when the item's title or any alias, title-only keyed, equals tvKey.
export function itemMatchesTvKey(item, tvKey) {
  const titlesToCheck = [item.title].concat(Array.isArray(item.aliases) ? item.aliases : []);
  for (const t of titlesToCheck) {
    if (plexNormalizeKeyTitleOnly(t) === tvKey) return true;
  }
  return false;
}

// Match a webhook event against every loaded catalog. Returns
// { tabId, item, isMovie } for the first match (catalog iteration order),
// or null when the event is not an applicable scrobble / nothing matches.
// `catalogs` is { tabId: { items: [...] } }.
export function findCatalogMatchForScrobble(catalogs, evt) {
  if (evt.event !== 'media.scrobble') return null;
  if (evt.type !== 'movie' && evt.type !== 'episode' && evt.type !== 'show') return null;

  // For movies, match title+year exactly. For TV, match title only since Plex
  // history doesn't carry the series first-aired year on episode events.
  const isMovie = evt.type === 'movie';
  const matchTitle = isMovie ? evt.title : (evt.grandparentTitle || evt.title);
  const matchYear = isMovie ? evt.year : null;
  if (!matchTitle) return null;

  const movieKey = isMovie ? plexNormalizeKey(matchTitle, matchYear) : null;
  const tvKey = isMovie ? null : plexNormalizeKeyTitleOnly(matchTitle);

  for (const tabId in catalogs) {
    const cat = catalogs[tabId];
    for (const item of cat.items) {
      const matched = isMovie
        ? itemMatchesMovieKey(item, movieKey)
        : itemMatchesTvKey(item, tvKey);
      if (matched) return { tabId, item, isMovie };
    }
  }
  return null;
}
