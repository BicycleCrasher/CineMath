// === Streaming provider registry ===
//
// One curated table for every platform the app knows how to talk about:
// TMDB provider ids and name aliases (TMDB splits ad-supported tiers into
// separate providers), Plex Discover platform slugs, Android TV + mobile
// package names for intent launching, and web search/home URLs.
//
// Provider ids are curated slugs (`netflix`, `prime`, …). Anything TMDB
// reports that isn't curated survives as `tmdb:<provider_id>` so a
// region-specific service can still be enabled and matched.
//
// `verify: true` marks entries whose TMDB ids and/or Android package names are
// best-effort and want confirmation against the live `/providers?region=US`
// list and an on-device launch check.
//
// Golden cases: tests/fixtures/providers-cases.json.

// Display grouping order; also the tie-break order in providersForRegion().
export const KIND_ORDER = ['subscription', 'free', 'addon', 'store'];

export const PROVIDERS = [
  {
    id: 'netflix',
    name: 'Netflix',
    kind: 'subscription',
    tmdbIds: [8, 1796],
    tmdbNames: ['Netflix', 'Netflix with Ads', 'Netflix basic with Ads'],
    legacyNames: ['Netflix'],
    plexPlatforms: ['netflix'],
    regions: 'global',
    android: { tv: 'com.netflix.ninja', mobile: 'com.netflix.mediaclient' },
    web: { search: 'https://www.netflix.com/search?q={q}', home: 'https://www.netflix.com' },
    verify: true,
  },
  {
    id: 'prime',
    name: 'Amazon Prime Video',
    kind: 'subscription',
    tmdbIds: [9, 119],
    storeTmdbIds: [10],
    tmdbNames: ['Amazon Prime Video', 'Amazon Prime Video with Ads', 'Amazon Video'],
    legacyNames: ['Amazon Prime Video'],
    plexPlatforms: ['amazon', 'primevideo', 'amazon-prime-video'],
    regions: 'global',
    android: { tv: 'com.amazon.amazonvideo.livingroom', mobile: 'com.amazon.avod.thirdpartyclient' },
    web: { search: 'https://www.amazon.com/s?k={q}&i=instant-video', home: 'https://www.primevideo.com' },
    verify: true,
  },
  {
    id: 'disney',
    name: 'Disney+',
    kind: 'subscription',
    tmdbIds: [337],
    tmdbNames: ['Disney Plus', 'Disney+'],
    legacyNames: ['Disney+'],
    plexPlatforms: ['disney', 'disneyplus', 'disney-plus'],
    regions: 'global',
    android: { tv: 'com.disney.disneyplus', mobile: 'com.disney.disneyplus' },
    web: { search: 'https://www.disneyplus.com/search?q={q}', home: 'https://www.disneyplus.com' },
    verify: true,
  },
  {
    id: 'max',
    name: 'Max',
    kind: 'subscription',
    tmdbIds: [1899, 384],
    tmdbNames: ['Max', 'HBO Max'],
    legacyNames: ['Max', 'HBO Max'],
    plexPlatforms: ['max', 'hbomax', 'hbo-max'],
    regions: 'global',
    android: { tv: 'com.wbd.stream', mobile: 'com.wbd.stream' },
    web: { search: 'https://play.max.com/search?q={q}', home: 'https://play.max.com' },
    verify: true,
  },
  {
    id: 'hulu',
    name: 'Hulu',
    kind: 'subscription',
    tmdbIds: [15],
    tmdbNames: ['Hulu'],
    legacyNames: ['Hulu'],
    plexPlatforms: ['hulu'],
    regions: ['US'],
    android: { tv: 'com.hulu.livingroomplus', mobile: 'com.hulu.plus' },
    web: { search: 'https://www.hulu.com/search?q={q}', home: 'https://www.hulu.com' },
    verify: true,
  },
  {
    id: 'appletv',
    name: 'Apple TV+',
    kind: 'subscription',
    tmdbIds: [350],
    tmdbNames: ['Apple TV Plus', 'Apple TV+'],
    legacyNames: ['Apple TV+'],
    plexPlatforms: ['appletv', 'appletvplus', 'apple-tv-plus'],
    regions: 'global',
    android: { tv: 'com.apple.atve.androidtv.appletv', mobile: 'com.apple.atve.android.appletv' },
    web: { search: 'https://tv.apple.com/search?term={q}', home: 'https://tv.apple.com' },
    verify: true,
  },
  {
    id: 'appletv-store',
    name: 'Apple TV (rent/buy)',
    kind: 'store',
    tmdbIds: [2],
    tmdbNames: ['Apple TV'],
    legacyNames: [],
    plexPlatforms: ['itunes', 'apple-tv'],
    regions: 'global',
    android: { tv: 'com.apple.atve.androidtv.appletv', mobile: 'com.apple.atve.android.appletv' },
    web: { search: 'https://tv.apple.com/search?term={q}', home: 'https://tv.apple.com' },
    verify: true,
  },
  {
    id: 'paramount',
    name: 'Paramount+',
    kind: 'subscription',
    tmdbIds: [531, 1770],
    tmdbNames: ['Paramount Plus', 'Paramount+', 'Paramount Plus with Showtime', 'Paramount+ with Showtime'],
    legacyNames: ['Paramount+'],
    plexPlatforms: ['paramount', 'paramountplus', 'paramount-plus'],
    regions: 'global',
    android: { tv: 'com.cbs.ott', mobile: 'com.cbs.app' },
    web: { search: 'https://www.paramountplus.com/search/{q}', home: 'https://www.paramountplus.com' },
    verify: true,
  },
  {
    id: 'peacock',
    name: 'Peacock',
    kind: 'subscription',
    tmdbIds: [386, 387],
    tmdbNames: ['Peacock', 'Peacock Premium', 'Peacock Premium Plus'],
    legacyNames: ['Peacock'],
    plexPlatforms: ['peacock'],
    regions: ['US'],
    android: { tv: 'com.peacocktv.peacockandroid', mobile: 'com.peacocktv.peacockandroid' },
    web: { search: 'https://www.peacocktv.com/search?q={q}', home: 'https://www.peacocktv.com' },
    verify: true,
  },
  {
    id: 'criterion',
    name: 'Criterion Channel',
    kind: 'subscription',
    tmdbIds: [258],
    tmdbNames: ['Criterion Channel'],
    legacyNames: ['Criterion Channel'],
    plexPlatforms: ['criterion', 'criterionchannel'],
    regions: ['US', 'CA'],
    android: { tv: 'com.criterionchannel', mobile: 'com.criterionchannel' },
    web: { search: 'https://www.criterionchannel.com/search?q={q}', home: 'https://www.criterionchannel.com' },
    verify: true,
  },
  {
    id: 'mubi',
    name: 'Mubi',
    kind: 'subscription',
    tmdbIds: [11],
    tmdbNames: ['Mubi', 'MUBI'],
    legacyNames: ['Mubi'],
    plexPlatforms: ['mubi'],
    regions: 'global',
    android: { tv: 'com.mubi', mobile: 'com.mubi' },
    web: { search: 'https://mubi.com/search/films?query={q}', home: 'https://mubi.com' },
    verify: true,
  },
  {
    id: 'tubi',
    name: 'Tubi',
    kind: 'free',
    tmdbIds: [73],
    tmdbNames: ['Tubi TV', 'Tubi'],
    legacyNames: [],
    plexPlatforms: ['tubi', 'tubitv'],
    regions: ['US', 'CA', 'GB', 'AU', 'MX'],
    android: { tv: 'com.tubitv', mobile: 'com.tubitv' },
    web: { search: 'https://tubitv.com/search/{q}', home: 'https://tubitv.com' },
    verify: true,
  },
  {
    id: 'pluto',
    name: 'Pluto TV',
    kind: 'free',
    tmdbIds: [300],
    tmdbNames: ['Pluto TV'],
    legacyNames: [],
    plexPlatforms: ['pluto', 'plutotv'],
    regions: 'global',
    android: { tv: 'tv.pluto.android', mobile: 'tv.pluto.android' },
    web: { home: 'https://pluto.tv/on-demand' },
    verify: true,
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    kind: 'subscription',
    tmdbIds: [283],
    tmdbNames: ['Crunchyroll'],
    legacyNames: ['Crunchyroll'],
    plexPlatforms: ['crunchyroll'],
    regions: 'global',
    android: { tv: 'com.crunchyroll.crunchyroid', mobile: 'com.crunchyroll.crunchyroid' },
    web: { search: 'https://www.crunchyroll.com/search?q={q}', home: 'https://www.crunchyroll.com' },
    verify: true,
  },
  {
    id: 'kanopy',
    name: 'Kanopy',
    kind: 'free',
    tmdbIds: [191],
    tmdbNames: ['Kanopy'],
    legacyNames: [],
    plexPlatforms: ['kanopy'],
    regions: ['US', 'CA', 'GB', 'AU', 'NZ'],
    android: { tv: 'com.kanopy', mobile: 'com.kanopy' },
    web: { search: 'https://www.kanopy.com/en/search?query={q}', home: 'https://www.kanopy.com' },
    verify: true,
  },
  {
    id: 'hoopla',
    name: 'Hoopla',
    kind: 'free',
    tmdbIds: [212],
    tmdbNames: ['Hoopla'],
    legacyNames: [],
    plexPlatforms: ['hoopla'],
    regions: ['US', 'CA'],
    android: { tv: 'com.hoopladigital.android', mobile: 'com.hoopladigital.android' },
    web: { search: 'https://www.hoopladigital.com/search?q={q}&type=video', home: 'https://www.hoopladigital.com' },
    verify: true,
  },
  {
    id: 'shudder',
    name: 'Shudder',
    kind: 'subscription',
    tmdbIds: [99],
    tmdbNames: ['Shudder'],
    legacyNames: ['Shudder'],
    plexPlatforms: ['shudder'],
    regions: ['US', 'CA', 'GB', 'IE', 'AU', 'NZ'],
    web: { search: 'https://www.shudder.com/search?q={q}', home: 'https://www.shudder.com' },
    verify: true,
  },
  {
    id: 'amc',
    name: 'AMC+',
    kind: 'subscription',
    tmdbIds: [526],
    tmdbNames: ['AMC+', 'AMC Plus'],
    legacyNames: ['AMC+'],
    plexPlatforms: ['amcplus', 'amc-plus', 'amc'],
    regions: ['US', 'CA'],
    web: { search: 'https://www.amcplus.com/search?q={q}', home: 'https://www.amcplus.com' },
    verify: true,
  },
  {
    id: 'britbox',
    name: 'BritBox',
    kind: 'subscription',
    tmdbIds: [151],
    tmdbNames: ['BritBox'],
    legacyNames: ['BritBox'],
    plexPlatforms: ['britbox'],
    regions: ['US', 'CA', 'AU', 'ZA'],
    android: { tv: 'com.britbox.us', mobile: 'com.britbox.us' },
    web: { search: 'https://www.britbox.com/us/search?q={q}', home: 'https://www.britbox.com' },
    verify: true,
  },
  {
    id: 'acorn',
    name: 'Acorn TV',
    kind: 'subscription',
    tmdbIds: [87],
    tmdbNames: ['Acorn TV'],
    legacyNames: ['Acorn TV'],
    plexPlatforms: ['acorn', 'acorntv'],
    regions: ['US', 'CA', 'GB', 'AU', 'NZ'],
    android: { tv: 'com.acorn.tv', mobile: 'com.acorn.tv' },
    web: { search: 'https://acorn.tv/search/{q}', home: 'https://acorn.tv' },
    verify: true,
  },
  {
    id: 'starz',
    name: 'Starz',
    kind: 'subscription',
    tmdbIds: [43],
    tmdbNames: ['Starz'],
    legacyNames: ['Starz'],
    plexPlatforms: ['starz'],
    regions: ['US'],
    android: {
      tv: 'com.bydeluxe.d3.android.program.starz',
      mobile: 'com.bydeluxe.d3.android.program.starz',
    },
    web: { search: 'https://www.starz.com/us/en/search?q={q}', home: 'https://www.starz.com' },
    verify: true,
  },
  {
    id: 'plex',
    name: 'Plex (free)',
    kind: 'free',
    tmdbIds: [538],
    tmdbNames: ['Plex'],
    legacyNames: [],
    plexPlatforms: ['plex'],
    regions: 'global',
    android: { tv: 'com.plexapp.android', mobile: 'com.plexapp.android' },
    web: { home: 'https://watch.plex.tv' },
    verify: true,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    kind: 'store',
    tmdbIds: [192],
    tmdbNames: ['YouTube'],
    legacyNames: ['YouTube'],
    plexPlatforms: ['youtube'],
    regions: 'global',
    android: { tv: 'com.google.android.youtube.tv', mobile: 'com.google.android.youtube' },
    web: { search: 'https://www.youtube.com/results?search_query={q}', home: 'https://www.youtube.com' },
    verify: true,
  },
  {
    id: 'googleplay',
    name: 'Google TV (Play Movies)',
    kind: 'store',
    tmdbIds: [3],
    tmdbNames: ['Google Play Movies', 'Google TV'],
    legacyNames: ['Google Play Movies'],
    plexPlatforms: ['googleplay', 'google-play', 'googletv'],
    regions: 'global',
    android: { tv: 'com.google.android.videos', mobile: 'com.google.android.videos' },
    web: { search: 'https://play.google.com/store/search?q={q}&c=movies', home: 'https://play.google.com/store/movies' },
    verify: true,
  },
  {
    id: 'fandango',
    name: 'Fandango at Home (Vudu)',
    kind: 'store',
    tmdbIds: [7],
    tmdbNames: ['Vudu', 'Fandango At Home', 'Fandango at Home'],
    legacyNames: ['Vudu'],
    plexPlatforms: ['vudu', 'fandango'],
    regions: ['US'],
    android: { mobile: 'air.com.vudu.air.DownloaderTablet' },
    web: { search: 'https://www.vudu.com/content/movies/search?searchString={q}', home: 'https://www.vudu.com' },
    verify: true,
  },
  {
    id: 'mgm',
    name: 'MGM+',
    kind: 'subscription',
    tmdbIds: [34],
    tmdbNames: ['MGM Plus', 'MGM+'],
    legacyNames: [],
    plexPlatforms: ['mgmplus', 'mgm-plus', 'epix'],
    regions: ['US'],
    web: { home: 'https://www.mgmplus.com' },
    verify: true,
  },
  {
    id: 'discovery',
    name: 'Discovery+',
    kind: 'subscription',
    tmdbIds: [520],
    tmdbNames: ['Discovery Plus', 'Discovery+'],
    legacyNames: [],
    plexPlatforms: ['discoveryplus', 'discovery-plus'],
    regions: 'global',
    android: { mobile: 'com.discovery.discoveryplus' },
    web: { home: 'https://www.discoveryplus.com' },
    verify: true,
  },
  {
    id: 'iplayer',
    name: 'BBC iPlayer',
    kind: 'free',
    tmdbIds: [38],
    tmdbNames: ['BBC iPlayer'],
    legacyNames: ['BBC iPlayer'],
    plexPlatforms: ['bbc-iplayer', 'iplayer', 'bbciplayer'],
    regions: ['GB'],
    android: { mobile: 'uk.co.bbc.iplayer' },
    web: { search: 'https://www.bbc.co.uk/iplayer/search?q={q}', home: 'https://www.bbc.co.uk/iplayer' },
    verify: true,
  },
  {
    id: 'crave',
    name: 'Crave',
    kind: 'subscription',
    tmdbIds: [230],
    tmdbNames: ['Crave'],
    legacyNames: [],
    plexPlatforms: ['crave'],
    regions: ['CA'],
    android: { tv: 'ca.bellmedia.cravetv', mobile: 'ca.bellmedia.cravetv' },
    web: { home: 'https://www.crave.ca' },
    verify: true,
  },
  {
    id: 'stan',
    name: 'Stan',
    kind: 'subscription',
    tmdbIds: [21],
    tmdbNames: ['Stan'],
    legacyNames: [],
    plexPlatforms: ['stan'],
    regions: ['AU'],
    android: { tv: 'au.com.stan.and', mobile: 'au.com.stan.and' },
    web: { home: 'https://www.stan.com.au' },
    verify: true,
  },
  {
    id: 'pbs-masterpiece',
    name: 'PBS Masterpiece (via Prime)',
    kind: 'addon',
    tmdbIds: [],
    tmdbNames: ['PBS Masterpiece Amazon Channel', 'PBS Masterpiece'],
    legacyNames: ['PBS Masterpiece (via Prime)'],
    plexPlatforms: [],
    regions: ['US'],
    web: {
      search: 'https://www.amazon.com/s?k={q}+pbs+masterpiece&i=instant-video',
      home: 'https://www.pbs.org/show/masterpiece/',
    },
  },
  {
    id: 'nt-at-home',
    name: 'National Theatre at Home',
    kind: 'subscription',
    tmdbIds: [],
    tmdbNames: ['National Theatre at Home'],
    legacyNames: ['National Theatre at Home'],
    plexPlatforms: [],
    regions: 'global',
    web: { search: 'https://www.ntathome.com/search/{q}', home: 'https://www.ntathome.com' },
  },
  {
    id: 'dropout',
    name: 'Dropout',
    kind: 'subscription',
    tmdbIds: [],
    tmdbNames: ['Dropout', 'Dropout TV'],
    legacyNames: ['Dropout'],
    plexPlatforms: [],
    regions: 'global',
    web: { search: 'https://www.dropout.tv/search?q={q}', home: 'https://www.dropout.tv' },
  },
  {
    id: '2ndtry',
    name: '2nd Try',
    kind: 'subscription',
    tmdbIds: [],
    tmdbNames: ['2nd Try', 'Second Try'],
    legacyNames: ['2nd Try'],
    plexPlatforms: [],
    regions: 'global',
    web: { search: 'https://www.youtube.com/@2ndTry/search?query={q}', home: 'https://www.youtube.com/@2ndTry' },
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map(p => [p.id, p]));

// Migrated form of the old hardcoded DEFAULT_MY_SUBS name list.
export const DEFAULT_SUB_IDS = [
  'hulu', 'disney', 'max', 'prime', 'appletv', 'paramount',
  'pbs-masterpiece', 'nt-at-home', 'dropout', '2ndtry',
];

// --- internal indexes ----------------------------------------------------

const REGISTRY_INDEX = new Map(PROVIDERS.map((p, i) => [p.id, i]));

function allTmdbIds(entry) {
  const ids = Array.isArray(entry.tmdbIds) ? entry.tmdbIds.slice() : [];
  if (Array.isArray(entry.storeTmdbIds)) {
    for (const id of entry.storeTmdbIds) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

const TMDB_ID_INDEX = new Map();
for (const entry of PROVIDERS) {
  for (const id of allTmdbIds(entry)) {
    if (!TMDB_ID_INDEX.has(id)) TMDB_ID_INDEX.set(id, entry);
  }
}

// TMDB names differ from ours by tier suffixes and punctuation:
// "Netflix basic with Ads", "Paramount+ with Showtime", "Disney Plus".
function normalizeName(name) {
  let t = String(name == null ? '' : name).toLowerCase();
  t = t.replace(/\bwith ads\b/g, ' ');
  t = t.replace(/\bamazon channel\b/g, ' ');
  t = t.replace(/\bpremium\b/g, ' ');
  t = t.replace(/\bplus\b/g, ' ');
  t = t.replace(/\+/g, ' ');
  t = t.replace(/[^a-z0-9]+/g, '');
  return t;
}

const EXACT_NAME_INDEX = new Map();
const NORM_NAME_INDEX = new Map();
for (const entry of PROVIDERS) {
  const names = [entry.name].concat(entry.tmdbNames || []);
  for (const n of names) {
    const exact = String(n).toLowerCase();
    if (!EXACT_NAME_INDEX.has(exact)) EXACT_NAME_INDEX.set(exact, entry);
    const norm = normalizeName(n);
    if (norm && !NORM_NAME_INDEX.has(norm)) NORM_NAME_INDEX.set(norm, entry);
  }
}

// Plex Discover platform slugs are lowercase-ish with separators and a
// trailing "plus" that our slugs drop: "hbo-max", "paramountplus", "amc_plus".
function normalizePlatform(slug) {
  return String(slug == null ? '' : slug)
    .toLowerCase()
    .replace(/[-_\s]+/g, '')
    .replace(/plus/g, '');
}

const PLATFORM_INDEX = new Map();
for (const entry of PROVIDERS) {
  for (const slug of entry.plexPlatforms || []) {
    const key = normalizePlatform(slug);
    if (key && !PLATFORM_INDEX.has(key)) PLATFORM_INDEX.set(key, entry);
  }
}

// --- lookups -------------------------------------------------------------

// TMDB provider -> registry entry, or null. id match, then an exact
// (case-insensitive) alias, then a normalized alias.
export function matchTmdbProvider(p) {
  if (p == null) return null;
  const raw = typeof p === 'number' || typeof p === 'string' ? { provider_id: p } : p;
  const id = raw.provider_id;
  if (id != null && id !== '') {
    const n = Number(id);
    if (Number.isFinite(n) && TMDB_ID_INDEX.has(n)) return TMDB_ID_INDEX.get(n);
  }
  const name = raw.provider_name;
  if (name) {
    const exact = EXACT_NAME_INDEX.get(String(name).toLowerCase());
    if (exact) return exact;
    const norm = NORM_NAME_INDEX.get(normalizeName(name));
    if (norm) return norm;
  }
  return null;
}

// Curated slug when we know the provider, else `tmdb:<id>`, else null.
export function providerIdForTmdb(p) {
  const entry = matchTmdbProvider(p);
  if (entry) return entry.id;
  const raw = typeof p === 'number' || typeof p === 'string' ? { provider_id: p } : (p || {});
  const n = Number(raw.provider_id);
  if (Number.isFinite(n) && raw.provider_id !== null && raw.provider_id !== '') return `tmdb:${n}`;
  return null;
}

// Plex Discover platform slug -> registry entry, or null.
export function matchPlexPlatform(slug) {
  const key = normalizePlatform(slug);
  if (!key) return null;
  return PLATFORM_INDEX.get(key) || null;
}

// Expand the user's saved provider ids into the sets the availability engine
// needs: curated slugs, every TMDB numeric id they cover (store tiers
// included), and lowercased names for TMDB rows that carry no usable id.
export function resolveEnabled(subIds) {
  const curated = new Set();
  const tmdbIds = new Set();
  const names = new Set();
  for (const raw of Array.isArray(subIds) ? subIds : []) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id) continue;
    const m = /^tmdb:(\d+)$/.exec(id);
    if (m) { tmdbIds.add(Number(m[1])); continue; }
    const entry = PROVIDER_BY_ID.get(id);
    if (!entry) continue;
    curated.add(entry.id);
    for (const n of allTmdbIds(entry)) tmdbIds.add(n);
    names.add(entry.name.toLowerCase());
    for (const n of entry.tmdbNames || []) names.add(String(n).toLowerCase());
  }
  return { curated, tmdbIds, names };
}

// Is this TMDB provider (numeric id, or {provider_id, provider_name}) one the
// user enabled? Numeric id first, then the lowercased name.
export function isEnabledTmdb(p, enabled) {
  if (p == null || !enabled) return false;
  const raw = typeof p === 'number' || typeof p === 'string' ? { provider_id: p } : p;
  const n = Number(raw.provider_id);
  if (Number.isFinite(n) && enabled.tmdbIds && enabled.tmdbIds.has(n)) return true;
  const name = raw.provider_name;
  if (name && enabled.names && enabled.names.has(String(name).toLowerCase())) return true;
  return false;
}

// --- region listing ------------------------------------------------------

const NO_PRIORITY = 999;

function isCuratedInRegion(entry, region) {
  if (entry.regions === 'global') return true;
  return Array.isArray(entry.regions) && entry.regions.includes(region);
}

// Curated entries available in `region`, merged with TMDB's live list for
// that region. Live rows that match a curated entry are collapsed into it
// (contributing the logo and the best display_priority); a live row we don't
// curate becomes an uncurated `tmdb:<id>` row. Live data wins over the
// curated `regions` hint, so a curated service TMDB reports in this region is
// listed even when our table didn't expect it there.
//
// Sorted: enabled first, then kind (subscription, free, addon, store), then
// TMDB display_priority, then name.
export function providersForRegion(region, liveList, subIds) {
  const reg = String(region || '').toUpperCase();
  const enabled = resolveEnabled(subIds);
  const byId = new Map();
  const order = [];

  const addCurated = (entry) => {
    if (byId.has(entry.id)) return byId.get(entry.id);
    const row = {
      id: entry.id,
      name: entry.name,
      logoPath: null,
      tmdbIds: allTmdbIds(entry),
      kind: entry.kind,
      enabled: enabled.curated.has(entry.id),
      curated: true,
      priority: NO_PRIORITY,
    };
    byId.set(entry.id, row);
    order.push(row);
    return row;
  };

  for (const entry of PROVIDERS) {
    if (isCuratedInRegion(entry, reg)) addCurated(entry);
  }

  for (const live of Array.isArray(liveList) ? liveList : []) {
    if (!live) continue;
    const tmdbId = Number(live.provider_id);
    const priority = Number(live.display_priority);
    const entry = matchTmdbProvider(live);
    if (entry) {
      const row = addCurated(entry);
      if (!row.logoPath && live.logo_path) row.logoPath = live.logo_path;
      if (Number.isFinite(priority) && priority < row.priority) row.priority = priority;
      continue;
    }
    if (!Number.isFinite(tmdbId)) continue;
    const id = `tmdb:${tmdbId}`;
    if (byId.has(id)) {
      const row = byId.get(id);
      if (!row.logoPath && live.logo_path) row.logoPath = live.logo_path;
      if (Number.isFinite(priority) && priority < row.priority) row.priority = priority;
      continue;
    }
    const row = {
      id,
      name: live.provider_name == null ? id : String(live.provider_name),
      logoPath: live.logo_path || null,
      tmdbIds: [tmdbId],
      kind: 'subscription',
      enabled: enabled.tmdbIds.has(tmdbId)
        || (live.provider_name ? enabled.names.has(String(live.provider_name).toLowerCase()) : false),
      curated: false,
      priority: Number.isFinite(priority) ? priority : NO_PRIORITY,
    };
    byId.set(id, row);
    order.push(row);
  }

  const kindRank = (k) => {
    const i = KIND_ORDER.indexOf(k);
    return i === -1 ? KIND_ORDER.length : i;
  };
  return order.slice().sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const k = kindRank(a.kind) - kindRank(b.kind);
    if (k) return k;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
}

// Sort key for ranked availability entries: curated registry order, then
// uncurated ids after every curated one.
export function registryOrder(providerId) {
  const i = REGISTRY_INDEX.get(providerId);
  return i === undefined ? PROVIDERS.length : i;
}

// --- migration -----------------------------------------------------------

const LEGACY_INDEX = new Map();
for (const entry of PROVIDERS) {
  const names = [entry.name]
    .concat(entry.legacyNames || [])
    .concat(entry.tmdbNames || []);
  for (const n of names) {
    const key = String(n).toLowerCase();
    if (!LEGACY_INDEX.has(key)) LEGACY_INDEX.set(key, entry.id);
  }
}

// Old installs stored `watchtrack-my-subscriptions` as display names. Convert
// to ids in place; already-migrated ids pass through untouched (idempotent),
// and names we no longer recognize are dropped rather than kept as junk.
export function migrateLegacySubs(arr) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(arr) ? arr : []) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value) continue;
    let id = null;
    if (PROVIDER_BY_ID.has(value)) id = value;
    else if (/^tmdb:\d+$/.test(value)) id = value;
    else id = LEGACY_INDEX.get(value.toLowerCase()) || null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// --- urls ----------------------------------------------------------------

// The service's own search page for `title`, or a Google search when we have
// no template for it.
export function webSearchUrl(entry, title, providerName) {
  const t = title == null ? '' : String(title);
  const tpl = entry && entry.web ? entry.web.search : null;
  if (tpl) return tpl.replace(/\{q\}/g, encodeURIComponent(t));
  const q = `${providerName || ''} ${t}`.trim();
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}
