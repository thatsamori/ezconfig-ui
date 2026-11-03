# 15: What does the platform record, and who can read it?

Status: open
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
