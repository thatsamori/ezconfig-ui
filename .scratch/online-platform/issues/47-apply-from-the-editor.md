# 47: Apply from the editor

Status: open
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

- [ ] The editor's bar has Apply to game server, which saves the Draft's
      edits, opens the review, and Applies with the revision and Live
      configuration id it was built from. A stale review reopens as it does on
      the server page. Disabled with its reason while the game server is not
      Connected or not on the Supported build.
- [ ] The review's Apply has focus when it opens, except on the first Apply.
- [ ] A ⋯ menu with an accessible name holds New Ruleset…, Next version of
      <origin>… (with an origin), Ruleset version…, Game defaults… and Live
      configuration… (with Unapplied changes), in two labelled groups. Each
      opens its dialog.
- [ ] The bar shows Unapplied changes or a match with the Live configuration,
      the origin, the Live configuration's state and the connection status, and
      updates after a save and an Apply without leaving the editor.
- [ ] The bar works at narrow and wide widths, checked in a browser.
- [ ] Component tests cover the bar's status and the menu's items.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
