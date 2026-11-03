# 43: Discard's stale rejection in the tab

Status: open
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

- [ ] A rejected Discard hands the returned Draft to the config store through
      the same path as a rejected save or Reset, and the tab names the edits
      it did not save.
- [ ] The "edits not saved" panel survives a rejected flush while the review
      loads and a following Edit Draft.
- [ ] The Discard route answers with `staleDraft()`, and `discardDraft`'s type
      no longer allows the unreachable `'invalid'` result.
- [ ] `discardChanges` reads the Live configuration inside its transaction.
- [ ] A component or store test covers a rejected Discard naming the unsaved
      edits.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
