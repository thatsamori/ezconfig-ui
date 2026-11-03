# 41: Remove the self-hosted mode

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 32, 35, 36
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The final contract step. Whatever self-hosted code earlier slices left
behind is removed, so the repo is only the platform:
- RCON and automatic sync;
- file storage and the parry-geometry startup migration;
- the old environment settings and scripts.

The docs and `AGENTS.md` describe the platform.

Markbox stays on its current commit, running the self-hosted app, until the
cutover in [Launch and cutover](42-launch-and-cutover.md) stops it for good.

## Acceptance criteria

- [x] Removed, with their tests:
      - the RCON service, the batch client and protocol;
      - the automatic-sync responder, its bootstrap and owner lock;
      - the RCON and Game.ini server actions;
      - the file-based database service and the old file-based command
        builder;
      - the parry-geometry startup migration and its CLI;
      - the database init script;
      - the `rcon-client` dependency.
- [x] The startup hook runs only the SQLite migrations. This closes
      `AGENTS.md`'s pending decision on the parry-geometry hook.
- [x] `.env.example` lists only platform settings. `DATABASES_PATH`,
      `PRESETS_PATH`, `NOTES_PATH`, `USERS_PATH`, `RCON_*`,
      `EZCONFIG_PASSWORD` and `ADMIN_*` are gone from code and docs.
- [x] The game-defaults scripts stay, if they only serve the config schemas
      and `gameDefaults.json`.
- [x] `docs/automatic-sync.md`, `docs/server-processing-results.md` and
      `docs/parry-geometry-migration.md` move to `docs/archive/`.
- [x] `AGENTS.md` describes the platform's commands, environment settings,
      layout, safety rules and docs index. Its RCON safety section becomes
      platform safety: tests never open real connections, and nothing is
      sent to a live game server or the live instance without the owner's
      go-ahead.
- [x] No route answers without a session except sign-in, the poll endpoint
      and the localhost-only heartbeat.
- [x] The schema, validation and string-schema tests still pass, as do the
      feature reviews on the harness.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/op41-remove-self-hosted-01da38` (not
pushed), commits `fbf16af..299748c` on main `e7a30d7`, then this record.
190 tests pass across 39 files, typecheck is clean, lint went from 9
problems to 5, and `bun --bun next build` succeeds.

- Removed, with their tests and fixtures:
  - `src/lib/rcon/` except the value formatters: the RCON service, the
    acknowledged batch client, protocol and processing-result reader, and
    automatic sync with its bootstrap, listener and owner lock.
  - `src/app/actions/rcon.ts` and `gameini.ts`, with `src/lib/gameini/`.
  - `src/lib/database/service.ts`, `apply.ts` (`buildRconCommands`,
    `applyConfig`), `revision.ts` and `index.ts`.
  - `src/lib/migrations/parry-geometry.ts` and
    `scripts/migrate-parry-geometry.ts`; `scripts/init-databases.ts` and
    the `init-db` script.
  - `rcon-client` and `jszip`, and the packages only they needed, from
    `package.json` and `bun.lock`.
  - Tests: `automatic-sync`, `rcon-batch`, `rcon-processing` and
    `parry-migration` (55 tests), and the fixtures only they used.
- Kept: the schemas and string schemas, `gameDefaults.json` and both
  game-defaults scripts (they import only the schemas), `validation.ts` and
  `types.ts` in `src/lib/database/`, the feature review harness, and
  `deploy/`. The formatters move to `src/lib/config/formatters.ts`, beside
  the encoder that uses them.
- Startup: `registerServerStartup` migrates the database at
  `DATABASE_PATH`, then starts the daily sweep. A reload with the same path
  does nothing again.
- Tests: 244 to 190 is the 55 removed plus one new storage test.
  - The new test keeps the startup checks the parry migration's had: a build
    or the edge runtime never opens the database, and three calls at once
    migrate and start the sweep once.
  - The platform startup fixture records when the sweep starts, where it
    recorded when sync registered.
  - The Parry sections test moved to `tests/console.test.ts`.
  - The encoder test compared `commandBatch` with `buildRconCommands`. It
    now checks the batch the builder produced for the same values, captured
    before removal.
- Feature reviews: all still run on the harness. Only parts that exercised
  the removed code were dropped:
  - the harness: its RCON mock, `synced()` and the file writes in
    `storeUnvalidated`. It sets only `DATABASE_PATH`, and its isolation test
    now checks a stand-in database is left alone;
  - geometry combined: the migration and startup-snapshot checks, as #20
    planned. The five dimensions and six transforms through the editor and
    Apply stay;
  - camera policy flow: its TCP RCON server, automatic sync and strict
    storage checks. The Draft refusals and Ruleset versions stay;
  - stun combined: running each batch through the batch sender against a
    controlled exchange, and its hand-written mixed batches (an unknown key,
    a late failure). It now counts the values each Apply delivers.
- No route answers without a session: the sign-in fixture's `routes`
  scenario now covers every `src/app/**/route.ts`, the auth routes
  included. Four answer without a session: the two sign-in routes, the poll
  endpoint and the heartbeat. The scenario fails if one of those four files
  is gone or a source file declares a server action. #37's operator routes
  are covered as they land.
- Docs: the three docs moved to `docs/archive/`, and its README says what
  they were. `AGENTS.md` has Environment settings and Platform safety
  sections; `README.md` describes the platform's setup, game server setup
  and commands. `docs/stun-rules-validation.md` no longer names
  `RCON_AUTO_SYNC_ENABLED`. `NOTES_PATH` went with #36; `USERS_PATH` and
  `ADMIN_*` were already unread.
- Checked by hand: `next start` from the build on a temp database, port
  3471. Startup migrated it from version 0 to 9. `/api/auth/session` and
  `/api/game-servers` answered 401, the poll without a key answered 401,
  and the page served.

Calls taken where the ticket left room:
- `DATABASE_PATH` is now required: startup is blocked without it (#16's
  follow-up). Without it nobody could sign in anyway.
- `validation.ts` and `types.ts` stay in `src/lib/database/` rather than
  moving under `src/lib/config/`. That keeps #43 (`configStore.ts`,
  `live-configurations.ts`) clear of import changes. `AGENTS.md` notes that
  database is the mod's term there.
- `.gitignore` still ignores `Databases/`, `Presets/User/`, `Notes/`,
  `users.json`, `Game.ini` and `rconExamples.ts`. They are the owner's data
  in the main checkout, and #40's import reads them.
- The CSP fixture's build folder keeps its name,
  `.next-automatic-sync-test/csp`, which `.gitignore` lists.
- The two startup console lines stay on `console.*` rather than moving to
  the log module (#16's other follow-up). The storage tests read them.

Left for others:
- #40 reads the old folders with its own readers from its arguments. This
  branch removes nothing it needs: `env.databasesPath` is gone, but the
  script takes paths instead.
- Merging: `AGENTS.md` (Layout, Commands, Data and secrets), `package.json`
  and `bun.lock`, and the platform tests' `SETTINGS` and `scenario()`
  helpers (the `root` parameter is gone) are where #37, #40 and #43 may
  meet this branch.
