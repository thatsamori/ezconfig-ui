# 06: How do Ruleset versions stay usable as the key contract changes?

Status: resolved
Type: grilling
Created: 2026-11-01
Blocked by: 04
Parent: [Map: EZConfig online platform](../map.md)

## Question

Ruleset versions are immutable and recorded against a key contract, but keys
are added, deprecated and sometimes moved between categories. Decide:

- How a key contract is identified, and how it relates to the mod's build
  stamp and the webapp's string schemas.
- What happens when an old version is loaded onto a server or opened for
  editing: missing keys, deprecated keys, moved keys. Migrate when it is read,
  or migrate into a new version?
- How a version is checked against the contract a particular server runs
  (the batch protocol already reports unknown keys).

## Context

- Precedent: the parry-geometry migration moved keys from Combat to Parry and
  rewrote stored JSON at startup (`docs/parry-geometry-migration.md`).
  Immutable versions cannot be rewritten in place.
- Key names never change once published; a rename is a new key plus
  deprecation (mod `AGENTS.md`, "Adding or changing a config key").
- From [How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md):
  a Draft and a Live configuration each show whether they are modified from
  their origin Ruleset version, by comparing values. That comparison has to
  hold when the origin was written for an older key contract. Loading copies
  a version into a Draft, so the Draft can be migrated without touching the
  version.

## Answer

Resolved 2026-11-02 by grilling the owner. V1 keeps no key contract: no
contract numbers, no migration chain, no per-server contract handling. That
design was worked through and then ruled out of scope to keep V1 simple (see
the map's Out of scope). Term added to [CONTEXT.md](../../../CONTEXT.md):
Supported build.

**Supported build.** The platform sends configuration only to game servers
running one EZConfig build, named by its build stamp (mod `CONTEXT.md`, Build
stamp).
- The Supported build is a runtime setting the platform operator changes
  without a deploy. It holds exactly one stamp.
- A game server reporting any other stamp, or none, gets nothing sent: no
  Apply and no re-delivery. It keeps running its saved snapshot. Its owner can
  still edit the Draft; Apply says EZConfig needs updating. Every build today
  counts as reporting none: the stamp reaches only the console and chat
  (`ezconfig version`, mod `docs/engine-notes.md`).
- Every mod publish, bug-fix builds included, cuts every game server off
  until it restarts onto the new pak. Accepted for V1; a list of supported
  stamps was offered and declined.
- Rejected: a version number carried by the mod and raised by hand when keys
  change (needs a mod change and discipline), and a stamp fixed at deploy
  (every rebuild would need a platform release).
- Release order follows from this: publish the mod build, then deploy any
  schema change and switch the Supported build together. Until the switch,
  servers that restarted onto the new pak get nothing; after it, servers
  still on the old pak get nothing.

**Old Ruleset versions.**
- A value is identified by its database, weapon class and key name, never its
  category. Key names are unique within each database (182 Character, 65
  Weapon keys in `string-schemas/`), so loading places each value under its
  key's current category and a category move costs nothing.
- A value whose key the current schema no longer has is dropped on load, and
  the owner is told how many. A key added later is absent from old versions,
  which keep running its game default as before.
- Versions record nothing about the key set and are never rewritten. A rename
  (new key plus deprecation) loses the old value in old versions unless a
  one-off fix is written when it happens; V1 builds nothing for it.
- Drafts and Live configurations are read by the same rules.

**Modified.** Compares stored overrides exactly, over keys the current schema
has. An override equal to the game default is not the same as no override: it
pins the value if a Mordhau patch changes the default. Today a reset deletes
the key (`src/lib/store/configStore.ts:8`), so pins already exist. Values
dropped as unknown do not count.

**Notes.** Stay keyed by key name per database (`src/lib/notes/types.ts`), so a
category move does not touch them. Notes on a key the schema no longer has
stay stored but hidden.

**Handed on.**
- [How do the platform and a game server talk?](05-platform-game-server-communication.md):
  the mod reports its build stamp to the platform in a form it can read.
- [Where does each entity get stored?](07-entity-storage.md): values are keyed
  by database, weapon class and key name; versions carry no key-set marker.
- [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  what the owner sees for a game server on another build, and re-delivery
  once it restarts onto the Supported build (today every map start asks for a
  full re-sync).
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  changing the Supported build is an operator action.
- [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  where the Supported build setting lives, changeable without a deploy.
- The one-time import reads the owner's data by the same rules.
