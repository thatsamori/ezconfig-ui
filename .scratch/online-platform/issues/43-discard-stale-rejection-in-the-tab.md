# 43: Discard's stale rejection in the tab

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

When "Discard changes" is rejected because the Draft has moved on, the tab
handles it like a rejected save or Reset: it takes the returned Draft and names
the edits it did not save. Found by the check of `main` at `d01617d`, after
[Stale saves across tabs](31-stale-saves-across-tabs.md) and
[Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) merged.
The server side already uses #31's check; only the tab differs.

What the check found (line numbers as of `d01617d`):
- Save (`src/lib/store/configStore.ts:185-188`) and Reset (`:296-299`) both
  call `adopt()`. Discard (`src/components/game-servers/GameServersTab.tsx:182-192`)
  only checks that `body.data` exists, shows a toast and refreshes the server
  page; it never hands the returned Draft to the store.
- `loadReview` swallows a rejected flush (`GameServersTab.tsx:159`), and
  `openDraft` clears `unsaved` (`configStore.ts:225`), so the "edits not
  saved" panel is lost if the owner then clicks Edit Draft. The toast still
  shows.
- Server nits: the Discard route builds its 409 body by hand instead of
  calling `staleDraft()`, as `src/lib/platform/drafts.ts:15-16` asks. It also
  keeps a dead `'invalid'` branch, because `discardDraft` is typed `DraftWrite`
  (`drafts.ts:108`) rather than `CheckedWrite`. `discardChanges` reads the
  Live configuration outside its transaction
  (`src/lib/platform/live-configurations.ts:181-182`); that is safe today,
  since nothing awaits between the read and the write.

The impact is small. Discard runs after `flushConfigWrites()` with the
review's revision, and the store catches up on the next `refreshDraft` or
`openDraft`. An edit typed in between is rejected as stale and named.

## Acceptance criteria

- [x] A rejected Discard hands the returned Draft to the config store through
      the same path as a rejected save or Reset, and the tab names the edits
      it did not save.
- [x] The "edits not saved" panel survives a rejected flush while the review
      loads and a following Edit Draft.
- [x] The Discard route answers with `staleDraft()`, and `discardDraft`'s type
      no longer allows the unreachable `'invalid'` result.
- [x] `discardChanges` reads the Live configuration inside its transaction.
- [x] A component or store test covers a rejected Discard naming the unsaved
      edits.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op43-discard-stale-170af3` (not pushed),
on main `e7a30d7`. 247 tests pass across 43 files (244 on main), typecheck is
clean, and lint stays at 9. No migration.

- Server:
  - The Discard route answers a stale Discard with `staleDraft()`; the body
    is unchanged, so `tests/fixtures/platform-apply.ts` still passes as it
    was.
  - `CheckedWrite` is exported from `drafts.ts`. `discardDraft` and
    `discardChanges` return it, and the route has no `'invalid'` branch.
  - `discardChanges` reads the Live configuration inside a transaction around
    `discardDraft`, the way `loadRulesetVersion` nests `loadDraft`.
- Client, `src/lib/store/configStore.ts`:
  - New action `discardChanges(gameServerId, revision)`, beside
    `resetToGameDefaults`. It waits for saves in flight, then posts the
    review's revision. When the editor has that Draft open, a success sets
    `values` and `base` together, as Reset does, so nothing is named. A 409
    goes to `adopt()`, which names the lost edits, and the action throws
    "Nothing was discarded: the Draft changed in another tab. Check it, then
    discard again."
  - `draftWrite` now reports a refusal even when the editor does not have
    that Draft open, because Discard runs from the server page, where the
    editor may never have opened it. It adopts only when the Draft is open,
    and returns the data only then. Side effect for Reset and the Ruleset
    writes: if another Draft was opened while one was in flight, a refusal
    now throws its message. Before, it returned quietly, and Reset showed
    its success toast.
  - `openDraft` keeps `unsaved` when it opens the game server whose Draft is
    already open or loading (module `openId`), as Edit Draft does. Opening
    another game server's Draft, or `closeDraft`, still clears it.
  - `GameServersTab.tsx`: Discard calls the store action and shows its error
    in a toast. `loadReview` still lets the review open after a rejected
    flush; `adopt` has named the edits by then, and they now survive Edit
    Draft.
- Small calls:
  - The "edits not saved" panel stays in the editor only. On the server
    page, the toast names up to three edits, as it does for a rejected save.
  - `tests/config-store.test.ts` now calls `closeDraft()` after each test,
    since reopening the same Draft keeps its named edits.
- Tests, `tests/config-store.test.ts`, three new:
  - A rejected save's named edits stay through `openDraft` of the same
    game server, and clear for another.
  - A stale Discard takes the current Draft and names an edit whose save
    never arrived; the edit is still named after `openDraft` again.
  - A Discard that succeeds sets the Live values without naming the
    discarded edit, and a Discard from a page whose Draft the editor does
    not have open leaves the editor alone.
  - Removing the `openId` check, or the `adopt` call in `draftWrite`, fails
    them.
- Layout fixes from the check of main at `e7a30d7`, one commit each:
  - `OriginLabel` joins "version" and its number with a no-break space. At
    1280 px the Live origin now breaks before "version 1", never inside it.
  - At 560 px or less, `.console-shell.wide-page .icon-rail` is
    `grid-row: auto`. At 420x900 the Game servers and Rulesets pages have one
    900 px row and no band. The editor keeps its two rows (sidebar 145 px,
    content 755 px), with the rail spanning both.
- Hand check in the built-in browser:
  - Setup: the built app (`bun --bun next start`) at
    `http://op43.localhost:3443`, with temp storage, `RCON_HOST=127.0.0.1`,
    automatic sync off and no `.env`. A `signInForTest` session (cookie set
    with `Path=/api`), and one game server with a Ruleset version, applied
    through `applyDraft`, then edited so it has Unapplied changes.
  - Stale Discard: tab A's save of DodgeCooldown 0.3 was made to fail by
    patching `fetch`. Tab A opened Discard's confirm, tab B saved CanDodge,
    and tab A confirmed. Toasts: "...an edit here was not saved: Character ·
    Movement · DodgeCooldown" and "Nothing was discarded: ...". Edit Draft
    showed tab B's CanDodge and the panel naming DodgeCooldown → 0.3.
  - Rejected flush while the review loads: tab A, focused in DodgeDuration so
    its refresh waited, fell behind tab B's save of CrouchCooldown. Tab A
    committed 0.5 with its save held for 5 s, then opened Discard's review.
    The flush was rejected, the toast named DodgeDuration, and the review
    listed the Draft's 3 real changes. Cancel, then Edit Draft: the panel
    still named DodgeDuration → 0.5.
  - A Discard that succeeds: Unapplied changes gone, Draft origin "Duel
    rules version 1 · Unmodified". The editor showed MaxWalkSpeed 450, one
    override, and no new edit named.
  - The server log had no errors. The console showed only the two 401s from
    before the test cookie was set, and the two deliberate 409s.
  - `next-env.d.ts` was reverted after the build, and the temporary
    `.claude/launch.json` was deleted. The preview's launcher could not run
    a bash script at a `/c/...` path. A Bun launcher script with a Windows
    path worked.
- No other bug found; no new ticket.
