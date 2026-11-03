# 42: Launch and cutover

Status: blocked; waits on the owner for the Discord application, the mod publish and the cutover
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

- [ ] A Discord application exists for the instance with the platform's
      redirect URL. The instance env file holds its client id and secret, the
      redirect URL, `OPERATOR_DISCORD_IDS`, `DATABASE_PATH` and the public
      URL, and the master copy is in the owner's password manager.
- [ ] Release order:
      1. The mod's built-in platform URL is set to the hostname from
         [Hosting walking skeleton](22-hosting-walking-skeleton.md), and that
         mod build is published.
      2. The platform is deployed and its Supported build set to that
         build's stamp.
- [ ] The restore drill from
      [Weekly restore check and restore runbook](39-restore-check-and-runbook.md)
      has passed.
- [ ] The cutover from the spec, in order:
      1. Stop the self-hosted app on Markbox for good.
      2. Copy `Databases/`, `Presets/` and `Notes/` to the instance.
      3. Sign in and register the game server.
      4. Dry-run the import, read the report, then `--commit`.
      5. Set up Game.ini (`bAllowHttpRequests`, `[EZConfigPlatform]`).
      6. Review the Draft and Apply.
- [ ] The owner's game server shows Connected and then Confirmed, and players
      see the delivery message.
- [ ] Afterwards, the import script and its tests are deleted in their own
      commit.
- [ ] The outcome is recorded under this ticket's Comments.

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
