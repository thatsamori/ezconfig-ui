-- Server owners and their sessions (online-platform#23).
-- Times are milliseconds since the Unix epoch (Date.now()); SQLite reads one
-- with datetime(column / 1000, 'unixepoch').

-- A server owner. `id` is the platform id that logs and other tables use; the
-- Discord id is never logged. Username (Discord's display name) and avatar
-- hash are copied from Discord at every sign-in and never edited here.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  avatar TEXT,
  first_signed_in_at INTEGER NOT NULL,
  access_removed_at INTEGER
) STRICT;

-- `id` is the SHA-256 hash (hex) of the cookie token; the token is never
-- stored. A session expires 30 days after its last use; last seen, and with
-- it the expiry, is written at most once an hour.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_by_user ON sessions (user_id);
CREATE INDEX sessions_by_expiry ON sessions (expires_at);
