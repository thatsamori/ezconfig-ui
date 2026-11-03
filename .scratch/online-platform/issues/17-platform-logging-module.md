# 17: Platform logging module

Status: open
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

- [ ] Each event is one JSON line with a level, an event name and platform ids
      only (game server, user, Live configuration).
- [ ] The module never serializes a raw request or error object, only the
      message and the stack.
- [ ] As a backstop, it redacts anything matching the `ezc_gsk_` key pattern
      and the configured Discord client secret.
- [ ] Its documented rules say what is never logged: any part of a Game server
      key, session tokens, `Cookie` and `Authorization` headers, Invite codes
      and links, Discord OAuth codes, tokens and client secret, Note bodies,
      configuration values, Discord usernames and IP addresses.
- [ ] Since process start, it keeps a count of warnings and errors and the
      newest 20 of them (time, event and scrubbed message), readable by other
      platform code.
- [ ] A test captures stdout and stderr and checks that a planted key and
      client secret are redacted, and that an error object's other fields do
      not appear.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
