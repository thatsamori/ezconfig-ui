-- Live configurations (online-platform#32): what each game server should run.
-- Times are milliseconds since the Unix epoch, as in 0004.

-- At most one per game server, and none until its first Apply. Each Apply
-- replaces it: the previous row is deleted and a new one inserted under a new
-- random `id` (a UUID), even when nothing changed, so the game server is sent
-- it again. `id` is what a delivery carries and the mod reports back as
-- processed. `overrides` is the Draft's values document as Apply copied it
-- (0004's `drafts.overrides` shape), never rewritten. A row is never updated.
-- The origin (a Ruleset version) arrives with Rulesets (online-platform#35).
CREATE TABLE live_configurations (
  game_server_id INTEGER PRIMARY KEY REFERENCES game_servers (id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  overrides TEXT NOT NULL CHECK (json_valid(overrides)),
  applied_at INTEGER NOT NULL
) STRICT;
