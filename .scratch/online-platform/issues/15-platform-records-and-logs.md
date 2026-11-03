# 15: What does the platform record, and who can read it?

Status: resolved
Type: grilling
Created: 2026-11-02
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

## Question

Decide what the platform records about its own working, where it keeps it,
for how long, and who can read it:

- Polls and deliveries: which events are kept beyond the game server's last
  reported state, if any. Examples: a Live configuration sent, the result
  reported for it, "key rejected", "superseded", a build that is not the
  Supported build.
- Errors: what the app logs and where (the systemd journal on the box, the
  database), and how much of it the platform operator sees on the platform
  without SSH.
- Platform operator actions: Invites made and revoked, access removed and
  restored, server owners and Notes deleted, the Supported build changed.
  Whether these form an audit trail in the database, and who reads it.
- Backup status: whether Litestream's replication lag joins the restore
  check on the operator's page.
- What a server owner sees of their own game servers' events, compared with
  the platform operator.
- How long each record is kept, and what must never be logged (Game server
  keys, session tokens, the Discord client secret, Invite codes).

## Context

- Graduated from the map's Logs fog by
  [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  - one Lightsail box with a 60 GB disk; the app runs under systemd, so its
    output goes to the journal;
  - the weekly restore check's result shows on the operator's page, with a
    warning when it failed or is more than 8 days old;
  - systemd restarts the app when it exits, and a Lightsail alarm emails the
    owner when the instance's status check fails;
  - no uptime monitoring outside AWS.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  the operator's V1 powers. A poll answered `401` "key rejected" belongs to
  no game server, and no page shows it; the mod logs it on its side.
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
  and
  [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  a game server keeps only its last poll time and last reported result.
  Pending, Confirmed and Failed are computed from them, and connection
  status is never stored. The mod writes its delivery message to chat and
  the server log.
- [Where does each entity get stored?](07-entity-storage.md): one SQLite
  file. Each game server holds only its current Live configuration, with its
  applied time; earlier ones are not kept, since Apply history was ruled out
  of scope by
  [What does the owner see of earlier Live configurations?](14-earlier-live-configurations.md).
- Out of scope (map): alerts outside the platform about game server states.

## Answer

Resolved 2026-11-02 by grilling the owner. No new terms. Facts checked while
grilling, for Litestream v0.5.17 (the current stable release), read
2026-11-02:
- No metric or CLI command gives the time of the last successful upload or a
  replication lag. `litestream status` reads only local state.
- When the bucket fails, Litestream keeps running and retries with backoff up
  to 5 minutes, logging `ERROR "monitor error"` at most every 30 s. From the
  source, a failing upload may not raise the counters the docs' example alerts
  watch.
- `heartbeat-url` (0.5.6 and later) sends a GET only while every database has
  completed a successful sync within `heartbeat-interval` (default 5 minutes,
  at least 1), idle databases included.
- `restore -json` (0.5.12 and later) reports the restored TXID, not a
  timestamp.
- Sources: [config](https://litestream.io/reference/config/),
  [metrics](https://litestream.io/reference/metrics/),
  [status](https://litestream.io/reference/status/),
  [restore](https://litestream.io/reference/restore/),
  [v0.5.17 `replica.go`](https://raw.githubusercontent.com/benbjohnson/litestream/v0.5.17/replica.go).

Today's app logs with bare `console.*` calls, keeps nothing but
`.last-apply.json`, and its apply route prints every command with its values
(`src/app/api/apply/route.ts`). All of it goes with the self-hosted mode.

**Delivery events are not stored.** The database keeps a game server's last
poll time and last reported result, nothing more. The server page shows what
[What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md)
set: Connection, the Live configuration's state with its time, and Unapplied
changes. A Failed result already names where it stopped and the mod's error.
Looking back at past events is for the platform operator, in the journal.
- Rejected: a recent-activity list per game server. It is a small Apply
  history, with its own storage, retention and page.

**The journal is the only log.** The app writes to stdout and stderr, which
the systemd journal keeps. No error table in the database, no outside error
service, no reporting of browser errors.
- One JSON line per event: level, event name and ids.
- It records state changes, never routine polls (about 1 M a month):
  - startup (release commit, migrations run), shutdown, and a crash with its
    stack trace;
  - Apply, delivery sent, result reported;
  - superseded, and the "More than one server is using this key" warning;
  - a reported build that is not the Supported build, when it changes;
  - sign-in, and sign-in refused as "invite-only" with no Discord id, since
    [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md)
    stores nothing about a refused account;
  - "key rejected" polls as one count per hour, since they belong to no game
    server;
  - every operator action, and every error.
- journald keeps 30 days and at most 2 GB, set explicitly. Ubuntu's default
  allows up to 4 GB on this disk with no time limit.
- Caddy writes no access log, only its own errors.

**What is never logged.** No Game server key or any part of one, session
token, `Cookie` or `Authorization` header, Invite code or link, Discord OAuth
code, token or client secret, Note body, configuration value, Discord username
or IP address. Lines name platform ids only (game server, user, Live
configuration), so a deleted server owner's lines point at nothing.
- All logging goes through one module. It never serialises a raw request or
  error object, only the message and the stack. As a backstop it redacts
  anything matching the `ezc_gsk_` key pattern and the configured client
  secret, and a test checks the redaction.

**No audit table.** Each operator action writes a journal line, and the
records carry their own times:
- an Invite gains a revoked time, instead of its row being deleted;
- a User already holds access removed;
- the Supported build setting gains set at and set by, so the operator's page
  reads "Supported build `X`, set 3 days ago". Changing it disables Apply on
  every game server, and nothing else records when that happened. If the
  server owner who set it is later deleted (after leaving
  `OPERATOR_DISCORD_IDS`), set by reads "a former server owner", as Notes do.
- Accepted: a deleted server owner or Note leaves only its journal line,
  which is what an erasure request wants, and an earlier Supported build is
  forgotten after 30 days.

**What each person sees.** A server owner sees only their own game servers'
indicators. The platform operator still sees no other owner's game servers;
their page adds:
- **Counts**: game servers registered, Connected now, and Connected by
  reported build stamp with the Supported build marked ("12 on `2026.11.01`,
  3 on `2026.10.20`"). Computed on load, naming no server or owner. It tells
  the operator how many servers a Supported build change cuts off.
- **Health**, held in process memory: the release commit, running since, and
  the number of warnings and errors since start with the newest 20 (time,
  event, scrubbed message). A restart clears it; "running since 4 minutes
  ago" shows that one happened, and the journal says why.
- **Backup**: Litestream's last heartbeat beside the restore check.
- Rejected: nothing without SSH; the app reading the journal, which needs the
  `systemd-journal` group and so the whole box's journal.

**Backup status.**
- Litestream's `heartbeat-url` points at the app on localhost every minute,
  on a path Caddy refuses from outside. The app keeps the last heartbeat time
  in memory. The page shows "Backup: last confirmed 40 s ago", and a warning
  after 5 minutes without one, or 5 minutes after start with none yet.
- Why: a Litestream that stops uploading keeps running and logs only to its
  own journal, and the weekly restore check can still pass on a stale backup,
  since Draft saves do not change row counts.
- Litestream is pinned to 0.5.x, at least 0.5.12: the heartbeat needs 0.5.6,
  and `restore -json` needs 0.5.12.
- The restore check writes its result (time, passed or failed, reason) to a
  status file beside the database, which the app reads on load. A missing
  file reads as never checked and shows the 8-day warning. Not a database
  row: a restore would bring back an old "passed".
- Accepted: a stalled backup is noticed when the operator opens their page.
- Rejected: an outside dead-man's switch service, against
  [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md)'s
  "no monitoring outside AWS"; the restore check alone.

**Retention.**
- Sessions: a daily sweep deletes expired ones.
- Invites: an unused one leaves the list when it expires or is revoked, and
  its row is deleted 30 days later. A used Invite stays while its server
  owner exists and goes with them on Delete.
- The migration `VACUUM INTO` copies: the last 3, none older than 14 days.
- The journal: 30 days. The health panel and heartbeat: until the process
  restarts.
- Everything else: until its owner deletes it, as already decided.
- So a deleted server owner is gone from the database at once, from
  Litestream's history and the Lightsail snapshots within 14 days, and their
  id leaves the journal within 30.

**Schema additions** to
[Where does each entity get stored?](07-entity-storage.md):

| Entity | Change |
|---|---|
| Invite | adds revoked time (or none) |
| Platform setting | the Supported build gains set at and set by |

**Graduated.** Nothing. No fog remains and no ticket is open, so the map's
next step is assembling `spec.md` (map Notes).

**Handed on.**
- [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md)
  (resolved): journald retention, no Caddy access log, the Litestream pin and
  heartbeat, the restore check's status file, migration copies capped at
  14 days. Noted on that ticket.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md)
  (resolved): the Invite's revoked time, the Supported build's set at and set
  by, the operator page's additions. Noted on that ticket.
- [Where does each entity get stored?](07-entity-storage.md) (resolved): the
  schema additions and the session sweep. Noted on that ticket.
- The spec's first build slice proves the heartbeat along with Litestream.
- No ADR: each decision reverses cheaply.
