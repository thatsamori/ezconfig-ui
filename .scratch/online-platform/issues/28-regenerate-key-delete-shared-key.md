# 28: Regenerate key, delete a game server, shared-key warning

Status: open
Type: task
Created: 2026-11-02
Blocked by: 26
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner can:
- replace a lost or leaked Game server key;
- delete a game server;
- see a warning when two game servers are polling with one key.

## Acceptance criteria

- [ ] Regenerate key asks to confirm: "This server stops receiving
      configuration until you put the new key in its Game.ini and restart it".
      Then:
      - the old key ends at once, with no grace period;
      - a poll held on the old key is answered "key rejected";
      - the new key is shown once;
      - the game server is Not connected until it polls with the new key.
- [ ] Deleting a game server removes its Draft, its Live configuration (once
      Live configurations exist) and its key. A held poll is answered "key
      rejected". The owner's Rulesets survive.
- [ ] When polls from different instance ids supersede each other about 3
      times within 5 minutes, the server page warns "More than one server is
      using this key" and points to Regenerate key. A single supersede, as
      after a restart or map change, does not trip the warning. The count
      lives in process memory with the held polls.
- [ ] Regenerating, deleting and the warning are logged.
- [ ] Route-handler tests cover each case above, including a held poll on the
      old key and the supersede threshold with time moved forward.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
