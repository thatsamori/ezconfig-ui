# 22: Hosting walking skeleton on Lightsail

Status: in progress; everything is proven except the spend limit, which waits on the owner's confirmation in AWS Settings
Type: task
Created: 2026-11-02
Blocked by: 16
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The platform URL serves this app over HTTPS from one Lightsail instance,
deployed with `deploy <commit>`. The skeleton proves the hosting risks the
spec names before features pile on top:
- a held poll through Caddy and Next.js running on Bun;
- Litestream streaming the SQLite file to a Lightsail bucket, with its
  heartbeat reaching the app.

Human in the loop: the owner buys and confirms the AWS resources and the
domain, and decides when the GitHub repo becomes public. An agent can write
the deploy script, the unit and config files, and the proof route, and can
drive the box over SSH once the owner grants access.

## Acceptance criteria

- [ ] AWS project setup (done by the owner):
      - The selected Region is confirmed as us-east-2 in AWS Settings > View
        all projects > Overview > Additional Info > Region.
      - The project is on the Paid plan.
      - The spend limit is about $40, with an AWS Budgets alert at $20.
- [x] The instance:
      - Lightsail on the $12 bundle, Ubuntu 24.04 LTS, with a static IP.
      - Firewall: 80 and 443 open; 22 only from the owner's IP.
      - Unattended security upgrades, rebooting at 10:00 UTC when one needs
        it.
      - Daily snapshots, 7 kept.
      - A status-check alarm that emails the owner.
- [x] The domain: registered through Route 53 Domains with auto-renew and
      privacy protection on, and an A record for the platform hostname. The
      hostname is recorded under this ticket's Comments as the URL the mod
      will build in.
- [x] Caddy:
      - gets and renews a Let's Encrypt certificate;
      - redirects HTTP to HTTPS and adds HSTS (one year, no preload);
      - proxies to the app with timeouts well above 50 s;
      - writes no access log;
      - refuses the heartbeat path from outside.
- [x] systemd runs `bun --bun next start` as exactly one process, restarts it
      whenever it exits, and loads one root-only env file. journald keeps 30
      days and at most 2 GB, both set explicitly.
- [x] A `deploy <commit>` script in the repo, run from the owner's PC over
      SSH, does the following on the instance:
      - fetches that commit from the public GitHub repo;
      - runs `bun install` and builds into a new release directory;
      - switches a `current` link and restarts the service.

      It keeps the last 3 releases.
- [x] Proof: a 2-minute held POST to a temporary route is answered through
      Caddy and Next.js on Bun. The poll endpoint in
      [Register a game server and see it Connected](26-register-game-server-and-connect.md)
      replaces that route.
- [x] Proof: Litestream, pinned to 0.5.x at 0.5.12 or later:
      - streams `DATABASE_PATH` to a Lightsail bucket with versioning on and
        14 days of point-in-time restore;
      - keeps its bucket key in its own root-only config;
      - has its `heartbeat-url` reach a localhost-only route in the app every
        minute, and the app records the time.
- [x] `.env.example` lists every instance setting. The repo holds no
      instance's secrets or settings.
- [x] The evidence (commands, timings, heartbeat log lines) is recorded under
      this ticket's Comments.

## Comments

2026-11-03: The repo side is on branch `claude/op22-hosting-skeleton-b59978`
(not pushed). 169 tests pass, typecheck is clean, and lint is 24 (unchanged).

- Hostnames, decided by the owner: `https://platform.modhau.com` is the URL
  the mod builds in, which game servers poll. People sign in at
  `https://modhau.com` (`PUBLIC_URL`). Caddy serves both from the same app.
  This differs from the spec's one hostname for pages and polls
  ([research](10-aws-hosting-and-deployment.md)). The dashboard can move to
  another domain later without a mod build, as long as modhau.com stays
  registered.
- AWS, read back through the Lightsail, Route 53, Route 53 Domains, Budgets
  and Free Tier APIs:
  - The project is on the Paid plan, in us-east-2 (confirmed by the owner in
    AWS Settings). The spend limit is set in AWS Settings, which the API does
    not show; the owner confirms it.
  - Budget `ezconfig-platform-monthly`: $20 a month. It emails the owner when
    the actual cost passes 100%, counted before credits.
  - Instance: the $12 bundle (`small_3_0`), Ubuntu 24.04, us-east-2a, with a
    static IP. Firewall: 80 and 443 from anywhere; 22 only from the owner's IP
    and Lightsail's browser SSH. IMDSv2 required. Automatic snapshots daily at
    11:00 UTC; Lightsail keeps 7.
  - Alarm `ezconfig-platform-status-check`: `StatusCheckFailed` at least 1 in
    one period. It emails the owner on ALARM and on OK, once the owner has
    verified the email contact.
  - Bucket: the $1 plan (5 GB), private, versioning on. The owner creates its
    access key; the key lives only in `/etc/litestream.yml` and the owner's
    password manager.
  - Domain: modhau.com, registered through Route 53 Domains, auto-renew on,
    privacy protection on for every contact. A records for both hostnames
    point to the static IP.
- First `provision.sh` run: 40 s.
  - Caddy 2.11.7 from its apt repository; Bun 1.3.14 and Litestream 0.5.17,
    each `OK` against its release checksums.
  - UTC clock, 2 GB swap.
  - journald `SystemMaxUse=2G` and `MaxRetentionSec=30day`.
  - Unattended upgrades, with `Automatic-Reboot-Time "10:00"`.
  - Caddy, Litestream and the app are enabled and stay stopped until their
    settings are filled.
  - With both hostnames set, `caddy adapt` shows one server on `:443` for
    both hosts, the timeouts (10 s header, 30 s body, 180 s write, 5 min
    idle) and no access log. `caddy validate` passes.
- Caddy, started 2026-11-03 05:30 UTC with the settings filled (before the
  first deploy, so the app answers 502):
  - `certificate obtained successfully` for `modhau.com` and
    `platform.modhau.com`, from Let's Encrypt (YE2), valid to 2027-02-01.
  - From outside, on both hostnames: `http://` answers 308 to `https://`;
    `https://` carries `Strict-Transport-Security: max-age=31536000`;
    `/internal/backup-heartbeat` answers 403.
  - Within a minute, scanners requested both hostnames. Caddy's error line
    for each failed proxy carried the client's IP, headers and URI, which the
    spec's logs must not hold. The Caddyfile's default logger now deletes
    those fields: after a reload, a request to
    `/proof/held-post?code=SHOULD-NOT-BE-LOGGED` left a line with only the
    method, host, TLS details and status. The 43 earlier lines age out with
    the 30-day journal.

2026-11-03, the deploy and the proofs (times UTC):

- The GitHub repo is public and is now `thatsamori/ezconfig-ui` (renamed from
  `amorijs/mordhau-ezconfig`, which redirects). `deploy/release.sh` fetches
  from the new name.
- This branch was merged into `main` at `a347200` and pushed, after a scan of
  the new commits found no secrets, addresses or user data. On the merge:
  typecheck clean, 180 tests pass, lint 20 problems (24 on this branch before
  `main`'s own changes came in).
- First `bun run deploy a347200` from the PC: 52 s. Fetch 0 s, install 3 s,
  build 44 s, then the switch and a 200 from the app at 50 s. Startup migrated
  the database from version 0 to 2 and kept a `.bak` copy; it runs in WAL mode.
- One process: `bun --bun next start` started Next as a child of the `next`
  bin's launcher, two processes in the unit. The unit now runs Next's entry
  file, `bun --bun node_modules/next/dist/bin/next start`, and its cgroup holds
  one process.
- Held POST, from the PC, at 05:46:09:
  `curl -X POST https://platform.modhau.com/proof/held-post -H 'content-type: application/json' -d '{"holdSeconds":120}'`
  answered `{"heldMs":120002,"runtime":"bun 1.3.14"}`, HTTP 200 after 120.3 s.
- Restart on exit: `systemctl kill -s KILL ezconfig-platform` at 05:50:40.
  systemd logged `Main process exited, code=killed, status=9/KILL` and
  `Scheduled restart job, restart counter is at 1`. The app answered 200
  3.5 s after the kill, still one process, with `NRestarts=1`.
- Releases: three more deploys of `a347200`, 50, 47 and 53 s. Then
  `/srv/ezconfig-platform/releases` held exactly three folders
  (`20261103T055101Z`, `055153Z`, `055241Z`, each `-a347200861bd`), the first
  release was gone, and `current` pointed to the newest.
- Litestream 0.5.17, from its journal (bucket name left out), 05:44:37 onward:
  `initialized db` for `/var/lib/ezconfig-platform/platform.db`;
  `replicating to` type `s3`, path `platform.db`, region `us-east-2`,
  sync interval 1 s; `snapshot complete` txid 1, 1327 bytes, at 05:44:38;
  then level 1 and 2 compactions. Every line is INFO, none an error or warning.
  The bucket holds 8 LTX files under `platform.db/` (levels 0, 1, 2 and 9) as
  8 object versions, with no delete markers. Snapshots: every 24 h, kept 336 h
  (14 days). The bucket key is only in `/etc/litestream.yml` (root 0600),
  which the service reads through `LoadCredential`.
- Heartbeat. The app logs the first one after each start:
  `{"time":"2026-11-03T05:44:52.231Z","level":"info","event":"backup.heartbeat.first"}`,
  and again at 05:45:53 and 05:53:38 after restarts. Litestream logs no line
  per call, so a loopback capture (`docs/hosting.md`) timed them:
  05:46:53.17, 05:48:08.17, 05:49:23.17.
  - The calls come every 75 s, not every 60. Litestream 0.5.17 refuses a
    `heartbeat-interval` under 1 minute and checks every 15 s; it records each
    call's time just after a check, so the check a minute later falls a hair
    short and the call goes at the next one. 75 s is the fastest it calls. The
    operator page warns after 5 minutes without one, so this changes nothing
    there; the docs and comments now say 75 s.
- After the deploys, both hostnames answer 200 from outside and 403 on
  `/internal/backup-heartbeat`; Caddy, Litestream and the app are active.
- The alarm's email contact is verified, and the alarm is OK.
- Still open: the spend limit (about $40) is set in AWS Settings, which no API
  shows. The owner confirms it, and this ticket is then completed.
