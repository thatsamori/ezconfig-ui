# 13: How does the owner's self-hosted data get onto the platform?

Status: resolved
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
- From [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  the platform is one Lightsail box running the app on Bun, with the
  database at `DATABASE_PATH`. An import script would run there, with the
  old folders copied over from the VPS.

## Answer

Resolved 2026-11-02 by grilling the owner. No new terms.

**Today's formats** (read from the code; no user data printed):
`Databases/Character/<category>.json` and
`Databases/Weapon/<Class>/<category>.json` hold the saved values, which may
include saves never applied; `.last-apply.json` records only when an apply
ran. A preset is a folder with `manifest.json` (`title`, `description`) and
the same file layout, with no history. Notes are `{key: [{id, createdBy,
note}]}` per schema with no timestamps; ids are not reliable (some are
missing).

**What each thing becomes.**
- `Databases/` becomes the Draft of one game server the owner registered on
  the platform beforehand, so its Game server key is issued the normal way;
  the import names it. The same values are also saved as version 1 of a new
  Ruleset, "Self-hosted" by default (an argument), and that version is the
  Draft's origin. The immutable copy means a "Reset to game defaults" before
  the first Apply loses nothing. The game server still has no Live
  configuration, so nothing reaches it until the owner reviews and Applies.
- Each user preset, and each preset under `Presets/Static/` except
  `GameDefault`, becomes a Ruleset owned by the owner with one version 1.
  The Ruleset is named after the manifest `title` (the folder name if the
  title is empty or the manifest is missing); the manifest `description` is
  version 1's description; the saved time is the import time.
- A Note whose `createdBy` is the owner's old username (an argument) is
  authored by the owner; every other Note has no author and shows "a former
  server owner". Created time is the import time, there is no edited time,
  and order within a key is kept. Bodies pass the Note sanitizer. Notes on
  keys the schema no longer has are imported and stay hidden, as
  [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md)
  set. `users.json` is not read.
- Rejected: Databases as only a Draft (no immutable copy) or only a Ruleset
  version (the owner loads it by hand); a `username=Discord id` mapping for
  every old user, not worth it while only the owner's data is imported.

**Values.** Read by database, weapon class and key name with no category,
as loading a Ruleset version is. Unknown keys, unknown weapon classes and
invalid values (wrong type, out of range, failing the camera policy) are
dropped and reported, so no Draft or version the import writes holds a value
the editor would reject; one dropped value never fails the import. A key in
two category files (say a leftover from before the parry-geometry move) is
imported once if both values match; if they differ, the file for the key's
current category wins and the other value is reported as dropped.

**How it runs.** A one-off Bun script in `scripts/`, run by hand on the
Lightsail box against `DATABASE_PATH`. Arguments: the copied `Databases/`,
`Presets/` and `Notes/` folders, the owner's Discord user id, the game server
name, the owner's old username, and optionally the "Self-hosted" Ruleset
name. Not a platform page and not a startup step. It reads the old formats
with its own readers, not the self-hosted services, so those can go
separately.
- **Dry run by default**: prints the report and writes nothing; `--commit`
  writes.
- **All or nothing**: one transaction. Before writing, it refuses if the
  target game server's Draft was ever saved or it has a Live configuration,
  if the owner already has a Ruleset with a name it would create (ignoring
  case), or if two names inside the import collide (two preset titles, or a
  title equal to the "Self-hosted" name). Collisions are listed and fixed by
  editing the copied manifest; nothing is renamed automatically. A second
  run therefore fails cleanly.
- **Any file that is not valid JSON fails the import**: a skipped Databases
  file would make the first Apply silently wipe values the server runs.
- **The report**: each destination (the Draft, each Ruleset) with its value
  count; every dropped value with database, weapon class, key, file and
  reason; Notes attributed to the owner, without an author and on hidden
  keys; Note bodies the sanitizer changed.
- **Afterwards**: once the owner's import has run, the script and its tests
  are deleted. The open-source core carries no self-hosted formats, and
  importing other owners' data is out of scope.

**Cutover order.**
1. Stop the self-hosted app on the VPS for good: its RCON automatic sync
   would push old values again on a server restart, against the platform.
2. Copy `Databases/`, `Presets/` and `Notes/` to the Lightsail box.
3. Sign in to the platform (the operator needs no Invite) and register the
   game server.
4. Dry run, read the report, then `--commit`.
5. Set up Game.ini (`bAllowHttpRequests`, `[EZConfigPlatform]`) and the
   Supported build.
6. Review the Draft and Apply.

The game server keeps its own saved snapshot throughout, since the platform
holds no Live configuration for it until that Apply.

**No ADR**: the script is temporary and every choice reverses cheaply.

**Graduated.** None. **Handed on.** None.
