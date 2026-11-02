# 08: What happens between a live change and the server confirming it?

Status: open
Type: grilling
Created: 2026-11-01
Blocked by: 04, 05
Parent: [Map: EZConfig online platform](../map.md)

## Question

From the moment a change becomes live (on Apply or on edit, per
[How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md))
until the game server confirms it, decide:

- What the platform records: the state the owner wants versus the state the
  server has confirmed.
- What happens when the server is offline, restarts or changes map, rejects a
  value, or the result is uncertain.
- How the owner sees each of those states.
- How a stale save is rejected, for example from two open tabs.

## Context

- On startup the config actor restores its saved snapshot, then asks for an
  update (mod `docs/server-persistence.md`).
- Today's rule for uncertain results: never replay automatically (`docs/server-processing-results.md`).
- Today's stale-save check: `src/lib/database/revision.ts`.
