// === Launch ladder ===
//
// Turning "watch this on Netflix" into something an Android TV remote can
// actually open. Android can't ask whether an app is installed, so we build an
// ordered ladder of candidates and the runtime walks it: a `plex://` or
// `intent://` URL first, then plain https. The intent URL carries
// `S.browser_fallback_url`, so Chrome opens the website itself when the app is
// missing; the runtime's visibility-guarded timer covers the WebView case
// where the intent silently does nothing.
//
// Deep URLs are https-only — `intentUrl` throws on anything else rather than
// emitting an intent that could smuggle another scheme through
// `browser_fallback_url`.
//
// Golden cases: tests/fixtures/launch-cases.json.
import { webSearchUrl } from './providers.js';

export const LAUNCH_LABELS = {
  app: 'Open in app',
  web: 'Open website',
  plex: 'Open in Plex',
};

// TV user agents worth trusting: Android TV, Sony Bravia, Amazon Fire TV
// ("AFTB", "AFTMM", …), Google TV, generic "smart tv", NVIDIA Shield.
const TV_UA_RE = /\b(tv|bravia|aft[a-z0-9]*|googletv|smart-?tv|shield)\b/i;

export function detectLaunchPlatform({ ua, isTV } = {}) {
  const s = String(ua == null ? '' : ua);
  if (!/android/i.test(s)) return 'web';
  if (isTV || TV_UA_RE.test(s)) return 'android-tv';
  return 'android';
}

// https URL + Android package -> an Android intent: URL with an https
// browser fallback. Throws when the URL isn't https.
export function intentUrl(httpsUrl, pkg) {
  const url = String(httpsUrl == null ? '' : httpsUrl).trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error('intentUrl: an https:// URL is required, got ' + JSON.stringify(httpsUrl));
  }
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}`
    + `#Intent;scheme=https;package=${pkg};`
    + `S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

function plexCandidates(plex) {
  const key = String(plex.ratingKey);
  const serverUrl = plex.serverUrl ? String(plex.serverUrl) : '';
  const clientId = plex.clientId ? String(plex.clientId) : '';
  const out = [{
    kind: 'plex',
    url: `plex://play?metadataKey=/library/metadata/${key}&server=${encodeURIComponent(serverUrl)}`,
    label: LAUNCH_LABELS.plex,
  }];
  if (clientId) {
    out.push({
      kind: 'https',
      url: `https://app.plex.tv/desktop/#!/server/${clientId}/details?key=%2Flibrary%2Fmetadata%2F${key}`,
      label: LAUNCH_LABELS.web,
    });
  }
  if (serverUrl) {
    out.push({
      kind: 'https',
      url: `${serverUrl}/web/index.html#!/server/${clientId}/details?key=%2Flibrary%2Fmetadata%2F${key}`,
      label: LAUNCH_LABELS.web,
    });
  }
  return out;
}

// Ordered launch candidates for one provider entry (or the user's Plex
// server). Always ends with at least one https candidate so something opens.
export function buildLaunchCandidates(entry, ctx = {}) {
  const {
    platform = 'web',
    title = '',
    deepUrl = null,
    plex = null,
    launchApps = true,
  } = ctx || {};

  const searchUrl = webSearchUrl(entry, title, entry && entry.name);
  const out = [];

  if (plex && plex.ratingKey) {
    out.push(...plexCandidates(plex));
    // A Plex server with neither a client id nor a reachable URL leaves only
    // the plex:// candidate; keep the invariant with the web search.
    if (!out.some(c => c.kind === 'https')) {
      out.push({ kind: 'https', url: searchUrl, label: LAUNCH_LABELS.web });
    }
    return out;
  }

  const httpsUrl = /^https:\/\//i.test(String(deepUrl || '').trim())
    ? String(deepUrl).trim()
    : searchUrl;

  const android = entry && entry.android;
  if ((platform === 'android' || platform === 'android-tv') && launchApps && android) {
    const pkg = platform === 'android-tv'
      ? (android.tv || android.mobile)
      : (android.mobile || android.tv);
    if (pkg) out.push({ kind: 'intent', url: intentUrl(httpsUrl, pkg), label: LAUNCH_LABELS.app });
  }

  out.push({ kind: 'https', url: httpsUrl, label: LAUNCH_LABELS.web });
  if (searchUrl && searchUrl !== httpsUrl) {
    out.push({ kind: 'https', url: searchUrl, label: LAUNCH_LABELS.web });
  }
  return out;
}
