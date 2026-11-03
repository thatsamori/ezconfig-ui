# 38: Operator status page

Status: open
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

- [ ] Counts, computed when the page loads: game servers registered,
      Connected now, and Connected by reported build stamp with the Supported
      build marked (for example "12 on `2026.11.01`, 3 on `2026.10.20`"). No
      server or owner is named.
- [ ] Health: the release commit, running since, and the warnings and errors
      since start with the newest 20 (time, event, scrubbed message), from the
      logging module.
- [ ] Backup:
      - The localhost-only heartbeat route records the time in memory. The
        walking skeleton's route is reused if it exists.
      - The page reads "Backup: last confirmed 40 s ago".
      - It warns after 5 minutes without a heartbeat, or 5 minutes after
        start with none yet.
- [ ] Restore check: the page reads the status file beside the database
      (time, passed or failed, reason). A missing file reads as never checked.
      It warns when the check failed or is more than 8 days old.
- [ ] Only the platform operator can open the page. The heartbeat route
      answers only from localhost.
- [ ] Route-handler tests cover:
      - counts by build stamp;
      - the health list;
      - the heartbeat warnings, with time moved forward;
      - the restore-check states: passed, failed, old and missing;
      - access by a non-operator being refused.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
