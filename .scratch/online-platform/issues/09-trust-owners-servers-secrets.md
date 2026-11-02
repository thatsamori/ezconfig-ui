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
- How the Game server key is issued, stored and rotated, and where the owner
  enters it on the game server.
- Who the platform operator is and what they may do. V1 needs at least
  deleting any Note, since Notes are shared by every owner
  ([How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md)),
  and changing the Supported build
  ([How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md)).

## Context

- From [How do the platform and a game server talk?](05-platform-game-server-communication.md):
  the platform never uses RCON, so it stores no RCON passwords. A game server
  authenticates every poll with its Game server key
  (`Authorization: Bearer`) over HTTPS. The mod reads Game.ini through
  `GetCustomConfigVar_String`, and the `[EZConfigPlatform]` section that holds
  the platform URL override is the natural place for the key. A URL override
  sends the key to that address; only someone who edits the server's Game.ini
  can set one.
- The platform's core will be open source (map Notes): the repo holds no
  instance's secrets or settings.
- From [Where does each entity get stored?](07-entity-storage.md): one SQLite
  file holds users (identified by Discord user id, username and avatar copied
  at each login), server-side sessions and each game server's key. Decide the
  stored form of the Game server key and of session tokens, and what the
  invite gate stores. The Supported build is a stored platform setting the
  operator changes from the platform.
- From [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  a Never connected game server's page shows a setup checklist
  (`bAllowHttpRequests`, then the Game server key in Game.ini). Decide that
  key step's wording with the key's issue and entry.
