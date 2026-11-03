# Map: EZConfig online platform

Status: open
Type: wayfinder map
Created: 2026-11-01

## Destination

A handoff-ready V1 spec at `.scratch/online-platform/spec.md` for a hosted,
invite-only platform where a server owner signs in with Discord, registers their
game servers, edits each server's live EZConfig configuration and keeps
versioned Rulesets. Every decision the build depends on is made; the spec is
ready to slice into implementation tickets. This map builds nothing.

## Notes

- Domain: this repo (`ezconfig-ui`) becomes the hosted multi-tenant platform
  in place, plus whatever mod changes the chosen communication path needs.
  Platform glossary: [CONTEXT.md](../../CONTEXT.md); config-contract terms are
  in the mod's `CONTEXT.md`.
- Where things live: this map moved here from the mod repo on 2026-11-01
  (mod commit `cd634c6`). Paths written as "mod `...`" are in the EZConfig mod
  repo (`C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig`);
  other paths are in this repo. Editor work for a ticket runs in the mod repo
  and keeps its evidence in mod `.scratch/online-platform/`.
- Requirements fixed while charting (2026-11-01):
  - Invite-only V1; data is still kept per account from day one.
  - Owner-only: one Discord account owns a game server; nobody else edits it.
  - EZConfig only. Its key set keeps growing as the mod gains features.
  - Hosted only. The self-hosted mode (`.env` RCON target, `users.json`,
    `Databases/` files) goes away.
  - Game servers run on rented hosting: control panel, FTP and RCON, no helper
    process beside the game.
  - Discord is the only login; sessions are stored server-side.
  - AWS (the owner's account). About $25/month is a soft ceiling, confirmed in
    the hosting ticket.
  - One instance plus backups, no high availability. While the platform is
    down, servers keep their last applied values (the mod's saved snapshot
    already survives map changes and restarts).
  - A change reaches a connected server within about 5 s of becoming live.
  - V1 may require a minimum EZConfig build.
  - Storage is chosen on fit; learning a technology is not a requirement.
  - A stale save is rejected; no live collaborative editing.
  - The owner's own self-hosted data gets a one-time import.
- Open source (2026-11-02, while resolving
  [How do the platform and a game server talk?](issues/05-platform-game-server-communication.md)):
  the platform's core will be open source. V1 is still the one instance the
  owner runs. Other instances are possible but unsupported: nothing is built
  for them beyond the mod's Game.ini platform URL. The repo holds no
  instance's secrets or settings.
- Skills: grilling tickets call `grilling` and `domain-modeling`; research
  tickets call `research`. Research tickets never run the editor, `uexec.py`,
  the harness or builders.
- Research findings live in [research/](research/), linked from each ticket.
  No research branches are pushed: both repos have unpushed history.
- When no tickets remain, assemble `spec.md` from the resolved tickets.

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->

- [Can a server mod built only from Blueprints make outbound HTTP requests?](issues/01-blueprint-outbound-http.md):
  yes, through Mordhau's own "Mordhau Http Request" node (JSON in and out),
  compiled into both shipping dedicated servers. It only works when the owner
  sets `bAllowHttpRequests=True` in Game.ini. Found in the binaries, not yet
  run; proving it is
  [Does the Mordhau Http Request node work on a cooked dedicated server?](issues/11-prove-mordhau-http-request.md).

- [Can a hosted platform use Mordhau RCON, and what do rented Mordhau hosts expose?](issues/02-rcon-and-rented-hosts.md):
  RCON reaches rented servers across the internet, but it is plaintext, full
  admin and cannot be limited by IP. One connection stays alive with `alive`
  inside 120 s, and `listen` toggles. Packets are capped at 4 KB by default.
  Owners can edit Game.ini and add mod.io mods; no host runs extra processes.
- [What does each candidate AWS setup cost per month at V1 scale?](issues/03-aws-stack-costs.md):
  one Lightsail box running app, Postgres and Valkey is about $12/month and
  holds RCON; EC2 plus DynamoDB about $12; Lambda plus DynamoDB $4 to $11 but
  only if servers poll. Managed Postgres (RDS) alone pushes past $25.
- [How does a server's live configuration relate to Rulesets?](issues/04-live-configuration-and-rulesets.md):
  each game server has an auto-saved Draft, and an explicit Apply (after a
  review) makes the whole Draft its Live configuration, Pending until the
  server confirms it. Ruleset versions are copied into a Draft and saved out
  of one, never referenced, and both configurations remember their origin
  version. Notes are global comments per config key.
- [How do Ruleset versions stay usable as the key contract changes?](issues/06-ruleset-versions-and-key-contract.md):
  without a key contract. Values are matched by key name, so category moves
  are free; values for keys that no longer exist are dropped on load; versions
  are never rewritten. The platform sends nothing to a game server unless it
  runs the one Supported build, a stamp the operator sets without a deploy.
- [Does the Mordhau Http Request node work on a cooked dedicated server?](issues/11-prove-mordhau-http-request.md):
  yes on the Windows server, but only with POST (a GET never sends the body
  it declares). Failures end in a callback without crashing and frame time is
  flat. A request can be held open for up to 180 s, so long polling works.
  Only a node's newest request survives GC, so the mod keeps one in flight.
  Linux was not run.
- [How do the platform and a game server talk?](issues/05-platform-game-server-communication.md):
  the mod long-polls the platform over HTTPS POST with a per-server Game
  server key; the platform never uses RCON. Each poll reports the build stamp
  and the last processed configuration, and gets the whole Live configuration
  only when it differs. Processing stays today's batch; the next poll's result
  confirms it. The URL is built in and overridable in Game.ini.
- [Where does each entity get stored?](issues/07-entity-storage.md):
  one SQLite file for everything, no Redis or DynamoDB. Each configuration is
  one JSON document of overrides. Every Live configuration is kept, with a
  random id, and a game server has none until its first Apply. The Supported
  build is a stored setting.
- [What happens between a live change and the server confirming it?](issues/08-live-change-to-confirmed.md):
  a Live configuration is Pending, then Confirmed or Failed, computed from the
  server's last report. Apply needs the server Connected on the Supported
  build, and a no-change Apply re-sends. An interrupted delivery or a build
  change gets the whole configuration again. Every Draft write and Apply
  carries the revision it saw, and a stale one is rejected.
- [How are owners, servers and secrets trusted?](issues/09-trust-owners-servers-secrets.md):
  single-use Invites from a platform operator named in the instance's
  settings. Discord sign-in asks only for `identify`; sessions are hashed and
  kept server-side behind a cookie. Holding the Game server key in Game.ini's
  `[EZConfigPlatform]` section proves control; it is shown once and stored
  hashed. The operator manages Invites and server owners, deletes Notes and
  sets the Supported build. Note HTML is sanitized on save.
- [How is V1 hosted and deployed on AWS?](issues/10-aws-hosting-and-deployment.md):
  one Lightsail $12 box in us-east-2 on the Paid plan, about $15 a month, so
  the $25 ceiling holds. Caddy with Let's Encrypt sits in front of Next.js on
  Bun, run as one process that holds each poll for 50 s. Litestream streams
  the SQLite file to a Lightsail bucket, and a weekly restore checks it. The
  owner deploys a commit by script, migrations run at startup, and there is
  no staging.
- [Does the HTTP node work on Linux, and can the mod read Game.ini?](issues/12-prove-linux-http-and-game-ini.md):
  yes to both. On Linux the node matches Windows: HTTPS POST with verified
  certificates, the 180 s hold limit, clean failures and flat frame time.
  `[EZConfigPlatform]` reads back exactly on both platforms, but only if the
  URL is quoted: unquoted, it reads and is saved as `https:`. `modifyinivar`
  changes the value without a restart.
- [How does the owner's self-hosted data get onto the platform?](issues/13-one-time-import.md):
  a one-off Bun script, a dry run until `--commit`, all or nothing and
  refusing to run twice. `Databases/` becomes the Draft of a game server
  registered first, with a "Self-hosted" Ruleset version 1 as its origin.
  Each preset becomes a one-version Ruleset. The owner's Notes are theirs,
  others have no author. Values the schema won't take are dropped and
  reported. The self-hosted app stops for good first, and the script is
  deleted after use.

## Not yet specified

<!-- nothing at present: the Logs fog graduated into
[What does the platform record, and who can read it?](issues/15-platform-records-and-logs.md) -->

## Out of scope

- Co-admins and roles: V1 is owner-only so there are no permissions to manage.
- Sharing Rulesets (public library, share links, forking): Rulesets are private
  in V1.
- Live collaborative editing: stale saves are rejected instead.
- Reading values back from a game server: the platform stays the source of
  truth.
- Configs for mods other than EZConfig.
- Self-hosted single-server mode: hosted only.
- High availability: one instance plus backups.
- Public sign-up, billing and abuse handling: invite-only V1.
- Importing other owners' self-hosted data.
- Key contracts (numbered contracts, migrating Ruleset versions, handling each
  game server's contract): one Supported build instead, ruled out while
  resolving [How do Ruleset versions stay usable as the key contract changes?](issues/06-ruleset-versions-and-key-contract.md).
- Alerts outside the platform (Discord DM, email) about game server states:
  the platform's pages and the in-game delivery message cover V1, ruled out
  while resolving [What happens between a live change and the server confirming it?](issues/08-live-change-to-confirmed.md).
- Self-service account deletion: the platform operator deletes a server owner
  on request, ruled out while resolving
  [How are owners, servers and secrets trusted?](issues/09-trust-owners-servers-secrets.md).
