# 16: Platform storage and startup migrations

Status: open
Type: task
Created: 2026-11-02
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A prefactor that every later platform slice builds on. The platform gets one
SQLite database at `DATABASE_PATH`, reached only through one storage module
using `bun:sqlite`. Its schema moves forward through numbered migrations that
the app applies at startup, before it serves anything.

Tables arrive with the slices that need them. This ticket ships the mechanism,
a first migration, and a test helper that gives each child fixture a fresh
migrated database in a temp file.

The self-hosted startup work (the parry-geometry file migration and automatic
sync) keeps running unchanged until
[Remove the self-hosted mode](41-remove-the-self-hosted-mode.md) removes it.

## Acceptance criteria

- [ ] All platform database access goes through one module on `bun:sqlite`.
      The file location comes from `DATABASE_PATH`, which `.env.example`
      documents.
- [ ] Every connection enforces foreign keys, and the database runs in WAL
      mode, which Litestream needs.
- [ ] Migrations are numbered SQL files that only move forward. At startup,
      through the existing startup hook and before any request is served,
      pending migrations apply in order, each in its own transaction, and
      `PRAGMA user_version` records the version.
- [ ] Before applying any migration, the app writes a `VACUUM INTO` copy
      beside the database, named by version. It keeps the last 3 copies and
      none older than 14 days.
- [ ] A failed migration rolls back its transaction and blocks startup with a
      clear message.
- [ ] The app refuses to start on a database whose version is newer than its
      code.
- [ ] A test helper gives each child fixture a fresh, migrated temp database.
      Tests cover: migrations applying in order, the copy being taken and
      pruned, a newer database being refused, and a failed migration blocking
      startup.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
