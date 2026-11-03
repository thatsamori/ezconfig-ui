# 54: Export and import Rulesets as files

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner can send a Ruleset to a friend as a file, and the friend imports
it into their own account.

The owner's old presets are being imported into their own account as one-version
Rulesets ([Launch and cutover](42-launch-and-cutover.md)), and some of them belong
to friends. The owner will export those and send the files directly, so the
friends keep their progress.

- **Export:** on the Rulesets tab, each Ruleset version can be downloaded as a
  JSON file. The file holds a format marker with a format version, the Ruleset's
  name, the version's description and its values document, and nothing else: no
  owner, no ids, no Notes, no Game server keys.
- **Import:** on the Rulesets tab, the owner chooses a file and sees what it holds:
  the name, how many values, and any values that would be dropped. Confirming
  creates a new Ruleset at version 1. If the name is taken (ignoring case), the
  owner can change it. It writes in one transaction and never touches a Draft, a
  Live configuration or a game server.
- **A round trip gives the same values:** export, then import, then Load Ruleset
  version gives the same Draft as loading the original.

A friend's file is input from outside:
- The request size is limited, as the Draft route's is, and anything that isn't
  the expected format is refused with a clear message.
- Values are checked with the same rules as loading a Ruleset version and saving
  a Draft. A value with no place in the current schema, or one a save would
  refuse, is dropped and reported. One dropped value doesn't fail the import.
- The name and description are checked as any other Ruleset's are.
- A Ruleset name can't break the download's `Content-Disposition` header.

Rulesets stay private on the platform: a file is something the owner chooses to
send. A public library, share links and forking stay out of scope. The spec, the
map and `CONTEXT.md` change with this.

## Acceptance criteria

- [x] Each version on the Rulesets tab has an Export that downloads its file, with
      exactly the format marker, format version, name, description and values.
- [x] Another owner's Ruleset or version answers 404 on export. Export and import
      need a session, and import needs the platform's origin.
- [x] Choosing a file shows its name, value count and dropped values, and writes
      nothing. Confirming creates version 1 of a new Ruleset in one transaction, and
      no Draft, Live configuration or game server changes.
- [x] A taken name, ignoring case, is shown, and the owner can change it. Importing
      under a taken name is refused with nothing written.
- [x] Too-large files, and files that aren't JSON or aren't the expected format, are
      refused with a clear message and nothing written.
- [x] A value with no place in the current schema, or one a save would refuse, is
      dropped and reported, and the rest of the file imports.
- [x] Export, import, then Load Ruleset version gives the same Draft as loading the
      original.
- [x] The download's filename is safe for any Ruleset name.
- [x] Logs hold ids and counts only.
- [x] `spec.md`, `map.md`, `CONTEXT.md` and `AGENTS.md`'s Layout say what is now true.
- [x] Checked in a browser on a built app with two made-up owners, at narrow and
      wide widths.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/sleepy-matsumoto-df1b18` (not pushed), on main
`0c0dc4e`. 246 tests pass across 46 files, typecheck is clean, and lint stays
at 5. No migration.

- The file, `src/lib/config/rulesetFile.ts`: `format` (`ezconfig-ruleset`),
  `formatVersion` (1), `name`, `description` and `values`, as indented JSON. The
  description is the version's, as a Ruleset has none.
- Import is one route, `POST /api/rulesets/import`, which only reviews unless the
  request says `commit: true`.
  - The file limit is 1 MiB, about three times a file of every key for every
    weapon (333,604 characters, 6429 values, 35 weapons). The file's text is sent
    as a JSON string, so the route's body limit is twice that plus 1024 bytes.
  - An extra top-level field, or a name or description the rules refuse, refuses
    the file. A name the owner types instead is refused in the rules' own words.
  - A review lists at most 100 dropped values and says how many more, with each
    part cut at 200 characters.
- Where a round trip differs from loading the original: a stored value the current
  schema refuses is dropped and reported at import, where loading the original
  loads it and lists it. A stored value with no place is exported as stored and
  dropped at import. Values the schema accepts come back the same, which the
  fixture and the browser check both compare.
- `src/lib/database/validation.ts` is stricter, and this reaches past Ruleset
  files to Draft saves, Apply and the Blocked state:
  - A non-finite number is refused: `1e999` parses to Infinity, which JSON writes
    as null.
  - A vector with extra fields is refused. A stored one would now read as refused.
    None is expected: the editor writes only the axes, and
    `tests/game-defaults.test.ts` asserts the defaults'.
  - A FloatArray of more than 64 values is refused. Nothing limited the length
    before, the longest default holds 4, and the editor draws a field per value,
    so a file holding a very long list could have frozen the tab on load.
- Logs: `ruleset.imported`, `ruleset.import-failed`, `ruleset.version-exported` and
  `ruleset.version-export-failed`, with ids and the dropped count. The test checks
  the fields.
- Checked by hand on the built app (`next start`) on a temp database, with made-up
  owners from `signInForTest`. It ran two instances on that database,
  `op54.localhost:3554` and `op54b.localhost:3555`, because the pane could not
  overwrite the session cookie to hold a second owner on one host.
  - Export: the headers and the file's exact fields, including the name
    `Duel: "EU"/NA; Règles été`.
  - Import: a taken name is shown and the button stays disabled until it is edited.
    Another taken spelling answered 409 with nothing written. Under a free name the
    loaded Draft's values were identical, with 0 dropped and the origin unmodified,
    and exporting it gave the same values.
  - One owner's Ruleset answered 404 for the other.
  - 135 dropped values were listed as 100 and "and 35 more", and the import went
    through. The refused-file dialog shows its message.
  - Widths 1280, 420, 375 and 320×480, with no CSP violations in the console.
  - Fixed from this, in `globals.css`: the import dialog scrolls and stays on a
    short screen; below 560 px a version row puts its heading and description on
    their own lines and its date on the right; the tab's Import button lines up
    with the list's right edge.
  - Not exercised: a click on Export saving a file to disk (the link was fetched and
    its `download` attribute checked), and the native file picker (the file was set
    on the input with `DataTransfer`, and a listener confirmed the button opens the
    input). The 64-value limit came after this check, so only the fixture covers it.
