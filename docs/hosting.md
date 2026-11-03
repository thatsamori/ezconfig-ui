# Hosting the platform

One Lightsail instance (Ubuntu 24.04 LTS, the $12 bundle) in the project's
Region, us-east-2, serves the platform over HTTPS at two hostnames that reach
the same app: the public hostname, where people sign in (the host of
`PUBLIC_URL`), and the platform hostname, the URL built into the mod, which game
servers poll. The decisions
behind it are in `.scratch/online-platform/issues/10-aws-hosting-and-deployment.md`
and `15-platform-records-and-logs.md`; the spec's "Hosting and deployment" has
the summary. The restore check and the restore runbook are
`online-platform#39`.

## What runs on the instance

| What | On the instance | In the repo |
|---|---|---|
| The app: `bun --bun next start` on 127.0.0.1:3000, one process, restarted whenever it exits | `ezconfig-platform.service`, running `/srv/ezconfig-platform/current` | `deploy/ezconfig-platform.service` |
| Releases, the newest 3 | `/srv/ezconfig-platform/releases/<UTC time>-<commit>` | `deploy/release.sh` |
| The database (`DATABASE_PATH`), migrated at startup | `/var/lib/ezconfig-platform/platform.db` | `src/lib/platform/migrations/` |
| The app's settings | `/etc/ezconfig-platform/platform.env`, root 0600 | `.env.example` |
| Caddy: certificate, HTTP to HTTPS, HSTS, proxy, refuses `/internal/*` | `/etc/caddy/Caddyfile`; hostnames and email in `/etc/ezconfig-platform/caddy.env`, root 0600 | `deploy/Caddyfile`, `deploy/caddy.service.conf` |
| Litestream: streams the database to the bucket, calls the heartbeat every minute | `litestream.service`; config with the bucket key in `/etc/litestream.yml`, root 0600 | `deploy/litestream.service`, `deploy/litestream.yml.example` |
| The journal: 30 days, at most 2 GB | `/etc/systemd/journald.conf.d/ezconfig-platform.conf` | `deploy/journald.conf` |
| Security upgrades, rebooting at 10:00 UTC when needed | `/etc/apt/apt.conf.d/52ezconfig-platform` | `deploy/unattended-upgrades.conf` |

The three settings files are the only instance-specific files. Their master copy
is in the owner's password manager, and the repo holds only their templates.

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
   run again whenever a file in `deploy/` changes:

   ```bash
   scp -r deploy ezconfig-platform:ezconfig-deploy
   ssh ezconfig-platform sudo bash ezconfig-deploy/provision.sh
   ```

4. On the instance, fill the three settings files from `.env.example` and
   `deploy/litestream.yml.example` (`sudo nano <file>`), then provision again so
   Caddy and Litestream start. `PUBLIC_URL` is `https://<public hostname>`.
5. Deploy a commit (below).

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

## Checks

- A held POST is answered through Caddy and Next.js on Bun. The route is
  temporary, and the poll endpoint (`online-platform#26`) replaces it:

  ```bash
  curl -sS -X POST https://<platform hostname>/proof/held-post -H 'content-type: application/json' -d '{"holdSeconds":120}' -w '\n%{http_code} after %{time_total} s\n'
  ```

- The heartbeat path is refused from outside, with 403, at either hostname:

  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' https://<platform hostname>/internal/backup-heartbeat
  ```

- The heartbeat reaches the app. The app logs the first one since it started,
  and one after more than 5 minutes without:
  `journalctl -u ezconfig-platform -o cat | grep backup.heartbeat`.
  Litestream itself logs nothing per heartbeat. To watch them arrive, capture
  loopback traffic:
  `sudo tcpdump -i lo -l -nn -tttt -A 'tcp dst port 3000' | grep --line-buffered -E '^20|GET /internal/backup-heartbeat'`.
- Logs: `journalctl -u ezconfig-platform`, `journalctl -u litestream`,
  `journalctl -u caddy`.
