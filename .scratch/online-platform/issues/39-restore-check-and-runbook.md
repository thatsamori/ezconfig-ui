# 39: Weekly restore check and restore runbook

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 38
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The instance checks its own backups every week and the operator's page shows
the result. The owner can rebuild the platform from the bucket by following a
written runbook, and has done so once before launch.

Human in the loop: the drill creates and removes a Lightsail instance in the
owner's project. An agent can write the timer, the check script and the
runbook.

## Acceptance criteria

- [x] A weekly systemd timer on the instance:
      - restores the latest Litestream backup into a temp file;
      - runs `PRAGMA integrity_check`;
      - compares row counts per table with the live database;
      - writes the result (time, passed or failed, reason) to the status file
        beside the database, never into it.
- [x] The operator's page shows the timer's result.
- [x] `docs/` holds:
      - a restore runbook: build a fresh instance, restore from the bucket,
        start the app and sign in;
      - a deployment and instance setup doc covering the env file, Caddy,
        systemd, journald, Litestream and the deploy script.
- [x] The restore drill is run once, end to end, on a fresh Lightsail
      instance. The result is recorded under this ticket's Comments, and the
      drill instance is removed afterwards with the owner's go-ahead.
- [x] `AGENTS.md`'s docs index lists the new docs.

## Comments

2026-11-03: The repo side is on branch `claude/op39-restore-check-c32150` (not
pushed), on top of `main` at `160e0eb`. 210 tests pass (199 + 11), typecheck
is clean, and lint is 13 (unchanged).

- The check is `deploy/restore-check.ts`: a standalone Bun file with no app
  imports, installed by `provision.sh` in `/usr/local/lib/ezconfig-platform`.
  `ezconfig-restore-check.timer` runs it Sundays at 04:00 UTC as the app user.
  The bucket key reaches it as a systemd credential, and the unit skips itself
  while `/etc/litestream.yml` is empty. Row counts that differ are restored
  again, up to 3 times and 20 s apart; a failed restore or integrity check is
  not retried. `tests/restore-check.test.ts` runs it against a migrated
  database with fake restores, and reads what it writes back through the
  Status page's own reader.
- Litestream 0.5.17 keeps two tables of its own in the database,
  `_litestream_lock` and `_litestream_seq`; the counts include them.
- Docs: `docs/restore-runbook.md` (new), and `docs/hosting.md` gains the
  settings files, the restore check and its failure reasons. Copying `deploy`
  again with `scp -r` into an existing `ezconfig-deploy` nests the new copy as
  `ezconfig-deploy/deploy`, so the old files would run. The setup steps now
  remove the old copy first (seen on the drill instance).

2026-11-03, on modhau.com, with the owner's go-ahead (times UTC):

- About 07:59: `provision.sh` run again from this branch's `deploy/`. Nothing
  was upgraded. Caddy, Litestream and the app restarted, and all three were
  active after. `systemd-analyze verify` passes on both units. The timer's
  next run is Sun 2026-11-08 04:00 UTC.
- 08:00:24: the first check, by hand, passed in 0.74 s:
  `Restored the latest backup: integrity_check ok, and all 4 tables (1 rows)
  have the live database's row counts`. `platform.db` and `platform.db-wal`
  kept their 05:45 times, and no temp folder was left.
- 08:25: the script, with "1 row" in place of "1 rows", was copied over the
  installed one. It ran again and passed at 08:25:35. The app's
  `readRestoreCheck` reads that file as `passed`.
- Live runs `a347200`, which predates the Status page (#38). The page shows
  this result once a commit containing #38 is pushed and deployed. Until this
  branch is merged, the instance's `deploy/` files are this branch's.

2026-11-03, the restore drill, following `docs/restore-runbook.md` "The
drill" (times UTC):

- About 08:01: Lightsail instance `ezconfig-platform-drill` created:
  us-east-2a, Ubuntu 24.04, `small_3_0`, dual stack. Firewall as live (80
  and 443 from anywhere on IPv4 and IPv6; 22 from the owner's IP and
  Lightsail's browser SSH), IMDSv2 required. A records (TTL 60):
  `drill.modhau.com` and `drill-platform.modhau.com`. The owner added
  `https://drill.modhau.com/api/auth/discord/callback` to the Discord
  application's Redirects.
- 08:02:58: provisioned in 54 s. Bun and Litestream checked `OK` against
  their checksums; nothing started.
- Settings copied from live over SSH, never printed: `platform.env` with
  `PUBLIC_URL=https://drill.modhau.com`, and `caddy.env` with the drill
  hostnames. `/etc/litestream.yml` was left empty. The restore config was a
  root-only `/root/restore.yml`.
- 08:04:38: `litestream restore` exited 0 in 0.63 s, and `/root/restore.yml`
  was removed right after. `integrity_check` ok; `user_version` 2; counts
  equal to live: users 0, sessions 0, `_litestream_seq` 1,
  `_litestream_lock` 0. The runbook's `chown …/platform.db*` failed: the
  ubuntu user's shell cannot list the 0750 folder to expand the glob. The
  runbook now names the one file.
- Provisioned again in 4 s. Caddy got certificates for both drill hostnames
  within about 6 s; Litestream stayed inactive.
- `DEPLOY_SSH_HOST=ezconfig-drill bun run deploy a347200`, the commit live
  runs: 50 s, and the app answered 200. From outside, both hostnames answered
  200 over HTTPS, `/internal/backup-heartbeat` 403, and `http://` 308.
- 08:24:39: the owner signed in with Discord at `https://drill.modhau.com`.
  The app logged `sign-in`, and the restored database then held 1 server
  owner and 1 session, `integrity_check` ok.
- On the drill, `systemctl start ezconfig-restore-check` was skipped by its
  condition (`/etc/litestream.yml` empty) and wrote no status file.
- About 08:27, with the owner's go-ahead: the drill instance was deleted (it
  had no snapshots), both A records were deleted, and the temporary SSH alias
  was removed. Live and its two A records were untouched throughout. The
  owner removes the Discord redirect.
- Not covered, as the runbook says: Litestream continuing the live backup
  from a restored database (only possible once the old instance stops
  streaming; the restore check after a real restore is the proof), moving
  the static IP, adding the alarm again, and a point-in-time restore.
