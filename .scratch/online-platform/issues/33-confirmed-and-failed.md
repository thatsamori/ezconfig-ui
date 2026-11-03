# 33: Confirmed and Failed

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 32
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner sees whether the game server processed its Live configuration.
The state is Confirmed (with any ignored keys named), Failed (with where
processing stopped and why), or still Pending. It is computed from the
game server's last report, never stored.

The platform also handles the re-delivery rules:
- a server that reports no id, or an id the platform does not know, gets the
  Live configuration again;
- a server that reports the current id gets nothing.

## Acceptance criteria

- [x] The state is computed from the game server's last reported processed id
      and result:
      - Confirmed: the id is the current Live configuration's and the result
        succeeded. A warning names any keys the server ignored.
      - Failed: the id is the current Live configuration's and processing
        stopped at a failed command. The page names the category (and weapon)
        and the mod's error, and says the server runs only the categories
        before it.
      - Pending: anything else, including an id the platform does not know.
      - None: before the first Apply.
- [x] A Failed configuration is never resent automatically. A no-change Apply
      re-sends it.
- [x] A poll reporting no processed id gets the whole Live configuration
      again, as after the mod's build changes. A poll reporting the current id
      gets nothing, as after a restart or map change.
- [x] Connection and Live configuration state are separate indicators, so a
      state like "Failed, and now Not connected" shows both.
- [x] Each reported result is logged once, when it changes.
- [x] The feature review harness's simulated success report makes the
      configuration Confirmed.
- [x] Route-handler tests cover:
      - Confirmed, with and without ignored keys;
      - Failed, with its detail;
      - Pending for an unknown id;
      - re-delivery after no id is reported;
      - no re-send after Failed;
      - recovery by a no-change Apply.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/affectionate-hertz-0a222a` (not pushed),
on main `5b62e6a`. 223 tests pass across 41 files (218 before, plus 5),
typecheck is clean, and lint is 13 (unchanged).

- Migration `0008-reported-processed-at.sql`: `game_servers` gains
  `reported_processed_at`, when the poll that first reported the current
  processed id and result arrived (NULL with them), so Confirmed and Failed
  show "when". Existing reports are timed from `last_poll_at`. #35 may also
  take `0008`; whichever merges second renumbers.
- State: `liveConfigurationState` in `src/lib/platform/live-configurations.ts`,
  never stored. Confirmed (`reportedAt`, `ignoredKeys`) and Failed
  (`reportedAt`, `failure`) need the reported id to be the current Live
  configuration's; anything else is Pending. `GameServerView.liveConfiguration`
  is now `{ id, appliedAt } & state`, still null before the first Apply.
  `recordPoll` in `game-servers.ts` keeps the time for a repeated report and
  sets it for a new id or result, through `reportsNewResult`.
- Re-delivery: `pendingDelivery` already sent the Live configuration to a
  report of no id, another id or an unknown one, and nothing to a report of
  the current id. #33 relies on that and tests it: Failed is never resent
  (held, then `no-change`, after a restart too), a no-change Apply re-sends it
  under a new id, and a report of no id gets it again at once.
- Logging, in the poll route, once per new reported id or result:
  `live-configuration.processed` (info), `live-configuration.keys-ignored`
  (warning, with how many) and `live-configuration.failed` (warning). Lines
  carry `gameServerId` and the reported id only when it has the UUID form the
  platform makes, since a poll may report any text. No key names, categories
  or mod errors. A report of no id logs nothing.
- Page (`GameServersTab.tsx`, `globals.css`): the server list and the server
  heading show a Live configuration badge (Pending, Confirmed, Failed) beside
  the connection badge, never merged with it. The Draft section says Pending
  with how long since the Apply, Confirmed with when, or Failed with when. An
  amber box names the ignored keys. A red box says where processing stopped
  (the category, with the weapon, or the wipe), shows the mod's error, says
  the server runs only the categories before it (or none, for the wipe), and
  points to Apply.
- `docs/poll-exchange.md`: the re-delivery rules (nothing again on the
  current id, Failed included, until an Apply or a build change), a
  "Reporting" section with the three states and what the mod must report and
  when, the new log lines, and a Failed and recovery walk-through.
- Feature review harness: after the simulated success report it reads the
  server page's view and asserts the Live configuration is Confirmed. Every
  feature review passes.
- Tests: `tests/platform-confirmed-failed.test.ts` with
  `tests/fixtures/platform-confirmed-failed.ts`. Scenarios: confirmed (with
  and without ignored keys, the time kept across repeats, Not connected
  beside Confirmed), failed (detail, no re-send, a restart, Not connected
  beside Failed, a wipe failure, recovery by a no-change Apply), pending
  (unknown ids, well-formed or not, and an earlier Apply's id, succeeded or
  failed), and redelivery (a restart gets nothing; no id gets it all again).
  Also a migration test for the backfill. The `hold`, `stale`, `delivery`
  and `no-wipe` log expectations in the game-server and Apply tests now
  include the result lines.
- Hand check: a dev server from the worktree on port 3433, with temp
  storage, no `.env`, `RCON_HOST=127.0.0.1`, automatic sync off, a
  `signInForTest` session, and curl polls with the temp key.
  - "none yet" before the first Apply. Apply in the UI answered the held
    poll, and the page showed Pending beside Connected.
  - A success report showed Confirmed. The same id with two unknown keys
    showed the amber box naming them.
  - A failure at ArmingSword · Strike showed Failed with the error. That poll
    was held the full 50 s and got `no-change`. Fifteen seconds later, the
    list and the page showed Failed beside "Not connected".
  - With a poll held reporting the failure, Review and Apply said "No
    changes; the server will be sent this configuration again". Apply woke
    the poll with the same commands under a new id, and the page showed
    Pending.
  - A poll with no `processed` got the whole configuration at once. A wipe
    failure showed "Processing stopped at the wipe, before any category".
  - A success report showed Confirmed, and a new instance reporting the same
    id was held. The log had one line per new result, with no error text or
    key names. The page also checked out at phone width.
- Filed [A Live configuration the current schema refuses](44-live-configuration-the-schema-refuses.md):
  `encodeValues` throws when a later deploy's schema refuses a stored Live
  configuration's value. Each poll then answers `500` and logs an error, and
  the page stays Pending, with nothing to say why.
