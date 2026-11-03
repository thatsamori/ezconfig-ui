# 27: Supported build

Status: open
Type: task
Created: 2026-11-02
Blocked by: 26
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform operator sets the Supported build from the platform, without a
deploy. A game server that reports any other build stamp, or none, is sent
nothing. Its owner sees "EZConfig needs updating" with both stamps.

## Acceptance criteria

- [ ] Only the platform operator can set the Supported build stamp
      (`YYYYMMDD-HHMMSS`). It is stored with set at and set by, and the page
      reads "Supported build `X`, set 3 days ago".
- [ ] While no Supported build is set, nothing is sent to any game server.
- [ ] A poll reporting another stamp or none is held like any other poll and
      answered "not the Supported build" when the hold ends, so an outdated
      game server stays Connected without a tight polling loop.
- [ ] Such a game server shows "EZConfig needs updating", with the running
      stamp and the Supported build stamp.
- [ ] A reported build that is not the Supported build is logged when it
      changes, not on every poll. Setting the Supported build is logged as an
      operator action.
- [ ] Route-handler tests cover:
      - nothing being sent while unset;
      - a matching stamp, a different stamp and no stamp;
      - only the operator being able to set it;
      - set at and set by.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
