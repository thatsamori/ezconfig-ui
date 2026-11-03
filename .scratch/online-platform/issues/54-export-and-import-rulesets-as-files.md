# 54: Export and import Rulesets as files

Status: open
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

- [ ] Each version on the Rulesets tab has an Export that downloads its file, with
      exactly the format marker, format version, name, description and values.
- [ ] Another owner's Ruleset or version answers 404 on export. Export and import
      need a session, and import needs the platform's origin.
- [ ] Choosing a file shows its name, value count and dropped values, and writes
      nothing. Confirming creates version 1 of a new Ruleset in one transaction, and
      no Draft, Live configuration or game server changes.
- [ ] A taken name, ignoring case, is shown, and the owner can change it. Importing
      under a taken name is refused with nothing written.
- [ ] Too-large files, and files that aren't JSON or aren't the expected format, are
      refused with a clear message and nothing written.
- [ ] A value with no place in the current schema, or one a save would refuse, is
      dropped and reported, and the rest of the file imports.
- [ ] Export, import, then Load Ruleset version gives the same Draft as loading the
      original.
- [ ] The download's filename is safe for any Ruleset name.
- [ ] Logs hold ids and counts only.
- [ ] `spec.md`, `map.md`, `CONTEXT.md` and `AGENTS.md`'s Layout say what is now true.
- [ ] Checked in a browser on a built app with two made-up owners, at narrow and
      wide widths.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
