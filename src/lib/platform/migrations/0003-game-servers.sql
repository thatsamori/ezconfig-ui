-- Game servers and their Drafts (online-platform#26).
-- Times are milliseconds since the Unix epoch (Date.now()).

-- A game server a server owner registered. Names are unique per owner,
-- ignoring case: `name_key` is the name as the app folds it for comparing
-- (trimmed, Unicode NFC, lower case), since SQLite's NOCASE folds only ASCII.
-- The Game server key is never stored: `key_hash` is its SHA-256 hash (hex),
-- the one way a poll finds its game server, and `key_last4` is what the page
-- shows once the key itself has been shown.
-- The `reported_*` columns hold what the latest poll reported, as reported:
-- the build stamp (NULL when the poll sent none), and the id of the Live
-- configuration the mod last finished processing with its result as JSON, or
-- NULL for both when it reported none. `last_poll_at` is written at most every
-- 5 minutes unless a reported value changes; the exact time lives in memory
-- (src/lib/platform/polls.ts), as do held polls and connection status.
CREATE TABLE game_servers (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  last_poll_at INTEGER,
  reported_build_stamp TEXT,
  reported_live_configuration_id TEXT,
  reported_result TEXT CHECK (reported_result IS NULL OR json_valid(reported_result))
) STRICT;
CREATE UNIQUE INDEX game_servers_by_key_hash ON game_servers (key_hash);
CREATE UNIQUE INDEX game_servers_by_owner_and_name ON game_servers (owner_id, name_key);

-- One Draft per game server, created empty with it. `overrides` is one JSON
-- document keyed by database, weapon class and key name, never by category:
-- {"Character": {"<key>": <value>}, "Weapon": {"ArmingSword": {"<key>": <value>}}}.
-- A missing key is the game default, so '{}' is game defaults throughout.
-- `revision` rises on every save; `saved_at` stays NULL until the first save.
-- The origin (a Ruleset version) arrives with Rulesets (online-platform#35).
CREATE TABLE drafts (
  game_server_id INTEGER PRIMARY KEY REFERENCES game_servers (id) ON DELETE CASCADE,
  overrides TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overrides)),
  revision INTEGER NOT NULL DEFAULT 0,
  saved_at INTEGER
) STRICT;
