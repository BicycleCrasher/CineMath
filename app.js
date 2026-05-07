// === Reaction tag taxonomy by content type ===
// Each item resolves to ONE content type. The UI shows the matching set.
// Tags stored on items that aren't in the current type's set are preserved silently.
const TAG_SETS = {
  'film-narrative': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","Smart structure","Emotionally resonant","Want more like this"],
    negative: ["Too slow","Too bleak","Too cold","Style over substance","Premise didn't land","Dated badly"]
  },
  'tv-prestige': {
    positive: ["Stuck the landing","Stayed with me","Performance-driven","Smart structure","Emotionally resonant","Want more like this","Rewatchable"],
    negative: ["Lost steam","Late-season decline","Too bleak","Stretched thin","Premise wore out","Dated badly"]
  },
  'tv-limited': {
    positive: ["Stuck the landing","Stayed with me","Performance-driven","Tight structure","Emotionally resonant","Visually stunning","Want more like this"],
    negative: ["Padded","Too bleak","Premise didn't land","Style over substance","Dated badly"]
  },
  'tv-sitcom': {
    positive: ["Rewatchable","Quotable","Ensemble warmth","Joke density","Smart structure","Stayed with me","Emotionally resonant","Want more like this","Stuck the landing"],
    negative: ["Cringe-driven","Sentimental","Dated badly","Premise wore thin","Lead overworked"]
  },
  'tv-panel': {
    positive: ["Host chemistry","Quotable","Comfort watch","Strong recurring guests","Joke density","Format works","Want more like this"],
    negative: ["Host doesn't land","Too topical","Format wears thin","Guests don't gel","Mean-spirited"]
  },
  'tv-game': {
    positive: ["Great host","Format design","Difficulty pitched right","Comfort watch","Contestant chemistry","Quotable moments","Want more like this"],
    negative: ["Host weak","Too easy","Too hard","Format dated","Lifeless"]
  },
  'tv-doc-reality': {
    positive: ["Host chemistry","Visually stunning","Stayed with me","Educational","Comfort watch","Rewatchable","Want more like this"],
    negative: ["Talking-heads heavy","Padded","Sensationalized","Style over substance","Dated badly"]
  },
  'tv-anthology': {
    positive: ["Variable but rewards","Quotable","Stayed with me","Smart structure","Emotionally resonant","Rewatchable","Want more like this"],
    negative: ["Inconsistent","Style over substance","Premise didn't land","Stretched thin","Aged badly"]
  }
};

// Backwards compatibility: legacy POSITIVE_TAGS/NEGATIVE_TAGS still referenced from import code.
const POSITIVE_TAGS = TAG_SETS['film-narrative'].positive;
const NEGATIVE_TAGS = TAG_SETS['film-narrative'].negative;

// Default content type per tab. Items in British Comedy resolve via category.
// Items can override at the catalog level via `contentType` on the item or section.
const TAB_DEFAULT_CONTENT_TYPE = {
  'scifi': 'film-narrative',
  'scifi-tv': 'tv-prestige',
  'espionage': 'film-narrative',
  'spy-tv': 'tv-prestige',
  'crime': 'film-narrative',
  'crime-tv': 'tv-prestige',
  'cons-courtroom': 'film-narrative',
  'cons-courtroom-tv': 'tv-prestige',
  'horror': 'film-narrative',
  'horror-tv': 'tv-prestige',
  'fantasy': 'film-narrative',
  'fantasy-tv': 'tv-prestige',
  'heist': 'film-narrative',
  'comedy': 'film-narrative',
  'comedy-tv': 'tv-sitcom',
  'british-comedy': 'tv-sitcom',
  'drama': 'film-narrative',
  'drama-tv': 'tv-prestige',
  'foreign': 'film-narrative',
  'auteur': 'film-narrative',
  'pre1960': 'film-narrative'
};

// British-comedy category → content type mapping (when item has categories[]).
// `specials` is intentionally absent so it falls through to the OTHER category in the array.
const CATEGORY_TO_CONTENT_TYPE = {
  'panel': 'tv-panel',
  'news-comedy': 'tv-panel',
  'game': 'tv-game',
  'sitcom': 'tv-sitcom'
};

function resolveContentType(item) {
  // 1. Explicit item override wins
  if (item && item.contentType) return item.contentType;
  // 2. British Comedy: look at item categories
  if (item && Array.isArray(item.categories) && item.categories.length > 0) {
    for (const cat of item.categories) {
      if (CATEGORY_TO_CONTENT_TYPE[cat]) return CATEGORY_TO_CONTENT_TYPE[cat];
    }
  }
  // 3. Tab default
  return TAB_DEFAULT_CONTENT_TYPE[activeTab] || 'film-narrative';
}

function getTagSetForItem(item) {
  const t = resolveContentType(item);
  return TAG_SETS[t] || TAG_SETS['film-narrative'];
}

const STORAGE_KEY = 'scifi-tracker-state';
const TAB_KEY = 'scifi-tracker-active-tab';

// Per-catalog seed data — applies on first load only
const SEED_STATE = {
  "scifi": {
    "2001-a-space-odyssey-1968": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Visually stunning","Want more like this","Emotionally resonant","Smart structure"], "notes": "Love this one. I've watched it many times, love it every time." },
    "blade-runner-1982": { "status": "watched", "rating": "liked", "reactionTags": ["Visually stunning","Rewatchable"], "notes": "I've always been confused by this one." },
    "timecrimes-2007": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Want more like this","Smart structure"], "notes": "Fantastic. Understood without subtitles." },
    "dune-1984": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Visually stunning","Dated badly"] },
    "dune-part-one-2021": { "status": "watched", "rating": "loved", "reactionTags": ["Stayed with me","Rewatchable","Visually stunning","Emotionally resonant","Smart structure","Want more like this"] },
    "dune-part-two-2024": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Smart structure","Want more like this","Emotionally resonant","Visually stunning"] },
    "donnie-darko-2001": { "status": "watched" },
    "la-jetee-1962": { "status": "queued" },
    "primer-2004": { "status": "queued" },
    "moon-2009": { "status": "watching" },
    "dark-city-1998": { "status": "queued" },
    "pi-1998": { "status": "queued" },
    "cube-1997": { "status": "queued" },
    "the-andromeda-strain-1971": { "status": "queued" },
    "children-of-men-2006": { "status": "queued" },
    "the-man-who-fell-to-earth-1976": { "status": "queued" },
    "stalker-1979": { "status": "queued" },
    "silent-running-1972": { "status": "queued" },
    "phase-iv-1974": { "status": "queued" },
    "solaris-tarkovsky-1972": { "status": "queued" },
    "solaris-soderbergh-2002": { "status": "queued" },
    "the-conversation-1974": { "status": "queued" }
  },
  "scifi-tv": {
    "frank-herbert-s-dune-2000": { "status": "watching" },
    "frank-herbert-s-children-of-dune-2003": { "status": "queued" },
    "devs-2020": { "status": "queued" },
    "edge-of-darkness-1985": { "status": "queued" },
    "severance-2022": { "status": "queued" },
    "battlestar-galactica-2003-reboot-2003": { "status": "watched" },
    "foundation-2021": { "status": "watching" },
    "star-trek-strange-new-worlds-2022": { "status": "watching" },
    "the-expanse-2015": { "status": "watching" },
    "stargate-1994-film-1994": { "status": "watched" },
    "westworld-s1-only-2016": { "status": "watched" },
    "firefly-2002": { "status": "watched", "rating": "loved" },
    "dollhouse-2009": { "status": "watched", "rating": "loved" },
    "eureka-2006": { "status": "watched", "rating": "loved" },
    "orphan-black-2013": { "status": "watched", "rating": "loved" },
    "legion-2017": { "status": "watched", "rating": "loved" }
  },
  "espionage": {
    "the-bourne-identity-2002": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Visually stunning","Stayed with me","Smart structure","Want more like this"] },
    "the-hunt-for-red-october-1990": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Emotionally resonant","Stayed with me","Visually stunning"], "notes": "One of my favorite movies of all time." },
    "spy-game-2001": { "status": "watched", "rating": "loved", "reactionTags": ["Smart structure","Want more like this","Rewatchable","Emotionally resonant","Stayed with me","Visually stunning"], "notes": "Another one of my favorite movies of all time." },
    "all-the-president-s-men-1976": { "status": "watched", "rating": "loved", "reactionTags": ["Smart structure","Want more like this","Rewatchable","Emotionally resonant","Stayed with me","Visually stunning"], "notes": "I love this. Political thriller at its best." }
  },
  "spy-tv": {
    "the-night-manager-2016": { "status": "queued" }
  },
  "crime": {},
  "crime-tv": {
    "true-detective-s1-2014": { "status": "watched", "rating": "loved" },
    "the-wire-2002": { "status": "watching" },
    "the-sopranos-1999": { "status": "queued" },
    "dexter-2006": { "status": "watched", "rating": "loved" },
    "weeds-2005": { "status": "watched", "rating": "loved" },
    "rosemary-thyme-2003": { "status": "watched", "rating": "loved" },
    "cadfael-1994": { "status": "watched", "rating": "loved" }
  },
  "cons-courtroom": {},
  "cons-courtroom-tv": {
    "the-sticky-2024": { "status": "queued" }
  },
  "horror": {
    "nosferatu-2024": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Smart structure","Emotionally resonant","Visually stunning","Want more like this"] },
    "nosferatu-1922-1922": { "status": "watching" },
    "underworld-series-2003": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Want more like this","Stayed with me","Visually stunning","Style over substance"] },
    "event-horizon-1997": { "status": "watched", "rating": "liked", "reactionTags": ["Stayed with me","Rewatchable","Visually stunning","Want more like this"] }
  },
  "horror-tv": {
    "buffy-the-vampire-slayer-1997": { "status": "watched", "rating": "loved" },
    "hannibal-2013": { "status": "queued" }
  },
  "fantasy": {},
  "fantasy-tv": {
    "game-of-thrones-2011": { "status": "watched", "rating": "loved" },
    "american-gods-2017": { "status": "watched", "rating": "loved" }
  },
  "heist": {
    "catch-me-if-you-can-2002": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Stayed with me","Emotionally resonant","Visually stunning"], "notes": "I've watched it many times. Love it every time." },
    "ocean-s-eleven-2001": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Stayed with me","Visually stunning"], "notes": "Great. Impeccable timing. A good rewatch." },
    "reservoir-dogs-1992": { "status": "watched" },
    "leon-the-professional-1994": { "status": "queued" },
    "american-hustle-2013": { "status": "queued" },
    "nightcrawler-2014": { "status": "queued" }
  },
  "comedy": {
    "the-big-lebowski-1998": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Visually stunning","Emotionally resonant","Smart structure","Want more like this"], "notes": "Great every time. Always worth rewatching." },
    "rushmore-1998": { "status": "watched", "rating": "liked", "reactionTags": ["Rewatchable","Smart structure","Want more like this"], "notes": "Great Wes Anderson film. One of my favorites of his." },
    "network-1976": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Emotionally resonant","Stayed with me","Visually stunning"], "notes": "I've watched this many times, and I always enjoy the rewatch." },
    "dr-strangelove-1964": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Stayed with me","Visually stunning","Emotionally resonant","Smart structure","Want more like this"], "notes": "Kubrick nailed it here. Poignant, creative, hilarious." },
    "idiocracy-2006": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Emotionally resonant","Stayed with me","Visually stunning"], "notes": "Genius. Mike Judge is always a favorite." },
    "death-at-a-funeral-2007-2007": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Emotionally resonant","Visually stunning","Stayed with me"] },
    "this-is-spinal-tap-1984": { "status": "watched" },
    "o-brother-where-art-thou-2000": { "status": "watched", "rating": "loved", "reactionTags": ["Rewatchable","Smart structure","Want more like this","Emotionally resonant","Stayed with me","Visually stunning"], "notes": "My first Coen Brothers picture, and I still love it." },
    "fargo-1996": { "status": "watching" }
  },
  "comedy-tv": {
    "schitt-s-creek-2015": { "status": "watching", "rating": "loved" },
    "arrested-development-2003": { "status": "watched", "rating": "loved", "notes": "Watched multiple times, especially the first three seasons." },
    "30-rock-2006": { "status": "watched", "rating": "loved" },
    "parks-and-recreation-2009": { "status": "watched", "rating": "loved" },
    "brooklyn-nine-nine-2013": { "status": "watched", "rating": "loved" },
    "it-s-always-sunny-in-philadelphia-2005": { "status": "watched", "rating": "loved" },
    "studio-60-on-the-sunset-strip-2006": { "status": "watched", "rating": "loved" },
    "newsradio-1995": { "status": "watched", "rating": "loved", "notes": "One of my favorite sitcoms ever." },
    "designing-women-1986": { "status": "watched", "rating": "loved" },
    "qi-2003": { "status": "watched", "rating": "loved" },
    "top-gear-clarkson-era-2002": { "status": "watched", "rating": "loved", "notes": "Clarkson, Hammond, May years only." },
    "the-grand-tour-2016": { "status": "watched", "rating": "loved" },
    "tacoma-fd-2019": { "status": "watched", "rating": "loved" },
    "the-league-2009": { "status": "watched", "rating": "loved" },
    "pushing-daisies-2007": { "status": "watched", "rating": "loved" },
    "silicon-valley-2014": { "status": "watched", "rating": "loved" },
    "alpha-house-2013": { "status": "watched", "rating": "loved" },
    "scrubs-2001": { "status": "watched", "rating": "loved" },
    "ted-lasso-2020": { "status": "watching" },
    "veep-2012": { "status": "queued" },
    "damned-2016": { "status": "queued" }
  },
  "british-comedy": {
    "qi-2003": { "status": "watched", "rating": "loved", "notes": "Watched every episode ever. Loved every minute." },
    "8-out-of-10-cats-does-countdown-2012": { "status": "watched", "rating": "loved" },
    "would-i-lie-to-you-2007": { "status": "watched", "rating": "loved" },
    "taskmaster-2015": { "status": "watched", "rating": "loved" },
    "vicious-2013": { "status": "watched", "rating": "loved" },
    "pointless-2009": { "status": "watched", "rating": "loved" },
    "only-connect-2008": { "status": "watched", "rating": "loved" },
    "university-challenge-1962": { "status": "watched", "rating": "loved" },
    "big-fat-quiz-of-the-year-2004": { "status": "watched", "rating": "loved" },
    "8-out-of-10-cats-2005": { "status": "watched", "rating": "mixed", "notes": "Doesn't land for me." }
  },
  "drama": {},
  "drama-tv": {
    "the-west-wing-1999": { "status": "watched", "rating": "loved" },
    "the-newsroom-2012": { "status": "watched", "rating": "loved" },
    "studio-60-on-the-sunset-strip-2006": { "status": "watched", "rating": "loved" },
    "nurse-jackie-2009": { "status": "watched", "rating": "loved" },
    "the-riches-2007": { "status": "watched", "rating": "loved" },
    "american-gods-2017": { "status": "watched", "rating": "loved" },
    "house-md-2004": { "status": "watched", "rating": "loved" },
    "the-boys-2019": { "status": "queued" },
    "landman-2024": { "status": "queued" }
  },
  "foreign": {},
  "auteur": {},
  "pre1960": {}
};

let state = {};
let catalogs = {};
let catalogManifest = [];
let activeTab = 'watchlist';
let activeFilter = 'all';

// === Display mode (tv vs phone) — persisted in localStorage ===
const DISPLAY_MODE_KEY = 'watchtrack-display-mode';  // 'auto' | 'tv' | 'phone'
function getDisplayModePref() {
  return localStorage.getItem(DISPLAY_MODE_KEY) || 'auto';
}
function setDisplayModePref(mode) {
  if (mode === 'auto') localStorage.removeItem(DISPLAY_MODE_KEY);
  else localStorage.setItem(DISPLAY_MODE_KEY, mode);
}
function detectTVMode() {
  const ua = navigator.userAgent.toLowerCase();
  // Common TV user agent strings
  if (/\b(googletv|google_tv|smarttv|smart-tv|crkey|chromecast|bravia|aftv|webos|tizen|netcast)\b/.test(ua)) return true;
  // Fallback: large landscape viewport with no touch (most TVs)
  const big = window.innerWidth >= 1280 && window.innerHeight >= 720;
  const landscape = window.innerWidth > window.innerHeight;
  const noTouch = !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
  return big && landscape && noTouch;
}
function isTVMode() {
  const pref = getDisplayModePref();
  if (pref === 'tv') return true;
  if (pref === 'phone') return false;
  return detectTVMode();
}
function applyDisplayMode() {
  const tv = isTVMode();
  document.body.classList.toggle('tv-mode', tv);
  document.body.classList.toggle('phone-mode', !tv);
}

// === Plex settings ===
const PLEX_TOKEN_KEY = 'watchtrack-plex-token';
const PLEX_SERVER_URL_KEY = 'watchtrack-plex-server-url';
const PLEX_CLIENT_ID_KEY = 'watchtrack-plex-client-id';
function getPlexToken() { return localStorage.getItem(PLEX_TOKEN_KEY) || ''; }
function setPlexToken(t) {
  if (!t) localStorage.removeItem(PLEX_TOKEN_KEY);
  else localStorage.setItem(PLEX_TOKEN_KEY, t);
}
function getPlexServerUrl() { return localStorage.getItem(PLEX_SERVER_URL_KEY) || ''; }
function setPlexServerUrl(u) {
  if (!u) localStorage.removeItem(PLEX_SERVER_URL_KEY);
  else localStorage.setItem(PLEX_SERVER_URL_KEY, u.replace(/\/$/, ''));
}
function getPlexClientId() { return localStorage.getItem(PLEX_CLIENT_ID_KEY) || ''; }
function setPlexClientId(c) {
  if (!c) localStorage.removeItem(PLEX_CLIENT_ID_KEY);
  else localStorage.setItem(PLEX_CLIENT_ID_KEY, c);
}
function isPlexConfigured() {
  return Boolean(getPlexToken() && getPlexServerUrl());
}

// === Plex library cache (in-memory, refreshed on load) ===
// Map: normalized "title|year" -> { ratingKey, title, year, type }
let plexLibrary = new Map();
let plexLibraryLoadedAt = 0;
function plexNormalizeKey(title, year) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60) + '|' + (year || '');
}
async function fetchPlexLibrary() {
  if (!isPlexConfigured()) return;
  const url = getPlexServerUrl();
  const token = getPlexToken();
  try {
    // Get sections list
    const sectionsResp = await fetch(`${url}/library/sections?X-Plex-Token=${encodeURIComponent(token)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!sectionsResp.ok) {
      console.warn('Plex sections fetch failed:', sectionsResp.status);
      return;
    }
    const sectionsJson = await sectionsResp.json();
    const dirs = (sectionsJson?.MediaContainer?.Directory) || [];
    const newLib = new Map();
    for (const dir of dirs) {
      if (dir.type !== 'movie' && dir.type !== 'show') continue;
      const allResp = await fetch(`${url}/library/sections/${dir.key}/all?X-Plex-Token=${encodeURIComponent(token)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!allResp.ok) continue;
      const allJson = await allResp.json();
      const items = (allJson?.MediaContainer?.Metadata) || [];
      items.forEach(it => {
        const key = plexNormalizeKey(it.title, it.year);
        newLib.set(key, {
          ratingKey: it.ratingKey,
          title: it.title,
          year: it.year,
          type: it.type
        });
      });
    }
    plexLibrary = newLib;
    plexLibraryLoadedAt = Date.now();
    render();
  } catch (e) {
    console.warn('Plex library fetch error:', e);
  }
}
function plexHasItem(item) {
  const key = plexNormalizeKey(item.title, item.year);
  return plexLibrary.get(key);
}
function plexDeepLinkUrl(ratingKey) {
  // plex:// URL scheme launches the Plex Android TV app (or Plex desktop) with a specific item
  const clientId = getPlexClientId();
  const serverUrl = getPlexServerUrl();
  // The standard deep link format
  return `plex://play?metadataKey=/library/metadata/${ratingKey}&server=${encodeURIComponent(serverUrl)}`;
}
async function plexMarkWatched(ratingKey) {
  if (!isPlexConfigured()) return false;
  const url = getPlexServerUrl();
  const token = getPlexToken();
  try {
    const resp = await fetch(`${url}/:/scrobble?identifier=com.plexapp.plugins.library&key=${ratingKey}&X-Plex-Token=${encodeURIComponent(token)}`);
    return resp.ok;
  } catch (e) { return false; }
}

// === Category filter (in-memory only; never persisted to localStorage) ===
const activeCategoryByTab = {};        // { tabId: 'panel' | 'all' }
const categoryClearTimers = {};        // { tabId: timeoutId } — 30s "left tab" timer
let appHiddenClearTimer = null;        // 5min "app backgrounded" timer
const TAB_LEAVE_GRACE_MS = 30 * 1000;
const APP_HIDDEN_GRACE_MS = 5 * 60 * 1000;

// === Sort filter (in-memory only; never persisted) ===
const activeSortByTab = {};            // { tabId: 'default' | 'year' | 'title' | 'rating' | 'updated' }
function getActiveSort(tab) { return activeSortByTab[tab] || 'default'; }
function setActiveSort(tab, sort) {
  if (sort === 'default') delete activeSortByTab[tab];
  else activeSortByTab[tab] = sort;
}
function sortItems(items) {
  const sort = getActiveSort(activeTab);
  if (sort === 'default') return items;  // catalog/section order preserved
  const arr = items.slice();
  if (sort === 'year') {
    arr.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  } else if (sort === 'title') {
    arr.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === 'rating') {
    const rorder = { 'loved': 0, 'liked': 1, 'mixed': 2, 'disliked': 3, 'none': 4 };
    arr.sort((a, b) => {
      const ta = a._watchlist_source_tab || activeTab;
      const tb = b._watchlist_source_tab || activeTab;
      const ra = rorder[getRating(a.id, ta)] ?? 4;
      const rb = rorder[getRating(b.id, tb)] ?? 4;
      return ra - rb || a.title.localeCompare(b.title);
    });
  } else if (sort === 'updated') {
    arr.sort((a, b) => {
      const ta = a._watchlist_source_tab || activeTab;
      const tb = b._watchlist_source_tab || activeTab;
      return (getLastUpdated(b.id, tb) || 0) - (getLastUpdated(a.id, ta) || 0) || a.title.localeCompare(b.title);
    });
  }
  return arr;
}
const CATEGORY_LABELS = {
  // British Comedy
  'panel': 'Panel',
  'sitcom': 'Sitcom',
  'game': 'Game Show',
  'news-comedy': 'News Comedy',
  'specials': 'Specials',
  // Watchlist sections (virtual tab)
  'watching': 'Watching',
  'queued': 'Queued',
  'suggested': 'Suggested',
  // Sci-Fi
  'mainstream': 'Mainstream',
  'cerebral': 'Cerebral',
  'apocalyptic': 'Apocalyptic',
  'foundational': 'Foundational',
  // Sci-Fi TV
  'limited': 'Limited',
  'ongoing': 'Ongoing',
  'already-watched': 'Already Watched',
  // Spy / Spy TV
  'cold-war': 'Cold War',
  'modern': 'Modern',
  'historical': 'Historical',
  'paranoia-thriller': 'Paranoia Thriller',
  'le-carré': 'Le Carré',
  'international': 'International',
  // Crime / Crime TV
  'neo-noir': 'Neo-Noir',
  'heist-adjacent': 'Heist-Adjacent',
  'scorsese-lane': 'Scorsese Lane',
  'gritty': 'Gritty',
  'hbo-prestige': 'HBO Prestige',
  'british-cozy': 'British Cozy',
  'nordic-noir': 'Nordic Noir',
  'procedural': 'Procedural',
  // Cons & Courtroom
  'con-artist': 'Con Artist',
  'courtroom': 'Courtroom',
  'twist': 'Twist',
  'sorkin': 'Sorkin',
  'long-con': 'Long Con',
  'heist-series': 'Heist Series',
  // Horror / Horror TV
  'slow-burn': 'Slow Burn',
  'gothic': 'Gothic',
  'supernatural': 'Supernatural',
  'psychological': 'Psychological',
  'classic': 'Classic',
  'flanagan': 'Flanagan',
  'anthology': 'Anthology',
  // Fantasy / Fantasy TV
  'epic': 'Epic',
  'adventure': 'Adventure',
  'mythological': 'Mythological',
  // Heist
  'heist': 'Heist',
  'con': 'Con',
  // Comedy / Comedy TV
  'satire': 'Satire',
  'dark': 'Dark',
  'ensemble': 'Ensemble',
  // Drama / Drama TV
  'character-study': 'Character Study',
  'coens': 'Coens',
  'pta': 'PTA',
  'period': 'Period',
  'hbo': 'HBO',
  'amc': 'AMC',
  'network': 'Network',
  'streaming': 'Streaming',
  // Foreign
  'thriller': 'Thriller',
  'korean': 'Korean',
  'french': 'French',
  'japanese': 'Japanese',
  'italian': 'Italian',
  'spanish-lang': 'Spanish-Language',
  'german': 'German',
  'polish': 'Polish',
  'argentine': 'Argentine',
  'brazilian': 'Brazilian',
  'hk-chinese': 'Hong Kong / Chinese',
  // Auteur (each director a category)
  'nolan': 'Nolan',
  'kubrick': 'Kubrick',
  'scorsese': 'Scorsese',
  'villeneuve': 'Villeneuve',
  'lynch': 'Lynch',
  'tarkovsky': 'Tarkovsky',
  'whedon': 'Whedon',
  'fuller': 'Fuller',
  'fincher': 'Fincher',
  'eggers': 'Eggers',
  'spielberg': 'Spielberg',
  'wes-anderson': 'Wes Anderson',
  'ridley-scott': 'Ridley Scott',
  'tony-scott': 'Tony Scott',
  'bergman': 'Bergman',
  'fellini': 'Fellini',
  'kurosawa': 'Kurosawa',
  // Classics
  'western': 'Western',
  'noir': 'Noir',
  'screwball': 'Screwball'
};
function prettyCategory(key) {
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return key.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
function getActiveCategory(tab) {
  return activeCategoryByTab[tab] || 'all';
}
function setActiveCategory(tab, cat) {
  if (cat === 'all') delete activeCategoryByTab[tab];
  else activeCategoryByTab[tab] = cat;
}
function scheduleTabCategoryClear(tab) {
  // 30-second timer: if user doesn't return to this tab within 30s, clear its category filter
  cancelTabCategoryClear(tab);
  categoryClearTimers[tab] = setTimeout(() => {
    delete activeCategoryByTab[tab];
    delete categoryClearTimers[tab];
  }, TAB_LEAVE_GRACE_MS);
}
function cancelTabCategoryClear(tab) {
  if (categoryClearTimers[tab]) {
    clearTimeout(categoryClearTimers[tab]);
    delete categoryClearTimers[tab];
  }
}
function clearAllCategoryMemory() {
  for (const k of Object.keys(activeCategoryByTab)) delete activeCategoryByTab[k];
  for (const k of Object.keys(categoryClearTimers)) {
    clearTimeout(categoryClearTimers[k]);
    delete categoryClearTimers[k];
  }
}
const expandedIds = new Set();

function normalizeId(id) {
  // Collapse multiple separators into one, trim trailing/leading hyphens
  return id.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
}

function normalizeStateIds(s) {
  // For each tab, fold duplicate IDs (caused by old separator inconsistency)
  const out = {};
  for (const tab of Object.keys(s)) {
    out[tab] = {};
    for (const id of Object.keys(s[tab])) {
      const normalized = normalizeId(id);
      // Merge: later entries override earlier; prefer entries with more data
      const existing = out[tab][normalized];
      const incoming = s[tab][id];
      if (!existing) {
        out[tab][normalized] = incoming;
      } else {
        // Prefer the entry with more fields
        const existingFields = Object.keys(existing).length;
        const incomingFields = Object.keys(incoming).length;
        if (incomingFields > existingFields) out[tab][normalized] = incoming;
      }
    }
  }
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = normalizeStateIds(JSON.parse(raw));
      catalogManifest.forEach(c => { if (!state[c.id]) state[c.id] = {}; });
      saveState();
      return;
    }
  } catch (e) { console.error('Load failed:', e); }
  state = JSON.parse(JSON.stringify(SEED_STATE));
  catalogManifest.forEach(c => { if (!state[c.id]) state[c.id] = {}; });
  saveState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('Save failed:', e); }
}

function loadActiveTab() {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t) activeTab = t;
  } catch (e) {}
}
function saveActiveTab() {
  try { localStorage.setItem(TAB_KEY, activeTab); } catch (e) {}
}

async function loadCatalogManifest() {
  try {
    const resp = await fetch('data/catalogs.json');
    const data = await resp.json();
    catalogManifest = data.catalogs;
  } catch (e) {
    catalogManifest = [
      { id: "watchlist", label: "Watchlist", virtual: true },
      { id: "auteur", label: "Auteur" },
      { id: "british-comedy", label: "British Comedy" },
      { id: "pre1960", label: "Classics" },
      { id: "comedy", label: "Comedy" },
      { id: "comedy-tv", label: "Comedy TV" },
      { id: "cons-courtroom", label: "Cons & Courtroom" },
      { id: "cons-courtroom-tv", label: "Cons & Courtroom TV" },
      { id: "crime", label: "Crime" },
      { id: "crime-tv", label: "Crime TV" },
      { id: "drama", label: "Drama" },
      { id: "drama-tv", label: "Drama TV" },
      { id: "fantasy", label: "Fantasy" },
      { id: "fantasy-tv", label: "Fantasy TV" },
      { id: "foreign", label: "Foreign" },
      { id: "heist", label: "Heist" },
      { id: "horror", label: "Horror" },
      { id: "horror-tv", label: "Horror TV" },
      { id: "scifi", label: "Sci-Fi" },
      { id: "scifi-tv", label: "Sci-Fi TV" },
      { id: "espionage", label: "Spy" },
      { id: "spy-tv", label: "Spy TV" }
    ];
  }
}

async function loadCatalogs() {
  for (const c of catalogManifest) {
    if (c.virtual) continue;  // Watchlist and other virtual tabs have no JSON file
    try {
      const resp = await fetch(`data/${c.id}.json`);
      const cat = await resp.json();
      let order = 1;
      cat.items = [];
      cat.sections.forEach(section => {
        section.items.forEach(item => {
          item.section = section.name;
          item.sectionDesc = section.desc;
          item.categories = section.categories || [];
          item.sourceTab = c.id;
          item.sourceTabLabel = c.label;
          item.order = order++;
          item.id = `${item.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')}-${item.year}`;
          cat.items.push(item);
        });
      });
      catalogs[c.id] = cat;
    } catch (e) {
      console.error(`Failed to load ${c.id}:`, e);
    }
  }
  // Validate active tab still exists (or is virtual)
  const exists = catalogs[activeTab] || catalogManifest.find(c => c.id === activeTab && c.virtual);
  if (!exists) activeTab = catalogManifest[0]?.id || 'watchlist';
}

function getEntry(id, tab) { tab = tab || activeTab; return (state[tab] && state[tab][id]) || {}; }
function getStatus(id, tab) { return getEntry(id, tab).status || 'none'; }
function getRating(id, tab) { return getEntry(id, tab).rating || 'none'; }
function getTags(id, tab) { return getEntry(id, tab).reactionTags || []; }
function getNotes(id, tab) { return getEntry(id, tab).notes || ''; }
function getLastUpdated(id, tab) { return getEntry(id, tab).lastUpdated || 0; }

function touchEntry(tab, id) {
  if (!state[tab]) state[tab] = {};
  if (!state[tab][id]) state[tab][id] = {};
  state[tab][id].lastUpdated = Date.now();
}

function setStatus(id, status, tab) {
  tab = tab || activeTab;
  if (!state[tab]) state[tab] = {};
  if (!state[tab][id]) state[tab][id] = {};
  state[tab][id].status = status;
  if (status !== 'watched' && status !== 'watching') {
    delete state[tab][id].rating;
    delete state[tab][id].reactionTags;
  }
  touchEntry(tab, id);
  saveState(); render();
}

function setRating(id, rating, tab) {
  tab = tab || activeTab;
  if (!state[tab]) state[tab] = {};
  if (!state[tab][id]) state[tab][id] = {};
  if (state[tab][id].rating === rating) delete state[tab][id].rating;
  else state[tab][id].rating = rating;
  touchEntry(tab, id);
  saveState(); updateItemInPlace(id);
}

function toggleTag(id, tag, tab) {
  tab = tab || activeTab;
  if (!state[tab]) state[tab] = {};
  if (!state[tab][id]) state[tab][id] = {};
  if (!state[tab][id].reactionTags) state[tab][id].reactionTags = [];
  const idx = state[tab][id].reactionTags.indexOf(tag);
  if (idx === -1) state[tab][id].reactionTags.push(tag);
  else state[tab][id].reactionTags.splice(idx, 1);
  touchEntry(tab, id);
  saveState(); updateItemInPlace(id);
}

function setNotes(id, notes, tab) {
  tab = tab || activeTab;
  if (!state[tab]) state[tab] = {};
  if (!state[tab][id]) state[tab][id] = {};
  state[tab][id].notes = notes;
  touchEntry(tab, id);
  saveState();
}

function cycleStatus(id, tab) {
  tab = tab || activeTab;
  const cur = getStatus(id, tab);
  const next = cur === 'none' ? 'queued'
             : cur === 'queued' ? 'watching'
             : cur === 'watching' ? 'watched'
             : cur === 'watched' ? 'skip'
             : 'none';
  setStatus(id, next, tab);
}

function updateItemInPlace(id, tab) {
  tab = tab || activeTab;
  const itemEl = document.querySelector(`.item[data-id="${id}"]`);
  if (!itemEl) return;
  const rating = getRating(id, tab);
  const reactionTags = getTags(id, tab);
  itemEl.querySelectorAll('.rating-btn').forEach(btn => {
    btn.classList.remove('active-loved','active-liked','active-mixed','active-disliked');
    if (btn.dataset.rating === rating) btn.classList.add(`active-${rating}`);
  });
  let badge = itemEl.querySelector('.rating-badge');
  if (rating !== 'none') {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'rating-badge';
      const badgeRow = itemEl.querySelector('.badge-row');
      if (badgeRow) badgeRow.appendChild(badge);
    }
    badge.className = `rating-badge ${rating}`;
    badge.textContent = ratingLabel(rating);
  } else if (badge) badge.remove();
  itemEl.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.remove('active-pos','active-neg');
    if (reactionTags.includes(btn.dataset.tag)) {
      // Look up item in active catalog (or watchlist proxy) for tag-set resolution
      const cat = activeTab === 'watchlist' ? catalogs['watchlist'] : catalogs[activeTab];
      const item = cat && cat.items.find(it => it.id === id);
      const set = item ? getTagSetForItem(item) : TAG_SETS['film-narrative'];
      const isPos = set.positive.includes(btn.dataset.tag);
      btn.classList.add(isPos ? 'active-pos' : 'active-neg');
    }
  });
  updateStats();
}

function updateStats() {
  // For Watchlist, stats come from the synthetic catalog (which spans all tabs);
  // for other tabs, stats come from the catalog's items using tab-local state.
  const cat = activeTab === 'watchlist' ? catalogs['watchlist'] : catalogs[activeTab];
  if (!cat) return;
  const items = cat.items;
  const tab = activeTab;
  const watched = items.filter(f => {
    const t = f._watchlist_source_tab || tab;
    return getStatus(f.id, t) === 'watched';
  }).length;
  const watching = items.filter(f => {
    const t = f._watchlist_source_tab || tab;
    return getStatus(f.id, t) === 'watching';
  }).length;
  const rated = items.filter(f => {
    const t = f._watchlist_source_tab || tab;
    return getRating(f.id, t) !== 'none';
  }).length;
  const queued = items.filter(f => {
    const t = f._watchlist_source_tab || tab;
    return getStatus(f.id, t) === 'queued';
  }).length;
  document.getElementById('watched-count').textContent = watched;
  document.getElementById('watching-count').textContent = watching;
  document.getElementById('rated-count').textContent = rated;
  document.getElementById('queued-count').textContent = queued;
  document.getElementById('total-count').textContent = items.length;
  document.getElementById('progress').style.width = `${(watched / items.length) * 100}%`;
}

function buildTabs() {
  const nav = document.getElementById('tab-nav');
  nav.innerHTML = catalogManifest.map(c =>
    `<button class="tab-btn ${activeTab === c.id ? 'active' : ''}" data-tab="${c.id}">${c.label}</button>`
  ).join('');
  nav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function buildCategoryFilters() {
  const container = document.getElementById('categories');
  if (!container) return;
  // Ensure catalog is built (handles virtual watchlist tab)
  let cat;
  if (activeTab === 'watchlist') {
    catalogs['watchlist'] = buildWatchlistCatalog();
    cat = catalogs['watchlist'];
  } else {
    cat = catalogs[activeTab];
  }
  if (!cat) { container.innerHTML = ''; return; }

  // Collect unique categories across all sections of this catalog, preserving section order
  const seen = new Set();
  const categories = [];
  cat.sections.forEach(section => {
    (section.categories || []).forEach(c => {
      if (!seen.has(c)) { seen.add(c); categories.push(c); }
    });
  });

  // Hide entire bar if catalog has 0 or 1 distinct categories
  if (categories.length < 2) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const active = getActiveCategory(activeTab);
  const pills = [{ key: 'all', label: 'All' }].concat(
    categories.map(k => ({ key: k, label: prettyCategory(k) }))
  );
  container.innerHTML = pills.map(p =>
    `<button class="category-btn ${active === p.key ? 'active' : ''}" data-category="${p.key}">${p.label}</button>`
  ).join('');
  container.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setActiveCategory(activeTab, btn.dataset.category);
      render();
    });
  });
}

function itemMatchesCategory(item) {
  const active = getActiveCategory(activeTab);
  if (active === 'all') return true;
  return Array.isArray(item.categories) && item.categories.includes(active);
}

function buildFilters() {
  const isFilms = !activeTab.endsWith('-tv') && activeTab !== 'scifi-tv';
  const isTV = activeTab.endsWith('-tv') || activeTab === 'scifi-tv';
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'priority-high', label: 'High priority' },
    { key: 'priority-med', label: 'Med priority' },
    { key: 'watching', label: 'Watching' },
    { key: 'unwatched', label: 'Unseen' },
    { key: 'queued', label: 'Queued' },
    { key: 'watched', label: 'Watched' },
    { key: 'loved', label: 'Loved' },
    { key: 'liked', label: 'Liked+' }
  ];
  if (isTV) {
    filters.push({ key: 'short', label: 'Short' });
    filters.push({ key: 'medium', label: 'Medium' });
    filters.push({ key: 'long', label: 'Long' });
  }
  filters.push({ key: 'foundational', label: 'Foundational' });
  filters.push({ key: 'modern', label: 'Modern' });
  filters.push({ key: 'under', label: 'Under-radar' });
  filters.push({ key: 'intl', label: 'International' });
  if (isFilms) filters.push({ key: 'adjacent', label: 'Adjacent' });

  const container = document.getElementById('filters');
  const currentSort = getActiveSort(activeTab);
  const sortHtml = `<select class="sort-select" id="sort-select">
    <option value="default" ${currentSort==='default'?'selected':''}>Sort: Default</option>
    <option value="updated" ${currentSort==='updated'?'selected':''}>Recently updated</option>
    <option value="year" ${currentSort==='year'?'selected':''}>Year (newest)</option>
    <option value="title" ${currentSort==='title'?'selected':''}>Title (A→Z)</option>
    <option value="rating" ${currentSort==='rating'?'selected':''}>My rating</option>
  </select>`;
  container.innerHTML = sortHtml + filters.map(f =>
    `<button class="filter-btn ${activeFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
  ).join('');
  const sortSelect = container.querySelector('#sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      setActiveSort(activeTab, e.target.value);
      render();
    });
  }
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      render();
    });
  });
}

function itemMatchesFilter(item) {
  const tab = item._watchlist_source_tab || activeTab;
  const status = getStatus(item.id, tab);
  const rating = getRating(item.id, tab);
  switch (activeFilter) {
    case 'all': return true;
    case 'priority-high': return item.priority === 'high';
    case 'priority-med': return item.priority === 'med';
    case 'watching': return status === 'watching';
    case 'unwatched': return status === 'none' || status === 'queued';
    case 'queued': return status === 'queued';
    case 'watched': return status === 'watched';
    case 'loved': return rating === 'loved';
    case 'liked': return rating === 'loved' || rating === 'liked';
    case 'short': return item.commitmentTag === 'short';
    case 'medium': return item.commitmentTag === 'medium';
    case 'long': return item.commitmentTag === 'long';
    case 'foundational': return item.tags && item.tags.includes('foundational');
    case 'modern': return item.tags && item.tags.includes('modern');
    case 'under': return item.tags && item.tags.includes('under');
    case 'intl': return item.tags && item.tags.includes('intl');
    case 'adjacent': return item.tags && item.tags.includes('adjacent');
    default: return true;
  }
}

function statusIcon(s) { return { watched: '✓', watching: '▸', queued: '◐', skip: '✕' }[s] || ''; }
function ratingLabel(r) { return { loved: 'Loved', liked: 'Liked', mixed: 'Mixed', disliked: 'Disliked' }[r] || ''; }
function priorityLabel(p) { return { high: 'High Priority', med: 'Med Priority' }[p] || ''; }

// === Watchlist (virtual tab) generator ===
// Build a synthetic catalog object with three sections:
//   A. Currently watching (status = watching)
//   B. Your queue (status = queued)
//   C. System suggestions (status = none, priority = high or med)
function buildWatchlistCatalog() {
  const watching = [];
  const queued = [];
  const suggested = [];
  // Walk every loaded catalog
  for (const tabId in catalogs) {
    const cat = catalogs[tabId];
    cat.items.forEach(item => {
      const entry = (state[tabId] && state[tabId][item.id]) || {};
      const st = entry.status || 'none';
      // Tag the item with metadata so the watchlist render knows where it came from
      const proxy = Object.assign({}, item, {
        _watchlist_source_tab: tabId,
        _watchlist_source_label: cat.title || tabId,
        _watchlist_status: st,
        _watchlist_lastUpdated: entry.lastUpdated || 0
      });
      if (st === 'watching') watching.push(proxy);
      else if (st === 'queued') queued.push(proxy);
      else if (st === 'none' && (item.priority === 'high' || item.priority === 'med')) suggested.push(proxy);
    });
  }
  // Sort: most-recently-touched first within Watching/Queued; priority-then-source-then-title for Suggested
  watching.sort((a, b) => (b._watchlist_lastUpdated || 0) - (a._watchlist_lastUpdated || 0) || a.title.localeCompare(b.title));
  queued.sort((a, b) => (b._watchlist_lastUpdated || 0) - (a._watchlist_lastUpdated || 0) || a.title.localeCompare(b.title));
  suggested.sort((a, b) => {
    const pri = (x) => x.priority === 'high' ? 0 : x.priority === 'med' ? 1 : 2;
    if (pri(a) !== pri(b)) return pri(a) - pri(b);
    if (a._watchlist_source_label !== b._watchlist_source_label) return a._watchlist_source_label.localeCompare(b._watchlist_source_label);
    return a.title.localeCompare(b.title);
  });

  // Distinct categories present in result for the category filter row
  const sectionA = { name: 'A. Currently Watching', desc: 'Items you marked as in-progress.', items: watching, categories: ['watching'] };
  const sectionB = { name: 'B. Your Queue', desc: 'Items you marked as queued, sorted most-recently-touched first.', items: queued, categories: ['queued'] };
  const sectionC = { name: 'C. System Suggestions', desc: 'Curated high/medium-priority recommendations across genres you have not yet engaged with.', items: suggested, categories: ['suggested'] };

  // Each item gets the section-level category for filter purposes
  watching.forEach(it => { it.section = sectionA.name; it.sectionDesc = sectionA.desc; it.categories = (it.categories || []).concat(['watching']); });
  queued.forEach(it => { it.section = sectionB.name; it.sectionDesc = sectionB.desc; it.categories = (it.categories || []).concat(['queued']); });
  suggested.forEach(it => { it.section = sectionC.name; it.sectionDesc = sectionC.desc; it.categories = (it.categories || []).concat(['suggested']); });

  const allItems = [...watching, ...queued, ...suggested];
  return {
    type: 'watchlist',
    title: 'Watchlist',
    subtitle: `${watching.length} watching · ${queued.length} queued · ${suggested.length} suggested`,
    sections: [sectionA, sectionB, sectionC].filter(s => s.items.length > 0),
    items: allItems
  };
}

function isVirtualTab(tabId) {
  const def = catalogManifest.find(c => c.id === tabId);
  return def && def.virtual;
}

function getActiveCatalog() {
  if (activeTab === 'watchlist') {
    catalogs['watchlist'] = buildWatchlistCatalog();
    return catalogs['watchlist'];
  }
  return catalogs[activeTab];
}

function render() {
  if (activeTab !== 'watchlist' && !catalogs[activeTab]) return;
  const catalog = getActiveCatalog();
  document.getElementById('tab-subtitle').textContent = catalog.subtitle;

  const container = document.getElementById('items-container');
  container.innerHTML = '';
  let lastSection = null;

  // Apply per-section sort if a non-default sort is active
  const sort = getActiveSort(activeTab);
  let renderItems;
  if (sort === 'default') {
    renderItems = catalog.items;
  } else {
    // Group by section then sort within group, preserving section order
    const sectionOrder = [];
    const grouped = {};
    catalog.items.forEach(it => {
      if (!(it.section in grouped)) { grouped[it.section] = []; sectionOrder.push(it.section); }
      grouped[it.section].push(it);
    });
    renderItems = [];
    sectionOrder.forEach(sec => {
      sortItems(grouped[sec]).forEach(it => renderItems.push(it));
    });
  }

  renderItems.forEach(item => {
    if (item.section !== lastSection) {
      const sectionItems = catalog.items.filter(f => f.section === item.section);
      const visibleCount = sectionItems.filter(it => itemMatchesFilter(it) && itemMatchesCategory(it)).length;
      if (visibleCount > 0) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'section-header';
        const parts = item.section.split('.');
        sectionEl.innerHTML = `
          <div class="ornament">· · ·</div>
          <div class="section-num">${parts[0]}</div>
          <h2 class="section-title">${parts.slice(1).join('.').trim()}</h2>
          <p class="section-desc">${item.sectionDesc}</p>
        `;
        container.appendChild(sectionEl);
      }
      lastSection = item.section;
    }
    if (!itemMatchesFilter(item)) return;
    if (!itemMatchesCategory(item)) return;

    // For watchlist virtual tab, items operate on their source tab's state
    const itemTab = item._watchlist_source_tab || activeTab;

    const status = getStatus(item.id, itemTab);
    const rating = getRating(item.id, itemTab);
    const reactionTags = getTags(item.id, itemTab);
    const notes = getNotes(item.id, itemTab);
    const itemEl = document.createElement('div');
    let priorityClass = '';
    if (item.priority === 'high') priorityClass = ' priority-high';
    if (item.priority === 'med') priorityClass = ' priority-med';
    itemEl.className = 'item' + priorityClass;
    itemEl.dataset.id = item.id;
    itemEl.dataset.status = status;
    itemEl.tabIndex = 0;  // Focusable for D-pad nav
    if (expandedIds.has(item.id)) itemEl.classList.add('expanded');

    const criticsHtml = (item.critics || []).map(c => `
      <div class="critic-block">
        <div class="critic-label"><span class="crit">${c.who}</span></div>
        <p>${c.quote}</p>
      </div>
    `).join('');

    const priorityBadge = item.priority ? `<span class="priority-badge ${item.priority}">${priorityLabel(item.priority)}</span>` : '';
    const ratingBadge = rating !== 'none' ? `<span class="rating-badge ${rating}">${ratingLabel(rating)}</span>` : '';
    const commitmentBadge = item.commitment ? `<span class="commitment">${item.commitment}</span>` : '';
    const sourceBadge = (activeTab === 'watchlist' && item._watchlist_source_label) ? `<span class="source-badge">${item._watchlist_source_label}</span>` : '';
    const plexMatch = isPlexConfigured() ? plexHasItem(item) : null;
    const plexBadge = plexMatch ? `<span class="plex-badge" title="In your Plex library">⊕ Plex</span>` : '';
    const whyHtml = item.whyPriority ? `<div class="why-priority"><strong>Why this priority:</strong> ${item.whyPriority}</div>` : '';

    const itemTagSet = getTagSetForItem(item);
    const itemPositive = itemTagSet.positive;
    const itemNegative = itemTagSet.negative;
    const posTagsHtml = itemPositive.map(t => {
      const active = reactionTags.includes(t);
      return `<button class="tag-btn ${active ? 'active-pos' : ''}" data-tag="${t}">${t}</button>`;
    }).join('');
    const negTagsHtml = itemNegative.map(t => {
      const active = reactionTags.includes(t);
      return `<button class="tag-btn ${active ? 'active-neg' : ''}" data-tag="${t}">${t}</button>`;
    }).join('');

    let metaLine = `${item.year}`;
    if (item.dir) metaLine += `<span class="dot">·</span>${item.dir}`;
    if (item.network) metaLine += `<span class="dot">·</span>${item.network}`;
    if (item.country) metaLine += `<span class="dot">·</span>${item.country}`;
    if (item.runtime) metaLine += `<span class="dot">·</span>${item.runtime}`;
    const seasonsLine = item.seasons ? `<div class="item-meta" style="margin-top:2px">${item.seasons}</div>` : '';

    itemEl.innerHTML = `
      <div class="item-head">
        <div class="order-num">${String(item.order).padStart(2, '0')}</div>
        <div class="item-info">
          <h3 class="item-title">${item.title}</h3>
          <div class="item-meta">${metaLine}</div>
          ${seasonsLine}
          <div class="badge-row">${sourceBadge}${plexBadge}${commitmentBadge}${priorityBadge}${ratingBadge}</div>
        </div>
        <div class="status-pill ${status === 'none' ? '' : status}">${statusIcon(status)}</div>
      </div>
      <div class="item-body">
        ${whyHtml}
        <p class="pitch">${item.pitch || ''}</p>
        ${criticsHtml}
        <div class="actions">
          <button class="action-btn ${status === 'queued' ? 'active-queued' : ''}" data-action="queued">Queue</button>
          <button class="action-btn ${status === 'watching' ? 'active-watching' : ''}" data-action="watching">Watching</button>
          <button class="action-btn ${status === 'watched' ? 'active-watched' : ''}" data-action="watched">Watched</button>
          <button class="action-btn ${status === 'skip' ? 'active-skip' : ''}" data-action="skip">Pass</button>
          <button class="action-btn" data-action="none">Clear</button>
          ${plexMatch ? `<button class="plex-play-btn" data-plex-key="${plexMatch.ratingKey}">▶ Play on Plex</button>` : ''}
        </div>
        <div class="rating-section">
          <div class="rating-label">Your reaction</div>
          <div class="rating-buttons">
            <button class="rating-btn ${rating === 'loved' ? 'active-loved' : ''}" data-rating="loved">Loved</button>
            <button class="rating-btn ${rating === 'liked' ? 'active-liked' : ''}" data-rating="liked">Liked</button>
            <button class="rating-btn ${rating === 'mixed' ? 'active-mixed' : ''}" data-rating="mixed">Mixed</button>
            <button class="rating-btn ${rating === 'disliked' ? 'active-disliked' : ''}" data-rating="disliked">Disliked</button>
          </div>
          <div class="tag-group-label">What worked</div>
          <div class="tag-cloud">${posTagsHtml}</div>
          <div class="tag-group-label">What didn't</div>
          <div class="tag-cloud">${negTagsHtml}</div>
        </div>
        <textarea class="notes-input" placeholder="Notes after viewing..." data-id="${item.id}">${notes}</textarea>
      </div>
    `;

    itemEl.querySelector('.item-head').addEventListener('click', (e) => {
      if (e.target.classList.contains('status-pill')) return;
      if (expandedIds.has(item.id)) { expandedIds.delete(item.id); itemEl.classList.remove('expanded'); }
      else { expandedIds.add(item.id); itemEl.classList.add('expanded'); }
    });
    itemEl.querySelector('.status-pill').addEventListener('click', (e) => {
      e.stopPropagation(); cycleStatus(item.id, itemTab);
    });
    itemEl.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); setStatus(item.id, btn.dataset.action, itemTab); });
    });
    const plexPlayBtn = itemEl.querySelector('.plex-play-btn');
    if (plexPlayBtn) {
      plexPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ratingKey = plexPlayBtn.dataset.plexKey;
        // Set status to watching automatically when launching playback
        setStatus(item.id, 'watching', itemTab);
        // Try the deep link — Plex Android TV catches plex://
        const deepLink = plexDeepLinkUrl(ratingKey);
        window.location.href = deepLink;
        // Fallback: if deep link doesn't fire (browser blocks unknown protocol), open Plex web client
        setTimeout(() => {
          const fallbackUrl = `${getPlexServerUrl()}/web/index.html#!/server/${getPlexClientId() || ''}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`;
          window.open(fallbackUrl, '_blank');
        }, 1000);
      });
    }
    itemEl.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); setRating(item.id, btn.dataset.rating, itemTab); });
    });
    itemEl.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggleTag(item.id, btn.dataset.tag, itemTab); });
    });
    itemEl.querySelector('.notes-input').addEventListener('blur', (e) => setNotes(item.id, e.target.value, itemTab));
    container.appendChild(itemEl);
  });

  updateStats();
}

function switchTab(tab) {
  const def = catalogManifest.find(c => c.id === tab);
  if (!def) return;
  if (!def.virtual && !catalogs[tab]) return;
  const previousTab = activeTab;
  activeTab = tab;
  activeFilter = 'all';
  expandedIds.clear();
  saveActiveTab();
  // Category-filter memory management:
  // When leaving a tab with a non-default category set, start a 30s clear timer.
  // When entering a tab, cancel any pending clear timer for it (we're back).
  if (previousTab && previousTab !== tab && getActiveCategory(previousTab) !== 'all') {
    scheduleTabCategoryClear(previousTab);
  }
  cancelTabCategoryClear(tab);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  buildCategoryFilters();
  buildFilters();
  render();
  // Scroll active tab into view
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (activeBtn && activeBtn.scrollIntoView) {
    activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function setupModals() {
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (isVirtualTab(activeTab)) {
      alert('The Watchlist tab is virtual and cannot be reset directly. Reset individual tabs to clear their data.');
      return;
    }
    if (!confirm(`Reset ${activeTab} progress? This restores seed data for this tab only.`)) return;
    state[activeTab] = JSON.parse(JSON.stringify(SEED_STATE[activeTab] || {}));
    saveState(); render();
  });
  document.getElementById('export-btn').addEventListener('click', () => {
    document.getElementById('export-text').value = JSON.stringify(state, null, 2);
    document.getElementById('export-modal').classList.add('active');
  });
  document.getElementById('export-close').addEventListener('click', () => {
    document.getElementById('export-modal').classList.remove('active');
  });
  document.getElementById('export-copy').addEventListener('click', () => {
    const ta = document.getElementById('export-text');
    ta.select(); ta.setSelectionRange(0, 99999);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(
          () => alert('Copied to clipboard.'),
          () => { document.execCommand('copy'); alert('Copied via fallback.'); }
        );
      } else { document.execCommand('copy'); alert('Copied.'); }
    } catch (e) { alert('Manually select and copy.'); }
  });
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-text').value = '';
    document.getElementById('import-modal').classList.add('active');
  });
  document.getElementById('import-close').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('active');
  });
  document.getElementById('import-confirm').addEventListener('click', () => {
    const input = document.getElementById('import-text').value;
    if (!input.trim()) { alert('Nothing to import.'); return; }
    try {
      const parsed = JSON.parse(input);
      let newState;
      if (typeof parsed === 'object' && (parsed.scifi || parsed["scifi-tv"] || parsed.films || parsed["tv-limited"] || parsed["tv-ongoing"])) {
        newState = parsed;
      } else {
        newState = { ...state, [activeTab]: parsed };
      }
      catalogManifest.forEach(c => { if (!newState[c.id]) newState[c.id] = {}; });
      newState = normalizeStateIds(newState);

      // Build diagnostic before commit
      const diagnostic = buildImportDiagnostic(newState);

      state = newState;
      saveState(); render();
      document.getElementById('import-modal').classList.remove('active');

      // Show import summary modal instead of generic alert
      document.getElementById('import-summary-content').innerHTML = renderImportDiagnostic(diagnostic);
      document.getElementById('import-summary-modal').classList.add('active');
    } catch (e) { alert('Invalid format: ' + e.message); }
  });
  document.getElementById('import-summary-close').addEventListener('click', () => {
    document.getElementById('import-summary-modal').classList.remove('active');
  });

  // === Search modal ===
  document.getElementById('search-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-modal').classList.add('active');
    setTimeout(() => document.getElementById('search-input').focus(), 50);
  });
  document.getElementById('search-close').addEventListener('click', () => {
    document.getElementById('search-modal').classList.remove('active');
  });
  let searchDebounce = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => doSearch(e.target.value), 100);
  });

  // === Notes search modal ===
  document.getElementById('notes-search-btn').addEventListener('click', () => {
    document.getElementById('notes-search-input').value = '';
    document.getElementById('notes-search-results').innerHTML = '';
    document.getElementById('notes-search-modal').classList.add('active');
    setTimeout(() => document.getElementById('notes-search-input').focus(), 50);
  });
  document.getElementById('notes-search-close').addEventListener('click', () => {
    document.getElementById('notes-search-modal').classList.remove('active');
  });
  let notesDebounce = null;
  document.getElementById('notes-search-input').addEventListener('input', (e) => {
    if (notesDebounce) clearTimeout(notesDebounce);
    notesDebounce = setTimeout(() => doNotesSearch(e.target.value), 100);
  });

  // === Stats modal ===
  document.getElementById('stats-btn').addEventListener('click', () => {
    document.getElementById('stats-content').innerHTML = renderStats();
    document.getElementById('stats-modal').classList.add('active');
  });
  document.getElementById('stats-close').addEventListener('click', () => {
    document.getElementById('stats-modal').classList.remove('active');
  });

  // === Triage modals ===
  document.getElementById('triage-queue-btn').addEventListener('click', () => startTriage('queue'));
  document.getElementById('triage-suggest-btn').addEventListener('click', () => startTriage('suggest'));

  // === Settings modal ===
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('settings-btn').addEventListener('click', () => {
    // Populate fields
    const pref = getDisplayModePref();
    document.querySelectorAll('input[name="display-mode"]').forEach(r => {
      r.checked = (r.value === pref);
    });
    document.getElementById('plex-server-url').value = getPlexServerUrl();
    document.getElementById('plex-token').value = getPlexToken();
    document.getElementById('plex-client-id').value = getPlexClientId();
    updatePlexStatusLine();
    settingsModal.classList.add('active');
  });
  document.getElementById('settings-close').addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });
  document.getElementById('settings-save').addEventListener('click', () => {
    const mode = document.querySelector('input[name="display-mode"]:checked')?.value || 'auto';
    setDisplayModePref(mode);
    setPlexServerUrl(document.getElementById('plex-server-url').value.trim());
    setPlexToken(document.getElementById('plex-token').value.trim());
    setPlexClientId(document.getElementById('plex-client-id').value.trim());
    applyDisplayMode();
    settingsModal.classList.remove('active');
    if (isPlexConfigured()) fetchPlexLibrary();
    render();
  });
  document.getElementById('plex-test').addEventListener('click', async () => {
    const url = document.getElementById('plex-server-url').value.trim().replace(/\/$/, '');
    const token = document.getElementById('plex-token').value.trim();
    const status = document.getElementById('plex-status');
    if (!url || !token) {
      status.textContent = 'Enter both server URL and token first.';
      status.className = 'settings-status err';
      return;
    }
    status.textContent = 'Testing...';
    status.className = 'settings-status';
    try {
      const resp = await fetch(`${url}/identity?X-Plex-Token=${encodeURIComponent(token)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) {
        const data = await resp.json();
        const name = data?.MediaContainer?.machineIdentifier || 'unknown';
        status.textContent = `Connected. Server ID: ${name.slice(0, 20)}...`;
        status.className = 'settings-status ok';
      } else {
        status.textContent = `Failed: HTTP ${resp.status}. Check URL/token.`;
        status.className = 'settings-status err';
      }
    } catch (e) {
      status.textContent = `Error: ${e.message}. Likely CORS or network.`;
      status.className = 'settings-status err';
    }
  });
  document.getElementById('plex-refresh').addEventListener('click', async () => {
    const status = document.getElementById('plex-status');
    if (!isPlexConfigured()) {
      status.textContent = 'Save Plex settings first.';
      status.className = 'settings-status err';
      return;
    }
    status.textContent = 'Refreshing library...';
    status.className = 'settings-status';
    await fetchPlexLibrary();
    status.textContent = `Library cached: ${plexLibrary.size} items.`;
    status.className = 'settings-status ok';
  });
}

function updatePlexStatusLine() {
  const status = document.getElementById('plex-status');
  if (!status) return;
  if (!isPlexConfigured()) {
    status.textContent = 'Not configured.';
    status.className = 'settings-status';
  } else if (plexLibrary.size === 0) {
    status.textContent = 'Configured but library not yet fetched. Click Test connection or Refresh library.';
    status.className = 'settings-status';
  } else {
    const ago = plexLibraryLoadedAt ? Math.floor((Date.now() - plexLibraryLoadedAt) / 60000) : 0;
    status.textContent = `Library: ${plexLibrary.size} items (refreshed ${ago}m ago).`;
    status.className = 'settings-status ok';
  }
}

// === Import diagnostic ===
function buildImportDiagnostic(newState) {
  let totalEntries = 0, knownIds = 0, unknownIds = 0, withRating = 0, withTags = 0, withNotes = 0;
  const unknownByTab = {};
  const tabsTouched = new Set();

  for (const tab in newState) {
    const tabState = newState[tab];
    if (!tabState || typeof tabState !== 'object') continue;
    tabsTouched.add(tab);
    const cat = catalogs[tab];
    const validIds = cat ? new Set(cat.items.map(it => it.id)) : new Set();
    for (const id in tabState) {
      const e = tabState[id];
      if (!e || typeof e !== 'object') continue;
      totalEntries++;
      if (cat && validIds.has(id)) knownIds++;
      else { unknownIds++; (unknownByTab[tab] = unknownByTab[tab] || []).push(id); }
      if (e.rating) withRating++;
      if (e.reactionTags && e.reactionTags.length) withTags++;
      if (e.notes) withNotes++;
    }
  }
  return { totalEntries, knownIds, unknownIds, unknownByTab, withRating, withTags, withNotes, tabCount: tabsTouched.size };
}

function renderImportDiagnostic(d) {
  let html = '';
  html += `<div class="stat-line"><span>Total entries imported</span><strong>${d.totalEntries}</strong></div>`;
  html += `<div class="stat-line"><span>Tabs covered</span><strong>${d.tabCount}</strong></div>`;
  html += `<div class="stat-line"><span>Matched to catalog</span><strong>${d.knownIds}</strong></div>`;
  html += `<div class="stat-line"><span>Unknown IDs (orphaned)</span><strong>${d.unknownIds}</strong></div>`;
  html += `<div class="stat-line"><span>With rating</span><strong>${d.withRating}</strong></div>`;
  html += `<div class="stat-line"><span>With reaction tags</span><strong>${d.withTags}</strong></div>`;
  html += `<div class="stat-line"><span>With notes</span><strong>${d.withNotes}</strong></div>`;
  if (d.unknownIds > 0) {
    html += `<h4>Orphaned IDs (preserved but won't render)</h4>`;
    for (const tab in d.unknownByTab) {
      html += `<div style="margin-top:6px"><strong>${tab}:</strong> ${d.unknownByTab[tab].slice(0,5).join(', ')}${d.unknownByTab[tab].length > 5 ? ` (+${d.unknownByTab[tab].length - 5} more)` : ''}</div>`;
    }
  }
  return html;
}

// === Title/director/country/section/pitch search ===
function doSearch(query) {
  const q = (query || '').trim().toLowerCase();
  const out = document.getElementById('search-results');
  if (q.length < 2) { out.innerHTML = '<div class="search-result-empty">Type at least 2 characters.</div>'; return; }

  const matches = [];
  for (const tabId in catalogs) {
    const cat = catalogs[tabId];
    cat.items.forEach(item => {
      let score = -1;
      const t = (item.title || '').toLowerCase();
      const d = (item.dir || '').toLowerCase();
      const c = (item.country || '').toLowerCase();
      const s = (item.section || '').toLowerCase();
      const p = (item.pitch || '').toLowerCase();
      if (t.startsWith(q)) score = 0;
      else if (t.includes(q)) score = 1;
      else if (d.includes(q)) score = 2;
      else if (c.includes(q)) score = 3;
      else if (s.includes(q)) score = 4;
      else if (p.includes(q)) score = 5;
      if (score >= 0) matches.push({ item, tabId, tabLabel: cat.title || tabId, score });
    });
  }
  matches.sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title));
  if (matches.length === 0) { out.innerHTML = '<div class="search-result-empty">No matches.</div>'; return; }

  out.innerHTML = matches.slice(0, 50).map(m => {
    const it = m.item;
    const meta = [it.year, it.dir, m.tabLabel].filter(Boolean).join(' · ');
    return `<div class="search-result" data-tab="${m.tabId}" data-id="${it.id}">
      <div class="search-result-title">${highlightMatch(it.title, q)}</div>
      <div class="search-result-meta">${highlightMatch(meta, q)}</div>
    </div>`;
  }).join('');
  out.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const targetTab = el.dataset.tab;
      const targetId = el.dataset.id;
      document.getElementById('search-modal').classList.remove('active');
      switchTab(targetTab);
      setTimeout(() => {
        const target = document.querySelector(`.item[data-id="${targetId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('expanded');
          target.style.outline = '2px solid var(--accent)';
          setTimeout(() => target.style.outline = '', 1500);
        }
      }, 100);
    });
  });
}
function highlightMatch(text, q) {
  if (!text || !q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + q.length) + '</mark>' + text.slice(idx + q.length);
}

// === Notes search ===
function doNotesSearch(query) {
  const q = (query || '').trim().toLowerCase();
  const out = document.getElementById('notes-search-results');
  if (q.length < 2) { out.innerHTML = '<div class="search-result-empty">Type at least 2 characters.</div>'; return; }

  const matches = [];
  for (const tab in state) {
    const tabState = state[tab];
    if (!tabState) continue;
    for (const id in tabState) {
      const notes = (tabState[id] && tabState[id].notes) || '';
      if (notes && notes.toLowerCase().includes(q)) {
        const cat = catalogs[tab];
        const item = cat ? cat.items.find(it => it.id === id) : null;
        if (item) {
          matches.push({ item, tab, tabLabel: cat.title || tab, snippet: notes });
        }
      }
    }
  }
  matches.sort((a, b) => a.item.title.localeCompare(b.item.title));
  if (matches.length === 0) { out.innerHTML = '<div class="search-result-empty">No matches in your notes.</div>'; return; }

  out.innerHTML = matches.map(m => {
    return `<div class="search-result" data-tab="${m.tab}" data-id="${m.item.id}">
      <div class="search-result-title">${m.item.title} <span class="source-badge">${m.tabLabel}</span></div>
      <div class="search-result-meta" style="margin-top:4px;font-style:italic">"${highlightMatch(m.snippet, q)}"</div>
    </div>`;
  }).join('');
  out.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const targetTab = el.dataset.tab;
      const targetId = el.dataset.id;
      document.getElementById('notes-search-modal').classList.remove('active');
      switchTab(targetTab);
      setTimeout(() => {
        const target = document.querySelector(`.item[data-id="${targetId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('expanded');
          target.style.outline = '2px solid var(--accent)';
          setTimeout(() => target.style.outline = '', 1500);
        }
      }, 100);
    });
  });
}

// === Stats engine ===
function renderStats() {
  let totalCatalogItems = 0, watched = 0, watching = 0, queued = 0, skip = 0, rated = 0;
  const ratingCounts = { loved: 0, liked: 0, mixed: 0, disliked: 0 };
  const tagCounts = {};
  const perTab = {};
  let longestQueue = { tab: '-', count: 0 };

  for (const tab in catalogs) {
    const cat = catalogs[tab];
    const tabSt = { watched: 0, watching: 0, queued: 0, total: cat.items.length };
    cat.items.forEach(item => {
      totalCatalogItems++;
      const e = (state[tab] && state[tab][item.id]) || {};
      const st = e.status || 'none';
      if (st === 'watched') { watched++; tabSt.watched++; }
      else if (st === 'watching') { watching++; tabSt.watching++; }
      else if (st === 'queued') { queued++; tabSt.queued++; }
      else if (st === 'skip') skip++;
      if (e.rating && ratingCounts.hasOwnProperty(e.rating)) { rated++; ratingCounts[e.rating]++; }
      if (e.reactionTags) {
        e.reactionTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      }
    });
    perTab[tab] = tabSt;
    if (tabSt.queued > longestQueue.count) longestQueue = { tab: cat.title || tab, count: tabSt.queued };
  }

  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const totalRated = rated;

  // Recent activity: items touched in last 7/30 days
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let updated7 = 0, updated30 = 0;
  for (const tab in state) {
    for (const id in state[tab]) {
      const lu = (state[tab][id] && state[tab][id].lastUpdated) || 0;
      if (lu) {
        if (now - lu < 7 * day) updated7++;
        if (now - lu < 30 * day) updated30++;
      }
    }
  }

  let html = '<h4>Status</h4>';
  html += `<div class="stat-line"><span>Total catalogued</span><strong>${totalCatalogItems}</strong></div>`;
  html += `<div class="stat-line"><span>Watched</span><strong>${watched}</strong></div>`;
  html += `<div class="stat-line"><span>Watching</span><strong>${watching}</strong></div>`;
  html += `<div class="stat-line"><span>Queued</span><strong>${queued}</strong></div>`;
  html += `<div class="stat-line"><span>Skipped</span><strong>${skip}</strong></div>`;
  html += `<div class="stat-line"><span>Rated</span><strong>${rated}</strong></div>`;
  html += '<h4>Ratings distribution</h4>';
  html += `<div class="stat-line"><span>Loved</span><strong>${ratingCounts.loved}${totalRated ? ` (${Math.round(ratingCounts.loved * 100 / totalRated)}%)` : ''}</strong></div>`;
  html += `<div class="stat-line"><span>Liked</span><strong>${ratingCounts.liked}${totalRated ? ` (${Math.round(ratingCounts.liked * 100 / totalRated)}%)` : ''}</strong></div>`;
  html += `<div class="stat-line"><span>Mixed</span><strong>${ratingCounts.mixed}${totalRated ? ` (${Math.round(ratingCounts.mixed * 100 / totalRated)}%)` : ''}</strong></div>`;
  html += `<div class="stat-line"><span>Disliked</span><strong>${ratingCounts.disliked}${totalRated ? ` (${Math.round(ratingCounts.disliked * 100 / totalRated)}%)` : ''}</strong></div>`;
  html += '<h4>Activity</h4>';
  html += `<div class="stat-line"><span>Updated last 7 days</span><strong>${updated7}</strong></div>`;
  html += `<div class="stat-line"><span>Updated last 30 days</span><strong>${updated30}</strong></div>`;
  html += `<div class="stat-line"><span>Longest queue</span><strong>${longestQueue.tab} (${longestQueue.count})</strong></div>`;
  if (topTags.length) {
    html += '<h4>Top reaction tags</h4>';
    topTags.forEach(([tag, n]) => {
      html += `<div class="stat-line"><span>${tag}</span><strong>${n}</strong></div>`;
    });
  }
  html += '<h4>Per tab</h4>';
  Object.entries(perTab).sort((a, b) => b[1].watched - a[1].watched).slice(0, 10).forEach(([tab, s]) => {
    const cat = catalogs[tab];
    html += `<div class="stat-line"><span>${cat ? cat.title : tab}</span><strong>${s.watched}/${s.total} watched</strong></div>`;
  });
  return html;
}

// === Triage mode ===
let triageState = null;  // { mode, queue, idx }
function startTriage(mode) {
  // Build the queue from watchlist sections
  const wl = buildWatchlistCatalog();
  const sectionItems = mode === 'queue'
    ? wl.sections.find(s => s.name.startsWith('B.'))?.items
    : wl.sections.find(s => s.name.startsWith('C.'))?.items;
  if (!sectionItems || sectionItems.length === 0) {
    alert(mode === 'queue' ? 'Your queue is empty.' : 'No system suggestions to review.');
    return;
  }
  triageState = { mode, queue: sectionItems.slice(), idx: 0 };
  document.getElementById('triage-modal').classList.add('active');
  renderTriage();
}
function renderTriage() {
  if (!triageState) return;
  const { mode, queue, idx } = triageState;
  if (idx >= queue.length) {
    // Done
    document.getElementById('triage-card').innerHTML = '<p style="text-align:center;padding:20px">Triage complete.</p>';
    document.getElementById('triage-progress').textContent = `${queue.length} reviewed`;
    document.getElementById('triage-actions').innerHTML = `<button class="action-btn" id="triage-done">Close</button>`;
    document.getElementById('triage-done').addEventListener('click', () => {
      document.getElementById('triage-modal').classList.remove('active');
      triageState = null;
      render();
    });
    return;
  }
  const item = queue[idx];
  const sourceTab = item._watchlist_source_tab;
  const titleEl = document.getElementById('triage-title');
  titleEl.textContent = mode === 'queue' ? 'Triage your queue' : 'Triage suggested items';
  document.getElementById('triage-progress').textContent = `${idx + 1} / ${queue.length}`;

  const meta = [item.year, item.dir, item.country, item.runtime].filter(Boolean).join(' · ');
  const why = item.whyPriority ? `<div class="why">${item.whyPriority}</div>` : '';
  document.getElementById('triage-card').innerHTML = `
    <span class="source-badge">${item._watchlist_source_label}</span>
    ${item.priority ? `<span class="priority-badge ${item.priority}" style="margin-left:6px">${priorityLabel(item.priority)}</span>` : ''}
    <h4>${item.title}</h4>
    <div class="meta">${meta}</div>
    ${why}
    <p>${item.pitch || ''}</p>
  `;

  if (mode === 'queue') {
    // Triaging YOUR queue: keep / drop / mark-watching
    document.getElementById('triage-actions').innerHTML = `
      <button class="action-btn" data-act="keep">Keep queued</button>
      <button class="action-btn" data-act="watching">Start watching</button>
      <button class="action-btn" data-act="drop">Drop (clear)</button>
      <button class="action-btn" data-act="skip">Pass</button>
    `;
  } else {
    // Triaging SUGGESTIONS: queue / start watching / not for me
    document.getElementById('triage-actions').innerHTML = `
      <button class="action-btn" data-act="queue">Queue</button>
      <button class="action-btn" data-act="watching">Start watching</button>
      <button class="action-btn" data-act="skip">Not for me</button>
      <button class="action-btn" data-act="next">Skip for now</button>
    `;
  }
  document.querySelectorAll('#triage-actions .action-btn').forEach(btn => {
    btn.addEventListener('click', () => triageAction(btn.dataset.act));
  });
}
function triageAction(act) {
  if (!triageState) return;
  const item = triageState.queue[triageState.idx];
  const tab = item._watchlist_source_tab;
  if (act === 'keep' || act === 'next') {
    // No state change
  } else if (act === 'watching') {
    setStatus(item.id, 'watching', tab);
  } else if (act === 'queue') {
    setStatus(item.id, 'queued', tab);
  } else if (act === 'drop') {
    setStatus(item.id, 'none', tab);
  } else if (act === 'skip') {
    setStatus(item.id, 'skip', tab);
  }
  triageState.idx++;
  renderTriage();
}

(async () => {
  await loadCatalogManifest();
  loadActiveTab();
  loadState();
  await loadCatalogs();
  applyDisplayMode();
  buildTabs();
  setupModals();
  buildCategoryFilters();
  buildFilters();
  render();

  // If Plex is already configured, fetch the library in the background
  if (isPlexConfigured()) {
    fetchPlexLibrary();
  }

  // === D-pad / arrow-key navigation ===
  // Active by default in TV mode; harmless in phone mode (browsers handle arrows in inputs naturally).
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('tv-mode')) return;
    // Don't intercept inside text inputs or textareas
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const key = e.key;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','Backspace'].includes(key)) return;

    if (key === 'Escape' || key === 'Backspace') {
      // Close any open modal
      const openModal = document.querySelector('.modal.active');
      if (openModal) {
        e.preventDefault();
        openModal.classList.remove('active');
        return;
      }
      // Otherwise, focus the tab nav
      const activeBtn = document.querySelector('.tab-btn.active');
      if (activeBtn) { e.preventDefault(); activeBtn.focus(); }
      return;
    }

    if (key === 'Enter') {
      // Default browser behavior handles Enter on focused button. Only intercept if focus is on .item card.
      const focused = document.activeElement;
      if (focused && focused.classList.contains('item')) {
        e.preventDefault();
        focused.click();
      }
      return;
    }

    e.preventDefault();
    const focused = document.activeElement;
    if (!focused || focused === document.body) {
      // Focus first item
      const firstItem = document.querySelector('.item');
      if (firstItem) firstItem.focus();
      return;
    }

    // D-pad logic: simple "find nearest focusable in direction"
    const focusables = Array.from(document.querySelectorAll(
      '.tab-btn, .filter-btn, .category-btn, .header-btn, .item, .action-btn, .rating-btn, .tag-btn, .plex-play-btn, .sort-select, button, a, input'
    )).filter(el => el.offsetParent !== null && !el.disabled);
    if (focusables.length === 0) return;

    const r = focused.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    let best = null;
    let bestDist = Infinity;
    focusables.forEach(el => {
      if (el === focused) return;
      const er = el.getBoundingClientRect();
      const ecx = er.left + er.width / 2;
      const ecy = er.top + er.height / 2;
      const dx = ecx - cx;
      const dy = ecy - cy;
      let valid = false;
      if (key === 'ArrowRight' && dx > 5) valid = Math.abs(dy) < 100 || Math.abs(dy) < Math.abs(dx) * 1.5;
      else if (key === 'ArrowLeft' && dx < -5) valid = Math.abs(dy) < 100 || Math.abs(dy) < Math.abs(dx) * 1.5;
      else if (key === 'ArrowDown' && dy > 5) valid = Math.abs(dx) < 200 || Math.abs(dx) < Math.abs(dy) * 1.5;
      else if (key === 'ArrowUp' && dy < -5) valid = Math.abs(dx) < 200 || Math.abs(dx) < Math.abs(dy) * 1.5;
      if (!valid) return;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { bestDist = dist; best = el; }
    });

    if (best) {
      best.focus();
      best.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  });

  // App-backgrounded handling: clear ALL category memory after 5 minutes hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (appHiddenClearTimer) clearTimeout(appHiddenClearTimer);
      appHiddenClearTimer = setTimeout(() => {
        clearAllCategoryMemory();
        appHiddenClearTimer = null;
        if (typeof buildCategoryFilters === 'function') {
          buildCategoryFilters();
          render();
        }
      }, APP_HIDDEN_GRACE_MS);
    } else if (document.visibilityState === 'visible') {
      if (appHiddenClearTimer) {
        clearTimeout(appHiddenClearTimer);
        appHiddenClearTimer = null;
      }
    }
  });
})();
