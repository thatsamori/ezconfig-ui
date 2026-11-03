# 36: Notes on the platform

Status: open
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

- [ ] Notes are stored per database and key name. Every server owner can read
      them, and they are never part of a Draft, Live configuration or Ruleset
      version.
- [ ] Adding a Note takes its author from the session. Any author named in the
      request is ignored.
- [ ] An author can edit and delete only their own Notes. An edit overwrites
      the body and sets the edited time.
- [ ] The platform operator can delete any Note but edit none.
- [ ] Every body is sanitized on save against an allowlist: paragraphs, bold,
      italic, underline, lists, code and `http(s)` links. Everything else is
      stripped, including script, event handlers, styles and `javascript:`
      links.
- [ ] Notes on keys the current schema lacks are kept but not shown.
- [ ] A Note with no author shows "a former server owner".
- [ ] The file-based Notes service and routes are removed with their tests.
- [ ] Note bodies never appear in the log.
- [ ] Route-handler tests cover:
      - the author coming from the session;
      - the own-only edit and delete rules;
      - operator delete;
      - each sanitizer rule;
      - hidden keys;
      - "a former server owner".
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
