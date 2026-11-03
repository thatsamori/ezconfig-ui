# 09: How are owners, servers and secrets trusted?

Status: resolved
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

## Answer

Resolved 2026-11-02 by grilling the owner. Terms added to
[CONTEXT.md](../../../CONTEXT.md): Server owner, Platform operator, Invite.

**The gate is Invites.** The platform operator makes a single-use Invite link
on the platform and sends it however they like. The Discord account that signs
in through it becomes a server owner, and the Invite is spent. An unused Invite
expires after 7 days.
- Stored per Invite: a hash of its code, who made it and when, its expiry, and
  who used it and when. The link is shown once.
- A Discord account that is not a server owner and brings no Invite is refused
  ("invite-only"), and nothing about it is stored.
- A server owner who opens an Invite is just signed in, and the Invite stays
  unused. A server owner whose access was removed is refused even with one.
- Only the platform operator makes Invites.
- Rejected: an allowlist of Discord ids (the invitee has to find their id), a
  Discord guild or role (needs `guilds.members.read`, and leaving the guild
  does not end a session), and open sign-in with an approval queue (stores
  every stranger who tries).

**Platform operator.** Any Discord user id listed in the instance setting
`OPERATOR_DISCORD_IDS`, set on the instance and never in the repo.
- An operator signs in without an Invite, and the first sign-in creates their
  server owner record. That is how the first server owner gets in.
- Otherwise an ordinary server owner with their own game servers.
- Remove access and Delete are not offered for an operator. Taking the id out
  of the setting makes them an ordinary server owner.
- Rejected: a role stored in the database and set by a script, which a fresh
  instance or a restore would need run first.

**Sign-in and sessions.**
- Discord sign-in asks only for `identify`. The platform copies the id,
  username and avatar and discards Discord's tokens, so it holds no Discord
  credential.
- A session is a random token in an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie, replacing today's Bearer token in localStorage
  (`src/lib/store/authStore.ts`) and the in-memory token map
  (`src/lib/auth/tokens.ts`). The database stores only its SHA-256 hash, so a
  leaked backup holds no usable session. Requests that change data also check
  `Origin`.
- A session expires 30 days after its last use; last seen is written at most
  once an hour. Sessions survive restarts and deploys.
- Sign out ends this session, Sign out everywhere ends all of the server
  owner's sessions, and Remove access ends them too.

**Holding the key proves control.** There is no separate verification.
Registering a game server creates a record and its Game server key. The record
becomes a real server only when something polls with that key, and only
someone who can edit that server's Game.ini can put it there. The platform
never connects out, so registering a server you do not control sends nothing
anywhere.
- Rejected: a challenge (an RCON command, matching the server name), which
  proves nothing beyond Game.ini access.
- Accepted, from
  [How do the platform and a game server talk?](05-platform-game-server-communication.md):
  a Game.ini URL override sends the key to that address. Only someone who can
  edit Game.ini can set one, and they can read the key anyway.

**The Game server key.**
- Issued at registration: 32 random bytes in base64url behind the fixed prefix
  `ezc_gsk_` (51 characters), so people and secret scanners recognise a leaked
  one.
- Stored only as a SHA-256 hash with a unique index; a poll is looked up by the
  hash of the key it presents. Shown in full once, after registering or
  regenerating; afterwards the page shows its last 4 characters. A lost key is
  regenerated.
- Rejected: storing it encrypted so it can be shown again. A leaked database
  and its encryption key would expose every server's key, and the owner already
  has it in Game.ini.
- **Regenerate key**, after a confirm ("This server stops receiving
  configuration until you put the new key in its Game.ini and restart it"),
  ends the old key at once, with no grace period. A poll held on the old key is
  answered "key rejected", and the game server is Not connected until it polls
  with the new one. A grace period only helps keep a leaked key working.
- Deleting a game server deletes its key
  ([Where does each entity get stored?](07-entity-storage.md)).

**On the game server.** The key goes beside the URL override, as
`GameServerKey`, named after the glossary term. Section and key names never
change once published.

```ini
[/Script/Mordhau.MordhauGameSession]
bAllowHttpRequests=True

[EZConfigPlatform]
GameServerKey=ezc_gsk_...
```

- The mod reads it before every poll, like `PlatformUrl`, and sends it as
  `Authorization: Bearer`. A change takes a restart, or `modifyinivar` if
  [Does the HTTP node work on Linux, and can the mod read Game.ini?](12-prove-linux-http-and-game-ini.md)
  proves it.
- Missing or empty: the mod does not poll. It logs once per map "EZConfig: no
  GameServerKey in Game.ini; not contacting the platform", reads the value
  again every 60 s and keeps its saved snapshot. No traffic leaves without a
  key.
- A key the platform does not recognise (mistyped, regenerated, or its game
  server deleted; they look the same) gets `401` "key rejected". The mod logs
  "EZConfig: the platform rejected this server's GameServerKey" once, keeps its
  snapshot and retries every 60 s instead of 10 s. Log only, not chat. No page
  shows these polls: they belong to no game server.

**One key on two servers.** The newest poll still supersedes a held one, but
without a rule two servers sharing one Game.ini would knock each other's polls
out at round-trip speed.
- Every poll carries an instance id: a random id the mod picks each time it
  starts on a map (Blueprint's New Guid).
- A superseded poll is answered "superseded", and the mod waits about 10 s
  before polling again. Both servers still get the configuration within about
  10 s.
- When polls from different instance ids keep superseding each other (about 3
  times in 5 minutes), the server page warns "More than one server is using
  this key" and points to Regenerate key. A restart or map change supersedes
  once and does not trip it. Instance ids and the count live in process memory
  with the held polls.
- Rejected: refusing a newcomer while the first holder is active. A restarted
  or map-changed server would be locked out until its own old poll timed out,
  up to about 3 minutes.

**Setup checklist** for a Never connected game server
([What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md)):
1. Add EZConfig to the server's mods on your host's control panel.
2. Paste this into the server's Game.ini: the block above with the real key, a
   copy button and "You won't see this key again". If a section already exists,
   add the line under it. After the page is left, this step reads "Key ending
   in `ab12`. Lost it? Regenerate key."
3. Restart the server.
4. Wait for Connected: this page changes within a few seconds of the server
   starting.

**What the platform operator may do in V1.**
- Invites: make one (the link is shown once), list unused ones with their
  expiry, revoke one.
- Server owners: list them (Discord name and avatar, first sign-in, last seen,
  number of game servers); Remove access, Restore access, Delete.
- Notes: delete any Note; never edit another's.
- Supported build: set it.
- Nothing else. No viewing or editing another server owner's game servers,
  Drafts, Live configurations or Rulesets, and no acting as them. Anything more
  is done by hand on the database file.

**Removing a server owner.**
- Remove access is reversible. It ends their sessions and refuses their
  sign-in, and keeps their data. Their game servers keep being answered: their
  Live configurations can no longer change, but a build change still
  re-delivers. Restore access brings everything back.
- Delete (a typed confirm, permanent) is for someone who asks to be erased. It
  removes the server owner with their game servers, Drafts, Live
  configurations and Rulesets. Their Notes stay, shown as written by "a former
  server owner", and only the operator can delete them.
- No self-service account deletion in V1 (map Out of scope). A server owner
  deletes their own game servers and Rulesets.

**Notes across server owners.** Today a Note's HTML is stored as sent and
rendered unsanitized (`dangerouslySetInnerHTML` in
`src/components/notes/NotesDialog.tsx`). Every server owner reads every Note,
so one could run script in another's session, the operator's included. The
platform sanitizes every Note body on save, keeping only what the TipTap editor
produces: paragraphs, bold, italic, underline, lists, code and `http(s)` links.
Everything else is stripped, so stored Notes never hold active content.
Imported Notes pass the same sanitizer.
- Rejected: Markdown or plain text, which changes the editor.

**Schema additions** to
[Where does each entity get stored?](07-entity-storage.md):

| Entity | Change |
|---|---|
| User | adds access removed (a time, or none) |
| Session | its id is the SHA-256 hash of the cookie token |
| Game server | the Game server key is stored as its SHA-256 hash, plus its last 4 characters for display |
| Invite | new: id, code hash, made by, made time, expires, used by and used time (or none) |
| Note | author becomes none when its server owner is deleted |

**Mod work for the spec**, joining
[How do the platform and a game server talk?](05-platform-game-server-communication.md)'s
list:
- Read `GameServerKey` before every poll and send it as the Bearer token.
- No key: no poll, one log line per map, read again every 60 s.
- `401` "key rejected": log once, retry every 60 s.
- An instance id in every poll; after "superseded", wait about 10 s.

**Out of scope.** Self-service account deletion: the platform operator
deletes a server owner on request. Added to the map.

**Handed on.**
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
  (resolved): the mod work above, noted on that ticket.
- [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  instance settings and secrets outside the repo (`OPERATOR_DISCORD_IDS`, the
  Discord application's client id, secret and redirect URL); HTTPS only, since
  the session cookie is `Secure`; a Content-Security-Policy behind the Note
  sanitizer.
- [Does the HTTP node work on Linux, and can the mod read Game.ini?](12-prove-linux-http-and-game-ini.md):
  read a value shaped like an issued key back exactly.
- [How does the owner's self-hosted data get onto the platform?](13-one-time-import.md):
  imported Note bodies pass the sanitizer; "a former server owner" exists for a
  Note with no author.
- Logs (map fog) gains operator actions.
- No ADR: each decision reverses cheaply. The published Game.ini names are a
  contract the spec carries.

## Comments

- 2026-11-02, from
  [Does the HTTP node work on Linux, and can the mod read Game.ini?](12-prove-linux-http-and-game-ini.md):
  `modifyinivar` is proven. It changes the next read without a restart, and
  the value survives one. A key shaped like an issued one reads back exactly
  and needs no quotes. If the setup block also carries a `PlatformUrl` line,
  quote the URL: unquoted, it reads and is saved as `https:`.
- 2026-11-02, from
  [What does the platform record, and who can read it?](15-platform-records-and-logs.md):
  revoking an Invite sets a revoked time instead of deleting it; an unused
  Invite's row is deleted 30 days after it expires or is revoked, and a used
  one goes with its server owner on Delete. The Supported build records set at
  and set by. Operator actions are journal lines, with no audit table. Sign-in
  refused is logged as "invite-only" with no Discord id. The operator's page
  adds counts of game servers by reported build stamp, a health panel and
  backup status, and still shows no other owner's game servers.
