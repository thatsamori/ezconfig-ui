# 32: Apply a Draft and deliver it

Status: open
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

- [ ] The review lists keys added, changed and reset to game default,
      comparing the Draft with the Live configuration.
      - The first Apply instead lists every value the Draft sets, under the
        warning that every EZConfig value the server has now is replaced and
        anything not in the Draft returns to game default.
      - With no changes, it says "No changes; the server will be sent this
        configuration again".
- [ ] Apply is enabled only while the game server is Connected and on the
      Supported build. When disabled, the button says why: Not connected,
      Never connected, or EZConfig needs updating. Both conditions are checked
      again when the request arrives.
- [ ] Apply carries the Draft revision and the Live configuration id (or none)
      its review was built from. If either has changed, Apply is rejected and
      the review reopens.
- [ ] Apply validates the whole Draft against the current schema and blocks
      with the list of values to fix.
- [ ] In one transaction, Apply replaces the game server's Live configuration
      with a new one. The new one has a new random id, the Draft's values, the
      Draft's origin (or none) and an applied time. The previous Live
      configuration is deleted. A no-change Apply also gets a new id.
- [ ] After the transaction commits, Apply wakes that game server's held poll.
- [ ] A poll on the Supported build whose reported id differs from the Live
      configuration's (including an id the platform does not know) is answered
      at once with the whole Live configuration and its id. The configuration
      is grouped by category through the encoder from
      [Edit a game server's Draft](30-edit-a-game-servers-draft.md).
- [ ] A game server with no Live configuration keeps getting "no change", so
      its first poll never wipes it.
- [ ] The page shows the Live configuration as none yet or Pending (with how
      long), and shows Unapplied changes when the Draft differs from it.
- [ ] "Discard changes" resets the Draft to the Live configuration, with the
      revision checked.
- [ ] Apply and each delivery are logged by id, with no values.
- [ ] The feature review harness's Apply runs a real Apply and reads the
      delivered batch from a held poll. Every feature review passes.
- [ ] Route-handler tests cover:
      - each review case;
      - each disabled reason;
      - a stale revision or Live configuration id;
      - validation blocking Apply;
      - a held poll answered promptly after Apply;
      - an unknown reported id;
      - no wipe before the first Apply;
      - Discard changes.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
