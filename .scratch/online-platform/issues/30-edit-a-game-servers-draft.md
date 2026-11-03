# 30: Edit a game server's Draft

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 19, 20, 21, 26
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner opens a game server and edits its Draft in the existing editor:
Character and Weapon config, search, sweep and the value editor. The Draft
auto-saves as one whole document carrying the revision it was based on. An
invalid value shows its error and is not saved. "Reset to game defaults"
empties the Draft.

This is the contract step for the self-hosted config path, made in place:
- the editor store saves to the Draft;
- the feature review harness's saves go through the Draft;
- the harness's Apply builds the delivered batch from the Draft's document,
  using a new encoder that turns a values document into category commands
  (the same encoder delivery will use);
- the self-hosted config routes, the selective apply dialog and the
  self-hosted apply routes are removed with their tests.

Whatever automatic sync still needs stays until
[Remove the self-hosted mode](41-remove-the-self-hosted-mode.md).

## Acceptance criteria

- [x] The game server page hosts the existing editor on that game server's
      Draft. Search, sweep (bulk weapon edits) and the value editor all write
      into the Draft.
- [x] A Draft is stored as one JSON document of overrides keyed by database,
      weapon class and key name, with no category. Loading places each value
      under its key's current category. Values whose key or weapon class the
      schema lacks are dropped from what is shown, and counted; the stored
      document is never rewritten.
- [x] Each auto-save sends the whole document with the revision it was based
      on:
      - The server validates every value against the current schema,
        including the camera policy.
      - An invalid field is not saved, and its error shows in the editor.
      - A save raises the revision.
      - A save on a stale revision is rejected. The tab's handling of that
        comes in [Stale saves across tabs](31-stale-saves-across-tabs.md).
- [x] A value set equal to its game default stays as an override. A reset
      removes the key.
- [x] "Reset to game defaults" empties the Draft and clears its origin, with
      the revision checked.
- [x] A new encoder turns a values document into the wipe-then-category-
      commands batch, in today's command encoding.
- [x] Every moved feature review passes with the harness on the Draft and the
      new encoder. The game defaults UI test still passes.
- [x] The self-hosted config, overrides, revision, clear and bulk-weapon
      routes, the per-key sync, the apply-preview and apply routes, the
      selective apply dialog and the apply record are removed. Their tests are
      replaced by Draft route-handler tests or deleted.
- [x] Route-handler tests cover:
      - load and save;
      - validation errors;
      - a stale revision being rejected;
      - Reset to game defaults;
      - unknown keys being dropped on load;
      - pins kept as overrides.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op30-edit-draft-402e7e` (not pushed). 188
tests pass across 36 files, typecheck is clean, and lint is 13 (20 at the
base). No migration: #26's `drafts` row already holds the document and
revision.

- Storage and routes: `src/lib/platform/drafts.ts`;
  `GET`/`PUT /api/game-servers/[id]/draft` and
  `POST /api/game-servers/[id]/draft/reset`. A save or reset on a stale
  revision gets 409 with the current Draft. An invalid value gets 400 with
  `details` per field, and nothing is saved: a refused value refuses the
  whole save. Draft writes log nothing but errors.
- The document (`src/lib/config/valuesDocument.ts`):
  `{ Character: { key: v }, Weapon: { class: { generalKey: v, Strike: { key: v } } } }`.
  A weapon's attack keys sit under their attack type (Strike, AltStrike,
  Stab, AltStab), which is not a category. Stored values with no place in the
  current schema stay stored, so a save from the editor keeps them.
- The encoder is `commandBatch(document)` in `src/lib/config/encodeValues.ts`.
  `tests/values-document.test.ts` checks that it sends what today's
  `buildRconCommands` sends for the same values.
- Reset to game defaults empties the document, with the revision checked.
  A Draft has no origin column yet (#26 left it to the slice that needs it),
  so clearing the origin waits for Rulesets (#35). `drafts.ts` notes this.
- Editor: the game server page has a Draft section with "Edit Draft". The
  editor shows "<server> · Draft" in its crumb and the save status ("Saved",
  a refusal, or stale with "Reload the Draft"). Each refused field shows its
  error under the value. Sweep saves all its changes in one save. "Reset to
  game defaults" in the action bar asks for confirmation first. With no Draft
  open, Character and Weapons point to Game servers.
- Presets, as an interim until Rulesets: "Save as preset" snapshots the open
  Draft (the route reads it by `gameServerId`), and loading one replaces the
  Draft through a normal save. Loading an invalid preset fails before anything
  is replaced.
- Removed:
  - routes: `/api/config/*` (config, bulk-weapons, clear, revision),
    `/api/databases` and its overrides, `/api/apply` and its preview;
  - client: `configSync.ts`, `useConfigPolling.ts`,
    `SelectiveApplyDialog.tsx`, `ActionButtons.tsx`, and the old
    `components/weapons/` and `components/character/` views;
  - library: `applyRecord.ts`, `structure.ts`, `clearAllDatabases`,
    `cameraCommandError`, and the review rows in `console/model.ts`;
  - tests: their tests and fixtures, replaced by the Draft route tests and
    `tests/config-store.test.ts`.
- Kept for automatic sync until [Remove the self-hosted mode](41-remove-the-self-hosted-mode.md):
  - `buildRconCommands`/`applyConfig`, `executeAcknowledgedBatch`,
    `revision.ts` and `apply-feedback.ts`;
  - the `Databases/` files. The feature review harness's `storeUnvalidated`
    also writes them, because the startup snapshot and the parry migration
    still read them.
- Feature reviews and fixtures:
  - The feature review harness saves and applies through the Draft and the
    encoder.
  - The camera policy flow, platform sign-in and parry-migration reviews now
    run on the Draft.
  - The two manual Next fixtures (`parry-migration-next.ts`,
    `automatic-sync-next-probe.ts`) no longer call the removed routes. They
    were not run.
- Browser check, in the built-in browser: a dev server from the worktree on
  port 3417, with temp storage, no `.env`, `RCON_HOST=127.0.0.1`, automatic
  sync off, and a `signInForTest` session.
  - Register, then Edit Draft, then edit a value: it saved and the revision
    rose.
  - A value equal to its default stayed an override (CustomFOV false).
  - A save carrying CustomFOVMax 120.5 got 400 "Use a whole number." The error
    showed under the field and the revision stayed. A valid edit cleared it.
  - Another writer's save made the next edit stale. "Reload the Draft"
    brought in that writer's values.
  - A Sweep of ChamberCost to 12 saved 35 changes in one save.
  - Reset to game defaults emptied the Draft (revision 10).
  - Apart from those deliberate 400/409 responses and the 401 before sign-in,
    the console showed no errors.
  - The editor's own input already refuses 120.5. To get a server refusal,
    the save was rewritten in the page before it was sent.
