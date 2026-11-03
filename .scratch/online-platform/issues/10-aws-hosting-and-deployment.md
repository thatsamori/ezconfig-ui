# 10: How is V1 hosted and deployed on AWS?

Status: resolved
Type: grilling
Created: 2026-11-01
Blocked by: 03, 05, 07
Parent: [Map: EZConfig online platform](../map.md)

## Question

Pick the AWS compute (the database is settled as one SQLite file, no
cache), region, backups and a restore check, secrets handling, domain and
TLS, and how a change gets deployed. Compute must fit whether the platform
holds long-lived connections to game servers. Confirm or revise the
~$25/month soft ceiling against the priced setups.

## Context

- [What does each candidate AWS setup cost per month at V1 scale?](03-aws-stack-costs.md)
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
- [Where does each entity get stored?](07-entity-storage.md)
- [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md):
  the Supported build is a runtime setting the operator changes without a
  deploy. Settled by
  [Where does each entity get stored?](07-entity-storage.md): a stored platform
  setting.
- From [How do the platform and a game server talk?](05-platform-game-server-communication.md):
  game servers long-poll, so compute must hold one open HTTPS POST per
  connected server in a process that stays running (on Lambda every held
  second is billed, about $100/month at 20 servers). The hold must stay under
  the engine's 180 s `HttpTimeout` and under the idle timeout of anything in
  front (load balancer, CDN). Decide how the one instance holds polls and
  answers them when Apply makes a new Live configuration. The RCON service,
  automatic-sync responder and owner lock are removed, so nothing else runs in
  the background for delivery.
- From [Where does each entity get stored?](07-entity-storage.md): all data is
  one SQLite file at `DATABASE_PATH`, with no Redis and no database server.
  Decide how that file is backed up and restored (for example continuous
  copying to S3, or nightly consistent copies), how schema changes run on
  deploy, and whether the app runs on Node or Bun: tests run on Bun, which
  cannot load `node:sqlite`, so the SQLite driver follows that choice.
  Earlier Live configurations are kept, worst case about 2 GB a year.
- From [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  each open server page polls its game servers' status about every 2 s (no
  push to browsers). Apply is accepted only while the game server is
  Connected, so the instance must answer that from its held polls at request
  time.
- From [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  instance settings and secrets kept outside the repo: `OPERATOR_DISCORD_IDS`,
  and the Discord application's client id, client secret and redirect URL.
  The session cookie is `Secure`, so the platform is served over HTTPS only. A
  Content-Security-Policy backs up the sanitizing of Note HTML.

## Answer

Resolved 2026-11-02 by grilling the owner. No new terms. Facts checked while
grilling:
- The owner's AWS project uses the new AWS experience, which allows every
  service below. Its managed SCPs block none of them, and they also allow
  Route 53 domain registration. Sources, read 2026-11-02:
  [supported services](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html),
  [SCPs](https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html).
- Bun 1.3.14's `node:http` held a POST for 75 s and answered it. That was a
  bare server, not Next.js.

**Project, Region and cost.**
- The project's selected Region is us-east-2 (Ohio), taken from the CLI
  profile; the owner confirms it in AWS Settings. A project cannot use
  another Region. Ohio is about 100 ms from an EU host, well inside 5 s.
- The Paid plan: a Free-plan project closes after 6 months or when its
  credits run out.
- About $15 a month: Lightsail $12, snapshots under $1, the bucket $1, the
  Route 53 zone $0.50, and the domain at about $15 a year. The ~$25 soft
  ceiling is confirmed.
- A spend limit pauses the whole project when exceeded, which takes the
  platform down (game servers keep their last values). It is set around $40
  so a normal month never trips it, with an AWS Budgets alert at $20.

**Compute.** One Lightsail instance on the $12 bundle (2 GB RAM, 2 burstable
vCPUs, 60 GB SSD, 3 TB transfer, static IPv4 included), running Ubuntu 24.04
LTS.
- Firewall: 80 and 443 open; 22 only from the owner's IP (or Lightsail's
  browser SSH).
- Unattended security upgrades. When one needs a reboot, the box reboots at
  10:00 UTC, between EU and NA evenings.
- Daily automatic snapshots, 7 kept, for rebuilding the box.
- Rejected: Lightsail $7 (1 GB), which runs the app but cannot run
  `next build`. Also EC2 t4g.small, about $18 a month with compute free only
  until 2026-12-31; its instance role, Session Manager and Data Lifecycle
  Manager do not pay for the difference. What Lightsail costs instead: one
  stored key for backups, limited to one bucket.

**Domain and HTTPS.**
- One hostname serves both pages and polls. It is a subdomain of a domain
  bought for the platform, for example `platform.<domain>`, which leaves the
  bare domain free. It is the platform URL built into every mod build, so it
  is chosen to last. The name itself is picked at build time, before the
  mod's built-in URL is set.
- The domain is registered through Route 53 Domains in the project, with
  auto-renew and privacy protection on. The Route 53 hosted zone that
  registration creates ($0.50 a month) holds one A record to the static IP.
- Caddy on the box:
  - gets a Let's Encrypt certificate and renews it itself;
  - redirects HTTP to HTTPS and adds HSTS (one year, no preload);
  - proxies to the app on localhost, with timeouts well above the poll hold.
- The app sets the Content-Security-Policy with per-request nonces, in
  Next.js middleware. It allows `'self'` plus Discord avatars from
  `cdn.discordapp.com`, and blocks inline script that has no nonce, behind
  the Note sanitizer. It ships with the open-source core, and a test checks
  it.
- Rejected: ACM certificates. They need a load balancer (Lightsail's at $18,
  an ALB at about $24) or CloudFront. CloudFront's origin timeout (30 s by
  default, 60 s at most without a quota request) cuts held polls short, and
  it would cache nothing here.

**Runtime.** Bun everywhere. Production runs `bun --bun next start`, so tests,
development and production share one SQLite driver, `bun:sqlite`.
- All database access sits in one module, so a move to Node with an adapter
  over `node:sqlite` stays local.
- Risk accepted: Next.js documents Node as its runtime, and Bun running it is
  only Bun's claim. The first build slice proves a 2-minute held poll through
  Caddy and Next.js on Bun, on the box.
- Rejected: Node in production with `bun:sqlite` under tests, where the suite
  never touches the production driver.
- This settles the open choice in
  [ADR 0001](../../../docs/adr/0001-one-sqlite-file-for-platform-storage.md).

**Held polls.**
- Each poll is held for up to 50 s, then answered "no change".
  - That is about 1 M requests a month at 20 servers, nothing for one box.
  - 50 s stays under the 60 s idle cutoffs common on proxies and NAT at
    rented hosts.
  - A connection that dies silently is replaced within 50 s.
- Held polls live in one in-process registry keyed by game server, with the
  instance ids that superseding uses. Apply commits its transaction, then
  wakes that game server's held poll, which answers with the new Live
  configuration. The app runs as exactly one process.
- A restart (a deploy or a reboot) drops held polls. The mod retries after
  10 s, so a game server is Not connected for about 10 to 20 s, and Apply is
  refused meanwhile.

**Backups.**
- Litestream on the box streams every change to a Lightsail object storage
  bucket within about a second.
  - The bucket costs $1 a month for 5 GB, with a larger plan as Live
    configurations grow.
  - It keeps 14 days of point-in-time restore, with versioning on.
  - One bucket access key, limited to that bucket, is stored on the box.
- Why continuous: a restore that loses recent Applies rolls game servers
  back. Each one reports a Live configuration id the restored platform does
  not know, which counts as differing, so the platform re-sends its older
  configuration. Litestream shrinks that window to seconds.
- The daily Lightsail snapshots remain for rebuilding the whole box.
- Rejected: an hourly `VACUUM INTO` copy (up to an hour lost) and snapshots
  alone (up to a day lost).
- The first build slice proves Litestream against a Lightsail bucket.

**Restore check.**
- Weekly, a timer on the box restores the latest backup into a temp file,
  runs `PRAGMA integrity_check`, and compares row counts per table with the
  live database.
- The platform operator's page shows the last result ("Last restore check:
  passed, 3 days ago"). A failed check, or none in 8 days, shows a warning
  there.
- Before launch, and after any change to backups, a full drill:
  - build a fresh Lightsail box, restore from the bucket, start the app and
    sign in;
  - the steps are written as a runbook in `docs/`.

**Secrets and instance settings.**
- One env file, `/etc/ezconfig-platform/platform.env`, owned by root with
  mode 600 and loaded by the systemd unit. It holds the Discord client id,
  client secret and redirect URL, `OPERATOR_DISCORD_IDS`, `DATABASE_PATH`
  and the public URL. Litestream's bucket key is in Litestream's own config,
  also mode 600.
- The master copy lives in the owner's password manager, and a lost box is
  rebuilt from it. The repo holds only `.env.example`. Lightsail snapshots
  include the env file.
- Rejected: SSM Parameter Store and Secrets Manager. Without an instance
  role, reading them takes another stored AWS key, which protects nothing
  extra.

**Schema changes.**
- Migrations are numbered SQL files in the repo that only move forward.
- The app applies pending ones at startup, before serving anything, through
  the `instrumentation.ts` hook that runs today's parry migration. Each runs
  in a transaction, and `PRAGMA user_version` records the version.
- Before applying any, the app writes a `VACUUM INTO` copy beside the
  database, named by version, and keeps the last 3.
- The app refuses to start on a database newer than its code. Rolling back
  past a migration means deploying the previous release and restoring that
  copy.
- Tests run the same migrations on their temp databases.
- Rejected: a separate migrate step in the deploy script.

**Deploy.** The owner runs `deploy <commit>` from their PC.
1. Over SSH, the box fetches that commit from the public GitHub repo, which
   needs no credentials.
2. It runs `bun install` and builds into a new release directory while the
   old one keeps serving.
3. It switches a `current` link and restarts the systemd service, and the
   app migrates on start.

- The box keeps the last 3 releases. Rolling back means deploying an older
  commit.
- The owner deploys only commits pushed to `main` that passed typecheck and
  the suite locally. There is no CI.
- Rejected: GitHub Actions over SSH, which puts a key to the box in GitHub
  for one person's pushes. Also Docker, which brings a registry and a daemon
  onto a 2 GB box that runs one app.

**No staging.** Changes are tested locally:
- the suite on temp databases;
- local development;
- a Mordhau server in the Windows kit sandbox with
  `PlatformUrl=http://127.0.0.1:…` (plain http is allowed to loopback).

The Supported build gates what game servers receive. Rejected: a second $7
box with its own domain and Discord application.

**Knowing the platform is down.**
- systemd restarts the app whenever it exits.
- A Lightsail alarm emails the owner when the instance's status check fails.
- The $20 budget alert covers cost.
- No uptime monitoring outside AWS in V1.

**Graduated.**
[What does the platform record, and who can read it?](15-platform-records-and-logs.md),
from the map's Logs fog, now also covering the platform's own errors and
backup status.

**Handed on.**
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
  (resolved): the hold is 50 s, and a restart costs about 10 to 20 s Not
  connected. Noted on that ticket.
- [Where does each entity get stored?](07-entity-storage.md) (resolved) and
  ADR 0001: the app runs on Bun, so `bun:sqlite` is the one driver; schema
  changes run as above. Noted on both.
- [How does the owner's self-hosted data get onto the platform?](13-one-time-import.md):
  the import runs on the box, with Bun, against `DATABASE_PATH`; the old
  folders are copied there from the VPS.
- [What does the owner see of earlier Live configurations?](14-earlier-live-configurations.md):
  hosting does not limit keeping them in V1. The disk is 60 GB, and the
  bucket plan can grow.
- The spec's first build slice proves a 2-minute held poll through Caddy and
  Next.js on Bun, and Litestream against a Lightsail bucket.
