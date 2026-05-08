// WatchTrack ↔ Plex bridge (v5.2 — Plex proxy added)
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
//   GET  /                              health check
//
// KV bindings expected (variable names must match exactly):
//   EVENTS      — webhook scrobble events queued for WatchTrack to pull
//   CONFIG      — { "secret": "...", "tmdb_token": "...", "plex_url": "...", "plex_token": "..." }
//   VIEWED      — full Plex viewing history
//   METADATA    — TMDB enrichment cache
//   PROMOTIONS  — orphan promotions persisted across devices

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

  // Fetch details + watch providers + credits
  const detailsPath = type === 'tv' ? `/tv/${resolvedId}` : `/movie/${resolvedId}`;
  const detailsResp = await fetch(`${TMDB_BASE}${detailsPath}?append_to_response=watch/providers,credits,recommendations,similar`, {
    headers: { 'Authorization': `Bearer ${tmdbToken}`, 'Accept': 'application/json' },
  });
  let details = {};
  if (detailsResp.ok) details = await detailsResp.json();

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

    // Health
    if (path === '/' || path === '/health') {
      return new Response('WatchTrack-Plex bridge online (v5.2 — Plex proxy added)', { headers: cors });
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

    return new Response('Not found', { status: 404, headers: cors });
  },
};
