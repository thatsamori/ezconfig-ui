# 26: Register a game server and see it Connected

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 23
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner registers a game server and gets its Game server key once,
with the setup checklist. When anything polls with that key, the server page
shows Connected within a few seconds.

This slice builds the poll endpoint and its in-process registry of held polls.
Nothing is delivered yet: [Supported build](27-supported-build.md) and
[Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) add that.
The poll exchange's JSON fields are chosen here and documented as the contract
that [Mod polls the platform](29-mod-polls-the-platform.md) builds against.

## Acceptance criteria

- [x] A server owner registers a game server by name. Names are unique per
      owner, ignoring case. An empty Draft is created with it.
- [x] The key is `ezc_gsk_` followed by 32 random bytes in base64url. It is
      stored only as a SHA-256 hash with a unique index, plus its last 4
      characters. It is shown in full once, with a copy button and "You won't
      see this key again".
- [x] A Never connected game server's page shows the setup checklist from the
      spec. The Game.ini block holds the real key only while it is shown;
      afterwards the step reads "Key ending in `ab12`. Lost it? Regenerate
      key."
- [x] The poll endpoint accepts only POST, with `Authorization: Bearer <key>`:
      - An unknown key gets `401` "key rejected". These polls are logged as
        one count per hour.
      - A known key records the last poll time, the reported build stamp, and
        the reported processed id and result as reported.
      - The poll is held for up to 50 s (settable for tests), then answered
        "no change".
      - A newer poll from the same game server supersedes the held one, which
        is answered "superseded".
- [x] Held polls live in one in-process registry keyed by game server, along
      with the instance ids. Routine polls are never logged; superseding is.
- [x] Connection status is computed, never stored:
      - Connected: a poll is held, or one ended within about 15 s.
      - Not connected: shown with last seen.
      - Never connected: no poll yet.
- [x] The server list and the server page refresh about every 2 s while open.
- [x] The poll exchange's request and response fields are documented in
      `docs/` as the contract for the mod.
- [x] If the walking skeleton's temporary held-poll route exists, this
      endpoint replaces it.
- [x] Route-handler tests cover:
      - registering, including duplicate names;
      - the key shown once and stored only hashed (the database file never
        contains the key);
      - `401`, the hold ending in "no change", and superseding;
      - each connection status, with time moved forward.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op26-register-and-connect-6baf8e` (not
pushed). 181 tests pass (175 before, 6 new), typecheck is clean, and lint
stays at 20.

- Migration `0004-game-servers.sql` (renumbered from 0003 at merge, after #25's `0003-invites.sql`) adds `game_servers` and `drafts`.
  `game_servers` holds the owner, the name and its lower-cased `name_key`
  (unique per owner), the key's SHA-256 hex (unique) and last 4 characters,
  when it was registered and last polled, and the reported build stamp,
  processed id and result. A Draft starts as `{}` at revision 0. The Draft's
  origin column is left to the slice that needs it. [Invites](25-invites.md)
  also adds a 0003; whichever merges second renumbers its file.
- The poll endpoint is `POST /game-server/poll`
  (`src/app/game-server/poll/route.ts`). It sits outside `src/app/api/`,
  whose handlers all need a session (the sign-in routes test checks that);
  game servers send their key instead. The contract is
  `docs/poll-exchange.md`. It covers `no-change`, `superseded`,
  `key-rejected` (401), `bad-request` (400, with `error`) and `error` (500).
  It also documents ahead the `not-supported-build` answer
  ([#27](27-supported-build.md)) and the `live-configuration` answer with its
  `commands` ([#32](32-apply-a-draft-and-deliver-it.md)).
- `src/lib/platform/polls.ts` is the registry. `setPollHoldMs` sets the hold
  for tests. `answerHeldPoll` answers a held poll early: `key-rejected` for
  Regenerate key or Delete ([#28](28-regenerate-key-delete-shared-key.md)), a Live
  configuration on Apply (#32). Each held poll keeps its instance id for the
  shared-key warning.
- An unchanged report writes `last_poll_at` at most every 5 minutes. The exact
  end of the last poll is kept in memory, and last seen is the later of the
  two. This keeps Litestream's bucket from growing on every poll (#22's
  note). After a restart, last seen can be up to 5 minutes early.
- Polls with an unknown key are counted per clock hour and logged as
  `poll.key-rejected` with `count`, a numeric field `log.ts` now allows.
  Superseding logs `poll.superseded`, and a body that breaks the contract logs
  `poll.bad-request` (a warning). Routine polls log nothing.
- UI: a Game servers item on the rail (`src/components/game-servers/`). The
  list and the server page refresh every 2 s while visible
  (`src/lib/hooks/useRefreshingJson.ts`). The key shows only on the page
  registering opens, and leaving that page drops it. Copy uses the clipboard
  API; where the browser refuses, it selects the block and says to press
  Ctrl+C. "Regenerate key" is plain text until #28 makes it a button. Once a
  game server has connected, its page shows the reported build and the key's
  last 4 characters instead of the checklist.
- Checked by hand with `bun --bun next dev` against a temp database:
  - registered a game server, polled with `curl`, and it showed Connected
    within 2 s;
  - the poll was answered `no-change` after 50.1 s, and the page showed Not
    connected about 15 s later;
  - a duplicate name was refused;
  - no sideways scroll at phone width;
  - no key in the server output.
- The walking skeleton's temporary held-poll route is not on main, so there
  was nothing to replace here. When [#22](22-hosting-walking-skeleton.md)
  merges, drop its `POST /proof/held-post`
  (`src/app/proof/held-post/route.ts`): this endpoint replaces it.
- [#24](24-content-security-policy.md)'s proxy matcher leaves out only `/api`,
  so poll responses would carry the CSP header too. That is harmless; whoever
  merges second may add `game-server` to the matcher's exclusions.
- Game servers list in byte order of their lower-cased names, so a name
  starting with `Ä` sorts after `Z`.
