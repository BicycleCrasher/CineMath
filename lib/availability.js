// === Availability snapshot + ranking ===
//
// TMDB's watch-provider map is large, all-regions and online-only. This module
// slims it into a per-item `avail` snapshot for the regions the user actually
// cares about (stored in the enrichment index, so filters, chips and the
// Tonight row work offline), and ranks the ways to watch a title
// deterministically.
//
// Ranking inputs: the snapshot, the user's region list (index 0 = home), the
// enabled provider ids, an optional Plex server hit, and optional Plex
// Discover rows carrying per-title deep URLs.
//
// Score table
// -----------------------------------------------------------------------
//   1000  on the user's own Plex server
//    900  home region, enabled subscription (flatrate)   (+50 with deep URL)
//    800  home region, enabled free/ads
//    600  enabled, another selected region (VPN)         (+50 with deep URL)
//          minus 10 per extra region, counted from the FIRST non-home region:
//          regions[1] = 600, regions[2] = 590, regions[3] = 580. Counting from
//          the absolute index instead would put every VPN option below the
//          playable threshold, which is not what the ladder is for.
//    400  home region, free/ads, not enabled
//    300  home region, flatrate, not enabled
//    250  another region, flatrate, not enabled
//    220  rent/buy on an enabled store
//    200  rent/buy
//    150  another region, free/ads, not enabled
// -----------------------------------------------------------------------
// `playable` is everything scoring >= 600 (i.e. the user can press play now,
// possibly behind a VPN); `elsewhere` is the rest. The 600-band deliberately
// also covers enabled free/ads in a non-home region, which the table above
// only spells out for flatrate.
//
// Golden cases: tests/fixtures/availability-cases.json.
import {
  PROVIDER_BY_ID,
  providerIdForTmdb,
  matchTmdbProvider,
  matchPlexPlatform,
  resolveEnabled,
  isEnabledTmdb,
  registryOrder,
} from './providers.js';

// TMDB tier keys, best-first.
export const TIERS = ['flatrate', 'free', 'ads', 'rent', 'buy'];

const PAID_TIERS = new Set(['rent', 'buy']);
const PLAYABLE_TIERS = ['flatrate', 'free', 'ads'];
export const PLAYABLE_SCORE = 600;

function isHttps(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url.trim());
}

function normRegions(regions) {
  const out = [];
  for (const r of Array.isArray(regions) ? regions : []) {
    const code = String(r || '').trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

function uniqueIds(list) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    const n = Number(p && typeof p === 'object' ? p.provider_id : p);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

// --- snapshot ------------------------------------------------------------

// TMDB `/watch/providers` results (either the raw `results` map or the whole
// `{results}` envelope) -> the stored snapshot, restricted to `regions`.
// Empty tiers are omitted; `link` is kept only when it is https.
export function snapshotFromTmdb(watchProviders, regions) {
  const list = normRegions(regions);
  const snap = { at: Date.now(), regions: list, byRegion: {} };
  if (!watchProviders || typeof watchProviders !== 'object') return snap;
  const map = watchProviders.results && typeof watchProviders.results === 'object'
    ? watchProviders.results
    : watchProviders;
  for (const region of list) {
    const src = map[region];
    if (!src || typeof src !== 'object') continue;
    const rec = {};
    for (const tier of TIERS) {
      const ids = uniqueIds(src[tier]);
      if (ids.length) rec[tier] = ids;
    }
    if (isHttps(src.link)) rec.link = src.link.trim();
    if (Object.keys(rec).length) snap.byRegion[region] = rec;
  }
  return snap;
}

// --- ranking -------------------------------------------------------------

function scoreFor({ tier, enabled, home, regionIndex, deepUrl }) {
  if (PAID_TIERS.has(tier)) return 200 + (enabled ? 20 : 0);
  const free = tier === 'free' || tier === 'ads';
  if (home) {
    if (enabled) {
      if (free) return 800;
      return 900 + (deepUrl ? 50 : 0);
    }
    return free ? 400 : 300;
  }
  const vpnStep = Math.max(0, regionIndex - 1);
  if (enabled) return PLAYABLE_SCORE - 10 * vpnStep + (!free && deepUrl ? 50 : 0);
  return free ? 150 : 250;
}

function offerTier(offerType) {
  switch (String(offerType || '').toLowerCase()) {
    case 'free': return 'free';
    case 'ads': return 'ads';
    case 'rent': return 'rent';
    case 'buy': return 'buy';
    case 'subscription':
    default: return 'flatrate';
  }
}

function liveName(liveNames, region, tmdbId) {
  const perRegion = liveNames && typeof liveNames === 'object' ? liveNames[region] : null;
  if (!perRegion || typeof perRegion !== 'object') return null;
  const v = perRegion[tmdbId] != null ? perRegion[tmdbId] : perRegion[String(tmdbId)];
  return v ? String(v) : null;
}

function lookupRegistry(registry, providerId) {
  if (!providerId) return null;
  if (registry && typeof registry.get === 'function') return registry.get(providerId) || null;
  if (registry && typeof registry === 'object') return registry[providerId] || null;
  return null;
}

// Rank every way to watch one title. Returns
// { best, playable, elsewhere, byRegion }.
export function rankAvailability({
  avail,
  regions,
  subIds,
  registry = PROVIDER_BY_ID,
  plexServer = null,
  plexDiscover = null,
  liveNames = null,
} = {}) {
  const regionList = normRegions(regions);
  const enabled = resolveEnabled(subIds);
  const byRegion = avail && avail.byRegion && typeof avail.byRegion === 'object' ? avail.byRegion : {};
  const entries = [];

  if (plexServer && plexServer.ratingKey) {
    entries.push({
      providerId: 'plex-server',
      tmdbId: null,
      name: 'Plex',
      region: regionList[0] || null,
      tier: 'plex',
      source: 'plex-server',
      deepUrl: null,
      logoPath: null,
      score: 1000,
      home: true,
    });
  }

  regionList.forEach((region, regionIndex) => {
    const rec = byRegion[region];
    if (!rec || typeof rec !== 'object') return;
    const home = regionIndex === 0;
    for (const tier of TIERS) {
      for (const tmdbId of uniqueIds(rec[tier])) {
        const providerId = providerIdForTmdb({ provider_id: tmdbId });
        if (!providerId) continue;
        const regEntry = lookupRegistry(registry, providerId) || matchTmdbProvider({ provider_id: tmdbId });
        const name = liveName(liveNames, region, tmdbId)
          || (regEntry && regEntry.name)
          || `tmdb:${tmdbId}`;
        const isOn = isEnabledTmdb({ provider_id: tmdbId, provider_name: name }, enabled);
        entries.push({
          providerId,
          tmdbId,
          name,
          region,
          tier,
          source: 'tmdb',
          deepUrl: null,
          logoPath: (regEntry && regEntry.logoPath) || null,
          score: scoreFor({ tier, enabled: isOn, home, regionIndex, deepUrl: null }),
          home,
        });
      }
    }
  });

  // Plex Discover rows carry per-title deep URLs. Attach one to the matching
  // TMDB entry when we already have it, otherwise contribute a new entry.
  const discoverRows = plexDiscover && Array.isArray(plexDiscover.availability)
    ? plexDiscover.availability
    : [];
  for (const row of discoverRows) {
    if (!row) continue;
    const country = String(row.country || '').toLowerCase();
    const regionIndex = regionList.findIndex(r => r.toLowerCase() === country);
    if (regionIndex === -1) continue;
    const region = regionList[regionIndex];
    const regEntry = matchPlexPlatform(row.platform);
    if (!regEntry) continue;
    const deepUrl = isHttps(row.url) ? row.url.trim() : null;
    const tier = offerTier(row.offerType);
    const home = regionIndex === 0;

    const existing = entries.filter(e => e.providerId === regEntry.id && e.region === region && e.source === 'tmdb');
    const target = existing.find(e => e.tier === tier) || existing[0];
    if (target) {
      if (deepUrl && !target.deepUrl) {
        target.deepUrl = deepUrl;
        const isOn = isEnabledTmdb({ provider_id: target.tmdbId, provider_name: target.name }, enabled);
        target.score = scoreFor({
          tier: target.tier,
          enabled: isOn,
          home: target.home,
          regionIndex,
          deepUrl,
        });
      }
      continue;
    }
    const tmdbId = (regEntry.tmdbIds && regEntry.tmdbIds[0]) != null ? regEntry.tmdbIds[0] : null;
    const isOn = enabled.curated.has(regEntry.id)
      || isEnabledTmdb({ provider_id: tmdbId, provider_name: regEntry.name }, enabled);
    entries.push({
      providerId: regEntry.id,
      tmdbId,
      name: regEntry.name,
      region,
      tier,
      source: 'plex-discover',
      deepUrl,
      logoPath: regEntry.logoPath || null,
      score: scoreFor({ tier, enabled: isOn, home, regionIndex, deepUrl }),
      home,
    });
  }

  // Dedupe providerId+region+tier, keeping the best-scoring row.
  const bestByKey = new Map();
  for (const e of entries) {
    const key = `${e.providerId}|${e.region}|${e.tier}`;
    const prev = bestByKey.get(key);
    if (!prev || e.score > prev.score) bestByKey.set(key, e);
  }

  const ranked = Array.from(bestByKey.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const r = registryOrder(a.providerId) - registryOrder(b.providerId);
    if (r) return r;
    return String(a.name).localeCompare(String(b.name));
  });

  const playable = ranked.filter(e => e.score >= PLAYABLE_SCORE);
  const elsewhere = ranked.filter(e => e.score < PLAYABLE_SCORE);
  const grouped = {};
  for (const e of ranked) {
    if (!e.region) continue;
    (grouped[e.region] || (grouped[e.region] = [])).push(e);
  }
  return { best: playable[0] || null, playable, elsewhere, byRegion: grouped };
}

// --- derived helpers -----------------------------------------------------

// True when any selected region streams this title (flatrate/free/ads) on a
// provider the user has enabled. Cheap enough for filter predicates.
export function isPlayableOnMyServices(avail, regions, subIds) {
  const enabled = resolveEnabled(subIds);
  const byRegion = avail && avail.byRegion ? avail.byRegion : null;
  if (!byRegion) return false;
  for (const region of normRegions(regions)) {
    const rec = byRegion[region];
    if (!rec) continue;
    for (const tier of PLAYABLE_TIERS) {
      for (const tmdbId of uniqueIds(rec[tier])) {
        if (isEnabledTmdb({ provider_id: tmdbId }, enabled)) return true;
      }
    }
  }
  return false;
}

// Small card badges: the user's own services carrying this title, home region
// first, deduped by provider, capped at `max`.
export function providerChips(avail, regions, subIds, max = 3) {
  const enabled = resolveEnabled(subIds);
  const byRegion = avail && avail.byRegion ? avail.byRegion : null;
  const out = [];
  if (!byRegion) return out;
  const seen = new Set();
  const regionList = normRegions(regions);
  for (let i = 0; i < regionList.length; i++) {
    const region = regionList[i];
    const rec = byRegion[region];
    if (!rec) continue;
    for (const tier of PLAYABLE_TIERS) {
      for (const tmdbId of uniqueIds(rec[tier])) {
        if (!isEnabledTmdb({ provider_id: tmdbId }, enabled)) continue;
        const providerId = providerIdForTmdb({ provider_id: tmdbId });
        if (!providerId || seen.has(providerId)) continue;
        seen.add(providerId);
        const regEntry = PROVIDER_BY_ID.get(providerId);
        out.push({
          providerId,
          tmdbId,
          name: (regEntry && regEntry.name) || `tmdb:${tmdbId}`,
          region,
          home: i === 0,
        });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

// Tonight row order: most playable first, then most recently touched, then
// title. Pure — returns a new array.
export function rankTonight(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  const score = (it) => {
    const s = it && it.ranked && it.ranked.best ? Number(it.ranked.best.score) : 0;
    return Number.isFinite(s) ? s : 0;
  };
  return list.sort((a, b) => {
    const d = score(b) - score(a);
    if (d) return d;
    const u = (Number(b && b.lastUpdated) || 0) - (Number(a && a.lastUpdated) || 0);
    if (u) return u;
    return String((a && a.title) || '').localeCompare(String((b && b.title) || ''));
  });
}

function playableIdSet(snapshot, region) {
  const rec = snapshot && snapshot.byRegion ? snapshot.byRegion[region] : null;
  const set = new Set();
  if (!rec) return set;
  for (const tier of PLAYABLE_TIERS) for (const id of uniqueIds(rec[tier])) set.add(id);
  return set;
}

// What changed on the user's own services between two snapshots. Only
// streaming tiers count (rent/buy churn is noise), and only providers the
// user enabled. A missing `prev` means "first run" — no diff.
export function diffSnapshots(prev, next, subIds) {
  const arrived = [];
  const left = [];
  if (!prev || !next) return { arrived, left };
  const enabled = resolveEnabled(subIds);
  const regions = [];
  for (const r of Object.keys((next && next.byRegion) || {})) regions.push(r);
  for (const r of Object.keys((prev && prev.byRegion) || {})) if (!regions.includes(r)) regions.push(r);
  for (const region of regions) {
    const before = playableIdSet(prev, region);
    const after = playableIdSet(next, region);
    const gained = Array.from(after).filter(id => !before.has(id)).sort((a, b) => a - b);
    const lost = Array.from(before).filter(id => !after.has(id)).sort((a, b) => a - b);
    for (const tmdbId of gained) {
      if (isEnabledTmdb({ provider_id: tmdbId }, enabled)) arrived.push({ region, tmdbId });
    }
    for (const tmdbId of lost) {
      if (isEnabledTmdb({ provider_id: tmdbId }, enabled)) left.push({ region, tmdbId });
    }
  }
  return { arrived, left };
}
