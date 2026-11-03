# 22: Hosting walking skeleton on Lightsail

Status: blocked; waits on the owner for AWS purchases, the domain and making the GitHub repo public
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
- [ ] The domain: registered through Route 53 Domains with auto-renew and
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
