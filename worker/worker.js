// WatchTrack ↔ Plex bridge (v5.9 — adds /alerts/test-fire debug endpoint)
//
// Endpoints:
//   POST /webhook/{secret}              Plex Pass webhook receiver
//   GET  /events?secret=X&since=TS      WatchTrack polls for new scrobble events
//   POST /events/ack                    WatchTrack acks events processed
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
//   GET  /alerts/test-fire?secret=X&user=HASH   v5.9: send a test push to verify delivery
//   GET  /                              health check
//
// KV bindings expected (variable names must match exactly):
//   EVENTS      — webhook scrobble events queued for WatchTrack to pull
//   CONFIG      — { "secret": "...", "tmdb_token": "...", "plex_url": "...", "plex_token": "..." }
//   VIEWED      — full Plex viewing history
//   METADATA    — TMDB enrichment cache
//   PROMOTIONS  — orphan promotions persisted across devices
//   SYNC_KV     — v5.4: cross-device state sync blobs, keyed by user:HASH
//   ALERTS      — v5.6: per-user alert subscription, snapshot, and notification queue

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
      return new Response('WatchTrack-Plex bridge online (v5.9 — /alerts/test-fire debug endpoint)', { headers: cors });
    }

    // v5.7: per-IP rate limit. Applies to every other route. Returns 429
    // with a Retry-After header when the bucket is full.
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
    const rl = await checkRateLimit(env, ip);
    if (!rl.ok) {
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

        // Always log to VIEWED (durable history, no TTL — keeps every play)
        const viewedKey = `view:${record.ts}_${eventId}`;
        await env.VIEWED.put(viewedKey, JSON.stringify(record));

        // Only forward scrobble + rate events to EVENTS queue (with TTL — pulled by WT, then deleted)
        if (record.event === 'media.scrobble' || record.event === 'media.rate') {
          await env.EVENTS.put(eventId, JSON.stringify(record), { expirationTtl: 7 * 24 * 60 * 60 });
        }
        return new Response('OK', { status: 200, headers: cors });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === WatchTrack polls for new events ===
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

    // === WatchTrack confirms events processed ===
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
          stored++;
        }
        return jsonResponse({ stored, filtered });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // === List all logged views (for History modal in WT) ===
    if (path === '/viewed/list' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const cursor = url.searchParams.get('cursor') || undefined;
      // KV list is paginated; lower limit to keep response time reasonable
      const list = await env.VIEWED.list({ cursor, limit: 500 });
      // Parallel reads with concurrency control — sequential await on 500 keys would blow past Worker timeout
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
    // by WatchTrack), so the same Plex account on multiple devices produces the
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
        title: 'WatchTrack test notification',
        body: 'If you see this, Web Push is working end-to-end.',
        itemRef: 'test',
        tabId: '',
        itemId: '',
        ts: Date.now(),
      }, env);
      return jsonResponse(result);
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

  // Cloudflare Cron Trigger handler. The trigger is configured in the
  // dashboard (Settings → Triggers → Cron Triggers); cron expression
  // recommended in DEPLOY.md is `0 13 * * *` (daily 13:00 UTC, 8 AM Central).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlertsCheck(env));
  },
};

// === v5.6: Alerts cron worker ===
async function runAlertsCheck(env) {
  const subList = await env.ALERTS.list({ prefix: 'sub:' });
  let usersChecked = 0, notificationsQueued = 0, lookupsRun = 0;

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
            if (!pushResult.ok && pushResult.status === 410) {
              // 410 Gone — subscription expired or unsubscribed at the push
              // service. Drop our copy so the next cron run skips it.
              const cleaned = { ...sub, push: null };
              await env.ALERTS.put(`sub:${userHash}`, JSON.stringify(cleaned));
            }
          }
        }
      }
    }
    await env.ALERTS.put(`snap:${userHash}`, JSON.stringify(newSnapshot));
    usersChecked++;
  }
  return { usersChecked, notificationsQueued, lookupsRun, ranAt: Date.now() };
}
