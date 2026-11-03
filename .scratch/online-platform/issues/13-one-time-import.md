# 13: How does the owner's self-hosted data get onto the platform?

Status: open
Type: grilling
Created: 2026-11-02
Blocked by: 07
Parent: [Map: EZConfig online platform](../map.md)

## Question

The owner's self-hosted data gets a one-time import (map Notes). Decide:

- What today's `Databases/` (the values the owner's server runs) becomes: the
  Draft of a game server registered first, a Ruleset version, or both.
- What each user Preset becomes, for example a Ruleset with one version, and
  how it is named.
- Whom imported Notes are attributed to: authors today are `users.json`
  usernames, platform authors are Discord users.
- How the import runs (for example a script against the SQLite file, given
  the old folders as arguments), whether it can run twice, and what it
  reports: values dropped as unknown, files it could not read.

## Context

- [Where does each entity get stored?](07-entity-storage.md): the schema, one
  JSON document of overrides per configuration, and no Live configuration
  until a game server's first Apply. The import reads the old folders through
  its own arguments; `DATABASES_PATH`, `PRESETS_PATH`, `NOTES_PATH` and
  `USERS_PATH` go away.
- [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md):
  values are read by key name with no category, and unknown keys are dropped
  with a count. The import follows the same rules.
- Today's layout: `Databases/<database>/<category>.json`, presets under
  `Presets/User/`, notes per schema keyed by key name
  (`src/lib/notes/types.ts`). The owner also has two untracked presets under
  `Presets/Static/` (`Movement.json`, `Recovery.json`); built-in presets are
  dropped, so these come in as the owner's own.
- The owner's live data is likely on the VPS checkout, not this one (it runs
  the app there); this checkout has only `Databases/Character`.
- Only the owner's data is imported; other owners' self-hosted data is out of
  scope.
- From [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  imported Note bodies pass the same sanitizer as saved ones. A Note with no
  author already shows "a former server owner", as after a server owner is
  deleted.
