// === Plex Discover / Universal Watchlist parsers + sync planner ===
//
// Pure parsing and planning helpers for the Plex Discover provider
// (discover.provider.plex.tv) and the Universal Watchlist. Shared by the
// Cloudflare Worker (which does the fetching) and the browser app (which
// applies the plan). No network, no storage, no Node APIs.
//
// Plex's JSON shapes vary by endpoint and by server version, so every parser
// here is defensive: unknown/missing containers yield empty results rather
// than throwing. `parseAvailability` additionally returns `_rawKeys` (the keys
// of `Metadata[0]`) so a `debug=1` probe can reveal the real availability
// field name if `Availability`/`Availabilities` turn out to be wrong.
//
// Golden cases: tests/fixtures/plex-discover-cases.json.
import { plexNormalizeKey } from './normalize.js';

// --- guids ---------------------------------------------------------------

// `tmdb://1234`, `imdb://tt0110912`, `tvdb://81189` (also accepted with the
// `com.plexapp.agents.` legacy prefixes stripped by the caller).
const GUID_RE = /^(tmdb|imdb|tvdb):\/\/([^/?#]+)/i;

function readGuid(str, out) {
  const m = GUID_RE.exec(String(str || '').trim());
  if (!m) return;
  const scheme = m[1].toLowerCase();
  const value = m[2];
  if (scheme === 'imdb') {
    if (out.imdb == null) out.imdb = value;
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  if (scheme === 'tmdb') { if (out.tmdb == null) out.tmdb = n; }
  else if (out.tvdb == null) out.tvdb = n;
}

// Collect external ids from `metadata.Guid[].id` and, when it uses one of the
// same schemes, the scalar `metadata.guid`.
export function parseGuids(metadata) {
  const out = { tmdb: null, imdb: null, tvdb: null };
  if (!metadata || typeof metadata !== 'object') return out;
  const list = Array.isArray(metadata.Guid) ? metadata.Guid : [];
  for (const g of list) {
    if (!g) continue;
    readGuid(typeof g === 'string' ? g : g.id, out);
  }
  if (typeof metadata.guid === 'string') readGuid(metadata.guid, out);
  return out;
}

// --- metadata items ------------------------------------------------------

function normType(raw) {
  const t = String(raw == null ? '' : raw).toLowerCase();
  if (t === 'movie') return 'movie';
  if (t === 'show' || t === 'tv' || t === 'series') return 'show';
  return t || null;
}

// One Plex Metadata node -> the compact shape the app stores/matches on.
export function itemFromMetadata(m) {
  if (!m || typeof m !== 'object') return null;
  const year = Number(m.year);
  const thumb = typeof m.thumb === 'string' && m.thumb ? m.thumb : null;
  return {
    ratingKey: m.ratingKey == null ? '' : String(m.ratingKey),
    title: m.title == null ? '' : String(m.title),
    year: Number.isFinite(year) && year > 0 ? year : null,
    type: normType(m.type),
    guids: parseGuids(m),
    thumb,
  };
}

function mapItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    const item = itemFromMetadata(m);
    if (item) out.push(item);
  }
  return out;
}

function container(json) {
  if (!json || typeof json !== 'object') return null;
  const mc = json.MediaContainer;
  if (mc && typeof mc === 'object') return mc;
  return json;
}

// --- search / watchlist --------------------------------------------------

// Tolerates the three shapes Plex Discover has been observed to return:
//   MediaContainer.SearchResults[].SearchResult[].Metadata
//   MediaContainer.SearchResult[].Metadata
//   MediaContainer.Metadata[]
export function parseSearch(json) {
  const mc = container(json);
  if (!mc) return [];
  const nodes = [];
  if (Array.isArray(mc.SearchResults)) {
    for (const group of mc.SearchResults) {
      const results = group && Array.isArray(group.SearchResult) ? group.SearchResult : [];
      for (const r of results) if (r && r.Metadata) nodes.push(r.Metadata);
    }
  }
  if (!nodes.length && Array.isArray(mc.SearchResult)) {
    for (const r of mc.SearchResult) if (r && r.Metadata) nodes.push(r.Metadata);
  }
  if (!nodes.length && Array.isArray(mc.Metadata)) {
    for (const m of mc.Metadata) nodes.push(m);
  }
  return mapItems(nodes);
}

// `/library/sections/watchlist/all` -> { items, totalSize }.
export function parseWatchlist(json) {
  const mc = container(json);
  const items = mc ? mapItems(mc.Metadata) : [];
  let total = mc ? Number(mc.totalSize) : NaN;
  if (!Number.isFinite(total)) total = mc ? Number(mc.size) : NaN;
  if (!Number.isFinite(total)) total = items.length;
  return { items, totalSize: total };
}

// --- availability --------------------------------------------------------

function httpsOrNull(url) {
  const s = typeof url === 'string' ? url.trim() : '';
  return /^https:\/\//i.test(s) ? s : null;
}

// `/library/metadata/<key>?includeAvailabilities=1` -> streaming offers.
// The real field name is unverified; we read both `Availability` and
// `Availabilities` and expose `_rawKeys` so a debug probe can identify it.
export function parseAvailability(json) {
  const mc = container(json);
  const first = mc && Array.isArray(mc.Metadata) ? mc.Metadata[0] : null;
  const rawKeys = first && typeof first === 'object' ? Object.keys(first) : [];
  let rows = null;
  if (first) {
    if (Array.isArray(first.Availability)) rows = first.Availability;
    else if (Array.isArray(first.Availabilities)) rows = first.Availabilities;
  }
  const availability = [];
  for (const r of rows || []) {
    if (!r || typeof r !== 'object') continue;
    availability.push({
      platform: r.platform == null ? '' : String(r.platform),
      title: r.title == null ? '' : String(r.title),
      url: httpsOrNull(r.url),
      offerType: r.offerType == null ? '' : String(r.offerType),
      country: r.country == null ? '' : String(r.country).toLowerCase(),
    });
  }
  return { availability, _rawKeys: rawKeys };
}

// --- hit selection -------------------------------------------------------

// Prefer an exact tmdb guid match; otherwise fall back to normalized
// title+year (exact year first, then ±1, matching lib/plex-match.js's fuzz).
export function pickBestSearchHit(hits, want, normalizeKey) {
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length) return null;
  const norm = typeof normalizeKey === 'function' ? normalizeKey : plexNormalizeKey;
  const { tmdbId = null, title = '', year = null, type = null } = want || {};

  if (tmdbId != null) {
    const n = Number(tmdbId);
    for (const h of list) {
      if (h && h.guids && Number(h.guids.tmdb) === n) return h;
    }
  }
  if (!title) return null;
  const wantType = type ? normType(type) : null;
  const typeOk = (h) => !wantType || !h.type || h.type === wantType;

  for (const dy of [0, -1, 1]) {
    const key = norm(title, year == null ? year : Number(year) + dy);
    if (!key) continue;
    for (const h of list) {
      if (!h || !typeOk(h)) continue;
      if (norm(h.title, h.year) === key) return h;
    }
  }
  return null;
}

// --- watchlist sync plan -------------------------------------------------

// Decide what to reconcile between the local queue and the remote Plex
// Universal Watchlist. The caller pre-matches remote items to catalog refs
// (`<tab>|<id>`) and supplies the current mirror of what this app pushed.
//
//   localQueued : [{ ref, tmdbId, title, year, type, status:'queued' }]
//   remote      : [{ ratingKey, title, year, type, guids,
//                    matchedRef?:string|null, matchedStatus?:string|null }]
//   mirror      : { "<ref>": { ratingKey, syncedAt, origin } }
//
// Returns { push, queueLocally, unqueueLocally, orphans, mirrorNext }.
// Remote-driven removal only un-queues items this app mirrored (i.e. pushed
// or adopted), so a title queued locally and never on Plex is pushed instead.
export function planWatchlistSync({ localQueued, remote, mirror, now } = {}) {
  const local = Array.isArray(localQueued) ? localQueued : [];
  const remoteList = Array.isArray(remote) ? remote : [];
  const mirrorPrev = mirror && typeof mirror === 'object' ? mirror : {};
  const at = Number.isFinite(now) ? now : Date.now();

  const push = [];
  const queueLocally = [];
  const unqueueLocally = [];
  const orphans = [];
  const mirrorNext = {};
  const matchedRefs = new Set();

  for (const r of remoteList) {
    if (!r) continue;
    const ref = r.matchedRef || null;
    if (!ref) { orphans.push(r); continue; }
    matchedRefs.add(ref);
    const status = r.matchedStatus == null ? 'none' : String(r.matchedStatus);
    const ratingKey = r.ratingKey == null ? '' : String(r.ratingKey);
    if (status === 'none') {
      queueLocally.push({ ref, ratingKey });
      mirrorNext[ref] = { ratingKey, syncedAt: at, origin: 'plex' };
    } else if (status === 'queued') {
      const origin = (mirrorPrev[ref] && mirrorPrev[ref].origin) || 'plex';
      mirrorNext[ref] = { ratingKey, syncedAt: at, origin };
    }
    // watched / watching / skip: leave the local state alone and drop the
    // mirror entry so a later remote removal never un-queues anything.
  }

  for (const item of local) {
    if (!item || !item.ref) continue;
    if (matchedRefs.has(item.ref)) continue;
    const mirrored = mirrorPrev[item.ref] && mirrorPrev[item.ref].ratingKey;
    if (mirrored) unqueueLocally.push(item.ref);
    else push.push(item.ref);
  }

  return { push, queueLocally, unqueueLocally, orphans, mirrorNext };
}
