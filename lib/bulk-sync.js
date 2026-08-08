// === Plex bulk-sync rules ===
// Extracted from app.js applyBulkSyncRules. Pure given its inputs: state
// reads/writes go through the injected `deps` accessors so the node:test
// suite (and a future KMP port) can run the exact rule set against an
// in-memory state map.
//
// Rules replicated here (golden cases: tests/fixtures/bulk-sync-cases.json):
//  - only whitelisted Plex libraries count
//  - movies group by normalized title+year; any play -> watched (year ±1 fuzz)
//  - episodes group by show title; distinct episodes counted by s_e pair
//  - shows: watched when distinct/total >= 0.95 (strict) or 0.80 (flexible);
//    'episodic' mode never auto-watches; otherwise -> watching
//  - loved rule: 5+ distinct episodes -> rating loved
import { plexNormalizeKey, plexNormalizeKeyTitleOnly } from './normalize.js';
import { itemMatchesMovieKey, itemMatchesTvKey } from './plex-match.js';

// Library whitelist (hardcoded — matches Worker config).
export const PLEX_BULK_LIBRARY_WHITELIST = new Set(['1', '2']);

// Apply bulk-sync rules given the full filtered history. Returns a structured
// report. `deps` must provide: catalogs, getStatus(id, tab), setStatus(id,
// status, tab), getRating(id, tab), setRating(id, rating, tab).
export function applyBulkSyncRules(entries, episodeCounts, deps) {
  const { catalogs, getStatus, setStatus, getRating, setRating } = deps;

  // Filter to whitelisted libraries first
  const filtered = entries.filter(e => PLEX_BULK_LIBRARY_WHITELIST.has(String(e.librarySectionID || '')));

  // Group: movies by (norm_title, year); episodes by show
  const movieMap = new Map();   // norm_title|year -> { entries: [], title, year }
  const showMap = new Map();    // norm_title -> { episodes: Set('s_e'), title, latestPlay, totalPlays }

  filtered.forEach(e => {
    if (e.type === 'movie') {
      const yearVal = e.year || (e.originallyAvailableAt ? parseInt(String(e.originallyAvailableAt).slice(0, 4)) : null);
      const key = plexNormalizeKey(e.title, yearVal);
      if (!movieMap.has(key)) movieMap.set(key, { entries: [], title: e.title, year: yearVal });
      movieMap.get(key).entries.push(e);
    } else if (e.type === 'episode') {
      const show = e.grandparentTitle || e.title;
      if (!show) return;
      const key = plexNormalizeKeyTitleOnly(show);
      if (!showMap.has(key)) showMap.set(key, { episodes: new Set(), title: show, latestPlay: 0, totalPlays: 0 });
      const epId = `${e.parentIndex || '0'}_${e.index || '0'}`;
      const data = showMap.get(key);
      data.episodes.add(epId);
      data.totalPlays++;
      const ts = (e.viewedAt ? parseInt(e.viewedAt) * 1000 : 0);
      if (ts > data.latestPlay) data.latestPlay = ts;
    }
  });

  const report = {
    moviesProcessed: 0,
    moviesMatchedToCatalog: 0,
    moviesOrphan: 0,
    moviesMarkedWatched: 0,
    showsProcessed: 0,
    showsMatchedToCatalog: 0,
    showsOrphan: 0,
    showsMarkedWatched: 0,
    showsMarkedWatching: 0,
    showsMarkedLoved: 0,
    movieMatches: [],     // [{title, year, tab}]
    movieOrphans: [],     // [{title, year, plays}]
    showMatches: [],      // [{show, distinct, tab, finalStatus, finalRating}]
    showOrphans: [],      // [{show, distinct, plays}]
  };

  // === MOVIES: each match → mark watched in source tab ===
  for (const [key, data] of movieMap.entries()) {
    report.moviesProcessed++;
    let matched = false;
    for (const tabId in catalogs) {
      const cat = catalogs[tabId];
      for (const item of cat.items) {
        if (itemMatchesMovieKey(item, key)) {
          // Skip if already watched
          if (getStatus(item.id, tabId) !== 'watched') {
            setStatus(item.id, 'watched', tabId);
            report.moviesMarkedWatched++;
          }
          report.moviesMatchedToCatalog++;
          report.movieMatches.push({ title: data.title, year: data.year, tab: tabId });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      report.moviesOrphan++;
      report.movieOrphans.push({ title: data.title, year: data.year, plays: data.entries.length });
    }
  }

  // === TV SHOWS: distinct-episode rule + completion-mode rule ===
  for (const [key, data] of showMap.entries()) {
    report.showsProcessed++;
    const distinctCount = data.episodes.size;
    let matched = false;
    for (const tabId in catalogs) {
      const cat = catalogs[tabId];
      for (const item of cat.items) {
        if (itemMatchesTvKey(item, key)) {
          report.showsMatchedToCatalog++;
          const mode = item.tvCompletionMode || 'strict';
          let setWatched = false;
          if (mode !== 'episodic') {
            // Look up total episode count for this show (passed in from TMDB pre-fetch)
            const tmdb = (episodeCounts || {})[plexNormalizeKeyTitleOnly(item.title)] ||
                         (episodeCounts || {})[plexNormalizeKeyTitleOnly(data.title)];
            if (tmdb && tmdb > 0) {
              const ratio = distinctCount / tmdb;
              const threshold = mode === 'flexible' ? 0.80 : 0.95;
              if (ratio >= threshold) setWatched = true;
            }
          }
          // Apply status
          const cur = getStatus(item.id, tabId);
          if (cur !== 'watched') {
            if (setWatched) {
              setStatus(item.id, 'watched', tabId);
              report.showsMarkedWatched++;
            } else {
              if (cur !== 'watching') {
                setStatus(item.id, 'watching', tabId);
                report.showsMarkedWatching++;
              }
            }
          }
          // Loved rule: 5+ distinct episodes
          if (distinctCount >= 5 && getRating(item.id, tabId) !== 'loved') {
            setRating(item.id, 'loved', tabId);
            report.showsMarkedLoved++;
          }
          report.showMatches.push({
            show: data.title, distinct: distinctCount, tab: tabId,
            finalStatus: getStatus(item.id, tabId), finalRating: getRating(item.id, tabId),
          });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      report.showsOrphan++;
      report.showOrphans.push({ show: data.title, distinct: distinctCount, plays: data.totalPlays });
    }
  }

  return report;
}
