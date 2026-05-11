-- CinéMath v7.1.0 — palate table for archived items, ratings, tags, HoF
-- Run via Cloudflare dashboard: D1 → watchtrack-viewed → Console → paste & execute.

CREATE TABLE IF NOT EXISTS palate (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT,
  year INTEGER,
  tmdb_id TEXT,
  status TEXT,
  rating TEXT,
  reaction_tags TEXT,
  notes TEXT,
  archived INTEGER DEFAULT 0,
  archived_reason TEXT,
  hof INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS palate_by_tab ON palate (tab_id);
CREATE INDEX IF NOT EXISTS palate_archived ON palate (archived);
CREATE INDEX IF NOT EXISTS palate_hof ON palate (hof);
CREATE INDEX IF NOT EXISTS palate_updated ON palate (updated_at DESC);
