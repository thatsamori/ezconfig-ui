# 28: Regenerate key, delete a game server, shared-key warning

Status: completed
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

- [x] Regenerate key asks to confirm: "This server stops receiving
      configuration until you put the new key in its Game.ini and restart it".
      Then:
      - the old key ends at once, with no grace period;
      - a poll held on the old key is answered "key rejected";
      - the new key is shown once;
      - the game server is Not connected until it polls with the new key.
- [x] Deleting a game server removes its Draft, its Live configuration (once
      Live configurations exist) and its key. A held poll is answered "key
      rejected". The owner's Rulesets survive.
- [x] When polls from different instance ids supersede each other about 3
      times within 5 minutes, the server page warns "More than one server is
      using this key" and points to Regenerate key. A single supersede, as
      after a restart or map change, does not trip the warning. The count
      lives in process memory with the held polls.
- [x] Regenerating, deleting and the warning are logged.
- [x] Route-handler tests cover each case above, including a held poll on the
      old key and the supersede threshold with time moved forward.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op28-key-delete-shared-key-b4ba69` (not
pushed). 198 tests pass (195 before, 3 new), typecheck is clean, and lint
stays at 20.

- No migration. `0004-game-servers.sql` already deletes the Draft with its
  game server (`ON DELETE CASCADE`), and storage enforces foreign keys on
  every connection. [Apply a Draft](32-apply-a-draft-and-deliver-it.md) should
  give the Live configuration table the same `REFERENCES game_servers (id) ON
  DELETE CASCADE`. The delete test checks every table with a foreign key to
  `game_servers` and every other table (so [Rulesets](35-rulesets.md) are
  covered once they exist). A table that reaches game servers only through
  another table needs that test widened.
- Routes: `POST /api/game-servers/<id>/regenerate-key` returns the new key
  once, like registering; `DELETE /api/game-servers/<id>`. Both are 404 for
  another owner's game server. `regenerateGameServerKey` and
  `deleteGameServer` in `src/lib/platform/game-servers.ts` call `endKey` in
  `src/lib/platform/polls.ts`, which answers a held poll `key-rejected` (the
  poll route sends it as `401`). After a regenerate the game server is Not
  connected until a poll with the new key is held. A delete also drops the
  game server's in-memory state, since SQLite gives the highest deleted id to
  the next game server registered.
- The poll route looks the key up again once the body has arrived. A poll
  whose key ended while its body was still arriving gets `401`, never a hold.
  Nothing may `await` between that look-up and `holdPoll`.
- The shared-key warning counts a supersede only when the instance that sends
  it was itself superseded, by a different instance, within 5 minutes. Three
  that count within 5 minutes trip it (`GameServerView.sharedKey`). Two
  servers on one key trip it within about 30 s. A restart or map change brings
  a new instance id that was never superseded, so it never counts. That keeps
  the warning clear of main's proxy issue, where a hang-up leaves the old poll
  held and every reconnect supersedes it. Regenerate key starts the count
  again. Picked over counting every supersede between different ids, which
  three map changes in 5 minutes would trip.
- Logged: `game-server.key-regenerated` and `game-server.deleted` (info, with
  `userId` and `gameServerId`), and `key.shared` (warning, with
  `gameServerId`) once each time the warning trips. No key material.
- `docs/poll-exchange.md`: the `401` row now also covers a held poll whose key
  ends, and the shared-key rule and `key.shared` are written down.
  [The mod polls the platform](29-mod-polls-the-platform.md) handles that `401`
  as any other: it can now arrive at the end of a hold, not only at once.
- UI: Regenerate key is a button wherever the page names it (the checklist's
  "Lost it?", the key's last 4 characters and the warning), behind the
  ticket's confirm. The new key then shows once in the setup checklist. Delete
  game server sits at the foot of the page behind its own confirm.
- Checked by hand with `bun --bun next dev` against a temp database:
  - alternating polls from two instance ids showed the warning and logged
    `key.shared`;
  - Regenerate key showed the new key once and Not connected at once, and the
    held poll got `401 {"answer":"key-rejected"}` over HTTP;
  - Delete went back to the list;
  - no `ezc_gsk` in the server output, and no sideways scroll at 375 px.
