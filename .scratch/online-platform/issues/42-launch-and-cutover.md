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
