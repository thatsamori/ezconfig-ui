-- Notes (online-platform#36): comments on config keys that every server owner
-- reads. Times are milliseconds since the Unix epoch, as in 0002.

-- Keyed by database ('Character' or 'Weapon') and key name, never by category
-- or weapon class, so a key that moves category keeps its Notes. A Note on a
-- key the schema no longer has stays here and is not shown. `author_id`
-- becomes NULL when that server owner is deleted, and the Note then reads "a
-- former server owner". `body` is HTML the Note sanitizer has already allowed;
-- an edit overwrites it and sets `edited_at` (there is no edit history).
-- Within a key, Notes are in created order, then id (an import gives many the
-- same created time).
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  database_name TEXT NOT NULL CHECK (database_name IN ('Character', 'Weapon')),
  key_name TEXT NOT NULL,
  author_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
) STRICT;
CREATE INDEX notes_by_key ON notes (database_name, key_name, created_at, id);
CREATE INDEX notes_by_author ON notes (author_id);
