# 07: Where does each entity get stored?

Status: resolved
Type: grilling
Created: 2026-11-01
Blocked by: 03, 04, 05, 06
Parent: [Map: EZConfig online platform](../map.md)

## Question

Choose storage for User and sessions, GameServer, Ruleset, Ruleset version,
Draft, Live configuration and Note, and sketch their schemas.

## Context

The owner's starting proposal (2026-11-01): User, sessions, GameServer and
Ruleset in Postgres; the live configuration in Redis, with last-updated and
sent-to-server metadata; Ruleset versions in DynamoDB, because the key set
keeps growing.

Points raised while charting, to answer or overturn:
- Size: 182 Character keys plus 65 Weapon keys across 38 EZ weapon classes
  makes 2,652 values; about 100 KB of JSON if every key is set, a few KB for
  typical overrides. Around 10k versions, about 100 MB at the worst. Well under
  one write per second.
- Postgres JSONB is as schemaless as DynamoDB; a growing key set is a
  versioning problem
  ([How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md)),
  not a document-store problem. That ticket settled it without versioning:
  values are identified by database, weapon class and key name (category is
  looked up from the current schema), unknown keys are dropped on load, and
  versions carry no key-set marker and are never rewritten.
- Spreading Ruleset and Ruleset version across two stores loses the foreign key
  and the transaction (deleting a Ruleset), and adds backups and local setup.
  DynamoDB items are capped at 400 KB.
- The live configuration is source-of-truth data; Redis needs persistence
  settings to hold it, or it serves only as a cache or for notifications.
- Counterpoint: on AWS, DynamoDB on-demand may cost cents while managed
  Postgres is likely the biggest monthly line
  ([What does each candidate AWS setup cost per month at V1 scale?](03-aws-stack-costs.md)).
- From [How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md):
  each game server has a Draft and a Live configuration, each pointing at an
  origin Ruleset version. The Draft auto-saves while the owner edits, so it
  takes frequent small writes. Ruleset versions are numbered, immutable and
  carry an optional description; deleting a Ruleset deletes its versions and
  clears origins that pointed into it. Notes are global: per config key, with
  an author, shared by every owner.
- From [How do the platform and a game server talk?](05-platform-game-server-communication.md):
  a GameServer holds name, owner, Game server key, last reported build stamp,
  last poll time, and the id of the Live configuration it last reported
  processing, with that result; no RCON fields. Each Live configuration has an
  id that polls compare. Connection status is computed, never stored.

## Answer

Resolved 2026-11-02 by grilling the owner. No new terms; "Live configuration"
stays the current one, and the ones before it are earlier Live configurations.

**One SQLite database.** Every entity, sessions included, lives in one SQLite
file on the instance. No Redis, no DynamoDB. Recorded as
[ADR 0001](../../../docs/adr/0001-one-sqlite-file-for-platform-storage.md).
- Why one store: the Live configuration is source-of-truth data, and the
  foreign keys and transactions keep "delete a Ruleset" and "Save as Ruleset
  version" atomic. Redis's remaining job, waking held polls on Apply, is an
  in-process event on the one instance. DynamoDB's cost edge went with
  Lambda: long polls need a running process, and EC2 + DynamoDB ($11.62) is
  no cheaper than one Lightsail box ($12.35).
- Why SQLite over Postgres: one instance with no high availability, writes
  well under one a second, under 1 GB. No database server to patch or
  secure; it fits the 1 GB box; a backup and a restore are one file; tests and
  local development use a real database in a temp file, as tests use temp
  data folders today; another instance of the open-source core needs nothing
  extra.
- Accepted costs: one writer at a time; no managed-database path (RDS is over
  the ceiling and high availability is out of scope); limited `ALTER TABLE`.
  Tests run on Bun, which cannot load `node:sqlite` (Bun 1.3.14, checked
  2026-11-02), and the app runs on Node 22: the build needs a thin adapter
  over `bun:sqlite` and `node:sqlite`, or runs the app on Bun.
- The file's location is one setting, `DATABASE_PATH`, replacing
  `DATABASES_PATH`, `PRESETS_PATH`, `NOTES_PATH` and `USERS_PATH`, which leave
  with the self-hosted mode.

**Values.** A Draft, a Live configuration and a Ruleset version each hold their
values as one JSON document of overrides, keyed by database, weapon class and
key name, with no category:
`{"Character": {key: value}, "Weapon": {"ArmingSword": {key: value}}}`.
A missing key is the game default. Values are always loaded, copied, compared
and sent whole; a typical document is a few KB, every key about 100 KB.

**Schema.**

| Entity | Fields |
|---|---|
| User | Discord user id (identity), username and avatar copied from Discord at each login and never edited here, first sign-in time |
| Session | id, user, created, expires, last seen |
| Game server | id, owner, name (unique per owner, ignoring case), Game server key, registered time, last reported build stamp, last poll time, last reported processed Live configuration id and its result (both as reported), current Live configuration (none until the first Apply) |
| Draft | one per game server, created empty at registration: values, origin (a Ruleset version or none), revision (raised on every save), last saved time |
| Live configuration | random id (UUID), game server, values, origin or none, applied time; immutable |
| Ruleset | id, owner, name (unique per owner, ignoring case), created time |
| Ruleset version | id, Ruleset, number (unique within its Ruleset; next is highest + 1), optional description, values, saved time; immutable |
| Note | id, database (Character or Weapon), key name, author, HTML body, created time, edited time; an edit overwrites, no edit history |
| Platform setting | the Supported build stamp; while unset, nothing is sent |

- **Every Live configuration is kept.** Apply inserts a new one and points the
  game server at it; earlier ones are never pruned in V1. Worst case about
  2 GB a year (20 servers, 50 Applies a day, 5 KB). The reported processing
  result stays on the game server, as
  [How do the platform and a game server talk?](05-platform-game-server-communication.md)
  set it, because a reported id may name a configuration this platform never
  made.
- **Random ids.** A counter repeats ids after a restore from backup, and a
  server that processed the old id would mark the new one Confirmed without
  receiving it. A reported id the platform does not know counts as differing.
- **No Live configuration until the first Apply.** This revises
  [How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md),
  which had a new game server "running game defaults": a server already
  running EZConfig would be wiped by its first poll. Until the first Apply its
  polls get "no change" and it keeps its saved snapshot; the first Apply is
  the first wipe, after the owner's review.
- **Deleting.** A Ruleset takes its versions and clears every origin pointing
  into them (Drafts and all Live configurations) in one transaction. A game
  server takes its Draft, its Live configurations and its key. Rulesets
  belong to the owner and survive.
- **Supported build** is a stored platform setting the operator changes from
  the platform, so it changes without a deploy and is in every backup.
- **Not stored.** The config schemas and game defaults ship with each deploy
  (`src/lib/config/`), matching the release order in
  [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md).
  Held polls live in process memory; connection status is computed.
- **No built-in presets.** The only shipped one, Game Default, is the Draft's
  "Reset to game defaults". Rulesets are the only thing loaded into a Draft.

**Graduated.**
- [How does the owner's self-hosted data get onto the platform?](13-one-time-import.md)
- [What does the owner see of earlier Live configurations?](14-earlier-live-configurations.md)

**Handed on.**
- [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  the Draft's revision is there for the stale-save check; a game server has
  no Live configuration until its first Apply, so the first review cannot
  know what the server holds; an unknown reported id counts as differing.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  the stored form of the Game server key and of session tokens; whatever the
  invite gate stores; who may change the Supported build setting.
- [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  backing up and restoring one SQLite file; how schema changes run on deploy;
  Node or Bun as the app's runtime (the SQLite driver follows); the Supported
  build is settled as a stored setting.
