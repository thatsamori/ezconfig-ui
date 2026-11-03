# 23: Operator signs in with Discord

Status: completed
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

- [x] Discord OAuth asks only for `identify`. The exchange sits behind one
      module boundary that tests replace. The client id, client secret and
      redirect URL come from instance settings.
- [x] A user record holds the Discord id, a username and avatar copied at
      every sign-in, the first sign-in time, and an access removed time (or
      none). Discord's tokens are discarded.
- [x] A Discord id listed in `OPERATOR_DISCORD_IDS` signs in without an
      Invite, and its first sign-in creates the record.
- [x] Any other Discord account is refused as "invite-only". Nothing about it
      is stored, and the log line carries no Discord id.
- [x] A session is a random token in an `HttpOnly`, `Secure`,
      `SameSite=Lax` cookie, and only its SHA-256 hash is stored. It expires
      30 days after its last use. Last seen is written at most once an hour.
      Sessions survive a restart.
- [x] Sign out ends this session. Sign out everywhere ends all of the server
      owner's sessions.
- [x] Requests that change data are refused when `Origin` is missing or does
      not match the public URL.
- [x] The self-hosted login, users and token code, and their tests, are
      removed. No self-hosted route answers without a session.
- [x] Sign-in, refusal and sign-out are logged through the logging module.
- [x] Route-handler tests cover:
      - the operator signing in;
      - an "invite-only" refusal storing nothing;
      - session expiry, with time moved forward;
      - sign out and sign out everywhere;
      - the `Origin` check;
      - the cookie never appearing in the log.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op23-discord-signin-32096e` (not pushed).
175 tests pass (164 before, 11 new), typecheck is clean, and lint is down from
24 to 20 (the removed login and Users code carried four).

- Migration `0002-users-and-sessions.sql` adds `users` (platform id, Discord
  id, username, avatar hash, first sign-in, access removed) and `sessions`
  (SHA-256 hex of the cookie token, owner, created, expires, last seen).
  Times are milliseconds since the epoch. [Invites](25-invites.md) and
  [register a game server](26-register-game-server-and-connect.md) each add
  the next number; whichever merges second renumbers its file.
- Log lines name the platform user id (`users.id`), never the Discord id.
- `requireSession(request)` in `src/lib/platform/auth.ts` is the first line
  of every self-hosted route handler: the Origin check for any method but GET
  and HEAD, then the cookie. Discord's callback is a GET and checks a state
  cookie instead.
- `PUBLIC_URL` defaults to `http://localhost:3000`, and `DISCORD_REDIRECT_URL`
  to `PUBLIC_URL` plus `/api/auth/discord/callback`. The sign-in button
  reports a failure when the client id, the secret or `DATABASE_PATH` is
  missing.
- The shell's `/api/auth/session` check renews the cookie (Max-Age 30 days).
  Expired sessions are deleted at the next sign-in.
- Apply records and new Notes take the session's Discord name (display name,
  else username) as the author.
- `storage.ts` now loads `bun:sqlite` when it first opens a database, not on
  import: `next build` loads every route module under Node, and route
  handlers now reach storage. Checked with `next build` and
  `tests/fixtures/parry-migration-next.ts`, which now runs
  `bun --bun next start` with a session.
- Tests: `signInForTest` (`tests/helpers/platform-session.ts`) gives the
  harness and the fixtures that call routes directly one session.
  `tests/platform-sign-in.test.ts` runs `tests/fixtures/platform-sign-in.ts`
  once per scenario, with Discord's exchange module replaced. The old login
  had no tests to remove.

Follow-ups, not done here:
- `tests/fixtures/automatic-sync-next-probe.ts` (manual, mod-driven) POSTs
  `/api/apply` without a session and now gets 401. It needs a session like
  `parry-migration-next.ts`, unless
  [remove the self-hosted mode](41-remove-the-self-hosted-mode.md) removes it
  first.
- `src/app/actions/rcon.ts` and `gameini.ts` are server actions with no
  callers and no session check. Nothing imports them, so Next gives them no
  action ids; #41 should delete them rather than give them a caller.
- Without `DATABASE_PATH`, startup still runs (its rule from #16) but nobody
  can sign in. `.env.example` now sets it, and the app runs on Bun.
- When a session ends mid-use (expiry, or Sign out everywhere in another
  browser), each request shows its error until the page is reloaded and the
  sign-in page returns.
- The sign-in page no longer shows `NEXT_PUBLIC_SERVER_NAME`: the platform is
  not one server. The apply review still uses `SERVER_NAME`.
- The sign-in page and account menu were checked by typecheck, lint and the
  route tests, not in a browser.

2026-11-02: The owner signed in with a real Discord application on the
ticket's worktree and confirmed sign-in works. Merged into `main` as `77c4e3a`.
