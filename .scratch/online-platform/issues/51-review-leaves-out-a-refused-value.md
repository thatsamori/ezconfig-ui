# 51: The review leaves out a refused value without saying so

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Found by the check of `main` at `d04dfcb`. Its write-up is
`check-main-d04dfcb.md` in the shared notes folder.

A value the input refuses never reaches the Draft. The review is right about the
Draft, but an owner reads it as being about what they just typed.

To reproduce: in Camera, click the `CustomFOVMax` default, type 500 and click
Apply to game server. The review says "No changes" and that the configuration
will be sent again, with Apply enabled. It doesn't mention the typed value it
left out.

The bar has the same gap: it says "Matches the Live configuration" while a row
holds a refused, unsaved value, though the "Not saved" line explains it.

## Acceptance criteria

- [ ] While a field holds a refused value, Apply to game server says so, naming
      the key, instead of a review that reads as if nothing is wrong. The owner
      can fix or discard the value and go on.
- [ ] The bar doesn't say the Draft matches the Live configuration while a field
      holds a refused value.
- [ ] A review with no refused value open is unchanged.
- [ ] Checked in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
