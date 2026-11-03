# 31: Stale saves across tabs

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 30
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner with two tabs open on one Draft never loses an edit silently.
A write based on an old revision is rejected. The rejected tab reloads the
Draft and names the edits it did not save. Open tabs refresh the Draft every
few seconds, so an idle tab rarely meets a rejection. There is no per-key
merge.

## Acceptance criteria

- [x] Every Draft write that exists so far (auto-save and Reset to game
      defaults) carries its base revision and is rejected if the Draft has
      moved on. The rejection returns the current Draft.
      [Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) and
      [Rulesets](35-rulesets.md) add their writes under this same check.
- [x] A rejected tab replaces its Draft with the current one and tells the
      owner which edits were not saved, naming database, weapon and key.
- [x] Open pages fetch the Draft again every few seconds and pick up another
      tab's saves without a reload.
- [x] Route-handler tests cover two writers on the same revision: exactly one
      succeeds, and the other gets the rejection with the current Draft.
- [x] A component or store test covers the rejected tab naming its unsaved
      edits.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op31-stale-saves-2ebfd6` (not pushed), on
main `160e0eb`. 204 tests pass across 38 files (199 on main), typecheck is
clean, and lint stays at 13. No migration.

- What #30 already had: saves and Reset carried their revision, and a stale
  one got 409 with the current Draft. The tab only marked itself stale and
  offered "Reload the Draft".
- Server, `src/lib/platform/drafts.ts`:
  - `write` stays the one revision check every Draft write goes through. Its
    header says so, and that Discard changes (#32) and the Ruleset writes
    (#35) join there.
  - `staleDraft(current)` is the one 409 body: the error and the current
    Draft. The save and reset routes answer with it; new write routes should
    too.
  - `resetDraft` (and `write`) now return only written or stale, so a route
    needs no "invalid" branch for a write with no values to check.
- Client, `src/lib/store/configStore.ts`:
  - The open Draft keeps `base`: the values at its revision, as the tab last
    loaded or saved them.
  - A 409 hands the current Draft to `adopt`. It replaces the tab's values
    and revision, and names each lost edit: an edit the tab made (against
    `base`) that the current Draft does not have. An edit the other tab also
    made is not named. Edits made while the rejected save was in flight are
    named too. There is no per-key merge.
  - Lost edits go to `unsaved` (database or weapon, category, key and the
    value, null for a Reset) until dismissed, and a toast names the first
    three. `flushConfigWrites` rejects with that message, so a sweep, Reset
    group or preset load reports it.
  - The `stale` save state is gone: the tab carries on at the current
    revision. Reset to game defaults on a stale revision takes the current
    Draft and throws "Not reset: …".
  - `refreshDraft(typing)` GETs the Draft and adopts it only if its revision
    is newer. It skips, before the fetch and again when the answer arrives,
    while a save is in flight or queued or `typing()` is true. A tab whose
    edits were refused or never arrived names them when it adopts, as a
    rejected save would.
- Editor (`ConfigConsole.tsx`):
  - While the Draft editor is showing, it refreshes every 3 s while the page
    is visible, and at once when the page is shown again or the window is
    focused. The server status refresh stays at 2 s.
  - Typing means focus in an input, select or textarea, or in a form, inside
    the editor's table. That includes the number fields' 1 s debounce and the
    first-value input.
  - The notice under the save status lists every unsaved edit with its value
    ("Character · Movement · DodgeCooldown → 0.3") and has Dismiss. "Reload
    the Draft" is removed.
- Tests:
  - `tests/platform-drafts.test.ts` adds `two-writers`: two saves, then a save
    and a Reset, race on one revision. Exactly one is written; the other gets
    409 with the Draft the first left, and its document is not stored.
  - `tests/config-store.test.ts` replaces the stale test with five:
    - a rejected save names its lost edits (a Reset among them, one made
      in flight, and one the other tab also made, which is not named);
    - a stale Reset;
    - a refresh picks up another tab's saves;
    - a refresh never replaces a typed or saving edit;
    - a refresh names refused edits.
  - Removing the refresh's after-fetch check, or the naming, fails them.
- Hand check in the built-in browser:
  - Setup: a dev server from the worktree on port 3418, with temp storage,
    `RCON_HOST=127.0.0.1`, automatic sync off and no `.env`. A `signInForTest`
    session, and one game server registered in the temp database.
  - A save in tab A (CanDodge on) showed in tab B within the refresh, with no
    reload.
  - Tab B, behind on the revision, saved CanDodge off. It was rejected, tab B
    took the current Draft, and it named "Character · Movement · CanDodge →
    true".
  - With focus in tab A's DodgeCooldown, tab B saved. Five seconds later tab
    A had not been refreshed over the typing. Committing 0.3 was rejected:
    tab A showed tab B's CanDodge, and the notice and toast named
    "Character · Movement · DodgeCooldown". Dismiss cleared the notice.
  - The console showed only those deliberate 409s and the 401s of a cookie
    problem in the setup (below).
  - Gotcha for later hand checks: `/api/auth/session` renews the session
    cookie as `Secure; HttpOnly`. Over http://localhost the built-in browser
    then stopped sending it, and JS cannot overwrite an HttpOnly cookie. A
    test cookie set with `Path=/api` works throughout.
  - `tsconfig.json` and `next-env.d.ts` were reverted afterwards, and the
    temporary `.claude/launch.json` was deleted.
- For #32 and #35: put new Draft writes through `write` in `drafts.ts`, and
  answer stale with `staleDraft`. On the client, add the store action in
  `configStore.ts` beside `resetToGameDefaults` and pass a 409's `data` to
  `adopt`. A write that empties or replaces the whole Draft on purpose (like
  Discard) should set `base` and `values` together, as Reset does, so nothing
  is named.
