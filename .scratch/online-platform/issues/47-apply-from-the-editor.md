# 47: Apply from the editor

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Testing a single value change in game takes too many steps. The owner
tested V1 on their Oregon server and asked whether the flow really is: open
the game server, make the edit, Save as Ruleset version, go back to the game
servers tab, then Review and Apply.

What happens now (as of `main` at `0f13c32`), walked on a built app with a
poller standing in for the mod:
- From the game server's page: Edit Draft, edit the value (the Draft saves as
  you edit), the crumb back to the game server's page, Review and Apply, then
  Apply in the review. The poller reported it Confirmed about 2 s later. Edit
  Draft returns to the editor for the next change.
- Save as Ruleset version is not needed for Apply. The owner thought it was:
  the editor's floating bar holds Load Ruleset version, Save as Ruleset
  version and Reset to game defaults where a Save or Apply is expected, and
  nothing in the editor mentions Apply or the Live configuration.

Decided with the owner on 2026-11-03:

- **Apply from the editor.** The editor's floating bar has one main button,
  **Apply to game server**. It saves pending edits first, as the server page
  does, then opens the same review. The review and its stale checks (the
  Draft revision and the Live configuration id) are unchanged. The button is
  disabled with its reason as on the server page ("Apply · Not connected").
  - The review's Apply takes focus, so a test is: edit, Apply to game server,
    Enter. On the first Apply, which replaces every EZConfig value the game
    server has, focus stays where the dialog puts it.
  - After Apply the owner stays in the editor.
- **A ⋯ menu for Save and Load.** An icon button (shadcn's DropdownMenu) holds
  the Draft's whole-Draft writes in labelled groups, with no submenus:
  - Save the Draft as: **New Ruleset…**; **Next version of <origin's
    Ruleset>…** when the Draft has an origin. Both open Save as Ruleset version,
    set to a new Ruleset or to the origin's, and the owner can still pick
    another Ruleset there.
  - Load into the Draft: **Ruleset version…** (Load a Ruleset version);
    **Game defaults…** (today's Reset to game defaults, renamed: it replaces
    the whole Draft and clears its origin, as a load does); **Live
    configuration…** (Discard changes, shown while the Draft has Unapplied
    changes).
  - Each keeps its own dialog and warning. The three bar buttons go.
- **The bar shows where the Draft stands.** Unapplied changes, or that the
  Draft matches the Live configuration, with the override count and the
  origin. Beside it, the Live configuration's state (Pending, Blocked,
  Confirmed or Failed) and the connection status, refreshed every few seconds
  and after each save and Apply. Blocked and Failed link to the game server's
  page, which explains them.
- The save line under the heading says "Draft saved", so saving is not read as
  Save as Ruleset version.
- The game server's page keeps Review and Apply and Discard changes.
- Not in this ticket: skipping the review, and applying each save as it
  happens. The owner sees this as the starting point for polishing.

## Acceptance criteria

- [x] The editor's bar has Apply to game server, which saves the Draft's
      edits, opens the review, and Applies with the revision and Live
      configuration id it was built from. A stale review reopens as it does on
      the server page. Disabled with its reason while the game server is not
      Connected or not on the Supported build.
- [x] The review's Apply has focus when it opens, except on the first Apply.
- [x] A ⋯ menu with an accessible name holds New Ruleset…, Next version of
      <origin>… (with an origin), Ruleset version…, Game defaults… and Live
      configuration… (with Unapplied changes), in two labelled groups. Each
      opens its dialog.
- [x] The bar shows Unapplied changes or a match with the Live configuration,
      the origin, the Live configuration's state and the connection status, and
      updates after a save and an Apply without leaving the editor.
- [x] The bar works at narrow and wide widths, checked in a browser.
- [x] Component tests cover the bar's status and the menu's items.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op47-edit-apply-flow-8faca9` (not pushed),
on main `0f13c32`. 220 tests pass across 43 files, typecheck is clean, and
lint stays at 5. No migration.

- Commits:
  - `c14be19` adds shadcn's dropdown menu (`@radix-ui/react-dropdown-menu`).
  - `1e7366a` moves the Apply review, the Discard changes confirm and the
    status badges out of `GameServersTab.tsx` into
    `src/components/game-servers/ApplyDialog.tsx` and `StatusBadges.tsx`, which
    the server page and the editor share.
  - `d7325b3` lets Save as Ruleset version open set to a new Ruleset.
  - `a4b86b6` is the bar, `src/components/console/DraftBar.tsx`, with
    `tests/draft-bar.test.tsx`; `22d3a8f` corrects a comment in it.
- The bar:
  - First row: Unapplied changes (amber), Matches the Live configuration or
    Nothing applied yet; the override count; the origin. Second row: the Live
    configuration's state, with when it was reported or applied, and the
    connection status. Details, on Failed and Blocked, opens the game server's
    page.
  - It reads the game server's view every few seconds, and at once when the
    Draft's revision moves (a save, a load, Load game defaults) and after an
    Apply.
  - Apply to game server flushes the editor's saves, then opens the server
    page's review, stale checks included.
  - The ⋯ button is named "Save or load the Draft". A chosen item's dialog
    opens once the menu has closed, so focus lands in the dialog.
  - Game defaults… is the old Reset. Its confirm reads "Load game defaults into
    <name>'s Draft?" and says it clears the origin.
- The save line under the heading reads "Draft saved <time>".
- Checked by hand on the built app (`next start`) on a temp database at
  `op47.localhost:3547`, signed in with `signInForTest`, with a script polling
  as the mod for one game server (Connected, on the Supported build) and
  reporting each batch processed.
  - Edit a value: the bar says Unapplied changes. Apply to game server: the
    review opens with Apply focused, and Enter applies. The bar shows Pending,
    then Confirmed about 4 s later, still in the editor.
  - The menu: Next version of <Ruleset>… shows only with an origin, and Live
    configuration… only with Unapplied changes. New Ruleset… opens Save as
    Ruleset version set to a new Ruleset, its name field focused; saving
    Competitive version 1 made the next item "Next version of Competitive…".
    Ruleset version… loaded Competitive version 1 and the bar showed it as the
    origin. Live configuration… discarded the changes, back to Matches the Live
    configuration. Game defaults… shows its confirm; cancelled.
  - Widths: at 1280 px the bar is 56 px, its two rows beside the buttons and
    none clipped with the origin shown. At 800 px it is 127 px; at 420 px it
    is 147 px in three rows, and the menu fits the screen. Below 800 px the
    editor's scroll area now leaves 170 px under the last row (was 110), so
    the taller bar does not cover it.
  - Not walked by hand: a first Apply (the check's first Apply was made by its
    setup script), a stale review and a disabled Apply. They run the server
    page's code, and `blockedReason` has a test.
- Found, not fixed: when any of these dialogs closes, focus goes to the page
  body, not the button that opened it. The dialogs are controlled, with no
  `DialogTrigger` for Radix to return focus to; the server page's dialogs do
  the same today.

2026-11-03: At the owner's request, merged into `main` as `5fe3bc1`, pushed and
deployed at 20:43 UTC; the deploy's record is in #42.
