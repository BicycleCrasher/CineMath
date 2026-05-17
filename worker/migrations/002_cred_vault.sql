-- CinéMath v8.0.0 — Credential vault tables.
--
-- Adds user-level credential storage and a watch_history table that captures
-- every watch event (Plex webhook, manual mark from device, future sources)
-- for analytics and Trakt scrobble fanout. The Plex token + Trakt
-- client_id/secret live as Worker secrets (set via the /bootstrap/credentials
-- route, which calls Cloudflare's API using an ADMIN_API_TOKEN). The rotating
-- Trakt access/refresh tokens live in this users row because they update on
-- every refresh — Worker secrets can't be mutated from Worker code.
--
-- Apply via:
--   cd worker
--   wrangler d1 execute watchtrack-viewed --remote --file=migrations/002_cred_vault.sql

CREATE TABLE IF NOT EXISTS users (
  user_id              TEXT    PRIMARY KEY,    -- SHA-256(plex_token), computed at bootstrap
  plex_server_url      TEXT,                   -- not a secret; just config
  plex_client_id       TEXT,                   -- 40-char hex for plex:// deep links
  trakt_access_token   TEXT,                   -- rotates ~90d
  trakt_refresh_token  TEXT,                   -- rotates ~90d
  trakt_expires_at     INTEGER,                -- ms epoch; refresh fires when within 60s of this
  trakt_username       TEXT,
  streaming_region     TEXT,                   -- e.g. 'US'
  my_subscriptions     TEXT,                   -- JSON array
  bootstrapped         INTEGER NOT NULL DEFAULT 0,
  created_ts           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT    NOT NULL,
  item_id           TEXT,                       -- CinéMath catalog ID if matched
  tmdb_id           INTEGER,
  source            TEXT    NOT NULL,           -- 'plex' | 'manual' | 'trakt' | future
  title             TEXT,
  year              INTEGER,
  type              TEXT,                       -- 'movie' | 'episode' | 'show'
  watched_ts        INTEGER NOT NULL,           -- ms epoch
  device_id         TEXT,                       -- originating device for manual marks; null for plex/trakt
  pushed_to_trakt   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wh_user_ts   ON watch_history (user_id, watched_ts DESC);
CREATE INDEX IF NOT EXISTS idx_wh_user_item ON watch_history (user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_wh_user_tmdb ON watch_history (user_id, tmdb_id);
