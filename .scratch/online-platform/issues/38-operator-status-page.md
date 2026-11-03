# 38: Operator status page

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 22, 27
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Without SSH, the platform operator can see:
- how many game servers are connected, and on which builds;
- whether the app has been logging warnings or errors since it started;
- whether backups are flowing, and when the last restore check passed.

## Acceptance criteria

- [x] Counts, computed when the page loads: game servers registered,
      Connected now, and Connected by reported build stamp with the Supported
      build marked (for example "12 on `2026.11.01`, 3 on `2026.10.20`"). No
      server or owner is named.
- [x] Health: the release commit, running since, and the warnings and errors
      since start with the newest 20 (time, event, scrubbed message), from the
      logging module.
- [x] Backup:
      - The localhost-only heartbeat route records the time in memory. The
        walking skeleton's route is reused if it exists.
      - The page reads "Backup: last confirmed 40 s ago".
      - It warns after 5 minutes without a heartbeat, or 5 minutes after
        start with none yet.
- [x] Restore check: the page reads the status file beside the database
      (time, passed or failed, reason). A missing file reads as never checked.
      It warns when the check failed or is more than 8 days old.
- [x] Only the platform operator can open the page. The heartbeat route
      answers only from localhost.
- [x] Route-handler tests cover:
      - counts by build stamp;
      - the health list;
      - the heartbeat warnings, with time moved forward;
      - the restore-check states: passed, failed, old and missing;
      - access by a non-operator being refused.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op38-status-page-375462` (not pushed). 203
tests pass (198 before, 5 new), typecheck is clean, and lint stays at 20. No
platform migration.

- Route: `GET /api/operator/status`, behind `requireOperator`, `no-store`. It
  returns `{ now, gameServers, health, backup, restoreCheck }` from
  `readPlatformStatus()` in `src/lib/platform/status.ts`. Reading it is not
  logged. #23's every-route session test covers it.
- Counts: `countGameServers()` in `game-servers.ts` reads only ids, last poll
  times and reported stamps, and uses `connectionStatus`, which now takes
  `Pick<GameServer, 'id' | 'lastPollAt'>`. Connected game servers are grouped
  by stamp: most first, then newer stamps, with "no build stamp" last. The
  Supported build is always listed, even with none on it. Stamps show as the
  poll reported them (`YYYYMMDD-HHMMSS`, or any text), in `<code>` as on
  #27's page.
- Health, release commit: read from `.git/HEAD` in the working directory.
  `deploy/release.sh` leaves each release a checkout at its commit with a
  detached HEAD, and the unit runs in it, so nothing changes in the deploy,
  and it works for the release live now. Anywhere else (a checkout on a
  branch, a worktree) it reads unknown. Running since is
  `performance.timeOrigin`. Warnings, errors and the newest 20 come from
  `readLogHealth()`.
- Backup: reuses #22's route and in-memory time; `backupHeartbeatOverdue()`
  was added to `backup-heartbeat.ts`. The page reads "Backup: last confirmed
  40 s ago", or "not confirmed since the app started 4 min ago". It warns
  after more than 5 minutes without one. The heartbeat route's loopback-only
  check was already tested by `tests/platform-hosting-routes.test.ts`.
- Restore check: `src/lib/platform/restore-check.ts` reads
  `<DATABASE_PATH>.restore-check.json`:
  `{"checkedAt": ISO 8601, "result": "passed" | "failed", "reason"?: text}`.
  It reads as passed, failed, never checked (no file) or unreadable (any other
  shape, never read as passed). The page warns when it failed, is more than 8
  days old, is missing or cannot be read. The format, and how #39 writes it
  (whole file, temp then rename, readable by `ezconfig`), is in
  `docs/hosting.md`, "The restore check's status file".
- UI: an operator-only Status tab (`src/components/operator/StatusPage.tsx`).
  Warnings show in a "Needs attention" box at the top, with a Refresh button.
- Tests: `tests/platform-status.test.ts` runs `tests/fixtures/platform-status.ts`,
  one scenario per process:
  - counts by build stamp, a held poll included, before and after a switch;
  - the health list: newest 20, scrubbed, no ids, and the release commit;
  - the heartbeat warnings, with time moved by `setSystemTime`;
  - the restore check: passed, failed, old, missing and unreadable;
  - access: signed out 401, a server owner 403.
- Checked by hand: `next dev` on port 3038 against a temp database, signed in
  as a made-up operator by cookie. Five of six game servers polled on three
  builds and were counted 3 / 1 / 1 with the Supported build marked. A
  loopback heartbeat got 204, and another Host 403. A refused request and a
  bad poll showed in the health list. A passed restore check, then a failed
  one, showed the "Needs attention" box, and so did 5 minutes without a
  heartbeat. Also checked at phone width.
- Not done here: the spec's startup log line with the release commit
  ("Logging"). It needs a release-commit field in `log.ts`, and
  `readReleaseCommit()` can supply it.
