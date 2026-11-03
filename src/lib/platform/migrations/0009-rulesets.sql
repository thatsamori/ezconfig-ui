-- Rulesets (online-platform#35): a server owner's saved, versioned
-- configurations, and the origin of each Draft and Live configuration.
-- Times are milliseconds since the Unix epoch, as in 0004.

-- A Ruleset belongs to one server owner and is never shared. Names are unique
-- per owner, ignoring case: `name_key` is the name folded as 0004 folds game
-- server names (trimmed, Unicode NFC, lower case).
CREATE TABLE rulesets (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX rulesets_by_owner_and_name ON rulesets (owner_id, name_key);

-- One immutable set of values within a Ruleset: a row is never updated, and
-- is deleted only with its Ruleset. `number` is 1 for a new Ruleset and the
-- highest + 1 after that. `overrides` is the Draft's values document as it
-- was saved (0004's `drafts.overrides` shape), never rewritten.
-- `description` is NULL when none was given.
CREATE TABLE ruleset_versions (
  id INTEGER PRIMARY KEY,
  ruleset_id INTEGER NOT NULL REFERENCES rulesets (id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 1),
  description TEXT,
  overrides TEXT NOT NULL CHECK (json_valid(overrides)),
  saved_at INTEGER NOT NULL,
  UNIQUE (ruleset_id, number)
) STRICT;

-- The origin: the Ruleset version a Draft or Live configuration was last
-- loaded from or saved as, or NULL for none. Deleting a Ruleset deletes its
-- versions, and that clears every origin that pointed into them in the same
-- statement; the values stay. This is the one change ever made to a Live
-- configuration's row.
ALTER TABLE drafts ADD COLUMN origin_id INTEGER REFERENCES ruleset_versions (id) ON DELETE SET NULL;
ALTER TABLE live_configurations ADD COLUMN origin_id INTEGER REFERENCES ruleset_versions (id) ON DELETE SET NULL;
CREATE INDEX drafts_by_origin ON drafts (origin_id);
CREATE INDEX live_configurations_by_origin ON live_configurations (origin_id);
