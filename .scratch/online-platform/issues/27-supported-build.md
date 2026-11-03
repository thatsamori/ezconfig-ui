# 27: Supported build

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 26
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform operator sets the Supported build from the platform, without a
deploy. A game server that reports any other build stamp, or none, is sent
nothing. Its owner sees "EZConfig needs updating" with both stamps.

## Acceptance criteria

- [x] Only the platform operator can set the Supported build stamp
      (`YYYYMMDD-HHMMSS`). It is stored with set at and set by, and the page
      reads "Supported build `X`, set 3 days ago".
- [x] While no Supported build is set, nothing is sent to any game server.
- [x] A poll reporting another stamp or none is held like any other poll and
      answered "not the Supported build" when the hold ends, so an outdated
      game server stays Connected without a tight polling loop.
- [x] Such a game server shows "EZConfig needs updating", with the running
      stamp and the Supported build stamp.
- [x] A reported build that is not the Supported build is logged when it
      changes, not on every poll. Setting the Supported build is logged as an
      operator action.
- [x] Route-handler tests cover:
      - nothing being sent while unset;
      - a matching stamp, a different stamp and no stamp;
      - only the operator being able to set it;
      - set at and set by.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op27-supported-build-dca3a3` (not pushed).
198 tests pass (195 before, 3 new), typecheck is clean, and lint stays at 20.

- Migration `0005-supported-build.sql` adds `supported_build`: at most one row
  (`id` 1) with the stamp, set at and set by (`ON DELETE SET NULL`, read as "a
  former server owner"). No row means none is set. A switch replaces the row;
  earlier stamps live in the journal. [#28](28-regenerate-key-delete-shared-key.md)
  or [#30](30-edit-a-game-servers-draft.md) may add a 0005 too; whichever
  merges second renumbers its file.
- `src/lib/platform/supported-build.ts`: `readBuildStamp` (`YYYYMMDD-HHMMSS`
  and a real date and time, trimmed), `readSupportedBuild`,
  `setSupportedBuild` (the same stamp again changes nothing and keeps set at
  and set by), `isSupportedBuild(reported)` and `logReportedBuild`.
- Routes: `GET`/`PUT /api/operator/supported-build` (`{ stamp }`), behind
  `requireOperator`. A switch logs `supported-build.set` with `userId` and
  `buildStamp`, a field `log.ts` now allows, kept only in its stamp form
  because a poll may report any text.
- The poll route decides when the hold ends: a held poll whose `buildStamp`
  is not the Supported build at that moment (or none is set) is answered
  `not-supported-build` instead of `no-change`. Superseding is unchanged.
  Switching the Supported build does not wake held polls; they get the
  answer for the new setting within 50 s.
- `poll.not-supported-build` (info, `gameServerId`, `buildStamp`) is logged
  before the poll is recorded, when it is the game server's first poll or its
  `buildStamp` differs from the last one and is not the Supported build.
  Switching the Supported build logs nothing per game server.
- `GameServerView.needsUpdating` is `{ running, supported }` or null. It sits
  beside `connection`, which is unchanged, so an outdated game server still
  reads Connected (for [#32](32-apply-a-draft-and-deliver-it.md)'s Apply
  check and [#38](38-operator-status-page.md)'s "Connected by build"). The
  server page shows "EZConfig needs updating" with both stamps and says to
  restart the game server; the list row shows a short tag. While none is set
  it reads "No Supported build yet" instead, since updating EZConfig would not
  help.
- UI: a "Supported build" rail item for the operator
  (`src/components/operator/SupportedBuildPage.tsx`): "Supported build `X`,
  set 3 days ago by <name>", and a form to set it. Not checked in a browser.
- `docs/poll-exchange.md`: `not-supported-build` moved into the answers
  table, with a holding note, the owner's "EZConfig needs updating", the new
  log line, and the Supported build step in "Trying it by hand".
  `live-configuration` (#32) now says "on the Supported build only".
- Tests: `tests/platform-supported-build.test.ts` runs
  `tests/fixtures/platform-supported-build.ts` per scenario (unset; matching,
  different, no and non-stamp stamps with a switch during a hold; operator
  only, validation, set at and set by, the setter deleted).
  `signInForTest(name, discordId?)` signs in a given account, such as an
  operator. #26's fixture now sets the Supported build to the stamp its polls
  report, so they still test `no-change`.

For #32: gate the immediate `live-configuration` answer, and any Apply that
wakes a held poll, on `isSupportedBuild(report.buildStamp)`.
