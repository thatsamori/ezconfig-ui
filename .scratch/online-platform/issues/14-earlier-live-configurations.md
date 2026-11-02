# 14: What does the owner see of earlier Live configurations?

Status: open
Type: grilling
Created: 2026-11-02
Blocked by: 08
Parent: [Map: EZConfig online platform](../map.md)

## Question

Every Live configuration is kept. Decide what V1 shows of the earlier ones, if
anything:

- Whether a game server shows its Apply history at all in V1.
- What each entry shows: applied time, origin, its values, a comparison with
  the one before or the current one, and what the server reported for it.
- Whether an earlier Live configuration can be loaded into the Draft, or only
  saved as a Ruleset version.
- Whether anything is ever pruned.

## Context

- [Where does each entity get stored?](07-entity-storage.md): Apply inserts
  an immutable Live configuration with a random id, values, origin and applied
  time; earlier ones are never pruned in V1 (worst case about 2 GB a year).
  Deleting a Ruleset clears their origins; deleting a game server deletes
  them.
- The game server keeps only the last reported processing result, not one
  per Live configuration. If history shows outcomes, storage needs more.
- [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md)
  decides the states and outcomes the owner sees for the current one.
- [How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md):
  loading a Ruleset version replaces the whole Draft and copying between
  servers goes only through a version.
