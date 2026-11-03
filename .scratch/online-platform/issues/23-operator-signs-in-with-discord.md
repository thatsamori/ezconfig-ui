# 23: Operator signs in with Discord

Status: open
Type: task
Created: 2026-11-02
Blocked by: 16, 17
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform operator signs in with Discord and lands in a signed-in shell
that shows their Discord name and avatar. Anyone else is refused as
"invite-only" ([Invites](25-invites.md) adds the way in for others). Sessions
live server-side behind a cookie.

The change is made in place. The self-hosted username/password login, the
`users.json` service, the in-memory token map, the Bearer token kept in
localStorage, and the Users tab and its routes are removed. Until later
tickets replace them, the self-hosted routes that remain require a platform
session.

## Acceptance criteria

- [ ] Discord OAuth asks only for `identify`. The exchange sits behind one
      module boundary that tests replace. The client id, client secret and
      redirect URL come from instance settings.
- [ ] A user record holds the Discord id, a username and avatar copied at
      every sign-in, the first sign-in time, and an access removed time (or
      none). Discord's tokens are discarded.
- [ ] A Discord id listed in `OPERATOR_DISCORD_IDS` signs in without an
      Invite, and its first sign-in creates the record.
- [ ] Any other Discord account is refused as "invite-only". Nothing about it
      is stored, and the log line carries no Discord id.
- [ ] A session is a random token in an `HttpOnly`, `Secure`,
      `SameSite=Lax` cookie, and only its SHA-256 hash is stored. It expires
      30 days after its last use. Last seen is written at most once an hour.
      Sessions survive a restart.
- [ ] Sign out ends this session. Sign out everywhere ends all of the server
      owner's sessions.
- [ ] Requests that change data are refused when `Origin` is missing or does
      not match the public URL.
- [ ] The self-hosted login, users and token code, and their tests, are
      removed. No self-hosted route answers without a session.
- [ ] Sign-in, refusal and sign-out are logged through the logging module.
- [ ] Route-handler tests cover:
      - the operator signing in;
      - an "invite-only" refusal storing nothing;
      - session expiry, with time moved forward;
      - sign out and sign out everywhere;
      - the `Origin` check;
      - the cookie never appearing in the log.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
