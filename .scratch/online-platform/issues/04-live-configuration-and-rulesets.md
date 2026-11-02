# 04: How does a server's live configuration relate to Rulesets?

Status: open
Type: grilling
Created: 2026-11-01
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

## Question

What is a game server's live configuration, and how does it move to and from
Rulesets? Decide:

- Whether there is an explicit Apply step, or every edit goes live as it is
  made. The owner raised auto-save while charting (2026-11-01): "it becomes
  more of a directly editing the game tool".
- If Apply stays, the states a live configuration passes through (edited,
  applied, confirmed by the server) and what the step is called. CONTEXT.md's
  **Apply** already means the mod writing values onto one EZ instance, while
  the webapp also calls sending values to the server apply
  (`src/lib/database/apply.ts`).
- Loading a Ruleset version onto a server, and saving a server's live
  configuration as a new Ruleset version: copy or reference? Does a server
  remember which version it came from and whether it has drifted since?
- Whether one Ruleset can be loaded onto several of the owner's servers.

Record resolved terms in CONTEXT.md.

## Context

Facts to weigh, gathered while charting:
- Every accepted command mirrors into replicated arrays, and every EZ weapon
  and character re-applies its config in `OnRep`, on the server and every
  client (mod `docs/engine-notes.md`, Runtime overview).
- Today's apply is an acknowledged batch: admission, wipe, then replace
  (`docs/server-processing-results.md`, `docs/automatic-sync.md`).
  Delivering single edits would need per-key or per-category commands.
- The 5 s requirement runs from the moment a change becomes live.
- Writing to storage is not the slow step; delivery to the game server is.
