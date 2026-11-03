# 37: Operator manages server owners

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 25, 35, 36
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform operator lists server owners and can:
- remove a server owner's access reversibly (and restore it);
- delete a server owner permanently, for an erasure request.

The operator never sees or edits another owner's game servers, Drafts, Live
configurations or Rulesets.

## Acceptance criteria

- [x] The operator's list shows each server owner's Discord name and avatar,
      first sign-in, last seen and number of game servers.
- [x] Remove access:
      - sets the access removed time and ends the owner's sessions;
      - refuses their sign-in, even with an Invite;
      - keeps their data.

      Their game servers keep being answered: a build change still
      re-delivers, but their Live configurations cannot change.
- [x] Restore access clears the access removed time.
- [x] Delete, behind a typed confirm, removes the server owner with their game
      servers, Drafts, Live configurations, Rulesets and used Invites:
      - their Notes stay, shown as written by "a former server owner";
      - if they set the Supported build, set by reads "a former server
        owner".
- [x] Remove access and Delete are not offered against an operator, and the
      routes refuse them.
- [x] No operator page or route returns another owner's game servers, Drafts,
      Live configurations or Rulesets.
- [x] Each action is logged by id.
- [x] Route-handler tests cover:
      - the list;
      - removing access (sessions ended, sign-in refused with and without an
        Invite, game servers still answered);
      - restoring access;
      - the full Delete cascade;
      - refusals against an operator;
      - no cross-owner reads.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op37-server-owners-997dba` (not pushed).
250 tests pass across 44 files, typecheck is clean, and lint stays at 9.

- No migration. The foreign keys from `0002` to `0009` already carry the
  whole Delete: sessions, game servers (with their Drafts and Live
  configurations), Rulesets (with their versions) and the Invites the owner
  used cascade, while Notes, the Supported build's set by and the Invites
  they made (only possible as a former operator) are set to NULL.
- Storage: `src/lib/platform/server-owners.ts`.
  - The list gives `id`, `name`, `avatarUrl`, `firstSignedInAt`,
    `lastSeenAt`, `gameServers` (a count), `accessRemovedAt` and `operator`,
    oldest first sign-in first. It never names a game server, Draft, Live
    configuration or Ruleset, and the Discord id is only inside the avatar
    URL, as in the shell.
  - Remove access sets the time, unless it is already set, and deletes every
    session, in one transaction. Restore access clears it.
  - Delete checks the typed name, deletes the user row, and once that
    commits ends each of their game servers' keys, so a held poll is answered
    "key rejected".
- Routes, all `requireOperator`:
  - `GET /api/operator/server-owners`: `{ serverOwners }`.
  - `POST /api/operator/server-owners/[id]/remove-access` and
    `.../restore-access`: `{ serverOwner }` as the list shows it.
  - `DELETE /api/operator/server-owners/[id] { confirm }`: `{ success }`.
  - 404 for no such owner; 403 for a platform operator; 400 for a Delete
    whose `confirm` is not the owner's name.
- Logging, with the operator's `userId` and the new `serverOwnerId` field:
  `server-owner.access-removed`, `server-owner.access-restored`,
  `server-owner.deleted` (with `count`, how many game servers went) and, as
  a warning, `server-owner.operator-refused`. Remove and Restore are logged
  only when they change something.
- Page: `ServerOwnersPage` under a new "Server owners" rail item for the
  operator. Remove access asks first. Delete opens a dialog whose button is
  enabled only once the name is typed. The operator's own row has no actions.
- Tests: `tests/platform-server-owners.test.ts` with
  `tests/fixtures/platform-server-owners.ts`, six scenarios through the route
  handlers, with sign-in through the Discord callback (exchange replaced):
  - the list;
  - Remove access: both sessions ended, sign-in refused without and with a
    fresh Invite (which stays unused), data kept, Apply refused, and the game
    server still answered: held, re-delivered after an interrupted delivery,
    and re-delivered across a Supported build change;
  - Restore access;
  - the Delete cascade, Bob's data untouched;
  - refusals against an operator, themselves or another;
  - no cross-owner reads: eleven routes answer 404 for Ann's game server,
    Draft, Live configuration and Ruleset, the lists hold only the
    operator's own, and the four operator pages name none of Ann's.

  Each scenario checks that no name, Discord id, token, Invite link, Game
  server key or Note body reaches a log line. Breaking the session ending,
  the key ending or the operator check each fails a scenario.

Calls taken where the ticket left room:

- Last seen is the latest last seen of the owner's sessions (written at most
  once an hour), and "not signed in" while they have none. The spec's User
  record has no last seen, so this adds no column. It goes when the sessions
  go: after Remove access, Sign out everywhere, or 30 days unused. A lasting
  last seen would need a `users` column and a migration. The owner kept it as
  it is (2026-11-03).
- The typed confirm is the owner's Discord name as the list shows it,
  ignoring spaces around it, and the route checks it too, not only the
  dialog. A name that is hard to type can be pasted from the dialog.
- Restore access is refused against an operator as well. The spec says none
  of the three is offered against one, and clearing a time that has no
  effect on an operator is not worth an exception.
- Removing access that is already removed keeps the first time.

Hand check, on a temp database through `bun --bun next dev` at
`http://op37.localhost:3137` with four made-up owners and seeded sessions
(no Discord):
- the list: avatars, badges, last seen and counts;
- Remove access on one: logged by id, and the row shows "Access removed just
  now" and "not signed in";
- Delete behind the typed confirm: the button stays disabled for the wrong
  case. The cascade, checked in the database: game servers, Drafts, Ruleset
  and version gone, the Note's author NULL, the removed owner's data kept;
- Restore access;
- the three routes refusing the operator: 403, logged as warnings;
- the Notes panel and the Supported build page reading "a former server
  owner";
- the page at phone width, which needed the row to wrap.

#36's dev-server quirk ("Failed to load external module postcss-…" on a
fresh build directory) showed up once; a restart fixed it, as #36 recorded.
