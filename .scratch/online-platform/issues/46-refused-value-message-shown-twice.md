# 46: A refused value's message shows twice

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

When the editor marks a value the schema refuses, its message appears twice
under the field. One copy comes from the value editor
(`src/components/console/ValueEditor.tsx:44`), the other from the key row
(`src/components/console/ConfigConsole.tsx:77`).

This was found by the check of `main` at `f8ec3b1`, after
[A Live configuration the schema refuses](44-live-configuration-the-schema-refuses.md)
merged. #44 noted the same doubling after a refused save, before its change.

To reproduce: open Edit Draft on a Blocked game server and go to the Camera
group. The check's write-up, `check-main-f8ec3b1.md` in the shared notes
folder, has screenshots.

Not part of this ticket: while two values are refused, fixing the first one
still shows "Not saved" naming the second. The Draft is saved whole, so that
is expected.

## Acceptance criteria

- [ ] A refused value shows its message once, both when a Draft opens with
      marks and after a refused save.
- [ ] Every other place that shows a value's error still shows it, checked
      in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
