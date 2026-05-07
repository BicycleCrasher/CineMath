// WatchTrack ↔ Plex bridge (v2 — adds TMDB metadata + viewing history)
//
// Endpoints:
//   POST /webhook/{secret}              Plex Pass webhook receiver
//   GET  /events?secret=X&since=TS      WatchTrack polls for new scrobble events
//   POST /events/ack                    WatchTrack acks events processed
//   GET  /metadata/lookup?title=X&year=Y&type=movie|tv&secret=S   TMDB enrichment
//   POST /viewed/ingest                 Bulk ingest Plex history (used once for backfill)
//   GET  /viewed/list?secret=X          Return all logged Plex views (for History modal)
//   GET  /                              health check
//
// KV bindings expected (variable names must match exactly):
//   EVENTS    — webhook scrobble events queued for WatchTrack to pull
//   CONFIG    — { "secret": "shared secret", "tmdb_token": "TMDB v4 read access token" }
//   VIEWED    — full Plex viewing history (every play, including orphans)
//   METADATA  — cached TMDB enrichment, keyed by tmdb:{id} or normalized title+year+type

// Library whitelist — only ingest from these Plex library section IDs.
// Adjust if your library config changes.
const LIBRARY_WHITELIST = new Set(['1', '2']);

const TMDB_BASE = 'https://api.themoviedb.org/3';
const METADATA_TTL = 30 * 24 * 60 * 60;  // 30 days

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    .replace(/[\u2019\u2018'`]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 60);
}

async function checkSecret(env, providedSecret) {
  const real = await env.CONFIG.get('secret');
  return real && providedSecret === real;
}

async function tmdbLookup(env, title, year, type) {
  // type: 'movie' or 'tv'
  const tmdbToken = await env.CONFIG.get('tmdb_token');
  if (!tmdbToken) return { error: 'TMDB token not configured' };

  // Cache key
  const cacheKey = `lookup:${type}:${normalizeTitle(title)}:${year || ''}`;
  const cached = await env.METADATA.get(cacheKey);
  if (cached) {
    try { return { ...JSON.parse(cached), cached: true }; } catch {}
  }

  // TMDB search
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
    // Cache the negative result too — don't keep retrying
    const negResult = { found: false, query: { title, year, type } };
    await env.METADATA.put(cacheKey, JSON.stringify(negResult), { expirationTtl: METADATA_TTL });
    return negResult;
  }
  const top = results[0];
  const tmdbId = top.id;

  // Fetch details + watch providers
  const detailsPath = type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const detailsResp = await fetch(`${TMDB_BASE}${detailsPath}?append_to_response=watch/providers,credits`, {
    headers: { 'Authorization': `Bearer ${tmdbToken}`, 'Accept': 'application/json' },
  });
  let details = {};
  if (detailsResp.ok) details = await detailsResp.json();

  // Compact the result — strip giant fields, keep what's useful
  const result = {
    found: true,
    tmdbId,
    type,
    title: details.title || details.name || top.title || top.name,
    originalTitle: details.original_title || details.original_name || null,
    year: (details.release_date || details.first_air_date || '').slice(0, 4) || null,
    overview: details.overview || top.overview || '',
    runtime: details.runtime || (details.episode_run_time && details.episode_run_time[0]) || null,
    genres: (details.genres || []).map(g => g.name),
    posterPath: details.poster_path || top.poster_path || null,
    voteAverage: details.vote_average || null,
    // TV-specific
    numberOfSeasons: details.number_of_seasons || null,
    numberOfEpisodes: details.number_of_episodes || null,
    inProduction: details.in_production || null,
    networks: (details.networks || []).map(n => n.name),
    // Watch providers (region-aware) — keep all regions, not just US (user has VPN)
    watchProviders: (details['watch/providers'] && details['watch/providers'].results) || {},
    // Compact credits — top 5 cast only
    cast: ((details.credits && details.credits.cast) || []).slice(0, 5).map(c => c.name),
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

    // Health
    if (path === '/' || path === '/health') {
      return new Response('WatchTrack-Plex bridge online (v2 — TMDB + history)', { headers: cors });
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
      for (const k of list.keys) {
        const v = await env.EVENTS.get(k.name);
        if (!v) continue;
        try {
          const rec = JSON.parse(v);
          if (rec.ts > since) events.push(rec);
        } catch {}
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
      if (!title) return new Response('Missing title', { status: 400, headers: cors });
      const result = await tmdbLookup(env, title, year, type);
      return jsonResponse(result);
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
      // KV list is paginated to 1000 per call
      const list = await env.VIEWED.list({ cursor, limit: 1000 });
      const records = [];
      for (const k of list.keys) {
        const v = await env.VIEWED.get(k.name);
        if (!v) continue;
        try { records.push(JSON.parse(v)); } catch {}
      }
      return jsonResponse({
        records,
        cursor: list.list_complete ? null : list.cursor,
      });
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
