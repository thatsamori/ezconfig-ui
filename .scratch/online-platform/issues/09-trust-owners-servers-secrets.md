# 09: How are owners, servers and secrets trusted?

Status: open
Type: grilling
Created: 2026-11-01
Blocked by: 05
Parent: [Map: EZConfig online platform](../map.md)

## Question

Decide:

- How the invite-only gate works with Discord login (an allowlist of Discord
  IDs, invite codes, or something else).
- Session lifetime and revocation.
- How an owner proves they control a game server before the platform sends it
  configuration.
- How any per-server credential is issued, stored and rotated.
- How stored RCON passwords, if RCON stays, are protected at rest on AWS.
- Who the platform operator is and what they may do. V1 needs at least
  deleting any Note, since Notes are shared by every owner
  ([How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md)),
  and changing the Supported build
  ([How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md)).

## Context

- From [Where does each entity get stored?](07-entity-storage.md): one SQLite
  file holds users (identified by Discord user id, username and avatar copied
  at each login), server-side sessions and each game server's key. Decide the
  stored form of the Game server key and of session tokens, and what the
  invite gate stores. The Supported build is a stored platform setting the
  operator changes from the platform.
