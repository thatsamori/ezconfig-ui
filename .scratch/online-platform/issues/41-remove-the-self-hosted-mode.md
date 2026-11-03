# 41: Remove the self-hosted mode

Status: open
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

- [ ] Removed, with their tests:
      - the RCON service, the batch client and protocol;
      - the automatic-sync responder, its bootstrap and owner lock;
      - the RCON and Game.ini server actions;
      - the file-based database service and the old file-based command
        builder;
      - the parry-geometry startup migration and its CLI;
      - the database init script;
      - the `rcon-client` dependency.
- [ ] The startup hook runs only the SQLite migrations. This closes
      `AGENTS.md`'s pending decision on the parry-geometry hook.
- [ ] `.env.example` lists only platform settings. `DATABASES_PATH`,
      `PRESETS_PATH`, `NOTES_PATH`, `USERS_PATH`, `RCON_*`,
      `EZCONFIG_PASSWORD` and `ADMIN_*` are gone from code and docs.
- [ ] The game-defaults scripts stay, if they only serve the config schemas
      and `gameDefaults.json`.
- [ ] `docs/automatic-sync.md`, `docs/server-processing-results.md` and
      `docs/parry-geometry-migration.md` move to `docs/archive/`.
- [ ] `AGENTS.md` describes the platform's commands, environment settings,
      layout, safety rules and docs index. Its RCON safety section becomes
      platform safety: tests never open real connections, and nothing is
      sent to a live game server or the live instance without the owner's
      go-ahead.
- [ ] No route answers without a session except sign-in, the poll endpoint
      and the localhost-only heartbeat.
- [ ] The schema, validation and string-schema tests still pass, as do the
      feature reviews on the harness.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
