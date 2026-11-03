# 40: One-time import script

Status: open
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

- [ ] Arguments: the copied `Databases/`, `Presets/` and `Notes/` folders, the
      owner's Discord user id, the game server name, the owner's old username,
      and optionally the "Self-hosted" Ruleset name.
- [ ] `Databases/` becomes:
      - the named game server's Draft;
      - version 1 of the "Self-hosted" Ruleset, which is the Draft's origin.

      The game server still has no Live configuration.
- [ ] Each user preset, and each `Presets/Static/` preset except
      `GameDefault`, becomes a Ruleset with one version 1:
      - the Ruleset is named after the manifest title, or the folder name if
        the title is empty or the manifest is missing;
      - version 1 takes the manifest's description;
      - its saved time is the import time.
- [ ] Notes:
      - Notes whose author is the old username become the owner's; others
        have no author;
      - created time is the import time, and order within a key is kept;
      - bodies pass the Note sanitizer;
      - Notes on keys the schema lacks are imported and stay hidden.
- [ ] Values are read by key name, with no category:
      - Unknown keys, unknown weapon classes and invalid values are dropped
        and reported. One dropped value never fails the import.
      - A key found in two category files is imported once if the values
        match. If they differ, the file for the key's current category wins
        and the other value is reported as dropped.
      - A file that is not valid JSON fails the import.
- [ ] The script is a dry run by default and writes nothing; `--commit`
      writes, in one transaction. It refuses if:
      - the target Draft was ever saved;
      - the target game server has a Live configuration;
      - a Ruleset name it would create already exists, ignoring case;
      - two names inside the import collide.
- [ ] The report lists:
      - each destination with its value count;
      - every dropped value, with its database, weapon class, key, file and
        reason;
      - Note attributions and Notes on hidden keys;
      - Note bodies the sanitizer changed.
- [ ] Tests run the script as a child process on temp self-hosted folders
      built by the test. They cover the dry run, commit, each refusal, the
      drop rules, Note attribution and the report.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
