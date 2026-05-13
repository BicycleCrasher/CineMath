// CinéMath ↔ Plex bridge (v5.12 — adds /chat endpoint backed by Workers AI)
//
// Endpoints:
//   POST /webhook/{secret}              Plex Pass webhook receiver
//   GET  /events?secret=X&since=TS      CinéMath polls for new scrobble events
//   POST /events/ack                    CinéMath acks events processed
//   GET  /metadata/lookup?secret=X&title=T&year=Y&type=movie|tv[&tmdbId=N]   TMDB enrichment
//   POST /metadata/bulk                 Batch TMDB lookups (≤50 per call)
//   POST /viewed/ingest                 Bulk ingest Plex history (used once for backfill)
//   GET  /viewed/list?secret=X          Return all logged Plex views (for History modal)
//   POST /promotions/add                Persistent orphan promotion to catalog
//   GET  /promotions?secret=X           List all stored promotions (queried on app bootstrap)
//   DELETE /promotions/{tab}/{itemId}   Remove a promotion (after committing to catalog source)
//   POST /plex/configure                Store Plex URL + token in CONFIG KV
//   GET  /plex/identity?secret=X        Server-to-server Plex identity probe (replaces direct browser call)
//   GET  /plex/library?secret=X         Aggregated Plex library (sections + items)
//   POST /plex/scrobble                 Mark item watched on Plex (server-to-server)
//   GET  /plex/history?secret=X&start=N&size=N   Paginated Plex viewing history
//   GET  /sync/get?user=HASH&secret=X   v5.4: fetch user's synced state blob
//   PUT  /sync/put?user=HASH&secret=X   v5.4: store user's state blob (body = JSON)
//   POST /alerts/subscribe              v5.6: opt user into streaming-leaving alerts
//   POST /alerts/unsubscribe            v5.6: opt out
//   GET  /alerts/status?secret=X&user=HASH      v5.6: subscription state + last check ts
//   GET  /alerts/notifications?secret=X&user=HASH&since=TS  v5.6: poll pending alerts
//   POST /alerts/notifications/seen     v5.6: mark notifications as delivered (clear queue)
//   GET  /cron/check-alerts             v5.6: internal — fired by Cloudflare Cron Trigger
//   GET  /cron/backup-state?secret=X    v5.10: manual trigger of the daily R2 backup walk
//   GET  /cron/migrate-viewed-to-d1?secret=X    v5.11: one-time backfill of VIEWED KV into D1
//   GET  /alerts/test-fire?secret=X&user=HASH   v5.9: send a test push to verify delivery
//   POST /chat                                  v5.12: natural-language watch concierge
//   GET  /                              health check
//
// KV bindings expected (variable names must match exactly):
//   EVENTS      — webhook scrobble events queued for CinéMath to pull
//   CONFIG      — { "secret": "...", "tmdb_token": "...", "plex_url": "...", "plex_token": "..." }
//   VIEWED      — full Plex viewing history
//   METADATA    — TMDB enrichment cache
//   PROMOTIONS  — orphan promotions persisted across devices
//   SYNC_KV     — v5.4: cross-device state sync blobs, keyed by user:HASH
//   ALERTS      — v5.6: per-user alert subscription, snapshot, and notification queue
//   BACKUPS     — v5.10: R2 bucket for daily compressed state snapshots
//   D1_VIEWED   — v5.11: D1 database holding Plex viewing history (migrated from VIEWED KV)
//   AI          — v5.12: Workers AI binding for the natural-language chat endpoint

// Library whitelist — only ingest from these Plex library section IDs.
// Adjust if your library config changes.
const LIBRARY_WHITELIST = new Set(['1', '2']);

const TMDB_BASE = 'https://api.themoviedb.org/3';
const METADATA_TTL = 30 * 24 * 60 * 60;  // 30 days
const SYNC_TTL = 365 * 24 * 60 * 60;     // 1 year — auto-GC dormant users

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[’‘'`]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 60);
}

async function checkSecret(env, providedSecret) {
  const real = await env.CONFIG.get('secret');
  return real && providedSecret === real;
}

// === v5.8: Web Push (RFC 8030 + RFC 8291 + RFC 8292) ===
//
// All-WebCrypto, no third-party deps. The flow:
//   1. Sign a VAPID JWT (ES256 / P-256) with `aud` = origin of subscription
//      endpoint, `exp` ≤ 24h, `sub` = mailto: contact.
//   2. Encrypt the payload with aes128gcm: ephemeral ECDH against the
//      subscriber's p256dh public key, HKDF-derive content key + nonce
//      using auth_secret as initial salt and a fresh random salt as the
//      record salt, AES-GCM encrypt with a single padding byte (0x02).
//   3. POST to subscription.endpoint with:
//        Authorization: vapid t=<jwt>, k=<base64url(vapid_pub_raw)>
//        Content-Encoding: aes128gcm
//        TTL: 86400
//        body: salt(16) || rs(4) || idlen(1) || as_pub(65) || ciphertext

function b64uEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64uDecode(str) {
  const pad = (4 - (str.length % 4)) % 4;
  const s = (str + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concatBytes(...arrs) {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// HKDF using HMAC-SHA-256: extract(salt, ikm) then expand(prk, info, length).
// WebCrypto provides HKDF as a deriveBits algorithm directly.
async function hkdf(salt, ikm, info, length) {
  const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    ikmKey,
    length * 8
  );
  return new Uint8Array(bits);
}

// VAPID JWT signer. vapidPrivateRaw is the d component (32 bytes, base64url),
// vapidPublicRaw is the uncompressed P-256 point (65 bytes, base64url).
async function vapidJwt(audience, subject, vapidPublicRaw, vapidPrivateRaw) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };
  const headerB64 = b64uEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the EC private key as JWK so we can sign. P-256 public is the
  // first byte (0x04) + x(32) + y(32) for uncompressed, so x and y come
  // from vapidPublicRaw[1..33] and [33..65].
  const pub = b64uDecode(vapidPublicRaw);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be 65-byte uncompressed P-256');
  const priv = b64uDecode(vapidPrivateRaw);
  if (priv.length !== 32) throw new Error('VAPID private key must be 32 bytes');
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    d: b64uEncode(priv),
  };
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64uEncode(new Uint8Array(sig))}`;
}

// Encrypt a payload for one Web Push subscriber. Returns the body bytes
// to POST (header + ciphertext) plus the as_public to include in the
// Crypto-Key header.
async function encryptAes128Gcm(payload, p256dhB64u, authB64u) {
  const ua_public = b64uDecode(p256dhB64u);
  const auth = b64uDecode(authB64u);
  if (ua_public.length !== 65 || ua_public[0] !== 4) throw new Error('Bad p256dh');
  if (auth.length !== 16) throw new Error('Bad auth_secret');

  // Ephemeral local keypair
  const localPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const as_public = new Uint8Array(await crypto.subtle.exportKey('raw', localPair.publicKey));

  // Import the subscriber's public key
  const remote = await crypto.subtle.importKey(
    'raw', ua_public, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remote }, localPair.privateKey, 256
  ));

  // RFC 8291 §3.3: derive the input keying material (IKM) used for the
  // record-level HKDF. info = "WebPush: info" || 0x00 || ua_public || as_public.
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info'),
    new Uint8Array([0]),
    ua_public,
    as_public
  );
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);

  // Record salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Content key + nonce
  const cek = await hkdf(salt, ikm, concatBytes(new TextEncoder().encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concatBytes(new TextEncoder().encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  // Pad payload: payload || 0x02 (single-record marker; no zero padding).
  const plaintext = concatBytes(payload, new Uint8Array([2]));

  // AES-GCM encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    plaintext
  ));

  // Header: salt(16) || record-size(4 BE) || idlen(1) || as_public(65)
  // record-size is the maximum record size; we use 4096 (the recommended default)
  // which must be ≥ ciphertext.length + 16 (for the GCM tag).
  const recordSize = Math.max(4096, ciphertext.length + 1);
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header[16] = (recordSize >>> 24) & 0xff;
  header[17] = (recordSize >>> 16) & 0xff;
  header[18] = (recordSize >>> 8) & 0xff;
  header[19] = recordSize & 0xff;
  header[20] = 65; // idlen — length of as_public that follows
  header.set(as_public, 21);

  return { body: concatBytes(header, ciphertext), as_public };
}

// Send one Web Push. Returns { ok, status, error? }.
async function sendWebPush(subscription, payloadObj, env) {
  const vapidPublic = await env.CONFIG.get('vapid_public');
  const vapidPrivate = await env.CONFIG.get('vapid_private');
  const vapidSubject = (await env.CONFIG.get('vapid_subject')) || 'mailto:noreply@example.com';
  if (!vapidPublic || !vapidPrivate) return { ok: false, error: 'vapid not configured' };

  const audience = new URL(subscription.endpoint).origin;
  let jwt;
  try {
    jwt = await vapidJwt(audience, vapidSubject, vapidPublic, vapidPrivate);
  } catch (e) {
    return { ok: false, error: 'vapid sign failed: ' + e.message };
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
  let encrypted;
  try {
    encrypted = await encryptAes128Gcm(payloadBytes, subscription.keys.p256dh, subscription.keys.auth);
  } catch (e) {
    return { ok: false, error: 'encrypt failed: ' + e.message };
  }

  try {
    const resp = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt}, k=${vapidPublic}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
      },
      body: encrypted.body,
    });
    if (resp.status >= 200 && resp.status < 300) return { ok: true, status: resp.status };
    const text = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: 'fetch failed: ' + e.message };
  }
}

// v5.7: per-IP rate limit. Defends against an exposed shared secret being
// abused to flood Plex via the proxy or burn TMDB cache writes. The bucket
// resets every 60s via KV TTL — slight under-counting under racing
// reads-then-writes is acceptable for a defense layer (the leak case the
// limit defends against is one spammer, not a coordinated attack).
//
// Tunable: set CONFIG `rate_limit_per_minute` to override the default 60.
// Set to 0 (or any non-positive integer) to disable rate-limiting.
async function checkRateLimit(env, ip) {
  if (!ip) return { ok: true, count: 0 };
  const limitRaw = await env.CONFIG.get('rate_limit_per_minute');
  const limit = parseInt(limitRaw || '60', 10);
  if (!limit || limit <= 0) return { ok: true, count: 0 };
  const key = `rate:${ip}`;
  const cur = parseInt((await env.CONFIG.get(key)) || '0', 10);
  if (cur >= limit) return { ok: false, count: cur, limit };
  await env.CONFIG.put(key, String(cur + 1), { expirationTtl: 60 });
  return { ok: true, count: cur + 1, limit };
}

async function tmdbLookup(env, title, year, type, tmdbId) {
  // type: 'movie' or 'tv'
  // tmdbId: optional — if provided, fetches that ID directly without searching
  const tmdbToken = await env.CONFIG.get('tmdb_token');
  if (!tmdbToken) return { error: 'TMDB token not configured' };

  // Cache key — uses tmdbId when available, otherwise normalized title+year
  const cacheKey = tmdbId
    ? `lookup:${type}:tmdb-${tmdbId}`
    : `lookup:${type}:${normalizeTitle(title)}:${year || ''}`;
  const cached = await env.METADATA.get(cacheKey);
  if (cached) {
    try { return { ...JSON.parse(cached), cached: true }; } catch {}
  }

  let resolvedId = tmdbId;

  // If no tmdbId provided, search for one
  if (!resolvedId) {
    const searchPath = type === 'tv' ? '/search/tv' : '/search/movie';
    const yearParam = type === 'tv'
      ? (year ? `&first_air_date_year=${year}` : '')
      : (year ? `&year=${year}` : '');
    const searchUrl = `${TMDB_BASE}${searchPath}?query=${encodeURIComponent(title)}${yearParam}&include_adult=false`;
    const searchResp = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${tmdbToken}`, 'Accept': 'application/json' },
    });
    if (!searchResp.ok) return { error: `TMDB search ${searchResp.status}` };
    const searchData = await searchResp.json();
    const results = searchData.results || [];
    if (results.length === 0) {
      const negResult = { found: false, query: { title, year, type } };
      await env.METADATA.put(cacheKey, JSON.stringify(negResult), { expirationTtl: METADATA_TTL });
      return negResult;
    }
    resolvedId = results[0].id;
  }

  // Fetch details + watch providers + credits + videos (v5.5: trailers)
  const detailsPath = type === 'tv' ? `/tv/${resolvedId}` : `/movie/${resolvedId}`;
  const detailsResp = await fetch(`${TMDB_BASE}${detailsPath}?append_to_response=watch/providers,credits,recommendations,similar,videos`, {
    headers: { 'Authorization': `Bearer ${tmdbToken}`, 'Accept': 'application/json' },
  });
  let details = {};
  if (detailsResp.ok) details = await detailsResp.json();

  // v5.5: pick the best trailer YouTube key from videos.results.
  // Priority: official Trailer > any Trailer > Teaser > first video. YouTube only.
  let trailerKey = null;
  const videos = (details.videos && details.videos.results) || [];
  const ytVideos = videos.filter(v => v.site === 'YouTube' && v.key);
  const officialTrailer = ytVideos.find(v => v.type === 'Trailer' && v.official);
  const anyTrailer = !officialTrailer && ytVideos.find(v => v.type === 'Trailer');
  const teaser = !officialTrailer && !anyTrailer && ytVideos.find(v => v.type === 'Teaser');
  const fallback = !officialTrailer && !anyTrailer && !teaser && ytVideos[0];
  trailerKey = (officialTrailer || anyTrailer || teaser || fallback || {}).key || null;

  const result = {
    found: true,
    tmdbId: resolvedId,
    type,
    title: details.title || details.name || title,
    originalTitle: details.original_title || details.original_name || null,
    year: (details.release_date || details.first_air_date || '').slice(0, 4) || null,
    overview: details.overview || '',
    runtime: details.runtime || (details.episode_run_time && details.episode_run_time[0]) || null,
    genres: (details.genres || []).map(g => g.name),
    posterPath: details.poster_path || null,
    voteAverage: details.vote_average || null,
    numberOfSeasons: details.number_of_seasons || null,
    numberOfEpisodes: details.number_of_episodes || null,
    inProduction: details.in_production || null,
    networks: (details.networks || []).map(n => n.name),
    watchProviders: (details['watch/providers'] && details['watch/providers'].results) || {},
    cast: ((details.credits && details.credits.cast) || []).slice(0, 5).map(c => c.name),
    trailerKey,  // v5.5: YouTube key of best trailer, or null
    // For Stage 5e (recommendation engine) — keep the IDs only, slim
    recommendations: ((details.recommendations && details.recommendations.results) || []).slice(0, 10).map(r => ({
      id: r.id, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4) || null,
    })),
    similar: ((details.similar && details.similar.results) || []).slice(0, 10).map(r => ({
      id: r.id, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4) || null,
    })),
    cachedAt: Date.now(),
  };
  await env.METADATA.put(cacheKey, JSON.stringify(result), { expirationTtl: METADATA_TTL });
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Health (no rate limit, no auth)
    if (path === '/' || path === '/health') {
      return new Response('CinéMath-Plex bridge online (v5.14 — /palate/predict-tags via Claude Sonnet 4.6)', { headers: cors });
    }

    // v5.7: per-IP rate limit. Applies to every other route. Returns 429
    // with a Retry-After header when the bucket is full.
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
    const rl = await checkRateLimit(env, ip);
    if (!rl.ok) {
      console.log('[rate-limit] 429 for ip', ip, 'on', method, path, '—', rl.count, '/', rl.limit);
      return new Response(`Rate limit exceeded: ${rl.count}/${rl.limit} per minute`, {
        status: 429,
        headers: { ...cors, 'Retry-After': '60', 'Content-Type': 'text/plain' },
      });
    }

    // === Plex webhook receiver ===
    if (path.startsWith('/webhook/') && method === 'POST') {
      const providedSecret = path.slice('/webhook/'.length);
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      try {
        const formData = await request.formData();
        const payloadStr = formData.get('payload');
        if (!payloadStr) return new Response('Missing payload', { status: 400, headers: cors });
        const payload = JSON.parse(payloadStr);
        const md = payload.Metadata || {};
        const libraryId = String(md.librarySectionID || '');
        // Library whitelist
        if (!LIBRARY_WHITELIST.has(libraryId)) {
          return new Response('Filtered (library not whitelisted)', { status: 200, headers: cors });
        }

        // Build event record
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const record = {
          id: eventId,
          event: payload.event,
          ts: Date.now(),
          ratingKey: md.ratingKey || '',
          guid: md.guid || '',
          title: md.title || '',
          year: md.year || null,
          type: md.type || '',
          librarySectionID: libraryId,
          grandparentTitle: md.grandparentTitle || null,
          parentIndex: md.parentIndex || null,
          index: md.index || null,
          rating: payload.rating || null,
        };

        // Always log to VIEWED (durable history, no TTL — keeps every play).
        // v5.11: dual-write to D1 alongside KV. KV write is the safety net
        // during the transition; once D1 has soaked we'll drop the KV write
        // in a future release.
        const viewedKey = `view:${record.ts}_${eventId}`;
        await env.VIEWED.put(viewedKey, JSON.stringify(record));
        await insertViewToD1(env, record).catch(e => console.log('[d1] webhook insert failed', e.message));

        // Only forward scrobble + rate events to EVENTS queue (with TTL — pulled by WT, then deleted)
        if (record.event === 'media.scrobble' || record.event === 'media.rate') {
          await env.EVENTS.put(eventId, JSON.stringify(record), { expirationTtl: 7 * 24 * 60 * 60 });
        }
        return new Response('OK', { status: 200, headers: cors });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === CinéMath polls for new events ===
    if (path === '/events' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const since = parseInt(url.searchParams.get('since') || '0');
      const list = await env.EVENTS.list();
      const events = [];
      const CONCURRENCY = 50;
      for (let i = 0; i < list.keys.length; i += CONCURRENCY) {
        const batch = list.keys.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(k => env.EVENTS.get(k.name).catch(() => null)));
        results.forEach(v => {
          if (!v) return;
          try {
            const rec = JSON.parse(v);
            if (rec.ts > since) events.push(rec);
          } catch {}
        });
      }
      events.sort((a, b) => a.ts - b.ts);
      return jsonResponse({ events });
    }

    // === CinéMath confirms events processed ===
    if (path === '/events/ack' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        const ids = body.eventIds || [];
        for (const id of ids) await env.EVENTS.delete(id);
        return jsonResponse({ deleted: ids.length });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === TMDB metadata lookup ===
    if (path === '/metadata/lookup' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const title = url.searchParams.get('title');
      const year = url.searchParams.get('year') || '';
      const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
      const tmdbId = url.searchParams.get('tmdbId') || null;
      if (!title && !tmdbId) return new Response('Missing title or tmdbId', { status: 400, headers: cors });
      const result = await tmdbLookup(env, title, year, type, tmdbId);
      return jsonResponse(result);
    }

    // === Bulk TMDB metadata lookup ===
    // POST { secret, items: [{ title, year, type, tmdbId? }, ...] }
    if (path === '/metadata/bulk' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        const items = (body.items || []).slice(0, 50);
        const results = [];
        let errors = 0;
        for (const it of items) {
          try {
            const r = await tmdbLookup(env, it.title, it.year || '', it.type === 'tv' ? 'tv' : 'movie', it.tmdbId || null);
            results.push({ query: it, result: r });
          } catch (e) {
            errors++;
            results.push({ query: it, result: { error: e.message } });
          }
        }
        return jsonResponse({ results, errors });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === Bulk-ingest historical Plex viewing data ===
    // POST { secret, entries: [{title, year, type, grandparentTitle, parentIndex, index, viewedAt, librarySectionID}, ...] }
    if (path === '/viewed/ingest' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        const entries = body.entries || [];
        let stored = 0, filtered = 0;
        for (const e of entries) {
          const libId = String(e.librarySectionID || '');
          if (!LIBRARY_WHITELIST.has(libId)) { filtered++; continue; }
          const ts = (e.viewedAt ? parseInt(e.viewedAt) * 1000 : Date.now());
          const id = `bulk_${ts}_${Math.random().toString(36).slice(2, 6)}`;
          const record = {
            id, event: 'media.scrobble', ts,
            title: e.title || '',
            year: e.year || null,
            type: e.type || '',
            grandparentTitle: e.grandparentTitle || null,
            parentIndex: e.parentIndex || null,
            index: e.index || null,
            librarySectionID: libId,
            source: 'bulk_history_import',
          };
          await env.VIEWED.put(`view:${ts}_${id}`, JSON.stringify(record));
          await insertViewToD1(env, record).catch(e => console.log('[d1] ingest insert failed', e.message));
          stored++;
        }
        return jsonResponse({ stored, filtered });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === List all logged views (for History modal in WT) ===
    // v5.11: reads come from D1 now. The VIEWED KV is still being
    // written to (dual-write) during the transition; if D1 returns
    // empty (e.g. before the one-time migration runs), fall through
    // to the KV path so the history modal isn't blank.
    if (path === '/viewed/list' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5000'), 10000);
      const offset = parseInt(url.searchParams.get('offset') || '0');
      // Try D1 first
      if (env.D1_VIEWED) {
        try {
          const r = await env.D1_VIEWED.prepare(
            'SELECT id, event, ts, rating_key AS ratingKey, guid, title, year, type, library_section_id AS librarySectionID, grandparent_title AS grandparentTitle, parent_index AS parentIndex, ep_index AS "index", rating, source FROM views ORDER BY ts DESC LIMIT ? OFFSET ?'
          ).bind(limit, offset).all();
          const records = r.results || [];
          if (records.length > 0 || offset > 0) {
            return jsonResponse({ records, source: 'd1', cursor: records.length === limit ? `offset=${offset + limit}` : null });
          }
          // Fall through to KV when D1 is empty AND offset is 0 — pre-migration state
          console.log('[viewed/list] D1 empty, falling back to KV (pre-migration)');
        } catch (e) {
          console.log('[viewed/list] D1 read failed, falling back to KV:', e.message);
        }
      }
      // KV fallback (also keeps `/viewed/list` working during the migration window)
      const cursor = url.searchParams.get('cursor') || undefined;
      const list = await env.VIEWED.list({ cursor, limit: 500 });
      const records = [];
      const CONCURRENCY = 50;
      for (let i = 0; i < list.keys.length; i += CONCURRENCY) {
        const batch = list.keys.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(k => env.VIEWED.get(k.name).catch(() => null)));
        results.forEach(v => {
          if (!v) return;
          try { records.push(JSON.parse(v)); } catch {}
        });
      }
      return jsonResponse({
        records,
        source: 'kv',
        cursor: list.list_complete ? null : list.cursor,
      });
    }

    // === Promotions: persistent orphan-to-catalog additions ===
    // POST /promotions/add — body: { secret, tab, item }
    //   - Writes to PROMOTIONS KV under key `${tab}|${item.id}`
    if (path === '/promotions/add' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.tab || !body.item || !body.item.id) {
          return new Response('Missing tab or item.id', { status: 400, headers: cors });
        }
        const key = `${body.tab}|${body.item.id}`;
        const record = {
          tab: body.tab,
          item: body.item,
          createdAt: Date.now(),
        };
        await env.PROMOTIONS.put(key, JSON.stringify(record));
        return jsonResponse({ ok: true, key });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // GET /promotions?secret=X — list all promotions
    if (path === '/promotions' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const list = await env.PROMOTIONS.list({ limit: 1000 });
      const records = [];
      const CONCURRENCY = 50;
      for (let i = 0; i < list.keys.length; i += CONCURRENCY) {
        const batch = list.keys.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(k => env.PROMOTIONS.get(k.name).then(v => ({ name: k.name, v })).catch(() => null)));
        results.forEach(r => {
          if (!r || !r.v) return;
          try { records.push({ key: r.name, ...JSON.parse(r.v) }); } catch {}
        });
      }
      return jsonResponse({ records });
    }

    // DELETE /promotions/{tab}/{itemId}?secret=X — remove a promotion (for "I committed this" workflow)
    if (path.startsWith('/promotions/') && method === 'DELETE') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const remainder = path.slice('/promotions/'.length);
      const slash = remainder.indexOf('/');
      if (slash < 0) return new Response('Bad path', { status: 400, headers: cors });
      const tab = remainder.slice(0, slash);
      const itemId = remainder.slice(slash + 1);
      const key = `${tab}|${itemId}`;
      await env.PROMOTIONS.delete(key);
      return jsonResponse({ ok: true, deleted: key });
    }

    // === Palate: D1-backed record of archived items, ratings, tags, HoF ===
    // POST /palate/upsert — body: {
    //   secret, tabId, itemId, title, year, tmdbId, status, rating,
    //   reactionTags (array), notes, archived (0/1), archivedReason, hof (0/1)
    // }
    if (path === '/palate/upsert' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.tabId || !body.itemId) {
          return new Response('Missing tabId or itemId', { status: 400, headers: cors });
        }
        if (!env.D1_VIEWED) return jsonResponse({ error: 'D1 not configured' }, 500);
        const id = `${body.tabId}:${body.itemId}`;
        const now = Date.now();
        const tagsJson = JSON.stringify(Array.isArray(body.reactionTags) ? body.reactionTags : []);
        await env.D1_VIEWED.prepare(
          `INSERT INTO palate (
             id, tab_id, item_id, title, year, tmdb_id, status, rating,
             reaction_tags, notes, archived, archived_reason, hof, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             tab_id = excluded.tab_id,
             item_id = excluded.item_id,
             title = excluded.title,
             year = excluded.year,
             tmdb_id = excluded.tmdb_id,
             status = excluded.status,
             rating = excluded.rating,
             reaction_tags = excluded.reaction_tags,
             notes = excluded.notes,
             archived = excluded.archived,
             archived_reason = excluded.archived_reason,
             hof = excluded.hof,
             updated_at = excluded.updated_at`
        ).bind(
          id, body.tabId, body.itemId,
          body.title || null,
          body.year || null,
          body.tmdbId || null,
          body.status || null,
          body.rating || null,
          tagsJson,
          body.notes || null,
          body.archived ? 1 : 0,
          body.archivedReason || null,
          body.hof ? 1 : 0,
          now, now
        ).run();
        return jsonResponse({ ok: true, id });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // GET /palate/archived?secret=X — fast id-only fetch for startup hydration
    if (path === '/palate/archived' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      if (!env.D1_VIEWED) return jsonResponse({ ids: [] });
      try {
        const r = await env.D1_VIEWED.prepare(
          'SELECT id FROM palate WHERE archived = 1'
        ).all();
        const ids = (r.results || []).map(row => row.id);
        return jsonResponse({ ids });
      } catch (e) {
        return new Response('D1 error: ' + e.message, { status: 500, headers: cors });
      }
    }

    // GET /palate/list?secret=X&cursor=N&limit=100 — full paginated palate
    if (path === '/palate/list' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      if (!env.D1_VIEWED) return jsonResponse({ records: [], next_cursor: null });
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
      const offset = parseInt(url.searchParams.get('cursor') || '0');
      try {
        const r = await env.D1_VIEWED.prepare(
          `SELECT id, tab_id AS tabId, item_id AS itemId, title, year,
                  tmdb_id AS tmdbId, status, rating, reaction_tags AS reactionTags,
                  notes, archived, archived_reason AS archivedReason, hof,
                  created_at AS createdAt, updated_at AS updatedAt
             FROM palate
             ORDER BY updated_at DESC
             LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();
        const records = (r.results || []).map(row => ({
          ...row,
          reactionTags: row.reactionTags ? JSON.parse(row.reactionTags) : [],
        }));
        const next_cursor = records.length === limit ? offset + limit : null;
        return jsonResponse({ records, next_cursor });
      } catch (e) {
        return new Response('D1 error: ' + e.message, { status: 500, headers: cors });
      }
    }

    // POST /palate/predict-tags — body: { secret, tasteProfile, items }
    //   Calls Anthropic Claude Sonnet 4.6 to predict reaction tags for each item.
    //   Returns: { predictions: [{ tabId, itemId, predictedTags, confidence }, ...] }
    //   ANTHROPIC_API_KEY must be set as a Worker secret (Cloudflare dashboard → Settings).
    if (path === '/palate/predict-tags' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!Array.isArray(body.items) || body.items.length === 0) {
          return new Response('Missing items array', { status: 400, headers: cors });
        }
        if (!env.ANTHROPIC_API_KEY) {
          return jsonResponse({ predictions: [], error: 'ANTHROPIC_API_KEY not configured on Worker' }, 500);
        }
        const systemPrompt = `You are a film and TV taste analysis engine. Given a list of watched items with their ratings, predict the most likely reaction tags for each item based on:
1. The item's known characteristics (genre, director, style, era)
2. The user's demonstrated taste profile from their ratings
3. The available tag set for each item's content type

Respond ONLY with a JSON array. No preamble, no markdown fences. Each element:
{
  "tabId": "string",
  "itemId": "string",
  "predictedTags": ["tag1", "tag2"],
  "confidence": "high|medium|low"
}

Only predict tags that are in the provided tag set for that item's content type. Predict 2-5 tags per item. Prioritize tags that are most likely to be accurate over completeness.`;
        const userMessage = JSON.stringify({
          tasteProfile: body.tasteProfile || [],
          items: body.items,
        });
        const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          }),
        });
        if (!anthropicResp.ok) {
          const text = await anthropicResp.text().catch(() => '');
          return jsonResponse({ predictions: [], error: `Anthropic ${anthropicResp.status}: ${text.slice(0, 300)}` }, 502);
        }
        const data = await anthropicResp.json();
        const content = data.content && data.content[0] && data.content[0].text;
        if (!content) return jsonResponse({ predictions: [], error: 'Empty model response' }, 502);
        // Strip any stray markdown fences and parse
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        let predictions = [];
        try { predictions = JSON.parse(cleaned); }
        catch (e) { return jsonResponse({ predictions: [], error: 'Failed to parse model output: ' + e.message, raw: cleaned.slice(0, 500) }, 502); }
        return jsonResponse({ predictions });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === Plex proxy: store URL + token in CONFIG KV (one-time setup) ===
    if (path === '/plex/configure' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.plexUrl || !body.plexToken) return new Response('Missing plexUrl or plexToken', { status: 400, headers: cors });
        await env.CONFIG.put('plex_url', body.plexUrl.replace(/\/$/, ''));
        await env.CONFIG.put('plex_token', body.plexToken);
        return jsonResponse({ ok: true });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === Plex proxy: server identity probe ===
    if (path === '/plex/identity' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const plexUrl = await env.CONFIG.get('plex_url');
      const plexToken = await env.CONFIG.get('plex_token');
      if (!plexUrl || !plexToken) return jsonResponse({ error: 'Plex not configured' }, 400);
      try {
        const resp = await fetch(`${plexUrl}/identity?X-Plex-Token=${encodeURIComponent(plexToken)}`, {
          headers: { 'Accept': 'application/json' },
        });
        if (!resp.ok) return jsonResponse({ error: `Plex returned ${resp.status}` }, 502);
        const data = await resp.json();
        return jsonResponse(data);
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // === Plex proxy: aggregated library (sections + items) ===
    if (path === '/plex/library' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const plexUrl = await env.CONFIG.get('plex_url');
      const plexToken = await env.CONFIG.get('plex_token');
      if (!plexUrl || !plexToken) return jsonResponse({ error: 'Plex not configured' }, 400);
      try {
        const sectionsResp = await fetch(`${plexUrl}/library/sections?X-Plex-Token=${encodeURIComponent(plexToken)}`, {
          headers: { 'Accept': 'application/json' },
        });
        if (!sectionsResp.ok) return jsonResponse({ error: `Plex sections ${sectionsResp.status}` }, 502);
        const sectionsJson = await sectionsResp.json();
        const dirs = (sectionsJson?.MediaContainer?.Directory) || [];
        const items = [];
        for (const dir of dirs) {
          if (dir.type !== 'movie' && dir.type !== 'show') continue;
          const allResp = await fetch(`${plexUrl}/library/sections/${dir.key}/all?X-Plex-Token=${encodeURIComponent(plexToken)}`, {
            headers: { 'Accept': 'application/json' },
          });
          if (!allResp.ok) continue;
          const allJson = await allResp.json();
          const sectionItems = (allJson?.MediaContainer?.Metadata) || [];
          sectionItems.forEach(it => {
            items.push({
              title: it.title,
              year: it.year || null,
              ratingKey: it.ratingKey,
              type: it.type,
              librarySectionID: dir.key,
            });
          });
        }
        return jsonResponse({ items });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // === Plex proxy: scrobble (mark item watched on Plex) ===
    if (path === '/plex/scrobble' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.ratingKey) return new Response('Missing ratingKey', { status: 400, headers: cors });
        const plexUrl = await env.CONFIG.get('plex_url');
        const plexToken = await env.CONFIG.get('plex_token');
        if (!plexUrl || !plexToken) return jsonResponse({ error: 'Plex not configured' }, 400);
        const resp = await fetch(`${plexUrl}/:/scrobble?identifier=com.plexapp.plugins.library&key=${encodeURIComponent(body.ratingKey)}&X-Plex-Token=${encodeURIComponent(plexToken)}`);
        return jsonResponse({ ok: resp.ok, status: resp.status });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // === Plex proxy: paginated viewing history ===
    if (path === '/plex/history' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const start = parseInt(url.searchParams.get('start') || '0');
      const size = parseInt(url.searchParams.get('size') || '500');
      const plexUrl = await env.CONFIG.get('plex_url');
      const plexToken = await env.CONFIG.get('plex_token');
      if (!plexUrl || !plexToken) return jsonResponse({ error: 'Plex not configured' }, 400);
      try {
        const resp = await fetch(`${plexUrl}/status/sessions/history/all?sort=viewedAt:asc&X-Plex-Token=${encodeURIComponent(plexToken)}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`, {
          headers: { 'Accept': 'application/json' },
        });
        if (!resp.ok) return jsonResponse({ error: `Plex history ${resp.status}` }, 502);
        const data = await resp.json();
        return jsonResponse(data);
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // === v5.4: Cross-device state sync ===
    // Identity is a SHA-256 hash of the user's Plex token (computed client-side
    // by CinéMath), so the same Plex account on multiple devices produces the
    // same hash and reads/writes the same blob. Authorization uses the existing
    // shared secret.

    // GET /sync/get?user=HASH&secret=X — fetch the user's stored blob (or 404)
    if (path === '/sync/get' && method === 'GET') {
      const userHash = url.searchParams.get('user');
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      if (!userHash || !/^[a-f0-9]{16,64}$/i.test(userHash)) {
        return new Response('Bad user hash', { status: 400, headers: cors });
      }
      const data = await env.SYNC_KV.get(`user:${userHash}`);
      if (!data) {
        return new Response('null', {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      return new Response(data, {
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // PUT /sync/put?user=HASH&secret=X — store the user's blob (body = JSON)
    if (path === '/sync/put' && method === 'PUT') {
      const userHash = url.searchParams.get('user');
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      if (!userHash || !/^[a-f0-9]{16,64}$/i.test(userHash)) {
        return new Response('Bad user hash', { status: 400, headers: cors });
      }
      const bodyText = await request.text();
      // Cloudflare KV per-value cap is 25 MB; reject earlier to avoid wasted compute
      if (bodyText.length > 25 * 1024 * 1024) {
        return new Response('Payload too large', { status: 413, headers: cors });
      }
      // Validate parses cleanly so we don't store garbage
      try { JSON.parse(bodyText); }
      catch { return new Response('Invalid JSON', { status: 400, headers: cors }); }
      await env.SYNC_KV.put(`user:${userHash}`, bodyText, { expirationTtl: SYNC_TTL });
      return new Response('ok', { headers: cors });
    }

    // === v5.6: Streaming-leaving alerts ===
    //
    // Daily Cron walks each subscribed user's queued/watching items, calls
    // tmdbLookup (cache-first), diffs the watch/providers result against the
    // last snapshot, and writes any provider-disappearance to the user's
    // notification queue. The client polls /alerts/notifications when it
    // becomes visible (pull model — no Web Push protocol implementation
    // needed in the Worker; the client uses the browser-native Notifications
    // API to display alerts that the queue surfaces).
    //
    // ALERTS KV layout:
    //   sub:{userHash}            JSON { region, enabled, subscribedAt }
    //   snap:{userHash}           JSON map: tmdbKey -> [provider names]
    //   notif:{userHash}:{ts}     JSON { title, body, itemRef, ts }

    // POST /alerts/subscribe — body { secret, userHash, region, items?, push? }
    // `items` is the per-device list of catalog entries the user wants
    // monitored — each one is { tabId, itemId, title, year, type, tmdbId? }.
    // `push` (v5.8) is optional Web Push subscription data:
    //   { endpoint, keys: { p256dh, auth } }. When present, runAlertsCheck
    //   sends a real Web Push for each new notification. When absent, the
    //   client polls /alerts/notifications on visibility-change instead.
    // The client refreshes the subscription whenever its queued/watching set
    // changes; the Worker simply replaces the stored manifest.
    if (path === '/alerts/subscribe' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.userHash || !/^[a-f0-9]{16,64}$/i.test(body.userHash)) {
          return new Response('Bad user hash', { status: 400, headers: cors });
        }
        const region = (body.region || 'US').slice(0, 4).toUpperCase();
        const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
        const push = body.push && body.push.endpoint && body.push.keys ? {
          endpoint: String(body.push.endpoint),
          keys: { p256dh: String(body.push.keys.p256dh || ''), auth: String(body.push.keys.auth || '') },
        } : null;
        await env.ALERTS.put(`sub:${body.userHash}`, JSON.stringify({
          region,
          enabled: true,
          subscribedAt: Date.now(),
          items,
          push,
        }));
        return jsonResponse({ ok: true, region, itemCount: items.length, hasPush: !!push });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // GET /alerts/vapid-public — return the VAPID application server key
    // so the client can pass it to pushManager.subscribe(). No secret
    // required because the public key is, by design, public.
    if (path === '/alerts/vapid-public' && method === 'GET') {
      const pub = await env.CONFIG.get('vapid_public');
      if (!pub) return jsonResponse({ error: 'VAPID not configured' }, 400);
      return jsonResponse({ vapidPublicKey: pub });
    }

    // POST /alerts/unsubscribe — body { secret, userHash }
    if (path === '/alerts/unsubscribe' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.userHash) return new Response('Missing userHash', { status: 400, headers: cors });
        await env.ALERTS.delete(`sub:${body.userHash}`);
        return jsonResponse({ ok: true });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // GET /alerts/status?secret=X&user=HASH
    if (path === '/alerts/status' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userHash = url.searchParams.get('user');
      if (!userHash) return new Response('Missing user', { status: 400, headers: cors });
      const sub = await env.ALERTS.get(`sub:${userHash}`);
      if (!sub) return jsonResponse({ enabled: false });
      try { return jsonResponse({ ...JSON.parse(sub), enabled: true }); }
      catch { return jsonResponse({ enabled: false }); }
    }

    // GET /alerts/notifications?secret=X&user=HASH&since=TS — return pending notifications
    if (path === '/alerts/notifications' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userHash = url.searchParams.get('user');
      const since = parseInt(url.searchParams.get('since') || '0');
      if (!userHash) return new Response('Missing user', { status: 400, headers: cors });
      const list = await env.ALERTS.list({ prefix: `notif:${userHash}:` });
      const records = [];
      const CONCURRENCY = 50;
      for (let i = 0; i < list.keys.length; i += CONCURRENCY) {
        const batch = list.keys.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(k => env.ALERTS.get(k.name).catch(() => null)));
        results.forEach((v, idx) => {
          if (!v) return;
          try {
            const rec = JSON.parse(v);
            if (rec.ts > since) records.push({ key: batch[idx].name, ...rec });
          } catch {}
        });
      }
      records.sort((a, b) => a.ts - b.ts);
      return jsonResponse({ notifications: records });
    }

    // POST /alerts/notifications/seen — body { secret, userHash, keys: [...] }
    if (path === '/alerts/notifications/seen' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.userHash) return new Response('Missing userHash', { status: 400, headers: cors });
        const keys = Array.isArray(body.keys) ? body.keys : [];
        for (const k of keys) {
          if (typeof k === 'string' && k.startsWith(`notif:${body.userHash}:`)) {
            await env.ALERTS.delete(k);
          }
        }
        return jsonResponse({ deleted: keys.length });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // GET /alerts/test-fire?secret=X&user=HASH (v5.9)
    //
    // Sends a fake "test notification" through the user's stored push
    // subscription. Useful for end-to-end verification without waiting
    // for an organic TMDB provider drop. Returns the same shape sendWebPush
    // returns: { ok: bool, status?: number, error?: string }.
    if (path === '/alerts/test-fire' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userHash = url.searchParams.get('user');
      if (!userHash) return new Response('Missing user', { status: 400, headers: cors });
      const subRaw = await env.ALERTS.get(`sub:${userHash}`);
      if (!subRaw) return jsonResponse({ error: 'No subscription for that user' }, 404);
      let sub;
      try { sub = JSON.parse(subRaw); } catch { return jsonResponse({ error: 'Subscription corrupt' }, 500); }
      if (!sub.push || !sub.push.endpoint || !sub.push.keys) {
        return jsonResponse({ error: 'Subscription has no push data — re-enable alerts on the device after VAPID is configured' }, 400);
      }
      const result = await sendWebPush(sub.push, {
        title: 'CinéMath test notification',
        body: 'If you see this, Web Push is working end-to-end.',
        itemRef: 'test',
        tabId: '',
        itemId: '',
        ts: Date.now(),
      }, env);
      return jsonResponse(result);
    }

    // GET /cron/backup-state — manual trigger of the daily R2 state
    // backup walk. Same code path the scheduled handler runs.
    if (path === '/cron/backup-state' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const summary = await runStateBackup(env);
      return jsonResponse(summary);
    }

    // GET /cron/migrate-viewed-to-d1 — one-time backfill of the VIEWED
    // KV namespace into the D1 `views` table. Idempotent — INSERT OR
    // IGNORE keeps re-runs safe. Chunked: each call processes up to
    // `limit` records (default 500) and returns the next cursor for
    // continuation. Loop the call client-side until cursor is null.
    if (path === '/cron/migrate-viewed-to-d1' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      try {
        const cursor = url.searchParams.get('cursor') || undefined;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
        const summary = await migrateViewedToD1(env, { cursor, limit });
        return jsonResponse(summary);
      } catch (e) {
        console.log('[d1-migrate] uncaught', e.stack || e.message);
        return jsonResponse({ error: 'Migration failed — see Worker logs' }, 500);
      }
    }

    // POST /chat — natural-language watch concierge.
    // v5.12. Body: { secret, userHash, message, history?, candidates? }
    //   userHash:     identifies the user for D1 viewing-history lookup.
    //   message:      the user's freeform query for this turn.
    //   history:      optional array of prior {role, content} turns (last 10 used).
    //   candidates:   optional pre-filtered catalog items the bot picks from.
    //                 Each: { tabId, itemId, title, year, type, dir, pitch, tags?, runtime? }.
    //                 If absent or empty, the bot can only ask clarifying questions.
    // Returns { reply, pick: { tabId, itemId, why } | null }.
    if (path === '/chat' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.userHash || !body.message) return new Response('Missing userHash or message', { status: 400, headers: cors });
        if (!env.AI) return jsonResponse({ error: 'AI binding missing' }, 500);

        const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 50) : [];
        const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

        // Pull last 30 viewing-history rows from D1 to ground recommendations.
        // Failure is non-fatal — bot still works without history, just less personalized.
        let recentViews = [];
        if (env.D1_VIEWED) {
          try {
            const r = await env.D1_VIEWED.prepare(
              `SELECT title, year, type, grandparent_title AS show, ts FROM views ORDER BY ts DESC LIMIT 30`
            ).all();
            recentViews = r.results || [];
          } catch (e) { console.log('[chat] D1 read failed', e.message); }
        }

        const recentLines = recentViews.map(v => {
          if (v.type === 'episode' && v.show) return `- ${v.show}: "${v.title}" (${v.year || '?'})`;
          return `- ${v.title} (${v.year || '?'}, ${v.type || '?'})`;
        }).join('\n') || '(no recent viewing data)';

        const candidateLines = candidates.map(c => {
          const tagsBit = (c.tags && c.tags.length) ? ` — tags: ${c.tags.slice(0, 5).join(', ')}` : '';
          const dirBit = c.dir ? ` — dir: ${c.dir}` : '';
          const runtimeBit = c.runtime ? ` — ${c.runtime}` : '';
          const pitchBit = c.pitch ? ` — pitch: ${String(c.pitch).slice(0, 200)}` : '';
          return `- {tabId:"${c.tabId}", itemId:"${c.itemId}"} ${c.title} (${c.year || '?'}, ${c.type || '?'})${dirBit}${runtimeBit}${tagsBit}${pitchBit}`;
        }).join('\n') || '(no candidates passed — ask the user to narrow their request)';

        const systemPrompt = [
          "You are CinéMath's watch concierge — terse, opinionated, grounded in the user's actual taste.",
          "Your job each turn: pick exactly ONE candidate that fits the user's stated intent right now.",
          "Use their RECENT VIEWING to spot patterns (genre runs, director streaks, rewatch tendencies) and reference them in your reasoning.",
          "Output ONLY valid JSON, exactly this shape, nothing else:",
          '{ "reply": "<1-2 sentence conversational message naming the pick and the hook>", "pick": { "tabId": "<from candidates>", "itemId": "<from candidates>", "why": "<1-2 sentences grounded in their tags / director affinity / recent viewing>" } }',
          "If the candidates aren't a good match, set pick to null and use reply to ask ONE clarifying question.",
          "Do not invent items not in the candidate list. Do not output prose outside the JSON.",
        ].join('\n');

        const userContext = `RECENT VIEWING (most recent first, last 30):\n${recentLines}\n\nCANDIDATES (pick exactly one):\n${candidateLines}\n\nUSER ASKS: ${body.message}`;

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').slice(0, 2000) })),
          { role: 'user', content: userContext },
        ];

        const t0 = Date.now();
        const aiResp = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages,
          max_tokens: 400,
          temperature: 0.7,
        });
        console.log('[chat] AI completed in', Date.now() - t0, 'ms');

        // Workers AI runtime returns one of:
        //   1. aiResp.response is already the parsed object { reply, pick } —
        //      happens when the model produces clean JSON and the runtime
        //      auto-parses it before handing it back. This is the common case
        //      for Llama 3.3 70b in late-2024/2025 runtimes.
        //   2. aiResp.response is a string — older runtime, or model emitted
        //      prose around the JSON. Need to regex-extract + JSON.parse.
        //   3. Other wrapper shapes (string, choices[], result).
        let parsed = null;

        // Case 1: structured-output already parsed
        if (aiResp && typeof aiResp.response === 'object' && aiResp.response !== null && !Array.isArray(aiResp.response)) {
          if (typeof aiResp.response.reply === 'string' || aiResp.response.pick !== undefined) {
            parsed = {
              reply: aiResp.response.reply || '',
              pick: aiResp.response.pick || null,
            };
            console.log('[chat] using pre-parsed structured response');
          }
        }

        // Case 2/3: extract a string from whatever shape we got, then regex+parse
        if (!parsed) {
          let text = '';
          if (typeof aiResp === 'string') text = aiResp;
          else if (aiResp && typeof aiResp.response === 'string') text = aiResp.response;
          else if (aiResp && aiResp.response && typeof aiResp.response.text === 'string') text = aiResp.response.text;
          else if (aiResp && typeof aiResp.result === 'string') text = aiResp.result;
          else if (aiResp && aiResp.result && typeof aiResp.result.response === 'string') text = aiResp.result.response;
          else if (aiResp && Array.isArray(aiResp.choices) && aiResp.choices[0] && aiResp.choices[0].message) {
            text = aiResp.choices[0].message.content || '';
          }
          else { text = JSON.stringify(aiResp).slice(0, 2000); }
          console.log('[chat] extracted text length:', text.length);

          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch (e) {
              console.log('[chat] JSON parse failed:', e.message);
              parsed = { reply: text.slice(0, 500), pick: null, parse_error: true };
            }
          } else {
            parsed = { reply: text.slice(0, 500) || '(no response)', pick: null };
          }
        }
        return jsonResponse(parsed);
      } catch (e) {
        console.log('[chat] uncaught', e.stack || e.message);
        return jsonResponse({ error: e.message || String(e) }, 500);
      }
    }

    // GET /cron/check-alerts — fired by Cloudflare Cron Trigger.
    // Walks every subscribed user, fetches their state from SYNC_KV,
    // checks queued/watching items against TMDB watch/providers, and
    // queues notifications for any provider that disappeared.
    if (path === '/cron/check-alerts' && method === 'GET') {
      // Permit either the secret (manual trigger) OR same-host scheduled
      // event. Cloudflare's scheduled handler calls fetch with a special
      // user-agent or path; we just gate on the shared secret here so the
      // user can trigger a manual check via curl during testing.
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const summary = await runAlertsCheck(env);
      return jsonResponse(summary);
    }

    return new Response('Not found', { status: 404, headers: cors });
  },

  // Cloudflare Cron Trigger handler. Schedule is declared in
  // worker/wrangler.toml — currently `0 13 * * *` (daily 13:00 UTC,
  // 8 AM Central). Two cron tasks chained via Promise.all so neither
  // blocks the other and the entire run shows up under one event.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const t0 = Date.now();
      console.log('[cron] start', new Date().toISOString());
      const [alerts, backup] = await Promise.all([
        runAlertsCheck(env).catch(e => ({ error: e.message })),
        runStateBackup(env).catch(e => ({ error: e.message })),
      ]);
      console.log('[cron] done in', Date.now() - t0, 'ms', JSON.stringify({ alerts, backup }));
    })());
  },
};

// === v5.6: Alerts cron worker ===
async function runAlertsCheck(env) {
  if (!env.ALERTS) {
    console.log('[alerts] ALERTS binding missing — skipping');
    return { skipped: 'no-alerts-binding' };
  }
  const subList = await env.ALERTS.list({ prefix: 'sub:' });
  console.log('[alerts] checking', subList.keys.length, 'subscribers');
  let usersChecked = 0, notificationsQueued = 0, lookupsRun = 0, pushesSent = 0, pushesGone = 0;

  for (const k of subList.keys) {
    const userHash = k.name.slice('sub:'.length);
    const subRaw = await env.ALERTS.get(k.name);
    if (!subRaw) continue;
    let sub;
    try { sub = JSON.parse(subRaw); } catch { continue; }
    if (!sub.enabled) continue;
    const region = sub.region || 'US';
    const items = Array.isArray(sub.items) ? sub.items : [];
    if (items.length === 0) continue;

    // Cross-check user's state from SYNC_KV: only fire on items still
    // marked queued or watching at cron time. This protects against stale
    // subscription manifests.
    const stateRaw = await env.SYNC_KV.get(`user:${userHash}`);
    let activeIds = null;
    if (stateRaw) {
      try {
        const stateBlob = JSON.parse(stateRaw);
        const userState = (stateBlob && stateBlob.state) || stateBlob || {};
        activeIds = new Set();
        Object.keys(userState).forEach(tab => {
          const tabState = userState[tab];
          if (!tabState || typeof tabState !== 'object') return;
          Object.keys(tabState).forEach(id => {
            const e = tabState[id];
            if (!e) return;
            if (e.status === 'queued' || e.status === 'watching') activeIds.add(`${tab}|${id}`);
          });
        });
      } catch {}
    }

    const snapRaw = await env.ALERTS.get(`snap:${userHash}`);
    let snapshot = {};
    try { snapshot = snapRaw ? JSON.parse(snapRaw) : {}; } catch { snapshot = {}; }
    const newSnapshot = {};

    for (const it of items) {
      if (!it || !it.itemId || !it.tabId) continue;
      const ref = `${it.tabId}|${it.itemId}`;
      if (activeIds && !activeIds.has(ref)) continue; // dropped or watched since
      const enrichment = await tmdbLookup(env, it.title, it.year, it.type === 'tv' ? 'tv' : 'movie', it.tmdbId || null);
      lookupsRun++;
      if (!enrichment || !enrichment.found) continue;
      const regionProviders = enrichment.watchProviders && enrichment.watchProviders[region];
      const flatrate = (regionProviders && regionProviders.flatrate) || [];
      const currentNames = flatrate.map(p => p.provider_name).sort();
      const previous = snapshot[ref] || null;
      const previousNames = previous ? previous.providers : null;
      newSnapshot[ref] = { providers: currentNames, ts: Date.now() };
      if (previousNames && previousNames.length > 0) {
        const dropped = previousNames.filter(p => !currentNames.includes(p));
        if (dropped.length > 0) {
          const ts = Date.now();
          const notifKey = `notif:${userHash}:${ts}_${Math.random().toString(36).slice(2, 8)}`;
          const dropList = dropped.join(', ');
          const notif = {
            ts,
            title: `${it.title} leaving ${dropList}`,
            body: `${it.title} (${it.year}) is no longer streaming on ${dropList} in ${region}. Catch it before it's gone.`,
            itemRef: ref,
            tabId: it.tabId,
            itemId: it.itemId,
          };
          // Always queue for the polling-fallback path
          await env.ALERTS.put(notifKey, JSON.stringify(notif), { expirationTtl: 30 * 24 * 60 * 60 });
          notificationsQueued++;
          // v5.8: also send a Web Push if the subscriber has a push
          // subscription stored. Best-effort — failures don't fail the cron;
          // the polling queue catches up next time the app opens.
          if (sub.push && sub.push.endpoint && sub.push.keys && sub.push.keys.p256dh && sub.push.keys.auth) {
            const pushResult = await sendWebPush(sub.push, notif, env);
            if (pushResult.ok) {
              pushesSent++;
              console.log('[push] sent', pushResult.status, 'for', it.title);
            } else if (pushResult.status === 410) {
              // 410 Gone — subscription expired or unsubscribed at the push
              // service. Drop our copy so the next cron run skips it.
              pushesGone++;
              console.log('[push] 410 Gone — dropping subscription for user', userHash.slice(0, 8));
              const cleaned = { ...sub, push: null };
              await env.ALERTS.put(`sub:${userHash}`, JSON.stringify(cleaned));
            } else {
              console.log('[push] failed', pushResult.status || 'no-status', pushResult.error || 'no-error');
            }
          }
        }
      }
    }
    await env.ALERTS.put(`snap:${userHash}`, JSON.stringify(newSnapshot));
    usersChecked++;
  }
  const summary = { usersChecked, notificationsQueued, lookupsRun, pushesSent, pushesGone, ranAt: Date.now() };
  console.log('[alerts] done', JSON.stringify(summary));
  return summary;
}

// === v5.10: Daily R2 state backups ===
//
// Walks every SYNC_KV `user:HASH` blob, gzips it via the native
// CompressionStream API, writes to R2 under
// `state/{YYYY-MM-DD}/{userHash}.json.gz`. Free-tier R2 (10 GB + 1M
// Class A ops/month) is wildly over-provisioned for a single-user
// PWA — even at 60 KB/blob × 365 days × 10 users that's ~220 MB/year.
// No retention policy in code; configure via R2 lifecycle rules in
// the dashboard if needed.
//
// Independence from the alerts cron: gzipping + R2 write per user is
// fast (sub-100ms typical), runs in parallel with runAlertsCheck so
// the wall-clock cost of the daily run is whichever is slower, not
// the sum.
async function runStateBackup(env) {
  if (!env.BACKUPS) {
    console.log('[backup] BACKUPS binding missing — skipping');
    return { skipped: 'no-r2-binding' };
  }
  if (!env.SYNC_KV) {
    console.log('[backup] SYNC_KV binding missing — skipping');
    return { skipped: 'no-sync-kv' };
  }
  const userList = await env.SYNC_KV.list({ prefix: 'user:' });
  console.log('[backup] backing up', userList.keys.length, 'users');
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let written = 0, bytesIn = 0, bytesOut = 0, errors = 0;

  for (const k of userList.keys) {
    const userHash = k.name.slice('user:'.length);
    try {
      const raw = await env.SYNC_KV.get(k.name);
      if (!raw) continue;
      bytesIn += raw.length;
      const gz = await gzipString(raw);
      bytesOut += gz.byteLength;
      await env.BACKUPS.put(`state/${date}/${userHash}.json.gz`, gz, {
        httpMetadata: {
          contentType: 'application/json',
          contentEncoding: 'gzip',
        },
        customMetadata: {
          userHash,
          rawBytes: String(raw.length),
          ts: String(Date.now()),
        },
      });
      written++;
    } catch (e) {
      errors++;
      console.log('[backup] failed for', userHash.slice(0, 8), e.message);
    }
  }
  const summary = { date, written, errors, bytesIn, bytesOut, compressionRatio: bytesIn ? Math.round((1 - bytesOut / bytesIn) * 100) : 0, ranAt: Date.now() };
  console.log('[backup] done', JSON.stringify(summary));
  return summary;
}

// Gzip a string via the native CompressionStream API and return the
// compressed bytes as a Uint8Array. Cloudflare Workers support
// CompressionStream natively — no pako or other library needed.
async function gzipString(s) {
  const stream = new Response(s).body.pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// === v5.11: D1 viewing-history helpers ===
//
// `insertViewToD1` is called from the dual-write path on /webhook and
// /viewed/ingest. INSERT OR IGNORE on the primary key (id) is what
// keeps the migration backfill idempotent — re-running migrate doesn't
// double-insert events that already landed via the dual-write path
// since the original deploy.
async function insertViewToD1(env, record) {
  if (!env.D1_VIEWED) return false;
  await env.D1_VIEWED.prepare(
    `INSERT OR IGNORE INTO views
     (id, event, ts, rating_key, guid, title, year, type, library_section_id,
      grandparent_title, parent_index, ep_index, rating, source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    record.id, record.event, record.ts,
    record.ratingKey || null, record.guid || null,
    record.title || null, record.year || null, record.type || null,
    record.librarySectionID || null,
    record.grandparentTitle || null,
    record.parentIndex || null,
    record.index || null,
    record.rating || null,
    record.source || null
  ).run();
  return true;
}

// Chunked migration of the VIEWED KV namespace into the D1 `views`
// table. Free-tier Workers cap CPU time per request at 10 ms, so
// walking thousands of records in one HTTP call blows the budget and
// throws 1101. The chunked API processes up to `opts.limit` records
// per call (default 500), uses Promise.all on the inserts so D1 round
// trips amortize, and returns a continuation cursor.
//
// Calling pattern:
//   GET /cron/migrate-viewed-to-d1?secret=...
//   → returns { scanned, inserted, errors, cursor, done }
//   if !done, repeat: GET /cron/migrate-viewed-to-d1?secret=...&cursor=ABC
async function migrateViewedToD1(env, opts) {
  if (!env.D1_VIEWED || !env.VIEWED) {
    return { error: 'D1_VIEWED or VIEWED binding missing' };
  }
  const limit = (opts && opts.limit) || 500;
  const startCursor = (opts && opts.cursor) || undefined;
  console.log('[d1-migrate] chunk start cursor=', startCursor || '<begin>', 'limit=', limit);
  const list = await env.VIEWED.list({ cursor: startCursor, limit });
  const records = [];
  for (const k of list.keys) {
    try {
      const v = await env.VIEWED.get(k.name);
      if (!v) continue;
      records.push(JSON.parse(v));
    } catch (e) {
      console.log('[d1-migrate] read/parse failed', k.name, e.message);
    }
  }
  // Insert each record individually with per-row try/catch so a single
  // bad row doesn't fail the chunk. If we ever go wide enough to want
  // batched D1 statements, env.D1_VIEWED.batch([...]) is the API.
  let inserted = 0, errors = 0;
  for (const rec of records) {
    try {
      await insertViewToD1(env, rec);
      inserted++;
    } catch (e) {
      errors++;
      console.log('[d1-migrate] insert failed for', rec && rec.id, e.message);
    }
  }
  const summary = {
    scanned: records.length,
    inserted,
    errors,
    cursor: list.list_complete ? null : list.cursor,
    done: !!list.list_complete,
    ranAt: Date.now(),
  };
  console.log('[d1-migrate] chunk done', JSON.stringify(summary));
  return summary;
}
