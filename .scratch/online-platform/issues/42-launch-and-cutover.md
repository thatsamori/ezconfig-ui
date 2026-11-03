# 42: Launch and cutover

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 24, 28, 34, 37, 39, 40, 41
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform goes live, and the owner's game server moves from the
self-hosted app to the platform:
- the mod build with the platform URL built in is published;
- its stamp becomes the Supported build;
- the owner's data is imported, and their game server is Confirmed on the
  platform.

Human in the loop throughout: the Discord application, the mod publish, the
live game server and the live instance are the owner's.

## Acceptance criteria

- [x] A Discord application exists for the instance with the platform's
      redirect URL. The instance env file holds its client id and secret, the
      redirect URL, `OPERATOR_DISCORD_IDS`, `DATABASE_PATH` and the public
      URL, and the master copy is in the owner's password manager.
- [x] Release order:
      1. The mod's built-in platform URL is set to the hostname from
         [Hosting walking skeleton](22-hosting-walking-skeleton.md), and that
         mod build is published.
      2. The platform is deployed and its Supported build set to that
         build's stamp.
- [x] The restore drill from
      [Weekly restore check and restore runbook](39-restore-check-and-runbook.md)
      has passed.
- [x] The cutover from the spec, in order (the owner narrowed it; see Comments):
      1. Stop the self-hosted app on Markbox for good.
      2. Copy `Databases/`, `Presets/` and `Notes/` to the instance.
      3. Sign in and register the game server.
      4. Dry-run the import, read the report, then `--commit`.
      5. Set up Game.ini (`bAllowHttpRequests`, `[EZConfigPlatform]`).
      6. Review the Draft and Apply.
- [x] The owner's game server shows Connected and then Confirmed, and players
      see the delivery message.
- [x] Afterwards, the import script and its tests are deleted in their own
      commit.
- [x] The outcome is recorded under this ticket's Comments.

## Comments

2026-11-03, before the release order, with the owner's go-ahead (times UTC):
- 16:44: `main` at `c1da8be` (everything through #45's filing) deployed to
  modhau.com with `bun run deploy` in 56 s. It replaced `a347200`.
- Startup migrated `platform.db` from version 2 to 9 (`0003-invites` to
  `0009-rulesets`). The copy made before migrating is
  `platform.db.v2.2026-11-03T16-44-24.575Z.bak`.
- The app, Litestream, Caddy and the restore-check timer are active, and the
  app logged no errors.
- From outside:
  - `/` answers 200;
  - `/api/auth/session` and `/api/game-servers` answer 401 without a session;
  - a poll with no key answers 401;
  - `/internal/backup-heartbeat` answers 403.
- The releases kept are this one and two of `a347200`. Rolling back to
  `a347200` would also mean restoring the v2 copy, since that code predates
  migrations 0003 to 0009.
- Still to do: setting the Supported build waits for the mod build, which needs
  the built-in platform URL set and then publishing. The rest of the release
  order and the cutover are still to do.
- After the deploy, the owner signed in at modhau.com and checked the Invites
  page, the operator and owner pages from #27, and the Status page. All were
  correct. These were the first browser checks of those pages signed in with
  Discord.
- 17:30: `main` at `5c6158f` deployed in 51 s, with #44 (Blocked) and #45.
  There was no migration this time. The app, Litestream, Caddy and the timer
  are active, and the app logged no errors. `/` answers 200; the session API
  and a poll with no key answer 401. The releases kept are `5c6158f`,
  `c1da8be` and one of `a347200`.
- 20:43: `main` at `5fe3bc1` deployed in 72 s, with #47. There was no migration
  this time. The app, Litestream, Caddy and the timer are active, and the app
  logged no errors. `/` answers 200; the session API and a poll with no key
  answer 401. The releases kept are `5fe3bc1`, `5c6158f` and `c1da8be`. A first
  try minutes earlier stopped at the fetch: the owner had set the repo to
  private, and `release.sh` fetches it without credentials. It changed nothing
  on the instance, and the second try ran once the repo was public again.
- 21:44: `main` at `d04dfcb` deployed in 73 s, with #48, #49 and #46. There was no
  migration this time. The app, Litestream, Caddy and the timer are active, and
  the app logged no warnings or errors in the 5 minutes after it. `/` answers
  200; the session API, the game servers API and a poll with no key answer 401;
  `/internal/backup-heartbeat` answers 403. The releases kept are `d04dfcb`,
  `5fe3bc1` and `5c6158f`.

2026-11-03, the owner's import, with their go-ahead before each live step
(times UTC):
- The owner narrowed what comes over to their Rulesets and Notes. Without
  `Databases/` there is no Draft to fill, so the game server entry stayed: no
  delete and register again, no new Game server key, no `Game.ini` change and
  no restart. Its Draft and Live configuration are still those of the owner's
  test Apply. `Databases/` stays on Markbox, not imported.
- The self-hosted app on Markbox is stopped for good. The owner confirmed it,
  and Markbox showed no process, port 3000 listener, unit or cron entry for it.
  The newest data file was from 2026-11-02 22:01.
- `e078bee` changed the script for this. `--databases` and `--game-server`
  became optional, together. `--old-username` can repeat. `--note-author <old
  username>=<Discord id>` gives another server owner the Notes of that name, and
  the script refuses when that account has no record. No other code differed
  from `d04dfcb`, so that one file went into the release folder under a temporary
  name: no deploy and no restart.
- A rehearsal on a throwaway database, with a copy of the real data, passed its
  commit once one preset's 1,120-character description was out of the way (the
  limit is 500; it refused until then). The owner chose to import that preset
  with no description and to leave out a preset that held no values. Both edits
  were on the copies; the originals stay on Markbox.
- About 22:33:
  - the dry run passed on the instance;
  - a SQLite backup went beside the database as
    `platform.db.pre-import.2026-11-03T22-*.bak`, and its `integrity_check` is ok;
  - `--commit` wrote 7 Rulesets and 83 Notes. No values or Notes were dropped,
    none are on hidden keys, and the sanitizer changed no body.
- All 7 Rulesets are the owner's; they share them with the file export from #54.
  79 Notes went to the account of the other server owner the owner named, and
  the other 4, from the owner's test accounts on the self-hosted app, to the
  owner.
- After the commit, Drafts and Live configurations were unchanged and
  `integrity_check` and `foreign_key_check` were clean. The app and Litestream
  were active, with no warnings or errors logged.
- The owner checked the result on modhau.com and confirmed it.
- The game server: the platform holds its report of the Live configuration
  applied at 21:45:18, success with 7 values accepted, 5 changed and no unknown
  keys. Markbox's log has the delivery message, "EZConfig: received 7 values, 5
  changed", and the owner's player was connected. The mod sends it to chat when
  values changed; nobody here read the chat itself, so the log is the evidence.
- The temp copies and the temporary script are deleted from the PC and the
  instance. The script and its test are deleted in `e048886`.
- This ticket's Discord, release order and restore drill criteria are ticked from
  the records above and #39. The master copy of the settings is the owner's and
  was not checked here.

2026-11-03, 23:10 UTC: `main` at `217893e` deployed in 65 s, with #50, #51, #52, #54,
the one-step Game.ini block (`Mods=5696753`) and the import's removal. There was no
migration. The owner asked for it to go out before the check of `9f3df3a` reported, on
typecheck, 249 tests, lint at 5 and the build at this commit. A read-only count before
the deploy found no stored value that #54's stricter rules refuse. The app, Litestream,
Caddy and the timer are active, and the app logged no warnings or errors in the 5 minutes
after it. `/` answers 200; the session, game servers and Rulesets APIs, the Ruleset
import and a poll with no key answer 401; `/internal/backup-heartbeat` answers 403.
