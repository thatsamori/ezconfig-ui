# 36: Notes on the platform

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 30
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

While editing a Draft, a server owner reads every Note on a config key, from
every server owner, and adds their own. The author always comes from the
session. An author edits and deletes only their own Notes; the platform
operator can delete any Note. Every body is sanitized on save, so no Note can
run script in another owner's session.

The change is made in place. The file-based Notes service and routes are
removed, along with today's request-body author.

## Acceptance criteria

- [x] Notes are stored per database and key name. Every server owner can read
      them, and they are never part of a Draft, Live configuration or Ruleset
      version.
- [x] Adding a Note takes its author from the session. Any author named in the
      request is ignored.
- [x] An author can edit and delete only their own Notes. An edit overwrites
      the body and sets the edited time.
- [x] The platform operator can delete any Note but edit none.
- [x] Every body is sanitized on save against an allowlist: paragraphs, bold,
      italic, underline, lists, code and `http(s)` links. Everything else is
      stripped, including script, event handlers, styles and `javascript:`
      links.
- [x] Notes on keys the current schema lacks are kept but not shown.
- [x] A Note with no author shows "a former server owner".
- [x] The file-based Notes service and routes are removed with their tests.
- [x] Note bodies never appear in the log.
- [x] Route-handler tests cover:
      - the author coming from the session;
      - the own-only edit and delete rules;
      - operator delete;
      - each sanitizer rule;
      - hidden keys;
      - "a former server owner".
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op36-notes-62f74c` (not pushed). 205
tests pass across 39 files, typecheck is clean, and lint stays at 13.

- Migration `0006-notes.sql` adds the `notes` table: `database_name`
  (`Character` or `Weapon`), `key_name`, `author_id` (`ON DELETE SET NULL`),
  `body`, `created_at` and `edited_at`. #32 may also take `0006`; whichever
  merges second renumbers.
- Storage and the sanitizer: `src/lib/platform/notes.ts`.
  - Within a key, Notes are oldest first, then by id, so an import that gives
    them all one created time keeps their order.
  - Each Note comes back with `canEdit` (author only) and `canDelete` (author
    or platform operator), worked out for whoever reads it. The panel shows
    its buttons from these.
- Routes:
  - `GET /api/notes` returns every shown Note, by database and key.
  - `POST /api/notes {database, key, body}` adds a Note (201). Any author the
    body names is ignored.
  - `PUT /api/notes/[id] {body}` edits one, author only.
  - `DELETE /api/notes/[id]` deletes one, author or operator.
  - Each change answers with the key's Notes after it. 403 when it is not
    yours; 404 for no such Note, or one on a hidden key; 400 for a bad
    database or key, or a body with no text once sanitized; 413 over 64 KB.
- Hidden keys: a Note on a key the schema lacks is not listed, and cannot be
  edited, deleted or added to. Its row stays as stored.
- Sanitizer: `sanitize-html` 2.18.1, the new dependency, with
  `@types/sanitize-html` 2.16.2 as a dev dependency. It runs on every add and
  edit, and #40's import can call `sanitizeNoteBody`.
  - Allowlist: `p`, `br`, `strong`, `em`, `u`, `ul`, `ol`, `li`, `code` and
    `a`. `b` becomes `strong` and `i` becomes `em`.
  - A link keeps only an absolute http(s) address, read with the WHATWG URL
    parser as a browser would. It opens with `target="_blank"` and
    `rel="noopener noreferrer nofollow"`. Any other link loses the `a` and
    keeps its text. That goes through `exclusiveFilter: 'excludeTag'`:
    renaming the tag in `transformTags` leaked the new name onto the next
    link's closing tag (`</stripped>`). The hand check caught it, and a test
    now covers it.
  - Everything else is stripped and keeps its text; script, style, textarea
    and option lose it too. That covers attributes, event handlers, styles
    and comments.
- Logging: the operator deleting a Note that is not theirs logs
  `note.deleted-by-operator` with `userId` and the new `noteId` field. Adds,
  edits and an author's own deletes log nothing but errors. No body ever
  reaches a log line: each scenario checks its output for every body and
  name it sent.
- Panel (`NotesDialog`, `useNotes`, `NotesContext`): one load of every Note
  for all rows. The list reloads each time the panel opens, and each change
  replaces its key's list. Notes show their time and "edited". The operator's
  delete confirm names the author. Links in a Note are styled.
  `RichTextEditor` turns off strike, which the sanitizer would strip.
  `ConfigConsole.tsx` changes only in the `KeyRow` Notes lines.
- Removed: `src/lib/notes/service.ts`, `types.ts`, `index.ts` and the routes
  under `src/app/api/notes/[schema]/`. There were no tests of them.
  `NOTES_PATH`/`env.notesPath` are gone too: from `env.ts`, the test fixtures
  that set them, the feature review harness and `AGENTS.md`. The `Notes/`
  folder stays gitignored user data for #40.
- Tests: `tests/platform-notes.test.ts` with `tests/fixtures/platform-notes.ts`
  cover six scenarios: author from the session, own-only, operator,
  sanitizer (each rule, on add and on edit), hidden keys and former owner.

Checked by hand:
- Setup: `bun --bun next dev` on a temp database at `op36.localhost:3123`,
  with three made-up owners: Ann, Bob, and Olive as the operator.
  - Other sessions' servers on `localhost` replaced the session cookie, so
    the check used its own host name.
- Ann added a bold Note in the editor and edited it ("edited" shows).
- Bob saw it with no buttons, and his edit and delete got 403. He added,
  edited and deleted his own Note.
- Olive saw only Delete on Ann's Notes, and her edit got 403. The confirm
  read "This note is by Ann…". Her delete was logged once. She added, edited
  and deleted her own Note, which logged nothing.
- A crafted body was stripped to its text and the https link. It had
  `<script>`, `<img onerror>`, `style`/`onmouseover` and a `javascript:` link.
  Nothing ran, and no body text reached the server log.
- `bun --bun next build` and `next start` served and sanitized a Note.

For #40: call `sanitizeNoteBody` and `isNoteKey` from `notes.ts`. Insert
rows with `author_id` NULL for Notes by anyone but the owner, and keep the
file order by inserting in order with one created time. The old files are
keyed `character`/`weapon`; map them to `Character`/`Weapon`.

Dev-server quirk, not a bug in the build: on a fresh build directory, the
first request to `/api/notes` can fail with "Failed to load external module
postcss-…". Next keeps postcss external, and sanitize-html needs a newer
postcss than the hoisted one, so Turbopack links it from the build
directory. The running Bun server misses a link made after it started.
Restarting the dev server fixes it. `next build` makes the link before
`next start`, so production is unaffected.
