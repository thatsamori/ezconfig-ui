# 32: Apply a Draft and deliver it

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 27, 30
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner reviews their Draft against the game server's Live
configuration and Applies it. The whole Draft becomes the new Live
configuration. A Connected game server on the Supported build gets it in its
held poll within about one round trip, grouped by category in today's command
encoding. The page shows Pending and Unapplied changes, and "Discard changes"
resets the Draft to the Live configuration.

Confirmed and Failed come next, in [Confirmed and Failed](33-confirmed-and-failed.md).
The feature review harness's Apply now runs through real Apply and poll
delivery.

## Acceptance criteria

- [x] The review lists keys added, changed and reset to game default,
      comparing the Draft with the Live configuration.
      - The first Apply instead lists every value the Draft sets, under the
        warning that every EZConfig value the server has now is replaced and
        anything not in the Draft returns to game default.
      - With no changes, it says "No changes; the server will be sent this
        configuration again".
- [x] Apply is enabled only while the game server is Connected and on the
      Supported build. When disabled, the button says why: Not connected,
      Never connected, or EZConfig needs updating. Both conditions are checked
      again when the request arrives.
- [x] Apply carries the Draft revision and the Live configuration id (or none)
      its review was built from. If either has changed, Apply is rejected and
      the review reopens.
- [x] Apply validates the whole Draft against the current schema and blocks
      with the list of values to fix.
- [x] In one transaction, Apply replaces the game server's Live configuration
      with a new one. The new one has a new random id, the Draft's values, the
      Draft's origin (or none) and an applied time. The previous Live
      configuration is deleted. A no-change Apply also gets a new id.
- [x] After the transaction commits, Apply wakes that game server's held poll.
- [x] A poll on the Supported build whose reported id differs from the Live
      configuration's (including an id the platform does not know) is answered
      at once with the whole Live configuration and its id. The configuration
      is grouped by category through the encoder from
      [Edit a game server's Draft](30-edit-a-game-servers-draft.md).
- [x] A game server with no Live configuration keeps getting "no change", so
      its first poll never wipes it.
- [x] The page shows the Live configuration as none yet or Pending (with how
      long), and shows Unapplied changes when the Draft differs from it.
- [x] "Discard changes" resets the Draft to the Live configuration, with the
      revision checked.
- [x] Apply and each delivery are logged by id, with no values.
- [x] The feature review harness's Apply runs a real Apply and reads the
      delivered batch from a held poll. Every feature review passes.
- [x] Route-handler tests cover:
      - each review case;
      - each disabled reason;
      - a stale revision or Live configuration id;
      - validation blocking Apply;
      - a held poll answered promptly after Apply;
      - an unknown reported id;
      - no wipe before the first Apply;
      - Discard changes.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op32-apply-deliver-267b29` (not pushed),
commits `fcfde2b`..`ea71821` on main `160e0eb`. 207 tests pass across 39
files, typecheck is clean, and lint is 13 (unchanged).

- Migration `0006-live-configurations.sql`: `live_configurations`, at most one
  per game server (keyed by `game_server_id`, deleted with it), with a unique
  random `id`, the values document in `overrides` and `applied_at`. Apply
  replaces the row by delete and insert, never update. There is no origin
  column: a Draft has none yet, so every Live configuration has none, and
  Rulesets (#35) adds it to both. #36 may also take `0006`; whichever merges
  second renumbers.
- Storage: `src/lib/platform/live-configurations.ts`.
  - `applyReview`: added, changed and reset, compared key by key as placed by
    the current schema, plus `errors` (only values with a place block Apply).
  - `applyDraft`: checks the revision and the Live configuration id,
    validates, replaces the Live configuration in one transaction, then wakes
    the held poll after the commit.
  - `pendingDelivery` and `deliveryOf`: what the poll route sends at once.
  - `discardChanges`, through `discardDraft` in `drafts.ts`: a
    revision-checked write of the Live configuration's document.
  - `GameServerView` gains `liveConfiguration` (`{ id, appliedAt }` or null),
    `unappliedChanges` and `applyBlocked` (the disabled reason, or null).
- Routes:
  - `GET`/`POST /api/game-servers/[id]/apply`. POST takes
    `{ revision, liveConfigurationId }`. It answers 409 with `reason`
    `never-connected`, `not-connected` or `needs-updating`, checked after the
    body is read; 400 `Validation failed` with `details`; 409 `reason: 'stale'`
    with the current review in `data`; or 200 `{ liveConfigurationId, appliedAt }`.
  - `POST /api/game-servers/[id]/draft/discard` takes `{ revision }`. It
    answers 409 when nothing has been applied yet, or 409 with the current
    Draft when the revision is stale.
- Poll route: on the Supported build, a reported id that is not the Live
  configuration's (another, an unknown one, or none) is answered at once with
  `live-configuration`, and that poll supersedes any held one. Otherwise the
  poll is held and an Apply wakes it; the build is checked again when it is
  answered. The log has `live-configuration.applied` (`userId`, `gameServerId`,
  id) and `live-configuration.delivered` (`gameServerId`, id), with no values.
  `docs/poll-exchange.md` describes the answer and when it is sent.
- Page: the Draft section shows Unapplied changes and "Live configuration: none
  yet" or "Pending · applied <time>". It has Edit Draft, Discard changes (only
  once applied and with changes; it confirms with the count), and Review and
  Apply, disabled as "Apply · <reason>". The review shows the first-Apply
  warning with every value, or Added, Changed (old value struck through) and
  Reset to game default, or the no-change line, and the values to fix. A
  stale refusal reopens it as it is now, with a notice.
- Draft code (#31 overlap): `drafts.ts` gains `discardDraft`, and
  `findOwnedDraft` checks the owner in its own query instead of importing
  `game-servers.ts` (an import cycle otherwise). The Draft write paths are
  unchanged.
- Feature review harness: sets the Supported build, holds a real poll,
  Applies through the routes and reads the batch from the delivery, then polls
  again with `processed`. A refused Apply is now 400, not 500, so five review
  fixtures say so. Every feature review passes.
- Tests: `tests/platform-apply.test.ts` with `tests/fixtures/platform-apply.ts`:
  review, blocked, stale, validation, delivery (a held poll woken; another,
  unknown or no id answered at once; supersede; a build that is not the
  Supported build), no wipe, Discard changes, and ownership.
- Fix outside this ticket (`79ee9ca`): `storage.ts` keeps its own statement
  cache and finalizes every statement on close. Bun's `query()` cache holds
  20; past that, statements stayed open until garbage collection, and Windows
  could not delete a closed temp database (EBUSY).
- Browser check, in the built-in browser: a dev server from the worktree on
  port 3432, with temp storage, no `.env`, `RCON_HOST=127.0.0.1`, automatic
  sync off, a `signInForTest` session and simulated polls with the temp key.
  - Before the first Apply, a poll with no id was held and got `no-change`.
  - The first review showed the warning and "The Draft sets 3 values". After
    the held poll had ended, Apply was refused and the button became "Apply ·
    Not connected". With a poll held, Apply answered it 1.9 s after it arrived
    with the batch, and the page showed "Pending · applied just now" with no
    Unapplied tag.
  - A poll reporting that id was held for 50 s and got `no-change`.
  - After a Draft edit, Unapplied changes and Discard changes appeared. The
    review showed Added TimeToMaxSprint, Changed MaxWalkSpeed 450 → 500 and
    Reset CanDodge.
  - Saving the Draft again with the review open made Apply stale: the review
    reopened with 450 → 520 and the notice.
  - Discard changes ("3 unapplied changes") put the Draft back to the Live
    values (revision 4), and the tag went away.
  - The no-change review showed its line. Its Apply gave a new id and woke the
    held poll with the same batch.
  - A held poll from an older build made it "Apply · EZConfig needs updating".
  - At 375 px nothing scrolls sideways. A wrapped review row was clipped by a
    class-name clash with the older review dialog; fixed in `ea71821`.
  - The log lines carried ids only.
- Left for later:
  - Confirmed and Failed (#33): the page shows Pending whenever a Live
    configuration exists. Nothing yet compares the reported `processed` with
    it.
  - If a deploy tightens a key after an Apply, `encodeValues` throws on the
    Live configuration's next delivery. That poll gets 500 and an error is
    logged on each poll, until the owner fixes the value and Applies again
    (Apply lists it). #33 may want to show this as Failed.
  - Origin waits for Rulesets (#35), and the self-hosted Apply path for
    [Remove the self-hosted mode](41-remove-the-self-hosted-mode.md).
