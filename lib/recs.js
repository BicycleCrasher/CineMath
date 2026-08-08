// === Stage 5e: Recommendation engine ===
// Extracted from app.js computeRecsForTab — this is what the wizard's recs
// step calls (wizardRender -> computeRecsForTab per film/TV tab group).
// Pure given its deps: walks loved/liked source items in tabIds, aggregates
// the TMDB recommendations/similar arrays from local enrichment, scores by
// source rating weight (loved=2, liked=1), classifies candidates as
// catalog-matched (Recommended) or TMDB-orphan (Discover), and returns the
// top of each. Golden cases: tests/fixtures/recs-cases.json.
import { fitsTimeBudget } from './runtime.js';

// Overlap count between an item's user-applied reaction tags and a mood's
// tag list. The app wrapper resolves MOOD_ARCHETYPES + stored tags first.
export function moodScoreFromTags(itemTags, moodTags) {
  if (!itemTags || itemTags.length === 0) return 0;
  const moodTagSet = new Set(moodTags);
  let score = 0;
  for (const t of itemTags) {
    if (moodTagSet.has(t)) score++;
  }
  return score;
}

// deps: { catalogs, getRating(id, tab), getStatus(id, tab),
//         getEnrichmentForItem(id), moodScore(item, tabId, mood) }
export function computeRecsForTab(tabIds, opts, deps) {
  const { catalogs, getRating, getStatus, getEnrichmentForItem, moodScore } = deps;
  // V5.32.0: optional `opts.timeBudget` filters recommended results by item runtime.
  // V5.33.0: optional `opts.mood` sorts recommended by reaction-tag overlap with the mood.
  opts = opts || {};
  const budget = opts.timeBudget || null;
  const mood = opts.mood || null;
  const tabSet = new Set(tabIds);

  // Sources: loved/liked items in the requested tabs that have enrichment.
  const sources = [];
  tabSet.forEach(tabId => {
    const cat = catalogs[tabId];
    if (!cat) return;
    cat.items.forEach(item => {
      const r = getRating(item.id, tabId);
      if (r !== 'loved' && r !== 'liked') return;
      const enrich = getEnrichmentForItem(item.id);
      if (!enrich) return;
      sources.push({
        srcId: item.id,
        srcTitle: item.title,
        srcTab: tabId,
        weight: r === 'loved' ? 2 : 1,
        enrich,
      });
    });
  });

  // tmdbId → [{ tabId, item }] across every loaded catalog (incl. promotions).
  const tmdbToCatalog = new Map();
  Object.keys(catalogs).forEach(tabId => {
    if (tabId === 'watchlist') return;
    catalogs[tabId].items.forEach(item => {
      const e = getEnrichmentForItem(item.id);
      if (!e || !e.tmdbId) return;
      const list = tmdbToCatalog.get(e.tmdbId) || [];
      list.push({ tabId, item });
      tmdbToCatalog.set(e.tmdbId, list);
    });
  });

  // Aggregate candidates: tmdbId → { tmdbId, title, year, type, score, sourceTitles }
  const candidates = new Map();
  let anyEnriched = false;
  sources.forEach(src => {
    const recs = src.enrich.recommendations || [];
    const sims = src.enrich.similar || [];
    if (recs.length || sims.length) anyEnriched = true;
    const seen = new Set();
    [...recs, ...sims].forEach(rec => {
      if (!rec || !rec.id) return;
      if (seen.has(rec.id)) return;
      seen.add(rec.id);
      if (src.enrich.tmdbId === rec.id) return;
      const ex = candidates.get(rec.id) || {
        tmdbId: rec.id,
        title: rec.title,
        year: rec.year,
        type: src.enrich.type,
        score: 0,
        sourceTitles: [],
      };
      ex.score += src.weight;
      if (ex.sourceTitles.length < 3) ex.sourceTitles.push(src.srcTitle);
      candidates.set(rec.id, ex);
    });
  });

  // Classify into Recommended (catalog match in selected tabs, untouched)
  // vs Discover (no catalog match anywhere).
  const recommended = [];
  const discover = [];
  candidates.forEach(c => {
    const matches = tmdbToCatalog.get(c.tmdbId) || [];
    let recHit = null;
    for (const m of matches) {
      if (!tabSet.has(m.tabId)) continue;
      const status = getStatus(m.item.id, m.tabId);
      const rating = getRating(m.item.id, m.tabId);
      // NOTE (preserved verbatim from app.js): app's getRating returns the
      // string 'none' for unrated items, which is truthy — so `|| rating` is
      // always true and this `continue` fires for EVERY match, meaning the
      // Recommended bucket can never be populated when the injected getRating
      // follows the app's contract. Suspected latent bug (probably meant
      // `rating !== 'none'`); kept as-is because this extraction must not
      // change behavior. Pinned by tests/recs.test.mjs.
      if (status !== 'none' || rating) continue;
      recHit = m;
      break;
    }
    if (recHit) {
      // V5.32.0: drop recommended items that don't fit the time budget
      if (!fitsTimeBudget(recHit.item, budget)) return;
      recommended.push({ ...c, catalogTab: recHit.tabId, catalogItemId: recHit.item.id });
    } else if (matches.length === 0) {
      discover.push(c);
    }
  });

  // V5.33.0: blend mood overlap into the score so mood-aligned recs surface first.
  // Mood scoring uses the matched catalog item's user-applied reactionTags.
  const moodWeight = mood && mood !== 'any' ? 5 : 0; // mood overlap counts ~5x a single rec match
  if (moodWeight > 0) {
    recommended.forEach(r => {
      // Find the matched catalog item to read its tags
      const matches = tmdbToCatalog.get(r.tmdbId) || [];
      const m = matches.find(mm => mm.tabId === r.catalogTab && mm.item.id === r.catalogItemId);
      if (m) r.score += moodWeight * moodScore(m.item, m.tabId, mood);
    });
  }
  const byScore = (a, b) => b.score - a.score || (a.title || '').localeCompare(b.title || '');
  recommended.sort(byScore);
  discover.sort(byScore);

  return {
    recommended: recommended.slice(0, 12),
    discover: discover.slice(0, 8),
    sourceCount: sources.length,
    anyEnriched,
  };
}
