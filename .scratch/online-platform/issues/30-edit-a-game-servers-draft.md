# 30: Edit a game server's Draft

Status: open
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

- [ ] The game server page hosts the existing editor on that game server's
      Draft. Search, sweep (bulk weapon edits) and the value editor all write
      into the Draft.
- [ ] A Draft is stored as one JSON document of overrides keyed by database,
      weapon class and key name, with no category. Loading places each value
      under its key's current category. Values whose key or weapon class the
      schema lacks are dropped from what is shown, and counted; the stored
      document is never rewritten.
- [ ] Each auto-save sends the whole document with the revision it was based
      on:
      - The server validates every value against the current schema,
        including the camera policy.
      - An invalid field is not saved, and its error shows in the editor.
      - A save raises the revision.
      - A save on a stale revision is rejected. The tab's handling of that
        comes in [Stale saves across tabs](31-stale-saves-across-tabs.md).
- [ ] A value set equal to its game default stays as an override. A reset
      removes the key.
- [ ] "Reset to game defaults" empties the Draft and clears its origin, with
      the revision checked.
- [ ] A new encoder turns a values document into the wipe-then-category-
      commands batch, in today's command encoding.
- [ ] Every moved feature review passes with the harness on the Draft and the
      new encoder. The game defaults UI test still passes.
- [ ] The self-hosted config, overrides, revision, clear and bulk-weapon
      routes, the per-key sync, the apply-preview and apply routes, the
      selective apply dialog and the apply record are removed. Their tests are
      replaced by Draft route-handler tests or deleted.
- [ ] Route-handler tests cover:
      - load and save;
      - validation errors;
      - a stale revision being rejected;
      - Reset to game defaults;
      - unknown keys being dropped on load;
      - pins kept as overrides.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
