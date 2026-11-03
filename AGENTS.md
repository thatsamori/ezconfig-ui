# AGENTS.md - ezconfig-ui

## Purpose
Next.js + Bun web app: the hosted, invite-only EZConfig platform and the source
of truth for EZConfig values. Server owners sign in with Discord, register
their Mordhau game servers and edit each one's Draft; Apply makes it the Live
configuration. The EZConfig mod on the game server long-polls the platform
with its Game server key, receives the Live configuration as `string ezconfig
...` commands and processes them itself. Everything is stored in one SQLite
database. Config key names are the contract between this app and the mod.

## Read first
1. This file.
2. This repo's `CONTEXT.md` (platform terms) and `.scratch/online-platform/map.md`
   (the spec is `spec.md` beside it).
3. For config keys or mod-side work: the mod's `AGENTS.md`, `CONTEXT.md` and
   `STATUS.md` at `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig`,
   and the mod ticket for your feature: `<mod>/.scratch/<feature>/`.

## Commands
`bun` must be on PATH: some tests spawn `bun` as a child process.
- `bun install` - dependencies (`bun.lock` is the only lockfile).
- `bun test ./tests` - full suite. Run as `bun --no-env-file test ./tests` with
  `DATABASE_PATH` at a file in a temp dir (tests that call routes in-process
  sign in there), so no real data is touched. Child fixtures get their own.
- `bun run typecheck` - `tsc --noEmit`.
- `bun run lint` - ESLint flat config (`eslint.config.mjs`, eslint-config-next).
- `bun --bun next build` - production build; builds never migrate.
- `bun --bun run dev` / `bun --bun next start` - only with `DATABASE_PATH` at a
  temp file: startup migrates the database it names.
- `bun run deploy <commit>` - deploys to the live instance; the owner runs it
  (`docs/hosting.md`).

## Environment settings
`.env.example` lists every setting the app reads and what it means;
`src/lib/env.ts` reads them. `DATABASE_PATH` is required: startup refuses to
run without it. On the instance the settings live in
`/etc/ezconfig-platform/platform.env` (`docs/hosting.md`); the repo holds no
instance's settings or secrets.

## Layout
- `src/lib/config/` - schemas (`characterConfigSchema.ts` aggregates the
  category schemas; `weaponConfigSchema.ts`), `gameDefaults.json`, `defaults.ts`;
  `formatters.ts` writes each value in the mod's command encoding.
- `src/lib/database/` - `validation.ts` (each value against the schema) and
  `types.ts`. Database is the mod's term (Character, or a weapon class);
  platform storage is `src/lib/platform/`.
- `src/lib/server-startup.ts`, `src/instrumentation.ts` - startup hook: the
  platform migrations, then the daily sweep.
- `src/lib/platform/` - platform storage: `storage.ts` is the only app module that
  opens the SQLite database; `migrations/` holds its numbered SQL migrations.
  Logging: `log.ts`. Sign-in with Discord: `discord.ts` (the OAuth exchange, the
  one module tests replace), `sign-in.ts`, `users.ts`, `sessions.ts` and `auth.ts`,
  whose `requireSession` every route handler calls first (Origin check on
  requests that change data, then the session cookie), except sign-in
  (`src/app/api/auth/discord/`), the poll endpoint and the heartbeat; the
  sign-in fixture's `routes` scenario checks every route file. Operator-only
  routes call `requireOperator` instead. Invites: `invites.ts`
  (codes stored as hashes only) and `src/app/api/operator/invites/`. Server
  owners: `server-owners.ts` (the operator's list, Remove and Restore access,
  Delete with the foreign keys' cascade, none against an operator) behind
  `src/app/api/operator/server-owners/`. `retention.ts`
  is the daily sweep of expired sessions and old Invites, started by the startup hook.
  Game servers: `game-servers.ts` (registering, keys kept only as SHA-256 hashes,
  Regenerate key and Delete, connection status), `polls.ts` (the one in-process
  registry of held polls, with the shared-key count) and
  `poll-exchange.ts` (reads a poll against `docs/poll-exchange.md`). The poll
  endpoint, `src/app/game-server/poll/`, sits outside `src/app/api/`: game
  servers send their key, not a session. `supported-build.ts` is the one
  build stamp anything is sent to, set at `src/app/api/operator/supported-build/`.
  The operator's Status page: `status.ts`, with `backup-heartbeat.ts` (fed by
  the localhost-only `src/app/internal/backup-heartbeat/`) and
  `restore-check.ts` (the weekly check's status file beside the database).
  Drafts: `drafts.ts` (one values document per game server, revision-checked
  whole saves) behind `src/app/api/game-servers/[id]/draft/` and its `reset/`.
  The document's shape and placement are in `src/lib/config/valuesDocument.ts`.
  Its encoder, `src/lib/config/encodeValues.ts`, builds the wipe-then-category batch.
  Live configurations: `live-configurations.ts` (the review, Apply, delivery,
  Discard changes, and the Pending, Blocked, Confirmed or Failed state
  computed from the last report and the current schema) behind
  `src/app/api/game-servers/[id]/apply/` and
  `.../draft/discard/`; the poll route delivers from it.
  Rulesets: `rulesets.ts` (Save as Ruleset version, loading a version,
  rename and delete, and exporting and importing a Ruleset file) behind
  `src/app/api/rulesets/` and `.../draft/save-version/` and `.../draft/load/`;
  a Ruleset file's format is `src/lib/config/rulesetFile.ts`; `origins.ts` gives
  a Draft's or Live configuration's origin and whether it is modified.
  Notes: `notes.ts` (per database and key name, author from the session, and
  the body sanitizer, sanitize-html with an allowlist) behind `src/app/api/notes/`.
- `src/proxy.ts` - the Content-Security-Policy, with a fresh nonce per request, on
  every page. Inline script runs only with the nonce, so a new page or component
  adds no inline `<script>` or `on*` handler; the root layout renders per request
  so Next.js can put the nonce on its scripts. A new external source is a
  policy change.
- `src/app/api/` - the route handlers; `src/lib/store/configStore.ts` - the
  editor's client store for the open Draft.
- `string-schemas/` - generated `characterConfigSchema.txt`/`weaponConfigSchema.txt`.
- `tests/` (`*.test.ts`), `tests/fixtures/` (standalone child fixtures) and
  `tests/helpers/`: `runPlatformFixture`/`withPlatformDatabase` (child fixtures
  on a fresh, migrated platform database) and `signInForTest` (a session for
  tests that call routes directly; the feature review harness uses it).
- `scripts/` - `deploy.ts`, the game defaults export and import
  (`docs/game-defaults.md`), and the one-time import (`import-self-hosted.ts`,
  online-platform#40; deleted after the owner's import, #42).
- `docs/` - see index below; `docs/design/`, `docs/archive/` are reference only.
- `deploy/` - the platform instance's units, Caddyfile, Litestream template and
  provisioning; `scripts/deploy.ts` (`bun run deploy <commit>`) runs
  `deploy/release.sh` on it. `deploy/restore-check.ts` is the weekly restore
  check: standalone (no app imports, installed by `provision.sh`), it opens the
  database read-only and writes only the status file. Kept LF (`.gitattributes`).

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
- Startup runs each file in its own transaction, sets `user_version` inside it
  and runs `PRAGMA foreign_key_check` before it commits, with foreign keys off
  (SQLite's table-rebuild procedure). A file holds no `BEGIN`/`COMMIT`.
- Startup runs on Bun (`bun --bun next start`), which `bun:sqlite` needs.

## Platform safety
- Tests and scripts open no real connection: no game server, Discord, the live
  instance or its bucket. Tests run on temp databases, play the game server's
  polls in-process, and replace `src/lib/platform/discord` (see
  `tests/fixtures/platform-sign-in.ts`).
- Nothing is sent to a live game server or the live instance without the
  owner's go-ahead: no deploy, no Apply to a real game server, no request to
  the instance.

## Data and secrets
`.env*` (except `.env.example`) and the platform database at `DATABASE_PATH`
with its `.bak` copies (ignored only as `./platform.db*`) are gitignored user
data. So are the self-hosted app's `Databases/`, `Presets/User/`, `Notes/` and
`users.json`, which only the one-time import reads. Never print, commit or
overwrite them. `DISCORD_CLIENT_SECRET` lives only in `.env` and the
instance's `platform.env`.

## Tracking
- Mod features: the mod's `.scratch/<feature>/` is canonical for specs, tickets
  and status. This repo's `.scratch/<feature>-ui/` holds UI harnesses and
  captured-command evidence only.
- Online platform: this repo's `.scratch/online-platform/` is canonical (a
  wayfinder map with tickets and research). Platform terms are in this repo's
  `CONTEXT.md`.
- Both follow the mod's tracker conventions, with paths relative to the repo
  holding the work: `docs/agents/issue-tracker.md` (including Wayfinding
  operations) and `docs/agents/triage-labels.md` in the mod repo.

## Docs index
- `docs/poll-exchange.md` - the platform-mod poll contract: request fields, answers, status codes.
- `docs/hosting.md` - the platform instance: what runs where, settings files, provisioning, `bun run deploy`, the restore check, checks.
- `docs/restore-runbook.md` - rebuilding the instance from the bucket, and the restore drill.
- `docs/adr/` - architecture decisions (0001: one SQLite file for platform storage).
- `docs/game-defaults.md` - default snapshot, coverage and refresh procedure.
- `docs/stun-rules-validation.md` - stun/acknowledgment validation record (human pass deferred).
- `docs/weapon-reliability-validation.md` - weapon reliability validation record.
- `docs/archive/README.md` - superseded: the Jan 2026 planning archive and the self-hosted app's docs.

## Hand-off checklist
- `bun run typecheck` and the full test suite pass; lint count not increased.
- New keys: string schemas regenerated, mod key lists copied and graphs rebuilt,
  check_contract and check_weapon_contract pass.
- Mod ticket updated; evidence in `.scratch/<feature>-ui/` if commands were captured.
- Small commits, explicit paths; never commit user data or secrets; never push.

## Optional tooling
Impeccable design skill: `.agents/skills/impeccable`. It is on-demand only (no
hooks); load its `SKILL.md` manually for UI/design work.
