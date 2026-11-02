# 06: How do Ruleset versions stay usable as the key contract changes?

Status: open
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
