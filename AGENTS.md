# AGENTS.md - ezconfig-ui

## Purpose
Next.js + bun web app that is the source of truth for EZConfig values. It stores
overrides in local JSON databases and pushes `string ezconfig ...` commands to a
Mordhau server over RCON, where the EZConfig mod applies them. Config key names
are the contract between this app and the mod.

## Read first
1. This file.
2. The mod's `AGENTS.md`, `CONTEXT.md` and `STATUS.md` at
   `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig`.
   For online-platform work, also this repo's `CONTEXT.md` and
   `.scratch/online-platform/map.md`.
3. The mod ticket for your feature: `<mod>/.scratch/<feature>/` (spec, tickets).

## Commands
`bun` must be on PATH: some tests spawn `bun` as a child process.
- `bun install` - dependencies (`bun.lock` is the only lockfile).
- `bun test ./tests` - full suite. Run as `bun --no-env-file test ./tests` with
  `DATABASES_PATH`/`PRESETS_PATH`/`NOTES_PATH`/`USERS_PATH` pointing at temp dirs,
  `DATABASE_PATH` at a file in one, and `RCON_HOST=127.0.0.1`, so no real data or
  server is touched.
- `bun run typecheck` - `tsc --noEmit`.
- `bun run lint` - ESLint flat config (`eslint.config.mjs`, eslint-config-next).
- `bun run init-db` - create empty databases; writes to `./Databases` (ignores
  `DATABASES_PATH`).
- Never run `bun run dev`/`start` against a real server without the user: the
  startup hook migrates storage and, with `RCON_AUTO_SYNC_ENABLED=true`, sends RCON.

## Layout
- `src/lib/config/` - schemas (`characterConfigSchema.ts` aggregates the
  category schemas; `weaponConfigSchema.ts`), `gameDefaults.json`, `defaults.ts`.
- `src/lib/rcon/` - RCON service, acknowledged batch protocol, automatic sync.
- `src/lib/migrations/`, `src/lib/server-startup.ts`, `src/instrumentation.ts` -
  startup hook: platform migrations, then the parry-geometry storage migration.
- `src/lib/platform/` - platform storage: `storage.ts` is the only module that
  opens the SQLite database; `migrations/` holds its numbered SQL migrations.
- `src/lib/database/`, `src/app/api/` - persistence and API routes.
- `string-schemas/` - generated `characterConfigSchema.txt`/`weaponConfigSchema.txt`.
- `tests/` (`*.test.ts`), `tests/fixtures/` (standalone child fixtures) and
  `tests/helpers/` (`runPlatformFixture`: a child fixture with its own fresh,
  migrated platform database).
- `scripts/` - init-db, defaults export/import, parry migration CLI.
- `docs/` - see index below; `docs/design/`, `docs/archive/` are reference only.

## Adding a config key
1. Add the entry to the right schema in `src/lib/config/`.
2. Give it a default: `defaultValue` in the schema, or a `gameDefaults.json` entry.
3. Regenerate: `cd string-schemas && bun run generateStringSchemas.ts`.
4. Copy `characterConfigSchema.txt` to the mod's `builders/character_config_keys.txt`;
   for weapon keys copy `weaponConfigSchema.txt` to `builders/weapon_config_keys.txt`.
5. Mod side: rebuild and save the key/apply graphs in the editor (character:
   `build_character_keys.py` then `build_character_apply.py`; weapon: see the
   mod `AGENTS.md` "Adding or changing a config key"). The contract checks read
   the saved Blueprints, so they fail until this is done.
6. Run the mod's `python builders/check_contract.py --webapp <this repo>` and
   `python builders/check_weapon_contract.py` (weapon check reads this repo from
   a fixed path, `C:\Users\chris\projects\ezconfig-ui`).
7. Fixtures derive totals from the string schemas; update only per-category counts.
Key names never change once published. A rename is a new key plus deprecation
of the old one, coordinated with the mod.

## Adding a platform migration
- Add the next `NNNN-name.sql` to `src/lib/platform/migrations/`. Shipped
  migrations stay as they are: a change is a new migration.
- Startup runs each file in its own transaction and sets `user_version` inside
  it, so a file holds no `BEGIN`/`COMMIT`. `PRAGMA foreign_keys = OFF` has no
  effect there: rebuilding a table that others reference needs a runner change
  first, since dropping it fires their foreign key actions.
- Startup migrates only when `DATABASE_PATH` is set, and then needs Bun
  (`bun --bun next start`).

## RCON safety
- Tests mock `src/lib/rcon/service` (see `tests/fixtures/*`); never open a real
  connection from a test or script.
- Automatic sync is opt-in (`RCON_AUTO_SYNC_ENABLED`) on one authoritative instance.
- Sending to a live server, wipes or presets loads need the user's go-ahead.

## Data and secrets
`Databases/`, `Presets/User/`, `Notes/`, `users.json`, `.env*` (except
`.env.example`) are gitignored user data, as is the platform database at
`DATABASE_PATH` with its `.bak` copies. Never print, commit or overwrite them.
Locations come from `DATABASES_PATH`, `PRESETS_PATH`, `NOTES_PATH` and
`USERS_PATH` (defaults `./Databases`, `./Presets`, `./Notes`, `./users.json`;
see `src/lib/env.ts`).

## Tracking
- Mod features: the mod's `.scratch/<feature>/` is canonical for specs, tickets
  and status. This repo's `.scratch/<feature>-ui/` holds UI harnesses and
  captured-RCON evidence only.
- Online platform: this repo's `.scratch/online-platform/` is canonical (a
  wayfinder map with tickets and research). Platform terms are in this repo's
  `CONTEXT.md`.
- Both follow the mod's tracker conventions, with paths relative to the repo
  holding the work: `docs/agents/issue-tracker.md` (including Wayfinding
  operations) and `docs/agents/triage-labels.md` in the mod repo.

## Docs index
- `docs/automatic-sync.md` - startup/reconnect/reload responder: ownership, deployment, failures.
- `docs/game-defaults.md` - default snapshot, coverage and refresh procedure.
- `docs/parry-geometry-migration.md` - Combat-to-Parry key move and startup migration hook.
- `docs/server-processing-results.md` - acknowledged batch results protocol and status.
- `docs/stun-rules-validation.md` - stun/acknowledgment validation record (human pass deferred).
- `docs/weapon-reliability-validation.md` - weapon reliability validation record.
- `docs/archive/README.md` - Jan 2026 planning archive (superseded).

Pending decision: removing the temporary parry-geometry startup migration hook.

## Hand-off checklist
- `bun run typecheck` and the full test suite pass; lint count not increased.
- New keys: string schemas regenerated, mod key lists copied and graphs rebuilt,
  check_contract and check_weapon_contract pass.
- Mod ticket updated; evidence in `.scratch/<feature>-ui/` if RCON was captured.
- Small commits, explicit paths; never commit user data or secrets; never push.

## Optional tooling
Impeccable design skill: `.agents/skills/impeccable`. It is on-demand only (no
hooks); load its `SKILL.md` manually for UI/design work.
