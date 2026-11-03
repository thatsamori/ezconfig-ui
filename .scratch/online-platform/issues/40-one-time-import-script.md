# 40: One-time import script

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 35, 36
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The owner brings their own self-hosted data onto the platform once, with a
Bun script run by hand on the instance:
- `Databases/` becomes the Draft of a game server they registered, with a
  "Self-hosted" Ruleset version 1 as its origin;
- each preset becomes a one-version Ruleset;
- their Notes become theirs, and everyone else's have no author.

The script is a dry run until `--commit`, all or nothing, and refuses to run
twice. It reads the old formats with its own readers, so it does not depend
on the self-hosted services. It and its tests are deleted after the owner's
import in [Launch and cutover](42-launch-and-cutover.md).

## Acceptance criteria

- [x] Arguments: the copied `Databases/`, `Presets/` and `Notes/` folders, the
      owner's Discord user id, the game server name, the owner's old username,
      and optionally the "Self-hosted" Ruleset name.
- [x] `Databases/` becomes:
      - the named game server's Draft;
      - version 1 of the "Self-hosted" Ruleset, which is the Draft's origin.

      The game server still has no Live configuration.
- [x] Each user preset, and each `Presets/Static/` preset except
      `GameDefault`, becomes a Ruleset with one version 1:
      - the Ruleset is named after the manifest title, or the folder name if
        the title is empty or the manifest is missing;
      - version 1 takes the manifest's description;
      - its saved time is the import time.
- [x] Notes:
      - Notes whose author is the old username become the owner's; others
        have no author;
      - created time is the import time, and order within a key is kept;
      - bodies pass the Note sanitizer;
      - Notes on keys the schema lacks are imported and stay hidden.
- [x] Values are read by key name, with no category:
      - Unknown keys, unknown weapon classes and invalid values are dropped
        and reported. One dropped value never fails the import.
      - A key found in two category files is imported once if the values
        match. If they differ, the file for the key's current category wins
        and the other value is reported as dropped.
      - A file that is not valid JSON fails the import.
- [x] The script is a dry run by default and writes nothing; `--commit`
      writes, in one transaction. It refuses if:
      - the target Draft was ever saved;
      - the target game server has a Live configuration;
      - a Ruleset name it would create already exists, ignoring case;
      - two names inside the import collide.
- [x] The report lists:
      - each destination with its value count;
      - every dropped value, with its database, weapon class, key, file and
        reason;
      - Note attributions and Notes on hidden keys;
      - Note bodies the sanitizer changed.
- [x] Tests run the script as a child process on temp self-hosted folders
      built by the test. They cover the dry run, commit, each refusal, the
      drop rules, Note attribution and the report.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op40-import-script-86744e` (not pushed),
on main `e7a30d7`. 254 tests pass across 44 files (244 + 10), typecheck is
clean, and lint stays at 9. No migration, no new dependency and no
`package.json` script.

- The script: `scripts/import-self-hosted.ts`. Its test:
  `tests/import-self-hosted.test.ts`, which runs it as a child process
  (through `withPlatformDatabase`) on folders it builds in a temp root.
  Delete both, in their own commit, after the owner's import (#42).
- Arguments, all named:
  - `--databases`, `--presets` and `--notes`: the copied folders;
  - `--discord-id`: the owner's Discord user id;
  - `--game-server`: the game server's name, ignoring case;
  - `--old-username`: the owner's self-hosted username;
  - `--ruleset-name` (default "Self-hosted"), and `--commit`.

  The database is `DATABASE_PATH`.
- Exit codes: 0 when the dry run or the import passed, 1 when it refused (the
  report ends with every reason), and 2 for a usage error.
- Readers: its own, from the code that wrote each format: Databases from
  `src/lib/database/service.ts`, presets from `src/lib/presets/service.ts`
  before `47cebe8`, and Notes from `src/lib/notes/` before `276caf7`. It
  imports nothing from `src/lib/database/` or any other self-hosted module.
  It places and checks values with `documentFields` and `fieldError` from
  `valuesDocument.ts`, the rules that loading a Ruleset version and saving a
  Draft use. Notes go through `sanitizeNoteBody`, `hasNoteText` and
  `isNoteKey`. Names and descriptions are read with `readRulesetName`,
  `readGameServerName` and `readDescription`.
- Writes, all in one `BEGIN IMMEDIATE` transaction. The platform checks run
  again inside it, so a change between the dry run and `--commit` refuses
  rather than half-writes.
  - Each Ruleset, then its version 1, with `created_at` and `saved_at` both
    set to the import time.
  - The Draft through `loadDraft` at revision 0. It ends at revision 1, saved
    at the import time, with its origin set to "Self-hosted" version 1.
  - The Notes, in file order, at the import time, with `edited_at` NULL.
  - Nothing goes to `live_configurations`.
- The database guard: the script never creates or migrates the database. It
  stops when `DATABASE_PATH` names no file, or when the file is not at this
  release's migration version.
- No log lines. The script is run by hand, not under systemd, and the report
  on the terminal is its record.

Calls made where the ticket leaves room (the reading closest to the ticket
and `spec.md`):
- "Not valid JSON" also covers an empty file, a file that is valid JSON but
  not an object, and a file that cannot be read. Each fails the import. The
  old reader treated an empty or broken category file as no values, but
  here that would let the first Apply wipe values. A leading byte-order mark
  is allowed.
- Weapon values:
  - An attack's keys are read only from that attack's file (`Strike`,
    `AltStrike`, `Stab` or `AltStab.json`). The attack says where the value
    applies, so it is not a category.
  - A General key is read by name from any file of its weapon, and
    `General.json` counts as its current category's file.
  - An attack key in any other file is dropped with "An attack key outside
    an attack file".
  - A key the schema limits to other weapons is dropped with "<class> does
    not have this key".
- Duplicates:
  - Copies with different values, none of them in the current category's
    file: every copy is dropped, and no file wins.
  - The duplicate rule runs before validation. If the winning copy is
    invalid, it is dropped too; the losing copy is not used in its place.
- Ruleset names and descriptions follow the platform's own rules: names at
  most 64 characters, descriptions at most 500, no control characters.
  - A title or description that breaks them refuses the import, as a
    collision does. The owner edits the copied manifest. Nothing is
    truncated or renamed.
  - A title that is not a string counts as empty, so the folder name is
    used. A description that is not a string means no description.
  - Titles are trimmed.
- The "Self-hosted" version 1 has no description.
- Order: "Self-hosted" first, then the User presets, then Static, each group
  by folder name.
- Notes:
  - The old username matches exactly, case included.
  - A Note whose `createdBy` is missing has no author.
  - A Note is dropped and reported when it has no string body, or when no
    text is left once it is sanitized. The platform refuses a Note with no
    text.
  - A key whose value is not a list is dropped and reported.
- One refusal beyond the ticket's four: when a Note to import is already on
  the platform, with the same database, key and body. Without it, deleting
  the game server and the Rulesets and then running again would add every
  Note twice.
- "Not read": files and folders outside the old layout are listed in the
  report and never fail the import.
  - Silently skipped: dotfiles, which are the old app's own records
    (`.revision.json`, `.last-apply.json`, the parry migration's files).
  - Listed: other folders in `Databases/` (a flat legacy weapon folder
    included), loose files in `Presets/User/` or `Presets/Static/`, and
    `Presets/Static/GameDefault`.

How the owner runs it at cutover (steps 2 to 4 of #42's cutover):
1. Before the cutover: the release that has this script must be the one
   deployed. `bun run deploy` fetches from GitHub, so push `main` first.
2. Copy the folders from Markbox to the PC, then to the instance, and move
   them where the app's user can read them:

   ```bash
   ssh ezconfig-platform mkdir -p ezconfig-import
   scp -r Databases Presets Notes ezconfig-platform:ezconfig-import/
   ssh ezconfig-platform 'sudo rm -rf /srv/ezconfig-platform/import && sudo cp -r ~/ezconfig-import /srv/ezconfig-platform/import && sudo chown -R ezconfig:ezconfig /srv/ezconfig-platform/import'
   ```

3. Sign in to the platform and register the game server. Do not edit its
   Draft before the import: any save makes the import refuse. If that
   happens, delete the game server and register it again.
4. Dry run on the instance (`ssh ezconfig-platform`), as the app's user,
   from the running release:

   ```bash
   cd /srv/ezconfig-platform/current && sudo -u ezconfig -H env DATABASE_PATH=/var/lib/ezconfig-platform/platform.db /usr/local/bin/bun --no-env-file run scripts/import-self-hosted.ts --databases /srv/ezconfig-platform/import/Databases --presets /srv/ezconfig-platform/import/Presets --notes /srv/ezconfig-platform/import/Notes --discord-id <your Discord user id> --game-server "<game server name>" --old-username <your self-hosted username>
   ```

   Read the report:
   - Destinations, each with its value count;
   - Dropped values, each with its reason;
   - Not read. Your two untracked `Presets/Static/` presets
     (`Movement.json`, `Recovery.json`, from #13) are imported only if each
     is a preset folder. If they are loose files, they show here: put each
     in its own folder, laid out as `Character/<category>.json`;
   - Notes: whose are yours, which have no author, hidden keys, and changed
     bodies.

   Fix anything by editing the copies in `/srv/ezconfig-platform/import`,
   then run the dry run again.
5. The same command with `--commit`. The app keeps running, and Litestream
   streams the change. Then, as cutover steps 5 and 6: Game.ini, the
   Supported build, then review the Draft and Apply.
6. Remove the copies:
   `ssh ezconfig-platform 'sudo rm -rf /srv/ezconfig-platform/import ~/ezconfig-import'`.

Not run against real data: the owner's folders and the instance were never
read or touched. The report and every refusal were checked only on the
made-up folders the test builds.
