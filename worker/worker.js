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

// v9.0.0 — CORS lockdown. Pre-v9 used '*' which let any browser origin
// read responses. v9 narrows to a single production origin and allows
// the new auth headers. Server-to-server callers (Plex webhook, curl,
// background CF cron) don't send Origin and aren't affected.
//
// `cors` stays a const because 80+ call sites spread it as
// `{ ...cors, ... }`; corsHeaders(request) is the request-aware
// equivalent and is used by the OPTIONS preflight handler so dev
// origins (localhost) work even though they're not the production
// default.
const ALLOWED_ORIGINS = new Set([
  'https://bicyclecrasher.github.io',
  'http://localhost:8000',
  'http://localhost:5173',
  'http://localhost:8787',
]);
const CORS_DEFAULT_ORIGIN = 'https://bicyclecrasher.github.io';
const cors = {
  'Access-Control-Allow-Origin': CORS_DEFAULT_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
  'Vary': 'Origin',
};
function corsHeaders(request) {
  const origin = request?.headers?.get?.('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : CORS_DEFAULT_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
    'Vary': 'Origin',
  };
}

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

// === v8.0.0 — Credential vault helpers ===
//
// SHA-256(plex_token) → user_id. Backward-compatible with the v5.4 sync
// scheme that uses the same hash as the SYNC_KV key. Stored in D1 users
// row at bootstrap and reused everywhere as the stable user identity.
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Reads Plex creds with v8.0.0-first preference: Worker secret PLEX_TOKEN
// (set by /bootstrap/credentials via the Cloudflare API) overrides the
// legacy CONFIG KV value. plex_url stays in CONFIG KV — it's not a secret.
async function getPlexCreds(env) {
  const plexToken = (env.PLEX_TOKEN && String(env.PLEX_TOKEN).trim())
    || await env.CONFIG.get('plex_token');
  const plexUrl = await env.CONFIG.get('plex_url');
  return { plexToken, plexUrl };
}

// Returns a non-expired Trakt access token for user_id. Auto-refreshes if
// within 60s of expiry and persists the new pair to D1. Throws if the
// user isn't bootstrapped, isn't connected to Trakt, or refresh fails.
//
// v9.0.0: Trakt tokens are AES-GCM encrypted at rest. Rows written
// before the migration may still hold plaintext — detected by
// trakt_token_iv being null. The plaintext path stays in place for
// the (brief) interval between deploying v9.0.0 and Lincoln's device
// posting /migrate; once the migration runs, every row has an iv.
async function getValidTraktToken(env, userId) {
  if (!env.D1_VIEWED) throw new Error('D1_VIEWED binding missing');
  const row = await env.D1_VIEWED.prepare(
    'SELECT trakt_access_token, trakt_refresh_token, trakt_expires_at, trakt_token_iv FROM users WHERE user_id=?'
  ).bind(userId).first();
  if (!row || !row.trakt_access_token) throw new Error('Trakt not connected for this user');

  const accessToken = row.trakt_token_iv
    ? await decryptTraktSecret(env, row.trakt_access_token, row.trakt_token_iv)
    : row.trakt_access_token;
  const refreshToken = row.trakt_token_iv
    ? await decryptTraktSecret(env, row.trakt_refresh_token, row.trakt_token_iv)
    : row.trakt_refresh_token;

  if (row.trakt_expires_at && row.trakt_expires_at > Date.now() + 60_000) {
    return accessToken;
  }
  if (!env.TRAKT_CLIENT_ID || !env.TRAKT_CLIENT_SECRET) {
    throw new Error('Missing TRAKT_CLIENT_ID / TRAKT_CLIENT_SECRET Worker secrets');
  }
  const r = await fetch('https://api.trakt.tv/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: env.TRAKT_CLIENT_ID,
      client_secret: env.TRAKT_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Trakt refresh ${r.status}: ${t.slice(0, 200)}`);
  }
  const tok = await r.json();
  const expiresAt = Date.now() + (tok.expires_in || 7776000) * 1000;

  // Always write back encrypted, even if we just decrypted plaintext —
  // refreshing is a natural opportunity to upgrade legacy rows.
  const { ct: accessCt, iv: newIv } = await encryptTraktSecret(env, tok.access_token);
  const { ct: refreshCt } = await encryptTraktSecret(env, tok.refresh_token);
  await env.D1_VIEWED.prepare(
    'UPDATE users SET trakt_access_token=?, trakt_refresh_token=?, trakt_expires_at=?, trakt_token_iv=? WHERE user_id=?'
  ).bind(accessCt, refreshCt, expiresAt, newIv, userId).run();
  return tok.access_token;
}

// Wrapper for Trakt API calls — auto-refreshes the token and sets the
// required headers. Returns the raw Response so callers can decide
// whether to .json() or just check .ok.
async function traktFetch(env, userId, path, init = {}) {
  const token = await getValidTraktToken(env, userId);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'trakt-api-version': '2',
    'trakt-api-key': env.TRAKT_CLIENT_ID,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };
  return fetch(`https://api.trakt.tv${path}`, { ...init, headers });
}

// PUT a Worker secret via the Cloudflare API. Used by /bootstrap/credentials
// to promote local creds (PLEX_TOKEN, TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET)
// from the device's localStorage into the Worker's encrypted secret store.
// Requires env.ADMIN_API_TOKEN (Workers Scripts:Edit) and env.CF_ACCOUNT_ID,
// both set manually via the Cloudflare dashboard before first promote.
async function setWorkerSecret(env, name, value) {
  if (!env.ADMIN_API_TOKEN) throw new Error('ADMIN_API_TOKEN not configured (set via dashboard before promote)');
  if (!env.CF_ACCOUNT_ID) throw new Error('CF_ACCOUNT_ID not configured (set via dashboard before promote)');
  const scriptName = (env.CF_WORKER_NAME && String(env.CF_WORKER_NAME)) || 'watchtrack-plex';
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${scriptName}/secrets`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.ADMIN_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, text: value, type: 'secret_text' }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`CF API secret PUT ${name} failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return true;
}

// Push a watch event to Trakt's /sync/history. tmdbId is the canonical
// identifier; type is 'movie' or 'show' (Trakt uses 'episode' implicitly
// when the show has season+episode metadata, but for top-level scrobbles
// we only need movie vs show). Returns { ok, status } so the caller can
// decide whether to mark the row pushed_to_trakt=1.
async function pushScrobbleToTrakt(env, userId, { tmdbId, type, watchedTs }) {
  const isoTs = new Date(watchedTs || Date.now()).toISOString();
  const body = type === 'movie'
    ? { movies: [{ watched_at: isoTs, ids: { tmdb: tmdbId } }] }
    : { shows:  [{ watched_at: isoTs, ids: { tmdb: tmdbId } }] };
  const r = await traktFetch(env, userId, '/sync/history', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status };
}

// INSERT into watch_history (idempotent on (user_id, tmdb_id, watched_ts)
// is not enforced by schema; callers should de-dupe upstream if needed).
async function recordWatch(env, userId, { itemId, tmdbId, source, title, year, type, watchedTs, deviceId, pushedToTrakt }) {
  if (!env.D1_VIEWED) return false;
  await env.D1_VIEWED.prepare(
    `INSERT INTO watch_history
     (user_id, item_id, tmdb_id, source, title, year, type, watched_ts, device_id, pushed_to_trakt)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    userId,
    itemId || null,
    tmdbId || null,
    source,
    title || null,
    year || null,
    type || null,
    watchedTs,
    deviceId || null,
    pushedToTrakt ? 1 : 0
  ).run();
  return true;
}

// ════════════════════════════════════════════════════════════════════
// === v9.0.0 — Multi-user identity, auth, and crypto helpers ===
// ════════════════════════════════════════════════════════════════════
//
// User identities are UUID v4 (was SHA-256(plex_token) pre-migration).
// Each device gets a 256-bit random authToken at registration / pair
// time; we store SHA-256(token) under device:{deviceId} in USERS KV and
// never persist the plaintext token. Bearer auth resolves
//   Authorization: Bearer {token} + X-Device-Id: {deviceId}
// to device record → userId, then scopes every read/write to that
// userId. The legacy ?secret=CONFIG.secret query param still works
// (Lincoln backdoor) and resolves to the admin singleton's userId.

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function randomUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// 256-bit random base64url string. Used for bearer authTokens
// (entropy that survives a leaked KV scan), pair-session IDs, and
// invite/reconnect codes.
function genAuthToken() {
  return b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
}

// 96-bit base64url — short enough for a copy-paste URL, big enough that
// guessing an invite or pair code is computationally hopeless.
function genShortCode() {
  return b64uEncode(crypto.getRandomValues(new Uint8Array(12)));
}

// Cached AES-GCM key for Trakt token encryption. Reading the secret on
// every call is fine (Workers caches env access) but importKey costs a
// few hundred microseconds — keep the imported key in module scope.
let _traktAesKey = null;
async function getTraktAesKey(env) {
  if (_traktAesKey) return _traktAesKey;
  const raw = env.TRAKT_ENCRYPTION_KEY;
  if (!raw) throw new Error('TRAKT_ENCRYPTION_KEY secret not configured');
  // Accept base64 or base64url. Normalize to base64url before decoding.
  const normalized = String(raw).trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  let keyBytes;
  try { keyBytes = b64uDecode(normalized); }
  catch { throw new Error('TRAKT_ENCRYPTION_KEY must be base64-encoded'); }
  if (keyBytes.length !== 32) throw new Error(`TRAKT_ENCRYPTION_KEY must decode to 32 bytes (got ${keyBytes.length})`);
  _traktAesKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return _traktAesKey;
}

// Encrypt one Trakt token with a fresh per-call IV. Both fields are
// base64url. Stored side-by-side in D1 (access_token + iv columns;
// refresh token uses the SAME iv since they're encrypted in pair).
async function encryptTraktSecret(env, plaintext) {
  if (plaintext == null || plaintext === '') return { ct: null, iv: null };
  const key = await getTraktAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { ct: b64uEncode(new Uint8Array(ctBuf)), iv: b64uEncode(iv) };
}

async function decryptTraktSecret(env, ct, iv) {
  if (!ct || !iv) return null;
  const key = await getTraktAesKey(env);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uDecode(iv) }, key, b64uDecode(ct));
  return new TextDecoder().decode(ptBuf);
}

// Resolve the caller's identity for a request. Returns
//   { userId, deviceId, viaLegacy }   on success
//   null                              when neither auth path applies
//
// Three paths:
//   A) Authorization: Bearer {token} + X-Device-Id: {deviceId}
//      → KV device:{deviceId} → { userId, authTokenHash }
//      → SHA-256(token) must match authTokenHash
//   B) ?secret=CONFIG.secret (Lincoln pre-migration backdoor)
//      → resolves to USERS:admin.userId if the singleton exists,
//        otherwise userId=null so /migrate can still proceed.
//   C) Neither — return null; route handler decides whether to allow.
async function resolveAuth(env, request, url) {
  const u = url || new URL(request.url);
  const authHeader = request.headers.get('Authorization') || '';
  const deviceId = request.headers.get('X-Device-Id') || '';
  if (authHeader.startsWith('Bearer ') && deviceId) {
    const token = authHeader.slice(7).trim();
    if (token && env.USERS) {
      const rec = await env.USERS.get(`device:${deviceId}`, { type: 'json' });
      if (rec && rec.userId && rec.authTokenHash) {
        const incoming = await sha256Hex(token);
        if (incoming === rec.authTokenHash) {
          // Best-effort lastSeen bump (skip if touched within last 60s).
          if (!rec.lastSeen || Date.now() - rec.lastSeen > 60_000) {
            env.USERS.put(`device:${deviceId}`, JSON.stringify({ ...rec, lastSeen: Date.now() })).catch(() => {});
          }
          return { userId: rec.userId, deviceId, viaLegacy: false };
        }
      }
    }
  }
  const providedSecret = u.searchParams.get('secret');
  if (providedSecret && await checkSecret(env, providedSecret)) {
    const admin = env.USERS ? await env.USERS.get('admin', { type: 'json' }) : null;
    return { userId: admin?.userId || null, deviceId: null, viaLegacy: true };
  }
  return null;
}

// Convenience wrappers — return { error: Response } or { auth }. The
// route handler can `const r = await requireBearer(...); if (r.error) return r.error;`
async function requireBearer(env, request, url) {
  const auth = await resolveAuth(env, request, url);
  if (!auth || !auth.userId) return { error: jsonResponse({ error: 'unauthorized' }, 401) };
  return { auth };
}

async function requireAdmin(env, request, url) {
  const r = await requireBearer(env, request, url);
  if (r.error) return r;
  const row = env.D1_VIEWED
    ? await env.D1_VIEWED.prepare('SELECT role FROM users WHERE user_id=?').bind(r.auth.userId).first()
    : null;
  if (!row || row.role !== 'admin') return { error: jsonResponse({ error: 'admin only' }, 403) };
  return { auth: r.auth };
}

// ════════════════════════════════════════════════════════════════════
// === v9.0.0 — Pair-session SSE plumbing ===
// ════════════════════════════════════════════════════════════════════
//
// QR pairing: a TV opens /pair/begin, gets a pairSessionId, renders a
// QR encoding ?p={pairSessionId}, and listens on /pair/wait via SSE.
// A phone scans the QR, POSTs /pair/confirm with bearer auth, and the
// worker pushes the new device's auth creds to the TV's SSE stream.
//
// Constraint: Cloudflare Workers serves multiple requests across
// isolates. The in-memory Map below only works when /pair/wait and
// /pair/confirm hit the SAME isolate. For 5–20 users with bursty
// pairing, the failure case (different isolates) just means the TV's
// SSE stream times out and the user retries. A Durable Object backing
// would lift this limit; deferred to v9.1.

const _pairWaiters = new Map(); // sessionId → WritableStreamDefaultWriter

async function pushPairEvent(sessionId, payload) {
  const writer = _pairWaiters.get(sessionId);
  if (!writer) return false;
  try {
    const line = `event: paired\ndata: ${JSON.stringify(payload)}\n\n`;
    await writer.write(new TextEncoder().encode(line));
    await writer.close();
  } catch {}
  _pairWaiters.delete(sessionId);
  return true;
}

// ════════════════════════════════════════════════════════════════════
// === v9.0.0 — One-shot migration to UUID v4 user_ids ===
// ════════════════════════════════════════════════════════════════════
//
// Runs at most once per Worker lifetime. Gated by the USERS:admin
// singleton: if it exists, we've migrated; bail. If it doesn't, walk
// every data store that's keyed by the old SHA-256(plex_token) user_id
// and rewrite to a fresh UUID v4.
//
// Idempotent at the function level — the singleton write is the LAST
// step, so any failure mid-migration just means the next call re-runs.
// All D1 statements are SET to the same lincolnUuid so re-running
// produces no double-writes (UPDATE is naturally idempotent;
// INSERT uses ON CONFLICT(user_id) DO NOTHING).

async function ensureMigration(env, displayNameOverride) {
  if (!env.USERS) throw new Error('USERS KV binding missing — set up the namespace first');
  if (!env.D1_VIEWED) throw new Error('D1_VIEWED binding missing');

  const existing = await env.USERS.get('admin', { type: 'json' });
  if (existing && existing.userId) {
    return { alreadyMigrated: true, lincolnUuid: existing.userId };
  }

  // Find Lincoln's old user_id (SHA-256 of his plex_token). Tolerate
  // missing PLEX_TOKEN secret by falling back to the legacy CONFIG KV.
  const plexToken = (env.PLEX_TOKEN && String(env.PLEX_TOKEN).trim())
    || await env.CONFIG.get('plex_token');
  const oldUserId = plexToken ? await sha256Hex(plexToken) : null;

  const lincolnUuid = randomUuid();
  const now = Date.now();
  const displayName = displayNameOverride
    || env.BOOTSTRAP_ADMIN_DISPLAY_NAME
    || 'Lincoln';

  // Step 1 — read Lincoln's existing D1 row (if any) and create a new
  // row at lincolnUuid with role=admin, display_name set, Trakt tokens
  // re-encrypted.
  let oldRow = null;
  if (oldUserId) {
    oldRow = await env.D1_VIEWED.prepare(
      'SELECT * FROM users WHERE user_id=?'
    ).bind(oldUserId).first();
  }

  const { ct: accessCt, iv: accessIv } = await encryptTraktSecret(env, oldRow?.trakt_access_token || null);
  const { ct: refreshCt } = oldRow?.trakt_refresh_token
    ? await encryptTraktSecret(env, oldRow.trakt_refresh_token)
    : { ct: null };
  // Refresh shares the access IV — both columns rotate together so a
  // single IV is enough and we save the column.

  await env.D1_VIEWED.prepare(
    `INSERT INTO users
       (user_id, plex_server_url, plex_client_id,
        trakt_access_token, trakt_refresh_token, trakt_expires_at, trakt_username,
        streaming_region, my_subscriptions, bootstrapped, created_ts,
        display_name, role, last_seen, settings, trakt_token_iv)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?,'admin',?,?,?)
     ON CONFLICT(user_id) DO NOTHING`
  ).bind(
    lincolnUuid,
    oldRow?.plex_server_url || null,
    oldRow?.plex_client_id || null,
    accessCt,
    refreshCt,
    oldRow?.trakt_expires_at || null,
    oldRow?.trakt_username || null,
    oldRow?.streaming_region || null,
    oldRow?.my_subscriptions || null,
    oldRow?.created_ts || now,
    displayName,
    now,
    '{}',
    accessIv
  ).run();

  // Step 2 — rewrite the user_id on every dependent table.
  if (oldUserId) {
    await env.D1_VIEWED.prepare(
      'UPDATE watch_history SET user_id=? WHERE user_id=?'
    ).bind(lincolnUuid, oldUserId).run();
  }
  // palate had no user_id before migration 003 — backfill all rows.
  await env.D1_VIEWED.prepare(
    'UPDATE palate SET user_id=? WHERE user_id IS NULL'
  ).bind(lincolnUuid).run();

  // Step 3 — drop Lincoln's old D1 users row. The new lincolnUuid row
  // is the canonical record from here on.
  if (oldUserId && oldUserId !== lincolnUuid) {
    await env.D1_VIEWED.prepare('DELETE FROM users WHERE user_id=?').bind(oldUserId).run();
  }

  // Step 4 — pointer records. webhook_user_id makes Plex's webhook
  // attribute incoming events to the new UUID; admin singleton in
  // USERS KV is what gates all future migration runs.
  await env.CONFIG.put('webhook_user_id', lincolnUuid);
  await env.USERS.put('admin', JSON.stringify({ userId: lincolnUuid, migratedAt: now, legacyHash: oldUserId }));

  // SYNC_KV / ALERTS / PROMOTIONS / R2 backups intentionally stay at
  // their existing `user:{hash}` / `sub:{hash}` / `promo:{tab}:{itemId}`
  // / `state/{date}/{hash}.json.gz` shapes during Phase 1. Lincoln's
  // current client code still computes the hash from his plex_token
  // and references those keys directly; rekeying them now would break
  // every sync/alert/promotions call until Phase 4 swaps the client
  // to bearer-scoped endpoints. The legacyHash we stashed in the admin
  // singleton above tells Phase 4 what the old prefix was.

  const summary = {
    alreadyMigrated: false,
    lincolnUuid,
    oldUserId,
    displayName,
    note: 'KV/R2 rekey deferred to Phase 4',
  };
  console.log('MIGRATION_COMPLETE', JSON.stringify(summary));
  return summary;
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

// v9.0.0 — per-user rate limit using minute-resolution buckets in
// USERS KV. Three buckets per user, each separately tunable:
//
//   chat     30/hour    /chat
//   meta    200/hour    /metadata/lookup, /metadata/bulk
//   default 600/hour    everything else (after a route handler proves
//                       the caller is authenticated)
//
// Sliding window via two adjacent minutes summed — keeps a request
// that just rolled into a new minute from immediately spending the
// full quota again. Each minute bucket has a 2-minute TTL so old
// counts auto-evict.
const PER_USER_LIMITS = { chat: 30, meta: 200, default: 600 };

function bucketForPath(path) {
  if (path === '/chat') return 'chat';
  if (path.startsWith('/metadata/')) return 'meta';
  return 'default';
}

async function checkUserRateLimit(env, userId, bucket) {
  if (!env.USERS || !userId) return { ok: true };
  const limit = PER_USER_LIMITS[bucket] || PER_USER_LIMITS.default;
  const now = Date.now();
  const curMin = Math.floor(now / 60_000);
  const prevMin = curMin - 1;
  const keyCur = `ratelimit:${userId}:${bucket}:${curMin}`;
  const keyPrev = `ratelimit:${userId}:${bucket}:${prevMin}`;
  // Read both buckets in parallel; treat parse failures as 0.
  const [rawCur, rawPrev] = await Promise.all([
    env.USERS.get(keyCur),
    env.USERS.get(keyPrev),
  ]);
  const cur = parseInt(rawCur || '0', 10);
  const prev = parseInt(rawPrev || '0', 10);
  // Sliding-window estimate: weight the previous minute by how much
  // of it has rolled off.
  const elapsedFrac = (now % 60_000) / 60_000;
  const estimate = Math.ceil(prev * (1 - elapsedFrac)) + cur;
  if (estimate >= limit) {
    // Retry-After: seconds until the previous minute fully rolls off.
    const retryAfter = Math.max(1, Math.ceil((60_000 - (now % 60_000)) / 1000));
    return { ok: false, retryAfter, limit, count: estimate };
  }
  // Increment current bucket (best-effort; race-tolerant by design).
  await env.USERS.put(keyCur, String(cur + 1), { expirationTtl: 120 });
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

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

    // Health (no rate limit, no auth)
    if (path === '/' || path === '/health') {
      return new Response('CinéMath-Plex bridge online (v5.14 — /palate/predict-tags via Claude Sonnet 4.6)', { headers: cors });
    }

    // v9.0.0 — Layered rate limit:
    //   1. Per-IP (60/min) for everyone, defends unauthenticated routes
    //      (/register, /pair/*) from a single noisy client.
    //   2. Per-user (bucket-specific) for authenticated callers, which
    //      lets us hold AI/Workers-AI spend predictable per family member.
    //
    // We resolve auth opportunistically up here (failure is fine — many
    // routes are unauthenticated) and stash the result on `request` for
    // downstream handlers via WeakMap-style sidecar to avoid mutating
    // the immutable Request object.
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
    const rl = await checkRateLimit(env, ip);
    if (!rl.ok) {
      console.log('[rate-limit/ip] 429 for ip', ip, 'on', method, path, '—', rl.count, '/', rl.limit);
      return new Response(`Rate limit exceeded: ${rl.count}/${rl.limit} per minute`, {
        status: 429,
        headers: { ...cors, 'Retry-After': '60', 'Content-Type': 'text/plain' },
      });
    }

    // Per-user limit. Only resolves bearer/secret-backed identities; if
    // resolveAuth returns null (e.g. /register, /pair/begin), we skip
    // and let the per-IP cap protect us.
    let preAuth = null;
    try { preAuth = await resolveAuth(env, request, url); } catch {}
    if (preAuth?.userId) {
      const userRl = await checkUserRateLimit(env, preAuth.userId, bucketForPath(path));
      if (!userRl.ok) {
        console.log('[rate-limit/user] 429 for', preAuth.userId, 'bucket', bucketForPath(path), 'on', method, path);
        return new Response(`Rate limit exceeded: ${userRl.count}/${userRl.limit} per hour for this user`, {
          status: 429,
          headers: { ...cors, 'Retry-After': String(userRl.retryAfter || 60), 'Content-Type': 'text/plain' },
        });
      }
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

        // v8.0.0 — Funnel Plex scrobbles into D1 watch_history and push to
        // Trakt if the user is connected. webhook_user_id is set at
        // /bootstrap/credentials time; if it's missing the user hasn't
        // bootstrapped yet — skip silently and leave the existing VIEWED/
        // EVENTS path as the sole record (preserves pre-v8 behavior).
        if (record.event === 'media.scrobble') {
          try {
            const userId = await env.CONFIG.get('webhook_user_id');
            if (userId) {
              // Try to extract a TMDB ID from md.Guid array (Plex Pass populates
              // this when the agent matches; older agents or unmatched items
              // leave it null).
              let tmdbId = null;
              const guids = Array.isArray(md.Guid) ? md.Guid : [];
              for (const g of guids) {
                const m = /^tmdb:\/\/(\d+)/.exec(g?.id || '');
                if (m) { tmdbId = parseInt(m[1], 10); break; }
              }
              const trType = (record.type === 'movie') ? 'movie' : 'show';
              let pushedOk = false;
              if (tmdbId) {
                try {
                  const { ok } = await pushScrobbleToTrakt(env, userId, {
                    tmdbId, type: trType, watchedTs: record.ts,
                  });
                  pushedOk = ok;
                } catch (e) {
                  // Trakt not connected or refresh failed — record locally only.
                }
              }
              await recordWatch(env, userId, {
                itemId: null, tmdbId, source: 'plex',
                title: record.title, year: record.year, type: trType,
                watchedTs: record.ts, deviceId: null, pushedToTrakt: pushedOk,
              }).catch(e => console.log('[wh] watch_history insert failed', e.message));
            }
          } catch (e) {
            console.log('[wh] v8 watch_history hook failed', e.message);
          }
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

    // GET /sync/get — bearer or legacy. Returns the user's blob (or 404).
    //
    // v9.0.0: bearer-authed callers read from `state:{userId}`. Legacy
    // callers (?user=HASH&secret=) keep reading the pre-migration
    // `user:{HASH}` key shape until Phase 4 client refactor completes.
    if (path === '/sync/get' && method === 'GET') {
      const auth = await resolveAuth(env, request, url);
      let key = null;
      if (auth?.userId && !auth.viaLegacy) {
        key = `state:${auth.userId}`;
      } else {
        const userHash = url.searchParams.get('user');
        const providedSecret = url.searchParams.get('secret');
        if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!userHash || !/^[a-f0-9]{16,64}$/i.test(userHash)) {
          return new Response('Bad user hash', { status: 400, headers: cors });
        }
        key = `user:${userHash}`;
      }
      const data = await env.SYNC_KV.get(key);
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

    // PUT /sync/put — bearer or legacy. Stores the user's blob.
    if (path === '/sync/put' && method === 'PUT') {
      const auth = await resolveAuth(env, request, url);
      let key = null;
      if (auth?.userId && !auth.viaLegacy) {
        key = `state:${auth.userId}`;
      } else {
        const userHash = url.searchParams.get('user');
        const providedSecret = url.searchParams.get('secret');
        if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!userHash || !/^[a-f0-9]{16,64}$/i.test(userHash)) {
          return new Response('Bad user hash', { status: 400, headers: cors });
        }
        key = `user:${userHash}`;
      }
      const bodyText = await request.text();
      // Cloudflare KV per-value cap is 25 MB; reject earlier to avoid wasted compute
      if (bodyText.length > 25 * 1024 * 1024) {
        return new Response('Payload too large', { status: 413, headers: cors });
      }
      // Validate parses cleanly so we don't store garbage
      try { JSON.parse(bodyText); }
      catch { return new Response('Invalid JSON', { status: 400, headers: cors }); }
      await env.SYNC_KV.put(key, bodyText, { expirationTtl: SYNC_TTL });
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

    // ════════════════════════════════════════════════════════════════════
    // === v9.0.0 — Multi-user identity routes ===
    // ════════════════════════════════════════════════════════════════════

    // POST /migrate — one-shot upgrade path for Lincoln's pre-v9 devices.
    // Body: { oldSecret?, deviceId?, deviceKind?, userAgent?, deviceName? }
    // Validates oldSecret against CONFIG.secret, runs ensureMigration() if
    // not already done, then mints a fresh device record + authToken bound
    // to the admin user. Response lets the client swap to bearer auth.
    if (path === '/migrate' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const providedSecret = body.oldSecret || url.searchParams.get('secret');
        if (!(await checkSecret(env, providedSecret))) {
          return new Response('Forbidden', { status: 403, headers: cors });
        }
        const migration = await ensureMigration(env, body.displayName || null);
        const lincolnUuid = migration.lincolnUuid;
        const deviceId = body.deviceId || randomUuid();
        const authToken = genAuthToken();
        const authTokenHash = await sha256Hex(authToken);
        const deviceRec = {
          userId: lincolnUuid,
          kind: body.deviceKind || 'phone',
          name: body.deviceName || 'Primary device',
          userAgent: body.userAgent || request.headers.get('User-Agent') || '',
          createdAt: Date.now(),
          lastSeen: Date.now(),
          authTokenHash,
        };
        await env.USERS.put(`device:${deviceId}`, JSON.stringify(deviceRec));

        // Hand back the user's display name and role so the client can
        // skip the GET /user/me round-trip on the very first boot.
        const userRow = await env.D1_VIEWED.prepare(
          'SELECT display_name, role FROM users WHERE user_id=?'
        ).bind(lincolnUuid).first();

        return jsonResponse({
          ok: true,
          userId: lincolnUuid,
          deviceId,
          authToken,
          displayName: userRow?.display_name || migration.displayName,
          role: userRow?.role || 'admin',
          alreadyMigrated: migration.alreadyMigrated || false,
        });
      } catch (e) {
        console.error('MIGRATE_FAILED', e);
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // GET /user/me — bearer-auth. Returns the caller's user record plus
    // a list of their bound devices. Powers the Settings → Account and
    // Devices cards.
    if (path === '/user/me' && method === 'GET') {
      const r = await requireBearer(env, request, url);
      if (r.error) return r.error;
      const row = await env.D1_VIEWED.prepare(
        `SELECT user_id, display_name, role, last_seen, settings,
                bootstrapped, streaming_region, my_subscriptions,
                plex_server_url, trakt_username,
                trakt_access_token IS NOT NULL AS has_trakt
         FROM users WHERE user_id=?`
      ).bind(r.auth.userId).first();
      if (!row) return jsonResponse({ error: 'user not found' }, 404);

      // List the user's devices. KV doesn't support secondary indexes so
      // we walk device:* and filter — fine for 5-20 users * a few devices.
      const devices = [];
      let cursor = undefined;
      do {
        const page = await env.USERS.list({ prefix: 'device:', cursor });
        for (const k of page.keys) {
          const rec = await env.USERS.get(k.name, { type: 'json' });
          if (rec && rec.userId === r.auth.userId) {
            const did = k.name.slice('device:'.length);
            devices.push({
              deviceId: did,
              kind: rec.kind,
              name: rec.name,
              userAgent: rec.userAgent,
              createdAt: rec.createdAt,
              lastSeen: rec.lastSeen,
              isCurrent: did === r.auth.deviceId,
            });
          }
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);

      const adminSingleton = await env.USERS.get('admin', { type: 'json' });
      const hasPlex = row.role === 'admin'
        && !!((env.PLEX_TOKEN && String(env.PLEX_TOKEN).trim()) || await env.CONFIG.get('plex_token'));

      return jsonResponse({
        userId: row.user_id,
        displayName: row.display_name,
        role: row.role,
        lastSeen: row.last_seen,
        settings: row.settings ? safeJsonParse(row.settings, {}) : {},
        hasTrakt: !!row.has_trakt,
        traktUsername: row.trakt_username || null,
        hasPlex,
        plexServerUrl: hasPlex ? row.plex_server_url : null,
        streamingRegion: row.streaming_region || null,
        mySubscriptions: row.my_subscriptions ? safeJsonParse(row.my_subscriptions, []) : [],
        devices,
        isAdmin: row.role === 'admin' && adminSingleton?.userId === row.user_id,
      });
    }

    // POST /admin/invites/create — admin-only. Body:
    //   { suggestedDisplayName?, expiresInSec?, plexEnabled? }
    // Generates a 96-bit invite code, persists invite:{code} in USERS KV,
    // returns the shareable URL. Default expiry 7 days; max 30 days.
    if (path === '/admin/invites/create' && method === 'POST') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const body = await request.json().catch(() => ({}));
      const code = genShortCode();
      const now = Date.now();
      const expiresInSec = Math.min(
        Math.max(parseInt(body.expiresInSec || '604800', 10), 60),
        30 * 24 * 3600
      );
      const rec = {
        createdBy: r.auth.userId,
        createdAt: now,
        expiresAt: now + expiresInSec * 1000,
        consumed: false,
        consumedBy: null,
        plexEnabled: !!body.plexEnabled,
        suggestedDisplayName: body.suggestedDisplayName?.toString().trim().slice(0, 30) || null,
      };
      await env.USERS.put(`invite:${code}`, JSON.stringify(rec), { expirationTtl: expiresInSec + 86400 });
      const origin = request.headers.get('Origin') || 'https://bicyclecrasher.github.io';
      const base = ALLOWED_ORIGINS.has(origin) ? origin : 'https://bicyclecrasher.github.io';
      // The worker URL gets encoded in the invite so a brand-new device
      // can call /register without the user manually entering the host.
      // We derive it from the inbound request — whatever URL the admin
      // is hitting is, by definition, the worker URL their family will
      // need to talk to.
      const workerBase = `${url.protocol}//${url.host}`;
      return jsonResponse({
        ok: true,
        code,
        url: `${base}/WatchTrack/?invite=${code}&w=${encodeURIComponent(workerBase)}`,
        expiresAt: rec.expiresAt,
      });
    }

    // GET /admin/invites/list — admin-only. Returns both pending and
    // consumed invites. KV doesn't have secondary indexes so this
    // walks every invite:* key; fine for 5–20 users * a handful each.
    if (path === '/admin/invites/list' && method === 'GET') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const out = [];
      let cursor = undefined;
      do {
        const page = await env.USERS.list({ prefix: 'invite:', cursor });
        for (const k of page.keys) {
          const rec = await env.USERS.get(k.name, { type: 'json' });
          if (!rec) continue;
          out.push({
            code: k.name.slice('invite:'.length),
            ...rec,
            expired: rec.expiresAt < Date.now(),
          });
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      out.sort((a, b) => b.createdAt - a.createdAt);
      return jsonResponse({ invites: out });
    }

    // DELETE /admin/invites/{code} — admin-only. Revokes an unconsumed
    // invite. Consumed invites stay for audit purposes (would orphan
    // the user record otherwise).
    if (path.startsWith('/admin/invites/') && method === 'DELETE') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const code = path.slice('/admin/invites/'.length);
      if (!code || code.length > 64) return jsonResponse({ error: 'bad code' }, 400);
      const rec = await env.USERS.get(`invite:${code}`, { type: 'json' });
      if (!rec) return jsonResponse({ error: 'not found' }, 404);
      if (rec.consumed) return jsonResponse({ error: 'cannot revoke consumed invite' }, 409);
      await env.USERS.delete(`invite:${code}`);
      return jsonResponse({ ok: true });
    }

    // ════════════════════════════════════════════════════════════════════
    // === v9.0.0 — QR pairing routes ===
    // ════════════════════════════════════════════════════════════════════

    // POST /pair/begin (no auth) — TV side. Creates a pair session,
    // returns { pairSessionId, qrUrl } for the TV to render and start
    // listening on /pair/wait. 5-minute TTL.
    if ((path === '/pair/begin' || path === '/pair/begin/owned') && method === 'POST') {
      const owned = path === '/pair/begin/owned';
      let ownerUserId = null;
      if (owned) {
        const r = await requireBearer(env, request, url);
        if (r.error) return r.error;
        ownerUserId = r.auth.userId;
      }
      const sessionId = genShortCode();
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000;
      const userAgent = request.headers.get('User-Agent') || '';
      const ip = request.headers.get('CF-Connecting-IP') || '';
      const rec = {
        createdAt: now,
        expiresAt,
        consumed: false,
        fulfillment: null,
        ownedByUserId: ownerUserId,
        userAgent,
        ip,
      };
      await env.USERS.put(`pair:${sessionId}`, JSON.stringify(rec), { expirationTtl: 600 });
      const origin = request.headers.get('Origin') || 'https://bicyclecrasher.github.io';
      const base = ALLOWED_ORIGINS.has(origin) ? origin : 'https://bicyclecrasher.github.io';
      const workerBase = `${url.protocol}//${url.host}`;
      return jsonResponse({
        ok: true,
        pairSessionId: sessionId,
        qrUrl: `${base}/WatchTrack/?p=${sessionId}&w=${encodeURIComponent(workerBase)}`,
        expiresAt,
      });
    }

    // GET /pair/info?session=X (no auth) — phone side. Returns the
    // pending TV's user-agent and IP so the user can confirm they're
    // pairing the right device.
    if (path === '/pair/info' && method === 'GET') {
      const sessionId = url.searchParams.get('session');
      if (!sessionId) return jsonResponse({ error: 'session required' }, 400);
      const rec = await env.USERS.get(`pair:${sessionId}`, { type: 'json' });
      if (!rec) return jsonResponse({ error: 'session not found or expired' }, 404);
      if (rec.consumed) return jsonResponse({ error: 'session already used' }, 409);
      if (rec.expiresAt < Date.now()) return jsonResponse({ error: 'session expired' }, 410);
      return jsonResponse({
        ok: true,
        userAgent: rec.userAgent,
        ip: rec.ip,
        owned: !!rec.ownedByUserId,
        expiresAt: rec.expiresAt,
      });
    }

    // POST /pair/confirm — phone side, bearer auth. Body { pairSessionId }.
    // Mints a new device bound to the caller's user, pushes creds to
    // the TV's SSE stream, marks session consumed.
    if (path === '/pair/confirm' && method === 'POST') {
      const r = await requireBearer(env, request, url);
      if (r.error) return r.error;
      const body = await request.json().catch(() => ({}));
      if (!body.pairSessionId) return jsonResponse({ error: 'pairSessionId required' }, 400);
      const key = `pair:${body.pairSessionId}`;
      const rec = await env.USERS.get(key, { type: 'json' });
      if (!rec) return jsonResponse({ error: 'session not found' }, 404);
      if (rec.consumed) return jsonResponse({ error: 'session already used' }, 409);
      if (rec.expiresAt < Date.now()) return jsonResponse({ error: 'session expired' }, 410);
      // If session was begun as /pair/begin/owned, only the original
      // owner can confirm it. Defends against a shoulder-scanner.
      if (rec.ownedByUserId && rec.ownedByUserId !== r.auth.userId) {
        return jsonResponse({ error: 'session reserved for another user' }, 403);
      }

      const newDeviceId = randomUuid();
      const newAuthToken = genAuthToken();
      const newHash = await sha256Hex(newAuthToken);
      const now = Date.now();
      // Kind defaults to 'tv' since blank-device QR pairing is overwhelmingly
      // for TVs; the user can rename in Settings.
      const kindFromUA = /AndroidTV|GoogleTV|BRAVIA|AFT|SmartTV|Tizen|webOS/i.test(rec.userAgent) ? 'tv'
        : /Mobile|Android|iPhone/i.test(rec.userAgent) ? 'phone'
        : 'tv';
      const userRow = await env.D1_VIEWED.prepare('SELECT display_name FROM users WHERE user_id=?')
        .bind(r.auth.userId).first();
      await env.USERS.put(`device:${newDeviceId}`, JSON.stringify({
        userId: r.auth.userId,
        kind: kindFromUA,
        name: kindFromUA === 'tv' ? 'Paired TV' : 'Paired device',
        userAgent: rec.userAgent,
        createdAt: now,
        lastSeen: now,
        authTokenHash: newHash,
      }));

      rec.consumed = true;
      rec.consumedAt = now;
      rec.fulfillment = { newDeviceId, userId: r.auth.userId };
      await env.USERS.put(key, JSON.stringify(rec), { expirationTtl: 120 });

      // Push creds to the TV's SSE stream. If the TV's /pair/wait is in
      // a different isolate, this is a no-op and the TV will hit the
      // session-consumed path on its next poll (or timeout). We also
      // store the fulfillment payload on the session record so the TV
      // can poll /pair/info as a fallback — it returns the new creds
      // once consumed.
      const fulfillmentPayload = {
        userId: r.auth.userId,
        deviceId: newDeviceId,
        authToken: newAuthToken,
        displayName: userRow?.display_name || 'CinéMath user',
      };
      // Store the payload too, gated behind a one-time read flag so
      // only the TV can pick it up post-confirm.
      rec.payload = fulfillmentPayload;
      await env.USERS.put(key, JSON.stringify(rec), { expirationTtl: 120 });
      await pushPairEvent(body.pairSessionId, fulfillmentPayload);

      return jsonResponse({ ok: true, newDeviceId });
    }

    // GET /pair/wait?session=X (no auth) — TV side. Server-sent events
    // stream. Emits a `paired` event with the new creds once the phone
    // confirms; otherwise stays open until the 5-minute session expires.
    if (path === '/pair/wait' && method === 'GET') {
      const sessionId = url.searchParams.get('session');
      if (!sessionId) return new Response('session required', { status: 400 });
      const rec = await env.USERS.get(`pair:${sessionId}`, { type: 'json' });
      if (!rec) return new Response('session not found', { status: 404 });
      // If already fulfilled (different isolate handled the confirm),
      // emit the event immediately and close.
      if (rec.consumed && rec.payload) {
        const body = `event: paired\ndata: ${JSON.stringify(rec.payload)}\n\n`;
        return new Response(body, {
          status: 200,
          headers: {
            ...corsHeaders(request),
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
          },
        });
      }
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      _pairWaiters.set(sessionId, writer);
      // Initial comment so EventSource sees the headers and opens.
      writer.write(new TextEncoder().encode(': stream open\n\n')).catch(() => {});
      // Best-effort cleanup after 5 minutes.
      setTimeout(() => {
        if (_pairWaiters.get(sessionId) === writer) {
          _pairWaiters.delete(sessionId);
          writer.close().catch(() => {});
        }
      }, 5 * 60 * 1000);
      return new Response(readable, {
        status: 200,
        headers: {
          ...corsHeaders(request),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    // POST /admin/reconnect/create — admin-only. Body:
    //   { targetUserId, expiresInSec? }
    // Generates a single-use reconnect code that lets the named user
    // re-bind a fresh device without consuming an invite. Used when
    // someone loses their phone or replaces a device.
    if (path === '/admin/reconnect/create' && method === 'POST') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const body = await request.json().catch(() => ({}));
      if (!body.targetUserId) return jsonResponse({ error: 'targetUserId required' }, 400);
      // Verify the target user exists.
      const target = await env.D1_VIEWED.prepare('SELECT user_id, display_name FROM users WHERE user_id=?')
        .bind(body.targetUserId).first();
      if (!target) return jsonResponse({ error: 'user not found' }, 404);
      const code = genShortCode();
      const now = Date.now();
      const expiresInSec = Math.min(
        Math.max(parseInt(body.expiresInSec || '86400', 10), 60),
        7 * 24 * 3600
      );
      const rec = {
        targetUserId: body.targetUserId,
        createdBy: r.auth.userId,
        createdAt: now,
        expiresAt: now + expiresInSec * 1000,
        consumed: false,
      };
      await env.USERS.put(`reconnect:${code}`, JSON.stringify(rec), { expirationTtl: expiresInSec + 86400 });
      const origin = request.headers.get('Origin') || 'https://bicyclecrasher.github.io';
      const base = ALLOWED_ORIGINS.has(origin) ? origin : 'https://bicyclecrasher.github.io';
      const workerBase = `${url.protocol}//${url.host}`;
      return jsonResponse({
        ok: true,
        code,
        url: `${base}/WatchTrack/?reconnect=${code}&w=${encodeURIComponent(workerBase)}`,
        targetUserId: body.targetUserId,
        targetDisplayName: target.display_name,
        expiresAt: rec.expiresAt,
      });
    }

    // POST /reconnect — public, consumes a reconnect code. Body:
    //   { reconnectCode, deviceId?, deviceKind?, userAgent?, deviceName?,
    //     revokeOthers? (optional bool — replace lost device by purging all
    //     existing device:* records for this user) }
    // Returns bearer creds bound to the existing target user. No new
    // user row is created; all the user's data (Trakt, palate, history)
    // is preserved.
    if (path === '/reconnect' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        if (!body.reconnectCode) return jsonResponse({ error: 'reconnectCode required' }, 400);
        const key = `reconnect:${body.reconnectCode}`;
        const rec = await env.USERS.get(key, { type: 'json' });
        if (!rec) return jsonResponse({ error: 'code not found or expired' }, 404);
        if (rec.consumed) return jsonResponse({ error: 'code already used' }, 409);
        if (rec.expiresAt < Date.now()) return jsonResponse({ error: 'code expired' }, 410);

        const userId = rec.targetUserId;
        const userRow = await env.D1_VIEWED.prepare(
          'SELECT display_name, role FROM users WHERE user_id=?'
        ).bind(userId).first();
        if (!userRow) return jsonResponse({ error: 'target user vanished' }, 410);

        const deviceId = body.deviceId || randomUuid();
        const authToken = genAuthToken();
        const authTokenHash = await sha256Hex(authToken);
        const now = Date.now();

        // If the user is replacing a lost device, purge all existing
        // device:* records for this user first. Otherwise we're just
        // adding another device alongside whatever they already have.
        if (body.revokeOthers) {
          let cursor = undefined;
          do {
            const page = await env.USERS.list({ prefix: 'device:', cursor });
            for (const k of page.keys) {
              const r2 = await env.USERS.get(k.name, { type: 'json' });
              if (r2?.userId === userId) await env.USERS.delete(k.name);
            }
            cursor = page.list_complete ? undefined : page.cursor;
          } while (cursor);
        }

        await env.USERS.put(`device:${deviceId}`, JSON.stringify({
          userId,
          kind: body.deviceKind || 'phone',
          name: body.deviceName || 'Reconnected device',
          userAgent: body.userAgent || request.headers.get('User-Agent') || '',
          createdAt: now,
          lastSeen: now,
          authTokenHash,
        }));

        rec.consumed = true;
        rec.consumedAt = now;
        await env.USERS.put(key, JSON.stringify(rec));

        return jsonResponse({
          ok: true,
          userId,
          deviceId,
          authToken,
          displayName: userRow.display_name,
          role: userRow.role,
        });
      } catch (e) {
        console.error('RECONNECT_FAILED', e);
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // POST /devices/{deviceId}/rename — bearer auth; user can rename
    // their own devices. Body: { name }.
    if (path.startsWith('/devices/') && path.endsWith('/rename') && method === 'POST') {
      const r = await requireBearer(env, request, url);
      if (r.error) return r.error;
      const deviceId = path.slice('/devices/'.length, -'/rename'.length);
      if (!deviceId) return jsonResponse({ error: 'deviceId required' }, 400);
      const rec = await env.USERS.get(`device:${deviceId}`, { type: 'json' });
      if (!rec) return jsonResponse({ error: 'device not found' }, 404);
      if (rec.userId !== r.auth.userId) return jsonResponse({ error: 'not your device' }, 403);
      const body = await request.json().catch(() => ({}));
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) return jsonResponse({ error: 'name required' }, 400);
      await env.USERS.put(`device:${deviceId}`, JSON.stringify({ ...rec, name }));
      return jsonResponse({ ok: true });
    }

    // DELETE /devices/{deviceId} — bearer auth; revokes a device. The
    // calling device can revoke any of the user's own devices, including
    // itself (the next request from the revoked device returns 401).
    if (path.startsWith('/devices/') && method === 'DELETE') {
      const r = await requireBearer(env, request, url);
      if (r.error) return r.error;
      const deviceId = path.slice('/devices/'.length);
      if (!deviceId) return jsonResponse({ error: 'deviceId required' }, 400);
      const rec = await env.USERS.get(`device:${deviceId}`, { type: 'json' });
      if (!rec) return jsonResponse({ error: 'device not found' }, 404);
      if (rec.userId !== r.auth.userId) return jsonResponse({ error: 'not your device' }, 403);
      await env.USERS.delete(`device:${deviceId}`);
      return jsonResponse({ ok: true, revoked: deviceId });
    }

    // POST /admin/users/{userId}/revoke — admin-only. Body { deviceId? }
    //   - With deviceId: revoke that one device.
    //   - Without:        revoke ALL devices for the target user.
    if (path.startsWith('/admin/users/') && path.endsWith('/revoke') && method === 'POST') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const userId = path.slice('/admin/users/'.length, -'/revoke'.length);
      if (!userId) return jsonResponse({ error: 'userId required' }, 400);
      const body = await request.json().catch(() => ({}));
      if (body.deviceId) {
        const rec = await env.USERS.get(`device:${body.deviceId}`, { type: 'json' });
        if (!rec || rec.userId !== userId) return jsonResponse({ error: 'device not owned by target user' }, 404);
        await env.USERS.delete(`device:${body.deviceId}`);
        return jsonResponse({ ok: true, revoked: [body.deviceId] });
      }
      const revoked = [];
      let cursor = undefined;
      do {
        const page = await env.USERS.list({ prefix: 'device:', cursor });
        for (const k of page.keys) {
          const rec = await env.USERS.get(k.name, { type: 'json' });
          if (rec?.userId === userId) {
            await env.USERS.delete(k.name);
            revoked.push(k.name.slice('device:'.length));
          }
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return jsonResponse({ ok: true, revoked });
    }

    // GET /admin/users/list — admin-only. Returns every D1 users row
    // with a count of bound devices.
    if (path === '/admin/users/list' && method === 'GET') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const rows = await env.D1_VIEWED.prepare(
        `SELECT user_id, display_name, role, last_seen, created_ts,
                trakt_access_token IS NOT NULL AS has_trakt,
                trakt_username
         FROM users
         ORDER BY role DESC, display_name ASC`
      ).all();

      // Count devices per user.
      const deviceCounts = new Map();
      let cursor = undefined;
      do {
        const page = await env.USERS.list({ prefix: 'device:', cursor });
        for (const k of page.keys) {
          const rec = await env.USERS.get(k.name, { type: 'json' });
          if (rec?.userId) deviceCounts.set(rec.userId, (deviceCounts.get(rec.userId) || 0) + 1);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);

      const adminSingleton = await env.USERS.get('admin', { type: 'json' });
      return jsonResponse({
        users: (rows.results || []).map(u => ({
          userId: u.user_id,
          displayName: u.display_name,
          role: u.role,
          lastSeen: u.last_seen,
          createdTs: u.created_ts,
          hasTrakt: !!u.has_trakt,
          traktUsername: u.trakt_username || null,
          devices: deviceCounts.get(u.user_id) || 0,
          isAdmin: u.role === 'admin' && adminSingleton?.userId === u.user_id,
        })),
      });
    }

    // POST /admin/users/{userId}/rename — admin-only. Body { displayName }.
    if (path.startsWith('/admin/users/') && path.endsWith('/rename') && method === 'POST') {
      const r = await requireAdmin(env, request, url);
      if (r.error) return r.error;
      const userId = path.slice('/admin/users/'.length, -'/rename'.length);
      const body = await request.json().catch(() => ({}));
      const displayName = String(body.displayName || '').trim().slice(0, 30);
      if (!displayName) return jsonResponse({ error: 'displayName required' }, 400);
      await env.D1_VIEWED.prepare('UPDATE users SET display_name=? WHERE user_id=?').bind(displayName, userId).run();
      return jsonResponse({ ok: true });
    }

    // POST /register — public, single-use. Body:
    //   { invite, deviceId?, deviceKind?, userAgent?, deviceName? }
    // Validates the invite, mints user_id + device, returns bearer.
    if (path === '/register' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        if (!body.invite) return jsonResponse({ error: 'invite required' }, 400);
        const inviteKey = `invite:${body.invite}`;
        const invite = await env.USERS.get(inviteKey, { type: 'json' });
        if (!invite) return jsonResponse({ error: 'invite not found or expired' }, 404);
        if (invite.consumed) return jsonResponse({ error: 'invite already used' }, 409);
        if (invite.expiresAt < Date.now()) return jsonResponse({ error: 'invite expired' }, 410);

        const userId = randomUuid();
        const deviceId = body.deviceId || randomUuid();
        const authToken = genAuthToken();
        const authTokenHash = await sha256Hex(authToken);
        const now = Date.now();
        const displayName = invite.suggestedDisplayName || null;
        const needsDisplayName = !displayName;

        // Insert minimal users row. Trakt and Plex bind later via the
        // existing /api/trakt/device-code-* and (for admin) Plex routes.
        await env.D1_VIEWED.prepare(
          `INSERT INTO users
             (user_id, display_name, role, last_seen, settings,
              bootstrapped, created_ts)
           VALUES (?,?,?,?,?,1,?)`
        ).bind(userId, displayName, 'user', now, '{}', now).run();

        // Device record in USERS KV.
        const deviceRec = {
          userId,
          kind: body.deviceKind || 'phone',
          name: body.deviceName || 'New device',
          userAgent: body.userAgent || request.headers.get('User-Agent') || '',
          createdAt: now,
          lastSeen: now,
          authTokenHash,
        };
        await env.USERS.put(`device:${deviceId}`, JSON.stringify(deviceRec));

        // Consume the invite. Keep the record for audit (admin list).
        invite.consumed = true;
        invite.consumedBy = userId;
        invite.consumedAt = now;
        await env.USERS.put(inviteKey, JSON.stringify(invite));

        return jsonResponse({
          ok: true,
          userId,
          deviceId,
          authToken,
          displayName,
          needsDisplayName,
          plexEnabled: !!invite.plexEnabled,
        });
      } catch (e) {
        console.error('REGISTER_FAILED', e);
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // PUT /user/settings — bearer-auth. Body { displayName?, settings? }
    // Updates the caller's own row. settings is merged shallowly into
    // the existing JSON blob so partial updates don't clobber other keys.
    if (path === '/user/settings' && method === 'PUT') {
      const r = await requireBearer(env, request, url);
      if (r.error) return r.error;
      const body = await request.json().catch(() => ({}));
      const updates = [];
      const binds = [];
      if (typeof body.displayName === 'string') {
        const trimmed = body.displayName.trim();
        if (trimmed.length < 1 || trimmed.length > 30) {
          return jsonResponse({ error: 'displayName must be 1-30 chars' }, 400);
        }
        updates.push('display_name=?');
        binds.push(trimmed);
      }
      if (body.settings && typeof body.settings === 'object') {
        const existing = await env.D1_VIEWED.prepare('SELECT settings FROM users WHERE user_id=?')
          .bind(r.auth.userId).first();
        const merged = { ...safeJsonParse(existing?.settings || '{}', {}), ...body.settings };
        updates.push('settings=?');
        binds.push(JSON.stringify(merged));
      }
      if (typeof body.streamingRegion === 'string') {
        updates.push('streaming_region=?');
        binds.push(body.streamingRegion);
      }
      if (Array.isArray(body.mySubscriptions)) {
        updates.push('my_subscriptions=?');
        binds.push(JSON.stringify(body.mySubscriptions));
      }
      if (!updates.length) return jsonResponse({ ok: true, noop: true });
      binds.push(r.auth.userId);
      await env.D1_VIEWED.prepare(
        `UPDATE users SET ${updates.join(', ')} WHERE user_id=?`
      ).bind(...binds).run();
      return jsonResponse({ ok: true });
    }

    // ════════════════════════════════════════════════════════════════════
    // === v8.0.0 — Credential vault routes ===
    // ════════════════════════════════════════════════════════════════════
    //
    // The device-side promote button posts /bootstrap/credentials with all
    // its local Plex + Trakt creds. The Worker computes user_id from the
    // Plex token, sets the long-lived keys as Worker secrets via the
    // Cloudflare API, and INSERTs the rotating + non-secret values into
    // D1 users. After this, devices never enter creds again — they call
    // /api/trakt/* and /plex/* proxies and the Worker handles everything.

    // GET /bootstrap/status?secret=X&user=HASH — drives the device's
    // "show promote button" vs "show Connected ✓" UI decision.
    if (path === '/bootstrap/status' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId || !/^[a-f0-9]{16,64}$/i.test(userId)) {
        return jsonResponse({ bootstrapped: false, plex: false, trakt: false });
      }
      const plex = !!((env.PLEX_TOKEN && String(env.PLEX_TOKEN).trim()) || await env.CONFIG.get('plex_token'));
      let trakt = false, bootstrapped = false, traktUsername = null;
      if (env.D1_VIEWED) {
        const row = await env.D1_VIEWED.prepare(
          'SELECT bootstrapped, trakt_access_token, trakt_username FROM users WHERE user_id=?'
        ).bind(userId).first();
        if (row) {
          bootstrapped = !!row.bootstrapped;
          trakt = !!row.trakt_access_token;
          traktUsername = row.trakt_username || null;
        }
      }
      return jsonResponse({ bootstrapped, plex, trakt, traktUsername });
    }

    // POST /bootstrap/credentials  body:
    //   { secret, plexToken, plexServerUrl?, plexClientId?,
    //     traktClientId?, traktClientSecret?,
    //     traktAccessToken?, traktRefreshToken?, traktExpiresAt?, traktUsername?,
    //     streamingRegion?, mySubscriptions? }
    //
    // Computes user_id = SHA-256(plexToken). Sets the immutable keys
    // (PLEX_TOKEN, TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET) as Worker secrets
    // via Cloudflare API (requires ADMIN_API_TOKEN + CF_ACCOUNT_ID env).
    // INSERTs/UPDATEs the D1 users row with rotating + non-secret values.
    // Also writes CONFIG.webhook_user_id so the Plex webhook can attribute
    // events to this user without re-deriving the hash.
    if (path === '/bootstrap/credentials' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret))) return new Response('Forbidden', { status: 403, headers: cors });
        if (!body.plexToken) return jsonResponse({ error: 'plexToken required to derive user_id' }, 400);
        const userId = await sha256Hex(body.plexToken);

        // Step 1: promote long-lived keys to Worker secrets via CF API.
        // If any secret promotion fails, abort before touching D1 so the
        // user can fix the API token and retry.
        const promotions = [];
        promotions.push(setWorkerSecret(env, 'PLEX_TOKEN', body.plexToken));
        if (body.traktClientId) promotions.push(setWorkerSecret(env, 'TRAKT_CLIENT_ID', body.traktClientId));
        if (body.traktClientSecret) promotions.push(setWorkerSecret(env, 'TRAKT_CLIENT_SECRET', body.traktClientSecret));
        await Promise.all(promotions);

        // Step 2: write rotating + non-secret values to D1 users row.
        // ON CONFLICT(user_id) DO UPDATE for re-runs of the same device.
        // v9.0.0: Trakt tokens written here are AES-GCM ciphertext, with
        // a single IV stored in trakt_token_iv (access+refresh use the
        // same IV because they always rotate as a pair).
        if (!env.D1_VIEWED) return jsonResponse({ error: 'D1_VIEWED binding missing' }, 500);
        const now = Date.now();
        const { ct: bcAccessCt, iv: bcIv } = await encryptTraktSecret(env, body.traktAccessToken || null);
        const { ct: bcRefreshCt } = body.traktRefreshToken
          ? await encryptTraktSecret(env, body.traktRefreshToken)
          : { ct: null };
        await env.D1_VIEWED.prepare(
          `INSERT INTO users
           (user_id, plex_server_url, plex_client_id,
            trakt_access_token, trakt_refresh_token, trakt_expires_at, trakt_username, trakt_token_iv,
            streaming_region, my_subscriptions, bootstrapped, created_ts)
           VALUES (?,?,?,?,?,?,?,?,?,?,1,?)
           ON CONFLICT(user_id) DO UPDATE SET
             plex_server_url     = COALESCE(excluded.plex_server_url, users.plex_server_url),
             plex_client_id      = COALESCE(excluded.plex_client_id, users.plex_client_id),
             trakt_access_token  = COALESCE(excluded.trakt_access_token, users.trakt_access_token),
             trakt_refresh_token = COALESCE(excluded.trakt_refresh_token, users.trakt_refresh_token),
             trakt_expires_at    = COALESCE(excluded.trakt_expires_at, users.trakt_expires_at),
             trakt_username      = COALESCE(excluded.trakt_username, users.trakt_username),
             trakt_token_iv      = COALESCE(excluded.trakt_token_iv, users.trakt_token_iv),
             streaming_region    = COALESCE(excluded.streaming_region, users.streaming_region),
             my_subscriptions    = COALESCE(excluded.my_subscriptions, users.my_subscriptions),
             bootstrapped        = 1`
        ).bind(
          userId,
          body.plexServerUrl || null,
          body.plexClientId || null,
          bcAccessCt,
          bcRefreshCt,
          body.traktExpiresAt || null,
          body.traktUsername || null,
          bcIv,
          body.streamingRegion || null,
          body.mySubscriptions ? (typeof body.mySubscriptions === 'string' ? body.mySubscriptions : JSON.stringify(body.mySubscriptions)) : null,
          now
        ).run();

        // Step 3: persist plex_url + plex_token in CONFIG KV for legacy
        // compat with /plex/* routes that still call env.CONFIG.get(…)
        // directly. Remove in v8.1.0 once those routes use getPlexCreds().
        if (body.plexServerUrl) {
          await env.CONFIG.put('plex_url', body.plexServerUrl.replace(/\/$/, ''));
        }
        await env.CONFIG.put('plex_token', body.plexToken);
        // webhook_user_id lets /webhook/{secret} attribute incoming Plex
        // events to the right D1 users row without re-hashing the token.
        await env.CONFIG.put('webhook_user_id', userId);

        return jsonResponse({ success: true, user_id: userId, bootstrapped: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // === v8.0.0 — Trakt proxy routes ===
    // ════════════════════════════════════════════════════════════════════
    //
    // Every Trakt operation that used to happen client-side (with the
    // device holding the access token) now routes through here. The
    // Worker holds the rotating token in D1; getValidTraktToken handles
    // auto-refresh. Devices never see the Trakt token. CSP can drop
    // api.trakt.tv from connect-src once all devices migrate.

    // POST /api/trakt/device-code-init?secret=X
    // Returns Trakt's user_code + verification_url for the device-code
    // OAuth flow. Device shows the code; user enters it at trakt.tv/activate.
    if (path === '/api/trakt/device-code-init' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      if (!env.TRAKT_CLIENT_ID) return jsonResponse({ error: 'TRAKT_CLIENT_ID secret not set' }, 500);
      try {
        const r = await fetch('https://api.trakt.tv/oauth/device/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env.TRAKT_CLIENT_ID }),
        });
        if (!r.ok) return jsonResponse({ error: `Trakt ${r.status}` }, 502);
        return jsonResponse(await r.json());
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/device-code-poll?secret=X
    // body: { device_code, user }
    // Polls Trakt; on success, writes tokens to the user's D1 row.
    if (path === '/api/trakt/device-code-poll' && method === 'POST') {
      try {
        const body = await request.json();
        if (!(await checkSecret(env, body.secret || url.searchParams.get('secret')))) {
          return new Response('Forbidden', { status: 403, headers: cors });
        }
        const userId = body.user || url.searchParams.get('user');
        if (!userId) return jsonResponse({ error: 'user (user_id) required' }, 400);
        if (!body.device_code) return jsonResponse({ error: 'device_code required' }, 400);
        if (!env.TRAKT_CLIENT_ID || !env.TRAKT_CLIENT_SECRET) {
          return jsonResponse({ error: 'TRAKT_CLIENT_ID / TRAKT_CLIENT_SECRET secrets not set' }, 500);
        }
        const r = await fetch('https://api.trakt.tv/oauth/device/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: body.device_code,
            client_id: env.TRAKT_CLIENT_ID,
            client_secret: env.TRAKT_CLIENT_SECRET,
          }),
        });
        // Trakt returns 200 on success, 400 'authorization_pending' while waiting,
        // 410 expired, 418 denied. Pass through status so the device can poll.
        if (r.status === 200) {
          const tok = await r.json();
          const expiresAt = Date.now() + (tok.expires_in || 7776000) * 1000;
          // Look up the user's Trakt username via /users/me with the new token.
          let username = null;
          try {
            const meR = await fetch('https://api.trakt.tv/users/me', {
              headers: {
                'Authorization': `Bearer ${tok.access_token}`,
                'trakt-api-version': '2',
                'trakt-api-key': env.TRAKT_CLIENT_ID,
              },
            });
            if (meR.ok) {
              const me = await meR.json();
              username = me?.username || null;
            }
          } catch {}
          if (!env.D1_VIEWED) return jsonResponse({ error: 'D1_VIEWED binding missing' }, 500);
          // v9.0.0: tokens written here are AES-GCM ciphertext. Both
          // access and refresh share one IV (they rotate together).
          const { ct: dcAccessCt, iv: dcIv } = await encryptTraktSecret(env, tok.access_token);
          const { ct: dcRefreshCt } = await encryptTraktSecret(env, tok.refresh_token);
          // Ensure a users row exists; if not, INSERT a minimal one so the
          // UPDATE has something to target.
          const existing = await env.D1_VIEWED.prepare('SELECT user_id FROM users WHERE user_id=?').bind(userId).first();
          if (!existing) {
            await env.D1_VIEWED.prepare(
              `INSERT INTO users (user_id, trakt_access_token, trakt_refresh_token, trakt_expires_at, trakt_username, trakt_token_iv, bootstrapped, created_ts)
               VALUES (?,?,?,?,?,?,1,?)`
            ).bind(userId, dcAccessCt, dcRefreshCt, expiresAt, username, dcIv, Date.now()).run();
          } else {
            await env.D1_VIEWED.prepare(
              `UPDATE users SET trakt_access_token=?, trakt_refresh_token=?, trakt_expires_at=?, trakt_username=COALESCE(?, trakt_username), trakt_token_iv=? WHERE user_id=?`
            ).bind(dcAccessCt, dcRefreshCt, expiresAt, username, dcIv, userId).run();
          }
          return jsonResponse({ success: true, username });
        }
        // Pass through Trakt's polling status codes
        return new Response(JSON.stringify({ status: r.status }), {
          status: r.status === 400 || r.status === 410 || r.status === 418 ? r.status : 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/scrobble?secret=X&user=HASH
    // body: { tmdbId, type: 'movie'|'show', watchedTs, itemId?, title?, year? }
    // Pushes to Trakt + records in D1 watch_history.
    if (path === '/api/trakt/scrobble' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const body = await request.json();
        if (!body.tmdbId) return jsonResponse({ error: 'tmdbId required' }, 400);
        const watchedTs = body.watchedTs || Date.now();
        const type = body.type === 'movie' ? 'movie' : 'show';
        const { ok, status } = await pushScrobbleToTrakt(env, userId, { tmdbId: body.tmdbId, type, watchedTs });
        await recordWatch(env, userId, {
          itemId: body.itemId, tmdbId: body.tmdbId, source: 'manual',
          title: body.title, year: body.year, type,
          watchedTs, deviceId: request.headers.get('X-Device-Id') || null,
          pushedToTrakt: ok,
        });
        return jsonResponse({ ok, status });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/unwatch?secret=X&user=HASH  body: {tmdbId, type}
    if (path === '/api/trakt/unwatch' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const body = await request.json();
        if (!body.tmdbId) return jsonResponse({ error: 'tmdbId required' }, 400);
        const type = body.type === 'movie' ? 'movies' : 'shows';
        const tBody = { [type]: [{ ids: { tmdb: body.tmdbId } }] };
        const r = await traktFetch(env, userId, '/sync/history/remove', {
          method: 'POST', body: JSON.stringify(tBody),
        });
        return jsonResponse({ ok: r.ok, status: r.status });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/rate?secret=X&user=HASH  body: {tmdbId, type, rating}
    if (path === '/api/trakt/rate' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const body = await request.json();
        if (!body.tmdbId || typeof body.rating !== 'number') return jsonResponse({ error: 'tmdbId + numeric rating required' }, 400);
        const key = body.type === 'movie' ? 'movies' : 'shows';
        const tBody = { [key]: [{ rating: body.rating, ids: { tmdb: body.tmdbId } }] };
        const r = await traktFetch(env, userId, '/sync/ratings', {
          method: 'POST', body: JSON.stringify(tBody),
        });
        return jsonResponse({ ok: r.ok, status: r.status });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/unrate?secret=X&user=HASH  body: {tmdbId, type}
    if (path === '/api/trakt/unrate' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const body = await request.json();
        if (!body.tmdbId) return jsonResponse({ error: 'tmdbId required' }, 400);
        const key = body.type === 'movie' ? 'movies' : 'shows';
        const tBody = { [key]: [{ ids: { tmdb: body.tmdbId } }] };
        const r = await traktFetch(env, userId, '/sync/ratings/remove', {
          method: 'POST', body: JSON.stringify(tBody),
        });
        return jsonResponse({ ok: r.ok, status: r.status });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/watchlist-add?secret=X&user=HASH  body: {tmdbId, type}
    if (path === '/api/trakt/watchlist-add' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const body = await request.json();
        if (!body.tmdbId) return jsonResponse({ error: 'tmdbId required' }, 400);
        const key = body.type === 'movie' ? 'movies' : 'shows';
        const tBody = { [key]: [{ ids: { tmdb: body.tmdbId } }] };
        const r = await traktFetch(env, userId, '/sync/watchlist', {
          method: 'POST', body: JSON.stringify(tBody),
        });
        return jsonResponse({ ok: r.ok, status: r.status });
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // GET /api/trakt/history?secret=X&user=HASH&type=movies|shows&limit=N
    if (path === '/api/trakt/history' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      const type = url.searchParams.get('type') === 'shows' ? 'shows' : 'movies';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10000'), 10000);
      try {
        const r = await traktFetch(env, userId, `/sync/history/${type}?limit=${limit}`);
        if (!r.ok) return jsonResponse({ error: `Trakt ${r.status}` }, 502);
        return jsonResponse(await r.json());
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // GET /api/trakt/ratings?secret=X&user=HASH&type=movies|shows
    if (path === '/api/trakt/ratings' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      const type = url.searchParams.get('type') === 'shows' ? 'shows' : 'movies';
      try {
        const r = await traktFetch(env, userId, `/sync/ratings/${type}`);
        if (!r.ok) return jsonResponse({ error: `Trakt ${r.status}` }, 502);
        return jsonResponse(await r.json());
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // GET /api/trakt/me?secret=X&user=HASH — returns the Trakt /users/me payload
    if (path === '/api/trakt/me' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const r = await traktFetch(env, userId, '/users/me');
        if (!r.ok) return jsonResponse({ error: `Trakt ${r.status}` }, 502);
        return jsonResponse(await r.json());
      } catch (e) {
        return jsonResponse({ error: e.message }, 502);
      }
    }

    // POST /api/trakt/disconnect?secret=X&user=HASH — clears trakt_* in users row
    if (path === '/api/trakt/disconnect' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      if (!env.D1_VIEWED) return jsonResponse({ error: 'D1_VIEWED binding missing' }, 500);
      try {
        await env.D1_VIEWED.prepare(
          `UPDATE users SET trakt_access_token=NULL, trakt_refresh_token=NULL,
                            trakt_expires_at=NULL, trakt_username=NULL,
                            trakt_token_iv=NULL
           WHERE user_id=?`
        ).bind(userId).run();
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // === v8.0.0 — Watch history routes ===
    // ════════════════════════════════════════════════════════════════════

    // POST /api/watch/mark?secret=X&user=HASH
    // body: { tmdbId, itemId?, type, title?, year?, watchedTs? }
    // Manual mark-watched from the device. Records to D1 + pushes Trakt
    // if connected. Falls back gracefully if Trakt isn't set up.
    if (path === '/api/watch/mark' && method === 'POST') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      try {
        const body = await request.json();
        const watchedTs = body.watchedTs || Date.now();
        const type = body.type === 'movie' ? 'movie' : 'show';
        const deviceId = request.headers.get('X-Device-Id') || null;
        // Try to push to Trakt; on failure (e.g. user not connected), still record locally.
        let pushedOk = false;
        if (body.tmdbId) {
          try {
            const { ok } = await pushScrobbleToTrakt(env, userId, { tmdbId: body.tmdbId, type, watchedTs });
            pushedOk = ok;
          } catch (e) {
            // Trakt not connected or refresh failed — record locally only.
          }
        }
        await recordWatch(env, userId, {
          itemId: body.itemId, tmdbId: body.tmdbId, source: 'manual',
          title: body.title, year: body.year, type,
          watchedTs, deviceId, pushedToTrakt: pushedOk,
        });
        return jsonResponse({ ok: true, pushedToTrakt: pushedOk });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // GET /api/watch/history?secret=X&user=HASH&since=TS&limit=N
    if (path === '/api/watch/history' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      if (!(await checkSecret(env, providedSecret))) return new Response('Forbidden', { status: 403, headers: cors });
      const userId = url.searchParams.get('user');
      if (!userId) return jsonResponse({ error: 'user required' }, 400);
      if (!env.D1_VIEWED) return jsonResponse({ error: 'D1_VIEWED binding missing' }, 500);
      const since = parseInt(url.searchParams.get('since') || '0');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 5000);
      try {
        const rows = await env.D1_VIEWED.prepare(
          `SELECT id, item_id, tmdb_id, source, title, year, type, watched_ts, device_id, pushed_to_trakt
           FROM watch_history
           WHERE user_id=? AND watched_ts >= ?
           ORDER BY watched_ts DESC
           LIMIT ?`
        ).bind(userId, since, limit).all();
        return jsonResponse({ rows: rows.results || [] });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
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
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let written = 0, bytesIn = 0, bytesOut = 0, errors = 0;
  const seen = new Set();

  async function backupOne(key, label) {
    if (seen.has(label)) return;
    seen.add(label);
    try {
      const raw = await env.SYNC_KV.get(key);
      if (!raw) return;
      bytesIn += raw.length;
      const gz = await gzipString(raw);
      bytesOut += gz.byteLength;
      await env.BACKUPS.put(`state/${date}/${label}.json.gz`, gz, {
        httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
        customMetadata: { userKey: key, rawBytes: String(raw.length), ts: String(Date.now()) },
      });
      written++;
    } catch (e) {
      errors++;
      console.log('[backup] failed for', label.slice(0, 8), e.message);
    }
  }

  // v9.0.0 user-scoped state: walk every bearer-authed user.
  const stateList = await env.SYNC_KV.list({ prefix: 'state:' });
  for (const k of stateList.keys) {
    const userId = k.name.slice('state:'.length);
    await backupOne(k.name, userId);
  }
  // Legacy user:{hash} keys (Lincoln's pre-migration data). The hash
  // segment doubles as the label since old backups already used that.
  const legacyList = await env.SYNC_KV.list({ prefix: 'user:' });
  for (const k of legacyList.keys) {
    const userHash = k.name.slice('user:'.length);
    await backupOne(k.name, userHash);
  }

  const summary = {
    date, written, errors, bytesIn, bytesOut,
    compressionRatio: bytesIn ? Math.round((1 - bytesOut / bytesIn) * 100) : 0,
    ranAt: Date.now(),
  };
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
