# 25: Invites

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 23
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform operator makes a single-use Invite link and sends it however they
like. The Discord account that signs in through it becomes a server owner. The
operator can list unused Invites and revoke one. A daily sweep tidies expired
sessions and old Invite rows.

## Acceptance criteria

- [x] Only the platform operator can make, list and revoke Invites. Anyone
      else is refused.
- [x] Making an Invite shows its link once. The code is random and stored only
      as a hash, with made by, made time, and an expiry 7 days later.
- [x] A Discord account with no record that signs in through a valid Invite
      becomes a server owner. The Invite records used by and used time.
- [x] A server owner who opens an Invite is just signed in, and the Invite
      stays unused.
- [x] An expired, revoked or used Invite is refused as "invite-only".
- [x] The operator's list shows unused, unexpired, unrevoked Invites with
      their expiry. Revoking sets a revoked time; the row is not deleted.
- [x] A daily sweep deletes expired sessions, and deletes an unused Invite's
      row 30 days after it expires or is revoked.
- [x] Each operator action writes a log line. Invite codes and links never
      appear in the log.
- [x] Route-handler tests cover each case above, with time moved forward for
      expiry and the sweep.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op25-invites-d1879f` (not pushed). 181
tests pass (175 before, 6 new), typecheck is clean, and lint stays at 20.

- Migration `0003-invites.sql` adds `invites`: the SHA-256 hex of the code,
  made by, made, expires, used by, used, revoked. Times are milliseconds since
  the epoch. [Register a game server](26-register-game-server-and-connect.md)
  also adds a 0003; whichever merges second renumbers its file to 0004.
- The link is `PUBLIC_URL/api/auth/discord?invite=<code>`, with 32 random
  bytes as base64url. The sign-in start keeps the code in an `ezconfig_invite`
  cookie (HttpOnly, Secure, SameSite=Lax, Path=/api/auth/discord, 10 minutes)
  and never sends it to Discord. The callback clears it once sign-in has
  decided, so cancelling on Discord and trying again from the plain button
  still uses the Invite.
- Sign-in decides and spends the Invite in one transaction, so two sign-ins
  through one link cannot both use it. A server owner or the operator who
  signs in through an Invite leaves it unused; removed access is refused even
  with a valid Invite.
- Routes: `GET`/`POST /api/operator/invites` (list, make) and
  `POST /api/operator/invites/<id>/revoke`. Each calls `requireOperator` in
  `src/lib/platform/auth.ts` (the Origin check and session first, then 403 for
  a server owner), which [the operator manages server owners](37-operator-manages-server-owners.md)
  can reuse.
- Log lines name the Invite by its id (`inviteId`, added to `log.ts`), never
  its code or link: `invite.made`, `invite.revoked`, `operator.refused`,
  `sign-in` with `inviteId`, `sign-in.invite-only` with the `inviteId` when
  the code matched a row, `sweep` and `sweep.failed`. Listing is a read and is
  not logged.
- The sweep (`src/lib/platform/retention.ts`) runs in the app's one process:
  the startup hook schedules it a minute after start, then every 24 hours, on
  unref'd timers. It runs a minute late so startup's output and the startup
  tests stay as they were. Sign-in still deletes expired sessions too.
- The operator's Invites page is a new "Invites" item in the shell's rail,
  shown to the operator only. It was not checked in a browser.
- Tests: `tests/platform-invites.test.ts` runs
  `tests/fixtures/platform-invites.ts` once per scenario with Discord's
  exchange replaced. The sweep scenario uses fake timers and runs the startup
  hook. Running the hook a second time under Bun's fake timers hung, so the
  test checks that a hot reload keeps one schedule by calling
  `startDailySweep()` twice instead.
