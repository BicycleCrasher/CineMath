-- CinéMath — per-item Status/Rating/Reaction (SRR) store.
--
-- First step of retiring the last-write-wins SYNC_KV blob as the
-- canonical SRR store. One row per (user, catalog item); the Worker's
-- /state/upsert endpoint writes rows with
--   INSERT ... ON CONFLICT(user_hash, item_id) DO UPDATE ...
--     WHERE excluded.last_updated > item_state.last_updated
-- so per-item newest-wins replaces the blob's whole-payload
-- last-write-wins. During the dual-write phase the SYNC_KV blob stays
-- canonical; cutover steps live in docs/SRR-D1-CUTOVER.md.
--
-- `user_hash` is the client-side identity: SHA-256(plex_token) hex,
-- the same value that keys the legacy SYNC_KV `user:{HASH}` blobs.
-- Rows migrated from v9 `state:{userId}` blobs store the UUID user_id
-- in this column instead — the column holds whatever identity segment
-- keyed the source blob.
--
-- `item_id` is the catalog slug (`title-slug-year`, see app.js catalog
-- loader). NOTE: the same item_id can exist in more than one tab; the
-- PK collapses those to a single row whose `tab` column records the
-- most recently updated tab. Acceptable for SRR purposes — the app
-- treats a title watched in one tab as watched.
--
-- `reaction_tags` is a JSON array serialized to TEXT (same convention
-- as palate.reaction_tags from migration 001).
--
-- Apply via:
--   cd worker
--   wrangler d1 execute watchtrack-viewed --remote --file=migrations/004_item_state.sql
-- (or paste into Cloudflare dashboard → D1 → watchtrack-viewed → Console).
--
-- Idempotent: IF NOT EXISTS on both table and indexes.

CREATE TABLE IF NOT EXISTS item_state (
  item_id       TEXT    NOT NULL,     -- catalog slug id
  user_hash     TEXT    NOT NULL,     -- SHA-256(plex_token) hex (or v9 UUID user_id)
  title         TEXT,                 -- denormalized for verification queries
  year          INTEGER,
  tab           TEXT,                 -- catalog tab id, e.g. 'scifi', 'british-comedy'
  status        TEXT,                 -- none | queued | watching | watched | skip
  rating        TEXT,                 -- e.g. loved | liked | disliked
  reaction_tags TEXT,                 -- JSON array
  notes         TEXT,
  last_updated  INTEGER,              -- ms epoch; per-item newest-wins conflict key
  source        TEXT,                 -- 'app-...' dual-write | 'kv-migration' backfill
  PRIMARY KEY (user_hash, item_id)
);

CREATE INDEX IF NOT EXISTS item_state_by_user_tab
  ON item_state (user_hash, tab);
CREATE INDEX IF NOT EXISTS item_state_by_user_updated
  ON item_state (user_hash, last_updated DESC);
