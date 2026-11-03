# 25: Invites

Status: open
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

- [ ] Only the platform operator can make, list and revoke Invites. Anyone
      else is refused.
- [ ] Making an Invite shows its link once. The code is random and stored only
      as a hash, with made by, made time, and an expiry 7 days later.
- [ ] A Discord account with no record that signs in through a valid Invite
      becomes a server owner. The Invite records used by and used time.
- [ ] A server owner who opens an Invite is just signed in, and the Invite
      stays unused.
- [ ] An expired, revoked or used Invite is refused as "invite-only".
- [ ] The operator's list shows unused, unexpired, unrevoked Invites with
      their expiry. Revoking sets a revoked time; the row is not deleted.
- [ ] A daily sweep deletes expired sessions, and deletes an unused Invite's
      row 30 days after it expires or is revoked.
- [ ] Each operator action writes a log line. Invite codes and links never
      appear in the log.
- [ ] Route-handler tests cover each case above, with time moved forward for
      expiry and the sweep.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
