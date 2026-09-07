# Handoff: EZConfig UI redesign

## Overview
A visual and UX overhaul of the EZConfig web control panel (repo `thatsamori/ezconfig-ui`, Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + Radix + zustand). The redesign keeps the existing data model, API routes and stores, and replaces the top-tab shadcn layout with a dark, sidebar-driven console. The headline UX changes:

- Left sidebar lists weapons (or character groups) with override counts; the config sits on the right.
- Attack types (Strike / AltStrike / Stab / AltStab) are multi-select and render as **columns** of one table, so a key can be compared and edited across attack types on one row. General is exclusive (different keys).
- Untouched keys show **"Game default"** with no number (in-engine defaults are unknown). Clicking opens an empty input.
- **Sweep**: a per-key bulk editor across all 35 weapons with Set / Multiply / Add, live preview, and explicit handling of weapons that have no stored value.
- **Review & apply** shows a diff (Game default → new value) grouped by weapon, with per-row/group opt-out and the existing "wipe database first" option.
- Notes are a side panel per key; feature toggles in Character grey out their dependent parameters.

## About the design files
Everything in this bundle is a **design reference built in HTML**. It is a prototype of the intended look and behaviour, not production code. The task is to recreate it inside the existing Next.js / shadcn codebase, reusing its stores (`configStore`, `authStore`), API routes, schema files (`weaponConfigSchema.ts`, `characterConfigSchema.ts`), hooks (`useDebouncedCallback`, `useNotes`) and Radix primitives. Restyle shadcn components with the tokens below rather than introducing a second component library.

Open `EZConfig App.dc.html` in a browser to interact with it (it needs `support.js` and `ezconfig-data.js` next to it). All styles are inline in the file; the logic class at the bottom holds the state model and derived values. `explorations/` contains the earlier option rounds for context only.

## Fidelity
**High fidelity.** Colors, type, spacing, radii and states are final. Recreate pixel-accurately. Copy text is final unless noted.

## Screens

### Sign in
- Full-viewport centered column, max-width 360px, gap 28px. Background `#0f1012` with a radial glow `radial-gradient(700px 320px at 50% 0%, rgba(95,207,140,.14), transparent 70%)`.
- Logo: 36×36, radius 10, `linear-gradient(135deg,#5fcf8c,#3a9c63)`.
- Title "Sign in to EZConfig" 22px/600, letter-spacing −0.02em. Subtitle "duel-na-1 · Mordhau server console" 13px `#9a9ba1` (replace server name with the configured one).
- Inputs: label 12px `#9a9ba1` above; field 42px tall, radius 10, bg `#16171a`, border `rgba(255,255,255,.1)`, focus border `#5fcf8c`. Fields: Username, Password.
- Button "Sign in": 42px, radius 10, bg `#5fcf8c`, text `#06120b` 14px/600; hover `#74d99c`.
- Footnote 12px `#6b6c72`: "Accounts are created by an admin in Users. No self sign-up."
- Failed login → keep existing sonner toast.

### App shell
`grid-template-columns: 60px minmax(180px,220px) minmax(0,1fr)`, height 100vh, overflow hidden.

**Icon rail (60px)**, bg `#0c0d0f`, right border `rgba(255,255,255,.07)`, padding 14px 0, items gap 6px, centered.
- Logo 30×30 radius 9 gradient as above, margin-bottom 12px.
- Nav buttons 38×38, radius 10. Active: bg `#1a1b1f`, icon `#f2f2f3`. Inactive icon `#7c7d84`; hover bg `#1a1b1f`, icon `#f2f2f3`. `title` attribute = label.
- Icons (18px, stroke 1.75, round caps/joins, `currentColor`): Weapons = Lucide `sword`; Presets = Lucide `bookmark`; Users = Lucide `users`; Character = custom side-profile helm, paths:
  `M4 12a8 8 0 0 1 16 0v2l-2 6H6l-2-6Z`, `M13 12h7`, `M13 12v8`, `M12 4V2` (24-grid).
- Users item only for `role === 'admin'`.
- Bottom: avatar 30px circle `#26272b`, initial 12px/600; click = logout.

**Sidebar (180–220px)**, bg `#0f1012`, right border `rgba(255,255,255,.07)`.
- Header padding 16px 14px 10px, gap 10px: title 15px/600 ("Weapons" or "Groups") + count 12px `#9a9ba1` ("7 with overrides" / "N overrides"), nowrap.
- Filter input: 34px, radius 9, bg `#16171a`, border `rgba(255,255,255,.06)`, search icon 13px, placeholder "Filter".
- Weapons only: switch (34×20, radius 99, on `#5fcf8c` thumb `#06120b`, off `#26272b` thumb `#9a9ba1`, thumb 16px, translate 14px) + label "Only with overrides" 12.5px `#9a9ba1`.
- List: padding 0 8px 12px, gap 2px. Item 36px, radius 9, padding 0 12px, 13.5px. Active bg `#1a1b1f` text `#f2f2f3` weight 600; inactive text `#b7b8be` weight 400; hover bg `#16171a`. Right badge when count > 0: 11px/600 `#5fcf8c` on `rgba(95,207,140,.12)`, padding 1px 7px, pill.
- Empty state 12.5px `#6b6c72` centered: "No weapons with overrides match" / "No matches".
- Weapons list = `CategoryName` sorted alphabetically. Character list = `CharacterConfigGroupName` entries with ≥1 option (skip empty Combo/Stun).

**Content pane**, `min-width:0`, column flex, `position:relative`.
- Header padding 22px 32px 0, gap 16px.
  - Crumb 12px `#9a9ba1` ("Weapons" / "Character"); title 24px/600 −0.02em (weapon name / group name).
  - Right: key search 240px wide, 34px, radius 9, bg `#16171a`, placeholder "Search config keys"; button "Reset weapon" / "Reset group" 34px, radius 9, bg `#16171a`, border `rgba(255,255,255,.08)`, 13px `#d4d4d8`, hover `#1a1b1f`. Reset removes every override in that scope and toasts "<scope> back to game defaults".
  - Weapons: attack-type chips row (see below) with right-aligned hint 12px `#6b6c72`: "N of 4 attack types shown" or "General has its own keys".
  - Character: hint paragraph 13px `#9a9ba1`, max-width 720: "Server-wide values. Rows marked feature are toggles; the parameters under them are stored and sent regardless, but the mod only reads them while the toggle is on."
- Scroll area padding 14px 32px 96px (bottom room for the floating bar).

**Attack-type chips** (Weapons only). Order: General, Strike, AltStrike, Stab, AltStab. 32px tall, pill, 13px/500, gap 7px.
- Selected: bg `#f2f2f3`, text `#0f1012`, no border. Unselected: transparent, border `rgba(255,255,255,.08)`, text `#d4d4d8`.
- Attack chips carry a 13px checkbox square (radius 3): checked `#5fcf8c` with 9px dark check; unchecked border `rgba(255,255,255,.2)`. General has no checkbox.
- Count badge when the scope has overrides in that group: 11px, pill; on selected chip `rgba(0,0,0,.12)`/`#0f1012`, on unselected `rgba(95,207,140,.14)`/`#5fcf8c`.
- Behaviour: clicking General selects only General. Clicking an attack type toggles it within the attack set (never below one selected); if General was selected it is replaced. Selected attack types are kept in schema order.

**Config table** — one card: bg `#16171a`, border `rgba(255,255,255,.06)`, radius 14, `overflow-x:auto`. Inner wrapper `min-width: 200 + 150×cols + 128 + 36 px` so columns never collapse below ~140px; the card scrolls horizontally on narrow screens.
- Grid: `minmax(200px,1.4fr)` key | `minmax(140px,1fr)` per column | `128px` actions; gap 10px.
- Header row padding 10px 18px, 11px uppercase letter-spacing .06em `#6b6c72`, bottom border `rgba(255,255,255,.06)`. Column headers are the group names (Character: "Value"). When >1 column, each header has a ✕ (12px, `#6b6c72`, hover `#f2f2f3`) that hides that column.
- Row: padding 7px 18px, min-height 48px, bottom border `rgba(255,255,255,.05)`, hover bg `#1a1b1f`. Rows with any override get `box-shadow: inset 3px 0 0 #5fcf8c`. Rows sorted alphabetically by key; filtered by key search (case-insensitive substring). Empty: "No keys match \"…\"" / "No keys in this group".
- Key cell: key name 13.5px/500, ellipsis. Character extras: `feature` pill (10.5px uppercase `#5fcf8c` on `rgba(95,207,140,.1)`, radius 4) for `isFeatureToggle`; "needs <toggleKey>" 11px `#6b6c72` for gated entries whose toggle is not `true`, whole row at opacity .5 and `title` "Feature parameter: stored and sent, but only read while the feature toggle is on." Notes button: message-circle 12px + count, 11px `#9a9ba1`; opacity .35 when no notes (title "Add a note"), 1 when notes exist; hover `#f2f2f3`.
- Value cell, **untouched**: button "Game default", full cell width (max 150px), 30px, radius 8, dashed border `rgba(255,255,255,.1)`, text 12px `#6b6c72`, cursor text, nowrap; hover border `rgba(255,255,255,.25)` text `#9a9ba1`. Click: Bool → set `true`; Float → replace with an empty input (border `#5fcf8c`, placeholder "type a value"; commit on valid number); Vector/Vector2D/String → set schema default as a starting point; FloatArray → `[0]`.
- Value cell, **overridden**:
  - Float: input 30px, radius 8, bg `#0f1012`, border `rgba(255,255,255,.1)`, Geist Mono 12.5px; focus border `#5fcf8c`. Keep the existing 1s debounce + save indicator.
  - Bool: switch as above + value text ("true"/"false") Geist Mono 12px `#9a9ba1`.
  - Vector/Vector2D: one 30px box per axis (radius 8, bg `#0f1012`, border `rgba(255,255,255,.1)`) with axis label 10px `#9a9ba1` and a 48px mono input.
  - String: native/shadcn select, 30px, same box style, choices from schema (`choices`), current value included if absent.
  - FloatArray: chips (28px, radius 7, mono 12px) each with ✕; "+ value" dashed button 28px 11.5px.
  - Reset icon (Lucide `rotate-ccw` 13px) 24×24, `#6b6c72`, hover bg `#26272b` `#f2f2f3`, title "Back to game default". Removes the override.
- Actions cell (right aligned, gap 4):
  - "Set all N" (N = column count) — only when >1 column and the row has ≥1 override. 28px, radius 7, border `rgba(255,255,255,.08)`, 12px `#d4d4d8`, hover `#26272b`. Writes the first overridden column's value to every visible column. Title: "Write <value> to Strike, Stab".
  - "All weapons →" (Weapons only): 28px, radius 7, bg `rgba(95,207,140,.1)`, text `#5fcf8c` 12px, hover `rgba(95,207,140,.18)`. Opens Sweep for that key.

**Floating action bar** (config screens): absolute, left/right 32px, bottom 20px, 56px tall, radius 14, bg `#1a1b1f`, border `rgba(255,255,255,.1)`, shadow `0 20px 50px rgba(0,0,0,.5)`, padding 0 10px 0 18px.
- Status dot 8px: `#5fcf8c` with `0 0 0 4px rgba(95,207,140,.15)` ring when changes exist, `#3a3b40` otherwise.
- Text 13.5px: bold "N unapplied changes" + `#9a9ba1` "across 7 weapons and character"; or "Everything at game default".
- Buttons right: "Save as preset" (36px, radius 9, border `rgba(255,255,255,.1)`, `#d4d4d8`, hover `#26272b`) and "Review & apply" (bg `#5fcf8c`, `#06120b` 13px/600, hover `#74d99c`).
- "Unapplied" = every stored override (the DB contents). Once the backend can track what was last sent, this should become a true pending count.

### Sweep panel (bulk edit)
Right-side sheet, width `min(760px, 100%)`, bg `#16171a`, left border `rgba(255,255,255,.1)`, shadow `-30px 0 80px rgba(0,0,0,.6)`, scrim `rgba(0,0,0,.45)` (click closes).
- Header padding 22px 28px 16px, bottom border. Eyebrow 12px `#9a9ba1` "Bulk edit · Strike · Stab" (currently selected attack types; General keys use General). Title = key, 22px/600.
- Controls row (wrap): mode segmented control (bg `#0f1012`, padding 3, radius 9; segment 30px, radius 7, 12.5px/600, active bg `#26272b` `#f2f2f3`, inactive `#9a9ba1`) — Float keys: Set to / Multiply by / Add; other types: Set to only. Value box 36px radius 9 bg `#0f1012` with prefix `=`, `×`, `+` and a 90px mono input. Summary 12.5px `#9a9ba1` (truncates): "N of M selected weapons change · 2 attack types each". Right: All / Overridden only / None (28px outline buttons).
- Defaults when switching mode: Multiply → 0.9, Add → 0.05, Set → the source row's value.
- **Untouched handling** (Multiply/Add on Float only): amber notice (bg `rgba(224,168,60,.07)`, border `rgba(224,168,60,.25)`, dot `#e0a83c`) reading "N untouched weapons have no stored value to multiply. They're skipped unless you give a base." with field **"Treat untouched as"** (90px mono, focus border `#e0a83c`). When a base is entered the copy becomes "N untouched weapons will be treated as <base> before the operation. Verify against the game before relying on it." Weapons with no stored value in any selected attack type are flagged `no base value`, cannot be checked, and are excluded until a base exists.
- List: grid `24px 1fr 130px 24px 130px 110px`, header 10.5px uppercase: Weapon / Stored value / After / Status. Row 8px padding, radius 8, hover `#1a1b1f`, opacity .5 when unchecked. Checkbox 15px radius 4 (`#5fcf8c` checked; `rgba(255,255,255,.18)` border unchecked; dashed `rgba(224,168,60,.6)` for no-base). Stored value: "Game default" (sans) for untouched, mono value otherwise, "mixed" if attack types differ. After: mono, `#5fcf8c` when it changes, "varies" if per-type results differ, "—" when unchecked. Status: `will change` `#5fcf8c`, `no change` `#9a9ba1`, `skipped` `#6b6c72`, `no base value` `#e0a83c`.
- Footer: copy "Stages changes locally. Nothing reaches the server until Review & apply." Cancel + "Stage N changes" (N = changing weapons × attack types; disabled at opacity .4 when 0). Staging writes overrides via the store for each checked weapon × selected attack type; then toast "Staged N changes to <key>".
- Backend: reuse `/api/config/bulk-weapons` semantics; extend to accept per-weapon values (relative ops are computed client-side).

### Notes panel
Right sheet `min(420px,100%)`, same surface as Sweep. Header: eyebrow "Notes · <weapon>" or "Notes · Character · <group>", title = key 18px/600, ✕. List gap 14: avatar 28px circle `#26272b` initial; author 12.5px/600 + relative time `#6b6c72`; body 13.5px/1.55 `#d4d4d8`; own notes get a "Delete" text button (11.5px `#6b6c72`, hover `#e5484d`). Empty: "No notes yet. Leave one so the next person knows why this value is set." Composer: textarea (radius 10, bg `#0f1012`, focus `#5fcf8c`) + "Post note" (34px green, opacity .4 when empty). Keep the existing TipTap editor if rich text must stay; style its container the same way. Existing edit flow can live behind the author's row.

### Review & apply (modal)
Centered modal max-width 760, bg `#16171a`, radius 18, border `rgba(255,255,255,.1)`, shadow `0 30px 80px rgba(0,0,0,.6)`, scrim `rgba(0,0,0,.55)` + blur 3px.
- Title "Review & apply" 18px/600; intro 13px `#9a9ba1`: "K of N changes will be sent to <server> over RCON. Untick anything to hold it back; it stays saved here." (empty: "No overrides are stored. Applying with wipe on clears whatever the mod currently holds.")
- Filter input (placeholder "Filter by weapon or key") + All / None.
- Groups per weapon (and "Character"): card border `rgba(255,255,255,.06)` radius 12; header button bg `#1a1b1f` with 16px group checkbox, name 13px/600, "k of n" `#9a9ba1`. Rows: grid `20px 90px 1fr 110px 20px 120px`, 8px 14px, top border; 14px checkbox; group name `#9a9ba1`; key 500; "Game default" 12px `#6b6c72` right-aligned; `→` `#6b6c72`; new value mono 12px `#5fcf8c`. Unchecked rows opacity .5.
- Footer: checkbox "Wipe mod database first (recommended)" (default on), "Last applied 14 min ago by kestrel · 41 commands" 12px `#6b6c72` (needs a small server-side record of last apply), Cancel, primary "Apply N changes" / "Wipe database only" / "Nothing selected" (disabled .4). Sends the selected commands via the existing `/api/apply` with `wipeDatabase`. Success toast: "Sent N commands to <server>".

### Presets
Padding 24px 32px 96px, spans sidebar + content. Title 24px/600 + description 13px `#9a9ba1` "Snapshots of every override. Loading one replaces the working set (you review before anything is sent)." Right: "Import .zip" (outline) and "Save current as preset" (green).
- Two sections with 12px uppercase labels "Yours" / "Built-in". Cards grid `repeat(auto-fill, minmax(280px,1fr))`, gap 12. Card bg `#16171a`, border `rgba(255,255,255,.06)`, radius 14, padding 18, min-height 160/150. Icon 28px radius 8 (gradient for user presets, `#26272b` for built-in), title 14.5px/600, description 13px `#9a9ba1`, meta 12px `#6b6c72` ("7 weapons · 14 keys · edited 2d ago" — compute from preset data + mtime). Buttons: Load (32px, bg `#f2f2f3` text `#0f1012` 600), Export / Preview (outline), Delete (text `#e5484d`, hover bg `rgba(229,72,77,.1)`, right-aligned).
- Save-as-preset dialog: max-width 440, radius 18; fields Title, Description; intro "Snapshots the N current overrides." Keep the existing name-slug validation (can derive `name` from title).
- Load / delete confirmations: keep existing PresetPreviewDialog / AlertDialog logic, restyled as above.

### Users (admin)
Padding 24px 32px, max-width 960. Title "Users" + "Who can sign in. Admins also manage users." Button "Add user" (green). Rows: card 12px radius, padding 14px 18px; avatar 34px; username 14px/600 (+ " · you"), "Last active …" 12px `#9a9ba1` (needs `lastActive` on the user record, or drop the line); role pill 12px (Admin `#5fcf8c` on `rgba(95,207,140,.12)`, Config editor `#d4d4d8` on `#26272b`); Edit (outline 30px) and Remove (outline, text `#e5484d`, opacity .35 + disabled for yourself). Reuse UserDialog for add/edit.

### Toast
Bottom-right above the action bar (right 24px, bottom 96px): bg `#1a1b1f`, border `rgba(255,255,255,.1)`, radius 12, padding 12px 16px, 13px, green 8px dot. Replace sonner's `richColors` theme with this look, or configure sonner's dark theme to match.

## Interactions & behaviour summary
- Sidebar click selects weapon/group; key search and filter are client-side.
- Attack chips: multi-select → table columns; ✕ on a column header hides it.
- "Game default" click → override. Float: empty input, commit on blur/enter with a valid number (debounce as today). Reset icon → remove override.
- "Set all N" copies the first overridden column's value across visible columns.
- "All weapons →" opens Sweep on that key with the current attack-type selection.
- Sweep "Stage" writes overrides; nothing is sent.
- Floating bar → Review & apply → `/api/apply` with the ticked commands.
- Feature-toggle gating exactly as `CharacterConfigTab` does today (`gatedBy`, value !== true → muted).
- Hover states as listed; transitions: switch thumb `transform .15s`; no other animation required. Sheets/modals can use the existing Radix Dialog fade/zoom.
- Responsive: shell is fluid; sidebar shrinks to 180px; the table scrolls horizontally below ~1100px. Not designed for mobile.

## State
Client: `tab`, `weapon`, `groups[]` (selected attack types; `['General']` exclusive), `charGroup`, `weaponQuery`, `keyQuery`, `overridesOnlyFilter`, `editingCell`, `notesFor`, `sweep{open,key,mode,val,selected[],assume}`, `apply{open,off[],wipe,filter}`, `savePresetOpen`, toast. Data comes from the existing `configStore` (values, loadedCategories, setValue/removeValue/setBulkWeaponValue) and `/api/databases/overrides` for counts before lazy load. Override counts per weapon/group should come from the overrides map so the sidebar is correct before a weapon is opened.

## Design tokens
Font: `DM Sans` (Google Fonts, opsz axis, weights 400/500/600) for UI; `Geist Mono` 400/500 for values. Base 14px.

Surfaces: page `#0f1012`; rail `#0c0d0f`; card/sheet `#16171a`; raised/hover `#1a1b1f`; control `#26272b`; input bg `#0f1012`.
Borders: `rgba(255,255,255,.06)` cards, `.07` shell dividers, `.08` outline buttons, `.1` inputs/modals, `.2` unchecked boxes.
Text: primary `#f2f2f3`; secondary `#d4d4d8`; muted `#9a9ba1`; list inactive `#b7b8be`; faint `#6b6c72`; rail inactive `#7c7d84`.
Accent: `#5fcf8c` (hover `#74d99c`, on-accent text `#06120b`, tint bg `rgba(95,207,140,.12)`), logo gradient `linear-gradient(135deg,#5fcf8c,#3a9c63)`. Warning `#e0a83c` (tint `.07` bg / `.25` border). Danger `#e5484d`.
Radii: 4 (checkbox), 7–8 (small buttons/inputs), 9–10 (buttons/inputs), 12 (cards), 14 (table card, action bar), 18 (modals), 99 (pills/switch).
Spacing: 2, 4, 6, 8, 10, 12, 14, 16, 18, 22, 24, 28, 32.
Shadows: action bar `0 20px 50px rgba(0,0,0,.5)`; modal `0 30px 80px rgba(0,0,0,.6)`; sheet `-30px 0 80px rgba(0,0,0,.6)`.
Type scale: 10.5 uppercase table headers; 11 badges; 12 meta; 12.5 secondary; 13 buttons; 13.5 rows; 14 body; 15 sidebar title; 18 sheet/modal titles; 22 sweep title; 24 page titles (600, −0.02em).

## Assets
Icons: Lucide (`sword`, `bookmark`, `users`, `search`, `rotate-ccw`, `message-circle`, `check`). Custom helm icon paths listed under Icon rail. Fonts from Google Fonts. No images.

## Files
- `EZConfig App.dc.html` — the final design, all screens and states. Inline styles carry exact values; the `Component` class at the bottom holds state, derived rows, Sweep math and the diff builder.
- `ezconfig-data.js` — schema keys/defaults mirrored from the repo plus sample overrides, presets, users and notes used by the prototype.
- `support.js` — prototype runtime; not part of the handoff scope.
- `explorations/` — earlier option rounds (turn 1–3) for context.
