# 16: Platform storage and startup migrations

Status: completed
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

- [x] All platform database access goes through one module on `bun:sqlite`.
      The file location comes from `DATABASE_PATH`, which `.env.example`
      documents.
- [x] Every connection enforces foreign keys, and the database runs in WAL
      mode, which Litestream needs.
- [x] Migrations are numbered SQL files that only move forward. At startup,
      through the existing startup hook and before any request is served,
      pending migrations apply in order, each in its own transaction, and
      `PRAGMA user_version` records the version.
- [x] Before applying any migration, the app writes a `VACUUM INTO` copy
      beside the database, named by version. It keeps the last 3 copies and
      none older than 14 days.
- [x] A failed migration rolls back its transaction and blocks startup with a
      clear message.
- [x] The app refuses to start on a database whose version is newer than its
      code.
- [x] A test helper gives each child fixture a fresh, migrated temp database.
      Tests cover: migrations applying in order, the copy being taken and
      pruned, a newer database being refused, and a failed migration blocking
      startup.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02, done (commits 373854e to 24c4e4a).

- Module: `src/lib/platform/storage.ts` is the only app module that imports
  `bun:sqlite`. `openPlatformDatabase` sets `foreign_keys = ON`, WAL (it throws
  if WAL is refused) and `busy_timeout = 5000`. `migratePlatformDatabase` is
  what startup calls. First migration: `migrations/0001-baseline.sql`, which
  only sets `application_id` ('EZCF') to mark the file.
- Startup: `registerServerStartup` migrates when `DATABASE_PATH` is set, after
  the old sync is stopped and before the parry migration and sync registration.
  A failure logs `[EZConfig platform storage] startup blocked: ...` and rethrows.
  Migration files must be `0001-name.sql`, `0002-name.sql`, ... with no gaps.
- Each migration runs in its own `BEGIN IMMEDIATE` transaction that also sets
  `user_version`, so a failure leaves the version where it was. Following
  SQLite's table-rebuild procedure, the migration connection turns foreign keys
  off and runs `PRAGMA foreign_key_check` before each commit.
- Copy: `VACUUM INTO <file>.v<from>.<ISO time>.bak` beside the database, on
  every start that has migrations pending (a fresh database included), so it is
  taken before anything changes. Pruning keeps the newest 3 and drops any older
  than 14 days, by the time in the name. Other files are left alone.
- Tests: `tests/platform-storage.test.ts` (8 tests) starts the app through the
  child fixture `tests/fixtures/platform-startup.ts`, run from a release
  directory that carries its own migrations, and reads the file at rest
  read-only. The helper is `runPlatformFixture(fixture)` in
  `tests/helpers/platform-database.ts`. Mutation checks: removing the
  transaction, the foreign keys pragma, age pruning, foreign keys off or
  `foreign_key_check` each turns a test red.
- Checked by hand under `next build` + `next start` (Next 16.1.4, Turbopack):
  - On Bun with a fresh database, it migrated 0 to 1 before Ready and requests
    got 200. A restart with nothing pending logs nothing.
  - A database at `user_version` 99 logs "startup blocked" and requests get 500.
  - On Node without `DATABASE_PATH`, the self-hosted app is unchanged (200).
    With it set, the guard message appears and requests get 500.
- Checks: typecheck clean; full suite 155 pass, 0 fail with every path in temp
  dirs; lint 25 problems, as before, none in the changed files.

Follow-ups:
- A failed startup migration makes Next answer 500 rather than exit, the same
  as the parry hook. [Hosting](22-hosting-walking-skeleton.md) should decide whether the process
  should exit so the supervisor restarts it or holds the deploy.
- An unset `DATABASE_PATH` skips platform storage silently, to keep the
  self-hosted app working. [Remove the self-hosted mode](41-remove-the-self-hosted-mode.md)
  should make it required.
- The two console lines in startup can move to the logging module (ticket 17).
- Migrations are read from `src/lib/platform/migrations` under the working
  directory, so a deploy must ship that folder and run from the app directory.
