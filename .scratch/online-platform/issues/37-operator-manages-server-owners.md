# 37: Operator manages server owners

Status: open
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

- [ ] The operator's list shows each server owner's Discord name and avatar,
      first sign-in, last seen and number of game servers.
- [ ] Remove access:
      - sets the access removed time and ends the owner's sessions;
      - refuses their sign-in, even with an Invite;
      - keeps their data.

      Their game servers keep being answered: a build change still
      re-delivers, but their Live configurations cannot change.
- [ ] Restore access clears the access removed time.
- [ ] Delete, behind a typed confirm, removes the server owner with their game
      servers, Drafts, Live configurations, Rulesets and used Invites:
      - their Notes stay, shown as written by "a former server owner";
      - if they set the Supported build, set by reads "a former server
        owner".
- [ ] Remove access and Delete are not offered against an operator, and the
      routes refuse them.
- [ ] No operator page or route returns another owner's game servers, Drafts,
      Live configurations or Rulesets.
- [ ] Each action is logged by id.
- [ ] Route-handler tests cover:
      - the list;
      - removing access (sessions ended, sign-in refused with and without an
        Invite, game servers still answered);
      - restoring access;
      - the full Delete cascade;
      - refusals against an operator;
      - no cross-owner reads.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
