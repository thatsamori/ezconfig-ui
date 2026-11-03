# 45: Tidy after the self-hosted removal

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Small leftovers the check of `main` at `65a7ce5` found after
[Remove the self-hosted mode](41-remove-the-self-hosted-mode.md) and
[Operator manages server owners](37-operator-manages-server-owners.md)
merged. None is a bug in behaviour. The check's write-up is
`check-main-65a7ce5.md` in the shared notes folder.

Two were fixed at once on `main`:
- the Discard confirm's "1 unapplied change are lost" in `GameServersTab.tsx`;
- the stale automatic-sync line in `tests/fixtures/platform-invites.ts`'s header.

Left:
- `tests/weapon-integration.test.ts:2` names its test "...through captured
  RCON", and the `source:` strings in `tests/fixtures/movement-combined-review.ts:88`,
  `weapon-general-review.ts:39` and `weapon-roster-review.ts:56` still say
  "captured RCON". The capture now comes from the feature review harness.
  The `.scratch/*-ui/` evidence files keep their old wording; they are
  historical records.
- The Server owners Delete dialog at 420 px wide with a very long owner name:
  the close × overlaps the end of the title's first line by about 7 px.

## Acceptance criteria

- [ ] The test name and the three fixtures' `source:` strings describe the
      review harness's capture, not RCON. The feature reviews still pass.
- [ ] The Delete dialog's title never runs under the close × at 420 px, with
      a long owner name. Checked in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
