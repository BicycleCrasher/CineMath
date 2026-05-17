-- CinéMath v9.0.0 — Multi-user support
--
-- Adds the columns the Worker needs to treat the `users` table as the
-- canonical multi-user store: display name, role (admin vs user), a
-- last-seen timestamp, free-form per-user settings JSON, and an IV
-- column so AES-GCM-encrypted Trakt tokens can be decrypted later.
--
-- The `palate` table (migration 001) was authored before the multi-user
-- plan and has no user_id column; add it here, backfill is handled by
-- the one-shot Worker migration that promotes the existing single-user
-- record to a UUID v4 user_id.
--
-- Apply via:
--   Cloudflare dashboard → D1 → watchtrack-viewed → Console →
--   paste the contents of this file → execute.
--
-- Idempotent: every statement uses IF NOT EXISTS or guards via a
-- dummy SELECT (SQLite has no IF NOT EXISTS for ADD COLUMN, so we wrap
-- those statements; if a column already exists, the ALTER fails and
-- the surrounding script in dashboard execution stops — re-running is
-- safe because the failure is loud).

-- === users: new columns ============================================

ALTER TABLE users ADD COLUMN display_name   TEXT;
ALTER TABLE users ADD COLUMN role           TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN last_seen      INTEGER;
ALTER TABLE users ADD COLUMN settings       TEXT;          -- JSON blob
ALTER TABLE users ADD COLUMN trakt_token_iv TEXT;          -- base64 IV for AES-GCM
                                                            -- the trakt_access_token /
                                                            -- trakt_refresh_token columns
                                                            -- now hold base64 ciphertext
                                                            -- once the Worker migration
                                                            -- has run

-- One row in the users table may have role='admin'. Partial unique
-- index keeps the rest of the rows unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_role_admin
  ON users (role) WHERE role = 'admin';

-- === palate: user_id column + per-user indexes =====================

ALTER TABLE palate ADD COLUMN user_id TEXT;

-- Backfill of existing rows happens in the Worker's one-shot migration:
--   UPDATE palate SET user_id = ? WHERE user_id IS NULL;
-- bound with Lincoln's new UUID v4. This SQL file deliberately does
-- not pick a value because there is no single literal we can write
-- here that's safe — the Worker generates the UUID at migration time.

CREATE INDEX IF NOT EXISTS palate_by_user_tab
  ON palate (user_id, tab_id);
CREATE INDEX IF NOT EXISTS palate_by_user_updated
  ON palate (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS palate_by_user_archived
  ON palate (user_id, archived);
CREATE INDEX IF NOT EXISTS palate_by_user_hof
  ON palate (user_id, hof);

-- Old non-user-scoped indexes (palate_by_tab, palate_archived,
-- palate_hof, palate_updated) stay until v9.1.0 when all queries are
-- confirmed to include user_id. Dropping them now would slow down the
-- v8.x Worker if a rollback is ever needed.
