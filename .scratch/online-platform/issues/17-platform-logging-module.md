# 17: Platform logging module

Status: completed
Type: task
Created: 2026-11-02
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A prefactor: the one module all platform code logs through. It writes one JSON
line per event to stdout or stderr, which the systemd journal keeps in
production. It never leaks secrets, even by mistake. It also keeps the
in-memory counts of warnings and errors that the
[Operator status page](38-operator-status-page.md) shows later.

Existing self-hosted `console.*` calls stay until the code around them is
removed.

## Acceptance criteria

- [x] Each event is one JSON line with a level, an event name and platform ids
      only (game server, user, Live configuration).
- [x] The module never serializes a raw request or error object, only the
      message and the stack.
- [x] As a backstop, it redacts anything matching the `ezc_gsk_` key pattern
      and the configured Discord client secret.
- [x] Its documented rules say what is never logged: any part of a Game server
      key, session tokens, `Cookie` and `Authorization` headers, Invite codes
      and links, Discord OAuth codes, tokens and client secret, Note bodies,
      configuration values, Discord usernames and IP addresses.
- [x] Since process start, it keeps a count of warnings and errors and the
      newest 20 of them (time, event and scrubbed message), readable by other
      platform code.
- [x] A test captures stdout and stderr and checks that a planted key and
      client secret are redacted, and that an error object's other fields do
      not appear.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Done

- `src/lib/platform/log.ts`: `log.info`, `log.warn`, `log.error` and
  `readLogHealth()`. Its header holds the rules. The only env change is
  `env.discordClientSecret` (`DISCORD_CLIENT_SECRET`); `.env.example` is left
  for [Operator signs in with Discord](23-operator-signs-in-with-discord.md).
- Tested by `tests/platform-log.test.ts` with the child fixture
  `tests/fixtures/platform-log.ts`. The full suite passes (152), and lint
  stays at 25 problems.
- Lines carry only the three platform ids. Startup's release commit and
  migrations run, the hourly "key rejected" count and a reported build stamp
  have no field yet. The slice that first logs one adds it in this module,
  after checking it against the never-logged list.
