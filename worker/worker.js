// WatchTrack ↔ Plex webhook bridge
// Receives Plex Pass webhooks, stores events in KV, serves them to WatchTrack on poll.
//
// Endpoints:
//   POST /webhook/{secret}     — Plex server posts here (multipart/form-data with `payload` JSON field)
//   GET  /events?secret=X&since=TIMESTAMP — WatchTrack polls for new events
//   POST /events/ack           — WatchTrack confirms events processed (deletes them from KV)
//   GET  /                     — health check
//
// KV bindings expected:
//   EVENTS — for storing webhook events (key: event ID, value: JSON)
//   CONFIG — for the shared secret (key: "secret", value: string)
//
// Deployed via: Cloudflare dashboard → Workers & Pages → Create → paste this → bind KV namespace → deploy

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers for all responses
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Health check
    if (path === '/' || path === '/health') {
      return new Response('WatchTrack-Plex bridge online', { headers: cors });
    }

    // Plex webhook receiver: /webhook/{secret}
    if (path.startsWith('/webhook/') && method === 'POST') {
      const providedSecret = path.slice('/webhook/'.length);
      const realSecret = await env.CONFIG.get('secret');
      if (!realSecret || providedSecret !== realSecret) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
      try {
        // Plex sends multipart/form-data with a `payload` field containing JSON
        const formData = await request.formData();
        const payloadStr = formData.get('payload');
        if (!payloadStr) return new Response('Missing payload', { status: 400, headers: cors });
        const payload = JSON.parse(payloadStr);
        // Only store scrobble events (full play-through) and rate events
        if (payload.event !== 'media.scrobble' && payload.event !== 'media.rate') {
          return new Response('Ignored', { status: 200, headers: cors });
        }
        // Build a compact event record
        const md = payload.Metadata || {};
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
          grandparentTitle: md.grandparentTitle || null,
          parentIndex: md.parentIndex || null,
          index: md.index || null,
          rating: payload.rating || null,
        };
        // Store with 7-day TTL — auto-cleanup if WatchTrack never polls
        await env.EVENTS.put(eventId, JSON.stringify(record), { expirationTtl: 7 * 24 * 60 * 60 });
        return new Response('OK', { status: 200, headers: cors });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    // WatchTrack poll: /events?secret=X&since=TIMESTAMP
    if (path === '/events' && method === 'GET') {
      const providedSecret = url.searchParams.get('secret');
      const realSecret = await env.CONFIG.get('secret');
      if (!realSecret || providedSecret !== realSecret) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
      const since = parseInt(url.searchParams.get('since') || '0');
      // List all keys
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
      return new Response(JSON.stringify({ events }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // WatchTrack ack: /events/ack — body is JSON { secret, eventIds: [...] }
    if (path === '/events/ack' && method === 'POST') {
      try {
        const body = await request.json();
        const realSecret = await env.CONFIG.get('secret');
        if (!realSecret || body.secret !== realSecret) {
          return new Response('Forbidden', { status: 403, headers: cors });
        }
        const ids = body.eventIds || [];
        for (const id of ids) {
          await env.EVENTS.delete(id);
        }
        return new Response(JSON.stringify({ deleted: ids.length }), {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response('Bad request: ' + e.message, { status: 400, headers: cors });
      }
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
