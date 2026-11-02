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
