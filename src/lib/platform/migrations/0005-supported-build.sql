-- The Supported build (online-platform#27): the one EZConfig build stamp the
-- platform sends configuration to. Times are milliseconds since the Unix
-- epoch, as in 0002.

-- At most one row (`id` is always 1). No row means no Supported build is set
-- yet, and nothing is sent to any game server. Setting it replaces the row:
-- earlier stamps are in the journal, as operator actions. `set_by` becomes
-- NULL when that server owner is deleted, and the page then reads "a former
-- server owner". `stamp` is `YYYYMMDD-HHMMSS`, as the mod bakes it into a
-- packaged build.
CREATE TABLE supported_build (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stamp TEXT NOT NULL CHECK (stamp GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  set_at INTEGER NOT NULL,
  set_by INTEGER REFERENCES users (id) ON DELETE SET NULL
) STRICT;
