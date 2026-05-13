function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// === Reaction tag taxonomy by content type ===
// Each item resolves to ONE content type. The UI shows the matching set.
// Tags stored on items that aren't in the current type's set are preserved silently.
const TAG_SETS = {
  'film-narrative': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","Smart structure","Emotionally resonant","Want more like this"],
    negative: ["Too slow","Too bleak","Too cold","Style over substance","Premise didn't land","Dated badly"]
  },
  'film-scifi': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","Mind-bending","World-building sells it","Hard sci-fi done right","Want more like this"],
    negative: ["Premise didn't land","Too exposition-heavy","Science is hand-waved","CGI ages badly","Style over substance","Dated badly"]
  },
  'film-espionage': {
    positive: ["Rewatchable","Stayed with me","Tradecraft feels real","Cat-and-mouse tension","Smart structure","Visually stunning","Want more like this"],
    negative: ["Too convoluted","Twists feel cheap","Implausibly invincible","Dated politics","Style over substance","Too slow"]
  },
  'film-crime': {
    positive: ["Rewatchable","Stayed with me","Great tension","Moral complexity","Smart structure","Performance-driven","Want more like this"],
    negative: ["Too bleak","Glorifies the wrong people","Twist doesn't hold up","Too formulaic","Pacing drags","Dated badly"]
  },
  'film-cons-courtroom': {
    positive: ["Rewatchable","Stayed with me","Great twist","Smart structure","Performance-driven","Dialogue sparkles","Want more like this"],
    negative: ["Twist doesn't hold up","Too predictable","Courtroom logic strained","Pacing drags","Style over substance","Dated badly"]
  },
  'film-horror': {
    positive: ["Rewatchable","Stayed with me","Genuinely unsettling","Great atmosphere","Smart structure","Visually stunning","Want more like this"],
    negative: ["Jump-scare crutch","Gore over craft","Not scary","Too bleak","Premise didn't land","Dated badly"]
  },
  'film-fantasy': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","World-building sells it","Emotionally resonant","Mythic weight","Want more like this"],
    negative: ["World-building over story","CGI ages badly","Too long","Tonally uneven","Premise didn't land","Dated badly"]
  },
  'film-heist': {
    positive: ["Rewatchable","Stayed with me","Smart structure","Great twist","Ensemble chemistry","Plan is satisfying","Want more like this"],
    negative: ["Twist doesn't hold up","Too convoluted","Style over substance","Characters thin","Pacing drags","Dated badly"]
  },
  'film-comedy': {
    positive: ["Rewatchable","Stayed with me","Laugh-out-loud funny","Quotable","Smart structure","Emotionally resonant","Want more like this"],
    negative: ["Humor doesn't land","Too crude","Sentimental","One-joke premise","Dated badly","Pacing drags"]
  },
  'film-drama': {
    positive: ["Rewatchable","Stayed with me","Performance-driven","Emotionally resonant","Smart structure","Visually stunning","Want more like this"],
    negative: ["Too bleak","Manipulative","Too slow","Oscar-bait feel","Premise didn't land","Dated badly"]
  },
  'film-foreign': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","Culturally immersive","Emotionally resonant","Smart structure","Want more like this"],
    negative: ["Subtitles distract","Too slow","Style over substance","Culturally opaque","Premise didn't land","Dated badly"]
  },
  'film-auteur': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","Director's voice unmistakable","Smart structure","Emotionally resonant","Want more like this"],
    negative: ["Self-indulgent","Style over substance","Too slow","Alienating","Premise didn't land","Dated badly"]
  },
  'film-pre1960': {
    positive: ["Rewatchable","Stayed with me","Still holds up","Performance-driven","Visually inventive","Smart structure","Want more like this"],
    negative: ["Dated badly","Pacing drags","Acting style alienating","Cultural blind spots","Visually flat","Premise didn't land"]
  },
  'film-heroes': {
    positive: ["Rewatchable","Stayed with me","Visually stunning","Earned the stakes","Smart structure","Faithful adaptation","Want more like this"],
    negative: ["CGI overload","Villain is thin","Origin-story fatigue","Franchise filler","Style over substance","Dated badly"]
  },
  'tv-prestige': {
    positive: ["Stuck the landing","Stayed with me","Performance-driven","Smart structure","Emotionally resonant","Want more like this","Rewatchable"],
    negative: ["Lost steam","Late-season decline","Too bleak","Stretched thin","Premise wore out","Dated badly"]
  },
  'tv-scifi': {
    positive: ["Stuck the landing","Stayed with me","World-building sells it","Mind-bending","Visually stunning","Performance-driven","Want more like this"],
    negative: ["Lost steam","Science is hand-waved","CGI ages badly","Mythology collapses","Too exposition-heavy","Dated badly"]
  },
  'tv-espionage': {
    positive: ["Stuck the landing","Stayed with me","Tradecraft feels real","Cat-and-mouse tension","Smart structure","Performance-driven","Want more like this"],
    negative: ["Lost steam","Too convoluted","Twists feel cheap","Stretched thin","Dated politics","Late-season decline"]
  },
  'tv-crime': {
    positive: ["Stuck the landing","Stayed with me","Great tension","Moral complexity","Performance-driven","Smart structure","Want more like this"],
    negative: ["Lost steam","Procedural fatigue","Too bleak","Case-of-the-week tires","Stretched thin","Late-season decline"]
  },
  'tv-cons-courtroom': {
    positive: ["Stuck the landing","Stayed with me","Smart structure","Performance-driven","Dialogue sparkles","Great twist","Want more like this"],
    negative: ["Lost steam","Courtroom logic strained","Too predictable","Stretched thin","Late-season decline","Premise wore out"]
  },
  'tv-horror': {
    positive: ["Stuck the landing","Stayed with me","Genuinely unsettling","Great atmosphere","Performance-driven","Visually stunning","Want more like this"],
    negative: ["Lost steam","Not scary enough","Gore over craft","Mythology collapses","Jump-scare crutch","Late-season decline"]
  },
  'tv-fantasy': {
    positive: ["Stuck the landing","Stayed with me","World-building sells it","Visually stunning","Emotionally resonant","Mythic weight","Want more like this"],
    negative: ["Lost steam","World-building over story","CGI ages badly","Stretched thin","Tonally uneven","Late-season decline"]
  },
  'tv-drama': {
    positive: ["Stuck the landing","Stayed with me","Performance-driven","Emotionally resonant","Smart structure","Visually stunning","Want more like this"],
    negative: ["Lost steam","Too bleak","Manipulative","Stretched thin","Late-season decline","Premise wore out"]
  },
  'tv-heroes': {
    positive: ["Stuck the landing","Stayed with me","Visually stunning","Earned the stakes","Performance-driven","Faithful adaptation","Want more like this"],
    negative: ["Lost steam","CGI overload","Villain is thin","Franchise filler","Stretched thin","Late-season decline"]
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

// v7.1.0: Hall of Fame — universal positive tag, last in every content type's
// positive array. Selecting it auto-sets rating to Loved (see toggleTag).
Object.keys(TAG_SETS).forEach(k => {
  if (!TAG_SETS[k].positive.includes('Hall of Fame')) {
    TAG_SETS[k].positive.push('Hall of Fame');
  }
});

// Backwards compatibility: legacy POSITIVE_TAGS/NEGATIVE_TAGS still referenced from import code.
const POSITIVE_TAGS = TAG_SETS['film-narrative'].positive;
const NEGATIVE_TAGS = TAG_SETS['film-narrative'].negative;

// Default content type per tab. Items in British Comedy resolve via category.
// Items can override at the catalog level via `contentType` on the item or section.
const TAB_DEFAULT_CONTENT_TYPE = {
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
const CATEGORY_TO_CONTENT_TYPE = {
  'panel': 'tv-panel',
  'news-comedy': 'tv-panel',
  'game': 'tv-game',
  'sitcom': 'tv-sitcom'
};

// V5.26.6: resolveContentType now accepts an optional sourceTab parameter so
// items being rendered outside their home tab (e.g. in the watchlist or
// triage queue) still fall back to the right per-tab default. Without this,
// activeTab would be 'watchlist' for triage and items without categories
// would resolve to 'film-narrative' regardless of source.
function resolveContentType(item, sourceTab) {
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

function getTagSetForItem(item, sourceTab) {
  const t = resolveContentType(item, sourceTab);
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
const auteurDirectorSet = new Set();
// Tag pill filter state (Stage 5d-1) — in-memory only, resets on tab switch.
// Maps tabId → Set of selected tag strings. Mode: 'and' | 'or' (per tab).
const activeTagFilters = {};   // { tabId: Set<string> }
const tagFilterMode = {};      // { tabId: 'and' | 'or' }
function getActiveTagFilters(tab) {
  if (!activeTagFilters[tab]) activeTagFilters[tab] = new Set();
  return activeTagFilters[tab];
}
function getTagFilterMode(tab) {
  return tagFilterMode[tab] || 'and';
}
function setTagFilterMode(tab, mode) {
  tagFilterMode[tab] = (mode === 'or') ? 'or' : 'and';
}
function clearTagFilters(tab) {
  if (activeTagFilters[tab]) activeTagFilters[tab].clear();
}

// === Display mode — persisted in localStorage ===
// 'auto' | 'tv' | 'phone' | 'computer'
// Detection picks one of: 'tv' (TV UA or large landscape no-touch), 'computer'
// (non-TV with viewport ≥ 1024px and mouse-class input), or 'phone' (everything
// else). Manual pref overrides detection. The 'computer' option is shown in
// Settings only when detection says 'computer' — that lets the user preview
// other modes from a laptop without polluting the option list on phones/TVs.
const DISPLAY_MODE_KEY = 'watchtrack-display-mode';
function getDisplayModePref() {
  return lsGet(DISPLAY_MODE_KEY) || 'auto';
}
function setDisplayModePref(mode) {
  if (mode === 'auto') lsDel(DISPLAY_MODE_KEY);
  else lsSet(DISPLAY_MODE_KEY, mode);
}
function detectTVMode() {
  const ua = navigator.userAgent.toLowerCase();
  if (/\b(googletv|google_tv|smarttv|smart-tv|crkey|chromecast|bravia|aftv|webos|tizen|netcast)\b/.test(ua)) return true;
  const big = window.innerWidth >= 1280 && window.innerHeight >= 720;
  const landscape = window.innerWidth > window.innerHeight;
  const noTouch = !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
  return big && landscape && noTouch;
}
function detectComputerMode() {
  if (detectTVMode()) return false;
  const wide = window.innerWidth >= 1024;
  const hasMouse = matchMedia('(pointer: fine)').matches;
  return wide && hasMouse;
}
function getDetectedMode() {
  if (detectTVMode()) return 'tv';
  if (detectComputerMode()) return 'computer';
  return 'phone';
}
function getEffectiveMode() {
  const pref = getDisplayModePref();
  if (pref === 'tv' || pref === 'phone' || pref === 'computer') return pref;
  return getDetectedMode();
}
function isTVMode() { return getEffectiveMode() === 'tv'; }
function applyDisplayMode() {
  const mode = getEffectiveMode();
  document.body.classList.toggle('tv-mode', mode === 'tv');
  document.body.classList.toggle('phone-mode', mode === 'phone');
  document.body.classList.toggle('computer-mode', mode === 'computer');
}
// Show the "Computer" radio option in Settings only when the device looks
// like a desktop browser. This lets the user preview phone/TV layouts from
// their laptop without putting an irrelevant option on phones and TVs.
function updateDisplayModePicker() {
  const label = document.getElementById('display-mode-computer-label');
  if (!label) return;
  label.style.display = (getDetectedMode() === 'computer') ? '' : 'none';
}

// === Plex settings ===
const PLEX_TOKEN_KEY = 'watchtrack-plex-token';
const PLEX_SERVER_URL_KEY = 'watchtrack-plex-server-url';
const PLEX_CLIENT_ID_KEY = 'watchtrack-plex-client-id';
function getPlexToken() { return lsGet(PLEX_TOKEN_KEY) || ''; }
function setPlexToken(t) {
  if (!t) lsDel(PLEX_TOKEN_KEY);
  else lsSet(PLEX_TOKEN_KEY, t);
}
function getPlexServerUrl() { return lsGet(PLEX_SERVER_URL_KEY) || ''; }
function setPlexServerUrl(u) {
  if (!u) lsDel(PLEX_SERVER_URL_KEY);
  else lsSet(PLEX_SERVER_URL_KEY, u.replace(/\/$/, ''));
}
function getPlexClientId() { return lsGet(PLEX_CLIENT_ID_KEY) || ''; }
function setPlexClientId(c) {
  if (!c) lsDel(PLEX_CLIENT_ID_KEY);
  else lsSet(PLEX_CLIENT_ID_KEY, c);
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
  if (!isWebhookConfigured()) return;
  const workerUrl = getWebhookUrl();
  const secret = getWebhookSecret();
  try {
    const resp = await fetch(`${workerUrl}/plex/library?secret=${encodeURIComponent(secret)}`);
    if (!resp.ok) {
      console.warn('Plex library fetch failed:', resp.status);
      return;
    }
    const data = await resp.json();
    if (data.error) {
      console.warn('Plex library worker error:', data.error);
      return;
    }
    const items = data.items || [];
    const newLib = new Map();
    items.forEach(it => {
      const key = plexNormalizeKey(it.title, it.year);
      newLib.set(key, {
        ratingKey: it.ratingKey,
        title: it.title,
        year: it.year,
        type: it.type
      });
    });
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
  if (!isWebhookConfigured()) return false;
  const workerUrl = getWebhookUrl();
  const secret = getWebhookSecret();
  try {
    const resp = await fetch(`${workerUrl}/plex/scrobble`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, ratingKey }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return Boolean(data.ok);
  } catch (e) { return false; }
}

// === Plex webhook bridge (Cloudflare Worker) ===
const WEBHOOK_URL_KEY = 'watchtrack-webhook-url';
const WEBHOOK_SECRET_KEY = 'watchtrack-webhook-secret';
const WEBHOOK_LAST_POLL_KEY = 'watchtrack-webhook-last-poll';

function getWebhookUrl() { return lsGet(WEBHOOK_URL_KEY) || ''; }
function setWebhookUrl(u) {
  if (!u) lsDel(WEBHOOK_URL_KEY);
  else lsSet(WEBHOOK_URL_KEY, u.replace(/\/$/, ''));
}
function getWebhookSecret() { return lsGet(WEBHOOK_SECRET_KEY) || ''; }
function setWebhookSecret(s) {
  if (!s) lsDel(WEBHOOK_SECRET_KEY);
  else lsSet(WEBHOOK_SECRET_KEY, s);
}
function getWebhookLastPoll() {
  return parseInt(lsGet(WEBHOOK_LAST_POLL_KEY) || '0');
}
function setWebhookLastPoll(ts) {
  lsSet(WEBHOOK_LAST_POLL_KEY, String(ts));
}

// === v7.1.0: Palate — D1-backed archive of fully-processed items ===
// archivedIds is the live mask used by render(). Cached in localStorage for
// instant first paint; refreshed from /palate/archived in the background.
const PALATE_ARCHIVED_KEY = 'watchtrack-palate-archived';
let archivedIds = new Set();

function paletteKey(tabId, itemId) { return `${tabId}:${itemId}`; }
function isArchived(tabId, itemId) { return archivedIds.has(paletteKey(tabId, itemId)); }

async function loadArchivedIds() {
  try {
    const cached = lsGet(PALATE_ARCHIVED_KEY);
    if (cached) archivedIds = new Set(JSON.parse(cached));
  } catch {}
  if (!isWebhookConfigured()) return;
  try {
    const resp = await fetch(`${getWebhookUrl()}/palate/archived?secret=${encodeURIComponent(getWebhookSecret())}`);
    if (!resp.ok) return;
    const data = await resp.json();
    archivedIds = new Set(data.ids || []);
    lsSet(PALATE_ARCHIVED_KEY, JSON.stringify([...archivedIds]));
  } catch {}
}

// Fire-and-forget upsert. Used by both archiveItem and Hall of Fame toggling.
function palateUpsert(payload) {
  if (!isWebhookConfigured()) return;
  fetch(`${getWebhookUrl()}/palate/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: getWebhookSecret(), ...payload }),
  }).catch(() => {});
}

// reason: 'finished' | 'notInterested'
function archiveItem(tabId, itemId, reason) {
  const key = paletteKey(tabId, itemId);
  archivedIds.add(key);
  lsSet(PALATE_ARCHIVED_KEY, JSON.stringify([...archivedIds]));
  const s = (state[tabId] && state[tabId][itemId]) || {};
  const cat = catalogs[tabId];
  const item = cat && cat.items && cat.items.find(it => it.id === itemId);
  const enrich = getEnrichmentForItem(itemId);
  const tags = s.reactionTags || [];
  palateUpsert({
    tabId, itemId,
    title: item ? item.title : itemId,
    year: item ? item.year : null,
    tmdbId: enrich ? enrich.tmdbId : null,
    status: s.status || 'none',
    rating: s.rating || 'none',
    reactionTags: tags,
    notes: s.notes || '',
    archived: 1,
    archivedReason: reason,
    hof: tags.includes('Hall of Fame') ? 1 : 0,
  });
  // Yank the rendered card from the DOM without forcing a full re-render.
  const itemEl = document.querySelector(`.item[data-id="${itemId}"]`);
  if (itemEl) itemEl.remove();
}

// === Trakt settings ===
const TRAKT_API_BASE           = 'https://api.trakt.tv';
const TRAKT_CLIENT_ID_KEY      = 'watchtrack-trakt-client-id';
const TRAKT_CLIENT_SECRET_KEY  = 'watchtrack-trakt-client-secret';
const TRAKT_ACCESS_TOKEN_KEY   = 'watchtrack-trakt-access-token';
const TRAKT_REFRESH_TOKEN_KEY  = 'watchtrack-trakt-refresh-token';
const TRAKT_USERNAME_KEY       = 'watchtrack-trakt-username';

function getTraktClientId()     { return lsGet(TRAKT_CLIENT_ID_KEY) || ''; }
function setTraktClientId(v)    { if (!v) lsDel(TRAKT_CLIENT_ID_KEY); else lsSet(TRAKT_CLIENT_ID_KEY, v.trim()); }
function getTraktClientSecret() { return lsGet(TRAKT_CLIENT_SECRET_KEY) || ''; }
function setTraktClientSecret(v){ if (!v) lsDel(TRAKT_CLIENT_SECRET_KEY); else lsSet(TRAKT_CLIENT_SECRET_KEY, v.trim()); }
function getTraktAccessToken()  { return lsGet(TRAKT_ACCESS_TOKEN_KEY) || ''; }
function setTraktAccessToken(t) { if (!t) lsDel(TRAKT_ACCESS_TOKEN_KEY); else lsSet(TRAKT_ACCESS_TOKEN_KEY, t); }
function getTraktRefreshToken() { return lsGet(TRAKT_REFRESH_TOKEN_KEY) || ''; }
function setTraktRefreshToken(t){ if (!t) lsDel(TRAKT_REFRESH_TOKEN_KEY); else lsSet(TRAKT_REFRESH_TOKEN_KEY, t); }
function getTraktUsername()     { return lsGet(TRAKT_USERNAME_KEY) || ''; }
function setTraktUsername(u)    { if (!u) lsDel(TRAKT_USERNAME_KEY); else lsSet(TRAKT_USERNAME_KEY, u); }
function isTraktConnected()     { return Boolean(getTraktClientId() && getTraktAccessToken()); }
function isWebhookConfigured() {
  return Boolean(getWebhookUrl() && getWebhookSecret());
}

// Poll the Worker for new events. Apply each one to CinéMath state.
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
      const ackResp = await fetch(`${url}/events/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, eventIds: ackIds }),
      });
      if (!ackResp.ok) {
        // Don't advance the poll cursor — let these events re-deliver next cycle.
        return { applied, errors: errors + 1 };
      }
    }
    setWebhookLastPoll(Date.now());
    return { applied, errors };
  } catch (e) {
    return { applied: 0, errors: 1 };
  }
}

// Apply a single webhook event to CinéMath state.
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
  if (!isWebhookConfigured()) throw new Error('Plex Webhook Bridge not configured');
  const workerUrl = getWebhookUrl();
  const secret = getWebhookSecret();
  const pageSize = 500;
  let start = 0;
  const all = [];
  while (true) {
    const fetchUrl = `${workerUrl}/plex/history?secret=${encodeURIComponent(secret)}&start=${start}&size=${pageSize}`;
    const resp = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`Plex history fetch ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
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

// Apply bulk-sync rules to CinéMath state given the full filtered history.
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

  progressCb('Applying rules to CinéMath...', 80);
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
    const raw = lsGet(tmdbCacheKey(title, year, type));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.cachedAt && (Date.now() - obj.cachedAt > TMDB_CACHE_TTL_MS)) return null;
    return obj.data;
  } catch { return null; }
}

function tmdbSetCached(title, year, type, data) {
  try {
    lsSet(tmdbCacheKey(title, year, type), JSON.stringify({
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
  return lsGet(REGION_KEY) || 'US';
}
function setStreamingRegion(r) {
  lsSet(REGION_KEY, r || 'US');
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
  'HBO Max': 'https://play.max.com/search?q={q}',
  'Disney Plus': 'https://www.disneyplus.com/search?q={q}',
  'Disney+': 'https://www.disneyplus.com/search?q={q}',
  'Amazon Prime Video': 'https://www.amazon.com/s?k={q}&i=instant-video',
  'Apple TV Plus': 'https://tv.apple.com/search?term={q}',
  'Apple TV+': 'https://tv.apple.com/search?term={q}',
  'Apple TV': 'https://tv.apple.com/search?term={q}',
  'Paramount Plus': 'https://www.paramountplus.com/search/{q}',
  'Paramount+': 'https://www.paramountplus.com/search/{q}',
  'Paramount Plus with Showtime': 'https://www.paramountplus.com/search/{q}',
  'Peacock': 'https://www.peacocktv.com/search?q={q}',
  'BBC iPlayer': 'https://www.bbc.co.uk/iplayer/search?q={q}',
  'Crunchyroll': 'https://www.crunchyroll.com/search?q={q}',
  'YouTube': 'https://www.youtube.com/results?search_query={q}',
  'Google Play Movies': 'https://play.google.com/store/search?q={q}&c=movies',
  'Vudu': 'https://www.vudu.com/content/movies/search?searchString={q}',
  'PBS Masterpiece Amazon Channel': 'https://www.amazon.com/s?k={q}+pbs+masterpiece&i=instant-video',
  'PBS Masterpiece': 'https://www.pbs.org/search/?q={q}',
  'National Theatre at Home': 'https://www.ntathome.com/search/{q}',
  'Dropout': 'https://www.dropout.tv/search?q={q}',
  '2nd Try': 'https://www.youtube.com/@2ndTry/search?query={q}',
  'Mubi': 'https://mubi.com/search/films?query={q}',
  'Criterion Channel': 'https://www.criterionchannel.com/search?q={q}',
  'Shudder': 'https://www.shudder.com/search?q={q}',
  'BritBox': 'https://www.britbox.com/us/search?q={q}',
  'Acorn TV': 'https://acorn.tv/search/{q}',
  'AMC+': 'https://www.amcplus.com/search?q={q}',
  'Starz': 'https://www.starz.com/us/en/search?q={q}',
  // For unknown providers, fall back to Google search
};

// === V5.21.0: My Subscriptions (TMDB watch-provider prioritization) ===
const MY_SUBS_KEY = 'watchtrack-my-subscriptions';

// Default profile (Lincoln's, configured 2026-05-08). User can edit in Settings.
const DEFAULT_MY_SUBS = [
  'Hulu',
  'Disney+',
  'Max',
  'Amazon Prime Video',
  'Apple TV+',
  'Paramount+',
  'PBS Masterpiece (via Prime)',
  'National Theatre at Home',
  'Dropout',
  '2nd Try'
];

// Canonical name → list of TMDB-style aliases. Used by isMySub() to match.
// Niche services without TMDB representation (Dropout, 2nd Try, NT at Home)
// stay in the user's list but won't match TMDB results — they show in Settings
// as "owned" without ever appearing as a Watch button.
const PROVIDER_ALIASES = {
  'Netflix': ['Netflix'],
  'Hulu': ['Hulu'],
  'Disney+': ['Disney Plus', 'Disney+'],
  'Max': ['Max', 'HBO Max'],
  'Amazon Prime Video': ['Amazon Prime Video', 'Amazon Video'],
  'Apple TV+': ['Apple TV Plus', 'Apple TV+', 'Apple TV'],
  'Paramount+': ['Paramount Plus', 'Paramount+', 'Paramount Plus with Showtime'],
  'Peacock': ['Peacock', 'Peacock Premium', 'Peacock Premium Plus'],
  'PBS Masterpiece (via Prime)': ['PBS Masterpiece Amazon Channel', 'PBS Masterpiece'],
  'Criterion Channel': ['Criterion Channel'],
  'Mubi': ['Mubi'],
  'Shudder': ['Shudder'],
  'BritBox': ['BritBox'],
  'Acorn TV': ['Acorn TV'],
  'AMC+': ['AMC+'],
  'Starz': ['Starz'],
  'Crunchyroll': ['Crunchyroll'],
  'National Theatre at Home': ['National Theatre at Home'],
  'Dropout': ['Dropout', 'Dropout TV'],
  '2nd Try': ['2nd Try', 'Second Try'],
};

function getMySubscriptions() {
  try {
    const raw = lsGet(MY_SUBS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_MY_SUBS.slice();
}
function setMySubscriptions(arr) {
  lsSet(MY_SUBS_KEY, JSON.stringify(arr));
}
// Returns true if the TMDB-returned provider name matches one of the user's subs
function isMySub(providerName) {
  const subs = new Set(getMySubscriptions());
  if (subs.has(providerName)) return true;
  for (const [canonical, aliases] of Object.entries(PROVIDER_ALIASES)) {
    if (aliases.includes(providerName) && subs.has(canonical)) return true;
  }
  return false;
}

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
    const raw = lsGet(CATALOG_ENRICHMENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCatalogEnrichment(idx) {
  try {
    lsSet(CATALOG_ENRICHMENT_KEY, JSON.stringify(idx));
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
      // Skip only if fresh AND has tmdbId AND has rec arrays (added in v5.14 for Stage 5e).
      // Older enrichment records without rec arrays will be re-fetched.
      const hasRecs = existing && (existing.recommendations || existing.similar);
      if (existing && existing.lastEnriched && (Date.now() - existing.lastEnriched < STALE_MS) && existing.tmdbId && hasRecs) return;
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
            recommendations: r.result.recommendations || [],
            similar: r.result.similar || [],
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
    const raw = lsGet(cacheKey);
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
      lsSet(cacheKey, JSON.stringify({ cachedAt: Date.now(), data }));
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
    const raw = lsGet(STORAGE_KEY);
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
  // v6.0.0: lsSet writes to IndexedDB fire-and-forget. The dedicated
  // mirror layer from v5.41 is gone — every persisted key flows through
  // the same code path now, so a single lsSet here covers durability
  // and quota headroom both.
  try { lsSet(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('Save failed:', e); }
  // V5.28.0: mark sync dirty so the debounced push captures this change
  if (typeof syncMarkDirty === 'function') syncMarkDirty();
}

// === v6.0.0: IndexedDB primary store (cache-backed-by-IDB) ===
//
// Architecture:
//   _kv          in-memory Map<string,string>, the synchronous source
//                of truth at runtime. Hydrated from IndexedDB at boot.
//   IndexedDB    durable backing store. Every lsSet writes through to
//                IDB fire-and-forget; reads only ever hit _kv.
//   localStorage legacy. Read-once at first boot of v6.0.0 to migrate
//                pre-existing keys into IDB; thereafter unused. The
//                pre-v6 mirror behavior collapses into this single
//                layer — no more "fall back to IDB if localStorage is
//                empty" because IDB IS the canonical store.
//
// Why cache-backed instead of fully async: every existing callsite
// expected synchronous getItem/setItem semantics. Making them async
// would cascade through 75 callsites including hot paths like
// setStatus, setRating, render. The cache wrapper preserves the
// signatures while still moving the durable store off the localStorage
// quota cap onto IDB's effectively-unbounded space.

const IDB_NAME = 'watchtrack';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';
const IDB_STATE_KEY = 'state-snapshot';
const IDB_BACKUP_PREFIX = 'localstorage-backup:';
const IDB_MIGRATED_V6_KEY = 'migrated-v6.0';
let _idbConn = null;
const _kv = new Map();
let _kvHydrated = false;

function idbOpen() {
  if (_idbConn) return Promise.resolve(_idbConn);
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => { _idbConn = req.result; resolve(_idbConn); };
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })).catch(() => null);
}

function idbSet(key, value) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  })).catch(() => false);
}

function idbDelete(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  })).catch(() => false);
}

// Iterate every key in the IDB store. Used by hydrate() at bootstrap.
function idbListAll() {
  return idbOpen().then(db => new Promise((resolve) => {
    const out = {};
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) { resolve(out); return; }
      out[cur.key] = cur.value;
      cur.continue();
    };
    req.onerror = () => resolve(out);
  })).catch(() => ({}));
}

// === v6.0.0: synchronous KV wrappers backed by the in-memory cache ===
// API matches localStorage.getItem/setItem/removeItem so all existing
// callsites work unchanged after a one-shot identifier rename.
function lsGet(key) {
  return _kv.has(key) ? _kv.get(key) : null;
}
function lsSet(key, value) {
  const v = String(value);
  _kv.set(key, v);
  // fire-and-forget IDB write; in-memory cache is the read source of truth
  idbSet(key, v);
}
function lsDel(key) {
  _kv.delete(key);
  idbDelete(key);
}
// Iterate cache keys (for migration walks and rare bulk-introspection).
function lsKeys() { return [..._kv.keys()]; }

// Bootstrap hydration: load every IDB key into _kv, run the one-time
// pre-v6 migration if needed, then mark as hydrated. Must complete
// before any lsGet runs.
async function hydrate() {
  if (_kvHydrated) return;
  let allFromIdb = {};
  try { allFromIdb = await idbListAll(); } catch { allFromIdb = {}; }
  // Populate cache from IDB first so subsequent lsGet calls see real data.
  for (const k of Object.keys(allFromIdb)) {
    if (k.startsWith('watchtrack-') || k.startsWith('scifi-tracker-')) {
      _kv.set(k, String(allFromIdb[k]));
    }
  }
  // One-time migration from localStorage if v6 hasn't run yet on this device.
  // Important: the v5.41 mirror layer left both stores populated; we want IDB
  // to win conflicts (fresher snapshots) but NOT lose localStorage-only
  // keys that pre-date the mirror.
  const v6Done = !!allFromIdb[IDB_MIGRATED_V6_KEY];
  if (!v6Done && typeof localStorage !== 'undefined') {
    const backup = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('watchtrack-') || k.startsWith('scifi-tracker-')) {
        const v = localStorage.getItem(k);
        if (v == null) continue;
        backup[k] = v;
        // Cache wins if IDB already had it; otherwise localStorage seeds it.
        if (!_kv.has(k)) {
          _kv.set(k, v);
          idbSet(k, v);
        }
      }
    }
    // Belt-and-suspenders: store the entire localStorage snapshot under
    // a single backup key so we can recover even if migration loses a
    // value during the rename. Drop in v6.1.
    idbSet(IDB_BACKUP_PREFIX + 'v5.41-pre-v6', { backup, ts: Date.now() });
    idbSet(IDB_MIGRATED_V6_KEY, true);
  }
  _kvHydrated = true;
}

// Bootstrap fallback retained for diagnostic value: caller can still
// invoke this to surface the most-recent state-snapshot via the cache.
// In v6.0 this is a no-op when the cache has the state already.
async function idbRestoreIfNeeded() {
  if (lsGet(STORAGE_KEY)) return false;
  const snap = await idbGet(IDB_STATE_KEY);
  if (snap && snap.state) {
    lsSet(STORAGE_KEY, JSON.stringify(snap.state));
    return true;
  }
  return false;
}

function loadActiveTab() {
  try {
    const t = lsGet(TAB_KEY);
    if (t) activeTab = t;
  } catch (e) {}
}
function saveActiveTab() {
  try { lsSet(TAB_KEY, activeTab); } catch (e) {}
}

async function loadCatalogManifest() {
  try {
    const resp = await fetch('data/catalogs.json');
    const data = await resp.json();
    catalogManifest = data.catalogs;
    auteurDirectorSet.clear();
    const auteurDef = catalogManifest.find(c => c.id === 'auteur');
    if (auteurDef && auteurDef.directors) auteurDef.directors.forEach(d => auteurDirectorSet.add(d.name));
  } catch (e) {
    catalogManifest = [
      { id: "watchlist", label: "Watchlist", virtual: true },
      { id: "auteur", label: "Auteur", virtual: true },
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
  const prevStatus = state[tab][id].status;
  state[tab][id].status = status;
  if (status !== 'watched' && status !== 'watching') {
    delete state[tab][id].rating;
    delete state[tab][id].reactionTags;
  }
  touchEntry(tab, id);
  // Push to Trakt if connected (fire-and-forget). For shows, 'watched' marks all aired episodes.
  const catItem = catalogs[tab] && catalogs[tab].items && catalogs[tab].items.find(it => it.id === id);
  if (catItem && catItem.year) {
    const isShow = !!catItem.seasons;
    if (status === 'watched') traktPushStatus(catItem.title, catItem.year, tab, 'watched', isShow);
    else if (status === 'none') traktPushStatus(catItem.title, catItem.year, tab, 'none', isShow);
  }
  // v5.39.0: refresh alerts subscription when an item enters/leaves the
  // queued/watching set, so the cron has the right list to monitor.
  const wasMonitored = prevStatus === 'queued' || prevStatus === 'watching';
  const isMonitored = status === 'queued' || status === 'watching';
  if (wasMonitored !== isMonitored && typeof alertsRefreshSubscription === 'function') {
    alertsRefreshSubscription();
  }
  // v7.2.0: Skip 2.5s auto-archive. Cycling through skip via cycleStatus
  // cancels the timer on the next change; landing on skip deliberately and
  // staying lets it fire. Stored on window so the Map survives function calls
  // without leaking into the module-scope variable list.
  window._skipTimers = window._skipTimers || new Map();
  const skipKey = `${tab}:${id}`;
  const existing = window._skipTimers.get(skipKey);
  if (existing) { clearTimeout(existing); window._skipTimers.delete(skipKey); }
  if (status === 'skip') {
    window._skipTimers.set(skipKey, setTimeout(() => {
      if (getStatus(id, tab) === 'skip') archiveItem(tab, id, 'notInterested');
      window._skipTimers.delete(skipKey);
    }, 2500));
  }
  saveState(); render();
}

function setRating(id, rating, tab) {
  tab = tab || activeTab;
  if (!state[tab]) state[tab] = {};
  if (!state[tab][id]) state[tab][id] = {};
  const prev = state[tab][id].rating;
  if (prev === rating) delete state[tab][id].rating;
  else state[tab][id].rating = rating;
  touchEntry(tab, id);
  // Push to Trakt if connected (fire-and-forget). Show ratings apply at the series level.
  const catItem = catalogs[tab] && catalogs[tab].items && catalogs[tab].items.find(it => it.id === id);
  if (catItem && catItem.year) {
    const isShow = !!catItem.seasons;
    traktPushRating(catItem.title, catItem.year, tab, prev === rating ? null : rating, isShow);
  }
  saveState(); updateItemInPlace(id);
}

// === Trakt helpers ===

function traktItemId(title, year) {
  return `${String(title).replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')}-${year}`;
}

function buildTraktMoviePayload(title, year, tab) {
  const enrichment = getEnrichmentForItem(traktItemId(title, year));
  const ids = {};
  if (enrichment && enrichment.tmdbId) ids.tmdb = enrichment.tmdbId;
  return { title, year: Number(year), ids };
}

async function traktApiCall(path, method, body, isRetry) {
  const clientId = getTraktClientId();
  if (!clientId) return { ok: false, status: 0 };
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
  const token = getTraktAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method: method || 'GET', headers };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${TRAKT_API_BASE}${path}`, opts);
  if (resp.status === 401 && !isRetry) {
    const refreshed = await traktRefreshTokens();
    if (refreshed) return traktApiCall(path, method, body, true);
    traktDisconnect();
    return { ok: false, status: 401 };
  }
  const data = resp.ok ? await resp.json().catch(() => ({})) : {};
  return { ok: resp.ok, status: resp.status, data };
}

async function traktRefreshTokens() {
  const clientId = getTraktClientId();
  const clientSecret = getTraktClientSecret();
  const refresh = getTraktRefreshToken();
  if (!clientId || !clientSecret || !refresh) return false;
  try {
    const resp = await fetch(`${TRAKT_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'refresh_token',
      }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    setTraktAccessToken(data.access_token);
    setTraktRefreshToken(data.refresh_token);
    return true;
  } catch { return false; }
}

function traktDisconnect() {
  setTraktAccessToken('');
  setTraktRefreshToken('');
  setTraktUsername('');
  updateTraktStatusLine();
}

function updateTraktStatusLine() {
  const el = document.getElementById('trakt-status');
  const disconnectBtn = document.getElementById('trakt-disconnect');
  const connectBtn = document.getElementById('trakt-connect');
  const syncBtn = document.getElementById('trakt-sync');
  if (!el) return;
  if (isTraktConnected()) {
    const user = getTraktUsername();
    el.textContent = user ? `Connected as @${user}.` : 'Connected.';
    el.className = 'settings-status ok';
    if (disconnectBtn) disconnectBtn.style.display = '';
    if (connectBtn) connectBtn.style.display = 'none';
    if (syncBtn) syncBtn.style.display = '';
  } else {
    el.textContent = 'Not connected.';
    el.className = 'settings-status';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (connectBtn) connectBtn.style.display = '';
    if (syncBtn) syncBtn.style.display = 'none';
  }
}

function traktPushStatus(title, year, tab, status, isShow) {
  if (!isTraktConnected()) return;
  const item = buildTraktMoviePayload(title, year, tab);
  const key = isShow ? 'shows' : 'movies';
  if (status === 'watched') {
    // For shows, omit watched_at so Trakt marks all aired episodes watched.
    const payload = isShow ? item : { ...item, watched_at: new Date().toISOString() };
    traktApiCall('/sync/history', 'POST', { [key]: [payload] });
  } else {
    traktApiCall('/sync/history/remove', 'POST', { [key]: [item] });
  }
}

function traktPushRating(title, year, tab, rating, isShow) {
  if (!isTraktConnected()) return;
  const item = buildTraktMoviePayload(title, year, tab);
  const key = isShow ? 'shows' : 'movies';
  const ratingMap = { loved: 8, liked: 6 };
  const score = ratingMap[rating];
  if (score) {
    traktApiCall('/sync/ratings', 'POST', { [key]: [{ ...item, rating: score, rated_at: new Date().toISOString() }] });
  } else {
    traktApiCall('/sync/ratings/remove', 'POST', { [key]: [item] });
  }
}

// v7.5.0: Trakt watchlist push for Quick Triage's Crusade (up-swipe).
// Fire-and-forget like traktPushStatus / traktPushRating. tabId determines
// movies-vs-shows routing the same way the other push helpers infer it.
async function traktPushWatchlist(title, year, tabId) {
  if (!isTraktConnected()) return;
  const payload = buildTraktMoviePayload(title, year, tabId);
  const isTV = tabId.endsWith('-tv') || tabId === 'british-comedy';
  const listKey = isTV ? 'shows' : 'movies';
  try {
    await traktApiCall('/sync/watchlist', 'POST', { [listKey]: [payload] });
  } catch (e) { /* fire-and-forget */ }
}

async function traktPullSync() {
  const status = document.getElementById('trakt-status');
  if (status) { status.textContent = 'Fetching from Trakt...'; status.className = 'settings-status'; }

  // v5.45.0: pull TV shows alongside films. Push for shows already worked
  // (mark-as-watched fans out to all aired episodes); pull was the only
  // half missing. Trakt returns one entry per series in /sync/history/shows
  // when any episode has been watched, which is exactly what we want for
  // marking a CinéMath show as watched.
  const [histResult, ratResult, showHistResult, showRatResult] = await Promise.all([
    traktApiCall('/sync/history/movies?limit=10000', 'GET'),
    traktApiCall('/sync/ratings/movies', 'GET'),
    traktApiCall('/sync/history/shows?limit=10000', 'GET'),
    traktApiCall('/sync/ratings/shows', 'GET'),
  ]);

  if (!histResult.ok && !ratResult.ok && !showHistResult.ok && !showRatResult.ok) {
    if (status) { status.textContent = 'Sync failed — check connection.'; status.className = 'settings-status err'; }
    return;
  }

  // Build lookup maps keyed by CinéMath item ID
  const historyMap = new Map();
  for (const entry of (histResult.data || [])) {
    const m = entry.movie;
    if (!m) continue;
    const id = traktItemId(m.title, m.year);
    if (!historyMap.has(id)) historyMap.set(id, { title: m.title, year: m.year, ids: m.ids });
  }
  for (const entry of (showHistResult.data || [])) {
    const s = entry.show;
    if (!s) continue;
    const id = traktItemId(s.title, s.year);
    if (!historyMap.has(id)) historyMap.set(id, { title: s.title, year: s.year, ids: s.ids });
  }

  const ratingMap = new Map();
  for (const entry of (ratResult.data || [])) {
    const m = entry.movie;
    if (!m) continue;
    const id = traktItemId(m.title, m.year);
    ratingMap.set(id, entry.rating);
  }
  for (const entry of (showRatResult.data || [])) {
    const s = entry.show;
    if (!s) continue;
    const id = traktItemId(s.title, s.year);
    ratingMap.set(id, entry.rating);
  }

  let matched = 0, rated = 0, showsMatched = 0, showsRated = 0;
  const TV_TABS = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);

  for (const tabId in catalogs) {
    if (tabId === 'watchlist' || tabId === 'auteur') continue;
    const cat = catalogs[tabId];
    if (!cat || !cat.items) continue;
    const isTvTab = TV_TABS.has(tabId);
    for (const item of cat.items) {
      const inHistory = historyMap.has(item.id);
      const traktRating = ratingMap.get(item.id);
      if (!inHistory && !traktRating) continue;
      if (!state[tabId]) state[tabId] = {};
      if (!state[tabId][item.id]) state[tabId][item.id] = {};
      if (inHistory && getStatus(item.id, tabId) !== 'watched') {
        const traktIds = historyMap.get(item.id).ids || {};
        state[tabId][item.id].status = 'watched';
        if (traktIds.tmdb) state[tabId][item.id].traktTmdbId = traktIds.tmdb;
        state[tabId][item.id].lastUpdated = Date.now();
        if (isTvTab) showsMatched++; else matched++;
      }
      if (traktRating && !state[tabId][item.id].rating) {
        const wtRating = traktRating >= 8 ? 'loved' : traktRating >= 5 ? 'liked' : null;
        if (wtRating) {
          state[tabId][item.id].rating = wtRating;
          if (isTvTab) showsRated++; else rated++;
        }
      }
    }
  }

  saveState();
  render();
  if (status) {
    const filmPart = `${matched} film watched, ${rated} rated`;
    const showPart = `${showsMatched} show watched, ${showsRated} rated`;
    status.textContent = `Sync complete — ${filmPart}; ${showPart}.`;
    status.className = 'settings-status ok';
  }
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
  // v7.1.0: Hall of Fame side effects.
  //   - Adding HoF when rating is 'none' auto-promotes to Loved.
  //     (setRating does NOT re-enter toggleTag, verified at app.js:setRating.)
  //   - Either direction mirrors to the palate D1 row with hof flag.
  if (tag === 'Hall of Fame') {
    const isAdding = state[tab][id].reactionTags.includes('Hall of Fame');
    if (isAdding && (state[tab][id].rating || 'none') === 'none') {
      setRating(id, 'loved', tab);
    }
    const catItem = catalogs[tab] && catalogs[tab].items && catalogs[tab].items.find(it => it.id === id);
    const enrich = getEnrichmentForItem(id);
    const s = state[tab][id];
    palateUpsert({
      tabId: tab, itemId: id,
      title: catItem ? catItem.title : id,
      year: catItem ? catItem.year : null,
      tmdbId: enrich ? enrich.tmdbId : null,
      status: s.status || 'none',
      rating: s.rating || 'none',
      reactionTags: s.reactionTags || [],
      notes: s.notes || '',
      archived: isArchived(tab, id) ? 1 : 0,
      archivedReason: null,
      hof: isAdding ? 1 : 0,
    });
  }
  saveState(); updateItemInPlace(id);
  // Rebuild tag pills since the set of tags-in-use may have changed
  if (typeof buildTagPills === 'function') buildTagPills();
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
  itemEl.dataset.rating = rating;  // v7.6.0: keep [data-rating] in sync for the loved-tint CSS
  itemEl.querySelectorAll('.rating-btn').forEach(btn => {
    btn.classList.remove('active-loved','active-liked','active-mixed','active-disliked');
    if (btn.dataset.rating === rating) btn.classList.add(`active-${rating}`);
  });
  let badge = itemEl.querySelector('.rating-badge');
  if (rating !== 'none') {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'rating-badge';
      const parent = itemEl.querySelector('.badge-row') || itemEl.querySelector('.item-head') || itemEl;
      parent.appendChild(badge);
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
  // v7.2.0: keep the Finished button's ready-inversion synced with tag count.
  const finishedBtn = itemEl.querySelector('.finished-btn');
  if (finishedBtn) {
    finishedBtn.classList.toggle('finished-btn--ready', reactionTags.length > 0);
  }
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

// Tab content-type filter — 'all' | 'film' | 'tv'. Persists in localStorage.
// Virtual tabs (watchlist, auteur) always show regardless of filter.
const TAB_FILTER_KEY = 'watchtrack-tab-filter';
function getTabFilter() {
  const v = lsGet(TAB_FILTER_KEY);
  return v === 'film' || v === 'tv' ? v : 'all';
}
function setTabFilter(v) {
  if (v === 'all') lsDel(TAB_FILTER_KEY);
  else lsSet(TAB_FILTER_KEY, v);
}
function tabPassesFilter(c, filter) {
  if (filter === 'all') return true;
  if (c.virtual) return true;
  const isTv = WIZARD_TV_TABS.has(c.id);
  return filter === 'tv' ? isTv : !isTv;
}
function buildTabs() {
  const filter = getTabFilter();
  const nav = document.getElementById('tab-nav');
  const visible = catalogManifest.filter(c => tabPassesFilter(c, filter));
  // If the active tab got filtered out, switch to the first visible one so
  // the user isn't stranded on a tab whose button is hidden.
  if (!visible.some(c => c.id === activeTab) && visible.length > 0) {
    activeTab = visible[0].id;
  }
  nav.innerHTML = visible.map(c =>
    `<button class="tab-btn ${activeTab === c.id ? 'active' : ''}" data-tab="${c.id}">${c.label}</button>`
  ).join('');
  nav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // Sync the filter pill row with current state
  document.querySelectorAll('#tab-filter .tab-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
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

// v7.6.0: returns item count for key filter buttons (used for badge display).
function filterCount(filterKey) {
  const cat = activeTab === 'watchlist' ? buildWatchlistCatalog() : catalogs[activeTab];
  if (!cat || !cat.items) return 0;
  const COUNTED = new Set(['all','watching','queued','watched','loved','unwatched']);
  if (!COUNTED.has(filterKey)) return 0;
  let count = 0;
  cat.items.forEach(item => {
    const tab = item._watchlist_source_tab || activeTab;
    const status = getStatus(item.id, tab);
    const rating = getRating(item.id, tab);
    if (filterKey === 'all')      count++;
    else if (filterKey === 'watching' && status === 'watching') count++;
    else if (filterKey === 'queued'   && status === 'queued')   count++;
    else if (filterKey === 'watched'  && status === 'watched')  count++;
    else if (filterKey === 'loved'    && rating === 'loved')    count++;
    else if (filterKey === 'unwatched' && (status === 'none' || status === 'queued')) count++;
  });
  return count;
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
  container.innerHTML = sortHtml + filters.map(f => {
    const cnt = filterCount(f.key);
    return `<button class="filter-btn ${activeFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}${cnt ? `<span class="filter-count">${cnt}</span>` : ''}</button>`;
  }).join('');
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

// Stage 5d-1: render tag-pills row beneath filter row.
// Hidden on Watchlist (per design decision: heterogeneous tag set is too noisy).
// Shows only tags actually in use on items in the current tab.
function buildTagPills() {
  const container = document.getElementById('tag-pills');
  if (!container) return;
  if (activeTab === 'watchlist') {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';

  const cat = catalogs[activeTab];
  if (!cat || !cat.items || cat.items.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Collect tags actually in use across items in this tab.
  // Separate positive vs negative based on the tab's tag set.
  const tagsInUse = new Set();
  cat.items.forEach(item => {
    const tags = getTags(item.id, activeTab);
    if (Array.isArray(tags)) tags.forEach(t => tagsInUse.add(t));
  });

  if (tagsInUse.size === 0) {
    container.innerHTML = '';
    return;
  }

  // Resolve content type from a representative item to determine positive/negative split.
  // Use first item that has a contentType, or fall back to tab default.
  let contentType = TAB_DEFAULT_CONTENT_TYPE[activeTab] || 'film-narrative';
  const firstWithType = cat.items.find(i => i.contentType);
  if (firstWithType) contentType = firstWithType.contentType;
  const tagSet = TAG_SETS[contentType] || TAG_SETS['film-narrative'];

  const positive = (tagSet.positive || []).filter(t => tagsInUse.has(t));
  const negative = (tagSet.negative || []).filter(t => tagsInUse.has(t));
  // Any in-use tags not in this tab's contentType set (edge: items from other contentTypes)
  const orphans = Array.from(tagsInUse).filter(t =>
    !(tagSet.positive || []).includes(t) && !(tagSet.negative || []).includes(t)
  );

  const activeFilters = getActiveTagFilters(activeTab);
  const mode = getTagFilterMode(activeTab);

  let html = '';

  // AND/OR toggle (only show if ≥2 tags selected)
  if (activeFilters.size >= 2) {
    html += `<div class="tag-pill-mode">
      <span class="tag-pill-mode-label">Combine:</span>
      <button class="tag-mode-btn ${mode === 'and' ? 'active' : ''}" data-mode="and">AND</button>
      <button class="tag-mode-btn ${mode === 'or' ? 'active' : ''}" data-mode="or">OR</button>
      <button class="tag-mode-clear">Clear</button>
    </div>`;
  } else if (activeFilters.size === 1) {
    html += `<div class="tag-pill-mode">
      <button class="tag-mode-clear">Clear</button>
    </div>`;
  }

  if (positive.length > 0) {
    html += '<div class="tag-pill-row tag-pill-row-pos">';
    positive.forEach(t => {
      const active = activeFilters.has(t);
      html += `<button class="tag-pill tag-pill-pos ${active ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    });
    html += '</div>';
  }
  if (negative.length > 0) {
    html += '<div class="tag-pill-row tag-pill-row-neg">';
    negative.forEach(t => {
      const active = activeFilters.has(t);
      html += `<button class="tag-pill tag-pill-neg ${active ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    });
    html += '</div>';
  }
  if (orphans.length > 0) {
    html += '<div class="tag-pill-row tag-pill-row-orphan">';
    orphans.forEach(t => {
      const active = activeFilters.has(t);
      html += `<button class="tag-pill tag-pill-orphan ${active ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;

  // Wire pills
  container.querySelectorAll('.tag-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const filters = getActiveTagFilters(activeTab);
      if (filters.has(tag)) filters.delete(tag);
      else filters.add(tag);
      buildTagPills();
      render();
    });
  });
  container.querySelectorAll('.tag-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTagFilterMode(activeTab, btn.dataset.mode);
      buildTagPills();
      render();
    });
  });
  const clearBtn = container.querySelector('.tag-mode-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearTagFilters(activeTab);
      buildTagPills();
      render();
    });
  }
}

function itemMatchesFilter(item) {
  const tab = item._watchlist_source_tab || activeTab;
  const status = getStatus(item.id, tab);
  const rating = getRating(item.id, tab);
  // First check status/quick filter
  let statusMatch;
  switch (activeFilter) {
    case 'all': statusMatch = true; break;
    case 'priority-high': statusMatch = item.priority === 'high'; break;
    case 'priority-med': statusMatch = item.priority === 'med'; break;
    case 'watching': statusMatch = status === 'watching'; break;
    case 'unwatched': statusMatch = status === 'none' || status === 'queued'; break;
    case 'queued': statusMatch = status === 'queued'; break;
    case 'watched': statusMatch = status === 'watched'; break;
    case 'loved': statusMatch = rating === 'loved'; break;
    case 'liked': statusMatch = rating === 'loved' || rating === 'liked'; break;
    case 'short': statusMatch = item.commitmentTag === 'short'; break;
    case 'medium': statusMatch = item.commitmentTag === 'medium'; break;
    case 'long': statusMatch = item.commitmentTag === 'long'; break;
    case 'foundational': statusMatch = item.tags && item.tags.includes('foundational'); break;
    case 'modern': statusMatch = item.tags && item.tags.includes('modern'); break;
    case 'under': statusMatch = item.tags && item.tags.includes('under'); break;
    case 'intl': statusMatch = item.tags && item.tags.includes('intl'); break;
    case 'adjacent': statusMatch = item.tags && item.tags.includes('adjacent'); break;
    default: statusMatch = true;
  }
  if (!statusMatch) return false;

  // Then check tag pill filters (Stage 5d-1)
  // Tag filters compose with status filter via AND.
  // Within tag filters: AND (must have all selected) or OR (must have any).
  const tagFilters = getActiveTagFilters(tab);
  if (tagFilters.size === 0) return true;  // no tag filters = pass
  const itemTags = getTags(item.id, tab) || [];
  const itemTagSet = new Set(itemTags);
  const mode = getTagFilterMode(tab);
  if (mode === 'and') {
    for (const t of tagFilters) {
      if (!itemTagSet.has(t)) return false;
    }
    return true;
  } else {
    for (const t of tagFilters) {
      if (itemTagSet.has(t)) return true;
    }
    return false;
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
  // Walk every loaded catalog (skip the virtual watchlist — iterating it causes
  // circular inflation: each render() call adds watchlist items back into suggested)
  for (const tabId in catalogs) {
    if (tabId === 'watchlist') continue;
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

// v7.6.0: Watching-now banner — sticky strip at top of Watchlist showing
// items currently in progress. Tapping any item navigates to it in its tab.
function renderWatchingNowBanner() {
  // Container is <main id="items-container"> in this app — patch doc said
  // "main" but that ID doesn't exist here. Use the actual container.
  const main = document.getElementById('items-container');
  if (!main) return;
  const existing = document.getElementById('watchlist-now-banner');
  if (existing) existing.remove();
  if (activeTab !== 'watchlist') return;
  const watching = [];
  for (const tabId in catalogs) {
    if (tabId === 'watchlist') continue;
    const cat = catalogs[tabId];
    if (!cat || !cat.items) continue;
    cat.items.forEach(item => {
      const st = (state[tabId] && state[tabId][item.id] && state[tabId][item.id].status) || 'none';
      if (st === 'watching') watching.push({ title: item.title, id: item.id, tabId, tabLabel: cat.title || tabId });
    });
  }
  if (watching.length === 0) return;
  const banner = document.createElement('div');
  banner.id = 'watchlist-now-banner';
  banner.setAttribute('aria-label', 'Currently watching');
  banner.innerHTML = `
    <span class="now-banner-label">Now watching</span>
    <div class="now-banner-items">
      ${watching.map(w => `<button class="now-banner-item" data-tab="${w.tabId}" data-id="${w.id}">
        ${escapeHtml(w.title)}<span class="now-banner-source">${escapeHtml(w.tabLabel)}</span>
      </button>`).join('')}
    </div>`;
  banner.querySelectorAll('.now-banner-item').forEach(btn => {
    btn.addEventListener('click', () => {
      wizardHide();
      switchTab(btn.dataset.tab);
      setTimeout(() => {
        const target = document.querySelector(`.item[data-id="${btn.dataset.id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('expanded');
        }
      }, 100);
    });
  });
  const firstSection = main.querySelector('.section-header');
  if (firstSection) main.insertBefore(banner, firstSection);
  else main.prepend(banner);
}

// === Auteur (virtual tab) generator ===
// Scans all genre catalogs for items whose dir matches a director in the auteurDirectors
// list from catalogs.json. Deduplicates by item ID (handles films in multiple genre tabs).
function buildAuteurCatalog() {
  const auteurDef = catalogManifest.find(c => c.id === 'auteur');
  const directors = (auteurDef && auteurDef.directors) || [];
  const directorMap = new Map();
  directors.forEach(d => directorMap.set(d.name, []));
  const seen = new Set();

  for (const tabId in catalogs) {
    if (tabId === 'watchlist' || tabId === 'auteur') continue;
    const cat = catalogs[tabId];
    cat.items.forEach(item => {
      if (!directorMap.has(item.dir)) return;
      if (seen.has(item.id)) return;
      seen.add(item.id);
      const proxy = Object.assign({}, item, {
        _auteur_source_tab: tabId,
        _auteur_source_label: cat.title || tabId
      });
      directorMap.get(item.dir).push(proxy);
    });
  }

  let globalOrder = 1;
  const sections = [];
  directors.forEach(d => {
    const items = directorMap.get(d.name) || [];
    if (items.length === 0) return;
    items.sort((a, b) => (a.order || 0) - (b.order || 0));
    items.forEach(it => { it.section = d.label; it.sectionDesc = d.desc; it.order = globalOrder++; });
    sections.push({ name: d.label, desc: d.desc, items });
  });

  const allItems = sections.flatMap(s => s.items);
  return {
    type: 'auteur',
    title: 'Auteur',
    subtitle: `${directors.length} directors · ${allItems.length} films`,
    sections,
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
  if (activeTab === 'auteur') {
    catalogs['auteur'] = buildAuteurCatalog();
    return catalogs['auteur'];
  }
  return catalogs[activeTab];
}

// v5.36.0 Tier A perf pass:
//   A2 — single delegated listener on #items-container instead of 8/item
//   A3 — render() RAF-coalesces; multiple state changes in one frame batch
//   A5 — getTagSetForItem called once per item, not twice
//   A6 — visibleCountBySection precomputed in one pass (was O(n²) inside loop)
const _itemRegistry = new Map();
let _itemDelegationAttached = false;

function _attachItemDelegation() {
  if (_itemDelegationAttached) return;
  const container = document.getElementById('items-container');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const itemEl = e.target.closest('.item');
    if (!itemEl) return;
    const id = itemEl.dataset.id;
    const reg = _itemRegistry.get(id);
    if (!reg) return;
    const { item, itemTab } = reg;

    if (e.target.closest('.status-pill')) {
      e.stopPropagation();
      cycleStatus(id, itemTab);
      return;
    }
    // v7.2.0: Finished button — archive a watched + tagged item in one tap.
    if (e.target.closest('.finished-btn[data-action="finished"]')) {
      e.stopPropagation();
      archiveItem(itemTab, id, 'finished');
      return;
    }
    const actionBtn = e.target.closest('.action-btn[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      setStatus(id, actionBtn.dataset.action, itemTab);
      return;
    }
    if (e.target.closest('.watch-start-btn')) {
      e.stopPropagation();
      openWatchModal(item, itemTab);
      return;
    }
    const plexBtn = e.target.closest('.plex-play-btn');
    if (plexBtn) {
      e.stopPropagation();
      const ratingKey = plexBtn.dataset.plexKey;
      setStatus(id, 'watching', itemTab);
      const deepLink = plexDeepLinkUrl(ratingKey);
      window.location.href = deepLink;
      setTimeout(() => {
        const fallbackUrl = `${getPlexServerUrl()}/web/index.html#!/server/${getPlexClientId() || ''}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`;
        window.open(fallbackUrl, '_blank');
      }, 1000);
      return;
    }
    const ratingBtn = e.target.closest('.rating-btn');
    if (ratingBtn) {
      e.stopPropagation();
      setRating(id, ratingBtn.dataset.rating, itemTab);
      return;
    }
    const tagBtn = e.target.closest('.tag-btn');
    if (tagBtn) {
      e.stopPropagation();
      toggleTag(id, tagBtn.dataset.tag, itemTab);
      return;
    }
    const voiceBtn = e.target.closest('.voice-dictate-btn');
    if (voiceBtn) {
      e.stopPropagation();
      voiceDictate(id, itemTab, voiceBtn);
      return;
    }
    if (e.target.closest('.item-head')) {
      if (expandedIds.has(id)) {
        expandedIds.delete(id);
        itemEl.classList.remove('expanded');
      } else {
        expandedIds.add(id);
        itemEl.classList.add('expanded');
        loadStreamingProviders(itemEl, item);
      }
    }
  });

  // focusout bubbles where blur doesn't, so a single delegated handler covers
  // every notes textarea regardless of how many items are in the registry.
  container.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('notes-input')) return;
    const itemEl = e.target.closest('.item');
    if (!itemEl) return;
    const reg = _itemRegistry.get(itemEl.dataset.id);
    if (reg) setNotes(itemEl.dataset.id, e.target.value, reg.itemTab);
  });

  _itemDelegationAttached = true;
}

let _renderQueued = false;
function render() {
  if (_renderQueued) return;
  _renderQueued = true;
  requestAnimationFrame(() => {
    _renderQueued = false;
    _renderImpl();
  });
}

function _renderImpl() {
  if (!isVirtualTab(activeTab) && !catalogs[activeTab]) return;
  const catalog = getActiveCatalog();
  document.getElementById('tab-subtitle').textContent = catalog.subtitle;

  _attachItemDelegation();
  _itemRegistry.clear();

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

  // A6: pre-compute visible counts per section in one pass.
  // The old code called catalog.items.filter() once per item-with-section-change,
  // which was O(n²) inside a single render. One walk is enough.
  const visibleCountBySection = new Map();
  for (const it of catalog.items) {
    if (itemMatchesFilter(it) && itemMatchesCategory(it)) {
      visibleCountBySection.set(it.section, (visibleCountBySection.get(it.section) || 0) + 1);
    }
  }

  renderItems.forEach(item => {
    if (item.section !== lastSection) {
      if ((visibleCountBySection.get(item.section) || 0) > 0) {
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
    const itemTab = item._watchlist_source_tab || item._auteur_source_tab || activeTab;

    // v7.1.0: skip archived items everywhere except the Auteur tab.
    // Auteur stays unfiltered so directors finish out their filmography first.
    if (activeTab !== 'auteur' && isArchived(itemTab, item.id)) return;

    // A2: register so the delegated handlers can dispatch on this id
    _itemRegistry.set(item.id, { item, itemTab });

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
    itemEl.dataset.rating = rating;  // v7.6.0: enables [data-rating="loved"] CSS tint
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
    const sourceLabel = item._watchlist_source_label || item._auteur_source_label || '';
    const sourceBadge = (sourceLabel && (activeTab === 'watchlist' || activeTab === 'auteur')) ? `<span class="source-badge">${sourceLabel}</span>` : '';
    const auteurBadge = auteurDirectorSet.has(item.dir) ? `<span class="auteur-badge">Auteur</span>` : '';
    const plexMatch = isPlexConfigured() ? plexHasItem(item) : null;
    const plexBadge = plexMatch ? `<span class="plex-badge" title="In your Plex library">⊕ Plex</span>` : '';
    const whyHtml = item.whyPriority ? `<div class="why-priority"><strong>Why this priority:</strong> ${item.whyPriority}</div>` : '';

    // A5: getTagSetForItem(item) and getTagSetForItem(item, itemTab) resolve to
    // the same set — resolveContentType falls through to the same source-tab
    // either way. One call is enough.
    const itemTagSet = getTagSetForItem(item, itemTab);
    const posCount = reactionTags.filter(t => itemTagSet.positive.includes(t)).length;
    const negCount = reactionTags.filter(t => itemTagSet.negative.includes(t)).length;
    const reactionIndicator = (posCount > 0 || negCount > 0) ? `<span class="reaction-indicator">${posCount > 0 ? `<span class="pos-count">+${posCount}</span>` : ''}${negCount > 0 ? `<span class="neg-count">−${negCount}</span>` : ''}</span>` : '';
    const posTagsHtml = itemTagSet.positive.map(t => {
      const active = reactionTags.includes(t);
      return `<button class="tag-btn ${active ? 'active-pos' : ''}" data-tag="${t}">${t}</button>`;
    }).join('');
    const negTagsHtml = itemTagSet.negative.map(t => {
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
          <div class="badge-row">${sourceBadge}${auteurBadge}${plexBadge}${commitmentBadge}${priorityBadge}${ratingBadge}${reactionIndicator}</div>
        </div>
        <div class="status-pill ${status === 'none' ? '' : status}">${statusIcon(status)}</div>
      </div>
      <div class="item-body">
        ${whyHtml}
        <p class="pitch">${item.pitch || ''}</p>
        ${criticsHtml}
        <div class="streaming-providers" data-streaming-loaded="false"></div>
        <div class="actions">
          <button class="action-btn watch-start-btn">▶ Start Watching</button>
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
        ${status === 'watched' ? `<button class="finished-btn${reactionTags.length > 0 ? ' finished-btn--ready' : ''}" data-action="finished">Finished</button>` : ''}
        <textarea class="notes-input" placeholder="Notes after viewing..." data-id="${item.id}">${escapeHtml(notes)}</textarea>
        <div class="notes-tv-display">${escapeHtml(notes)}</div>
        <button class="voice-dictate-btn" type="button">🎤 Dictate notes</button>
      </div>
    `;

    container.appendChild(itemEl);
  });

  updateStats();
  // v7.6.0: refresh the "Now watching" strip at top of Watchlist (no-op elsewhere)
  renderWatchingNowBanner();
}

// v5.37.0 B1: Voice dictation for TV mode. The notes textarea is hidden
// in TV mode because D-pad typing is impractical; this routes audio
// transcription into the same setNotes path so the saved note is the
// only source of truth (Trakt/sync layers see no difference).
let _voiceActive = null;

// v5.42.0: voice-to-input for the search and notes-search modals.
// Shares the _voiceActive lock with voiceDictate so only one mic is
// live at a time. Final transcript replaces the input value (vs the
// dictate flow which appends), then dispatches an input event so the
// debounced doSearch / doNotesSearch path runs unchanged.
function voiceSearchInto(inputId, btn) {
  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recog) return;
  if (_voiceActive) { _voiceActive.stop(); return; }
  const input = document.getElementById(inputId);
  if (!input) return;
  const r = new Recog();
  r.continuous = false;
  r.interimResults = false;
  r.lang = navigator.language || 'en-US';
  let buffer = '';
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) buffer += e.results[i][0].transcript + ' ';
    }
  };
  r.onend = () => {
    _voiceActive = null;
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎤'; }
    const transcript = buffer.trim();
    if (!transcript) return;
    input.value = transcript;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  r.onerror = () => {
    _voiceActive = null;
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎤'; }
  };
  try {
    r.start();
    _voiceActive = r;
    if (btn) { btn.classList.add('recording'); btn.textContent = '◼'; }
  } catch (e) {
    _voiceActive = null;
  }
}

function voiceDictate(id, tab, btn) {
  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recog) {
    alert('Voice dictation is not supported on this device.');
    return;
  }
  if (_voiceActive) {
    _voiceActive.stop();
    return;
  }
  const r = new Recog();
  r.continuous = true;
  r.interimResults = false;
  r.lang = navigator.language || 'en-US';
  let buffer = '';
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) buffer += e.results[i][0].transcript + ' ';
    }
  };
  r.onend = () => {
    _voiceActive = null;
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎤 Dictate notes'; }
    const transcript = buffer.trim();
    if (!transcript) return;
    const existing = getNotes(id, tab);
    const merged = existing ? `${existing.trim()}\n${transcript}`.trim() : transcript;
    setNotes(id, merged, tab);
  };
  r.onerror = () => {
    _voiceActive = null;
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎤 Dictate notes'; }
  };
  try {
    r.start();
    _voiceActive = r;
    if (btn) { btn.classList.add('recording'); btn.textContent = '◼ Stop & save'; }
  } catch (e) {
    _voiceActive = null;
  }
}

// v7.6.0: Swipe-down gesture to collapse expanded item cards.
// REVERSIBLE: to disable, comment out the enableSwipeCollapse() call in the
// boot IIFE — the function itself is inert until called.
function enableSwipeCollapse() {
  let touchStartY = 0;
  let touchTarget = null;
  document.addEventListener('touchstart', (e) => {
    const body = e.target.closest('.item-body');
    if (!body) return;
    touchStartY = e.touches[0].clientY;
    touchTarget = body.closest('.item');
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touchTarget) return;
    if (e.changedTouches[0].clientY - touchStartY > 44) {
      touchTarget.classList.remove('expanded');
    }
    touchTarget = null;
  }, { passive: true });
  document.addEventListener('touchcancel', () => { touchTarget = null; }, { passive: true });
}

function switchTab(tab) {
  const def = catalogManifest.find(c => c.id === tab);
  if (!def) return;
  if (!def.virtual && !catalogs[tab]) return;
  // v5.37.0 B3: View Transitions for tab switches. Native crossfade on
  // Chromium 111+ (covers Bravia Google TV, Android Chrome). Older
  // engines fall through to the synchronous body — no degradation.
  const body = () => {
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
    buildTagPills();
    render();
  };
  if (document.startViewTransition) {
    document.startViewTransition(body);
  } else {
    body();
  }
  // Scroll active tab into view
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (activeBtn && activeBtn.scrollIntoView) {
    activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function setupModals() {
  // Tab filter pills — Film / TV / All. Stored in localStorage; rebuild
  // tabs when changed so the visible list reflects the filter immediately.
  document.querySelectorAll('#tab-filter .tab-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTabFilter(btn.dataset.filter);
      buildTabs();
      render();
    });
  });
  // Reset flow: explicit modal with explanation. Hidden on TV (CSS),
  // visible on phone and computer. Replaces the native confirm() dialog
  // which is awkward to dismiss with a D-pad and offered no rollback info.
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (isVirtualTab(activeTab)) {
      alert('The Watchlist tab is virtual and cannot be reset directly. Reset individual tabs to clear their data.');
      return;
    }
    const tabDef = catalogManifest.find(c => c.id === activeTab);
    const tabLabel = (tabDef && tabDef.label) || activeTab;
    const cat = catalogs[activeTab];
    const itemCount = (cat && cat.items) ? cat.items.length : 0;
    const detail = document.getElementById('reset-confirm-detail');
    if (detail) {
      detail.textContent =
        `Reset ${tabLabel}? This restores the seed data for this tab — ` +
        `every status, rating, reaction tag, and note for the ${itemCount} ` +
        `item${itemCount === 1 ? '' : 's'} in this tab on this device will be ` +
        `replaced with the starter data shipped with the app. Other tabs are not affected.`;
    }
    document.getElementById('reset-confirm-modal').showModal();
  });
  document.getElementById('reset-confirm-go').addEventListener('click', () => {
    document.getElementById('reset-confirm-modal').close();
    state[activeTab] = JSON.parse(JSON.stringify(SEED_STATE[activeTab] || {}));
    saveState(); render();
  });
  document.getElementById('reset-confirm-cancel').addEventListener('click', () => {
    document.getElementById('reset-confirm-modal').close();
  });
  // === App logo (top-left): reset to Watchlist with cleared filter/search state ===
  document.getElementById('app-logo-btn').addEventListener('click', () => {
    // Clear search input if open
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    const searchResults = document.getElementById('search-results');
    if (searchResults) searchResults.innerHTML = '';
    // Close any open modal
    document.querySelectorAll('.modal[open]').forEach(m => m.close());
    // Clear all in-memory filter/category/sort state for every tab
    Object.keys(activeCategoryByTab).forEach(k => delete activeCategoryByTab[k]);
    Object.keys(activeSortByTab).forEach(k => delete activeSortByTab[k]);
    // Cancel any pending category-clear timers
    Object.keys(categoryClearTimers).forEach(k => {
      clearTimeout(categoryClearTimers[k]);
      delete categoryClearTimers[k];
    });
    // Switch to Watchlist (this also resets activeFilter to 'all' and clears expandedIds)
    switchTab('watchlist');
    // Scroll header into view in case user was deep in a long list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // === V5.22.0: Pair Another Device modal ===
  const pairBtn = document.getElementById('webhook-pair');
  if (pairBtn) {
    pairBtn.addEventListener('click', () => {
      if (!isWebhookConfigured() && !isPlexConfigured()) {
        alert('Nothing to pair yet — configure Worker URL/secret or Plex first.');
        return;
      }
      document.getElementById('pair-url').value = generatePairUrl();
      document.getElementById('pair-modal').showModal();
    });
    document.getElementById('pair-close').addEventListener('click', () => {
      document.getElementById('pair-modal').close();
    });
    document.getElementById('pair-copy').addEventListener('click', async () => {
      const url = document.getElementById('pair-url').value;
      const btn = document.getElementById('pair-copy');
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      } catch (e) {
        const ta = document.getElementById('pair-url');
        ta.focus(); ta.select();
        alert('Clipboard API not available. The URL is selected — use Ctrl+C / Cmd+C.');
      }
    });
    document.getElementById('pair-share').addEventListener('click', async () => {
      const url = document.getElementById('pair-url').value;
      if (navigator.share) {
        try { await navigator.share({ title: 'CinéMath Pair', url }); } catch {}
      } else {
        alert('Web Share API not available on this device. Use Copy instead.');
      }
    });
  }

  // === V5.22.1: Receive setup via paste (for TVs where URL routing fails) ===
  const receiveBtn = document.getElementById('pair-receive-apply');
  if (receiveBtn) {
    receiveBtn.addEventListener('click', () => {
      const input = document.getElementById('pair-receive-input').value;
      const status = document.getElementById('pair-receive-status');
      if (!input.trim()) {
        status.textContent = 'Paste a pair URL or base64 payload first.';
        return;
      }
      const ok = applyConfigFromString(input);
      if (ok) {
        status.textContent = 'Setup applied — reloading…';
        setTimeout(() => location.reload(), 800);
      } else {
        status.textContent = 'Could not parse — make sure you copied the full URL or full base64 string.';
      }
    });
  }

  // === Search modal ===
  document.getElementById('search-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-modal').showModal();
    setTimeout(() => document.getElementById('search-input').focus(), 50);
  });
  document.getElementById('search-close').addEventListener('click', () => {
    document.getElementById('search-modal').close();
  });
  let searchDebounce = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    const value = e.target.value;
    // v5.36.0: defer the per-tab walk to idle time so keystrokes stay smooth
    // on the Bravia D-pad. Falls back to setTimeout(0) where rIC isn't supported.
    searchDebounce = setTimeout(() => {
      const run = () => doSearch(value);
      (window.requestIdleCallback || ((cb) => setTimeout(cb, 0)))(run);
    }, 100);
  });
  // v5.42.0: voice search button — same Web Speech API pipeline as the
  // notes voiceDictate flow. On TV (or anywhere typing's a chore) the
  // user dictates the query; the result is written into the input and
  // an `input` event fires so the existing debounced doSearch path runs
  // unchanged.
  const searchVoiceBtn = document.getElementById('search-voice-btn');
  if (searchVoiceBtn) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      searchVoiceBtn.style.display = 'none';
    } else {
      searchVoiceBtn.addEventListener('click', () => voiceSearchInto('search-input', searchVoiceBtn));
    }
  }

  // === Notes search modal ===
  document.getElementById('notes-search-btn').addEventListener('click', () => {
    document.getElementById('notes-search-input').value = '';
    document.getElementById('notes-search-results').innerHTML = '';
    document.getElementById('notes-search-modal').showModal();
    setTimeout(() => document.getElementById('notes-search-input').focus(), 50);
  });
  document.getElementById('notes-search-close').addEventListener('click', () => {
    document.getElementById('notes-search-modal').close();
  });
  let notesDebounce = null;
  document.getElementById('notes-search-input').addEventListener('input', (e) => {
    if (notesDebounce) clearTimeout(notesDebounce);
    const value = e.target.value;
    notesDebounce = setTimeout(() => {
      const run = () => doNotesSearch(value);
      (window.requestIdleCallback || ((cb) => setTimeout(cb, 0)))(run);
    }, 100);
  });
  const notesVoiceBtn = document.getElementById('notes-search-voice-btn');
  if (notesVoiceBtn) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      notesVoiceBtn.style.display = 'none';
    } else {
      notesVoiceBtn.addEventListener('click', () => voiceSearchInto('notes-search-input', notesVoiceBtn));
    }
  }

  // === Stats modal ===
  document.getElementById('stats-btn').addEventListener('click', () => {
    document.getElementById('stats-content').innerHTML = renderStats();
    document.getElementById('stats-modal').showModal();
  });
  document.getElementById('stats-close').addEventListener('click', () => {
    document.getElementById('stats-modal').close();
  });
  document.getElementById('stats-period-review').addEventListener('click', () => {
    document.getElementById('stats-modal').close();
    openPeriodReviewModal();
  });
  document.getElementById('stats-catalog-health').addEventListener('click', () => {
    const el = document.getElementById('stats-content');
    el.innerHTML = renderCatalogHealth();
    el.querySelectorAll('.health-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) {
          const hidden = target.style.display === 'none';
          target.style.display = hidden ? '' : 'none';
          btn.textContent = hidden ? '− collapse' : btn.textContent.replace('− collapse', '+ ' + btn.dataset.target);
        }
      });
    });
  });
  document.getElementById('period-review-cancel').addEventListener('click', () => {
    document.getElementById('period-review-modal').close();
  });
  document.getElementById('period-review-type').addEventListener('change', (e) => {
    const t = e.target.value;
    document.getElementById('period-review-year-section').style.display = (t === 'year' || t === 'month') ? '' : 'none';
    document.getElementById('period-review-month-section').style.display = (t === 'month') ? '' : 'none';
    document.getElementById('period-review-custom-section').style.display = (t === 'custom') ? '' : 'none';
  });
  document.getElementById('period-review-generate').addEventListener('click', generatePeriodReview);
  // v5.37.0 B6: Web Share button — only show where the API exists.
  const shareBtn = document.getElementById('period-review-share');
  if (shareBtn) {
    if (navigator.share) {
      shareBtn.addEventListener('click', sharePeriodReview);
    } else {
      shareBtn.style.display = 'none';
    }
  }

  // === Triage modals ===
  document.getElementById('triage-queue-btn').addEventListener('click', () => startTriage('queue'));
  document.getElementById('triage-suggest-btn').addEventListener('click', () => startTriage('suggest'));

  // === v5.40.0 R5 / C3: Find Gaps modal ===
  const findGapsBtn = document.getElementById('find-gaps-btn');
  if (findGapsBtn) findGapsBtn.addEventListener('click', () => openFindGapsModal());
  document.getElementById('find-gaps-close').addEventListener('click', () => {
    document.getElementById('find-gaps-modal').close();
  });
  document.getElementById('find-gaps-refresh').addEventListener('click', () => renderFindGaps());

  // === v6.5.0 R9: chat modal wiring ===
  const chatSendBtn = document.getElementById('chat-send');
  if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
  const chatCloseBtn = document.getElementById('chat-close');
  if (chatCloseBtn) chatCloseBtn.addEventListener('click', () => document.getElementById('chat-modal').close());
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      // Cmd/Ctrl+Enter sends; bare Enter inserts a newline (textarea default).
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
  const chatVoiceBtn = document.getElementById('chat-voice-btn');
  if (chatVoiceBtn) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      chatVoiceBtn.style.display = 'none';
    } else {
      chatVoiceBtn.addEventListener('click', () => voiceSearchInto('chat-input', chatVoiceBtn));
    }
  }

  // === Settings modal ===
  // (Per-section collapsibles removed in 5.35.0 — the card grid handles
  // navigation, which made the header toggles redundant and broken when
  // a section was navigated into while collapsed. data-section attrs stay
  // because setSettingsView() uses them to show/hide individual sections.)

  // V5.27.0: Settings card definitions — each maps a card to a section in the
  // settings-modal. Status function returns 'ok' / 'warn' / 'empty' for the
  // colored badge on the card. Sync card is a placeholder until Phase 2.
  const SETTINGS_CARDS = [
    { id: 'display', title: 'Display', desc: 'Phone vs TV layout', statusFn: () => ({ label: 'AUTO', cls: 'ok' }) },
    { id: 'plex', title: 'Plex', desc: 'Media server connection', statusFn: () => isPlexConfigured() ? { label: 'CONFIGURED', cls: 'ok' } : { label: 'EMPTY', cls: 'empty' } },
    { id: 'webhook', title: 'Worker', desc: 'TMDB & scrobble bridge', statusFn: () => isWebhookConfigured() ? { label: 'CONFIGURED', cls: 'ok' } : { label: 'EMPTY', cls: 'empty' } },
    { id: 'trakt', title: 'Trakt', desc: 'Watch history sync', statusFn: () => (typeof getTraktAccessToken === 'function' && getTraktAccessToken()) ? { label: 'CONNECTED', cls: 'ok' } : { label: 'EMPTY', cls: 'empty' } },
    { id: 'sync', title: 'Cross-Device Sync', desc: 'Auto-sync settings & state via Worker', statusFn: () => {
      if (!isWebhookConfigured() || !getPlexToken()) return { label: 'NEEDS PLEX + WORKER', cls: 'empty' };
      const lastPush = parseInt(lsGet(SYNC_LAST_PUSH_KEY) || '0');
      if (lastPush && (Date.now() - lastPush < 60000)) return { label: 'IN SYNC', cls: 'ok' };
      if (lastPush) return { label: 'ACTIVE', cls: 'ok' };
      return { label: 'READY', cls: 'warn' };
    } },
    { id: 'alerts', title: 'Streaming alerts', desc: 'Notify when titles leave streaming', statusFn: () => isAlertsEnabled() ? { label: 'ON', cls: 'ok' } : { label: 'OFF', cls: 'empty' } },
  ];
  function buildSettingsCardGrid() {
    const modal = document.getElementById('settings-modal');
    if (!modal || modal.querySelector('.settings-card-grid')) return;
    const scroll = modal.querySelector('.settings-scroll');
    if (!scroll) return;
    // Inject Back button (visible only in detail view)
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'settings-detail-back';
    back.textContent = '← Settings';
    back.addEventListener('click', () => setSettingsView('grid'));
    scroll.insertBefore(back, scroll.firstChild);
    // Inject card grid (visible only in grid view)
    const grid = document.createElement('div');
    grid.className = 'settings-card-grid';
    grid.innerHTML = SETTINGS_CARDS.map(c => `
      <button type="button" class="settings-card" data-card="${c.id}">
        <span class="settings-card-title">${c.title}</span>
        <span class="settings-card-desc">${c.desc}</span>
        <span class="settings-card-status" data-status="${c.id}"></span>
      </button>
    `).join('');
    scroll.insertBefore(grid, back.nextSibling);
    grid.querySelectorAll('.settings-card').forEach(card => {
      card.addEventListener('click', () => setSettingsView(card.dataset.card));
    });
    // V5.28.0: Real sync card content (was placeholder in 5.27.0)
    if (!modal.querySelector('.settings-section[data-section="sync"]')) {
      const syncSec = document.createElement('div');
      syncSec.className = 'settings-section';
      syncSec.dataset.section = 'sync';
      syncSec.innerHTML = `
        <h4>Cross-Device Sync</h4>
        <p class="settings-help">Auto-syncs your settings + viewing state via your Cloudflare Worker, keyed by a SHA-256 hash of your Plex token. Changes push 5 seconds after the last edit; remote state pulls on every app launch.</p>
        <p class="settings-help" style="font-size:11px;color:var(--ink-faint)"><strong>Requires:</strong> Plex configured (token = identity) AND Worker configured (storage backend) AND a SYNC_KV binding added to the Worker. See <code>worker-sync-patch.md</code> in the repo for the Worker-side patch.</p>
        <div class="settings-status" id="sync-status-line" style="margin-top:14px"></div>
        <div class="settings-row" style="margin-top:14px">
          <button class="action-btn" id="sync-push-now">Push now</button>
          <button class="action-btn" id="sync-pull-now">Pull now</button>
        </div>
      `;
      scroll.appendChild(syncSec);
      // Wire the manual push/pull buttons
      syncSec.querySelector('#sync-push-now').addEventListener('click', async () => {
        const ok = await syncPush('manual');
        alert(ok ? 'Pushed.' : 'Push failed — check error in card status.');
        updateSyncStatusUI();
      });
      syncSec.querySelector('#sync-pull-now').addEventListener('click', async () => {
        const remote = await syncFetch();
        if (!remote) { alert('Pull returned nothing or failed.'); updateSyncStatusUI(); return; }
        // V5.31.1: per-item merge — applies whatever is newer per item, preserves rest
        syncApplyRemote(remote);
        alert('Pull merged. Reloading…');
        setTimeout(() => location.reload(), 500);
      });
      // Refresh status whenever the section is shown
      const observer = new MutationObserver(() => {
        if (syncSec.style.display !== 'none') updateSyncStatusUI();
      });
      observer.observe(syncSec, { attributes: true, attributeFilter: ['style'] });
    }
  }
  function setSettingsView(view) {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.dataset.view = view;
    const grid = modal.querySelector('.settings-card-grid');
    const back = modal.querySelector('.settings-detail-back');
    const sections = modal.querySelectorAll('.settings-section');
    if (view === 'grid') {
      // Refresh status indicators on each card
      SETTINGS_CARDS.forEach(c => {
        const el = modal.querySelector(`[data-status="${c.id}"]`);
        if (el) {
          const s = c.statusFn();
          el.textContent = s.label;
          el.className = `settings-card-status ${s.cls}`;
        }
      });
      if (grid) grid.style.display = '';
      if (back) back.style.display = 'none';
      sections.forEach(s => s.style.display = 'none');
    } else {
      if (grid) grid.style.display = 'none';
      if (back) back.style.display = '';
      sections.forEach(s => {
        s.style.display = (s.dataset.section === view) ? '' : 'none';
      });
    }
  }
  const settingsModal = document.getElementById('settings-modal');
  // V5.27.0: Settings card grid + detail panels.
  // V5.31.2: buildSettingsCardGrid moved INSIDE the click handler so cards
  // are guaranteed to exist on every Settings open, defensively. The function
  // is idempotent — it short-circuits if the grid is already in the DOM —
  // so rebuilding on every open is cheap and prevents reverts after sync
  // pulls or any other DOM disruption.
  document.getElementById('settings-btn').addEventListener('click', () => {
    buildSettingsCardGrid();
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
    document.getElementById('trakt-client-id').value = getTraktClientId();
    document.getElementById('trakt-client-secret').value = getTraktClientSecret();
    updatePlexStatusLine();
    updateWebhookStatusLine();
    updateTraktStatusLine();
    updateDisplayModePicker();
    setSettingsView('grid'); // always open at the grid root
    settingsModal.showModal();
  });
  document.getElementById('settings-close').addEventListener('click', () => {
    settingsModal.close();
  });
  document.getElementById('settings-save').addEventListener('click', () => {
    const mode = document.querySelector('input[name="display-mode"]:checked')?.value || 'auto';
    setDisplayModePref(mode);
    setPlexServerUrl(document.getElementById('plex-server-url').value.trim());
    setPlexToken(document.getElementById('plex-token').value.trim());
    setPlexClientId(document.getElementById('plex-client-id').value.trim());
    setWebhookUrl(document.getElementById('webhook-url').value.trim());
    setWebhookSecret(document.getElementById('webhook-secret').value.trim());
    setTraktClientId(document.getElementById('trakt-client-id').value.trim());
    setTraktClientSecret(document.getElementById('trakt-client-secret').value.trim());
    applyDisplayMode();
    settingsModal.close();
    if (isPlexConfigured()) fetchPlexLibrary();
    if (isWebhookConfigured()) pollPlexWebhookEvents();
    render();
  });
  document.getElementById('plex-save-worker').addEventListener('click', async () => {
    const plexUrl = document.getElementById('plex-server-url').value.trim().replace(/\/$/, '');
    const plexToken = document.getElementById('plex-token').value.trim();
    const status = document.getElementById('plex-status');
    if (!plexUrl || !plexToken) {
      status.textContent = 'Enter both server URL and token first.';
      status.className = 'settings-status err';
      return;
    }
    if (!isWebhookConfigured()) {
      status.textContent = 'Configure Plex Webhook Bridge first (Worker URL + secret).';
      status.className = 'settings-status err';
      return;
    }
    status.textContent = 'Pushing to Worker...';
    status.className = 'settings-status';
    try {
      const workerUrl = getWebhookUrl();
      const secret = getWebhookSecret();
      const resp = await fetch(`${workerUrl}/plex/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, plexUrl, plexToken }),
      });
      if (resp.ok) {
        status.textContent = 'Configured on Worker.';
        status.className = 'settings-status ok';
      } else {
        const t = await resp.text();
        status.textContent = `Worker rejected config: HTTP ${resp.status} ${t}`;
        status.className = 'settings-status err';
      }
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      status.className = 'settings-status err';
    }
  });
  document.getElementById('plex-test').addEventListener('click', async () => {
    const urlField = document.getElementById('plex-server-url').value.trim();
    const tokenField = document.getElementById('plex-token').value.trim();
    const status = document.getElementById('plex-status');
    if (!urlField || !tokenField) {
      status.textContent = 'Enter both server URL and token first.';
      status.className = 'settings-status err';
      return;
    }
    if (!isWebhookConfigured()) {
      status.textContent = 'Configure Plex Webhook Bridge first (Worker URL + secret).';
      status.className = 'settings-status err';
      return;
    }
    status.textContent = 'Testing via Worker...';
    status.className = 'settings-status';
    try {
      const workerUrl = getWebhookUrl();
      const secret = getWebhookSecret();
      const resp = await fetch(`${workerUrl}/plex/identity?secret=${encodeURIComponent(secret)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.error) {
          status.textContent = `Worker says: ${data.error}. Click "Save to Worker" first.`;
          status.className = 'settings-status err';
          return;
        }
        const name = data?.MediaContainer?.machineIdentifier || 'unknown';
        status.textContent = `Connected. Server ID: ${name.slice(0, 20)}...`;
        status.className = 'settings-status ok';
      } else if (resp.status === 400) {
        const t = await resp.text();
        status.textContent = `Worker not yet configured. Click "Save to Worker" first. (${t})`;
        status.className = 'settings-status err';
      } else {
        status.textContent = `Failed: HTTP ${resp.status}.`;
        status.className = 'settings-status err';
      }
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
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
    if (!confirm('Bulk-sync your full Plex history into CinéMath? This will:\n\n• Fetch every item you\'ve watched on Plex\n• Mark matched movies as Watched\n• Mark TV shows as Watching, with Loved if you\'ve watched 5+ distinct episodes\n• Log all viewing to durable cloud storage\n\nSafe to run multiple times.')) return;

    const progressModal = document.getElementById('bulk-sync-progress-modal');
    const statusEl = document.getElementById('bulk-sync-status');
    const barEl = document.getElementById('bulk-sync-bar');
    progressModal.showModal();
    document.getElementById('settings-modal').close();

    try {
      const report = await runBulkSync((msg, pct) => {
        statusEl.textContent = msg;
        barEl.style.width = `${pct}%`;
      });
      progressModal.close();
      // Show result
      document.getElementById('bulk-sync-result-content').innerHTML = renderBulkSyncReport(report);
      document.getElementById('bulk-sync-result-modal').showModal();
      render();  // Refresh the visible UI to reflect new statuses
    } catch (e) {
      progressModal.close();
      alert('Bulk sync failed: ' + e.message);
    }
  });
  document.getElementById('bulk-sync-result-close').addEventListener('click', () => {
    document.getElementById('bulk-sync-result-modal').close();
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
    progressModal.showModal();
    document.getElementById('settings-modal').close();
    try {
      const report = await enrichEntireCatalog((n, total) => {
        statusEl.textContent = `Looking up TMDB metadata... ${n} / ${total}`;
        barEl.style.width = `${total ? Math.round((n / total) * 100) : 0}%`;
      });
      progressModal.close();
      const html = `
        <div class="stat-line"><span>Total catalog items</span><strong>${report.total}</strong></div>
        <div class="stat-line"><span>Processed this run</span><strong>${report.processed}</strong></div>
        <div class="stat-line"><span>Found on TMDB</span><strong>${report.found}</strong></div>
        <div class="stat-line"><span>Errors</span><strong>${report.errors}</strong></div>
        <p class="settings-help" style="margin-top:12px">Catalog enrichment cached locally. Streaming-provider badges will now load instantly on item expand. Re-run after 30 days or when adding new catalog items to refresh.</p>
      `;
      document.getElementById('enrichment-result-content').innerHTML = html;
      document.getElementById('enrichment-result-modal').showModal();
    } catch (e) {
      progressModal.close();
      alert('Enrichment failed: ' + e.message);
    }
  });
  document.getElementById('enrichment-result-close').addEventListener('click', () => {
    document.getElementById('enrichment-result-modal').close();
  });

  // === Promotions Manager ===
  document.getElementById('promotions-manage').addEventListener('click', () => {
    document.getElementById('settings-modal').close();
    openPromotionsManager();
  });
  document.getElementById('promotions-mgr-close').addEventListener('click', () => {
    document.getElementById('promotions-mgr-modal').close();
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

  // === Trakt integration ===
  document.getElementById('trakt-client-save').addEventListener('click', () => {
    setTraktClientId(document.getElementById('trakt-client-id').value.trim());
    setTraktClientSecret(document.getElementById('trakt-client-secret').value.trim());
    const status = document.getElementById('trakt-status');
    status.textContent = 'Credentials saved.';
    status.className = 'settings-status ok';
  });

  document.getElementById('trakt-connect').addEventListener('click', async () => {
    const clientId = getTraktClientId() || document.getElementById('trakt-client-id').value.trim();
    const clientSecret = getTraktClientSecret() || document.getElementById('trakt-client-secret').value.trim();
    const status = document.getElementById('trakt-status');
    const codeBlock = document.getElementById('trakt-device-code-block');
    const codeEl = document.getElementById('trakt-user-code');
    const codeStatus = document.getElementById('trakt-code-status');
    if (!clientId || !clientSecret) {
      status.textContent = 'Enter and save Client ID and Client Secret first.';
      status.className = 'settings-status err';
      return;
    }
    setTraktClientId(clientId);
    setTraktClientSecret(clientSecret);
    status.textContent = 'Requesting device code...';
    status.className = 'settings-status';
    try {
      const resp = await fetch(`${TRAKT_API_BASE}/oauth/device/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!resp.ok) { status.textContent = `Trakt error: HTTP ${resp.status}`; status.className = 'settings-status err'; return; }
      const { user_code, device_code, interval, expires_in } = await resp.json();
      codeEl.textContent = user_code;
      codeBlock.style.display = '';
      codeStatus.textContent = 'Waiting for activation…';
      status.textContent = '';
      const deadline = Date.now() + (expires_in || 600) * 1000;
      const pollInterval = (interval || 5) * 1000;
      const poll = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(poll);
          codeBlock.style.display = 'none';
          status.textContent = 'Code expired. Try again.';
          status.className = 'settings-status err';
          return;
        }
        const r = await fetch(`${TRAKT_API_BASE}/oauth/device/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: device_code, client_id: clientId, client_secret: clientSecret }),
        });
        if (r.status === 400) return; // still pending
        if (r.status === 404 || r.status === 410) {
          clearInterval(poll);
          codeBlock.style.display = 'none';
          status.textContent = 'Code expired. Try again.';
          status.className = 'settings-status err';
          return;
        }
        if (r.ok) {
          const d = await r.json();
          clearInterval(poll);
          setTraktAccessToken(d.access_token);
          setTraktRefreshToken(d.refresh_token || '');
          codeBlock.style.display = 'none';
          const me = await traktApiCall('/users/me', 'GET');
          if (me.ok && me.data.username) setTraktUsername(me.data.username);
          updateTraktStatusLine();
        }
      }, pollInterval);
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      status.className = 'settings-status err';
    }
  });

  document.getElementById('trakt-sync').addEventListener('click', async () => {
    await traktPullSync();
  });

  document.getElementById('trakt-disconnect').addEventListener('click', () => {
    traktDisconnect();
  });

  // === v5.39.0: Streaming-leaving alerts ===
  function refreshAlertsStatusUI() {
    const enabled = isAlertsEnabled();
    const enableBtn = document.getElementById('alerts-enable');
    const disableBtn = document.getElementById('alerts-disable');
    const status = document.getElementById('alerts-status');
    if (enableBtn) enableBtn.style.display = enabled ? 'none' : '';
    if (disableBtn) disableBtn.style.display = enabled ? '' : 'none';
    if (status) {
      if (!isWebhookConfigured()) status.textContent = 'Configure the Worker first.';
      else if (!getPlexToken()) status.textContent = 'Set your Plex token first (used as the user identifier).';
      else if (!('Notification' in window)) status.textContent = 'Notifications API not available on this device.';
      else if (Notification.permission === 'denied') status.textContent = 'Notification permission was denied. Re-enable it in your browser site settings.';
      else if (enabled) status.textContent = `On — region ${getStreamingRegion()}.`;
      else status.textContent = 'Off.';
    }
  }
  refreshAlertsStatusUI();

  const alertsEnableBtn = document.getElementById('alerts-enable');
  if (alertsEnableBtn) alertsEnableBtn.addEventListener('click', async () => {
    const status = document.getElementById('alerts-status');
    status.textContent = 'Subscribing…';
    const r = await alertsSubscribe();
    if (r.ok) status.textContent = `Subscribed — monitoring ${r.itemCount} item${r.itemCount === 1 ? '' : 's'} in region ${r.region}.`;
    else status.textContent = `Could not subscribe: ${r.reason}.`;
    refreshAlertsStatusUI();
  });

  const alertsDisableBtn = document.getElementById('alerts-disable');
  if (alertsDisableBtn) alertsDisableBtn.addEventListener('click', async () => {
    const status = document.getElementById('alerts-status');
    status.textContent = 'Unsubscribing…';
    await alertsUnsubscribe();
    status.textContent = 'Off.';
    refreshAlertsStatusUI();
  });

  const alertsTestBtn = document.getElementById('alerts-test');
  if (alertsTestBtn) alertsTestBtn.addEventListener('click', async () => {
    const status = document.getElementById('alerts-status');
    status.textContent = 'Checking for notifications…';
    await alertsCheckNotifications();
    status.textContent = isAlertsEnabled() ? `Checked. On — region ${getStreamingRegion()}.` : 'Off.';
  });

  // === Plex History modal ===
  document.getElementById('history-btn').addEventListener('click', () => {
    openHistoryModal();
  });
  document.getElementById('history-close').addEventListener('click', () => {
    document.getElementById('history-modal').close();
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
    document.getElementById('promote-modal').close();
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
  modal.showModal();
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
        document.getElementById('history-modal').close();
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

function openPromoteModal(btn) {
  pendingPromote = {
    type: btn.dataset.type,
    title: btn.dataset.title,
    year: btn.dataset.year || null,
    plays: parseInt(btn.dataset.plays) || 1,
    distinct: parseInt(btn.dataset.distinct) || 1,
  };
  document.getElementById('promote-info').textContent =
    `Promote "${pendingPromote.title}" (${pendingPromote.year || '?'}) to a CinéMath catalog tab. ${pendingPromote.plays} plays detected.`;
  // Populate tab dropdown
  const tvTabs = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);
  const select = document.getElementById('promote-tab');
  select.innerHTML = catalogManifest
    .filter(c => !c.virtual)
    .filter(c => pendingPromote.type === 'movie' ? !tvTabs.has(c.id) : tvTabs.has(c.id))
    .map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  document.getElementById('promote-modal').showModal();
}

async function confirmPromote() {
  if (!pendingPromote) return;
  const tab = document.getElementById('promote-tab').value;
  if (!catalogs[tab]) { alert('Tab not found.'); return; }

  const cat = catalogs[tab];
  const isRecSource = pendingPromote.source === 'recommendation';
  const sectionName = isRecSource
    ? 'X. TMDB Recommendations (Promoted)'
    : 'X. Plex History (Promoted)';
  let section = cat.sections.find(s => s.name === sectionName);
  if (!section) {
    section = {
      name: sectionName,
      desc: isRecSource
        ? 'Items promoted from TMDB recommendations based on what you Loved or Liked (synced via Cloudflare KV).'
        : 'Items promoted from your Plex viewing history (synced via Cloudflare KV).',
      categories: [],
      items: [],
    };
    cat.sections.push(section);
  }
  const newItem = {
    title: pendingPromote.title,
    year: pendingPromote.year ? parseInt(pendingPromote.year) : null,
    pitch: isRecSource
      ? `Promoted from TMDB recommendation. Suggested by your rating of "${pendingPromote.sourceTitle}".`
      : `Promoted from Plex history. ${pendingPromote.plays} play(s) detected${pendingPromote.type === 'tv' ? `, ${pendingPromote.distinct} distinct episode(s)` : ''}.`,
    priority: 'low',
    whyPriority: isRecSource
      ? 'Auto-added from TMDB recommendations.'
      : 'Auto-added from your Plex viewing history.',
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

  // Mark status: rec-sourced → queued (user wants to consider it);
  // Plex-sourced movie → watched; Plex-sourced TV → watching, with auto-loved if many distinct episodes.
  if (isRecSource) {
    setStatus(newItem.id, 'queued', tab);
    // Stamp local enrichment so the same TMDB item won't re-appear in Discover next render.
    if (pendingPromote.tmdbId) {
      setEnrichmentForItem(newItem.id, {
        tmdbId: pendingPromote.tmdbId,
        type: pendingPromote.type === 'tv' ? 'tv' : 'movie',
        year: newItem.year,
      });
    }
  } else if (pendingPromote.type === 'movie') {
    setStatus(newItem.id, 'watched', tab);
  } else {
    setStatus(newItem.id, 'watching', tab);
    if (pendingPromote.distinct >= 5) {
      setRating(newItem.id, 'loved', tab);
    }
  }

  // Refresh state
  plexHistoryCache = null;
  document.getElementById('promote-modal').close();
  const wasRecSourced = isRecSource;
  pendingPromote = null;
  if (wasRecSourced) {
    // Re-render the wizard recs panel so the just-promoted item disappears from Discover.
    setTimeout(() => wizardRender(), 100);
  } else {
    // Re-render history modal (existing flow)
    setTimeout(() => openHistoryModal(), 100);
  }
  render();
}

// =====================================================================
// Promotions Manager modal — view, mark-committed, delete, export
// =====================================================================
async function openPromotionsManager() {
  const modal = document.getElementById('promotions-mgr-modal');
  const status = document.getElementById('promotions-mgr-status');
  modal.showModal();
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
      if (!confirm(`Delete this promotion from KV?\n\nUse this after you've added the item to the catalog source files in the GitHub repo. The item stays in CinéMath via the canonical catalog; the KV entry is just cleanup.`)) return;
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
  lines.push('# CinéMath — Promotions Export');
  lines.push('# Generated: ' + new Date().toISOString());
  lines.push(`# Total promotions: ${promotionsCache.length} across ${Object.keys(byTab).length} tab(s)`);
  lines.push('#');
  lines.push('# Instructions:');
  lines.push('# Each section below corresponds to one catalog file in the CinéMath repo:');
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

// =====================================================================
// Stage 5d-2: Period in Review (markdown export)
// =====================================================================

function openPeriodReviewModal() {
  // Populate year dropdown — pull years from state's lastUpdated values
  const years = new Set();
  Object.keys(state).forEach(tab => {
    Object.keys(state[tab] || {}).forEach(id => {
      const ts = state[tab][id].lastUpdated;
      if (ts) years.add(new Date(ts).getFullYear());
    });
  });
  // Always include current year
  years.add(new Date().getFullYear());
  const yearList = Array.from(years).sort((a, b) => b - a);
  const ySel = document.getElementById('period-review-year');
  ySel.innerHTML = yearList.map(y => `<option value="${y}">${y}</option>`).join('');

  // Populate month dropdown
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mSel = document.getElementById('period-review-month');
  mSel.innerHTML = monthNames.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  mSel.value = String(new Date().getMonth() + 1);

  // Default custom range to last 30 days
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  document.getElementById('period-review-start').value = monthAgo.toISOString().slice(0, 10);
  document.getElementById('period-review-end').value = today.toISOString().slice(0, 10);

  document.getElementById('period-review-type').value = 'year';
  document.getElementById('period-review-year-section').style.display = '';
  document.getElementById('period-review-month-section').style.display = 'none';
  document.getElementById('period-review-custom-section').style.display = 'none';
  document.getElementById('period-review-status').textContent = '';

  document.getElementById('period-review-modal').showModal();
}

function getPeriodRange() {
  const type = document.getElementById('period-review-type').value;
  const now = new Date();
  let start, end, label;
  if (type === 'year') {
    const y = parseInt(document.getElementById('period-review-year').value);
    start = new Date(y, 0, 1).getTime();
    end = new Date(y + 1, 0, 1).getTime() - 1;
    label = `${y}`;
  } else if (type === 'month') {
    const y = parseInt(document.getElementById('period-review-year').value);
    const m = parseInt(document.getElementById('period-review-month').value);
    start = new Date(y, m - 1, 1).getTime();
    end = new Date(y, m, 1).getTime() - 1;
    const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
    label = `${mn} ${y}`;
  } else if (type === 'last12') {
    end = now.getTime();
    start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
    label = 'Last 12 Months';
  } else if (type === 'custom') {
    const s = document.getElementById('period-review-start').value;
    const e = document.getElementById('period-review-end').value;
    if (!s || !e) return null;
    start = new Date(s).getTime();
    end = new Date(e).getTime() + 24 * 60 * 60 * 1000 - 1;  // include the end day
    label = `${s} to ${e}`;
  }
  return { start, end, label, type };
}

function generatePeriodReview() {
  const range = getPeriodRange();
  const status = document.getElementById('period-review-status');
  if (!range) {
    status.textContent = 'Pick a valid date range.';
    return;
  }
  status.textContent = 'Generating report...';

  const md = buildPeriodReviewMarkdown(range);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeLabel = range.label.replace(/[^a-zA-Z0-9-]/g, '_');
  a.download = `watchtrack-review-${safeLabel}.md`;
  a.click();
  URL.revokeObjectURL(url);
  status.textContent = 'Downloaded.';
}

// v5.37.0 B6: Share via Web Share API. Prefers file-share so the recipient
// gets a real .md (Notes, Drive, Slack, etc.); falls back to text-share
// where files aren't supported.
async function sharePeriodReview() {
  const range = getPeriodRange();
  const status = document.getElementById('period-review-status');
  if (!range) {
    status.textContent = 'Pick a valid date range.';
    return;
  }
  if (!navigator.share) {
    status.textContent = 'Sharing is not supported on this device. Use Generate & download instead.';
    return;
  }
  status.textContent = 'Generating report...';
  const md = buildPeriodReviewMarkdown(range);
  const safeLabel = range.label.replace(/[^a-zA-Z0-9-]/g, '_');
  const filename = `watchtrack-review-${safeLabel}.md`;
  const file = new File([md], filename, { type: 'text/markdown' });
  const titleStr = `CinéMath — ${range.label}`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title: titleStr, files: [file] });
    } else {
      await navigator.share({ title: titleStr, text: md });
    }
    status.textContent = 'Shared.';
  } catch (e) {
    if (e && e.name === 'AbortError') {
      status.textContent = 'Share cancelled.';
    } else {
      status.textContent = 'Share failed: ' + (e && e.message || 'unknown error');
    }
  }
}

function buildPeriodReviewMarkdown(range) {
  const { start, end, label, type } = range;

  // Walk all state, collect entries within range
  const inRange = [];   // { tab, id, item, entry }
  Object.keys(state).forEach(tab => {
    if (tab === 'watchlist') return;
    const cat = catalogs[tab];
    if (!cat) return;
    const tabState = state[tab] || {};
    Object.keys(tabState).forEach(id => {
      const entry = tabState[id];
      if (!entry || !entry.lastUpdated) return;
      if (entry.lastUpdated < start || entry.lastUpdated > end) return;
      const item = cat.items.find(it => it.id === id);
      if (!item) return;
      inRange.push({ tab, id, item, entry });
    });
  });

  // Categorize by status / rating
  const watched = inRange.filter(x => x.entry.status === 'watched');
  const watching = inRange.filter(x => x.entry.status === 'watching');
  const queued = inRange.filter(x => x.entry.status === 'queued');
  const skip = inRange.filter(x => x.entry.status === 'skip');
  const loved = inRange.filter(x => x.entry.rating === 'loved');
  const liked = inRange.filter(x => x.entry.rating === 'liked');
  const mixed = inRange.filter(x => x.entry.rating === 'mixed');
  const disliked = inRange.filter(x => x.entry.rating === 'disliked');

  // Comparison: prior period
  const periodLength = end - start;
  const priorStart = start - periodLength;
  const priorEnd = start - 1;
  let priorWatchedCount = 0;
  Object.keys(state).forEach(tab => {
    if (tab === 'watchlist') return;
    const tabState = state[tab] || {};
    Object.keys(tabState).forEach(id => {
      const entry = tabState[id];
      if (!entry || !entry.lastUpdated) return;
      if (entry.lastUpdated >= priorStart && entry.lastUpdated <= priorEnd && entry.status === 'watched') {
        priorWatchedCount++;
      }
    });
  });

  // Genre breakdown
  const genreCounts = {};
  watched.forEach(x => {
    const tabLabel = (catalogs[x.tab] && catalogs[x.tab].title) || x.tab;
    genreCounts[tabLabel] = (genreCounts[tabLabel] || 0) + 1;
  });
  const genresSorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);

  // Tag highlights
  const posTagCounts = {};
  const negTagCounts = {};
  inRange.forEach(x => {
    const tags = x.entry.reactionTags || [];
    const ct = resolveContentTypeForItem(x.item, x.tab);
    const set = TAG_SETS[ct] || TAG_SETS['film-narrative'];
    const posSet = new Set(set.positive || []);
    const negSet = new Set(set.negative || []);
    tags.forEach(t => {
      if (posSet.has(t)) posTagCounts[t] = (posTagCounts[t] || 0) + 1;
      else if (negSet.has(t)) negTagCounts[t] = (negTagCounts[t] || 0) + 1;
    });
  });
  const topPos = Object.entries(posTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topNeg = Object.entries(negTagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Trend (only relevant for year / last12 / large custom ranges)
  let trendBlock = '';
  if (type !== 'month' && (end - start) > 60 * 24 * 60 * 60 * 1000) {
    const monthBuckets = {};
    watched.forEach(x => {
      const d = new Date(x.entry.lastUpdated);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets[key] = (monthBuckets[key] || 0) + 1;
    });
    const sorted = Object.entries(monthBuckets).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length > 0) {
      trendBlock = '\n## Monthly Trend\n\n';
      const max = Math.max(...sorted.map(s => s[1]));
      sorted.forEach(([m, c]) => {
        const bar = '█'.repeat(Math.round((c / max) * 20));
        trendBlock += `- **${m}**: ${bar} ${c}\n`;
      });
    }
  }

  // Build markdown
  let md = `# CinéMath — ${label} in Review\n\n`;
  md += `*Generated ${new Date().toISOString().slice(0, 10)}*\n\n`;
  md += `---\n\n## Headline Stats\n\n`;
  md += `- **Items watched**: ${watched.length}`;
  if (priorWatchedCount > 0) {
    const delta = watched.length - priorWatchedCount;
    const sign = delta >= 0 ? '+' : '';
    md += ` (${sign}${delta} vs prior ${type === 'year' ? 'year' : type === 'month' ? 'month' : 'period'})`;
  }
  md += `\n`;
  md += `- **Items started but not finished (watching)**: ${watching.length}\n`;
  md += `- **Added to queue**: ${queued.length}\n`;
  md += `- **Marked as skip**: ${skip.length}\n`;
  md += `- **Total items touched**: ${inRange.length}\n\n`;

  md += `### Rating Distribution\n\n`;
  md += `- 💚 **Loved**: ${loved.length}\n`;
  md += `- 👍 **Liked**: ${liked.length}\n`;
  md += `- 🤷 **Mixed**: ${mixed.length}\n`;
  md += `- 👎 **Disliked**: ${disliked.length}\n\n`;

  // Top loved
  if (loved.length > 0) {
    md += `## Top Loved (${loved.length})\n\n`;
    loved.sort((a, b) => b.entry.lastUpdated - a.entry.lastUpdated).slice(0, 20).forEach(x => {
      const tabLabel = (catalogs[x.tab] && catalogs[x.tab].title) || x.tab;
      const date = new Date(x.entry.lastUpdated).toISOString().slice(0, 10);
      md += `- **${x.item.title}** (${x.item.year || '?'}) — *${tabLabel}* — ${date}`;
      if (x.entry.notes) md += ` — _${x.entry.notes}_`;
      md += `\n`;
    });
    md += `\n`;
  }

  // Disliked
  if (disliked.length > 0) {
    md += `## Disliked (${disliked.length})\n\n`;
    disliked.sort((a, b) => b.entry.lastUpdated - a.entry.lastUpdated).forEach(x => {
      const tabLabel = (catalogs[x.tab] && catalogs[x.tab].title) || x.tab;
      const date = new Date(x.entry.lastUpdated).toISOString().slice(0, 10);
      md += `- **${x.item.title}** (${x.item.year || '?'}) — *${tabLabel}* — ${date}`;
      if (x.entry.notes) md += ` — _${x.entry.notes}_`;
      md += `\n`;
    });
    md += `\n`;
  }

  // Genres
  if (genresSorted.length > 0) {
    md += `## Genres Explored\n\n`;
    genresSorted.forEach(([g, c]) => {
      md += `- **${g}**: ${c}\n`;
    });
    md += `\n`;
  }

  // Tag highlights
  if (topPos.length > 0) {
    md += `## Top Positive Tags\n\n`;
    topPos.forEach(([t, c]) => md += `- **${t}**: ${c}\n`);
    md += `\n`;
  }
  if (topNeg.length > 0) {
    md += `## Top Negative Tags\n\n`;
    topNeg.forEach(([t, c]) => md += `- **${t}**: ${c}\n`);
    md += `\n`;
  }

  md += trendBlock;

  // All watched (full list at end)
  if (watched.length > 0) {
    md += `\n## Complete Watched List\n\n`;
    watched.sort((a, b) => b.entry.lastUpdated - a.entry.lastUpdated).forEach(x => {
      const tabLabel = (catalogs[x.tab] && catalogs[x.tab].title) || x.tab;
      const date = new Date(x.entry.lastUpdated).toISOString().slice(0, 10);
      const ratingEmoji = { loved: '💚', liked: '👍', mixed: '🤷', disliked: '👎' }[x.entry.rating] || '';
      md += `- ${ratingEmoji} **${x.item.title}** (${x.item.year || '?'}) — *${tabLabel}* — ${date}\n`;
    });
    md += `\n`;
  }

  md += `\n---\n*CinéMath period review — ${label}*\n`;
  return md;
}

// Helper for tag categorization within period review
function resolveContentTypeForItem(item, tabId) {
  if (item && item.contentType) return item.contentType;
  if (item && Array.isArray(item.categories) && item.categories.length > 0) {
    for (const cat of item.categories) {
      if (CATEGORY_TO_CONTENT_TYPE[cat]) return CATEGORY_TO_CONTENT_TYPE[cat];
    }
  }
  return TAB_DEFAULT_CONTENT_TYPE[tabId] || 'film-narrative';
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

// === Bulk-sync results ===
function renderBulkSyncReport(r) {
  let html = '';
  html += '<h4>Overall</h4>';
  html += `<div class="stat-line"><span>Plex history entries fetched</span><strong>${r.totalEntries}</strong></div>`;
  html += `<div class="stat-line"><span>Stored to durable history</span><strong>${r.workerStored}</strong></div>`;
  html += `<div class="stat-line"><span>Filtered (excluded library)</span><strong>${r.workerFiltered}</strong></div>`;
  html += '<h4>Movies</h4>';
  html += `<div class="stat-line"><span>Distinct movies seen on Plex</span><strong>${r.moviesProcessed}</strong></div>`;
  html += `<div class="stat-line"><span>Matched to CinéMath catalog</span><strong>${r.moviesMatchedToCatalog}</strong></div>`;
  html += `<div class="stat-line"><span>Newly marked Watched</span><strong>${r.moviesMarkedWatched}</strong></div>`;
  html += `<div class="stat-line"><span>Orphans (not in catalog, logged to history)</span><strong>${r.moviesOrphan}</strong></div>`;
  html += '<h4>TV shows</h4>';
  html += `<div class="stat-line"><span>Distinct shows seen on Plex</span><strong>${r.showsProcessed}</strong></div>`;
  html += `<div class="stat-line"><span>Matched to CinéMath catalog</span><strong>${r.showsMatchedToCatalog}</strong></div>`;
  html += `<div class="stat-line"><span>Marked Watching</span><strong>${r.showsMarkedWatching}</strong></div>`;
  html += `<div class="stat-line"><span>Marked Loved (5+ distinct episodes)</span><strong>${r.showsMarkedLoved}</strong></div>`;
  html += `<div class="stat-line"><span>Orphans (not in catalog, logged to history)</span><strong>${r.showsOrphan}</strong></div>`;
  if (r.movieOrphans.length > 0) {
    html += '<h4>Movie orphans (top 15)</h4>';
    r.movieOrphans
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 15)
      .forEach(o => {
        html += `<div class="stat-line"><span>${escapeHtml(o.title)} (${escapeHtml(o.year || '?')})</span><strong>${o.plays} play${o.plays === 1 ? '' : 's'}</strong></div>`;
      });
  }
  if (r.showOrphans.length > 0) {
    html += '<h4>TV orphans</h4>';
    r.showOrphans
      .sort((a, b) => b.distinct - a.distinct)
      .forEach(o => {
        html += `<div class="stat-line"><span>${escapeHtml(o.show)}</span><strong>${o.distinct} ep / ${o.plays} play${o.plays === 1 ? '' : 's'}</strong></div>`;
      });
  }
  html += '<p class="settings-help" style="margin-top:12px">Orphans were logged to your durable Plex history (Cloudflare KV). Future versions will surface them in a Plex History modal where you can promote frequently-watched items into the catalog.</p>';
  return html;
}

// v5.46.0: Levenshtein-1 distance for typo-tolerant search. Returns the
// edit distance between two strings, capped at `cap` for speed (anything
// over the cap returns cap+1 — we don't care about the exact value past
// the threshold, just that it exceeded). Standard two-row DP. ~25 lines.
function _levenshteinCapped(a, b, cap) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > cap) return cap + 1;
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

// Fuzzy-match a query against a title. Single-word query: walk title
// tokens, return true on first within-cap match. Multi-word query: every
// query token must have at least one within-cap match in the title (so
// "tinkr tailr" matches "Tinker Tailor Soldier Spy" because both
// "tinkr"→"tinker" and "tailr"→"tailor" are ≤ 2 edits). Skips when the
// joined query is < 4 chars — fuzziness on short strings is too noisy.
function _fuzzyTitleMatch(query, title, cap) {
  if (query.length < 4) return false;
  const titleTokens = title.split(/\s+/).filter(t => t.length >= 3);
  if (titleTokens.length === 0) return false;
  const queryTokens = query.split(/\s+/).filter(t => t.length >= 3);
  if (queryTokens.length === 0) return false;
  for (const qt of queryTokens) {
    let found = false;
    for (const tt of titleTokens) {
      if (_levenshteinCapped(qt, tt.toLowerCase(), cap) <= cap) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
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
      // v5.46.0: tier 6 = fuzzy title match. Tries Levenshtein ≤ 2 against
      // each whitespace-token in the title. Ranked behind every exact-match
      // tier so typos don't outrank precise hits.
      else if (_fuzzyTitleMatch(q, t, 2)) score = 6;
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
      document.getElementById('search-modal').close();
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
      document.getElementById('notes-search-modal').close();
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
// === V5.20.0: Stats modal SVG chart helpers (pure SVG/CSS, zero deps) ===
function statsDonut(segments, centerText, centerSubtext) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return '<div class="stats-chart-empty">No data yet</div>';
  const r = 75, cx = 100, cy = 100;
  let acc = 0;
  const arcs = segments.map(seg => {
    if (seg.value === 0) return '';
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += seg.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `<path d="M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${seg.color}"/>`;
  }).join('');
  const inner = `<circle cx="${cx}" cy="${cy}" r="46" fill="var(--bg-elev)"/>`;
  const text = `<text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="var(--ink)" font-size="22" font-family="'Didot', 'Bodoni 72', Georgia, serif">${centerText}</text>`;
  const sub = centerSubtext ? `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--ink-dim)" font-size="10" letter-spacing="0.05em">${centerSubtext}</text>` : '';
  const legend = segments.map(seg =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${seg.color}"></span>${escapeHtml(seg.label)} <strong>${seg.value}</strong>${total ? ` <span class="legend-pct">${Math.round(seg.value * 100 / total)}%</span>` : ''}</span>`
  ).join('');
  return `<div class="stats-chart"><svg viewBox="0 0 200 200" class="stats-chart-svg" aria-hidden="true">${arcs}${inner}${text}${sub}</svg><div class="stats-chart-legend">${legend}</div></div>`;
}
function statsStackedBars(rows, segLabels) {
  if (rows.length === 0) return '';
  const max = Math.max(1, ...rows.map(r => r.total));
  const body = rows.map(r => {
    const segs = r.segments.map(s => s.value > 0
      ? `<span class="stacked-seg" style="width:${(s.value / max) * 100}%;background:${s.color}" title="${s.value}"></span>`
      : ''
    ).join('');
    return `<div class="stacked-row"><div class="stacked-label">${escapeHtml(r.label)}</div><div class="stacked-bar">${segs}</div><div class="stacked-total">${r.total}</div></div>`;
  }).join('');
  const legend = segLabels.map(l =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${l.color}"></span>${escapeHtml(l.label)}</span>`
  ).join('');
  return `<div class="stats-chart"><div class="stats-chart-legend horizontal">${legend}</div>${body}</div>`;
}
function statsHistogram(buckets, color) {
  if (buckets.length === 0) return '<div class="stats-chart-empty">No data yet</div>';
  color = color || 'var(--accent)';
  const max = Math.max(1, ...buckets.map(b => b.value));
  const w = 400, h = 150, padT = 14, padB = 22;
  const innerH = h - padT - padB;
  const slot = w / buckets.length;
  const barW = slot * 0.7;
  const bars = buckets.map((b, i) => {
    const bh = (b.value / max) * innerH;
    const x = i * slot + (slot - barW) / 2;
    const y = padT + (innerH - bh);
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" fill="${color}" rx="2"/>` +
      `<text x="${(x + barW / 2).toFixed(2)}" y="${h - 6}" text-anchor="middle" fill="var(--ink-dim)" font-size="9">${escapeHtml(b.label)}</text>` +
      (b.value > 0 ? `<text x="${(x + barW / 2).toFixed(2)}" y="${(y - 3).toFixed(2)}" text-anchor="middle" fill="var(--ink)" font-size="10">${b.value}</text>` : '');
  }).join('');
  return `<div class="stats-chart"><svg viewBox="0 0 ${w} ${h}" class="stats-chart-svg full-width" aria-hidden="true">${bars}</svg></div>`;
}
function statsLineChart(points, color) {
  if (points.length === 0) return '';
  color = color || 'var(--accent)';
  const max = Math.max(1, ...points.map(p => p.value));
  const w = 400, h = 150, padL = 8, padR = 8, padT = 14, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((p, i) => [padL + i * stepX, padT + innerH - (p.value / max) * innerH]);
  const linePath = 'M ' + coords.map(c => `${c[0].toFixed(2)} ${c[1].toFixed(2)}`).join(' L ');
  const areaPath = linePath + ` L ${coords[coords.length - 1][0].toFixed(2)} ${(padT + innerH).toFixed(2)} L ${coords[0][0].toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;
  const dots = coords.map((c, i) =>
    `<circle cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="2.5" fill="${color}"/>` +
    (points[i].value > 0 ? `<text x="${c[0].toFixed(2)}" y="${(c[1] - 6).toFixed(2)}" text-anchor="middle" fill="var(--ink)" font-size="9">${points[i].value}</text>` : '')
  ).join('');
  const labels = points.map((p, i) => i % 2 === 0
    ? `<text x="${coords[i][0].toFixed(2)}" y="${h - 6}" text-anchor="middle" fill="var(--ink-dim)" font-size="9">${escapeHtml(p.label)}</text>`
    : ''
  ).join('');
  return `<div class="stats-chart"><svg viewBox="0 0 ${w} ${h}" class="stats-chart-svg full-width" aria-hidden="true">` +
    `<path d="${areaPath}" fill="${color}" opacity="0.18"/>` +
    `<path d="${linePath}" stroke="${color}" stroke-width="1.5" fill="none"/>` +
    `${dots}${labels}</svg></div>`;
}

function renderStats() {
  let totalCatalogItems = 0, watched = 0, watching = 0, queued = 0, skip = 0, rated = 0;
  const ratingCounts = { loved: 0, liked: 0, mixed: 0, disliked: 0 };
  const tagCounts = {};
  const perTab = {};
  const decadeCounts = {};
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
      if (item.year && typeof item.year === 'number') {
        const dec = Math.floor(item.year / 10) * 10;
        decadeCounts[dec] = (decadeCounts[dec] || 0) + 1;
      }
    });
    perTab[tab] = tabSt;
    if (tabSt.queued > longestQueue.count) longestQueue = { tab: cat.title || tab, count: tabSt.queued };
  }

  // Monthly activity buckets (last 12 months)
  const months = [];
  const dNow = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(dNow.getFullYear(), dNow.getMonth() - i, 1);
    months.push({ label: d.toLocaleString('en', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), value: 0 });
  }
  for (const tab in state) {
    for (const id in state[tab]) {
      const lu = (state[tab][id] && state[tab][id].lastUpdated) || 0;
      if (!lu) continue;
      const d = new Date(lu);
      const idx = months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
      if (idx !== -1) months[idx].value++;
    }
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
  html += statsDonut([
    { label: 'Loved', value: ratingCounts.loved, color: 'var(--watched)' },
    { label: 'Liked', value: ratingCounts.liked, color: 'var(--accent)' },
    { label: 'Mixed', value: ratingCounts.mixed, color: 'var(--watching)' },
    { label: 'Disliked', value: ratingCounts.disliked, color: 'var(--skip)' }
  ], totalRated, totalRated === 1 ? 'rated' : 'rated');

  html += '<h4>Activity (last 12 months)</h4>';
  html += statsLineChart(months);
  html += `<div class="stat-line"><span>Updated last 7 days</span><strong>${updated7}</strong></div>`;
  html += `<div class="stat-line"><span>Updated last 30 days</span><strong>${updated30}</strong></div>`;
  html += `<div class="stat-line"><span>Longest queue</span><strong>${longestQueue.tab} (${longestQueue.count})</strong></div>`;

  const decadeArr = Object.entries(decadeCounts).sort((a, b) => +a[0] - +b[0]).map(([d, n]) => ({ label: `${(d % 100).toString().padStart(2, '0')}s`, value: n }));
  if (decadeArr.length > 0) {
    html += '<h4>By decade</h4>';
    html += statsHistogram(decadeArr);
  }

  if (topTags.length) {
    html += '<h4>Top reaction tags</h4>';
    topTags.forEach(([tag, n]) => {
      html += `<div class="stat-line"><span>${tag}</span><strong>${n}</strong></div>`;
    });
  }

  html += '<h4>Per tab (top 10 by watched)</h4>';
  const perTabRows = Object.entries(perTab)
    .sort((a, b) => b[1].watched - a[1].watched)
    .slice(0, 10)
    .map(([tab, s]) => {
      const cat = catalogs[tab];
      const untouched = Math.max(0, s.total - s.watched - s.watching - s.queued);
      return {
        label: cat ? cat.title : tab,
        total: s.total,
        segments: [
          { value: s.watched, color: 'var(--watched)' },
          { value: s.watching, color: 'var(--watching)' },
          { value: s.queued, color: 'var(--queued)' },
          { value: untouched, color: 'var(--ink-faint)' }
        ]
      };
    });
  html += statsStackedBars(perTabRows, [
    { label: 'Watched', color: 'var(--watched)' },
    { label: 'Watching', color: 'var(--watching)' },
    { label: 'Queued', color: 'var(--queued)' },
    { label: 'Untouched', color: 'var(--ink-faint)' }
  ]);

  return html;
}

// =====================================================================
// Stage 5f: Catalog gap analysis
// =====================================================================
function renderCatalogHealth() {
  const STALE_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const missingDir = [], missingRuntime = [], missingCountry = [], missingCritics = [], missingPriority = [];
  const noEnrichment = [], staleEnrichment = [], noRecs = [];
  const watchedNoTags = [], ratedNoTags = [];
  const decadeCounts = {};
  const countryCounts = {};
  const tabSizes = {};
  const directorCounts = {};
  let totalItems = 0;

  for (const tab in catalogs) {
    const cat = catalogs[tab];
    tabSizes[tab] = { title: cat.title || tab, count: cat.items.length };
    cat.items.forEach(item => {
      totalItems++;
      const label = `${item.title} (${item.year || '?'})`;
      const tabLabel = cat.title || tab;

      if (!item.dir) missingDir.push({ label, tab: tabLabel, id: item.id, tabId: tab });
      if (!item.runtime) missingRuntime.push({ label, tab: tabLabel, id: item.id, tabId: tab });
      if (!item.country) missingCountry.push({ label, tab: tabLabel, id: item.id, tabId: tab });
      if (!item.critics || item.critics.length === 0) missingCritics.push({ label, tab: tabLabel });
      if (!item.priority) missingPriority.push({ label, tab: tabLabel });

      if (item.year && typeof item.year === 'number') {
        const decade = Math.floor(item.year / 10) * 10;
        decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
      }
      if (item.country) countryCounts[item.country] = (countryCounts[item.country] || 0) + 1;
      if (item.dir) directorCounts[item.dir] = (directorCounts[item.dir] || 0) + 1;

      const enrich = getEnrichmentForItem(item.id);
      if (!enrich || !enrich.tmdbId) noEnrichment.push({ label, tab: tabLabel });
      else {
        if (enrich.lastEnriched && (now - enrich.lastEnriched > STALE_MS)) staleEnrichment.push({ label, tab: tabLabel });
        if (!enrich.recommendations || enrich.recommendations.length === 0) noRecs.push({ label, tab: tabLabel });
      }

      const entry = (state[tab] && state[tab][item.id]) || {};
      const st = entry.status || 'none';
      const hasTags = entry.reactionTags && entry.reactionTags.length > 0;
      if ((st === 'watched' || st === 'watching') && !hasTags) watchedNoTags.push({ label, tab: tabLabel, tabId: tab, id: item.id });
      if (entry.rating && entry.rating !== 'none' && !hasTags) ratedNoTags.push({ label, tab: tabLabel, tabId: tab, id: item.id });
    });
  }

  function collapsible(id, items, max) {
    if (items.length === 0) return '';
    const shown = items.slice(0, max || 10);
    const rest = items.slice(max || 10);
    let html = '<div class="health-list">';
    shown.forEach(x => { html += `<div class="health-item">${x.label} <span class="health-tab">${x.tab}</span></div>`; });
    if (rest.length) {
      html += `<div class="health-expand" data-target="${id}">+ ${rest.length} more</div>`;
      html += `<div class="health-extra" id="${id}" style="display:none">`;
      rest.forEach(x => { html += `<div class="health-item">${x.label} <span class="health-tab">${x.tab}</span></div>`; });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  let html = '';

  // --- Metadata completeness ---
  html += '<h4>Metadata completeness</h4>';
  const metaFields = [
    { name: 'Director', items: missingDir },
    { name: 'Runtime', items: missingRuntime },
    { name: 'Country', items: missingCountry },
    { name: 'Critics', items: missingCritics },
    { name: 'Priority', items: missingPriority },
  ];
  metaFields.forEach((f, i) => {
    const pct = totalItems ? Math.round((totalItems - f.items.length) * 100 / totalItems) : 100;
    const cls = pct === 100 ? 'health-good' : pct >= 80 ? 'health-ok' : 'health-warn';
    html += `<div class="stat-line"><span>${f.name}</span><strong class="${cls}">${pct}% <span class="health-count">(${f.items.length} missing)</span></strong></div>`;
    if (f.items.length > 0) html += collapsible(`meta-${i}`, f.items, 8);
  });

  // --- Enrichment coverage ---
  html += '<h4>TMDB enrichment</h4>';
  const enriched = totalItems - noEnrichment.length;
  const enrichPct = totalItems ? Math.round(enriched * 100 / totalItems) : 0;
  html += `<div class="stat-line"><span>Enriched</span><strong>${enriched}/${totalItems} (${enrichPct}%)</strong></div>`;
  if (noEnrichment.length) html += collapsible('enrich-missing', noEnrichment, 8);
  html += `<div class="stat-line"><span>Stale (>30 days)</span><strong>${staleEnrichment.length}</strong></div>`;
  html += `<div class="stat-line"><span>Missing recs/similar</span><strong>${noRecs.length}</strong></div>`;
  if (noRecs.length) html += collapsible('enrich-norecs', noRecs, 8);

  // --- Reaction tag gaps ---
  html += '<h4>Reaction tags</h4>';
  html += `<div class="stat-line"><span>Watched, no tags</span><strong>${watchedNoTags.length}</strong></div>`;
  if (watchedNoTags.length) html += collapsible('tags-watched', watchedNoTags, 8);
  html += `<div class="stat-line"><span>Rated, no tags</span><strong>${ratedNoTags.length}</strong></div>`;
  if (ratedNoTags.length) html += collapsible('tags-rated', ratedNoTags, 8);

  // --- Decade balance ---
  html += '<h4>Decade distribution</h4>';
  const maxDecade = Math.max(...Object.values(decadeCounts), 1);
  const decades = Object.keys(decadeCounts).map(Number).sort();
  decades.forEach(d => {
    const n = decadeCounts[d];
    const barW = Math.round(n * 100 / maxDecade);
    html += `<div class="health-decade"><span class="health-decade-label">${d}s</span><div class="health-bar-track"><div class="health-bar" style="width:${barW}%"></div></div><span class="health-decade-n">${n}</span></div>`;
  });

  // --- Country diversity ---
  html += '<h4>Country diversity</h4>';
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  const uniqueCountries = topCountries.length;
  html += `<div class="stat-line"><span>Unique origins</span><strong>${uniqueCountries}</strong></div>`;
  topCountries.slice(0, 12).forEach(([c, n]) => {
    html += `<div class="stat-line"><span>${c}</span><strong>${n}</strong></div>`;
  });

  // --- Tab balance ---
  html += '<h4>Tab sizes</h4>';
  const sorted = Object.entries(tabSizes).sort((a, b) => a[1].count - b[1].count);
  sorted.forEach(([tab, info]) => {
    const cls = info.count < 15 ? 'health-warn' : '';
    html += `<div class="stat-line"><span>${info.title}</span><strong class="${cls}">${info.count}</strong></div>`;
  });

  // --- Director concentration ---
  html += '<h4>Most represented directors</h4>';
  const topDirs = Object.entries(directorCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  topDirs.forEach(([d, n]) => {
    html += `<div class="stat-line"><span>${d}</span><strong>${n}</strong></div>`;
  });
  const singleDirs = Object.values(directorCounts).filter(n => n === 1).length;
  const totalDirs = Object.keys(directorCounts).length;
  html += `<div class="stat-line"><span>Total unique directors</span><strong>${totalDirs}</strong></div>`;
  html += `<div class="stat-line"><span>Single-entry directors</span><strong>${singleDirs}</strong></div>`;

  return html;
}

// === V5.35.0: Wizard redesign — genre families & unified film+TV recs ===
// Family groups bridge film and TV tabs so the user picks a genre once and
// sees both kinds in the recs panel. "Heist" and "Foreign" etc. are
// film-only families with no TV tab. "British Comedy" rolls into Comedy.
const GENRE_FAMILIES = [
  { id: 'scifi',          label: 'Sci-Fi',           tabs: ['scifi', 'scifi-tv'] },
  { id: 'crime',          label: 'Crime',            tabs: ['crime', 'crime-tv'] },
  { id: 'spy',            label: 'Spy',              tabs: ['espionage', 'spy-tv'] },
  { id: 'drama',          label: 'Drama',            tabs: ['drama', 'drama-tv'] },
  { id: 'horror',         label: 'Horror',           tabs: ['horror', 'horror-tv'] },
  { id: 'fantasy',        label: 'Fantasy',          tabs: ['fantasy', 'fantasy-tv'] },
  { id: 'cons',           label: 'Cons & Courtroom', tabs: ['cons-courtroom', 'cons-courtroom-tv'] },
  { id: 'comedy',         label: 'Comedy',           tabs: ['comedy', 'comedy-tv', 'british-comedy'] },
  { id: 'heroes',         label: 'Heroes & Comics',  tabs: ['heroes-comics', 'heroes-comics-tv'] },
  { id: 'heist',          label: 'Heist',            tabs: ['heist'] },
  { id: 'foreign',        label: 'Foreign',          tabs: ['foreign'] },
  { id: 'auteur',         label: 'Auteur',           tabs: ['auteur'] },
  { id: 'pre1960',        label: 'Classics',          tabs: ['pre1960'] },
  { id: 'musicals',       label: 'Musicals',         tabs: ['musicals'] },
];
function familyFilmTabs(family) {
  if (!family) return [];
  return family.tabs.filter(t => !WIZARD_TV_TABS.has(t));
}
function familyTvTabs(family) {
  if (!family) return [];
  return family.tabs.filter(t => WIZARD_TV_TABS.has(t));
}

// === V5.34.0: Trailer embed (Phase 3c of decision-helper roadmap) ===
// Worker (v5.5+) populates `enrich.trailerKey` with the YouTube key of the best
// available trailer for each TMDB-enriched item. Older enrichments without
// trailerKey just don't show the button. Cache TTL is 30 days, so most items
// will refresh into having trailers within a month.
function getTrailerKey(itemId) {
  const enrich = getEnrichmentForItem(itemId);
  return enrich && enrich.trailerKey ? enrich.trailerKey : null;
}
function trailerYouTubeUrl(key) {
  // Use the standard watch URL — opens in YouTube app on Android/Google TV via OS handler
  return `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
}

// === V5.33.0: Mood archetype filter (Phase 3b of decision-helper roadmap) ===
// Six archetypes, each mapped to a cluster of reaction tags. Items are
// scored by how many of their applied reactionTags overlap the mood's
// cluster. Higher overlap = surfaced higher in the recs panel.
// Soft filter: items with zero overlap don't get dropped, just ranked
// lower. Items with no reactionTags applied yet score 0 (neutral).
const MOOD_ARCHETYPES = {
  smart:     { label: 'Smart & demanding', sub: 'Structure, performance, intent',
               tags: ['Smart structure','Performance-driven','Stayed with me','Mind-bending','Director\'s voice unmistakable','Tight structure','Subversive or knowing'] },
  comfort:   { label: 'Comfort',           sub: 'Rewatchable, easy company',
               tags: ['Rewatchable','Endlessly rewatchable','Ensemble warmth','Comfort watch','Quotable','Format works','Host chemistry'] },
  visceral:  { label: 'Visceral',          sub: 'Look, sound, feel',
               tags: ['Visually stunning','Genuinely unsettling','Great atmosphere','Bravura staging','Visually inventive','World-building sells it','Cult magnetism'] },
  cathartic: { label: 'Cathartic',         sub: 'Hits you in the chest',
               tags: ['Emotionally resonant','Earned emotion','Stayed with me','Mythic weight'] },
  light:     { label: 'Light',             sub: 'Laughs over weight',
               tags: ['Laugh-out-loud funny','Joke density','Quotable','Powerhouse vocals','Triple-threat','Comfort watch'] },
  any:       { label: 'Any mood',          sub: 'No filter',
               tags: [] },
};

function moodScore(item, sourceTab, mood) {
  if (!mood || mood === 'any') return 0;
  const cfg = MOOD_ARCHETYPES[mood];
  if (!cfg || !cfg.tags.length) return 0;
  const itemTags = getTags(item.id, sourceTab) || [];
  if (itemTags.length === 0) return 0;
  const moodTagSet = new Set(cfg.tags);
  let score = 0;
  for (const t of itemTags) {
    if (moodTagSet.has(t)) score++;
  }
  return score;
}

// === V5.32.0: Time budget filter (Phase 3a of decision-helper roadmap) ===
// Five buckets, escalating. parseRuntimeMin handles the various string
// formats stored across catalogs ("126 min", "1h 47m", "47", "5 series + 14
// episodes"). For TV the runtime field is per-episode by convention so the
// budget compares per-episode, not series total. Items with unparseable
// runtime are kept (don't filter out the unknown).
const TIME_BUDGETS = {
  quick:    { max: 30,       label: 'Quick',    sub: '≤ 30 min' },
  short:    { max: 90,       label: 'Short',    sub: '≤ 90 min' },
  standard: { max: 120,      label: 'Standard', sub: '≤ 2 hours' },
  long:     { max: 180,      label: 'Long',     sub: '≤ 3 hours' },
  any:      { max: Infinity, label: 'All evening', sub: 'No limit' },
};

function parseRuntimeMin(item) {
  if (!item) return null;
  const r = item.runtime;
  if (r == null) return null;
  if (typeof r === 'number') return r > 0 ? r : null;
  if (typeof r !== 'string') return null;
  const s = r.toLowerCase().trim();
  // "1h 47m" / "1 hr 47 min" / "1h47m" / "2 hours 6 minutes"
  const hm = s.match(/(\d+)\s*(?:h(?:r|our|ours)?)\s*(?:(\d+)\s*(?:m(?:in|inutes)?))?/);
  if (hm) {
    return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
  }
  // "47 min" / "47 minutes" / "47m" / leading "47" before non-numeric
  const m = s.match(/^(\d+)\s*(?:m(?:in|inutes)?)?(?:\s|$)/);
  if (m) {
    const v = parseInt(m[1], 10);
    return v > 0 ? v : null;
  }
  return null;
}

function fitsTimeBudget(item, budget) {
  if (!budget || budget === 'any') return true;
  const cfg = TIME_BUDGETS[budget];
  if (!cfg || cfg.max === Infinity) return true;
  const mins = parseRuntimeMin(item);
  // Unparseable / unknown runtime → don't filter out (better false-positive than dropping items)
  if (mins == null) return true;
  return mins <= cfg.max;
}

// === V5.28.0: Cross-platform sync via Cloudflare Worker ===
// Identity: SHA-256 of the user's Plex token, hex-encoded. Stable across devices.
// Storage: Worker /sync/get and /sync/put endpoints, backed by a new SYNC_KV namespace.
// Scope: settings (Plex creds, region, subs, display mode) + entire catalog state.
// Conflict policy: last-write-wins via `pushedAt` timestamp on each blob.
// Debounce: client batches 5s of changes into a single PUT.
const SYNC_LAST_PUSH_KEY = 'watchtrack-sync-last-push';
const SYNC_LAST_PULL_KEY = 'watchtrack-sync-last-pull';
const SYNC_LAST_ERROR_KEY = 'watchtrack-sync-last-error';
const SYNC_DEBOUNCE_MS = 5000;
const SYNC_MAX_BYTES = 1024 * 1024 * 2; // 2 MB safety cap (KV value limit is 25 MB)
let syncDirty = false;
let syncDebounceTimer = null;
let syncBootstrapPromise = null;

async function getUserHash() {
  const token = getPlexToken();
  if (!token) return null;
  if (!('crypto' in window) || !crypto.subtle) return null;
  const enc = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// === v5.39.0: Streaming-leaving alerts (C1) ===
const ALERTS_ENABLED_KEY = 'watchtrack-alerts-enabled';
const ALERTS_LAST_POLL_KEY = 'watchtrack-alerts-last-poll';
let _alertsRefreshTimer = null;

function isAlertsEnabled() { return lsGet(ALERTS_ENABLED_KEY) === '1'; }

function alertsBuildItemsManifest() {
  const items = [];
  Object.keys(state).forEach(tabId => {
    if (tabId === 'watchlist' || tabId === 'auteur') return;
    const tabState = state[tabId];
    const cat = catalogs[tabId];
    if (!tabState || !cat) return;
    Object.keys(tabState).forEach(itemId => {
      const e = tabState[itemId];
      if (!e || (e.status !== 'queued' && e.status !== 'watching')) return;
      const item = cat.items.find(it => it.id === itemId);
      if (!item) return;
      const isTV = tabId.endsWith('-tv') || tabId === 'british-comedy';
      const enriched = (typeof getEnrichmentForItem === 'function') ? getEnrichmentForItem(item) : null;
      items.push({
        tabId, itemId,
        title: item.title,
        year: item.year,
        type: isTV ? 'tv' : 'movie',
        tmdbId: enriched ? enriched.tmdbId : null,
      });
    });
  });
  return items;
}

// v5.44.0: convert a urlsafe-base64 VAPID public key string into the
// raw Uint8Array that pushManager.subscribe expects.
function _vapidB64ToBytes(b64u) {
  const pad = (4 - (b64u.length % 4)) % 4;
  const s = (b64u + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Subscribe (or refresh) the Web Push subscription via the active
// service-worker registration. Returns { endpoint, keys: {p256dh, auth} }
// in a shape ready to POST to /alerts/subscribe, or null if push is
// unavailable for any reason.
async function _alertsAcquirePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (!isWebhookConfigured()) return null;
  let reg;
  try { reg = await navigator.serviceWorker.ready; } catch { return null; }
  if (!reg) return null;
  // Reuse the existing subscription if it's already there, otherwise create one.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    let vapidPublic;
    try {
      const resp = await fetch(`${getWebhookUrl()}/alerts/vapid-public`);
      if (!resp.ok) return null;
      const data = await resp.json();
      vapidPublic = data.vapidPublicKey;
    } catch { return null; }
    if (!vapidPublic) return null;
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _vapidB64ToBytes(vapidPublic),
      });
    } catch {
      return null;
    }
  }
  // Convert the subscription into our wire shape
  const json = sub.toJSON();
  if (!json || !json.endpoint || !json.keys) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

async function alertsSubscribe() {
  if (!isWebhookConfigured()) return { ok: false, reason: 'webhook-not-configured' };
  if (!('Notification' in window)) return { ok: false, reason: 'no-notification-api' };
  let perm = Notification.permission;
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; }
  }
  if (perm !== 'granted') return { ok: false, reason: 'permission-denied' };
  const userHash = await getUserHash();
  if (!userHash) return { ok: false, reason: 'no-user-hash' };
  const items = alertsBuildItemsManifest();
  const region = getStreamingRegion();
  // v5.44.0: best-effort Web Push subscription. If it succeeds, the
  // Worker stores the push endpoint+keys and the cron sends real Web
  // Pushes. If push acquisition fails, the polling path still works.
  const push = await _alertsAcquirePushSubscription();
  try {
    const resp = await fetch(`${getWebhookUrl()}/alerts/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: getWebhookSecret(), userHash, region, items, push }),
    });
    if (!resp.ok) return { ok: false, reason: `${resp.status}` };
    lsSet(ALERTS_ENABLED_KEY, '1');
    return { ok: true, itemCount: items.length, region, hasPush: !!push };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function alertsUnsubscribe() {
  if (!isWebhookConfigured()) {
    lsDel(ALERTS_ENABLED_KEY);
    return { ok: true };
  }
  const userHash = await getUserHash();
  if (!userHash) {
    lsDel(ALERTS_ENABLED_KEY);
    return { ok: true };
  }
  try {
    await fetch(`${getWebhookUrl()}/alerts/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: getWebhookSecret(), userHash }),
    });
  } catch {}
  lsDel(ALERTS_ENABLED_KEY);
  return { ok: true };
}

function alertsRefreshSubscription() {
  if (!isAlertsEnabled()) return;
  // Coalesce rapid status changes — re-subscribe at most once per 5s
  if (_alertsRefreshTimer) clearTimeout(_alertsRefreshTimer);
  _alertsRefreshTimer = setTimeout(() => alertsSubscribe(), 5000);
}

async function alertsCheckNotifications() {
  if (!isAlertsEnabled()) return;
  if (!isWebhookConfigured()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const userHash = await getUserHash();
  if (!userHash) return;
  const since = parseInt(lsGet(ALERTS_LAST_POLL_KEY) || '0');
  try {
    const resp = await fetch(
      `${getWebhookUrl()}/alerts/notifications?secret=${encodeURIComponent(getWebhookSecret())}&user=${userHash}&since=${since}`
    );
    if (!resp.ok) return;
    const data = await resp.json();
    const notifications = data.notifications || [];
    if (notifications.length === 0) return;
    const seenKeys = [];
    for (const n of notifications) {
      try {
        new Notification(n.title, {
          body: n.body,
          icon: 'icons/icon-192.png',
          tag: n.itemRef,
          data: { tabId: n.tabId, itemId: n.itemId },
        });
        seenKeys.push(n.key);
      } catch {}
    }
    lsSet(ALERTS_LAST_POLL_KEY, String(Date.now()));
    if (seenKeys.length > 0) {
      await fetch(`${getWebhookUrl()}/alerts/notifications/seen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: getWebhookSecret(), userHash, keys: seenKeys }),
      });
    }
  } catch {}
}

function syncSettingsSnapshot() {
  return {
    plexServerUrl: getPlexServerUrl(),
    plexToken: getPlexToken(),
    plexClientId: getPlexClientId(),
    streamingRegion: getStreamingRegion(),
    mySubscriptions: getMySubscriptions(),
    displayMode: getDisplayModePref(),
    traktClientId: typeof getTraktClientId === 'function' ? getTraktClientId() : '',
    traktClientSecret: typeof getTraktClientSecret === 'function' ? getTraktClientSecret() : '',
  };
}

async function syncPush(reason) {
  if (!isWebhookConfigured()) return false;
  const userHash = await getUserHash();
  if (!userHash) return false;
  const payload = {
    v: 1,
    settings: syncSettingsSnapshot(),
    state: state,
    pushedAt: Date.now(),
    pushedFrom: navigator.userAgent.slice(0, 100),
    reason: reason || 'auto',
  };
  const body = JSON.stringify(payload);
  if (body.length > SYNC_MAX_BYTES) {
    lsSet(SYNC_LAST_ERROR_KEY, `Payload too large: ${(body.length / 1024 / 1024).toFixed(1)} MB exceeds ${(SYNC_MAX_BYTES / 1024 / 1024)} MB cap`);
    return false;
  }
  try {
    const url = `${getWebhookUrl()}/sync/put?user=${userHash}&secret=${encodeURIComponent(getWebhookSecret())}`;
    const resp = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
    if (resp.ok) {
      lsSet(SYNC_LAST_PUSH_KEY, String(Date.now()));
      lsDel(SYNC_LAST_ERROR_KEY);
      updateSyncStatusUI();
      return true;
    }
    lsSet(SYNC_LAST_ERROR_KEY, `PUT ${resp.status}: ${resp.statusText}`);
  } catch (e) {
    lsSet(SYNC_LAST_ERROR_KEY, `Network error: ${e.message}`);
  }
  updateSyncStatusUI();
  return false;
}

async function syncFetch() {
  if (!isWebhookConfigured()) return null;
  const userHash = await getUserHash();
  if (!userHash) return null;
  try {
    const url = `${getWebhookUrl()}/sync/get?user=${userHash}&secret=${encodeURIComponent(getWebhookSecret())}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      if (resp.status !== 404) lsSet(SYNC_LAST_ERROR_KEY, `GET ${resp.status}: ${resp.statusText}`);
      return null;
    }
    const data = await resp.json();
    if (!data) return null;
    lsSet(SYNC_LAST_PULL_KEY, String(Date.now()));
    lsDel(SYNC_LAST_ERROR_KEY);
    return data;
  } catch (e) {
    lsSet(SYNC_LAST_ERROR_KEY, `Network error: ${e.message}`);
    return null;
  }
}

function syncApplyRemote(remote) {
  if (!remote || !remote.pushedAt) return false;
  // V5.31.1: Per-item merge instead of blob-level replace.
  // Old logic compared a single pushedAt timestamp on the whole blob and
  // either applied the entire remote or applied nothing. That meant a
  // device with LESS data (but a NEWER pushedAt) would clobber a device
  // with MORE data — exactly what was happening when the TV pushed its
  // small state and the phone pulled it, "reverting to old version."
  //
  // New logic: settings get blob-replaced (settings don't have per-key
  // versioning) but only if user explicitly pulls; state gets MERGED
  // per-item using each entry's `lastUpdated` timestamp (set by
  // touchEntry on every status/rating/tag/notes change). The newer
  // version of each individual item wins. Items present only on one
  // side stay — nothing is destroyed.

  // 1. Settings replace (small blob, no per-key versioning)
  if (remote.settings) {
    const s = remote.settings;
    if (s.plexServerUrl) setPlexServerUrl(s.plexServerUrl);
    if (s.plexToken) setPlexToken(s.plexToken);
    if (s.plexClientId) setPlexClientId(s.plexClientId);
    if (s.streamingRegion) setStreamingRegion(s.streamingRegion);
    if (s.mySubscriptions && Array.isArray(s.mySubscriptions)) setMySubscriptions(s.mySubscriptions);
    if (s.displayMode) setDisplayModePref(s.displayMode);
    if (s.traktClientId && typeof setTraktClientId === 'function') setTraktClientId(s.traktClientId);
    if (s.traktClientSecret && typeof setTraktClientSecret === 'function') setTraktClientSecret(s.traktClientSecret);
  }

  // 2. State merge per-item by lastUpdated
  let mergedItems = 0;
  if (remote.state && typeof remote.state === 'object') {
    for (const tab in remote.state) {
      if (!state[tab]) state[tab] = {};
      const remoteTab = remote.state[tab];
      if (!remoteTab || typeof remoteTab !== 'object') continue;
      for (const id in remoteTab) {
        const remoteEntry = remoteTab[id];
        const localEntry = state[tab][id];
        if (!localEntry) {
          state[tab][id] = remoteEntry;
          mergedItems++;
          continue;
        }
        const remoteTs = remoteEntry.lastUpdated || 0;
        const localTs = localEntry.lastUpdated || 0;
        if (remoteTs > localTs) {
          state[tab][id] = remoteEntry;
          mergedItems++;
        }
        // Otherwise local wins — preserve in place
      }
    }
    if (mergedItems > 0) {
      lsSet(STORAGE_KEY, JSON.stringify(state));
    }
  }
  return true;
}

function syncMarkDirty() {
  syncDirty = true;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    if (syncDirty) {
      syncDirty = false;
      syncPush('debounced');
    }
  }, SYNC_DEBOUNCE_MS);
}

async function syncOnLaunch() {
  if (!isWebhookConfigured()) return;
  if (!getPlexToken()) return;
  syncBootstrapPromise = (async () => {
    const remote = await syncFetch();
    if (remote) {
      const applied = syncApplyRemote(remote);
      if (applied) {
        // Re-render with the remote state applied
        if (typeof render === 'function') render();
      }
    }
  })();
  await syncBootstrapPromise;
}

function updateSyncStatusUI() {
  const el = document.getElementById('sync-status-line');
  if (!el) return;
  const lastPush = parseInt(lsGet(SYNC_LAST_PUSH_KEY) || '0');
  const lastPull = parseInt(lsGet(SYNC_LAST_PULL_KEY) || '0');
  const err = lsGet(SYNC_LAST_ERROR_KEY);
  const fmt = (ts) => {
    if (!ts) return 'never';
    const ago = Math.floor((Date.now() - ts) / 1000);
    if (ago < 60) return `${ago}s ago`;
    if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
    if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
    return `${Math.floor(ago / 86400)}d ago`;
  };
  el.innerHTML = `
    <div>Last pushed: <strong>${fmt(lastPush)}</strong></div>
    <div>Last pulled: <strong>${fmt(lastPull)}</strong></div>
    ${err ? `<div style="color:var(--skip);margin-top:6px">Error: ${escapeHtml(err)}</div>` : ''}
  `;
}

// === V5.22.0: Cross-device config pairing (URL-based credential transfer) ===
// Lets you set up credentials on a device with a real keyboard, then share/cast
// the URL to a TV without typing the long Worker URL + secret on a remote.
function generatePairUrl() {
  const data = {
    workerUrl: getWebhookUrl(),
    workerSecret: getWebhookSecret(),
    plexToken: getPlexToken(),
    plexServerUrl: getPlexServerUrl(),
    plexClientId: getPlexClientId(),
    streamingRegion: getStreamingRegion(),
    mySubscriptions: getMySubscriptions(),
    v: 1,
  };
  const encoded = btoa(JSON.stringify(data));
  return `${window.location.origin}${window.location.pathname}?config=${encoded}`;
}
function applyConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cfg = params.get('config');
  if (!cfg) return false;
  if (!applyConfigPayload(cfg)) return false;
  history.replaceState(null, '', window.location.pathname);
  location.reload();
  return true;
}
// V5.22.1: Paste-based config import (for cases where URL routing on Google TV
// opens the link in a browser whose storage is sandboxed away from the TWA).
function applyConfigFromString(input) {
  let cfg = (input || '').trim();
  if (!cfg) return false;
  // Accept either the full pair URL or just the BASE64 payload
  if (/^https?:\/\//i.test(cfg)) {
    try {
      const u = new URL(cfg);
      cfg = u.searchParams.get('config') || u.hash.replace(/^#config=/, '') || '';
    } catch { return false; }
  }
  if (!cfg) return false;
  return applyConfigPayload(cfg);
}
function applyConfigPayload(b64) {
  try {
    const data = JSON.parse(atob(b64));
    if (data.workerUrl) setWebhookUrl(data.workerUrl);
    if (data.workerSecret) setWebhookSecret(data.workerSecret);
    if (data.plexToken) setPlexToken(data.plexToken);
    if (data.plexServerUrl) setPlexServerUrl(data.plexServerUrl);
    if (data.plexClientId) setPlexClientId(data.plexClientId);
    if (data.streamingRegion) setStreamingRegion(data.streamingRegion);
    if (data.mySubscriptions && Array.isArray(data.mySubscriptions)) setMySubscriptions(data.mySubscriptions);
    return true;
  } catch (e) {
    console.error('Invalid pair payload:', e);
    return false;
  }
}

// === V5.21.0: Watch sub-modal (Triage → Start Watching → pick platform) ===
async function openWatchModal(item, sourceTab) {
  const modal = document.getElementById('watch-modal');
  document.getElementById('watch-modal-title').textContent = `Watch · ${item.title}${item.year ? ' (' + item.year + ')' : ''}`;
  const body = document.getElementById('watch-modal-body');
  body.innerHTML = '<div class="streaming-loading">Looking up where to watch…</div>';
  modal.showModal();

  // Stash the item so the action buttons can find it (they're outside body and survive innerHTML changes)
  modal.dataset.itemId = item.id;
  modal.dataset.sourceTab = sourceTab;

  // 1. Plex priority — if owned, show ONLY Plex with an "Other ways" expander
  let plexMatch = null;
  if (isPlexConfigured()) {
    plexMatch = plexHasItem(item);
  }
  if (plexMatch && plexMatch.ratingKey) {
    const plexUrl = plexDeepLinkUrl(plexMatch.ratingKey);
    body.innerHTML = `
      <div class="watch-section watch-plex-section">
        <h5>On your Plex server</h5>
        <div class="watch-buttons">
          <a href="${plexUrl}" class="watch-btn-large plex-btn" data-watch-launch>Open in Plex</a>
        </div>
      </div>
      <details class="watch-others">
        <summary>Other ways to watch (subscriptions, rent, buy)</summary>
        <div id="watch-others-body"><div class="streaming-loading">Loading…</div></div>
      </details>
    `;
    const detailsEl = body.querySelector('.watch-others');
    let othersLoaded = false;
    detailsEl.addEventListener('toggle', async () => {
      if (detailsEl.open && !othersLoaded) {
        othersLoaded = true;
        await renderWatchProviders(item, document.getElementById('watch-others-body'), { skipPlex: true });
      }
    });
    wireWatchModalActions(item, sourceTab);
    return;
  }

  // 2. No Plex match — render TMDB providers in main body
  await renderWatchProviders(item, body, { skipPlex: false });
  wireWatchModalActions(item, sourceTab);
}

async function renderWatchProviders(item, container, opts) {
  opts = opts || {};
  if (!isWebhookConfigured()) {
    container.innerHTML = `
      <div class="streaming-none">
        TMDB watch-provider data needs the Cloudflare Worker.<br>
        Settings → <strong>Plex Webhook Bridge</strong> → enter Worker URL + Shared Secret.<br>
        <span style="font-size:11px;color:var(--ink-faint)">If you haven't deployed it, see <code>worker/DEPLOY.md</code> in the repo.</span>
      </div>`;
    return;
  }
  const tvTabs = ['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv'];
  const sourceTab = item._watchlist_source_tab || activeTab;
  const type = tvTabs.includes(sourceTab) ? 'tv' : 'movie';
  const enrich = getEnrichmentForItem(item.id);
  const data = enrich && enrich.tmdbId
    ? await tmdbLookupById(enrich.tmdbId, type)
    : await tmdbLookup(item.title, item.year, type);
  if (!data || !data.found || !data.watchProviders) {
    container.innerHTML = '<div class="streaming-none">No streaming availability data.</div>';
    return;
  }
  const region = getStreamingRegion();
  const regionData = data.watchProviders[region];
  const otherRegions = Object.keys(data.watchProviders).filter(k => k !== region && data.watchProviders[k]);

  // Home region: subscription tier only (flatrate). No rent, buy, or ad-supported.
  let mySubsHtml = '';
  if (regionData && regionData.flatrate) {
    regionData.flatrate.forEach(p => {
      if (!isMySub(p.provider_name)) return;
      const url = streamingSearchUrl(p.provider_name, item.title);
      mySubsHtml += `<a href="${url}" class="watch-btn-large my-sub" data-watch-launch target="_blank" rel="noopener">${escapeHtml(p.provider_name)}</a>`;
    });
  }

  let html = '';
  if (mySubsHtml) {
    html += `<div class="watch-section"><h5>On your subscriptions — ${region}</h5><div class="watch-buttons">${mySubsHtml}</div></div>`;
  } else {
    html += `<div class="streaming-none">Not on your subscriptions in ${region}.</div>`;
  }

  // VPN section: other regions where user's own subscriptions carry it on flatrate.
  // Group by provider so the user knows which VPN country to pick for each service.
  const vpnByProvider = {};
  otherRegions.forEach(r => {
    const rd = data.watchProviders[r];
    if (!rd || !rd.flatrate) return;
    rd.flatrate.forEach(p => {
      if (!isMySub(p.provider_name)) return;
      if (!vpnByProvider[p.provider_name]) vpnByProvider[p.provider_name] = [];
      vpnByProvider[p.provider_name].push(r);
    });
  });
  const vpnEntries = Object.entries(vpnByProvider);
  if (vpnEntries.length > 0) {
    const rows = vpnEntries.map(([provider, regions]) => {
      const names = regions.map(r => (STREAMING_REGIONS.find(x => x.code === r) || {}).name || r).join(' · ');
      return `<div class="watch-vpn-row"><span class="watch-vpn-provider">${escapeHtml(provider)}</span><span class="watch-vpn-regions">${escapeHtml(names)}</span></div>`;
    }).join('');
    const label = vpnEntries.length === 1 ? '1 service' : `${vpnEntries.length} services`;
    html += `
      <details class="watch-vpn-section">
        <summary>Available on your subs abroad — ${label} (VPN)</summary>
        ${rows}
        <div class="watch-vpn-tip">Your home region is <strong>${region}</strong>. Set PIA to any listed country and open the service normally.</div>
      </details>`;
  }
  container.innerHTML = html;
}

function wireWatchModalActions(item, sourceTab) {
  const modal = document.getElementById('watch-modal');
  const advance = () => {
    setStatus(item.id, 'watching', sourceTab);
    modal.close();
    if (triageState && triageState.queue && triageState.queue[triageState.idx] === item) {
      triageState.idx++;
      renderTriage();
    } else {
      render();
    }
  };
  // Provider/Plex launch buttons: open URL, then mark + advance
  modal.querySelectorAll('[data-watch-launch]').forEach((el) => {
    el.addEventListener('click', () => {
      // Don't preventDefault — let the link/deep-link fire. Set status afterwards.
      setTimeout(advance, 150);
    });
  });
  // "Mark watching (no platform)" — set status without launching anything
  document.getElementById('watch-mark-only').onclick = (e) => { e.preventDefault(); advance(); };
  // Cancel — close without changes
  document.getElementById('watch-cancel').onclick = (e) => {
    e.preventDefault();
    modal.close();
  };
}

// === Triage mode ===
let triageState = null;  // { mode, queue, idx }

// =====================================================================
// Stage 5e: Recommendation engine
// =====================================================================
// Pure: walks loved/liked source items in tabIds, aggregates the TMDB
// recommendations/similar arrays from local enrichment, scores by source
// rating weight, classifies candidates as catalog-matched (Recommended)
// or TMDB-orphan (Discover), and returns the top of each.
function computeRecsForTab(tabIds, opts) {
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

// =====================================================================
// v5.40.0 R5 / C3: Find Gaps
// =====================================================================
//
// Aggregates TMDB recommendations + similar across every watched/rated
// item the user has across all tabs, frequency-ranks the union, and
// subtracts anything already in any catalog or already actioned. The
// result is a list of titles that the corpus suggests the user would
// enjoy but that aren't yet in any catalog tab — gaps in coverage.
//
// Skips are stored in localStorage by tmdbId so the same gap doesn't
// keep coming back after the user has dismissed it.

const GAP_SKIPS_KEY = 'watchtrack-gap-skips';

function getGapSkips() {
  try { return new Set(JSON.parse(lsGet(GAP_SKIPS_KEY) || '[]')); }
  catch { return new Set(); }
}
function addGapSkip(tmdbId) {
  const skips = getGapSkips();
  skips.add(tmdbId);
  lsSet(GAP_SKIPS_KEY, JSON.stringify([...skips]));
}

function findGaps(limit) {
  limit = limit || 50;
  const skips = getGapSkips();

  // Sources: every watched OR loved/liked item in any catalog tab with
  // enrichment. Watched items contribute weight 1; loved doubles, liked
  // matches loved-as-double-loved logic from computeRecsForTab. The
  // intent: surface the long-tail TMDB rec graph across all genres,
  // not just the active tab.
  const sources = [];
  Object.keys(catalogs).forEach(tabId => {
    if (tabId === 'watchlist' || tabId === 'auteur') return;
    const cat = catalogs[tabId];
    if (!cat) return;
    cat.items.forEach(item => {
      const status = getStatus(item.id, tabId);
      const rating = getRating(item.id, tabId);
      const watched = status === 'watched';
      if (!watched && rating !== 'loved' && rating !== 'liked') return;
      const enrich = getEnrichmentForItem(item.id);
      if (!enrich) return;
      const weight = rating === 'loved' ? 3 : (rating === 'liked' ? 2 : 1);
      sources.push({ srcTitle: item.title, srcTab: tabId, weight, enrich });
    });
  });

  // Map every catalog item by tmdbId so we can subtract anything already
  // in any catalog. Includes promotions because they're part of catalogs.
  const catalogTmdbIds = new Set();
  Object.keys(catalogs).forEach(tabId => {
    if (tabId === 'watchlist') return;
    const cat = catalogs[tabId];
    if (!cat) return;
    cat.items.forEach(item => {
      const e = getEnrichmentForItem(item.id);
      if (e && e.tmdbId) catalogTmdbIds.add(e.tmdbId);
    });
  });

  // Aggregate candidates
  const candidates = new Map();
  sources.forEach(src => {
    const recs = src.enrich.recommendations || [];
    const sims = src.enrich.similar || [];
    const seen = new Set();
    [...recs, ...sims].forEach(rec => {
      if (!rec || !rec.id) return;
      if (seen.has(rec.id)) return;
      seen.add(rec.id);
      if (catalogTmdbIds.has(rec.id)) return;     // already in some catalog
      if (skips.has(rec.id)) return;              // user dismissed
      if (src.enrich.tmdbId === rec.id) return;   // self-reference
      const ex = candidates.get(rec.id) || {
        tmdbId: rec.id,
        title: rec.title,
        year: rec.year,
        type: src.enrich.type,
        score: 0,
        sourceCount: 0,
        sourceTitles: [],
      };
      ex.score += src.weight;
      ex.sourceCount += 1;
      if (ex.sourceTitles.length < 4) ex.sourceTitles.push(src.srcTitle);
      candidates.set(rec.id, ex);
    });
  });

  const ranked = [...candidates.values()].sort(
    (a, b) => b.score - a.score || (a.title || '').localeCompare(b.title || '')
  );
  return {
    candidates: ranked.slice(0, limit),
    sourceCount: sources.length,
    totalCandidates: ranked.length,
  };
}

// =====================================================================
// v6.5.0 R9: AI chat — natural-language watch concierge.
// Wizard-root entry "Tell me what to watch" opens the chat modal. The
// client sends candidate items + the user's message to /chat on the
// Worker, which calls Workers AI (Llama 3.3 70B) and returns a JSON
// pick. The client renders the assistant's reply as a chat bubble and
// the pick as a Watch Card with trailer + providers + actions.
// =====================================================================

let _chatHistory = [];
let _chatPending = false;

function openChatModal() {
  _chatHistory = [];
  _chatPending = false;
  const history = document.getElementById('chat-history');
  if (history) history.innerHTML = '';
  const input = document.getElementById('chat-input');
  if (input) input.value = '';
  document.getElementById('chat-modal').showModal();
  setTimeout(() => input && input.focus(), 80);
}

function appendChatMessage(role, content, opts) {
  opts = opts || {};
  const history = document.getElementById('chat-history');
  if (!history) return null;
  const div = document.createElement('div');
  div.className = `chat-message ${role}${opts.placeholder ? ' placeholder' : ''}`;
  div.textContent = content;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
  return div;
}

function appendWatchCard(pick) {
  const history = document.getElementById('chat-history');
  if (!history || !pick || !pick.tabId || !pick.itemId) return;
  const cat = catalogs[pick.tabId];
  const item = cat && cat.items && cat.items.find(it => it.id === pick.itemId);
  if (!item) {
    appendChatMessage('assistant', `(couldn't find ${pick.tabId}/${pick.itemId} in your catalog)`);
    return;
  }
  const trailerKey = (typeof getTrailerKey === 'function') ? getTrailerKey(item.id) : null;
  const enrich = (typeof getEnrichmentForItem === 'function') ? getEnrichmentForItem(item.id) : null;
  const region = (typeof getStreamingRegion === 'function') ? getStreamingRegion() : 'US';
  const providers = enrich && enrich.watchProviders && enrich.watchProviders[region];
  const flatrate = (providers && providers.flatrate) || [];

  // v6.6.0: "Play Now" target. Priority order:
  //   1. Item is in user's Plex library — Plex deep link (best, opens
  //      directly into native client on Bravia / Android TV).
  //   2. Item has streaming providers in the user's region — JustWatch
  //      redirect via TMDB's region.link.
  //   3. Neither — button is hidden.
  const plexMatch = (typeof isPlexConfigured === 'function' && isPlexConfigured() && typeof plexHasItem === 'function')
    ? plexHasItem(item) : null;
  let playUrl = null;
  let playLabel = '';
  if (plexMatch && typeof plexDeepLinkUrl === 'function') {
    playUrl = plexDeepLinkUrl(plexMatch.ratingKey);
    playLabel = '▶ Play on Plex';
  } else if (providers && providers.link) {
    playUrl = providers.link;
    playLabel = `▶ Play Now${flatrate[0] ? ' on ' + flatrate[0].provider_name : ''}`;
  }

  const card = document.createElement('div');
  card.className = 'watch-card';
  const metaParts = [item.year, item.dir, item.runtime, item.country].filter(Boolean);
  card.innerHTML = `
    <div class="watch-card-title">${escapeHtml(item.title)} <span class="watch-card-year">(${item.year || '?'})</span></div>
    <div class="watch-card-meta">${escapeHtml(metaParts.join(' · '))}</div>
    ${item.pitch ? `<p class="watch-card-pitch">${escapeHtml(item.pitch)}</p>` : ''}
    <div class="watch-card-why"><strong>Why:</strong> ${escapeHtml(pick.why || '')}</div>
    ${flatrate.length ? `<div class="watch-card-providers"><strong>Streaming in ${region}:</strong> ${flatrate.map(p => escapeHtml(p.provider_name)).join(', ')}</div>` : ''}
    <div class="watch-card-actions">
      ${trailerKey ? `<a class="action-btn trailer-btn" href="https://www.youtube.com/watch?v=${trailerKey}" target="_blank" rel="noopener">▶ Watch Trailer</a>` : ''}
      ${playUrl ? `<a class="action-btn watch-card-play" href="${playUrl}" target="_blank" rel="noopener">${escapeHtml(playLabel)}</a>` : ''}
      <button class="action-btn" data-card-action="pass">Pass</button>
    </div>
  `;
  history.appendChild(card);
  history.scrollTop = history.scrollHeight;

  // v6.6.0: Plex deep-link side effect — when the user clicks Play on
  // Plex, also flip status to 'watching' so the rest of the app reflects
  // the action. Same as the existing Plex play button on item cards.
  const playEl = card.querySelector('.watch-card-play');
  if (playEl && plexMatch) {
    playEl.addEventListener('click', () => setStatus(item.id, 'watching', pick.tabId));
  }

  // Pass: increment per-item pass count. Two passes promotes to status=skip
  // so the item is filtered everywhere, not just chat. The pass-count map
  // also feeds buildChatCandidates() so we don't keep suggesting it
  // even before reaching threshold.
  const passBtn = card.querySelector('button[data-card-action="pass"]');
  if (passBtn) {
    passBtn.addEventListener('click', () => {
      const newCount = incrementPassCount(pick.tabId, pick.itemId);
      if (newCount >= 2) {
        setStatus(item.id, 'skip', pick.tabId);
        passBtn.textContent = `✓ Skipped (passed ${newCount}×)`;
      } else {
        passBtn.textContent = `✓ Passed (${newCount}×)`;
      }
      card.querySelectorAll('a, button').forEach(b => { b.style.opacity = '0.5'; });
      passBtn.style.opacity = '1';
      passBtn.disabled = true;
    });
  }
}

// v6.6.0: per-item pass tracking for chat suggestions. Threshold of 2 —
// after the second pass the item is also marked status=skip so the
// rest of the app respects the dismissal. Map shape: { "tabId:itemId": n }.
const CHAT_PASSES_KEY = 'watchtrack-chat-passes';
function getPassesMap() {
  try { return JSON.parse(lsGet(CHAT_PASSES_KEY) || '{}') || {}; }
  catch { return {}; }
}
function getPassCount(tabId, itemId) {
  const m = getPassesMap();
  return m[`${tabId}:${itemId}`] || 0;
}
function incrementPassCount(tabId, itemId) {
  const m = getPassesMap();
  const key = `${tabId}:${itemId}`;
  m[key] = (m[key] || 0) + 1;
  lsSet(CHAT_PASSES_KEY, JSON.stringify(m));
  return m[key];
}

// Build candidate set the bot picks from. Prioritizes queued + watching
// (the user already signalled interest), falls back to unrated catalog
// items if nothing's queued. Caps at 50 to stay inside the AI prompt
// budget — beyond ~50 the model starts forgetting earlier candidates.
function buildChatCandidates() {
  // v6.6.0: also filter out items the user has passed on twice or more
  // in the chat (they were promoted to status=skip when the second pass
  // landed, so the existing skip filter catches them, but we also drop
  // anything with passes >= 1 so a single pass at least de-prioritizes
  // it from the top 50 cap).
  const passes = getPassesMap();
  const cands = [];
  for (const tabId in catalogs) {
    if (tabId === 'watchlist' || tabId === 'auteur') continue;
    const cat = catalogs[tabId];
    if (!cat || !cat.items) continue;
    const isTV = tabId.endsWith('-tv') || tabId === 'british-comedy';
    cat.items.forEach(item => {
      const status = getStatus(item.id, tabId);
      const rating = getRating(item.id, tabId);
      if (status === 'watched' || status === 'skip') return;
      const passCount = passes[`${tabId}:${item.id}`] || 0;
      if (passCount >= 2) return; // belt-and-suspenders; setStatus skip should already exclude
      const tags = getTags(item.id, tabId);
      cands.push({
        tabId, itemId: item.id,
        title: item.title, year: item.year,
        type: isTV ? 'tv' : 'movie',
        dir: item.dir || null,
        pitch: (item.pitch || '').slice(0, 220),
        tags: tags || [],
        runtime: item.runtime || null,
        // priority weights for sort. One pass deprioritizes; queued/watching
        // floats up; rated items drop to the bottom but stay reachable.
        _weight: (status === 'queued' ? 3 : status === 'watching' ? 2 : (rating ? 0 : 1)) - passCount,
      });
    });
  }
  cands.sort((a, b) => b._weight - a._weight);
  return cands.slice(0, 50).map(c => { delete c._weight; return c; });
}

// =====================================================================
// v7.3.0: Quick Triage — Tinder-style swipe deck over chat candidates.
// Left → Add to queue. Right → Pass (archive). Down → Restack (defer).
// Up → Crusade (queue + high priority + Trakt watchlist push).
// =====================================================================
let _qtState = null;  // { deck: [...], idx: 0, dragging: false, dx: 0, dy: 0 }

function openQuickTriage() {
  const deck = buildChatCandidates();
  if (!deck.length) {
    alert('No suggestions to triage right now.');
    return;
  }
  _qtState = { deck, idx: 0, dragging: false, dx: 0, dy: 0 };
  const dlg = document.getElementById('quick-triage-modal');
  document.getElementById('qt-close').onclick = closeQuickTriage;
  document.getElementById('qt-pass').onclick    = () => qtFire('right');
  document.getElementById('qt-add').onclick     = () => qtFire('left');
  document.getElementById('qt-restack').onclick = () => qtFire('down');
  document.getElementById('qt-crusade').onclick = () => qtFire('up');
  dlg.showModal();
  qtRenderStack();
}

function closeQuickTriage() {
  const dlg = document.getElementById('quick-triage-modal');
  if (dlg && dlg.open) dlg.close();
  _qtState = null;
  render();
}

function qtRenderStack() {
  if (!_qtState) return;
  const stack = document.getElementById('qt-stack');
  const prog = document.getElementById('qt-progress');
  if (!stack) return;
  stack.innerHTML = '';
  // End-of-deck state
  if (_qtState.idx >= _qtState.deck.length) {
    stack.innerHTML = `<div class="qt-empty">All caught up. Tap ✕ to close.</div>`;
    prog.textContent = `${_qtState.deck.length} reviewed`;
    return;
  }
  // Render up to 2 stacked cards: current on top, next peeking
  for (let i = Math.min(_qtState.idx + 1, _qtState.deck.length - 1); i >= _qtState.idx; i--) {
    const card = qtBuildCard(_qtState.deck[i], i === _qtState.idx);
    stack.appendChild(card);
  }
  prog.textContent = `${_qtState.idx + 1} / ${_qtState.deck.length}`;
}

function qtBuildCard(pick, isTop) {
  const enrich = getEnrichmentForItem(pick.itemId);
  const poster = enrich && enrich.posterPath
    ? `<img class="qt-poster" src="https://image.tmdb.org/t/p/w300${enrich.posterPath}" alt="" />`
    : `<div class="qt-poster qt-poster--placeholder">${escapeHtml((pick.title || '?')[0])}</div>`;
  const tabLabel = (catalogs[pick.tabId] && catalogs[pick.tabId].title) || pick.tabId;
  const catItem = catalogs[pick.tabId] && catalogs[pick.tabId].items && catalogs[pick.tabId].items.find(it => it.id === pick.itemId);
  const priority = catItem && catItem.priority ? `<span class="qt-pri qt-pri--${catItem.priority}">${priorityLabel(catItem.priority)}</span>` : '';
  const meta = [pick.dir, pick.runtime].filter(Boolean).map(escapeHtml).join(' · ');
  const card = document.createElement('div');
  card.className = 'qt-card' + (isTop ? ' qt-card--top' : ' qt-card--peek');
  card.dataset.itemId = pick.itemId;
  card.dataset.tabId = pick.tabId;
  card.innerHTML = `
    ${poster}
    <div class="qt-body">
      <h4 class="qt-title">${escapeHtml(pick.title)} <span class="qt-year">${pick.year || ''}</span></h4>
      <div class="qt-badges"><span class="qt-tab">${escapeHtml(tabLabel)}</span>${priority}</div>
      <p class="qt-pitch">${escapeHtml(pick.pitch || '')}</p>
      ${meta ? `<div class="qt-meta">${meta}</div>` : ''}
    </div>
  `;
  if (isTop) qtAttachSwipe(card);
  return card;
}

function qtAttachSwipe(card) {
  let startX = 0, startY = 0, captured = false;
  const SWIPE_THRESHOLD = 80;
  card.addEventListener('pointerdown', (e) => {
    startX = e.clientX; startY = e.clientY;
    _qtState.dx = 0; _qtState.dy = 0; _qtState.dragging = true;
    captured = true;
    try { card.setPointerCapture(e.pointerId); } catch {}
    card.classList.add('qt-card--dragging');
  });
  card.addEventListener('pointermove', (e) => {
    if (!_qtState || !_qtState.dragging) return;
    _qtState.dx = e.clientX - startX;
    _qtState.dy = e.clientY - startY;
    const rot = _qtState.dx * 0.04;
    card.style.transform = `translate(${_qtState.dx}px, ${_qtState.dy}px) rotate(${rot}deg)`;
    qtUpdateOverlay(_qtState.dx, _qtState.dy);
  });
  const release = (e) => {
    if (!_qtState || !_qtState.dragging) return;
    _qtState.dragging = false;
    if (captured) { try { card.releasePointerCapture(e.pointerId); } catch {} captured = false; }
    card.classList.remove('qt-card--dragging');
    const { dx, dy } = _qtState;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    if (horiz && dx <= -SWIPE_THRESHOLD) return qtFire('left');
    if (horiz && dx >=  SWIPE_THRESHOLD) return qtFire('right');
    if (!horiz && dy >=  SWIPE_THRESHOLD) return qtFire('down');
    if (!horiz && dy <= -SWIPE_THRESHOLD) return qtFire('up');
    // Snap back
    card.style.transform = '';
    qtUpdateOverlay(0, 0);
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function qtUpdateOverlay(dx, dy) {
  const ov = document.getElementById('qt-overlay');
  if (!ov) return;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const intensity = Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / 120);
  let label = '', cls = '';
  if (horiz) {
    if (dx < -10) { label = 'ADD'; cls = 'qt-overlay--add'; }
    else if (dx > 10) { label = 'PASS'; cls = 'qt-overlay--pass'; }
  } else {
    if (dy > 10) { label = 'RESTACK'; cls = 'qt-overlay--restack'; }
    else if (dy < -10) { label = 'CRUSADE'; cls = 'qt-overlay--crusade'; }
  }
  ov.className = `qt-overlay ${cls}`;
  ov.textContent = label;
  ov.style.opacity = String(intensity);
}

function qtFire(direction) {
  if (!_qtState || _qtState.idx >= _qtState.deck.length) return;
  const pick = _qtState.deck[_qtState.idx];
  if (direction === 'left')  qtActionAdd(pick);
  if (direction === 'right') qtActionPass(pick);
  if (direction === 'down')  return qtActionRestack(pick);  // restack defers, doesn't advance idx by 1
  if (direction === 'up')    qtActionCrusade(pick);
  _qtState.idx += 1;
  qtUpdateOverlay(0, 0);
  qtRenderStack();
}

function qtActionAdd(pick) {
  setStatus(pick.itemId, 'queued', pick.tabId);
}
function qtActionPass(pick) {
  archiveItem(pick.tabId, pick.itemId, 'notInterested');
  // Clear chat-pass count so later suggestion engines see the archive signal cleanly
  try {
    const m = getPassesMap();
    delete m[`${pick.tabId}:${pick.itemId}`];
    lsSet(CHAT_PASSES_KEY, JSON.stringify(m));
  } catch {}
}
function qtActionRestack(pick) {
  // Move current card to the end of the deck without advancing idx counter
  // (the idx still points to the next card, which is now what was previously [idx+1]).
  _qtState.deck.splice(_qtState.idx, 1);
  _qtState.deck.push(pick);
  qtUpdateOverlay(0, 0);
  qtRenderStack();
}
function qtActionCrusade(pick) {
  setStatus(pick.itemId, 'queued', pick.tabId);
  // Promote priority on the catalog item so it floats to the top of the tab.
  const catItem = catalogs[pick.tabId] && catalogs[pick.tabId].items && catalogs[pick.tabId].items.find(it => it.id === pick.itemId);
  if (catItem) catItem.priority = 'high';
  // Trakt watchlist push (Phase 5 adds traktPushWatchlist; guard for ordering).
  if (typeof traktPushWatchlist === 'function' && isTraktConnected()) {
    traktPushWatchlist(pick.title, pick.year, pick.tabId).catch(() => {});
  }
}

// =====================================================================
// v7.4.0: Triage History — 2-round catch-up flow over all watched items.
// Replaces the previous wizard "Watched but untagged" (rate-recent) entry.
// Round 1: assign a rating (or Hall of Fame) per item.
// Round 2: confirm AI-predicted reaction tags from Claude Sonnet 4.6.
// Disagreed items get a manual pass at the end. All processed items are
// archived to the palate when the flow closes.
// =====================================================================
let _thState = null;

function openTriageHistory() {
  const pool = thBuildPool();
  if (!pool.length) {
    alert('No watched-and-untagged items to triage.');
    return;
  }
  _thState = {
    pool, round: 1, idx: 0,
    round1: [], predictions: {}, disagreed: [],
    currentCardTags: { positive: [], negative: [] },
  };
  document.getElementById('triage-title').textContent = 'Triage History — Rate';
  document.getElementById('triage-modal').showModal();
  thRender();
}

function thBuildPool() {
  const out = [];
  for (const tabId in catalogs) {
    if (tabId === 'watchlist' || tabId === 'auteur') continue;
    const cat = catalogs[tabId];
    if (!cat || !cat.items) continue;
    for (const item of cat.items) {
      if (getStatus(item.id, tabId) !== 'watched') continue;
      if (isArchived(tabId, item.id)) continue;
      out.push({ tabId, itemId: item.id, item, enrich: getEnrichmentForItem(item.id) });
    }
  }
  return out;
}

function thClose() {
  const dlg = document.getElementById('triage-modal');
  if (dlg && dlg.open) dlg.close();
  _thState = null;
  render();
}

function thRender() {
  if (!_thState) return;
  if (_thState.round === 1) return thRenderRound1();
  if (_thState.round === 'loading') return thRenderLoading();
  if (_thState.round === 2) return thRenderRound2();
  if (_thState.round === 'review') return thRenderDisagreed();
  if (_thState.round === 'done') return thRenderDone();
}

// ---- Round 1: rating cards -------------------------------------------------
function thRenderRound1() {
  const { pool, idx, round1 } = _thState;
  if (idx >= pool.length) return thCompleteRound1();
  const entry = pool[idx];
  const { item, enrich, tabId } = entry;
  const tabLabel = (catalogs[tabId] && catalogs[tabId].title) || tabId;
  const poster = enrich && enrich.posterPath
    ? `<img class="th-poster" src="https://image.tmdb.org/t/p/w300${enrich.posterPath}" alt="" />`
    : `<div class="th-poster th-poster--placeholder">${escapeHtml((item.title || '?')[0])}</div>`;
  const currentRating = getRating(item.id, tabId);
  const ratingBadge = currentRating !== 'none' ? `<span class="rating-badge ${currentRating}">${ratingLabel(currentRating)}</span>` : '';
  document.getElementById('triage-title').textContent = 'Triage History — Rate';
  document.getElementById('triage-progress').textContent = `${idx + 1} / ${pool.length}`;
  document.getElementById('triage-card').innerHTML = `
    <div class="th-card" id="th-card">
      ${poster}
      <h4 class="th-title">${escapeHtml(item.title)} <span class="th-year">${item.year || ''}</span></h4>
      <div class="th-meta"><span class="th-tab">${escapeHtml(tabLabel)}</span> ${ratingBadge}</div>
    </div>
  `;
  document.getElementById('triage-actions').innerHTML = `
    <button class="th-btn th-btn--hof"      data-r1="hof">⭐ Hall of Fame</button>
    <button class="th-btn th-btn--loved"    data-r1="loved">💚 Loved</button>
    <button class="th-btn th-btn--liked"    data-r1="liked">👍 Liked</button>
    <button class="th-btn th-btn--mixed"    data-r1="mixed">🤷 Mixed</button>
    <button class="th-btn th-btn--disliked" data-r1="disliked">👎 Disliked</button>
    <button class="th-btn th-btn--close"    data-r1="close">Cancel</button>
  `;
  document.querySelectorAll('#triage-actions [data-r1]').forEach(b =>
    b.addEventListener('click', () => thRound1Pick(b.dataset.r1)));
  // Swipe gestures on the card: up=HoF, left=Loved, down=Liked, right=Disliked
  thAttachSwipeMap(document.getElementById('th-card'), {
    up: () => thRound1Pick('hof'),
    left: () => thRound1Pick('loved'),
    down: () => thRound1Pick('liked'),
    right: () => thRound1Pick('disliked'),
  });
}

function thRound1Pick(pick) {
  if (!_thState || _thState.round !== 1) return;
  if (pick === 'close') return thClose();
  const entry = _thState.pool[_thState.idx];
  if (pick === 'hof') {
    _thState.round1.push({ tabId: entry.tabId, itemId: entry.itemId, rating: 'loved', isHoF: true });
  } else {
    _thState.round1.push({ tabId: entry.tabId, itemId: entry.itemId, rating: pick, isHoF: false });
  }
  _thState.idx += 1;
  thRender();
}

function thCompleteRound1() {
  // Batch-apply ratings + HoF
  for (const r of _thState.round1) {
    setRating(r.itemId, r.rating, r.tabId);
    if (r.isHoF && !getTags(r.itemId, r.tabId).includes('Hall of Fame')) {
      toggleTag(r.itemId, 'Hall of Fame', r.tabId);
    }
  }
  saveState();
  _thState.round = 'loading';
  _thState.idx = 0;
  thRender();
  // Fire prediction request without blocking the render; gracefully proceed to Round 2 on failure
  thFetchPredictions().then(() => {
    if (!_thState) return;
    _thState.round = 2;
    _thState.idx = 0;
    thRender();
  }).catch(e => {
    console.warn('[triage] predict-tags failed, continuing without predictions:', e);
    if (!_thState) return;
    _thState.round = 2;
    _thState.idx = 0;
    thRender();
  });
}

function thRenderLoading() {
  document.getElementById('triage-title').textContent = 'Triage History — Analyzing';
  document.getElementById('triage-progress').textContent = '';
  document.getElementById('triage-card').innerHTML = `
    <div class="th-loading">Analyzing your ratings to predict reaction tags…</div>
  `;
  document.getElementById('triage-actions').innerHTML = `
    <button class="th-btn th-btn--close" data-r1="close">Cancel</button>
  `;
  document.querySelectorAll('#triage-actions [data-r1]').forEach(b =>
    b.addEventListener('click', () => thRound1Pick(b.dataset.r1)));
}

async function thFetchPredictions() {
  // Build taste profile: top 10 items by loved-or-HoF rating across all tabs
  const profile = [];
  for (const tabId in state) {
    if (tabId === 'watchlist' || tabId === 'auteur') continue;
    const entries = state[tabId] || {};
    for (const id in entries) {
      const e = entries[id];
      const tags = e.reactionTags || [];
      const isHoF = tags.includes('Hall of Fame');
      if (e.rating === 'loved' || isHoF) {
        const cat = catalogs[tabId];
        const item = cat && cat.items && cat.items.find(it => it.id === id);
        profile.push({
          tabId, itemId: id,
          title: item ? item.title : id,
          year: item ? item.year : null,
          rating: e.rating, isHoF,
          tags,
        });
      }
    }
  }
  profile.sort((a, b) => (b.isHoF ? 1 : 0) - (a.isHoF ? 1 : 0));
  const topProfile = profile.slice(0, 10);

  // Build items payload — only items that just got rated in Round 1
  const items = _thState.round1.map(r => {
    const cat = catalogs[r.tabId];
    const item = cat && cat.items && cat.items.find(it => it.id === r.itemId);
    if (!item) return null;
    const set = getTagSetForItem(item, r.tabId);
    return {
      tabId: r.tabId, itemId: r.itemId,
      title: item.title, year: item.year,
      director: item.dir || null,
      contentType: resolveContentType(item, r.tabId),
      rating: r.rating, isHoF: r.isHoF,
      availableTags: [...set.positive, ...set.negative],
    };
  }).filter(Boolean);

  if (!isWebhookConfigured() || items.length === 0) {
    _thState.predictions = {};
    return;
  }
  try {
    const resp = await fetch(`${getWebhookUrl()}/palate/predict-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: getWebhookSecret(),
        tasteProfile: topProfile,
        items,
      }),
    });
    if (!resp.ok) {
      _thState.predictions = {};
      return;
    }
    const data = await resp.json();
    const out = {};
    for (const p of (data.predictions || [])) {
      out[`${p.tabId}:${p.itemId}`] = p;
    }
    _thState.predictions = out;
  } catch (e) {
    _thState.predictions = {};
  }
}

// ---- Round 2: tag confirmation -------------------------------------------------
function thRenderRound2() {
  const { pool, idx } = _thState;
  if (idx >= _thState.round1.length) return thCompleteRound2();
  const r1 = _thState.round1[idx];
  const entry = pool.find(p => p.tabId === r1.tabId && p.itemId === r1.itemId) || pool[idx];
  if (!entry) { _thState.idx += 1; return thRender(); }
  const { item, tabId } = entry;
  const set = getTagSetForItem(item, tabId);
  const pred = _thState.predictions[`${r1.tabId}:${r1.itemId}`];
  // Working tags split into positive / negative buckets based on the item's tag set
  const workingTags = (pred && pred.predictedTags) ? [...pred.predictedTags] : [];
  _thState.currentCardTags = {
    positive: workingTags.filter(t => set.positive.includes(t)),
    negative: workingTags.filter(t => set.negative.includes(t)),
  };
  thRedrawRound2Card();
}

function thRedrawRound2Card() {
  const { idx, currentCardTags } = _thState;
  const r1 = _thState.round1[idx];
  const cat = catalogs[r1.tabId];
  const item = cat && cat.items && cat.items.find(it => it.id === r1.itemId);
  if (!item) {
    _thState.idx += 1;
    return thRender();
  }
  const ratingLabelText = ratingLabel(r1.rating) + (r1.isHoF ? ' · Hall of Fame' : '');
  const pred = _thState.predictions[`${r1.tabId}:${r1.itemId}`];
  const confBadge = pred && pred.confidence ? `<span class="th-conf th-conf--${pred.confidence}">${pred.confidence}</span>` : '';
  const posList = currentCardTags.positive.map(t => `<span class="th-tag th-tag--pos">+ ${escapeHtml(t)}</span>`).join('');
  const negList = currentCardTags.negative.map(t => `<span class="th-tag th-tag--neg">− ${escapeHtml(t)}</span>`).join('');
  const empty = (currentCardTags.positive.length + currentCardTags.negative.length) === 0
    ? `<div class="th-empty">No tags predicted. Use ↑ / ↓ to add.</div>` : '';
  document.getElementById('triage-title').textContent = 'Triage History — Confirm tags';
  document.getElementById('triage-progress').textContent = `${idx + 1} / ${_thState.round1.length}`;
  document.getElementById('triage-card').innerHTML = `
    <div class="th-card" id="th-card">
      <h4 class="th-title">${escapeHtml(item.title)} <span class="th-year">${item.year || ''}</span></h4>
      <div class="th-meta"><span class="th-tab">${escapeHtml(ratingLabelText)}</span> ${confBadge}</div>
      <div class="th-tag-list">${posList}${negList}${empty}</div>
      <div class="th-hint">↑ edit positives · ↓ edit negatives</div>
    </div>
  `;
  document.getElementById('triage-actions').innerHTML = `
    <button class="th-btn th-btn--confirm"  data-r2="confirm">✓ Confirm</button>
    <button class="th-btn th-btn--disagree" data-r2="disagree">✗ Disagree</button>
    <button class="th-btn th-btn--edit-pos" data-r2="edit-pos">Edit + tags</button>
    <button class="th-btn th-btn--edit-neg" data-r2="edit-neg">Edit − tags</button>
    <button class="th-btn th-btn--close"    data-r2="close">Cancel</button>
  `;
  document.querySelectorAll('#triage-actions [data-r2]').forEach(b =>
    b.addEventListener('click', () => thRound2Action(b.dataset.r2)));
  thAttachSwipeMap(document.getElementById('th-card'), {
    left: () => thRound2Action('confirm'),
    right: () => thRound2Action('disagree'),
    up: () => thRound2Action('edit-pos'),
    down: () => thRound2Action('edit-neg'),
  });
}

function thRound2Action(action) {
  if (!_thState) return;
  if (action === 'close') return thClose();
  const r1 = _thState.round1[_thState.idx];
  if (action === 'confirm') {
    thApplyCurrentTags(r1);
    _thState.idx += 1;
    return thRender();
  }
  if (action === 'disagree') {
    _thState.disagreed.push({ tabId: r1.tabId, itemId: r1.itemId });
    _thState.idx += 1;
    return thRender();
  }
  if (action === 'edit-pos') return thOpenTagEdit('positive');
  if (action === 'edit-neg') return thOpenTagEdit('negative');
}

function thApplyCurrentTags(r1) {
  const all = [..._thState.currentCardTags.positive, ..._thState.currentCardTags.negative];
  const existing = getTags(r1.itemId, r1.tabId);
  // Add tags that aren't already present
  for (const t of all) {
    if (!existing.includes(t)) toggleTag(r1.itemId, t, r1.tabId);
  }
}

// Tag edit overlay (in-modal, replaces actions row temporarily)
function thOpenTagEdit(polarity) {
  if (!_thState) return;
  const r1 = _thState.round1[_thState.idx];
  const cat = catalogs[r1.tabId];
  const item = cat && cat.items && cat.items.find(it => it.id === r1.itemId);
  if (!item) return;
  const set = getTagSetForItem(item, r1.tabId);
  const list = polarity === 'positive' ? set.positive : set.negative;
  const selected = new Set(_thState.currentCardTags[polarity]);
  const renderChips = () => list.map(t => {
    const on = selected.has(t);
    return `<button class="th-chip ${on ? 'th-chip--on' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
  }).join('');
  document.getElementById('triage-title').textContent = `Edit ${polarity} tags`;
  document.getElementById('triage-progress').textContent = '';
  document.getElementById('triage-card').innerHTML = `
    <div class="th-chiplist">${renderChips()}</div>
  `;
  document.getElementById('triage-actions').innerHTML = `
    <button class="th-btn th-btn--confirm"  data-edit="ok">Done</button>
    <button class="th-btn th-btn--close"    data-edit="cancel">Cancel</button>
  `;
  document.querySelectorAll('.th-chip').forEach(c => c.addEventListener('click', (e) => {
    const t = c.dataset.tag;
    if (selected.has(t)) { selected.delete(t); c.classList.remove('th-chip--on'); }
    else { selected.add(t); c.classList.add('th-chip--on'); }
  }));
  document.querySelector('#triage-actions [data-edit="ok"]').addEventListener('click', () => {
    _thState.currentCardTags[polarity] = [...selected];
    thRedrawRound2Card();
  });
  document.querySelector('#triage-actions [data-edit="cancel"]').addEventListener('click', () => {
    thRedrawRound2Card();
  });
}

// ---- End of Round 2: disagreed review --------------------------------------
function thCompleteRound2() {
  if (_thState.disagreed.length > 0) {
    _thState.round = 'review';
    _thState.idx = 0;
    return thRender();
  }
  return thFinish();
}

function thRenderDisagreed() {
  const items = _thState.disagreed.map(d => {
    const cat = catalogs[d.tabId];
    const item = cat && cat.items && cat.items.find(it => it.id === d.itemId);
    return item ? { tabId: d.tabId, itemId: d.itemId, title: item.title, year: item.year } : null;
  }).filter(Boolean);
  document.getElementById('triage-title').textContent = 'Disagreed items';
  document.getElementById('triage-progress').textContent = `${items.length} flagged`;
  document.getElementById('triage-card').innerHTML = `
    <div class="th-disagreed">
      ${items.map((x, i) =>
        `<button class="th-d-row" data-d-idx="${i}">${escapeHtml(x.title)} <span class="th-d-year">${x.year || ''}</span></button>`
      ).join('')}
    </div>
  `;
  document.getElementById('triage-actions').innerHTML = `
    <button class="th-btn th-btn--confirm"  data-disagreed="done">Done — archive all</button>
    <button class="th-btn th-btn--close"    data-disagreed="close">Cancel</button>
  `;
  document.querySelectorAll('.th-d-row').forEach(row => row.addEventListener('click', () => {
    const i = parseInt(row.dataset.dIdx);
    const r1Idx = _thState.round1.findIndex(r => r.tabId === _thState.disagreed[i].tabId && r.itemId === _thState.disagreed[i].itemId);
    if (r1Idx < 0) return;
    // Re-enter Round 2 for this single item
    _thState.idx = r1Idx;
    _thState.round = 2;
    // Remove from disagreed so it doesn't come back
    _thState.disagreed.splice(i, 1);
    thRender();
  }));
  document.querySelector('#triage-actions [data-disagreed="done"]').addEventListener('click', thFinish);
  document.querySelector('#triage-actions [data-disagreed="close"]').addEventListener('click', thClose);
}

function thFinish() {
  // Archive every item that completed Round 1 (whether confirmed or disagreed-then-resolved)
  let count = 0;
  for (const r1 of _thState.round1) {
    archiveItem(r1.tabId, r1.itemId, 'finished');
    count += 1;
  }
  _thState.archivedCount = count;
  _thState.round = 'done';
  thRender();
}

function thRenderDone() {
  document.getElementById('triage-title').textContent = 'Triage History — Complete';
  document.getElementById('triage-progress').textContent = '';
  document.getElementById('triage-card').innerHTML = `
    <div class="th-summary">
      <div class="th-summary-num">${_thState.archivedCount || 0}</div>
      <div>items archived. Your palate has been updated.</div>
    </div>
  `;
  document.getElementById('triage-actions').innerHTML = `
    <button class="th-btn th-btn--confirm" data-done="close">Close</button>
  `;
  document.querySelector('#triage-actions [data-done="close"]').addEventListener('click', thClose);
}

// Shared swipe-direction helper used by both rounds. Reuses Pointer Events.
function thAttachSwipeMap(card, handlers) {
  if (!card) return;
  let sx = 0, sy = 0, dragging = false, dx = 0, dy = 0;
  const T = 70;
  card.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY; dragging = true; dx = 0; dy = 0;
    try { card.setPointerCapture(e.pointerId); } catch {}
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg)`;
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    try { card.releasePointerCapture(e.pointerId); } catch {}
    const horiz = Math.abs(dx) >= Math.abs(dy);
    if (horiz && dx <= -T && handlers.left) return handlers.left();
    if (horiz && dx >=  T && handlers.right) return handlers.right();
    if (!horiz && dy >=  T && handlers.down)  return handlers.down();
    if (!horiz && dy <= -T && handlers.up)    return handlers.up();
    card.style.transform = '';
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

async function sendChatMessage() {
  if (_chatPending) return;
  const input = document.getElementById('chat-input');
  const message = input ? input.value.trim() : '';
  if (!message) return;
  if (!isWebhookConfigured()) {
    appendChatMessage('assistant', 'The Worker URL + secret aren\'t configured yet. Open Settings → Plex Webhook Bridge first.');
    return;
  }
  input.value = '';
  appendChatMessage('user', message);
  _chatHistory.push({ role: 'user', content: message });
  const placeholder = appendChatMessage('assistant', 'Thinking…', { placeholder: true });
  _chatPending = true;
  try {
    const userHash = await getUserHash();
    if (!userHash) {
      if (placeholder) { placeholder.textContent = 'Need a Plex token to identify you (Settings → Plex Integration).'; placeholder.classList.remove('placeholder'); }
      return;
    }
    const candidates = buildChatCandidates();
    const resp = await fetch(`${getWebhookUrl()}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: getWebhookSecret(),
        userHash,
        message,
        history: _chatHistory.slice(-8),
        candidates,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      if (placeholder) { placeholder.textContent = `Error ${resp.status}: ${errText.slice(0, 200)}`; placeholder.classList.remove('placeholder'); }
      return;
    }
    const data = await resp.json();
    const reply = data.reply || '(empty response)';
    if (placeholder) { placeholder.textContent = reply; placeholder.classList.remove('placeholder'); }
    _chatHistory.push({ role: 'assistant', content: reply });
    if (data.pick && data.pick.tabId && data.pick.itemId) {
      appendWatchCard(data.pick);
    }
  } catch (e) {
    if (placeholder) { placeholder.textContent = `Network error: ${e.message}`; placeholder.classList.remove('placeholder'); }
  } finally {
    _chatPending = false;
  }
}

function openFindGapsModal() {
  document.getElementById('find-gaps-modal').showModal();
  renderFindGaps();
}

function renderFindGaps() {
  const summary = document.getElementById('find-gaps-summary');
  const list = document.getElementById('find-gaps-list');
  const result = findGaps(50);
  if (result.sourceCount === 0) {
    summary.textContent = 'No enriched sources yet. Pre-enrich your catalog first (Settings → Plex → Pre-enrich catalog), or watch and rate a few items so the engine has something to extrapolate from.';
    list.innerHTML = '';
    return;
  }
  if (result.candidates.length === 0) {
    summary.textContent = `Walked ${result.sourceCount} watched/rated items — no untapped recommendations remain. Either every TMDB suggestion is already in a catalog tab, or the cache hasn't been warmed for these items yet.`;
    list.innerHTML = '';
    return;
  }
  summary.textContent = `${result.candidates.length} of ${result.totalCandidates} gap candidate${result.totalCandidates === 1 ? '' : 's'} from ${result.sourceCount} watched/rated source${result.sourceCount === 1 ? '' : 's'}. Promote to add to a catalog tab; Skip removes from this list permanently.`;
  list.innerHTML = result.candidates.map(c => {
    const sources = c.sourceTitles.join(', ');
    const meta = `${c.year || '?'} · ${c.type === 'tv' ? 'TV' : 'Film'} · score ${c.score} · sources: ${sources}`;
    return `<div class="search-result" data-tmdb-id="${c.tmdbId}">
      <div class="search-result-title">${escapeHtml(c.title || '?')}</div>
      <div class="search-result-meta">${escapeHtml(meta)}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="action-btn" data-gap-action="promote" data-tmdb-id="${c.tmdbId}">Promote</button>
        <button class="action-btn" data-gap-action="skip" data-tmdb-id="${c.tmdbId}">Skip</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('button[data-gap-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tmdbId = parseInt(btn.dataset.tmdbId);
      const cand = result.candidates.find(x => x.tmdbId === tmdbId);
      if (!cand) return;
      if (btn.dataset.gapAction === 'skip') {
        addGapSkip(tmdbId);
        renderFindGaps();
      } else if (btn.dataset.gapAction === 'promote') {
        // Reuse the existing promote-modal/confirmPromote pipeline. Source
        // 'recommendation' triggers the "TMDB Recommendations (Promoted)"
        // section + pitch text in confirmPromote.
        pendingPromote = {
          type: cand.type === 'tv' ? 'tv' : 'movie',
          title: cand.title || '',
          year: cand.year || null,
          plays: 0,
          source: 'recommendation',
          sourceTitle: (cand.sourceTitles && cand.sourceTitles[0]) || 'an item you rated',
          tmdbId: cand.tmdbId,
        };
        document.getElementById('promote-info').textContent =
          `Promote "${pendingPromote.title}" (${pendingPromote.year || '?'}) to a CinéMath catalog tab. Suggested via Find Gaps from ${cand.sourceCount} item${cand.sourceCount === 1 ? '' : 's'} you've rated, including ${pendingPromote.sourceTitle}.`;
        const tvTabs = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);
        const select = document.getElementById('promote-tab');
        select.innerHTML = catalogManifest
          .filter(c => c.id !== 'watchlist' && c.id !== 'auteur')
          .filter(c => pendingPromote.type === 'movie' ? !tvTabs.has(c.id) : tvTabs.has(c.id))
          .map(c => `<option value="${c.id}">${c.label}</option>`).join('');
        document.getElementById('promote-modal').showModal();
      }
    });
  });
}

// =====================================================================
// Stage 5g: Wizard / guided-flow home screen
// =====================================================================

// Always start fresh on app open. State is in-memory only, never persisted.
const wizardState = {
  step: 'root',         // 'root' | 'rate' | 'film-tv' | 'session' | 'time' | 'genre' | 'mood' | 'recs' | 'continue-list'
  rateContext: null,    // 'specific-tab' | 'recent-watched' | 'queued' | 'unrated-loved'
  contentType: null,    // 'film' | 'tv'
  session: null,        // 'continue' | 'new' | 'rewatch'
  timeBudget: null,     // 'quick' | 'short' | 'standard' | 'long' | 'any' (V5.32.0)
  mood: null,           // 'smart' | 'comfort' | 'visceral' | 'cathartic' | 'light' | 'any' (V5.33.0)
  genre: null,          // tab id, or 'not-sure'
};

const WIZARD_TV_TABS = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);

function wizardShow() {
  document.getElementById('wizard').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  // Always reset state
  wizardState.step = 'root';
  wizardState.rateContext = null;
  wizardState.contentType = null;
  wizardState.session = null;
  wizardState.timeBudget = null;
  wizardState.mood = null;
  wizardState.genre = null;
  wizardRender();
}

function wizardHide() {
  document.getElementById('wizard').style.display = 'none';
  document.getElementById('app-shell').style.display = '';
  // V5.21.2: Seed focus on the active tab so D-pad nav has a starting point.
  // Without this, focus stays on the now-hidden wizard-browse button, falling
  // back to document.body — and the user can't navigate anywhere.
  setTimeout(() => {
    const activeTab = document.querySelector('.tab-btn.active') || document.querySelector('.tab-btn');
    if (activeTab && activeTab.offsetParent !== null) activeTab.focus();
  }, 50);
}

// v7.6.0: Wizard breadcrumb trail — renders navigation context above wizard steps.
// Called via the subtitle setter proxy in wizardRender(). Each non-root step
// shows tappable crumbs back to earlier steps.
function _wizardSetBreadcrumb(el, stepLabel) {
  if (!el) return;
  const crumbs = [{ label: 'Home', step: 'root' }];
  if (wizardState.step === 'root') {
    el.innerHTML = `<span class="wizard-crumb current">${stepLabel}</span>`;
    return;
  }
  if (wizardState.step === 'rate') {
    crumbs.push({ label: stepLabel, current: true });
  } else if (wizardState.step === 'time') {
    crumbs.push({ label: 'Watch', step: 'root' });
    crumbs.push({ label: stepLabel, current: true });
  } else if (wizardState.step === 'mood') {
    crumbs.push({ label: 'Watch', step: 'root' });
    crumbs.push({ label: TIME_BUDGETS[wizardState.timeBudget]?.label || 'Time', step: 'time' });
    crumbs.push({ label: stepLabel, current: true });
  } else if (wizardState.step === 'genre') {
    crumbs.push({ label: 'Watch', step: 'root' });
    crumbs.push({ label: TIME_BUDGETS[wizardState.timeBudget]?.label || 'Time', step: 'time' });
    crumbs.push({ label: MOOD_ARCHETYPES[wizardState.mood]?.label || 'Mood', step: 'mood' });
    crumbs.push({ label: stepLabel, current: true });
  } else if (wizardState.step === 'recs') {
    crumbs.push({ label: 'Watch', step: 'root' });
    crumbs.push({ label: TIME_BUDGETS[wizardState.timeBudget]?.label || 'Time', step: 'time' });
    crumbs.push({ label: MOOD_ARCHETYPES[wizardState.mood]?.label || 'Mood', step: 'mood' });
    crumbs.push({ label: wizardState.genre || 'Genre', step: 'genre' });
    crumbs.push({ label: 'Picks', current: true });
  } else if (wizardState.step === 'continue-list') {
    crumbs.push({ label: stepLabel, current: true });
  } else {
    crumbs.push({ label: stepLabel, current: true });
  }
  el.innerHTML = crumbs.map((c, i) => {
    const sep = i > 0 ? `<span class="wizard-crumb-sep" aria-hidden="true"> › </span>` : '';
    if (c.current || !c.step) {
      return `${sep}<span class="wizard-crumb current">${c.label}</span>`;
    }
    return `${sep}<button class="wizard-crumb" data-crumb-step="${c.step}">${c.label}</button>`;
  }).join('');
  el.querySelectorAll('.wizard-crumb[data-crumb-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      wizardState.step = btn.dataset.crumbStep;
      wizardRender();
    });
  });
}

function wizardRender() {
  const breadcrumbEl = document.getElementById('wizard-breadcrumb');
  const subtitle = { set textContent(v) { _wizardSetBreadcrumb(breadcrumbEl, v); } };
  const stepEl = document.getElementById('wizard-step');
  const backBtn = document.getElementById('wizard-back');
  stepEl.className = 'wizard-step';   // reset matrix class

  if (wizardState.step === 'root') {
    // V5.35.0: 3-option root. "Looking for something to watch" goes to the
    // new flow (time → mood → genre → side-by-side recs); "Continue" goes
    // straight to the in-progress list; "Rating" is unchanged.
    subtitle.textContent = 'What are you doing?';
    backBtn.style.display = 'none';
    stepEl.innerHTML = `
      <button class="wizard-btn" data-action="watch-chat">
        Tell me what to watch
        <span class="wizard-btn-meta">Talk to the bot — it picks one for you</span>
      </button>
      <button class="wizard-btn" data-action="watch-new">
        Looking for something to watch
        <span class="wizard-btn-meta">Time → mood → genre → picks</span>
      </button>
      <button class="wizard-btn" data-action="watch-continue">
        Continue something I'm watching
        <span class="wizard-btn-meta">Resume an item already in progress</span>
      </button>
      <button class="wizard-btn" data-action="rate">
        Rating
        <span class="wizard-btn-meta">Mark watched, apply ratings, add tags</span>
      </button>
      <button class="wizard-btn" data-action="quick-triage">
        Quick Triage
        <span class="wizard-btn-meta">Swipe through suggestions — decide fast</span>
      </button>
    `;
  }
  else if (wizardState.step === 'rate') {
    subtitle.textContent = 'Rate which?';
    backBtn.style.display = '';
    stepEl.innerHTML = `
      <button class="wizard-btn" data-action="rate-recent">
        Watched but untagged
        <span class="wizard-btn-meta">AI-assisted: rate, then confirm predicted tags, then archive</span>
      </button>
      <button class="wizard-btn" data-action="rate-queued">
        Things on my queue
        <span class="wizard-btn-meta">Items marked Queued — quick triage</span>
      </button>
      <button class="wizard-btn" data-action="rate-loved-untagged">
        Loved items missing tags
        <span class="wizard-btn-meta">Items rated Loved with no reaction tags applied</span>
      </button>
      <button class="wizard-btn" data-action="rate-tab">
        Pick a specific tab
        <span class="wizard-btn-meta">Browse one tab and rate from there</span>
      </button>
    `;
  }
  else if (wizardState.step === 'mood') {
    // V5.33.0: mood archetype step — 6 buckets, matrix-grid layout
    subtitle.textContent = 'What are you in the mood for?';
    backBtn.style.display = '';
    stepEl.className = 'wizard-step matrix';
    stepEl.innerHTML = Object.entries(MOOD_ARCHETYPES).map(([key, cfg]) =>
      `<button class="wizard-btn" data-action="mood-${key}">${cfg.label}<span class="wizard-btn-meta">${cfg.sub}</span></button>`
    ).join('');
  }
  else if (wizardState.step === 'time') {
    // V5.32.0: time budget step — 5 buckets, matrix-grid layout
    subtitle.textContent = 'How long do you have?';
    backBtn.style.display = '';
    stepEl.className = 'wizard-step matrix';
    const isTV = wizardState.contentType === 'tv';
    stepEl.innerHTML = Object.entries(TIME_BUDGETS).map(([key, cfg]) =>
      `<button class="wizard-btn" data-action="time-${key}">${cfg.label}<span class="wizard-btn-meta">${cfg.sub}${isTV && cfg.max !== Infinity ? ' / episode' : ''}</span></button>`
    ).join('');
  }
  else if (wizardState.step === 'film-tv') {
    subtitle.textContent = 'Film or TV?';
    backBtn.style.display = '';
    stepEl.innerHTML = `
      <button class="wizard-btn" data-action="film">Film</button>
      <button class="wizard-btn" data-action="tv">TV</button>
    `;
  }
  else if (wizardState.step === 'session') {
    subtitle.textContent = 'What kind of session?';
    backBtn.style.display = '';
    stepEl.innerHTML = `
      <button class="wizard-btn" data-action="continue">
        Continue something I've started
        <span class="wizard-btn-meta">Items marked Watching</span>
      </button>
      <button class="wizard-btn" data-action="new">
        Start something new
        <span class="wizard-btn-meta">Pick a genre and triage</span>
      </button>
      <button class="wizard-btn" data-action="rewatch">
        Rewatch an old favorite
        <span class="wizard-btn-meta">Watched + Loved items, rewatchable-tagged first</span>
      </button>
    `;
  }
  else if (wizardState.step === 'continue-list') {
    subtitle.textContent = 'Pick something to continue';
    backBtn.style.display = '';
    const items = wizardGatherContinueItems();
    if (items.length === 0) {
      stepEl.innerHTML = `
        <div class="wizard-empty">Nothing in progress. Try "Start something new" instead.</div>
      `;
    } else {
      stepEl.innerHTML = items.slice(0, 30).map(x => {
        const tabLabel = (catalogs[x.tab] && catalogs[x.tab].title) || x.tab;
        return `<button class="wizard-btn" data-action="goto-item" data-tab="${x.tab}" data-id="${x.item.id}">
          <div class="wizard-list-row">
            <span class="wizard-list-title">${escapeHtml(x.item.title)}</span>
            <span class="wizard-list-meta">${tabLabel}</span>
          </div>
        </button>`;
      }).join('');
    }
  }
  else if (wizardState.step === 'genre') {
    // V5.35.0: show genre families that bridge film + TV, not individual tabs.
    // Picking "Sci-Fi" includes both `scifi` and `scifi-tv` in the recs panel.
    subtitle.textContent = 'Pick a genre';
    backBtn.style.display = '';
    stepEl.className = 'wizard-step matrix';
    let html = GENRE_FAMILIES.map(f =>
      `<button class="wizard-btn" data-action="genre-pick" data-family="${f.id}">${escapeHtml(f.label)}</button>`
    ).join('');
    html += `<button class="wizard-btn" data-action="genre-pick" data-family="not-sure">Not Sure</button>`;
    stepEl.innerHTML = html;
  }
  else if (wizardState.step === 'recs') {
    // V5.35.0: side-by-side recs panel — Films left column, TV right column.
    // Both are filtered by time + mood, then computed via the genre family's
    // film tabs and TV tabs separately.
    subtitle.textContent = 'What looks good?';
    backBtn.style.display = '';
    stepEl.className = 'wizard-step';
    const opts = { timeBudget: wizardState.timeBudget, mood: wizardState.mood };
    let filmTabs, tvTabs, label;
    if (!wizardState.genre || wizardState.genre === 'not-sure') {
      filmTabs = Object.keys(catalogs).filter(t => t !== 'watchlist' && !WIZARD_TV_TABS.has(t));
      tvTabs = Object.keys(catalogs).filter(t => t !== 'watchlist' && WIZARD_TV_TABS.has(t));
      label = 'all genres';
    } else {
      const family = GENRE_FAMILIES.find(f => f.id === wizardState.genre);
      filmTabs = family ? familyFilmTabs(family) : [];
      tvTabs = family ? familyTvTabs(family) : [];
      label = family ? family.label : wizardState.genre;
    }
    const filmRecs = filmTabs.length > 0 ? computeRecsForTab(filmTabs, opts) : null;
    const tvRecs   = tvTabs.length   > 0 ? computeRecsForTab(tvTabs,   opts) : null;
    const renderRecsCol = (recs, kindLabel) => {
      if (!recs) return `<div class="wizard-recs-empty">No ${kindLabel} catalogs in this family.</div>`;
      if (recs.sourceCount === 0) return `<div class="wizard-recs-empty">No Loved/Liked ${kindLabel} yet — rate some first.</div>`;
      if (!recs.anyEnriched) return `<div class="wizard-recs-empty">${kindLabel}: no TMDB enrichment yet. Run Pre-enrich.</div>`;
      if (recs.recommended.length === 0 && recs.discover.length === 0) return `<div class="wizard-recs-empty">No ${kindLabel} matched time + mood.</div>`;
      let h = '';
      if (recs.recommended.length > 0) {
        h += `<div class="wizard-recs-heading">Recommended · ${recs.recommended.length}</div>`;
        h += recs.recommended.map(r => {
          const yearStr = r.year ? ` (${r.year})` : '';
          const sources = r.sourceTitles.slice(0, 2).join(', ');
          const tkey = getTrailerKey(r.catalogItemId);
          const trailerBtn = tkey
            ? `<a class="trailer-btn" href="${trailerYouTubeUrl(tkey)}" target="_blank" rel="noopener" aria-label="Watch trailer">▶</a>`
            : '';
          return `<div class="wizard-rec-row">
            <button class="wizard-btn" data-action="recs-goto" data-tab="${escapeHtml(r.catalogTab)}" data-id="${escapeHtml(r.catalogItemId)}">
              ${escapeHtml(r.title)}${yearStr}
              <span class="wizard-btn-meta">like ${escapeHtml(sources)}</span>
            </button>
            ${trailerBtn}
          </div>`;
        }).join('');
      }
      if (recs.discover.length > 0) {
        h += `<div class="wizard-recs-heading">Discover · ${recs.discover.length}</div>`;
        h += recs.discover.map(r => {
          const yearStr = r.year ? ` (${r.year})` : '';
          const sources = r.sourceTitles.slice(0, 2).join(', ');
          return `<button class="wizard-btn" data-action="recs-promote" data-tmdb-id="${r.tmdbId}" data-type="${escapeHtml(r.type || 'movie')}" data-title="${escapeHtml(r.title || '')}" data-year="${r.year || ''}" data-source="${escapeHtml(r.sourceTitles[0] || '')}">
            ${escapeHtml(r.title || 'Unknown')}${yearStr}
            <span class="wizard-btn-meta">like ${escapeHtml(sources)}</span>
          </button>`;
        }).join('');
      }
      return h;
    };
    let html = `
      <div class="wizard-recs-context">${escapeHtml(label)} · ${escapeHtml(TIME_BUDGETS[wizardState.timeBudget]?.label || 'any time')} · ${escapeHtml(MOOD_ARCHETYPES[wizardState.mood]?.label || 'any mood')}</div>
      <div class="wizard-recs-split">
        <div class="wizard-recs-col">
          <div class="wizard-recs-coltitle">Films</div>
          ${renderRecsCol(filmRecs, 'films')}
        </div>
        <div class="wizard-recs-col">
          <div class="wizard-recs-coltitle">TV</div>
          ${renderRecsCol(tvRecs, 'TV')}
        </div>
      </div>
    `;
    stepEl.innerHTML = html;
  }

  // Wire all buttons
  stepEl.querySelectorAll('.wizard-btn').forEach(btn => {
    btn.addEventListener('click', () => wizardHandleAction(btn));
  });
  // V5.35.0: focus the first button so D-pad navigation stays alive after
  // each step transition. Without this, focus falls back to <body> and TV
  // users have no D-pad target.
  requestAnimationFrame(() => {
    const first = stepEl.querySelector('.wizard-btn');
    if (first) first.focus();
  });
}

function wizardGoBack() {
  if (wizardState.step === 'root') return;
  if (wizardState.step === 'rate') wizardState.step = 'root';
  else if (wizardState.step === 'film-tv') wizardState.step = 'root';
  else if (wizardState.step === 'session') wizardState.step = 'film-tv';
  else if (wizardState.step === 'continue-list') wizardState.step = 'root';
  // V5.35.0: new path goes time → mood → genre → recs (was time → genre → mood → recs)
  else if (wizardState.step === 'time') wizardState.step = 'root';
  else if (wizardState.step === 'mood') wizardState.step = 'time';
  else if (wizardState.step === 'genre') wizardState.step = 'mood';
  else if (wizardState.step === 'recs') wizardState.step = 'genre';
  wizardRender();
}

function wizardHandleAction(btn) {
  const action = btn.dataset.action;
  // Root step
  if (action === 'rate') { wizardState.step = 'rate'; wizardRender(); return; }
  if (action === 'watch') { wizardState.step = 'film-tv'; wizardRender(); return; }
  // Rate substep — goes straight into triage with appropriate filter
  // v7.4.0: rate-recent is now the AI-augmented 2-round Triage History flow.
  if (action === 'rate-recent') { wizardHide(); openTriageHistory(); return; }
  if (action === 'rate-queued') { wizardLaunchTriage('rate-queued'); return; }
  if (action === 'rate-loved-untagged') { wizardLaunchTriage('rate-loved-untagged'); return; }
  if (action === 'rate-tab') {
    // Open browse mode at the user's last tab — they pick from there
    wizardHide();
    return;
  }
  // V5.35.0: New top-level paths. 'watch' → time → mood → genre → side-by-side
  // recs (no film/TV pick — recs panel shows both). 'continue' goes straight
  // to the in-progress list. Old film-tv / session steps are kept for any
  // legacy callers but aren't reachable from the new root.
  if (action === 'watch-new') { wizardState.session = 'new'; wizardState.step = 'time'; wizardRender(); return; }
  if (action === 'watch-continue') { wizardState.session = 'continue'; wizardState.step = 'continue-list'; wizardRender(); return; }
  if (action === 'watch-chat') { wizardHide(); openChatModal(); return; }
  // v7.3.0: Quick Triage — Tinder-style swipe over chat candidates.
  if (action === 'quick-triage') { wizardHide(); openQuickTriage(); return; }
  // Legacy compat (old buttons, internal links)
  if (action === 'film') { wizardState.contentType = 'film'; wizardState.step = 'session'; wizardRender(); return; }
  if (action === 'tv') { wizardState.contentType = 'tv'; wizardState.step = 'session'; wizardRender(); return; }
  if (action === 'continue') { wizardState.session = 'continue'; wizardState.step = 'continue-list'; wizardRender(); return; }
  if (action === 'new') { wizardState.session = 'new'; wizardState.step = 'time'; wizardRender(); return; }
  if (action === 'rewatch') { wizardState.session = 'rewatch'; wizardState.step = 'time'; wizardRender(); return; }
  // Time budget step → mood (V5.35.0: was → genre, now mood is between)
  if (action && action.startsWith('time-')) {
    const budget = action.slice('time-'.length);
    if (TIME_BUDGETS[budget]) {
      wizardState.timeBudget = budget;
      wizardState.step = 'mood';
      wizardRender();
    }
    return;
  }
  // Continue list — go to specific item
  if (action === 'goto-item') {
    wizardHide();
    switchTab(btn.dataset.tab);
    setTimeout(() => {
      const target = document.querySelector(`.item[data-id="${btn.dataset.id}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('expanded');
        target.style.outline = '2px solid var(--accent)';
        setTimeout(() => target.style.outline = '', 1500);
      }
    }, 100);
    return;
  }
  // V5.35.0: Mood pick → genre (was → recs/triage)
  if (action && action.startsWith('mood-')) {
    const mood = action.slice('mood-'.length);
    if (MOOD_ARCHETYPES[mood]) {
      wizardState.mood = mood;
      wizardState.step = 'genre';
      wizardRender();
    }
    return;
  }
  // V5.35.0: Genre pick → recs (side-by-side films + TV)
  if (action === 'genre-pick') {
    wizardState.genre = btn.dataset.family || btn.dataset.tab;
    wizardState.step = 'recs';
    wizardRender();
    return;
  }
  // Recs step → jump to a catalog item the user already has
  if (action === 'recs-goto') {
    wizardHide();
    switchTab(btn.dataset.tab);
    setTimeout(() => {
      const target = document.querySelector(`.item[data-id="${btn.dataset.id}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('expanded');
        target.style.outline = '2px solid var(--accent)';
        setTimeout(() => target.style.outline = '', 1500);
      }
    }, 100);
    return;
  }
  // Recs step → promote a TMDB orphan into the catalog
  if (action === 'recs-promote') {
    pendingPromote = {
      type: btn.dataset.type === 'tv' ? 'tv' : 'movie',
      title: btn.dataset.title,
      year: btn.dataset.year || null,
      plays: 0,
      distinct: 0,
      source: 'recommendation',
      sourceTitle: btn.dataset.source || '',
      tmdbId: btn.dataset.tmdbId || null,
    };
    document.getElementById('promote-info').textContent =
      `Promote "${pendingPromote.title}" (${pendingPromote.year || '?'}) into a CinéMath catalog tab. Recommended by your rating of "${pendingPromote.sourceTitle}".`;
    const tvTabs = new Set(['comedy-tv','crime-tv','spy-tv','drama-tv','horror-tv','fantasy-tv','scifi-tv','cons-courtroom-tv','british-comedy','heroes-comics-tv']);
    const select = document.getElementById('promote-tab');
    select.innerHTML = catalogManifest
      .filter(c => !c.virtual)
      .filter(c => pendingPromote.type === 'movie' ? !tvTabs.has(c.id) : tvTabs.has(c.id))
      .map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    if (wizardState.genre && wizardState.genre !== 'not-sure' && catalogs[wizardState.genre]) {
      select.value = wizardState.genre;
    }
    document.getElementById('promote-modal').showModal();
    return;
  }
  // Recs step → "Browse all unrated items" fallback to existing triage flow
  if (action === 'recs-fallback') {
    wizardLaunchTriage('watch');
    return;
  }
}

// Gather items based on continue session: status === 'watching' for chosen content type
function wizardGatherContinueItems() {
  const isTV = wizardState.contentType === 'tv';
  const result = [];
  Object.keys(catalogs).forEach(tabId => {
    if (tabId === 'watchlist') return;
    const isTvTab = WIZARD_TV_TABS.has(tabId);
    if (isTV && !isTvTab) return;
    if (!isTV && isTvTab) return;
    const cat = catalogs[tabId];
    cat.items.forEach(item => {
      if (getStatus(item.id, tabId) === 'watching') {
        result.push({ tab: tabId, item, lastUpdated: getLastUpdated(item.id, tabId) });
      }
    });
  });
  result.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  return result;
}

// Launch triage with the wizard's scope applied
function wizardLaunchTriage(mode) {
  let queue = [];
  let title = 'Triage';

  if (mode === 'rate-recent') {
    // V5.24.0: filter changed from "watched AND no rating" to "watched AND
    // no reaction tags" — covers rated-but-untagged items too. The rate+tag
    // triage modal handles both rating and tagging in a progressive flow.
    title = 'Rate & tag watched items';
    Object.keys(catalogs).forEach(tabId => {
      if (tabId === 'watchlist') return;
      const cat = catalogs[tabId];
      cat.items.forEach(item => {
        if (getStatus(item.id, tabId) !== 'watched') return;
        const tags = getTags(item.id, tabId);
        if (tags && tags.length > 0) return;
        const enriched = { ...item, _watchlist_source_tab: tabId, _watchlist_source_label: cat.title || tabId, _watchlist_lastUpdated: getLastUpdated(item.id, tabId) };
        queue.push(enriched);
      });
    });
    queue.sort((a, b) => (b._watchlist_lastUpdated || 0) - (a._watchlist_lastUpdated || 0));
  }
  else if (mode === 'rate-queued') {
    title = 'Triage your queue';
    Object.keys(catalogs).forEach(tabId => {
      if (tabId === 'watchlist') return;
      const cat = catalogs[tabId];
      cat.items.forEach(item => {
        if (getStatus(item.id, tabId) === 'queued') {
          const enriched = { ...item, _watchlist_source_tab: tabId, _watchlist_source_label: cat.title || tabId, _watchlist_lastUpdated: getLastUpdated(item.id, tabId) };
          queue.push(enriched);
        }
      });
    });
  }
  else if (mode === 'rate-loved-untagged') {
    title = 'Tag your loved items';
    Object.keys(catalogs).forEach(tabId => {
      if (tabId === 'watchlist') return;
      const cat = catalogs[tabId];
      cat.items.forEach(item => {
        if (getRating(item.id, tabId) === 'loved') {
          const tags = getTags(item.id, tabId);
          if (!tags || tags.length === 0) {
            const enriched = { ...item, _watchlist_source_tab: tabId, _watchlist_source_label: cat.title || tabId };
            queue.push(enriched);
          }
        }
      });
    });
  }
  else if (mode === 'watch') {
    // Filter by content type AND session AND genre
    const isTV = wizardState.contentType === 'tv';
    const session = wizardState.session;
    const genre = wizardState.genre;
    const tabsToInclude = (genre === 'not-sure' || !genre)
      ? Object.keys(catalogs).filter(t => t !== 'watchlist' && WIZARD_TV_TABS.has(t) === isTV)
      : [genre];

    if (session === 'new') title = 'Find something new to watch';
    else if (session === 'rewatch') title = 'Pick something to rewatch';

    // V5.32.0: filter by time budget; V5.33.0: filter and sort by mood overlap
    const budget = wizardState.timeBudget;
    const mood = wizardState.mood;
    tabsToInclude.forEach(tabId => {
      const cat = catalogs[tabId];
      if (!cat) return;
      cat.items.forEach(item => {
        const s = getStatus(item.id, tabId);
        const r = getRating(item.id, tabId);
        let include = false;
        if (session === 'new') {
          include = (s === 'none' || s === 'queued');
        } else if (session === 'rewatch') {
          // C with fallback to A: rewatchable-tagged first, then loved/liked watched
          include = s === 'watched' && (r === 'loved' || r === 'liked');
        }
        if (include && !fitsTimeBudget(item, budget)) include = false;
        if (include) {
          const enriched = { ...item, _watchlist_source_tab: tabId, _watchlist_source_label: cat.title || tabId };
          enriched._moodScore = moodScore(item, tabId, mood);
          queue.push(enriched);
        }
      });
    });
    // V5.33.0: sort the queue by mood overlap (descending) when mood is set.
    // Items with zero overlap stay in the queue but rank below mood-matched items.
    if (mood && mood !== 'any') {
      queue.sort((a, b) => (b._moodScore || 0) - (a._moodScore || 0));
    }

    // For rewatch: sort items with rewatchable-style tags first
    if (session === 'rewatch') {
      const REWATCHABLE_TAGS = new Set(['Endlessly rewatchable','Rewatchable','Cult magnetism']);
      queue.sort((a, b) => {
        const aTags = getTags(a.id, a._watchlist_source_tab) || [];
        const bTags = getTags(b.id, b._watchlist_source_tab) || [];
        const aRew = aTags.some(t => REWATCHABLE_TAGS.has(t)) ? 0 : 1;
        const bRew = bTags.some(t => REWATCHABLE_TAGS.has(t)) ? 0 : 1;
        if (aRew !== bRew) return aRew - bRew;
        // Then loved before liked
        const aR = getRating(a.id, a._watchlist_source_tab);
        const bR = getRating(b.id, b._watchlist_source_tab);
        return (aR === 'loved' ? 0 : 1) - (bR === 'loved' ? 0 : 1);
      });
    }
  }

  if (queue.length === 0) {
    alert('No items match. Try a different selection.');
    return;
  }

  // Shuffle for "new" / "not-sure" — feels more like discovery
  if (mode === 'watch' && (wizardState.session === 'new' || wizardState.genre === 'not-sure')) {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }

  // V5.24.0: Tag the requested mode so the triage modal can render the
  // appropriate UI (rate+tag vs queue vs suggest). The actual triageState.mode
  // stays 'wizard' for the existing back-button / close-modal flow.
  // Hide wizard, show app shell, launch triage
  wizardHide();
  triageState = { mode: 'wizard', requestMode: mode, queue, idx: 0 };
  document.getElementById('triage-title').textContent = title;
  document.getElementById('triage-modal').showModal();
  renderTriage();
}

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
  document.getElementById('triage-modal').showModal();
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
      document.getElementById('triage-modal').close();
      const wasWizard = triageState && triageState.mode === 'wizard';
      triageState = null;
      if (wasWizard) {
        wizardShow();
      } else {
        render();
      }
    });
    return;
  }
  const item = queue[idx];
  const sourceTab = item._watchlist_source_tab;

  // V5.24.0: rate-recent and rate-loved-untagged use a progressive rate→tag UI
  // designed for TV remote use. Rating mode kicks in if the item is unrated
  // (or after Back-to-rating); tag mode appears once a rating is set.
  if (triageState && (triageState.requestMode === 'rate-recent' || triageState.requestMode === 'rate-loved-untagged')) {
    return renderRateTagTriage(item, sourceTab);
  }

  const titleEl = document.getElementById('triage-title');
  titleEl.textContent = mode === 'queue' ? 'Triage your queue' : 'Triage suggested items';
  document.getElementById('triage-progress').textContent = `${idx + 1} / ${queue.length}`;

  const meta = [item.year, item.dir, item.country, item.runtime].filter(Boolean).map(escapeHtml).join(' · ');
  const why = item.whyPriority ? `<div class="why">${escapeHtml(item.whyPriority)}</div>` : '';
  document.getElementById('triage-card').innerHTML = `
    <span class="source-badge">${escapeHtml(item._watchlist_source_label || '')}</span>
    ${item.priority ? `<span class="priority-badge ${escapeHtml(item.priority)}" style="margin-left:6px">${priorityLabel(item.priority)}</span>` : ''}
    <h4>${escapeHtml(item.title)}</h4>
    <div class="meta">${meta}</div>
    ${why}
    <p>${escapeHtml(item.pitch || '')}</p>
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
// V5.26.0: 3-step progressive triage modal for TV remote.
// Step 1 (rate): four large rating buttons. Tap one → auto-advances to step 2.
// Step 2 (positive): positive tag chips only. Continue → step 3.
// Step 3 (critical): critical tag chips only. Save & Next → next item.
// Each step also has Skip / Back / Close. State stored in triageState.step.
function renderRateTagTriage(item, sourceTab) {
  const requestMode = triageState.requestMode;
  // V5.26.4: Persistent item-title header. Title + year + source badge live
  // in the FIXED header area (h3, above the scrollable card body) so they
  // remain visible across step transitions. Mode label right-justified;
  // progress count beneath it. Item title now never scrolls out of view.
  const modeLabel = requestMode === 'rate-loved-untagged'
    ? 'Tag your loved items'
    : 'Rate &amp; tag watched items';
  document.getElementById('triage-title').innerHTML = `
    <div class="triage-header-item">
      <span class="source-badge">${escapeHtml(item._watchlist_source_label || '')}</span>
      <span class="triage-item-title">${escapeHtml(item.title)}${item.year ? ` <span class="triage-year">(${item.year})</span>` : ''}</span>
    </div>
    <div class="triage-header-mode">${modeLabel}</div>
  `;
  document.getElementById('triage-progress').textContent = `${triageState.idx + 1} of ${triageState.queue.length}`;

  // Resolve current step. If unset (new item), default based on existing data:
  //   no rating → step 1 (rate); has rating → step 2 (positive tags).
  if (!triageState.step) {
    const r = getRating(item.id, sourceTab);
    triageState.step = (r && r !== 'none') ? 2 : 1;
  }
  const step = triageState.step;

  const currentRating = getRating(item.id, sourceTab);
  const currentTags = getTags(item.id, sourceTab);
  const tagSet = getTagSetForItem(item, sourceTab) || { positive: [], negative: [] };
  const positive = tagSet.positive || [];
  const negative = tagSet.negative || [];

  // V5.26.4: Item title moved to fixed header (h3). Card body now holds only
  // the step indicator + the step's interactive UI. Item title is always
  // visible regardless of step, scrolling, or back/forward navigation.
  let cardHtml = `
    <div class="triage-step-indicator">Step ${step} of 3 · ${step === 1 ? 'Rating' : (step === 2 ? 'Positive tags' : 'Critical tags')}</div>
  `;

  if (step === 1) {
    cardHtml += `
      <div class="triage-rate-step">
        <h5>How did you like it?</h5>
        <div class="triage-rate-buttons">
          <button class="triage-rate-btn rating-loved" data-rate="loved" data-shortcut="1">♥ Loved</button>
          <button class="triage-rate-btn rating-liked" data-rate="liked" data-shortcut="2">▲ Liked</button>
          <button class="triage-rate-btn rating-mixed" data-rate="mixed" data-shortcut="3">◐ Mixed</button>
          <button class="triage-rate-btn rating-disliked" data-rate="disliked" data-shortcut="4">▽ Disliked</button>
        </div>
      </div>
    `;
  } else if (step === 2) {
    cardHtml += `
      <div class="triage-tag-step">
        <h5>What was good? <span class="step-meta">Rated ${ratingLabel(currentRating)}</span></h5>
        ${positive.length
          ? `<div class="triage-tag-row">${positive.map(t => `<button class="triage-tag-btn pos${currentTags.includes(t) ? ' active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>`
          : `<p class="triage-step-empty">No positive tags defined for this content type. Skip ahead.</p>`}
      </div>
    `;
  } else if (step === 3) {
    cardHtml += `
      <div class="triage-tag-step">
        <h5>What didn't work? <span class="step-meta">Rated ${ratingLabel(currentRating)}</span></h5>
        ${negative.length
          ? `<div class="triage-tag-row">${negative.map(t => `<button class="triage-tag-btn neg${currentTags.includes(t) ? ' active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>`
          : `<p class="triage-step-empty">No critical tags defined for this content type. Save & Next to finish.</p>`}
      </div>
    `;
  }

  document.getElementById('triage-card').innerHTML = cardHtml;

  // Action buttons per step
  let actionsHtml = '';
  if (step === 1) {
    actionsHtml = `
      <button class="action-btn" data-act="rate-skip">Skip item</button>
      <button class="action-btn" data-act="rate-close">Close</button>
    `;
  } else if (step === 2) {
    actionsHtml = `
      <button class="action-btn primary" data-act="step2-next">Continue →</button>
      <button class="action-btn" data-act="step2-skip">Skip tagging</button>
      <button class="action-btn" data-act="step2-back">← Back to rating</button>
      <button class="action-btn" data-act="rate-close">Close</button>
    `;
  } else if (step === 3) {
    actionsHtml = `
      <button class="action-btn primary" data-act="step3-save">Save &amp; Next ✓</button>
      <button class="action-btn" data-act="step3-skip">Skip critical</button>
      <button class="action-btn" data-act="step3-back">← Back to positive</button>
      <button class="action-btn" data-act="rate-close">Close</button>
    `;
  }
  document.getElementById('triage-actions').innerHTML = actionsHtml;

  // Wire interactive elements
  if (step === 1) {
    document.querySelectorAll('.triage-rate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setRating(item.id, btn.dataset.rate, sourceTab);
        triageState.step = 2;
        renderRateTagTriage(item, sourceTab);
      });
    });
  } else {
    document.querySelectorAll('.triage-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // V5.26.5: Capture which tag was clicked so we can refocus it after
        // re-render. Without this, focus escapes the tag row when innerHTML
        // is replaced — the focus trap then redirects to the first
        // .modal-actions button, booting the user out of the tag step.
        const clickedTag = btn.dataset.tag;
        toggleTag(item.id, clickedTag, sourceTab);
        renderRateTagTriage(item, sourceTab); // refresh active states
        // Re-find the same tag in the freshly-rendered DOM and focus it
        const refocus = document.querySelector(`.triage-tag-btn[data-tag="${CSS.escape(clickedTag)}"]`);
        if (refocus) refocus.focus();
      });
    });
  }

  document.querySelectorAll('#triage-actions .action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'rate-skip') {
        // Skip item entirely without rating
        triageState.idx++;
        triageState.step = null; // reset for next item
        renderTriage();
      } else if (act === 'step2-next') {
        triageState.step = 3;
        renderRateTagTriage(item, sourceTab);
      } else if (act === 'step2-skip' || act === 'step3-save' || act === 'step3-skip') {
        // Save what's there, advance to next item
        triageState.idx++;
        triageState.step = null;
        renderTriage();
      } else if (act === 'step2-back') {
        // Clear rating to return to step 1
        if (state[sourceTab] && state[sourceTab][item.id]) {
          delete state[sourceTab][item.id].rating;
          saveState();
        }
        triageState.step = 1;
        renderRateTagTriage(item, sourceTab);
      } else if (act === 'step3-back') {
        triageState.step = 2;
        renderRateTagTriage(item, sourceTab);
      } else if (act === 'rate-close') {
        document.getElementById('triage-modal').close();
        triageState = null;
        render();
      }
    });
  });
}

function triageAction(act) {
  if (!triageState) return;
  const item = triageState.queue[triageState.idx];
  const tab = item._watchlist_source_tab;
  // V5.21.0: "Start watching" routes through the Watch sub-modal so the user
  // can pick a platform (Plex first if owned, then their subs, then others).
  // The Watch modal handles setStatus + advancing triageState.idx.
  if (act === 'watching') {
    openWatchModal(item, tab);
    return;
  }
  if (act === 'keep' || act === 'next') {
    // No state change
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
  // V5.22.0: Apply ?config=BASE64 URL parameter (cross-device pairing) BEFORE
  // any other init runs. If a config is found, applyConfigFromUrl() writes it
  // to localStorage and reloads — we early-return so init doesn't continue
  // with stale config (the reload will run init fresh).
  if (applyConfigFromUrl()) return;

  await loadCatalogManifest();
  // v6.0.0: hydrate the in-memory KV cache from IndexedDB before any
  // synchronous lsGet runs. Includes the one-shot pre-v6 migration that
  // copies any watchtrack-* / scifi-tracker-* keys still living in
  // localStorage into IDB. After this returns, every persisted key is
  // available synchronously via lsGet/lsSet/lsDel.
  await hydrate();
  loadActiveTab();
  // Legacy v5.41 'state-snapshot' fallback: if the cache somehow lacks
  // STORAGE_KEY but the v5.41 mirror snapshot exists, replay it.
  await idbRestoreIfNeeded();
  loadState();
  // v7.1.0: hydrate archived palate IDs (cached + background refresh).
  // Does not block init — render() will mask archived items once the Set is populated.
  loadArchivedIds();
  // V5.28.0: pull remote sync state before catalogs load. If remote has newer
  // settings/state than our last-push timestamp, applies them silently.
  // syncOnLaunch() short-circuits if Plex/Worker aren't configured.
  await syncOnLaunch();
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
  enableSwipeCollapse(); // v7.6.0: comment out to disable swipe-to-collapse
  buildCategoryFilters();
  buildFilters();
  buildTagPills();
  render();

  // Wizard wiring (Stage 5g)
  document.getElementById('wizard-back').addEventListener('click', wizardGoBack);
  document.getElementById('wizard-browse').addEventListener('click', wizardHide);
  document.getElementById('home-btn').addEventListener('click', wizardShow);
  // Show wizard always at app start (per "always start fresh")
  wizardShow();

  // v5.37.0 B2: manifest shortcuts route via ?action=. Long-pressing the
  // home-screen icon on Android lands here with the action pre-set.
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action) {
    setTimeout(() => {
      if (action === 'triage-queue') startTriage('queue');
      else if (action === 'triage-suggest') startTriage('suggest');
      else if (action === 'search') document.getElementById('search-btn').click();
      else if (action === 'stats') document.getElementById('stats-btn').click();
    }, 80);
  }

  // If Plex is already configured, fetch the library in the background
  if (isPlexConfigured()) {
    fetchPlexLibrary();
  }
  // If webhook bridge is configured, poll for events on startup
  if (isWebhookConfigured()) {
    pollPlexWebhookEvents();
    // v5.39.0: bootstrap alerts check
    if (isAlertsEnabled()) {
      setTimeout(() => alertsCheckNotifications(), 1500);
    }
  }

  // v5.37.0 B5: Page Visibility — when the app comes back from being
  // hidden (tab switch on phone, app-switch on Bravia), trigger a
  // catch-up Plex poll so any scrobbles that landed while we were away
  // surface immediately. Plex polling is one-shot (called on startup +
  // on settings save), so this is the natural moment for a refresh.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isWebhookConfigured()) {
      pollPlexWebhookEvents();
      // v5.39.0: catch-up alert poll on visibility — surfaces any
      // streaming-leaving notifications that the cron has queued while
      // the app was backgrounded.
      if (typeof alertsCheckNotifications === 'function') alertsCheckNotifications();
    }
  });

  // v5.37.0 B7: Wake Lock during triage. Triage is a focused review flow
  // that can run several minutes on the Bravia; without a wake lock the
  // screen dims mid-session. Acquired when triage-modal becomes active,
  // released when it closes. MutationObserver on the class attribute is
  // mode-agnostic and catches every entry/exit path — wizard triage,
  // direct triage, completion close, all use the same .active toggle.
  let _triageWakeLock = null;
  const triageModalEl = document.getElementById('triage-modal');
  if (triageModalEl && 'wakeLock' in navigator) {
    new MutationObserver(async () => {
      const isActive = triageModalEl.hasAttribute('open');
      if (isActive && !_triageWakeLock) {
        try {
          _triageWakeLock = await navigator.wakeLock.request('screen');
          _triageWakeLock.addEventListener('release', () => { _triageWakeLock = null; });
        } catch (e) { /* permission denied or unsupported — silent no-op */ }
      } else if (!isActive && _triageWakeLock) {
        try { await _triageWakeLock.release(); } catch (e) { /* already released */ }
        _triageWakeLock = null;
      }
    }).observe(triageModalEl, { attributes: true, attributeFilter: ['open'] });
  }

  // === Modal back-button injection + auto-focus + focus-trap ===
  // (Mode-agnostic: works whether tv-mode is detected or not, important for TWA
  // WebViews on Google TV where the UA doesn't always match detectTVMode().)
  document.querySelectorAll('.modal .modal-content').forEach((content) => {
    if (content.querySelector('.modal-back')) return;
    const btn = document.createElement('button');
    btn.className = 'modal-back';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close this modal');
    btn.textContent = '←'; // ←
    content.insertBefore(btn, content.firstChild);
  });
  document.addEventListener('click', (e) => {
    const back = e.target.closest('.modal-back');
    if (!back) return;
    const modal = back.closest('.modal');
    if (modal) modal.close();
  });
  // V5.26.0: Hardened focus trap. focusin fires whenever ANY element gains
  // focus — if focus escapes the open modal (via Tab, programmatic .focus(),
  // or browser defaults), this listener immediately redirects it back into
  // the modal. Complements the keydown D-pad scoping for full coverage.
  document.addEventListener('focusin', (e) => {
    const openModal = Array.from(document.querySelectorAll('.modal[open]')).pop() || null;
    if (!openModal) return;
    if (openModal.contains(e.target)) return;
    const first =
      openModal.querySelector('.modal-actions button:not([disabled])') ||
      openModal.querySelector('.watch-btn-large') ||
      openModal.querySelector('.modal-content button:not(.modal-back):not([disabled])') ||
      openModal.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])') ||
      openModal.querySelector('.modal-back');
    if (first) first.focus();
  });

  // When a modal opens, focus its first ACTION button (not the top-left Back).
  // Priority: .modal-actions button > primary content button > input/select > .modal-back.
  // This avoids the "Down from Back jumps weirdly across the modal" pattern.
  const modalObs = new MutationObserver((muts) => {
    muts.forEach((m) => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      const el = m.target;
      if (el.classList.contains('modal') && el.classList.contains('active')) {
        setTimeout(() => {
          const first =
            el.querySelector('.modal-actions button:not([disabled])') ||
            el.querySelector('.watch-btn-large') ||
            el.querySelector('.modal-content button:not(.modal-back):not([disabled])') ||
            el.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ||
            el.querySelector('.modal-back');
          if (first) first.focus();
        }, 50);
      }
    });
  });
  document.querySelectorAll('.modal').forEach((m) => {
    modalObs.observe(m, { attributes: true, attributeFilter: ['open'] });
  });

  // === Back-button / Escape handling ===
  // Shared logic called by both the keydown handler and the popstate listener
  // (TWA physical back button → browser fires popstate, not always keydown).
  function handleAppBack() {
    // 1. Topmost open modal → close it
    const openModal = Array.from(document.querySelectorAll('.modal[open]')).pop() || null;
    if (openModal) { openModal.close(); return; }
    // 2. Wizard visible → navigate back within it (or stay at root; never exit)
    if (document.getElementById('wizard').style.display !== 'none') {
      if (wizardState.step !== 'root') wizardGoBack();
      return;
    }
    // 3. Main view → focus the tab nav so the user has a D-pad starting point
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn && activeBtn.offsetParent !== null) activeBtn.focus();
  }

  // Prime the browser history with a dummy entry so the TWA back button fires
  // popstate instead of finishing the activity (exiting the app). Re-prime on
  // every popstate so the next back press also fires popstate.
  history.pushState({ watchtrack: 'back' }, '');
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.watchtrack === 'back') {
      handleAppBack();
      history.pushState({ watchtrack: 'back' }, '');
    }
  });

  // === D-pad / arrow-key navigation ===
  // Mode-agnostic: Escape/Back must close modals on any device (TWA WebViews
  // on Google TV may not match detectTVMode's UA regex). Arrow-key navigation
  // is harmless on phone since the handler early-returns inside text inputs.
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isTextInput = tag === 'input' || tag === 'textarea' || tag === 'select';

    // Normalize key names: older WebViews (Android TV) send "Up" not "ArrowUp".
    // GoBack / BrowserBack are what some Android TV WebViews send for the remote
    // back button — treat them identically to Escape.
    const KEY_ALIASES = {
      'Up': 'ArrowUp', 'Down': 'ArrowDown', 'Left': 'ArrowLeft', 'Right': 'ArrowRight',
      'Esc': 'Escape', 'GoBack': 'Escape', 'BrowserBack': 'Escape',
    };
    const key = KEY_ALIASES[e.key] || e.key;

    // Escape / back button: always intercept to prevent the TWA from exiting.
    // If a text input is focused, blur it first so the back action is visible.
    // Backspace in a text input keeps its native delete behaviour.
    if (key === 'Escape') {
      e.preventDefault();
      if (isTextInput) e.target.blur();
      handleAppBack();
      return;
    }
    if (key === 'Backspace' && !isTextInput) {
      e.preventDefault();
      handleAppBack();
      return;
    }

    // Arrow keys and Enter: skip inside text inputs
    if (isTextInput) return;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(key)) return;

    if (key === 'Enter') {
      // Default browser behavior handles Enter on focused button. Intercept
      // for .item cards, where the actual click handler is on the inner
      // .item-head child (not the .item parent that D-pad nav focuses).
      // V5.26.7: dispatch click on .item-head, falling back to .item itself
      // for compatibility with any items that don't have an .item-head child.
      const focused = document.activeElement;
      if (focused && focused.classList.contains('item')) {
        e.preventDefault();
        const head = focused.querySelector('.item-head');
        (head || focused).click();
      }
      return;
    }

    e.preventDefault();
    const focused = document.activeElement;
    // If a modal is open, restrict the focusables to its contents (focus trap)
    const openModalRoot = Array.from(document.querySelectorAll('.modal[open]')).pop() || null;
    const searchRoot = openModalRoot || document;
    if (!focused || focused === document.body) {
      // V5.21.2: Filter for visibility (offsetParent !== null) and prefer the
      // active tab as a sensible starting point when entering the tabs view.
      // Without this filter, querySelector matches the first .modal-back in
      // DOM order — which lives inside a hidden modal — and .focus() on a
      // display:none element silently no-ops, leaving the user stuck.
      const activeTab = !openModalRoot ? document.querySelector('.tab-btn.active') : null;
      if (activeTab && activeTab.offsetParent !== null) {
        activeTab.focus();
        return;
      }
      const candidates = Array.from(searchRoot.querySelectorAll(
        '.wizard-btn, .item, .tab-btn, .header-btn, button:not(.modal-back), a, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null && !el.disabled);
      if (candidates.length > 0) candidates[0].focus();
      return;
    }

    // D-pad logic: simple "find nearest focusable in direction"
    // V5.22.2: Added textarea, select, and [tabindex] so paste fields and
    // dropdowns are reachable via D-pad (the new pair-receive-input was a
    // <textarea> and was being skipped entirely).
    const focusables = Array.from(searchRoot.querySelectorAll(
      '.modal-back, .wizard-btn, .tab-btn, .filter-btn, .category-btn, .header-btn, .item, .action-btn, .rating-btn, .tag-btn, .plex-play-btn, .sort-select, button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null && !el.disabled);
    if (focusables.length === 0) return;

    const r = focused.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    // V5.21.1: Tightened D-pad algorithm. Old version used Math.hypot which
    // weighed perpendicular distance equally with primary-axis distance, so a
    // button slightly down and far to the side could win over one directly
    // below. New scoring: primary-axis distance + 2× perpendicular-axis,
    // strongly preferring axis-aligned movement. Direction cone widened to
    // 60° (perpendicular ≤ 2× primary) so wrap-row layouts still reach.
    let best = null;
    let bestDist = Infinity;
    const MIN_DELTA = 10; // ignore elements within ~10px of center on the primary axis
    focusables.forEach(el => {
      if (el === focused) return;
      const er = el.getBoundingClientRect();
      const ecx = er.left + er.width / 2;
      const ecy = er.top + er.height / 2;
      const dx = ecx - cx;
      const dy = ecy - cy;
      let valid = false;
      let score = 0;
      if (key === 'ArrowRight' && dx > MIN_DELTA && Math.abs(dy) < Math.abs(dx) * 2) {
        valid = true;
        score = dx + Math.abs(dy) * 2;
      } else if (key === 'ArrowLeft' && dx < -MIN_DELTA && Math.abs(dy) < Math.abs(dx) * 2) {
        valid = true;
        score = -dx + Math.abs(dy) * 2;
      } else if (key === 'ArrowDown' && dy > MIN_DELTA && Math.abs(dx) < Math.abs(dy) * 2) {
        valid = true;
        score = dy + Math.abs(dx) * 2;
      } else if (key === 'ArrowUp' && dy < -MIN_DELTA && Math.abs(dx) < Math.abs(dy) * 2) {
        valid = true;
        score = -dy + Math.abs(dx) * 2;
      }
      if (!valid) return;
      if (score < bestDist) { bestDist = score; best = el; }
    });

    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

// v5.42.0: Service-worker registration. Moved out of an inline <script>
// in index.html so the CSP can drop 'unsafe-inline' from script-src.
// Behaviour is unchanged: register on window load, surface the SW
// update banner when a new worker is installed, reload on
// controllerchange after the user taps Reload.
(function () {
  if (!('serviceWorker' in navigator)) return;
  function showSwUpdateBanner(sw) {
    const banner = document.getElementById('sw-update-banner');
    const btn = document.getElementById('sw-update-reload');
    if (!banner || !btn) return;
    banner.classList.add('visible');
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Reloading…';
      sw.postMessage({ type: 'SKIP_WAITING' });
    }, { once: true });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      if (reg.waiting) showSwUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            showSwUpdateBanner(sw);
          }
        });
      });
    }).catch(e => console.log('SW failed:', e));
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  });
})();
