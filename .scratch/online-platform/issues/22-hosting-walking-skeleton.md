# 22: Hosting walking skeleton on Lightsail

Status: in progress; waits on the owner for the instance's secrets and making the GitHub repo public
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
- [ ] The instance:
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
- [ ] Caddy:
      - gets and renews a Let's Encrypt certificate;
      - redirects HTTP to HTTPS and adds HSTS (one year, no preload);
      - proxies to the app with timeouts well above 50 s;
      - writes no access log;
      - refuses the heartbeat path from outside.
- [ ] systemd runs `bun --bun next start` as exactly one process, restarts it
      whenever it exits, and loads one root-only env file. journald keeps 30
      days and at most 2 GB, both set explicitly.
- [ ] A `deploy <commit>` script in the repo, run from the owner's PC over
      SSH, does the following on the instance:
      - fetches that commit from the public GitHub repo;
      - runs `bun install` and builds into a new release directory;
      - switches a `current` link and restarts the service.

      It keeps the last 3 releases.
- [ ] Proof: a 2-minute held POST to a temporary route is answered through
      Caddy and Next.js on Bun. The poll endpoint in
      [Register a game server and see it Connected](26-register-game-server-and-connect.md)
      replaces that route.
- [ ] Proof: Litestream, pinned to 0.5.x at 0.5.12 or later:
      - streams `DATABASE_PATH` to a Lightsail bucket with versioning on and
        14 days of point-in-time restore;
      - keeps its bucket key in its own root-only config;
      - has its `heartbeat-url` reach a localhost-only route in the app every
        minute, and the app records the time.
- [ ] `.env.example` lists every instance setting. The repo holds no
      instance's secrets or settings.
- [ ] The evidence (commands, timings, heartbeat log lines) is recorded under
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
