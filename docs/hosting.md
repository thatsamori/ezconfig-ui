# Hosting the platform

One Lightsail instance (Ubuntu 24.04 LTS, the $12 bundle) in the project's
Region, us-east-2, serves the platform over HTTPS at two hostnames that reach
the same app: the public hostname, where people sign in (the host of
`PUBLIC_URL`), and the platform hostname, the URL built into the mod, which game
servers poll. The decisions
behind it are in `.scratch/online-platform/issues/10-aws-hosting-and-deployment.md`
and `15-platform-records-and-logs.md`; the spec's "Hosting and deployment" has
the summary. Rebuilding the platform from its backup is
[restore-runbook.md](restore-runbook.md).

## What runs on the instance

| What | On the instance | In the repo |
|---|---|---|
| The app: `next start` on Bun (`bun --bun node_modules/next/dist/bin/next start`) on 127.0.0.1:3000, one process, restarted whenever it exits | `ezconfig-platform.service`, running `/srv/ezconfig-platform/current` | `deploy/ezconfig-platform.service` |
| Releases, the newest 3 | `/srv/ezconfig-platform/releases/<UTC time>-<commit>` | `deploy/release.sh` |
| The database (`DATABASE_PATH`), migrated at startup | `/var/lib/ezconfig-platform/platform.db` | `src/lib/platform/migrations/` |
| The restore check (below): weekly, restores the latest backup and checks it against the database | `ezconfig-restore-check.timer` and `.service`, running `/usr/local/lib/ezconfig-platform/restore-check.ts` | `deploy/ezconfig-restore-check.*`, `deploy/restore-check.ts` |
| The restore check's status file, beside the database (below) | `/var/lib/ezconfig-platform/platform.db.restore-check.json` | written by `deploy/restore-check.ts`, read by `src/lib/platform/restore-check.ts` |
| The app's settings | `/etc/ezconfig-platform/platform.env`, root 0600 | `.env.example` |
| Caddy: certificate, HTTP to HTTPS, HSTS, proxy, refuses `/internal/*` | `/etc/caddy/Caddyfile`; hostnames and email in `/etc/ezconfig-platform/caddy.env`, root 0600 | `deploy/Caddyfile`, `deploy/caddy.service.conf` |
| Litestream: streams the database to the bucket, calls the heartbeat every 75 s | `litestream.service`; config with the bucket key in `/etc/litestream.yml`, root 0600 | `deploy/litestream.service`, `deploy/litestream.yml.example` |
| The journal: 30 days, at most 2 GB | `/etc/systemd/journald.conf.d/ezconfig-platform.conf` | `deploy/journald.conf` |
| Security upgrades, rebooting at 10:00 UTC when needed | `/etc/apt/apt.conf.d/52ezconfig-platform` | `deploy/unattended-upgrades.conf` |

The three settings files are the only instance-specific files. Their master copy
is in the owner's password manager, and the repo holds only their templates.

### The settings files

| File | Read by | Settings |
|---|---|---|
| `/etc/ezconfig-platform/platform.env` | `ezconfig-platform.service` (`EnvironmentFile=`), before it switches to the app's user | `DATABASE_PATH=/var/lib/ezconfig-platform/platform.db`; `PUBLIC_URL=https://<public hostname>`; `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`; `OPERATOR_DISCORD_IDS`. `DISCORD_REDIRECT_URL` only to override `PUBLIC_URL` + `/api/auth/discord/callback`, which must be in the Discord application's Redirects. `.env.example` describes each. The unit sets `NODE_ENV` and `NEXT_TELEMETRY_DISABLED` itself. |
| `/etc/ezconfig-platform/caddy.env` | `caddy.service`, through the drop-in `deploy/caddy.service.conf` | `PUBLIC_HOSTNAME` (the host of `PUBLIC_URL`), `PLATFORM_HOSTNAME` (the URL built into the mod; it must differ from `PUBLIC_HOSTNAME`), and `ACME_EMAIL` for Let's Encrypt. |
| `/etc/litestream.yml` | `litestream.service` and `ezconfig-restore-check.service`, each through a private copy (`LoadCredential=`) | The bucket, its Region and its access key: `deploy/litestream.yml.example`, with the placeholders filled. |

Each is root 0600 and stays so: `provision.sh` creates them empty when missing
and resets their owner and mode on every run, but never writes into them.
Caddy, Litestream and the restore check do not start while their file is
empty. Edit one with `sudo nano <file>`,
then restart what reads it (`sudo systemctl restart ezconfig-platform`, `caddy`
or `litestream`), or provision again. Never print one into a terminal you share
or a log.

## Setting up an instance

1. In AWS, the owner sets up the project and resources the
   [hosting ticket](../.scratch/online-platform/issues/22-hosting-walking-skeleton.md)
   lists: the Paid plan, the spend limit and budget, the instance with its
   static IP, firewall, snapshots and alarm, the bucket with its access key,
   and the domain with an A record for each hostname.
2. On the PC, add an SSH alias to `~/.ssh/config`:

   ```
   Host ezconfig-platform
     HostName <the static IP>
     User ubuntu
     IdentityFile ~/.ssh/<the instance's key>
   ```

3. Copy this folder over and provision from the repo root. Provisioning can be
   run again whenever a file in `deploy/` changes. It restarts Caddy,
   Litestream and the app, so game servers are Not connected for about 10 to
   20 s. Remove the old copy first: `scp -r` into a folder that exists copies
   `deploy` inside it, and the old files would run.

   ```bash
   ssh ezconfig-platform rm -rf ezconfig-deploy
   scp -r deploy ezconfig-platform:ezconfig-deploy
   ssh ezconfig-platform sudo bash ezconfig-deploy/provision.sh
   ```

4. On the instance, fill the three settings files (above) from `.env.example`
   and `deploy/litestream.yml.example` (`sudo nano <file>`), then provision
   again so Caddy and Litestream start. On an instance replacing one whose
   backup is in the bucket, restore the database before Litestream starts:
   that order is in [restore-runbook.md](restore-runbook.md).
5. Deploy a commit (below).
6. Run the restore check once, so the Status page has a result before the
   first Sunday (below): `ssh ezconfig-platform sudo systemctl start ezconfig-restore-check`.

## Deploying

```bash
bun run deploy <commit>
```

The commit must be on `main` on GitHub, which is public: the instance fetches it
from there. Deploy only commits that passed `bun run typecheck` and the suite
locally. Over SSH as root, `deploy/release.sh`:

1. fetches the commit into a new release folder;
2. runs `bun install --frozen-lockfile` and `bun --bun next build` as the app
   user, while the current release keeps serving;
3. switches `current`, restarts the app, and waits for it to answer (startup
   migrates the database first);
4. keeps the newest 3 releases.

A release that fails before the switch is removed. Rolling back means deploying
an older commit. A restart drops held polls, so game servers are Not connected
for about 10 to 20 s. The SSH host defaults to the `ezconfig-platform` alias;
`DEPLOY_SSH_HOST` overrides it.

### The release commit

The operator's Status page shows the commit the app runs, with no setting
for it. Each release folder is a git checkout of its commit with a detached
HEAD (release.sh checks that `git rev-parse HEAD` is the commit), and the
service runs in that folder. So the app reads the full commit id from
`.git/HEAD` in its working directory (`readReleaseCommit` in
`src/lib/platform/status.ts`). Anywhere else, such as a checkout on a branch,
the page shows it as unknown. Keep releases as checkouts at their commit, or
this goes with them.

## The operator's Status page

The Status tab, for the platform operator only, is computed when it loads
(`GET /api/operator/status`, `src/lib/platform/status.ts`):

- game servers registered, Connected now, and Connected by the build stamp
  they reported, with the Supported build marked. It names no game server or
  owner;
- activity, as counts that name no game server or owner:
  - server owners, and those seen in the last 24 h and the last 7 days, by the
    latest last seen of their sessions. The operator counts, and is seen by
    opening the page. Last seen is written at most once an hour and goes when a
    session ends, so these can run low: a server owner who signed out reads as
    not seen. Each one's last seen is on the Server owners tab, from the same
    place;
  - Live configurations by state (Pending, Blocked, Confirmed, Failed), and game
    servers with none yet. State is computed for each one when the page loads,
    never stored;
  - game servers Applied in the last 24 h and the last 7 days. A game server
    keeps only its latest Apply, so this counts game servers, not Applies;
- the release commit, running since, and the warnings and errors logged since
  start with the newest 20;
- "Backup: last confirmed 40 s ago", from Litestream's heartbeat. It warns
  after 5 minutes without one, or 5 minutes after start with none yet;
- the last restore check from its status file (below). It warns when the
  check failed, is more than 8 days old, has never run, or the file cannot be
  read.

The health and the heartbeat are kept in process memory, so a restart clears
them.

### The restore check's status file

The weekly restore check (below) records its result in a file
beside the database, never in the database itself: `DATABASE_PATH` plus
`.restore-check.json`, so `/var/lib/ezconfig-platform/platform.db.restore-check.json`
on the instance. The app reads it whenever the Status page loads
(`src/lib/platform/restore-check.ts`); it never writes it.

It is one JSON object:

```json
{"checkedAt":"2026-11-08T04:00:12Z","result":"passed","reason":"Restored to 04:00:05; integrity_check ok"}
```

| Field | |
|---|---|
| `checkedAt` | When the check finished: ISO 8601 with `Z` or an offset, such as `date -u +%Y-%m-%dT%H:%M:%SZ` prints. |
| `result` | `"passed"` or `"failed"`. |
| `reason` | Optional text the page shows under the result: why it failed, or a note on a pass. The page shows at most 500 characters. Never put a secret here, such as the bucket key. |

Any other field is ignored. Write the whole file after every run, pass or
fail: write a temp file in the same folder, then rename it over this one, so
the app never reads half a file. The app's user (`ezconfig`) must be able to
read it. On the page:

- no file reads as never checked, with a warning;
- `failed` warns, however recent;
- `passed` warns once `checkedAt` is more than 8 days old;
- a file that is not this shape reads as unreadable, with a warning, and
  never as passed.

## The restore check

Every Sunday at 04:00 UTC, `ezconfig-restore-check.timer` starts
`ezconfig-restore-check.service`. It runs `deploy/restore-check.ts`, which
`provision.sh` installs in `/usr/local/lib/ezconfig-platform`, on Bun as the
app's user. It imports nothing from the app, so it does not change with a
deploy; provisioning installs a new version. The check:

1. restores the latest backup from the bucket (`litestream restore`) into a
   folder in the unit's private `/tmp`;
2. runs `PRAGMA integrity_check` on the restored copy;
3. compares the copy's row count for each table with the live database, which
   it opens read-only. A write that lands during the check can make a count
   differ, so it restores again, up to 3 times and 20 s apart, before it
   fails;
4. writes the result to the status file (above), then removes its folder.

It never writes the database. It reads the bucket key from systemd's private
copy of `/etc/litestream.yml`, as Litestream does, and stays idle until that
file is filled. A run missed while the instance was off happens soon after it
starts again.

- Run it now: `sudo systemctl start ezconfig-restore-check` waits for the
  result and exits non-zero when the check fails. On the database at launch
  it takes under a second.
- The next run: `systemctl list-timers ezconfig-restore-check.timer`.
- Its log: `journalctl -u ezconfig-restore-check` holds one JSON line,
  `restore-check.passed` or `restore-check.failed`, with the reason;
  `restore-check.retry` comes before each extra restore. Anything
  `litestream restore` prints comes before them; it prints nothing when it
  succeeds.
- The row counts include Litestream's own two tables, `_litestream_lock` and
  `_litestream_seq`.
- The last result: the Status page, or
  `sudo cat /var/lib/ezconfig-platform/platform.db.restore-check.json`.

The reason names the step that failed:

| The reason starts | What to look at |
|---|---|
| Litestream could not restore the latest backup | Litestream's error above it in the check's journal: the bucket, its key, the network. `journalctl -u litestream` shows whether streaming still works. |
| The restored copy could not be read as a database, or integrity_check found problems | The backup is damaged. Run the check again. If it fails again, check the live database too: `sudo -u ezconfig sqlite3 -readonly /var/lib/ezconfig-platform/platform.db 'PRAGMA integrity_check'`. |
| Row counts still differed from the live database | Either writes landed during all 3 restores, or the bucket is behind the database. Run it again; if it repeats, look for errors in `journalctl -u litestream`. |
| There is no live database | `DATABASE_PATH` in the unit, and whether the database is still in `/var/lib/ezconfig-platform`. |

If the status file cannot be written, the check logs
`restore-check.unrecorded` with the result and exits 2; the Status page then
keeps showing the previous result until it is 8 days old.

## Checks

- A held poll is answered through Caddy and Next.js on Bun. Register a game
  server on the Game servers tab and use its key. The poll is held for 50 s,
  then answered `200` with `{"answer":"no-change"}` (`docs/poll-exchange.md`):

  ```bash
  curl -sS -X POST https://<platform hostname>/game-server/poll -H 'Authorization: Bearer <game server key>' -H 'content-type: application/json' -d '{"buildStamp":"20261102-120000","instanceId":"hosting-check"}' -w '\n%{http_code} after %{time_total} s\n'
  ```

- The heartbeat path is refused from outside, with 403, at either hostname:

  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' https://<platform hostname>/internal/backup-heartbeat
  ```

- The heartbeat reaches the app. The app logs the first one since it started,
  and one after more than 5 minutes without:
  `journalctl -u ezconfig-platform -o cat | grep backup.heartbeat`.
  Litestream itself logs nothing per heartbeat. To watch them arrive, capture
  loopback traffic, which prints the time of each one:

  ```bash
  sudo tcpdump -i lo -l -nn -tttt -A 'tcp dst port 3000' | awk '/^20[0-9][0-9]-/{t=$1" "$2} /GET \/internal\/backup-heartbeat/{print t; fflush()}'
  ```
- Logs: `journalctl -u ezconfig-platform`, `journalctl -u litestream`,
  `journalctl -u caddy`.
