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
  },
  'film-musical': {
    positive: ["Score is the engine","Bravura staging","Powerhouse vocals","Triple-threat","Endlessly rewatchable","Earned emotion","Subversive or knowing","Cult magnetism"],
    negative: ["Score doesn't land","Vocally weak","Cuts mask the dance","Book is the problem","Joyless","Dated tropes"]
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
  'pre1960': 'film-narrative',
  'musicals': 'film-musical',
  'heroes-comics': 'film-narrative',
  'heroes-comics-tv': 'tv-prestige'
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
  "pre1960": {},
  "musicals": {
    "singin-in-the-rain-1952": { "status": "watched", "rating": "loved", "reactionTags": ["Score is the engine","Bravura staging","Triple-threat","Endlessly rewatchable","Earned emotion"], "notes": "All-time favorite. Watched countless times. Know every word, every dance, every beat." },
    "the-rocky-horror-picture-show-1975": { "status": "watched", "rating": "loved", "reactionTags": ["Cult magnetism","Subversive or knowing"] },
    "wicked-2024": { "status": "watched", "rating": "loved", "reactionTags": ["Powerhouse vocals","Earned emotion","Subversive or knowing"], "notes": "Loved. Wicked: For Good (Part 2) on the queue." },
    "anastasia-1997": { "status": "watched", "rating": "loved", "reactionTags": ["Score is the engine","Earned emotion","Endlessly rewatchable"] },
    "pitch-perfect-2012": { "status": "watched", "rating": "loved", "reactionTags": ["Powerhouse vocals","Triple-threat","Earned emotion"] },
    "pitch-perfect-2-2015": { "status": "watched", "rating": "loved", "reactionTags": ["Powerhouse vocals","Earned emotion"] },
    "pitch-perfect-3-2017": { "status": "watched", "rating": "loved", "reactionTags": ["Earned emotion"] },
    "south-park-bigger-longer-uncut-1999": { "status": "watched", "rating": "loved", "reactionTags": ["Subversive or knowing","Score is the engine"], "notes": "Wants a rewatch." },

    "les-mis-rables-2012": { "status": "watched", "rating": "disliked", "reactionTags": ["Vocally weak","Book is the problem","Joyless"] },
    "mamma-mia-2008": { "status": "watched", "rating": "disliked", "reactionTags": ["Vocally weak","Book is the problem","Joyless"] },
    "la-la-land-2016": { "status": "watched", "rating": "disliked", "reactionTags": ["Vocally weak"] },
    "white-christmas-1954": { "status": "watched", "rating": "disliked", "reactionTags": ["Score doesn't land","Joyless","Dated tropes"] },
    "holiday-inn-1942": { "status": "watched", "rating": "disliked", "reactionTags": ["Dated tropes","Joyless","Book is the problem"] },
    "across-the-universe-2007": { "status": "watched", "rating": "disliked", "reactionTags": ["Book is the problem","Joyless"] },

    "mary-poppins-1964": { "status": "watched", "rating": "liked" },
    "mary-poppins-returns-2018": { "status": "watched", "rating": "mixed", "notes": "OG was lightyears better." },
    "the-prince-of-egypt-1998": { "status": "watched", "rating": "mixed", "notes": "OK but no rewatches." },

    "the-little-mermaid-1989": { "status": "watched", "rating": "liked" },
    "beauty-and-the-beast-1991": { "status": "watched", "rating": "liked" },
    "aladdin-1992": { "status": "watched", "rating": "liked" },
    "the-lion-king-1994": { "status": "watched", "rating": "liked" },
    "pocahontas-1995": { "status": "watched", "rating": "liked" },
    "the-hunchback-of-notre-dame-1996": { "status": "watched", "rating": "liked" },
    "hercules-1997": { "status": "watched", "rating": "liked" },
    "mulan-1998": { "status": "watched", "rating": "liked" },
    "tarzan-1999": { "status": "watched", "rating": "liked" },
    "west-side-story-2021": { "status": "watched", "rating": "liked" },
    "the-sound-of-music-1965": { "status": "watched", "rating": "liked" },
    "my-fair-lady-1964": { "status": "watched", "rating": "liked" },
    "grease-1978": { "status": "watched", "rating": "liked" },
    "sweeney-todd-the-demon-barber-of-fleet-street-2007": { "status": "watched", "rating": "liked" },
    "into-the-woods-2014": { "status": "watched", "rating": "liked" },
    "hairspray-2007": { "status": "watched", "rating": "liked" },
    "annie-1982": { "status": "watched", "rating": "liked" },
    "dreamgirls-2006": { "status": "watched", "rating": "liked" },
    "the-phantom-of-the-opera-2004": { "status": "watched", "rating": "liked" },
    "the-music-man-1962": { "status": "watched", "rating": "liked" },
    "the-wizard-of-oz-1939": { "status": "watched", "rating": "liked" }
  },
  "heroes-comics": {
    "joker-folie-deux-2024": { "status": "watched" }
  },
  "heroes-comics-tv": {}
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
function plexNormalizeKeyTitleOnly(title) {
  if (!title) return '';
  let t = title.toLowerCase();
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ');
  t = t.replace(/&/g, ' and ');
  t = t.replace(/[\u2019\u2018'`]/g, '');
  t = t.replace(/[^a-z0-9]+/g, '');
  return t.slice(0, 60);
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
  // Check primary title first
  const key = plexNormalizeKey(item.title, item.year);
  if (plexLibrary.get(key)) return plexLibrary.get(key);
  // Check aliases (catalog items can list alternate titles like "QI XL" for "QI")
  if (Array.isArray(item.aliases)) {
    for (const alias of item.aliases) {
      const aliasKey = plexNormalizeKey(alias, item.year);
      if (plexLibrary.get(aliasKey)) return plexLibrary.get(aliasKey);
      // Also check title-only (TV shows often have no year in Plex)
      for (const [libKey, libItem] of plexLibrary.entries()) {
        if (libKey.startsWith(plexNormalizeKeyTitleOnly(alias) + '|')) return libItem;
      }
    }
  }
  return null;
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

// === Plex webhook bridge (Cloudflare Worker) ===
const WEBHOOK_URL_KEY = 'watchtrack-webhook-url';
const WEBHOOK_SECRET_KEY = 'watchtrack-webhook-secret';
const WEBHOOK_LAST_POLL_KEY = 'watchtrack-webhook-last-poll';

function getWebhookUrl() { return localStorage.getItem(WEBHOOK_URL_KEY) || ''; }
function setWebhookUrl(u) {
  if (!u) localStorage.removeItem(WEBHOOK_URL_KEY);
  else localStorage.setItem(WEBHOOK_URL_KEY, u.replace(/\/$/, ''));
}
function getWebhookSecret() { return localStorage.getItem(WEBHOOK_SECRET_KEY) || ''; }
function setWebhookSecret(s) {
  if (!s) localStorage.removeItem(WEBHOOK_SECRET_KEY);
  else localStorage.setItem(WEBHOOK_SECRET_KEY, s);
}
function getWebhookLastPoll() {
  return parseInt(localStorage.getItem(WEBHOOK_LAST_POLL_KEY) || '0');
}
function setWebhookLastPoll(ts) {
  localStorage.setItem(WEBHOOK_LAST_POLL_KEY, String(ts));
}
function isWebhookConfigured() {
  return Boolean(getWebhookUrl() && getWebhookSecret());
}

// Poll the Worker for new events. Apply each one to WatchTrack state.
// Then ack so the Worker deletes them.
async function pollPlexWebhookEvents() {
  if (!isWebhookConfigured()) return { applied: 0, errors: 0 };
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const since = getWebhookLastPoll();
  let applied = 0, errors = 0;
  try {
    const resp = await fetch(`${url}/events?secret=${encodeURIComponent(secret)}&since=${since}`);
    if (!resp.ok) return { applied: 0, errors: 1 };
    const data = await resp.json();
    const events = data.events || [];
    const ackIds = [];
    for (const evt of events) {
      try {
        if (applyPlexEvent(evt)) applied++;
        ackIds.push(evt.id);
      } catch (e) {
        errors++;
      }
    }
    if (ackIds.length > 0) {
      await fetch(`${url}/events/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, eventIds: ackIds }),
      });
    }
    setWebhookLastPoll(Date.now());
    return { applied, errors };
  } catch (e) {
    return { applied: 0, errors: 1 };
  }
}

// Apply a single webhook event to WatchTrack state.
function applyPlexEvent(evt) {
  if (evt.event !== 'media.scrobble') return false;
  if (evt.type !== 'movie' && evt.type !== 'episode' && evt.type !== 'show') return false;

  // For movies, match title+year exactly. For TV, match title only since Plex
  // history doesn't carry the series first-aired year on episode events.
  const isMovie = evt.type === 'movie';
  const matchTitle = isMovie ? evt.title : (evt.grandparentTitle || evt.title);
  const matchYear = isMovie ? evt.year : null;
  if (!matchTitle) return false;

  const movieKey = isMovie ? plexNormalizeKey(matchTitle, matchYear) : null;
  const tvKey = isMovie ? null : plexNormalizeKeyTitleOnly(matchTitle);

  // Search every loaded catalog for a matching item (primary title or alias)
  for (const tabId in catalogs) {
    const cat = catalogs[tabId];
    for (const item of cat.items) {
      const titlesToCheck = [item.title].concat(Array.isArray(item.aliases) ? item.aliases : []);
      let matched = false;
      for (const t of titlesToCheck) {
        if (isMovie) {
          if (plexNormalizeKey(t, item.year) === movieKey) { matched = true; break; }
          // year-fuzz tolerance
          for (const dy of [-1, 1]) {
            if (plexNormalizeKey(t, item.year ? item.year + dy : null) === movieKey) { matched = true; break; }
          }
          if (matched) break;
        } else {
          if (plexNormalizeKeyTitleOnly(t) === tvKey) { matched = true; break; }
        }
      }
      if (matched) {
        if (isMovie) {
          setStatus(item.id, 'watched', tabId);
        } else {
          const cur = getStatus(item.id, tabId);
          if (cur !== 'watched') setStatus(item.id, 'watching', tabId);
        }
        return true;
      }
    }
  }
  return false;
}

// =====================================================================
// BULK SYNC: fetch full Plex history → apply rules → log to Worker KV
// =====================================================================

// Library whitelist (hardcoded — matches Worker config).
const PLEX_BULK_LIBRARY_WHITELIST = new Set(['1', '2']);

// Fetch the full Plex history in pages. Returns array of raw entry objects.
async function fetchFullPlexHistory(progressCb) {
  if (!isPlexConfigured()) throw new Error('Plex not configured');
  const url = getPlexServerUrl();
  const token = getPlexToken();
  const pageSize = 500;
  let start = 0;
  const all = [];
  while (true) {
    const fetchUrl = `${url}/status/sessions/history/all?sort=viewedAt:asc&X-Plex-Token=${encodeURIComponent(token)}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${pageSize}`;
    const resp = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`Plex history fetch ${resp.status}`);
    const data = await resp.json();
    const mc = data?.MediaContainer || {};
    const items = mc.Metadata || [];
    if (items.length === 0) break;
    all.push(...items);
    if (progressCb) progressCb(all.length, mc.totalSize || mc.size || all.length);
    if (items.length < pageSize) break;
    start += pageSize;
    // Safety stop
    if (start > 100000) break;
  }
  return all;
}

// Send the entries to the Worker for durable storage.
async function postViewedIngest(entries) {
  if (!isWebhookConfigured()) return { stored: 0, filtered: 0 };
  const workerUrl = getWebhookUrl();
  const secret = getWebhookSecret();
  // Strip to compact shape — Worker doesn't need everything
  const compact = entries.map(e => ({
    librarySectionID: String(e.librarySectionID || ''),
    title: e.title || '',
    year: e.year || (e.originallyAvailableAt ? parseInt(String(e.originallyAvailableAt).slice(0, 4)) : null),
    type: e.type || '',
    grandparentTitle: e.grandparentTitle || null,
    parentIndex: e.parentIndex != null ? parseInt(e.parentIndex) : null,
    index: e.index != null ? parseInt(e.index) : null,
    viewedAt: e.viewedAt || null,
  }));
  // Post in batches of 200 to stay well under Cloudflare's request size limits
  const BATCH = 200;
  let totalStored = 0, totalFiltered = 0;
  for (let i = 0; i < compact.length; i += BATCH) {
    const slice = compact.slice(i, i + BATCH);
    const resp = await fetch(`${workerUrl}/viewed/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, entries: slice }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Worker ingest failed: ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    totalStored += data.stored || 0;
    totalFiltered += data.filtered || 0;
  }
  return { stored: totalStored, filtered: totalFiltered };
}

// Apply bulk-sync rules to WatchTrack state given the full filtered history.
// Returns a structured report.
function applyBulkSyncRules(entries, episodeCounts) {
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
        const titlesToCheck = [item.title].concat(Array.isArray(item.aliases) ? item.aliases : []);
        let thisMatch = false;
        for (const t of titlesToCheck) {
          if (plexNormalizeKey(t, item.year) === key) { thisMatch = true; break; }
          for (const dy of [-1, 1]) {
            if (plexNormalizeKey(t, item.year ? item.year + dy : null) === key) { thisMatch = true; break; }
          }
          if (thisMatch) break;
        }
        if (thisMatch) {
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
        const titlesToCheck = [item.title].concat(Array.isArray(item.aliases) ? item.aliases : []);
        let thisMatch = false;
        for (const t of titlesToCheck) {
          if (plexNormalizeKeyTitleOnly(t) === key) { thisMatch = true; break; }
        }
        if (thisMatch) {
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

// Top-level orchestrator — runs the full bulk-sync. Calls progressCb at each phase.
async function runBulkSync(progressCb) {
  if (!isPlexConfigured()) throw new Error('Configure Plex in Settings first.');
  if (!isWebhookConfigured()) throw new Error('Configure Plex Webhook Bridge in Settings first.');
  progressCb('Fetching Plex history...', 0);
  const all = await fetchFullPlexHistory((loaded, total) => {
    progressCb(`Fetching Plex history... ${loaded}${total ? ' / ' + total : ''}`, 0);
  });
  progressCb(`Fetched ${all.length} entries. Sending to Worker for durable storage...`, 25);
  const ingestResult = await postViewedIngest(all);
  progressCb(`Stored ${ingestResult.stored}, filtered ${ingestResult.filtered}. Looking up TV episode counts...`, 50);

  // Pre-fetch TMDB metadata for all distinct TV shows in history (for the 95%/80% rule)
  const tvShowSet = new Set();
  for (const e of all) {
    if (e.type === 'episode') {
      const show = e.grandparentTitle || e.title;
      if (show) tvShowSet.add(show);
    }
  }
  const tvLookups = Array.from(tvShowSet).map(show => ({ title: show, year: null, type: 'tv' }));
  const episodeCounts = {};
  if (tvLookups.length > 0) {
    const bulk = await tmdbBulkLookup(tvLookups, (n, total) => {
      progressCb(`Looking up TV episode counts... ${n} / ${total}`, 50 + Math.round((n / total) * 25));
    });
    bulk.results.forEach(r => {
      if (r.result && r.result.found && r.result.numberOfEpisodes) {
        const key = plexNormalizeKeyTitleOnly(r.query.title);
        episodeCounts[key] = r.result.numberOfEpisodes;
      }
    });
  }

  progressCb('Applying rules to WatchTrack...', 80);
  const report = applyBulkSyncRules(all, episodeCounts);
  report.totalEntries = all.length;
  report.workerStored = ingestResult.stored;
  report.workerFiltered = ingestResult.filtered;
  report.tvCountsLookedUp = Object.keys(episodeCounts).length;
  progressCb('Done.', 100);
  return report;
}

// =====================================================================
// TMDB metadata client — calls Worker, caches in localStorage
// =====================================================================

const TMDB_CACHE_PREFIX = 'wt-tmdb-';
const TMDB_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

function tmdbCacheKey(title, year, type) {
  // Normalize same way as Worker
  const t = (title || '').toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[\u2019\u2018'`]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 60);
  return `${TMDB_CACHE_PREFIX}${type}:${t}:${year || ''}`;
}

function tmdbGetCached(title, year, type) {
  try {
    const raw = localStorage.getItem(tmdbCacheKey(title, year, type));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.cachedAt && (Date.now() - obj.cachedAt > TMDB_CACHE_TTL_MS)) return null;
    return obj.data;
  } catch { return null; }
}

function tmdbSetCached(title, year, type, data) {
  try {
    localStorage.setItem(tmdbCacheKey(title, year, type), JSON.stringify({
      cachedAt: Date.now(), data,
    }));
  } catch {}  // localStorage may be full; ignore quietly
}

// Single lookup — uses cache, falls back to Worker
async function tmdbLookup(title, year, type) {
  if (!isWebhookConfigured()) return null;
  const cached = tmdbGetCached(title, year, type);
  if (cached) return cached;
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const params = new URLSearchParams({
    secret, title, year: year || '', type: type === 'tv' ? 'tv' : 'movie',
  });
  try {
    const resp = await fetch(`${url}/metadata/lookup?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    tmdbSetCached(title, year, type, data);
    return data;
  } catch { return null; }
}

// Bulk lookup — for catalog enrichment passes
async function tmdbBulkLookup(items, progressCb) {
  if (!isWebhookConfigured()) return { results: [], errors: 0 };
  // Filter out items already cached
  const needFetch = [];
  const cachedResults = [];
  items.forEach(it => {
    const c = tmdbGetCached(it.title, it.year, it.type);
    if (c) cachedResults.push({ query: it, result: c });
    else needFetch.push(it);
  });
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const BATCH = 20;
  const allResults = [...cachedResults];
  let errors = 0;
  for (let i = 0; i < needFetch.length; i += BATCH) {
    const slice = needFetch.slice(i, i + BATCH);
    if (progressCb) progressCb(i, needFetch.length);
    try {
      const resp = await fetch(`${url}/metadata/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, items: slice }),
      });
      if (!resp.ok) { errors += slice.length; continue; }
      const data = await resp.json();
      (data.results || []).forEach(r => {
        if (r.result && !r.result.error) {
          tmdbSetCached(r.query.title, r.query.year || '', r.query.type, r.result);
        }
        allResults.push(r);
      });
      errors += data.errors || 0;
    } catch {
      errors += slice.length;
    }
  }
  if (progressCb) progressCb(needFetch.length, needFetch.length);
  return { results: allResults, errors };
}

// =====================================================================
// Region selection for streaming-provider data
// =====================================================================
const REGION_KEY = 'watchtrack-streaming-region';
function getStreamingRegion() {
  return localStorage.getItem(REGION_KEY) || 'US';
}
function setStreamingRegion(r) {
  localStorage.setItem(REGION_KEY, r || 'US');
}
// All regions TMDB supports for watch providers (ISO 3166-1 alpha-2 country codes).
// Sorted, with common ones at top for the dropdown.
const STREAMING_REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'IN', name: 'India' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'ZA', name: 'South Africa' },
];

// Search-on-service URL templates (used when user clicks a provider badge).
// Maps TMDB provider name → URL template with {q} placeholder for search query.
const STREAMING_SEARCH_TEMPLATES = {
  'Netflix': 'https://www.netflix.com/search?q={q}',
  'Hulu': 'https://www.hulu.com/search?q={q}',
  'Max': 'https://play.max.com/search?q={q}',
  'Disney Plus': 'https://www.disneyplus.com/search?q={q}',
  'Disney+': 'https://www.disneyplus.com/search?q={q}',
  'Amazon Prime Video': 'https://www.amazon.com/s?k={q}&i=instant-video',
  'Apple TV Plus': 'https://tv.apple.com/search?term={q}',
  'Apple TV+': 'https://tv.apple.com/search?term={q}',
  'Apple TV': 'https://tv.apple.com/search?term={q}',
  'Paramount Plus': 'https://www.paramountplus.com/search/{q}',
  'Paramount+': 'https://www.paramountplus.com/search/{q}',
  'Peacock': 'https://www.peacocktv.com/search?q={q}',
  'BBC iPlayer': 'https://www.bbc.co.uk/iplayer/search?q={q}',
  'Crunchyroll': 'https://www.crunchyroll.com/search?q={q}',
  'YouTube': 'https://www.youtube.com/results?search_query={q}',
  'Google Play Movies': 'https://play.google.com/store/search?q={q}&c=movies',
  'Vudu': 'https://www.vudu.com/content/movies/search?searchString={q}',
  // For unknown providers, fall back to Google search
};

function streamingSearchUrl(providerName, title) {
  const template = STREAMING_SEARCH_TEMPLATES[providerName];
  const q = encodeURIComponent(title);
  if (template) return template.replace('{q}', q);
  return `https://www.google.com/search?q=${encodeURIComponent(providerName + ' ' + title)}`;
}

// =====================================================================
// Promotions (Stage 5b): persistent orphan→catalog additions stored in
// Cloudflare KV. Loaded on bootstrap and merged into catalogs.
// =====================================================================
let promotionsCache = [];   // { key, tab, item, createdAt }[]

async function fetchPromotions() {
  if (!isWebhookConfigured()) { promotionsCache = []; return promotionsCache; }
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  try {
    const resp = await fetch(`${url}/promotions?secret=${encodeURIComponent(secret)}`);
    if (!resp.ok) { promotionsCache = []; return promotionsCache; }
    const data = await resp.json();
    promotionsCache = data.records || [];
  } catch {
    promotionsCache = [];
  }
  return promotionsCache;
}

async function postPromotion(tab, item) {
  if (!isWebhookConfigured()) throw new Error('Webhook bridge not configured');
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const resp = await fetch(`${url}/promotions/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, tab, item }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  return await resp.json();
}

async function deletePromotion(tab, itemId) {
  if (!isWebhookConfigured()) throw new Error('Webhook bridge not configured');
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const resp = await fetch(`${url}/promotions/${encodeURIComponent(tab)}/${encodeURIComponent(itemId)}?secret=${encodeURIComponent(secret)}`, {
    method: 'DELETE',
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt}`);
  }
  return await resp.json();
}

// Merge promotions into loaded catalogs.
// SILENT DEDUPE (option A): if catalog JSON already has an item with same id,
// skip the promotion (canonical source wins).
function mergePromotionsIntoCatalogs() {
  if (!promotionsCache || promotionsCache.length === 0) return;
  promotionsCache.forEach(p => {
    const cat = catalogs[p.tab];
    if (!cat) return;
    // Check if catalog already has this item ID
    const exists = cat.items.some(it => it.id === p.item.id);
    if (exists) return;  // canonical source wins; silent dedupe
    // Find or create the "Plex History (Promoted)" section
    let section = cat.sections.find(s => s.name.includes('Promoted'));
    if (!section) {
      section = {
        name: 'X. Plex History (Promoted)',
        desc: 'Items promoted from your Plex viewing history (synced via Cloudflare KV).',
        categories: [],
        items: [],
      };
      cat.sections.push(section);
    }
    // Build the runtime item
    const runtimeItem = {
      ...p.item,
      section: section.name,
      sectionDesc: section.desc,
      categories: p.item.categories || [],
      sourceTab: p.tab,
      sourceTabLabel: cat.title || p.tab,
      order: cat.items.length + 1,
      _isPromotion: true,  // Flag for UI purposes
    };
    section.items.push(runtimeItem);
    cat.items.push(runtimeItem);
  });
}

// =====================================================================
// Catalog enrichment index — maps catalog item.id → { tmdbId, type, lastEnriched }
// Stored in localStorage for instant streaming-badge resolution.
// =====================================================================
const CATALOG_ENRICHMENT_KEY = 'watchtrack-catalog-enrichment';

function loadCatalogEnrichment() {
  try {
    const raw = localStorage.getItem(CATALOG_ENRICHMENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCatalogEnrichment(idx) {
  try {
    localStorage.setItem(CATALOG_ENRICHMENT_KEY, JSON.stringify(idx));
  } catch (e) {
    console.warn('Catalog enrichment save failed:', e);
  }
}
let catalogEnrichmentIdx = {};   // populated on bootstrap

function getEnrichmentForItem(itemId) {
  return catalogEnrichmentIdx[itemId] || null;
}
function setEnrichmentForItem(itemId, payload) {
  catalogEnrichmentIdx[itemId] = { ...payload, lastEnriched: Date.now() };
  saveCatalogEnrichment(catalogEnrichmentIdx);
}

// Run a full enrichment pass over every loaded catalog item.
// Calls Worker /metadata/bulk in batches of 20.
// Skips items already enriched within last 30 days.
async function enrichEntireCatalog(progressCb) {
  if (!isWebhookConfigured()) throw new Error('Configure Plex Webhook Bridge in Settings first.');
  const tvTabs = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);
  const STALE_MS = 30 * 24 * 60 * 60 * 1000;

  const lookups = [];
  for (const tabId in catalogs) {
    if (tabId === 'watchlist') continue;
    const cat = catalogs[tabId];
    const isTvTab = tvTabs.has(tabId);
    cat.items.forEach(item => {
      const existing = getEnrichmentForItem(item.id);
      if (existing && existing.lastEnriched && (Date.now() - existing.lastEnriched < STALE_MS) && existing.tmdbId) return;
      lookups.push({
        itemId: item.id,
        title: item.title,
        year: item.year || null,
        type: isTvTab ? 'tv' : 'movie',
      });
    });
  }

  const total = lookups.length;
  if (total === 0) return { processed: 0, found: 0, errors: 0, total: 0, skipped: 0 };

  const BATCH = 20;
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  let processed = 0, found = 0, errors = 0;
  for (let i = 0; i < lookups.length; i += BATCH) {
    const slice = lookups.slice(i, i + BATCH);
    if (progressCb) progressCb(i, total);
    try {
      const resp = await fetch(`${url}/metadata/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          items: slice.map(s => ({ title: s.title, year: s.year, type: s.type })),
        }),
      });
      if (!resp.ok) { errors += slice.length; continue; }
      const data = await resp.json();
      // Map results back to itemIds (in same order as slice)
      (data.results || []).forEach((r, idx) => {
        processed++;
        const lookup = slice[idx];
        if (r.result && r.result.found) {
          setEnrichmentForItem(lookup.itemId, {
            tmdbId: r.result.tmdbId,
            type: lookup.type,
            year: r.result.year,
            posterPath: r.result.posterPath,
            numberOfEpisodes: r.result.numberOfEpisodes,
            genres: r.result.genres,
          });
          found++;
        }
      });
      errors += data.errors || 0;
    } catch {
      errors += slice.length;
    }
  }
  if (progressCb) progressCb(total, total);
  return {
    processed, found, errors,
    total: Object.keys(catalogEnrichmentIdx).length,
    skipped: 0,
  };
}

// Lazy-load streaming providers for an item card and render them.
async function loadStreamingProviders(itemEl, item) {
  const slot = itemEl.querySelector('.streaming-providers');
  if (!slot) return;
  if (slot.dataset.streamingLoaded === 'true') return;
  slot.dataset.streamingLoaded = 'true';
  if (!isWebhookConfigured()) {
    slot.innerHTML = '';
    return;
  }
  const tvTabs = ['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv'];
  const sourceTab = item._watchlist_source_tab || activeTab;
  const type = tvTabs.includes(sourceTab) ? 'tv' : 'movie';
  slot.innerHTML = '<div class="streaming-loading">Looking up streaming availability...</div>';
  // Use enrichment tmdbId if available — saves a search step
  const enrich = getEnrichmentForItem(item.id);
  const data = enrich && enrich.tmdbId
    ? await tmdbLookupById(enrich.tmdbId, type)
    : await tmdbLookup(item.title, item.year, type);
  if (!data || !data.found) {
    slot.innerHTML = '';
    return;
  }
  // Cache the tmdbId on the enrichment index if not already there
  if (!enrich || !enrich.tmdbId) {
    setEnrichmentForItem(item.id, {
      tmdbId: data.tmdbId, type, year: data.year,
      posterPath: data.posterPath, numberOfEpisodes: data.numberOfEpisodes,
      genres: data.genres,
    });
  }
  renderStreamingProviders(slot, data, item.title);
}

// Direct lookup by tmdbId — bypasses search step on Worker
async function tmdbLookupById(tmdbId, type) {
  if (!isWebhookConfigured()) return null;
  // Cache key
  const cacheKey = `${TMDB_CACHE_PREFIX}${type}-id:${tmdbId}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj.cachedAt && (Date.now() - obj.cachedAt < TMDB_CACHE_TTL_MS)) return obj.data;
    }
  } catch {}
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const params = new URLSearchParams({ secret, tmdbId, type });
  // Title is required by /lookup endpoint pre-v4 worker; pass dummy to satisfy old workers
  params.set('title', 'lookup');
  try {
    const resp = await fetch(`${url}/metadata/lookup?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: Date.now(), data }));
    } catch {}
    return data;
  } catch { return null; }
}

function renderStreamingProviders(slot, tmdbData, title) {
  const providers = tmdbData.watchProviders || {};
  const region = getStreamingRegion();
  const regionData = providers[region];

  // Build the region selector
  const regionOptions = STREAMING_REGIONS.map(r => {
    const has = providers[r.code] ? '' : ' (none)';
    return `<option value="${r.code}" ${r.code === region ? 'selected' : ''}>${r.name}${has}</option>`;
  }).join('');

  // Get providers for selected region. TMDB groups by flatrate / rent / buy / free / ads.
  // We prefer flatrate (subscription) and free, then ads, then rent/buy.
  let html = `<div class="streaming-header">
    <span class="streaming-label">Streaming</span>
    <select class="streaming-region-select">${regionOptions}</select>
  </div>`;

  if (!regionData) {
    html += `<div class="streaming-none">Not available in ${region}</div>`;
  } else {
    const tiers = [
      { key: 'flatrate', label: 'Subscription' },
      { key: 'free', label: 'Free' },
      { key: 'ads', label: 'Ads' },
      { key: 'rent', label: 'Rent' },
      { key: 'buy', label: 'Buy' },
    ];
    let any = false;
    tiers.forEach(t => {
      const provs = regionData[t.key];
      if (!provs || provs.length === 0) return;
      any = true;
      const buttons = provs.map(p => {
        const search = streamingSearchUrl(p.provider_name, title);
        return `<a class="streaming-btn" href="${search}" target="_blank" rel="noopener">${p.provider_name}</a>`;
      }).join('');
      html += `<div class="streaming-tier"><span class="streaming-tier-label">${t.label}:</span> ${buttons}</div>`;
    });
    if (!any) html += `<div class="streaming-none">Not available in ${region}</div>`;
  }
  slot.innerHTML = html;

  // Wire region selector
  const select = slot.querySelector('.streaming-region-select');
  if (select) {
    select.addEventListener('change', (e) => {
      e.stopPropagation();
      setStreamingRegion(e.target.value);
      renderStreamingProviders(slot, tmdbData, title);
    });
    select.addEventListener('click', (e) => e.stopPropagation());
  }
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
  // Heroes & Comics
  'marvel-mcu': 'Marvel (MCU)',
  'marvel-non-mcu': 'Marvel (Non-MCU)',
  'dc': 'DC',
  'indie': 'Indie',
  'deconstructive': 'Deconstructive',
  'cosmic': 'Cosmic',
  'street-level': 'Street-Level',
  'team-up': 'Team-Up',
  // Heroes & Comics TV
  'marvel-disney-plus': 'Marvel — Disney+',
  'marvel-netflix': 'Marvel — Netflix',
  'animated': 'Animated',
  // Musicals
  'stage-adaptation': 'Stage Adaptations',
  'original-screen': 'Original Screen',
  'jukebox': 'Jukebox',
  'bio-musical': 'Bio-Musical',
  'auteur': 'Auteur',
  'cult': 'Cult',
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
      // Per-ITEM seed merge: for each tab in SEED_STATE, fill in seed entries
      // for items that don't already have user state. Items the user has
      // already touched stay as-is (user data always wins). Idempotent — safe
      // to run on every load. Handles new tabs added in updates AND new items
      // added to existing tabs.
      Object.keys(SEED_STATE).forEach(tabId => {
        if (!state[tabId]) state[tabId] = {};
        const tabSeed = SEED_STATE[tabId] || {};
        Object.keys(tabSeed).forEach(itemId => {
          if (!state[tabId][itemId]) {
            state[tabId][itemId] = JSON.parse(JSON.stringify(tabSeed[itemId]));
          }
        });
      });
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
      { id: "heroes-comics", label: "Heroes & Comics" },
      { id: "heroes-comics-tv", label: "Heroes & Comics TV" },
      { id: "horror", label: "Horror" },
      { id: "horror-tv", label: "Horror TV" },
      { id: "musicals", label: "Musicals" },
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
    if (expandedIds.has(item.id)) {
      itemEl.classList.add('expanded');
      // Load streaming providers since item is already expanded
      setTimeout(() => loadStreamingProviders(itemEl, item), 0);
    }

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
        <div class="streaming-providers" data-streaming-loaded="false"></div>
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
      else {
        expandedIds.add(item.id); itemEl.classList.add('expanded');
        // Lazy-load streaming providers when item first expands
        loadStreamingProviders(itemEl, item);
      }
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
    document.getElementById('webhook-url').value = getWebhookUrl();
    document.getElementById('webhook-secret').value = getWebhookSecret();
    updatePlexStatusLine();
    updateWebhookStatusLine();
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
    setWebhookUrl(document.getElementById('webhook-url').value.trim());
    setWebhookSecret(document.getElementById('webhook-secret').value.trim());
    applyDisplayMode();
    settingsModal.classList.remove('active');
    if (isPlexConfigured()) fetchPlexLibrary();
    if (isWebhookConfigured()) pollPlexWebhookEvents();
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

  document.getElementById('plex-bulk-sync').addEventListener('click', async () => {
    if (!isPlexConfigured() || !isWebhookConfigured()) {
      alert('Configure both Plex Integration and Plex Webhook Bridge before bulk sync.');
      return;
    }
    if (!confirm('Bulk-sync your full Plex history into WatchTrack? This will:\n\n• Fetch every item you\'ve watched on Plex\n• Mark matched movies as Watched\n• Mark TV shows as Watching, with Loved if you\'ve watched 5+ distinct episodes\n• Log all viewing to durable cloud storage\n\nSafe to run multiple times.')) return;

    const progressModal = document.getElementById('bulk-sync-progress-modal');
    const statusEl = document.getElementById('bulk-sync-status');
    const barEl = document.getElementById('bulk-sync-bar');
    progressModal.classList.add('active');
    document.getElementById('settings-modal').classList.remove('active');

    try {
      const report = await runBulkSync((msg, pct) => {
        statusEl.textContent = msg;
        barEl.style.width = `${pct}%`;
      });
      progressModal.classList.remove('active');
      // Show result
      document.getElementById('bulk-sync-result-content').innerHTML = renderBulkSyncReport(report);
      document.getElementById('bulk-sync-result-modal').classList.add('active');
      render();  // Refresh the visible UI to reflect new statuses
    } catch (e) {
      progressModal.classList.remove('active');
      alert('Bulk sync failed: ' + e.message);
    }
  });
  document.getElementById('bulk-sync-result-close').addEventListener('click', () => {
    document.getElementById('bulk-sync-result-modal').classList.remove('active');
  });

  document.getElementById('catalog-enrich').addEventListener('click', async () => {
    if (!isWebhookConfigured()) {
      alert('Configure Plex Webhook Bridge first.');
      return;
    }
    if (!confirm('Pre-enrich entire catalog with TMDB IDs and metadata?\n\nThis will:\n• Look up every catalog item on TMDB\n• Cache the results for 30 days\n• Make streaming-provider badges appear instantly when you open items\n\nSkips items already enriched in the last 30 days. Safe to run multiple times.')) return;

    const progressModal = document.getElementById('enrichment-progress-modal');
    const statusEl = document.getElementById('enrichment-status');
    const barEl = document.getElementById('enrichment-bar');
    progressModal.classList.add('active');
    document.getElementById('settings-modal').classList.remove('active');
    try {
      const report = await enrichEntireCatalog((n, total) => {
        statusEl.textContent = `Looking up TMDB metadata... ${n} / ${total}`;
        barEl.style.width = `${total ? Math.round((n / total) * 100) : 0}%`;
      });
      progressModal.classList.remove('active');
      const html = `
        <div class="stat-line"><span>Total catalog items</span><strong>${report.total}</strong></div>
        <div class="stat-line"><span>Processed this run</span><strong>${report.processed}</strong></div>
        <div class="stat-line"><span>Found on TMDB</span><strong>${report.found}</strong></div>
        <div class="stat-line"><span>Errors</span><strong>${report.errors}</strong></div>
        <p class="settings-help" style="margin-top:12px">Catalog enrichment cached locally. Streaming-provider badges will now load instantly on item expand. Re-run after 30 days or when adding new catalog items to refresh.</p>
      `;
      document.getElementById('enrichment-result-content').innerHTML = html;
      document.getElementById('enrichment-result-modal').classList.add('active');
    } catch (e) {
      progressModal.classList.remove('active');
      alert('Enrichment failed: ' + e.message);
    }
  });
  document.getElementById('enrichment-result-close').addEventListener('click', () => {
    document.getElementById('enrichment-result-modal').classList.remove('active');
  });

  // === Promotions Manager ===
  document.getElementById('promotions-manage').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('active');
    openPromotionsManager();
  });
  document.getElementById('promotions-mgr-close').addEventListener('click', () => {
    document.getElementById('promotions-mgr-modal').classList.remove('active');
  });
  document.getElementById('promotions-mgr-refresh').addEventListener('click', async () => {
    await fetchPromotions();
    renderPromotionsManager();
  });
  document.getElementById('promotions-export').addEventListener('click', exportPromotionsAsJsonPatch);

  document.getElementById('webhook-test').addEventListener('click', async () => {
    const url = document.getElementById('webhook-url').value.trim().replace(/\/$/, '');
    const secret = document.getElementById('webhook-secret').value.trim();
    const status = document.getElementById('webhook-status');
    if (!url || !secret) {
      status.textContent = 'Enter both Worker URL and shared secret first.';
      status.className = 'settings-status err';
      return;
    }
    status.textContent = 'Testing...';
    status.className = 'settings-status';
    try {
      // Hit the health endpoint first
      const healthResp = await fetch(`${url}/health`);
      if (!healthResp.ok) {
        status.textContent = `Worker unreachable: HTTP ${healthResp.status}`;
        status.className = 'settings-status err';
        return;
      }
      // Then test the secret by polling for events with `since=now` (so we don't disturb anything)
      const pollResp = await fetch(`${url}/events?secret=${encodeURIComponent(secret)}&since=${Date.now()}`);
      if (pollResp.status === 403) {
        status.textContent = 'Worker rejects secret. Check Cloudflare KV CONFIG.';
        status.className = 'settings-status err';
        return;
      }
      if (!pollResp.ok) {
        status.textContent = `Poll failed: HTTP ${pollResp.status}`;
        status.className = 'settings-status err';
        return;
      }
      status.textContent = 'Worker reachable, secret accepted.';
      status.className = 'settings-status ok';
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      status.className = 'settings-status err';
    }
  });

  // === Plex History modal ===
  document.getElementById('history-btn').addEventListener('click', () => {
    openHistoryModal();
  });
  document.getElementById('history-close').addEventListener('click', () => {
    document.getElementById('history-modal').classList.remove('active');
  });
  document.getElementById('history-refresh').addEventListener('click', () => {
    plexHistoryCache = null;
    openHistoryModal();
  });
  document.getElementById('history-search').addEventListener('input', () => renderHistoryList());
  document.getElementById('history-filter').addEventListener('change', () => renderHistoryList());
  document.getElementById('history-sort').addEventListener('change', () => renderHistoryList());

  // Promote modal
  document.getElementById('promote-cancel').addEventListener('click', () => {
    document.getElementById('promote-modal').classList.remove('active');
  });
  document.getElementById('promote-confirm').addEventListener('click', confirmPromote);
}

// =====================================================================
// Plex History modal
// =====================================================================

let plexHistoryCache = null;       // { records: [...], aggregated: {...} }
let pendingPromote = null;         // { type, title, year, plays }

async function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  const status = document.getElementById('history-status');
  const list = document.getElementById('history-list');
  modal.classList.add('active');
  if (!isWebhookConfigured()) {
    status.textContent = 'Configure Plex Webhook Bridge in Settings first.';
    list.innerHTML = '';
    return;
  }
  if (plexHistoryCache) {
    renderHistoryList();
    return;
  }
  status.textContent = 'Fetching history from cloud...';
  list.innerHTML = '';
  try {
    const records = await fetchAllViewedRecords();
    plexHistoryCache = aggregateHistory(records);
    renderHistoryList();
  } catch (e) {
    status.textContent = `Failed to fetch: ${e.message}`;
  }
}

async function fetchAllViewedRecords() {
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  let cursor = null;
  const all = [];
  let safetyStop = 0;
  while (true) {
    safetyStop++;
    if (safetyStop > 20) break;
    const params = new URLSearchParams({ secret });
    if (cursor) params.set('cursor', cursor);
    const resp = await fetch(`${url}/viewed/list?${params}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    all.push(...(data.records || []));
    if (!data.cursor) break;
    cursor = data.cursor;
  }
  return all;
}

// Aggregate raw view records into a per-title or per-show summary.
function aggregateHistory(records) {
  const movies = new Map();   // key -> { title, year, plays, lastViewed, type:'movie' }
  const shows = new Map();    // key -> { title, episodes:Set, plays, lastViewed, type:'tv' }
  records.forEach(r => {
    const ts = r.ts || 0;
    if (r.type === 'movie') {
      const yearVal = r.year || null;
      const key = plexNormalizeKey(r.title, yearVal);
      const existing = movies.get(key) || { title: r.title, year: yearVal, plays: 0, lastViewed: 0, type: 'movie' };
      existing.plays++;
      if (ts > existing.lastViewed) existing.lastViewed = ts;
      movies.set(key, existing);
    } else if (r.type === 'episode') {
      const show = r.grandparentTitle || r.title;
      if (!show) return;
      const key = plexNormalizeKeyTitleOnly(show);
      const existing = shows.get(key) || { title: show, episodes: new Set(), plays: 0, lastViewed: 0, type: 'tv' };
      existing.plays++;
      const epId = `${r.parentIndex || 0}_${r.index || 0}`;
      existing.episodes.add(epId);
      if (ts > existing.lastViewed) existing.lastViewed = ts;
      shows.set(key, existing);
    }
  });

  // Convert to array, mark catalog matches
  const items = [];
  movies.forEach(m => {
    const inCatalog = isInCatalog(m.title, m.year, 'movie');
    items.push({ ...m, distinct: 1, inCatalog });
  });
  shows.forEach(s => {
    const inCatalog = isInCatalog(s.title, null, 'tv');
    items.push({ ...s, distinct: s.episodes.size, inCatalog });
  });
  return { records, items };
}

function isInCatalog(title, year, type) {
  const tvTabs = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);
  for (const tabId in catalogs) {
    const isTvTab = tvTabs.has(tabId);
    if (type === 'movie' && isTvTab) continue;
    if (type === 'tv' && !isTvTab) continue;
    const cat = catalogs[tabId];
    for (const item of cat.items) {
      const titles = [item.title].concat(Array.isArray(item.aliases) ? item.aliases : []);
      for (const t of titles) {
        if (type === 'movie') {
          if (plexNormalizeKey(t, item.year) === plexNormalizeKey(title, year)) {
            return { tabId, itemId: item.id, item };
          }
          for (const dy of [-1, 1]) {
            if (plexNormalizeKey(t, item.year ? item.year + dy : null) === plexNormalizeKey(title, year)) {
              return { tabId, itemId: item.id, item };
            }
          }
        } else {
          if (plexNormalizeKeyTitleOnly(t) === plexNormalizeKeyTitleOnly(title)) {
            return { tabId, itemId: item.id, item };
          }
        }
      }
    }
  }
  return null;
}

function renderHistoryList() {
  const list = document.getElementById('history-list');
  const status = document.getElementById('history-status');
  if (!plexHistoryCache) { list.innerHTML = ''; return; }
  const search = (document.getElementById('history-search').value || '').toLowerCase().trim();
  const filter = document.getElementById('history-filter').value;
  const sort = document.getElementById('history-sort').value;

  let items = plexHistoryCache.items.slice();
  if (filter === 'orphans') items = items.filter(it => !it.inCatalog);
  else if (filter === 'matched') items = items.filter(it => it.inCatalog);
  else if (filter === 'movies') items = items.filter(it => it.type === 'movie');
  else if (filter === 'tv') items = items.filter(it => it.type === 'tv');
  if (search) items = items.filter(it => it.title.toLowerCase().includes(search));

  if (sort === 'recent') items.sort((a, b) => b.lastViewed - a.lastViewed);
  else if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'plays') items.sort((a, b) => b.plays - a.plays);

  status.textContent = `${items.length} item(s) shown · ${plexHistoryCache.items.length} total`;

  list.innerHTML = items.slice(0, 500).map(it => {
    const dateStr = it.lastViewed ? new Date(it.lastViewed).toLocaleDateString() : '';
    const meta = it.type === 'movie'
      ? `${it.year || '?'} · ${it.plays} play${it.plays === 1 ? '' : 's'}${dateStr ? ' · ' + dateStr : ''}`
      : `${it.distinct} ep · ${it.plays} play${it.plays === 1 ? '' : 's'}${dateStr ? ' · ' + dateStr : ''}`;
    let badges = '';
    if (it.inCatalog) {
      badges = `<span class="source-badge">${it.inCatalog.tabId}</span>`;
    }
    const promoteBtn = !it.inCatalog
      ? `<button class="history-promote-btn" data-type="${it.type}" data-title="${escapeHtml(it.title)}" data-year="${it.year || ''}" data-plays="${it.plays}" data-distinct="${it.distinct}">Promote</button>`
      : '';
    return `<div class="history-row">
      <div class="history-row-info">
        <div class="history-row-title">${escapeHtml(it.title)}</div>
        <div class="history-row-meta">${meta}</div>
      </div>
      <div class="badge-row">${badges}</div>
      ${promoteBtn}
    </div>`;
  }).join('');

  list.querySelectorAll('.history-promote-btn').forEach(btn => {
    btn.addEventListener('click', () => openPromoteModal(btn));
  });
  list.querySelectorAll('.history-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't fire on button clicks
      if (e.target.closest('.history-promote-btn')) return;
      // Find the catalog match if any, navigate to it
      const titleEl = row.querySelector('.history-row-title');
      const title = titleEl ? titleEl.textContent : '';
      const item = plexHistoryCache.items.find(i => i.title === title);
      if (item && item.inCatalog) {
        document.getElementById('history-modal').classList.remove('active');
        switchTab(item.inCatalog.tabId);
        setTimeout(() => {
          const target = document.querySelector(`.item[data-id="${item.inCatalog.itemId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('expanded');
            target.style.outline = '2px solid var(--accent)';
            setTimeout(() => target.style.outline = '', 1500);
          }
        }, 100);
      }
    });
  });
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openPromoteModal(btn) {
  pendingPromote = {
    type: btn.dataset.type,
    title: btn.dataset.title,
    year: btn.dataset.year || null,
    plays: parseInt(btn.dataset.plays) || 1,
    distinct: parseInt(btn.dataset.distinct) || 1,
  };
  document.getElementById('promote-info').textContent =
    `Promote "${pendingPromote.title}" (${pendingPromote.year || '?'}) to a WatchTrack catalog tab. ${pendingPromote.plays} plays detected.`;
  // Populate tab dropdown
  const tvTabs = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);
  const select = document.getElementById('promote-tab');
  select.innerHTML = catalogManifest
    .filter(c => !c.virtual)
    .filter(c => pendingPromote.type === 'movie' ? !tvTabs.has(c.id) : tvTabs.has(c.id))
    .map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  document.getElementById('promote-modal').classList.add('active');
}

async function confirmPromote() {
  if (!pendingPromote) return;
  const tab = document.getElementById('promote-tab').value;
  if (!catalogs[tab]) { alert('Tab not found.'); return; }

  const cat = catalogs[tab];
  const sectionName = 'X. Plex History (Promoted)';
  let section = cat.sections.find(s => s.name === sectionName);
  if (!section) {
    section = {
      name: sectionName,
      desc: 'Items promoted from your Plex viewing history (synced via Cloudflare KV).',
      categories: [],
      items: [],
    };
    cat.sections.push(section);
  }
  const newItem = {
    title: pendingPromote.title,
    year: pendingPromote.year ? parseInt(pendingPromote.year) : null,
    pitch: `Promoted from Plex history. ${pendingPromote.plays} play(s) detected${pendingPromote.type === 'tv' ? `, ${pendingPromote.distinct} distinct episode(s)` : ''}.`,
    priority: 'low',
    whyPriority: 'Auto-added from your Plex viewing history.',
    contentType: pendingPromote.type === 'tv' ? 'tv-prestige' : 'film-narrative',
    tvCompletionMode: 'flexible',
  };
  newItem.id = `${newItem.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')}-${newItem.year || 'unknown'}`;

  // Persist to Worker KV synchronously (Option A flow)
  const confirmBtn = document.getElementById('promote-confirm');
  const cancelBtn = document.getElementById('promote-cancel');
  if (confirmBtn) confirmBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  try {
    await postPromotion(tab, newItem);
  } catch (e) {
    if (confirmBtn) confirmBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    alert(`Failed to save promotion: ${e.message}\n\nThe Cloudflare Worker may be unreachable. Try again later.`);
    return;
  }
  if (confirmBtn) confirmBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;

  // Add to runtime catalog
  const runtimeItem = {
    ...newItem,
    section: sectionName,
    sectionDesc: section.desc,
    categories: [],
    sourceTab: tab,
    sourceTabLabel: cat.title || tab,
    order: cat.items.length + 1,
    _isPromotion: true,
  };
  section.items.push(runtimeItem);
  cat.items.push(runtimeItem);

  // Refresh promotions cache (so the new entry appears in maintenance modal)
  await fetchPromotions();

  // Mark watched/watching
  if (pendingPromote.type === 'movie') {
    setStatus(newItem.id, 'watched', tab);
  } else {
    setStatus(newItem.id, 'watching', tab);
    if (pendingPromote.distinct >= 5) {
      setRating(newItem.id, 'loved', tab);
    }
  }

  // Refresh state
  plexHistoryCache = null;
  document.getElementById('promote-modal').classList.remove('active');
  pendingPromote = null;
  // Re-render history modal
  setTimeout(() => openHistoryModal(), 100);
  render();
}

// =====================================================================
// Promotions Manager modal — view, mark-committed, delete, export
// =====================================================================
async function openPromotionsManager() {
  const modal = document.getElementById('promotions-mgr-modal');
  const status = document.getElementById('promotions-mgr-status');
  modal.classList.add('active');
  if (!isWebhookConfigured()) {
    status.textContent = 'Configure Plex Webhook Bridge in Settings first.';
    document.getElementById('promotions-mgr-list').innerHTML = '';
    return;
  }
  status.textContent = 'Loading promotions...';
  await fetchPromotions();
  renderPromotionsManager();
}

function renderPromotionsManager() {
  const status = document.getElementById('promotions-mgr-status');
  const list = document.getElementById('promotions-mgr-list');
  if (promotionsCache.length === 0) {
    status.textContent = 'No promotions stored.';
    list.innerHTML = '<p class="settings-help" style="padding:12px 0">Items you promote from the Plex History modal will appear here. They\'re stored in Cloudflare KV and synced across all your devices that share this Worker.</p>';
    return;
  }
  // Sort: most recent first
  const sorted = promotionsCache.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Determine which promotions are now in canonical catalog (silent dedupe candidates)
  const inCanonical = new Set();
  sorted.forEach(p => {
    const cat = catalogs[p.tab];
    if (!cat) return;
    // Check if a non-promotion item with same id exists
    const hit = cat.items.find(it => it.id === p.item.id && !it._isPromotion);
    if (hit) inCanonical.add(p.key);
  });

  status.textContent = `${promotionsCache.length} promotion${promotionsCache.length === 1 ? '' : 's'} · ${inCanonical.size} now in canonical catalog`;
  list.innerHTML = sorted.map(p => {
    const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
    const tabLabel = (catalogs[p.tab] && catalogs[p.tab].title) || p.tab;
    const isInCanon = inCanonical.has(p.key);
    const meta = `${p.item.year || '?'} · ${tabLabel}${dateStr ? ' · added ' + dateStr : ''}`;
    return `<div class="history-row" data-key="${escapeHtml(p.key)}" data-tab="${escapeHtml(p.tab)}" data-itemid="${escapeHtml(p.item.id)}">
      <div class="history-row-info">
        <div class="history-row-title">${escapeHtml(p.item.title)}${isInCanon ? ' <span class="plex-badge" style="margin-left:6px">In repo</span>' : ''}</div>
        <div class="history-row-meta">${meta}</div>
      </div>
      <button class="history-promote-btn promotions-delete-btn" title="Remove this KV promotion. Use after you commit it to the repo data files.">Delete</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.promotions-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const row = btn.closest('.history-row');
      if (!row) return;
      const tab = row.dataset.tab;
      const itemId = row.dataset.itemid;
      if (!confirm(`Delete this promotion from KV?\n\nUse this after you've added the item to the catalog source files in the GitHub repo. The item stays in WatchTrack via the canonical catalog; the KV entry is just cleanup.`)) return;
      btn.disabled = true;
      try {
        await deletePromotion(tab, itemId);
        await fetchPromotions();
        renderPromotionsManager();
      } catch (err) {
        btn.disabled = false;
        alert('Delete failed: ' + err.message);
      }
    });
  });
}

function exportPromotionsAsJsonPatch() {
  if (!promotionsCache || promotionsCache.length === 0) {
    alert('No promotions to export.');
    return;
  }
  // Group by tab
  const byTab = {};
  promotionsCache.forEach(p => {
    if (!byTab[p.tab]) byTab[p.tab] = [];
    byTab[p.tab].push(p.item);
  });

  // Build a single combined patch document
  const lines = [];
  lines.push('# WatchTrack — Promotions Export');
  lines.push('# Generated: ' + new Date().toISOString());
  lines.push(`# Total promotions: ${promotionsCache.length} across ${Object.keys(byTab).length} tab(s)`);
  lines.push('#');
  lines.push('# Instructions:');
  lines.push('# Each section below corresponds to one catalog file in the WatchTrack repo:');
  lines.push('#   data/{tab-id}.json');
  lines.push('# For each tab, copy the items array into the appropriate section of that catalog file.');
  lines.push('# Most natural fit is a section named "Plex History" or "Already Watched" — or create');
  lines.push('# a new section. After committing to the repo, return to Manage Promotions and Delete');
  lines.push('# the corresponding KV entries to clean up.');
  lines.push('');

  for (const tab of Object.keys(byTab).sort()) {
    const tabLabel = (catalogs[tab] && catalogs[tab].title) || tab;
    lines.push('================================================================================');
    lines.push(`# Tab: ${tabLabel}`);
    lines.push(`# File: data/${tab}.json`);
    lines.push(`# Items: ${byTab[tab].length}`);
    lines.push('================================================================================');
    lines.push('');
    lines.push(JSON.stringify(byTab[tab], null, 2));
    lines.push('');
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `watchtrack-promotions-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateWebhookStatusLine() {
  const status = document.getElementById('webhook-status');
  if (!status) return;
  if (!isWebhookConfigured()) {
    status.textContent = 'Not configured.';
    status.className = 'settings-status';
  } else {
    const lastPoll = getWebhookLastPoll();
    const ago = lastPoll ? Math.floor((Date.now() - lastPoll) / 60000) : 0;
    status.textContent = lastPoll
      ? `Configured. Last poll: ${ago}m ago.`
      : 'Configured. Not yet polled.';
    status.className = 'settings-status ok';
  }
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

// === Bulk-sync results ===
function renderBulkSyncReport(r) {
  let html = '';
  html += '<h4>Overall</h4>';
  html += `<div class="stat-line"><span>Plex history entries fetched</span><strong>${r.totalEntries}</strong></div>`;
  html += `<div class="stat-line"><span>Stored to durable history</span><strong>${r.workerStored}</strong></div>`;
  html += `<div class="stat-line"><span>Filtered (excluded library)</span><strong>${r.workerFiltered}</strong></div>`;
  html += '<h4>Movies</h4>';
  html += `<div class="stat-line"><span>Distinct movies seen on Plex</span><strong>${r.moviesProcessed}</strong></div>`;
  html += `<div class="stat-line"><span>Matched to WatchTrack catalog</span><strong>${r.moviesMatchedToCatalog}</strong></div>`;
  html += `<div class="stat-line"><span>Newly marked Watched</span><strong>${r.moviesMarkedWatched}</strong></div>`;
  html += `<div class="stat-line"><span>Orphans (not in catalog, logged to history)</span><strong>${r.moviesOrphan}</strong></div>`;
  html += '<h4>TV shows</h4>';
  html += `<div class="stat-line"><span>Distinct shows seen on Plex</span><strong>${r.showsProcessed}</strong></div>`;
  html += `<div class="stat-line"><span>Matched to WatchTrack catalog</span><strong>${r.showsMatchedToCatalog}</strong></div>`;
  html += `<div class="stat-line"><span>Marked Watching</span><strong>${r.showsMarkedWatching}</strong></div>`;
  html += `<div class="stat-line"><span>Marked Loved (5+ distinct episodes)</span><strong>${r.showsMarkedLoved}</strong></div>`;
  html += `<div class="stat-line"><span>Orphans (not in catalog, logged to history)</span><strong>${r.showsOrphan}</strong></div>`;
  if (r.movieOrphans.length > 0) {
    html += '<h4>Movie orphans (top 15)</h4>';
    r.movieOrphans
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 15)
      .forEach(o => {
        html += `<div class="stat-line"><span>${o.title} (${o.year || '?'})</span><strong>${o.plays} play${o.plays === 1 ? '' : 's'}</strong></div>`;
      });
  }
  if (r.showOrphans.length > 0) {
    html += '<h4>TV orphans</h4>';
    r.showOrphans
      .sort((a, b) => b.distinct - a.distinct)
      .forEach(o => {
        html += `<div class="stat-line"><span>${o.show}</span><strong>${o.distinct} ep / ${o.plays} play${o.plays === 1 ? '' : 's'}</strong></div>`;
      });
  }
  html += '<p class="settings-help" style="margin-top:12px">Orphans were logged to your durable Plex history (Cloudflare KV). Future versions will surface them in a Plex History modal where you can promote frequently-watched items into the catalog.</p>';
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
  catalogEnrichmentIdx = loadCatalogEnrichment();
  // Fetch + merge promotions (cross-device persistence)
  if (isWebhookConfigured()) {
    await fetchPromotions();
    mergePromotionsIntoCatalogs();
  }
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
  // If webhook bridge is configured, poll for events on startup
  if (isWebhookConfigured()) {
    pollPlexWebhookEvents();
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
