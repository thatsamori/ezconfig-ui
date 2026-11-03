# 44: A Live configuration the current schema refuses

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A Live configuration that a later deploy's schema refuses can never be
delivered, and nobody is told why. Apply validates the whole Draft, but the
Live configuration is never rewritten, so a deploy that tightens a key (a
whole number where a fraction was allowed, a smaller range) can leave a
stored Live configuration holding a value the schema now refuses. Noted by
[Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) and
checked while building [Confirmed and Failed](33-confirmed-and-failed.md).

What happens now (as of `online-platform#33`):
- A poll that should get the Live configuration at once calls
  `pendingDelivery` (`src/lib/platform/live-configurations.ts`), whose
  `deliveryOf` calls `encodeValues` (`src/lib/config/encodeValues.ts`), which
  throws when the schema refuses a value.
- The poll route catches it, logs `poll.failed` as an error and answers `500`.
  The mod waits about 10 s and polls again, so the same error is logged about
  every 10 s per affected game server, and the operator's error count keeps
  rising. The error message names the refused keys.
- The owner's page shows Pending for as long as this lasts, with nothing to
  say that the configuration cannot be sent or what to fix. The Draft is
  unaffected, so the owner can fix the value and Apply, but nothing points
  there.

This is the usual case after a deploy that tightens a key, not a rare one.
Under the release order the deploy switches the Supported build, and every
game server on the new build reports no `processed`, so each needs the whole
Live configuration again at once.

Decided with the owner on 2026-11-03:

- **A new state, Blocked.** A Live configuration is Blocked when the game
  server has not reported processing it (it would be Pending) and the current
  schema refuses a value in it that the schema has a place for. A value with
  no place is not sent, so it never blocks. Like the other states, Blocked is
  computed when asked and never stored. It replaces Pending only: Confirmed
  and Failed stay as reported, since they still say what the game server
  runs. A Confirmed configuration the schema now refuses becomes Blocked only
  when it has to be sent again, as after a build change.
  - The server list's badge and the server page's heading show Blocked
    beside the connection status, as they show the other states.
  - The Draft section says the platform cannot send the Live configuration
    because the current schema refuses some of its values. A red box lists
    each one: Character or the weapon class, the category, the key and the
    schema's error. It says to fix them in the Draft and Apply, which sends
    it at once, and that until then the game server keeps the values it has.
  - `CONTEXT.md` gains **Blocked**. _Avoid_: refused, unsendable, stuck.
- **The poll is held, then `no-change`.** A poll on the Supported build that
  would be sent a Blocked Live configuration is held like any other and
  answered `no-change` when the hold ends, as before the first Apply. The mod
  then polls once per hold. The contract keeps its answers, so no mod release
  is needed. An Apply of the fixed Draft wakes the held poll with the new Live
  configuration (Apply already refuses a Draft the schema refuses). The game
  server's own log does not say why nothing arrives; the server page does.
- **Logged once per start.** The first time a poll finds a Live configuration
  Blocked after the platform starts, it logs `live-configuration.blocked`
  (warning, with `gameServerId` and `liveConfigurationId`, and no key names,
  categories or values). The ids already logged are kept in memory beside the
  held polls, so a restart logs each one once more. A restart is usually a
  deploy, which may change what the schema refuses. No migration. A Blocked
  poll logs no `poll.failed`.
- **Nothing is dropped.** The delivery stays whole, never part of one.
  Dropping a refused value would not leave it as it was: the delivery wipes
  first, so that key would fall to its game default while the page shows
  Confirmed. Clamping would send values the owner never set. So a Blocked
  Live configuration sends none of its values until it is fixed.
- **The editor marks refused values when the Draft opens**, as loading a
  Ruleset version already does. Today it marks one only after a save is
  refused, and every save is refused while one sits in the Draft, even an
  edit elsewhere.
- Not in this ticket: a deploy-time report of the Live configurations a new
  build would block. The owner chose not to file it.

## Acceptance criteria

- [x] A Live configuration is Blocked when the game server has not reported
      processing it and the current schema refuses a value the schema has a
      place for. It is computed, never stored. Confirmed and Failed are
      unchanged.
- [x] A poll on the Supported build whose Live configuration is Blocked is
      held and answered `no-change`, never `500`, so the mod does not poll in
      a 10 s loop. An Apply of the fixed Draft wakes a held poll with the new
      Live configuration.
- [x] The server list and the server page's heading show Blocked beside the
      connection status. The server page names each refused value (where it
      sits, its key and the schema's error). It says to fix them in the Draft
      and Apply, and that the game server keeps its values until then.
- [x] `live-configuration.blocked` (warning) is logged once per Live
      configuration per platform start, with `gameServerId` and
      `liveConfigurationId` and no key names or values. A Blocked poll logs
      no `poll.failed`.
- [x] Opening a Draft marks the values the current schema refuses.
- [x] A route-handler test stores a Live configuration the schema refuses.
      It covers the held `no-change` answer, Blocked with its values in the
      server page's view, one log line over several polls, a Confirmed
      configuration staying Confirmed, and recovery by Apply. A store or
      component test covers the marks when a Draft opens.
- [x] `docs/poll-exchange.md` covers such a poll's answer, the Blocked state,
      what the owner sees and the log line. `CONTEXT.md` defines Blocked.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op44-refused-live-config-cee6fc` (not
pushed), on main `19967e7`. 211 tests pass across 42 files (209 before, plus
2), typecheck is clean, and lint stays at 5. No migration.

- The decisions above were settled with the owner in this session before
  anything was built (`62927bc`).
- `refusedValues` in `src/lib/config/valuesDocument.ts` is the one rule:
  the values the current schema refuses among those it has a place for. Apply
  (`live-configurations.ts`), the encoder and the Draft view use it.
- State: `liveConfigurationState` now takes the Live configuration, not its
  id, and returns `{ state: 'blocked', refusedValues }` where it would return
  Pending and the schema refuses a value. Confirmed and Failed are unchanged.
- Poll: `pendingDelivery` returns `{ blocked: id }` for a Blocked Live
  configuration, so `encodeValues` is never reached. The poll route then
  holds the poll as usual (`no-change` when the hold ends), and
  `logBlocked` in `polls.ts` logs `live-configuration.blocked` (warning) the
  first time per Live configuration id since the platform started, kept in
  the registry's `blocked` set. `deliveryOf` is only called on an Apply's new
  Live configuration (validated) or an unblocked one.
- Page (`GameServersTab.tsx`, `globals.css`): a red Blocked badge on the
  server list and heading. The Draft section says the platform cannot send
  the Live configuration and shows a red box listing each refused value
  (place, key, the schema's error). The box says none of it is sent, the game
  server keeps its values, and fixing them in the Draft then Apply sends it
  at once.
- Editor: `DraftView` gains `errors` (the shown values the schema refuses),
  and the store marks them in `fieldErrors` whenever it takes a Draft view:
  open, Discard (back to a Live configuration that may hold them), a stale
  write's Draft, a refresh, Reset and Save as Ruleset version. For a
  constrained key (`CustomFOVMax`, `FreeStunDuration`) the field's own inline
  hint repeats the message, as it already does after a refused save.
- Docs: `docs/poll-exchange.md` (the response table, a "never while Blocked"
  re-delivery rule, Blocked under Reporting, what the owner sees, the log
  line), `CONTEXT.md` (Blocked) and `AGENTS.md`.
- Tests: `tests/platform-blocked.test.ts` with
  `tests/fixtures/platform-blocked.ts`. A Live configuration is applied and
  Confirmed, then the stored Live configuration and Draft are rewritten to
  hold `CustomFOVMax: 120.5` (whole number) and `FreeStunDuration: -1`
  (range), plus a retired key that never counts. Covered:
  - Confirmed stays Confirmed, and a restart reporting it gets nothing.
  - A build change (no `processed`) is held and gets `no-change` twice.
    Blocked shows beside Connected, with both values, on the page and the
    list.
  - The Draft opens with both named, and Apply is refused 400 with them.
  - The fixed Draft's Apply wakes the held poll with the new commands, which
    becomes Pending, then Confirmed.
  - The log has one `live-configuration.blocked` per Live configuration
    over several polls, and one more after a restart (a second run on the
    same database). No key name, error text or `poll.failed` is written.
  `tests/config-store.test.ts` adds the marks on open, cleared by a fixing
  save, and set again by Discard. The Draft view expectations in
  `tests/config-store.test.ts`, `tests/fixtures/platform-drafts.ts` and
  `tests/fixtures/platform-notes.ts` gain `errors: []`.
- Hand check: a dev server from the worktree on port 3444, with a temp
  database seeded through `signInForTest` and a direct Live configuration
  row holding the two refused values. The server list showed Blocked beside
  "Never connected". The server page showed the Blocked line and the red box
  naming Camera · CustomFOVMax and Stun · FreeStunDuration with their errors.
  Edit Draft marked both fields as soon as the Draft opened. A stale
  `ezconfig_session` cookie on `localhost` from an earlier hand check (cookies
  ignore the port) shadowed the test session, so the check ran on
  `127.0.0.1:3444`.
