-- Invites (online-platform#25): the way in for anyone who is not a platform
-- operator. Times are milliseconds since the Unix epoch, as in 0002.

-- `code_hash` is the SHA-256 hash (hex) of the random code in the Invite link;
-- the code itself is never stored. An Invite is unused while `used_by` is
-- null. A revoke sets `revoked_at` and keeps the row. The daily sweep deletes
-- an unused Invite's row 30 days after it expires or is revoked; a used one
-- goes with the server owner who used it.
CREATE TABLE invites (
  id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  made_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  made_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by INTEGER REFERENCES users (id) ON DELETE CASCADE,
  used_at INTEGER,
  revoked_at INTEGER,
  CHECK ((used_by IS NULL) = (used_at IS NULL))
) STRICT;
CREATE INDEX invites_by_maker ON invites (made_by);
CREATE INDEX invites_by_user ON invites (used_by);
