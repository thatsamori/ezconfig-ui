# 04: How does a server's live configuration relate to Rulesets?

Status: resolved
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

## Answer

Resolved 2026-11-01 by grilling the owner. Terms are in
[CONTEXT.md](../../../CONTEXT.md): Game server, Draft, Live configuration,
Apply, Confirmed, Pending, Origin, Note.

**Draft and Apply.** Edits are not live as they are made. Each game server has
a Draft that auto-saves as the owner edits, and an explicit Apply that makes
the whole Draft its Live configuration.
- Why not live editing: every accepted command re-applies the whole database
  on every EZ character and weapon, on the server and each client, and saves
  both databases (mod `docs/engine-notes.md`, `docs/server-persistence.md`).
  Removing one key needs a wipe; a per-key delete is ruled out (mod
  `.scratch/geometry-rules/spec.md:177`). Live edits would also send related
  keys one at a time and put typos in front of players.
- Apply takes the whole Draft; there is no selective apply.
- Apply first shows a review of the Draft against the Live configuration
  (keys added, changed, and reset to game default) and asks to confirm.
  Reset rows are mandatory: today's selective apply without a wipe leaves a
  reset key live on the server without saying so
  (`src/components/SelectiveApplyDialog.tsx:84-87`).
- "Discard changes" resets the Draft to the Live configuration.
- "Reset to game defaults" empties the Draft and clears its origin. A newly
  registered game server starts the same way: empty, running game defaults.

**States.** A Live configuration is Pending until the game server acknowledges
processing it, then Confirmed. Uncertain and rejected results, offline
servers and stale saves belong to
[What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md).

**Apply, the word.** The platform's Apply and the mod's Apply (one EZ instance
writing its config values onto itself) are separate terms in separate
glossaries; each glossary names the other. No rename on either side.

**Rulesets.**
- Loading a Ruleset version copies its values, replacing the whole Draft
  (both databases). Nothing goes live until Apply. A server never follows a
  version by reference.
- The only way to author a version is "Save as Ruleset version" from a Draft:
  the next version of an existing Ruleset, or version 1 of a new one. Saving
  never applies.
- Versions are numbered in order within their Ruleset and carry an optional
  description (not a "note").
- Any version can be loaded onto any number of the owner's game servers.
  Copying a configuration between game servers goes only through a version.
- Rulesets can be renamed and deleted. Deleting a Ruleset deletes all its
  versions; a single version is never deleted.

**Origin.** The Draft and the Live configuration each record their origin, the
Ruleset version they were last loaded from or saved as. Apply copies the
Draft's origin to the Live configuration; saving a Draft as a version makes
that version its origin. "Modified" is computed by comparing values with the
origin, not by tracking edits. Deleting a Ruleset clears every origin that
pointed into it; the values stay.

**Notes.** Notes are global in V1: one comment section per config key that
every server owner can read, kept outside Drafts, Live configurations and
Ruleset versions (today they are keyed by key name per schema,
`src/lib/notes/types.ts`). An author edits and deletes only their own notes,
identified by the Discord session rather than the request body (today any
client can name any author, `src/app/api/notes/[schema]/add/route.ts`); the
platform operator can delete any note. Abuse handling stays out of scope
while V1 is invite-only.

**Handed on.**
- [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md):
  "modified" must compare values across contract changes.
- [Where does each entity get stored?](07-entity-storage.md): the entities
  are settled.
- [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  stale auto-saves and Apply's review.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  the operator role.
- The one-time import gains the owner's existing Notes.
