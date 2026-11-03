# Spec: EZConfig online platform (V1)

Status: open
Type: spec
Created: 2026-11-02
Map: [Map: EZConfig online platform](map.md)

Assembled from the resolved tickets `online-platform#01` to `online-platform#15`.
The reasons behind each decision are recorded in those tickets, and this spec
does not repeat them. Platform terms are defined in this repo's `CONTEXT.md`.
Config-contract terms (config key, database, category, command batch, build
stamp) are defined in the mod's `CONTEXT.md`.

## Problem Statement

A server owner who wants EZConfig on their Mordhau server today has to run the
self-hosted webapp themselves: a `.env` that names one RCON target, a
`users.json`, and `Databases/` and `Presets/` folders on disk. Each copy of the
app manages one server. Most game servers run on rented hosting that offers a
control panel, FTP and RCON, and nothing else can run beside the game. To
reach the server the app needs its full-admin RCON password, which travels in
plain text across the internet. An apply costs one round trip per category
over a connection that has to stay open.

Presets are folders with no history, so a ruleset an owner refines over time
cannot be kept as versions. The selective apply can leave a key the owner
reset still running on the server, with nothing on screen to say so. Saves
from two tabs are merged key by key, so the last write wins. Notes accept any
author name from the request and render their HTML without sanitizing it.

The owner wants one hosted place where they sign in with Discord, register
their game servers, edit each server's configuration and keep versioned
Rulesets. A change should reach a running server within seconds, without
exposing RCON and without running anything on the server's host.

## Solution

This repo becomes a hosted, invite-only platform, built in place. The
self-hosted mode is removed.

- **Getting in.** A server owner signs in with Discord, through a single-use
  Invite from the platform operator. Sessions are stored server-side behind a
  cookie.
- **Game servers.** The owner registers a game server and gets its Game
  server key once. They paste the key into the server's Game.ini under
  `[EZConfigPlatform]`, next to `bAllowHttpRequests=True`. Holding the key in
  Game.ini is the proof that they control the server.
- **Communication.** The mod long-polls the platform over HTTPS POST, using
  the key as a Bearer token. The platform never uses RCON. Each poll reports
  the mod's build stamp and the Live configuration it last processed, with the
  result. The platform answers with the whole Live configuration only when
  that configuration differs from the reported one. A held poll is answered
  as soon as an Apply makes a new Live configuration, so a change reaches a
  Connected game server within about 5 s.
- **Draft and Apply.** Each game server has an auto-saved Draft. Apply
  reviews the Draft against the Live configuration and then makes the whole
  Draft the new Live configuration. The Live configuration shows as Pending,
  then Confirmed or Failed, based on what the server reports.
- **Rulesets.** Ruleset versions are immutable, numbered sets of values. A
  Draft is saved as a new version, and a version is loaded into any of the
  owner's Drafts.
- **Notes.** Notes are global comments on config keys, readable by every
  server owner. Their HTML is sanitized when saved.
- **Supported build.** The platform operator sets the one Supported build.
  The platform sends configuration only to game servers that run it.
- **Hosting.** The platform runs on one Lightsail instance in the owner's AWS
  project. One SQLite file holds all its data, and Litestream streams that
  file continuously to a bucket. The owner deploys a commit with one script.
- **Import.** The owner's own self-hosted data is brought in once by a
  script.
- **When the platform is down.** Game servers keep running their last applied
  values.

## User Stories

### Getting in

1. As a person the platform operator invited, I want to open my Invite link and sign in with Discord, so that I become a server owner without creating a password.
2. As a server owner, I want Discord sign-in to ask only for my identity, so that the platform never holds access to my Discord account.
3. As a server owner, I want my Discord username and avatar to be copied again at every sign-in, so that the platform shows me the way Discord does.
4. As a server owner, I want my session to last 30 days from my last visit and to survive platform restarts and deploys, so that I am not signed out while I use the platform.
5. As a server owner, I want to sign out of this browser, so that a shared computer does not keep my session.
6. As a server owner, I want to sign out everywhere, so that a session I left on another device ends.
7. As a server owner who opens an Invite, I want to be signed in and the Invite left unused, so that a stray link wastes nothing.
8. As a Discord user with no Invite, I want to be told the platform is invite-only and to have nothing about me stored, so that I know why I cannot get in.
9. As a server owner whose access was removed, I want sign-in refused even with an Invite, so that removal holds.
10. As the platform operator, I want to sign in without an Invite because my Discord id is in the instance settings, so that the first server owner can get in on a fresh instance.

### Game servers

11. As a server owner, I want to register a game server by name, so that I can manage its configuration.
12. As a server owner, I want each of my game servers to have a unique name, ignoring case, so that I can tell them apart.
13. As a server owner, I want to see the Game server key once after registering, with a copy button and the warning "You won't see this key again", so that I can put it in Game.ini.
14. As a server owner, I want a setup checklist for a Never connected game server: add EZConfig on the host's control panel, paste the Game.ini block, restart the server, then wait for Connected. That way I can connect it without reading separate docs.
15. As a server owner, I want the Game.ini block to carry both `bAllowHttpRequests=True` and the `[EZConfigPlatform]` key line, so that one paste covers everything the game server needs.
16. As a server owner, I want the checklist to read "Key ending in `ab12`. Lost it? Regenerate key." once I have left the page, so that I can recognise or replace my key.
17. As a server owner, I want Regenerate key to end the old key at once, after a confirm that says the server stops receiving configuration until its Game.ini has the new key, so that a leaked key stops working immediately.
18. As a server owner, I want registering a server to prove nothing until a game server polls with its key, so that nobody can register my server and send it configuration.
19. As a server owner, I want each game server's connection shown as Connected, Not connected with last seen, Never connected, or EZConfig needs updating with the running and Supported build stamps, so that I know whether it can receive configuration.
20. As a server owner, I want the server page to show Connected within a few seconds of the game server starting, so that I know setup worked.
21. As a server owner, I want the server list and the server page to refresh about every 2 s while open, so that I see changes without reloading.
22. As a server owner, I want the warning "More than one server is using this key" when two game servers share one key, with a pointer to Regenerate key, so that I can separate them.
23. As a server owner, I want to delete a game server, along with its Draft, its Live configuration and its key, while my Rulesets survive, so that I can tidy up without losing work.
24. As a server owner, I want the platform never to hold or use my RCON password, so that my server's admin access is never exposed.
25. As a server owner, I want my game servers to keep their last applied values while the platform is down or restarting, so that players are not affected by a platform outage.

### Draft

26. As a server owner, I want each game server to have a Draft that auto-saves as I edit, so that I never lose an edit.
27. As a server owner, I want a new game server's Draft to start empty, which means game defaults, so that I start from a known state.
28. As a server owner, I want the existing editor (Character and Weapon config, search, sweep and the value editor) to work on a game server's Draft, so that what I already know still applies.
29. As a server owner, I want an invalid value to show its error in the editor and not be saved, so that a Draft never holds a value the game server would reject.
30. As a server owner, I want a save from a stale tab to be rejected, and that tab to reload the Draft and name the edits it did not save, so that two tabs never silently overwrite each other.
31. As a server owner, I want open tabs to refresh the Draft within a few seconds, so that an idle tab rarely meets a rejection.
32. As a server owner, I want "Discard changes" to reset the Draft to the Live configuration, so that I can drop edits I have not applied.
33. As a server owner, I want "Reset to game defaults" to empty the Draft and clear its origin, so that I can start over.
34. As a server owner, I want to see Unapplied changes whenever the Draft differs from the Live configuration, so that I know an Apply would change something.
35. As a server owner, I want to see whether the Draft and the Live configuration are modified from their origin Ruleset version, so that I know when I have drifted from a ruleset.
36. As a server owner, I want a value set equal to its game default to stay as an override, so that it stays pinned if a Mordhau patch changes the default.
37. As a server owner, I want to keep editing the Draft while the game server is Not connected or on another build, so that I can prepare changes in advance.

### Apply

38. As a server owner, I want an explicit Apply that makes the whole Draft the Live configuration, so that nothing reaches players until I decide.
39. As a server owner, I want Apply to show a review of the keys added, changed and reset to game default before I confirm, so that I see exactly what will change, resets included.
40. As a server owner, I want the first Apply on a game server to list every value the Draft sets, under a warning that every EZConfig value the server has now is replaced and anything not in the Draft returns to game default, so that I know the server's own values will go.
41. As a server owner, I want Apply with no changes to say "No changes; the server will be sent this configuration again" and then send it again, so that I can recover after Failed or clear drift left by manual commands.
42. As a server owner, I want Apply disabled with its reason (Not connected, Never connected, or EZConfig needs updating), so that I know what to fix.
43. As a server owner, I want Apply blocked, with the list of values to fix, when the current schema rejects a value in the Draft, so that a deploy that tightens a key never lets a bad value through.
44. As a server owner, I want Apply rejected and its review reopened if the Draft or the Live configuration changed after the review was built, so that I never apply something I did not review.
45. As a server owner, I want an Apply to reach a Connected game server within about 5 s, so that I can tune rules while players are on.
46. As a server owner, I want an Apply made while a delivery is in flight to replace that delivery, so that the newest configuration wins.
47. As a server owner, I want a game server that drops after an Apply to receive that Live configuration when it returns, with nothing expiring, so that no Apply is lost.

### Live configuration states

48. As a server owner, I want to see the Live configuration as one of: none yet (the server runs its own saved values), Pending with how long, Confirmed with when, or Failed. That way I know what the server runs.
49. As a server owner, I want Failed to name the category (and weapon) where processing stopped and give the mod's error, and to say the server runs only the categories before it, so that I can fix the value and Apply again.
50. As a server owner, I want a Confirmed configuration to carry a warning that names any keys the server ignored, so that I notice key-set mismatches.
51. As a server owner, I want connection and Live configuration state shown as separate indicators, so that a state like "Failed, and now Not connected" stays visible.
52. As a server owner, I want a delivery interrupted by a crash or map change to be delivered again on its own, so that the server never stays half configured while the platform shows Pending.
53. As a server owner, I want a game server that restarts onto a new EZConfig build to receive its Live configuration once more, so that values moved between categories are read again.
54. As a server owner, I want a game server that restarts or changes map after it has processed its Live configuration to receive nothing, so that players do not see needless re-applies.
55. As a server owner, I want a game server with no Live configuration to keep its own saved values and not be wiped by its first poll, so that registering a server that already runs EZConfig is safe.

### Rulesets

56. As a server owner, I want to save a Draft as version 1 of a new Ruleset, so that I can keep a configuration I like.
57. As a server owner, I want to save a Draft as the next version of one of my Rulesets, with an optional description, so that I can refine a ruleset over time.
58. As a server owner, I want saving a version never to apply anything, so that saving is always safe.
59. As a server owner, I want the version I save to become the Draft's origin, so that "modified" then compares against it.
60. As a server owner, I want to load any version of my Rulesets into a game server's Draft, replacing the whole Draft, with nothing going live until I Apply, so that I can switch rulesets deliberately.
61. As a server owner, I want to load one version onto several of my game servers, so that I can copy a configuration between servers.
62. As a server owner, I want versions to be immutable and numbered in order within their Ruleset, so that a version always means the same values.
63. As a server owner, I want an old version to load with each value placed under its key's current category, so that category moves in the mod cost me nothing.
64. As a server owner, I want to be told how many values were dropped when a version holds keys the current schema no longer has, so that I know what an old version lost.
65. As a server owner, I want to rename a Ruleset, with names unique among my Rulesets ignoring case, so that I can keep them organised.
66. As a server owner, I want to delete a Ruleset with all its versions, clearing every origin that pointed into it while the values stay, so that I can remove rulesets I no longer use.
67. As a server owner, I want my Rulesets to be private to me, so that my work is not shared without my say.

### Notes

68. As a server owner, I want to read every Note on a config key, from every server owner, so that I learn from what others found.
69. As a server owner, I want to add a Note on a config key, with the author taken from my session, so that nobody can write a Note as me.
70. As a server owner, I want to edit and delete only my own Notes, so that others' Notes stay theirs.
71. As a server owner, I want Notes to keep paragraphs, bold, italic, underline, lists, code and `http(s)` links and to lose everything else, so that no Note can run script in my session.
72. As a server owner, I want Notes keyed by database and key name, so that a category move does not lose them.
73. As a server owner, I want Notes on keys the schema no longer has to stay stored but hidden, so that nothing is lost if a key returns.
74. As a server owner, I want a deleted server owner's Notes shown as written by "a former server owner", so that useful Notes outlive their author.

### Platform operator

75. As the platform operator, I want to make an Invite link that is shown once and expires after 7 days if unused, so that I can let one person in.
76. As the platform operator, I want to list unused Invites with their expiry and revoke one, so that a link sent to the wrong place stops working.
77. As the platform operator, I want to list server owners with their Discord name and avatar, first sign-in, last seen and number of game servers, so that I know who uses the platform.
78. As the platform operator, I want Remove access to end a server owner's sessions and refuse their sign-in while keeping their data and answering their game servers, and Restore access to undo it, so that I can suspend someone reversibly.
79. As the platform operator, I want Delete, behind a typed confirm, to remove a server owner with their game servers, Drafts, Live configurations and Rulesets while their Notes remain, so that I can honour an erasure request.
80. As the platform operator, I want Remove access and Delete not offered against an operator, so that I cannot lock the instance out by mistake.
81. As the platform operator, I want to delete any Note but never edit another's, so that I can remove abuse without putting words in anyone's mouth.
82. As the platform operator, I want to set the Supported build and see "Supported build `X`, set 3 days ago", so that I can release a new mod build and know when the switch happened.
83. As the platform operator, I want counts of game servers registered, Connected now, and Connected by reported build stamp with the Supported build marked, naming no server or owner, so that I know how many servers a Supported build change cuts off.
84. As the platform operator, I want a health panel showing the release commit, running since, and warnings and errors since start with the newest 20 (time, event and scrubbed message), so that I notice problems without SSH.
85. As the platform operator, I want backup status: "Backup: last confirmed 40 s ago" from Litestream's heartbeat, with a warning after 5 minutes without one, and the last restore check with a warning when it failed or is more than 8 days old. That way I know a restore would work.
86. As a server owner, I want the platform operator unable to view or edit my game servers, Drafts, Live configurations or Rulesets from the platform, or act as me, so that the operator role stays narrow.

### The mod on a game server

87. As a server owner, I want the mod to read `GameServerKey` and `PlatformUrl` from Game.ini before every poll, so that a `modifyinivar` change takes effect without a restart.
88. As a server owner, I want the mod not to contact the platform at all when Game.ini has no key, and to log that once per map, so that no traffic leaves my server unless I set it up.
89. As a server owner, I want a rejected key to be logged once and retried every 60 s, so that a regenerated key is picked up without flooding the log.
90. As a server owner, I want an override URL that is not `https://` to fall back to the built-in URL, with a log line that names the likely cause (a missing quote), so that a typo in Game.ini is easy to spot.
91. As a developer testing locally, I want `PlatformUrl` to accept plain `http://` to a loopback address, so that I can point a sandbox server at a local platform.
92. As a player, I want a chat message such as "EZConfig: received 140 values, 12 changed" after a delivery, with "incomplete" added if processing stopped, so that I know the rules changed. When nothing changed, the message goes only to the log.
93. As a server owner, I want the mod's chat and RCON config commands to keep working, so that I can still test in game; the next Apply replaces any drift they leave.
94. As a server owner, I want a failed poll to be retried after about 10 s, and a callback that never arrives to be caught by a watchdog, so that the game server reconnects on its own.
95. As a server owner, I want polling to cost nothing measurable in frame time, so that players never notice it.
96. As a server owner, I want two game servers sharing one key to both still receive configuration within about 10 s, so that a copy-paste mistake degrades instead of breaking.

### Running the platform

97. As the platform operator, I want to deploy a commit with one command from my PC, built beside the running release, so that the old release keeps serving during the build.
98. As the platform operator, I want the last 3 releases kept and rollback done by deploying an older commit, so that a bad deploy is quick to undo.
99. As the platform operator, I want schema migrations to run at startup, each in a transaction, after a `VACUUM INTO` copy, and the app to refuse to start on a database newer than its code, so that a deploy never corrupts data.
100. As the platform operator, I want every change streamed to a bucket within about a second, with 14 days of point-in-time restore, so that a restore rolls game servers back by seconds at most.
101. As the platform operator, I want a weekly automatic restore check, so that I find a broken backup before I need it.
102. As the platform operator, I want a written restore runbook, drilled before launch, so that rebuilding the instance is routine.
103. As the platform operator, I want the app restarted whenever it exits, an email when the instance fails its status check, and a budget alert at $20, so that I hear about outages and cost.
104. As the platform operator, I want one JSON log line per state change, kept 30 days, with no secrets, configuration values, names or IP addresses, so that I can investigate without the log becoming a liability.
105. As the platform operator, I want the platform to cost about $15 a month, under the $25 soft ceiling, so that running it stays affordable.
106. As a server owner, I want the platform served only over HTTPS with HSTS and a nonce-based Content-Security-Policy, so that my session cannot be stolen or hijacked by injected script.
107. As a reader of the open-source core, I want the repo to hold no instance's secrets or settings, so that the code can be public.

### Importing the owner's self-hosted data

108. As the platform's first server owner, I want my self-hosted `Databases/` imported as the Draft of a game server I registered, with a "Self-hosted" Ruleset version 1 as its origin, so that I continue where I left off and a reset loses nothing.
109. As the platform's first server owner, I want each of my presets imported as a Ruleset with one version 1, named after its manifest title, so that my presets carry over.
110. As the platform's first server owner, I want Notes I wrote attributed to me and everyone else's shown as by "a former server owner", so that existing Notes carry over honestly.
111. As the platform's first server owner, I want the import to be a dry run that prints a report until I pass `--commit`, to be all or nothing, and to refuse to run twice, so that I can check it safely.
112. As the platform's first server owner, I want every value the import drops (unknown key, unknown weapon class, invalid value) reported with where it came from and why, so that I know what did not carry over.
113. As the platform's first server owner, I want nothing to reach my game server until I review the imported Draft and Apply, so that the cutover is under my control.

## Implementation Decisions

### What is removed

The self-hosted mode goes entirely. This includes:

- the RCON service, the acknowledged batch client, the automatic-sync
  responder and its owner lock;
- the apply and apply-preview routes, the apply record, the selective apply
  dialog and the RCON and Game.ini server actions;
- file storage under `Databases/`, `Presets/` and `Notes/`, built-in presets,
  `users.json` auth, the Users tab, Bearer tokens kept in localStorage and the
  in-memory token map;
- per-key last-writer-wins Draft syncing;
- the environment settings `DATABASES_PATH`, `PRESETS_PATH`, `NOTES_PATH`,
  `USERS_PATH`, `RCON_*`, `EZCONFIG_PASSWORD` and `ADMIN_*`.

The parry-geometry startup migration migrates file storage, so it goes with
that storage. The startup hook it ran in now runs the SQLite migrations. The
import already reads values by key name, which covers pre-move files.

The config schemas, `gameDefaults.json`, the string schemas and value
validation (camera policy included) stay. So do the console editor and its
inputs, the TipTap Note editor, and the formatting that turns values into
category commands.

### Storage (one module owns all database access)

- One SQLite file at `DATABASE_PATH`, accessed through `bun:sqlite`. All
  database access goes through one module, so that a later move to Node needs
  an adapter in one place (ADR 0001).
- Migrations are forward-only, numbered SQL files. The app applies pending
  ones at startup, before it serves anything, each in its own transaction,
  and records the version in `PRAGMA user_version`. Before applying any
  migration, the app writes a `VACUUM INTO` copy beside the database, named by
  version. It keeps the last 3 copies and none older than 14 days. The app
  refuses to start on a database newer than its code. There is no separate
  migrate step.
- Values: a Draft, a Live configuration and a Ruleset version each hold one
  JSON document of overrides. Values are keyed by database, weapon class and
  key name, never by category. A missing key means the game default. Values
  are always loaded, copied, compared and sent whole. A typical document is a
  few KB; one with every key set is about 100 KB. The shape, from
  `online-platform#07`:

  ```json
  {"Character": {"<key>": "<value>"}, "Weapon": {"ArmingSword": {"<key>": "<value>"}}}
  ```

- Schema, consolidated from `online-platform#07`, `#09`, `#14` and `#15`:

  | Entity | Fields |
  |---|---|
  | User | Discord user id (identity); username and avatar copied at each sign-in and never edited here; first sign-in time; access removed time or none |
  | Session | id (the SHA-256 hash of the cookie token); user; created; expires; last seen (written at most once an hour) |
  | Invite | id; code hash; made by; made time; expires (7 days after made); used by and used time, or none; revoked time or none |
  | Game server | id; owner; name (unique per owner, ignoring case); Game server key as a SHA-256 hash with a unique index, plus its last 4 characters; registered time; last reported build stamp; last poll time; last reported processed Live configuration id and its result, both stored as reported; current Live configuration or none |
  | Draft | one per game server, created empty at registration; values; origin (a Ruleset version) or none; revision, raised on every save; last saved time |
  | Live configuration | at most one per game server; random id (UUID); values; origin or none; applied time; immutable, replaced by each Apply |
  | Ruleset | id; owner; name (unique per owner, ignoring case); created time |
  | Ruleset version | id; Ruleset; number (unique within its Ruleset; the next is the highest + 1); optional description; values; saved time; immutable |
  | Note | id; database (Character or Weapon); key name; author or none; sanitized HTML body; created time; edited time (an edit overwrites the body; there is no edit history) |
  | Platform setting | Supported build stamp, or none (while none, nothing is sent); set at; set by |

- **Deleting.**
  - A Ruleset takes its versions with it and clears every origin that pointed
    into them, both on Drafts and on Live configurations, in one transaction.
  - A game server takes its Draft, its Live configuration and its key.
  - Deleting a server owner removes their game servers, Drafts, Live
    configurations, Rulesets and used Invites. Their Notes lose their author.
    If they set the Supported build, set by reads "a former server owner".
- **Retention.**
  - A daily sweep deletes expired sessions.
  - An unused Invite's row is deleted 30 days after it expires or is revoked.
- **Not stored.**
  - Schemas and game defaults: they ship with each deploy.
  - Held polls and connection status: they live in process memory and are
    computed when asked.
  - Delivery events, operator actions, errors and Apply history: the journal
    is the only record of those.

### Values: reading, comparing, validating

- Reading any stored values (a Draft, a Live configuration, a Ruleset
  version, or import input) places each value under its key's current
  category, looked up from the current schema.
- A value whose key or weapon class the current schema does not have is
  dropped, and the drop is counted. Loading a Ruleset version tells the owner
  that count. Stored documents are never rewritten.
- "Modified" compares the stored overrides exactly, over the keys the current
  schema has. An override equal to the game default is not the same as no
  override. Dropped values do not count.
- Unapplied changes compares the Draft with the Live configuration by the same
  rule.
- Every Draft save validates against the current schema with today's
  validation, including the camera policy. An invalid field is not saved, and
  its error is returned for the editor to show. Apply validates the whole
  Draft again and blocks with the list of values to fix.

### Auth, Invites and sessions

- Discord OAuth asks only for the `identify` scope. The platform copies the
  user's id, username and avatar, then discards Discord's tokens. The Discord
  OAuth exchange sits behind one module boundary, which tests replace.
- Sign-in is allowed when:
  - the Discord id is already a server owner whose access has not been
    removed; or
  - the Discord id is listed in `OPERATOR_DISCORD_IDS` (the first sign-in
    creates their record); or
  - the person brings a valid, unused, unrevoked, unexpired Invite (the Invite
    is spent and the server owner created).

  Anyone else is refused as "invite-only", and nothing about them is stored.
  A server owner who opens an Invite is just signed in, and the Invite stays
  unused.
- An Invite code is random, stored only as a hash, and shown once as a link.
- A session is a random token in an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie. Only its SHA-256 hash is stored. A session expires 30 days after its
  last use. Requests that change data also check `Origin`.
- Sign out ends this session. Sign out everywhere ends all of the server
  owner's sessions. Remove access ends them too.
- Platform operator: any Discord id in `OPERATOR_DISCORD_IDS`. The setting is
  read from the instance's environment and is never stored in the database or
  the repo. Taking an id out of the setting makes that person an ordinary
  server owner.

### Game servers and the Game server key

- Registering creates the game server, its empty Draft and its key. The key is
  `ezc_gsk_` followed by 32 random bytes in base64url, 51 characters in all.
  It is shown in full once, after registering or regenerating; afterwards the
  page shows its last 4 characters.
- Regenerate key replaces the hash at once, with no grace period. A poll held
  on the old key is answered "key rejected".
- Connection status is computed when asked, never stored:
  - Connected: a poll is held, or one ended within about 15 s.
  - Not connected: shown with last seen.
  - Never connected: no poll yet.
  - EZConfig needs updating: the last reported build stamp is not the
    Supported build. Shown with both stamps.
- Live configuration state is computed from the game server's last reported
  processed id and result, never stored:
  - Confirmed: the reported id is the current Live configuration's, and its
    result succeeded. Ignored keys show as a warning on Confirmed.
  - Failed: the reported id is the current Live configuration's, and
    processing stopped at a failed command.
  - Pending: anything else, including an id the platform does not know.

  Before the first Apply there is no Live configuration and so no state.
- The Game.ini contract. These names are published and never change, the
  section names ignore case, and the URL must be quoted:

  ```ini
  [/Script/Mordhau.MordhauGameSession]
  bAllowHttpRequests=True

  [EZConfigPlatform]
  GameServerKey=ezc_gsk_...
  PlatformUrl="https://platform.example.org"
  ```

  `PlatformUrl` is optional and needed only to override the URL built into the
  mod. The setup checklist pastes only the first two lines of the section and
  the key.

### The poll exchange (the platform–mod contract)

- One endpoint, POST over HTTPS. Each request sends
  `Content-Type: application/json` and `Authorization: Bearer <Game server key>`.
  GET is not used: the engine's HTTP node never sends a GET's body.
- **The request carries:**
  - the build stamp;
  - an instance id, a new random id each time the mod starts on a map;
  - the id of the Live configuration the mod last finished processing, or none
    if it never processed one or its build stamp differs from the one saved
    with that id;
  - that processing's result, sent on every poll: success or failure, the
    counts, any unknown keys, and on failure the category (and weapon) it
    stopped at with the mod's error.
- **On each request the platform:**
  1. Looks the key up by its hash. An unknown key gets `401` "key rejected".
  2. Records the last poll time, the reported build stamp, and the reported
     id with its result.
  3. If the build stamp is not the Supported build (or no Supported build is
     set), sends nothing and answers "not the Supported build" when the hold
     ends.
  4. Otherwise, if the game server has a Live configuration whose id differs
     from the reported one, answers at once with the whole Live configuration
     and its id.
  5. Otherwise holds the poll for up to 50 s and answers "no change". If an
     Apply wakes the held poll first, it answers with the new Live
     configuration instead.
- **Superseding.** The newest poll from a game server supersedes the one the
  platform is holding, and the held one is answered "superseded". When polls
  from different instance ids supersede each other about 3 times within 5
  minutes, the server page warns "More than one server is using this key". A
  restart or map change supersedes once and does not trip the warning.
- **Held polls** live in one in-process registry, keyed by game server, along
  with the instance ids and the supersede count. The app runs as exactly one
  process.
- **The delivered Live configuration** is grouped by category using the
  deploy's schema, one entry per non-empty category, with values encoded as
  today's command builder encodes them. The mod processes it as today's
  command batch: wipe, run one command per non-empty category with each
  command all-or-nothing, stop at the first failed command and keep what was
  applied before it. One result carries the counts and unknown keys.
- **Sizes.** A typical delivery is a few KB, and one with every key set is
  about 100 KB. Only 64 KB is proven on the mod side so far.
- A server owner whose access was removed still has their game servers
  answered. A build change still re-delivers to them, but their Live
  configurations cannot change.
- The exact JSON field names are settled when this is built. They then become
  a published contract, like the Game.ini names, recorded in the mod's ADR for
  the poll loop.

### Draft, Apply and stale saves

- Every Draft write carries the revision it was based on, and is rejected if
  the Draft has moved on. Draft writes are: auto-save, loading a Ruleset
  version, Discard changes, Reset to game defaults, and Save as Ruleset
  version. A rejection returns the current Draft, so the tab can reload it and
  name the edits it did not save. There is no per-key merge.
- Open pages fetch the Draft again every few seconds, and the server status
  about every 2 s. Nothing is pushed to browsers.
- **The review.** It lists the keys added, changed and reset to game default,
  comparing the Draft with the Live configuration.
  - For the first Apply it lists every value the Draft sets, under the
    replace-everything warning.
  - When nothing changed it says "No changes; the server will be sent this
    configuration again".
- **Apply** carries the Draft revision and the Live configuration id (or none)
  its review was built from. If either has changed, Apply is rejected and the
  review reopens.
  - Apply also needs the game server to be Connected and on the Supported
    build. Both are checked again when the request arrives.
  - Apply validates the whole Draft.
  - Then, in one transaction, Apply replaces the game server's Live
    configuration with a new one under a new random id, carrying the Draft's
    values and its origin.
  - After the transaction commits, Apply wakes that game server's held poll.
- An Apply with no changes still makes a new id, so the game server is sent
  the configuration again. There is no separate Retry.

### Rulesets

- Save as Ruleset version creates version 1 of a new Ruleset, or the next
  version of an existing one, with an optional description. The new version
  becomes the Draft's origin. Saving never applies.
- Loading a version copies its values over the whole Draft and makes that
  version the origin. The response reports how many values were dropped.
- Rulesets can be renamed and deleted. A single version is never deleted.
  Rulesets belong to their owner and are never shared.

### Notes

- Notes are global and keyed by database and key name. The author comes from
  the session, never from the request body.
- An author edits and deletes their own Notes. The platform operator can
  delete any Note but edits none.
- Every body is sanitized on save against an allowlist of what the TipTap
  editor produces: paragraphs, bold, italic, underline, lists, code and
  `http(s)` links. Everything else is stripped.
- Notes on keys the schema no longer has are kept but hidden. A Note with no
  author shows "a former server owner".

### Platform operator pages

- **Invites:** make an Invite (the link is shown once), list unused ones,
  revoke one. A revoke sets the revoked time.
- **Server owners:** list them, Remove access, Restore access, and Delete
  (typed confirm). None of these is offered against an operator.
- **Notes:** delete any Note.
- **Supported build:** set it. The page shows its set at and set by.
- **Counts,** computed when the page loads: game servers registered,
  Connected now, and Connected by reported build stamp with the Supported
  build marked. No server or owner is named.
- **Health,** held in process memory: release commit, running since, and the
  number of warnings and errors since start with the newest 20.
- **Backup:**
  - Litestream's `heartbeat-url` calls the app on localhost every minute, on
    a path Caddy refuses from outside. The app keeps the time of the last
    call in memory and warns after 5 minutes without one, or 5 minutes after
    start with none yet.
  - The weekly restore check's result is read from a status file beside the
    database, never from the database itself. A missing file reads as never
    checked and shows the 8-day warning.
- The operator sees nothing of another owner's game servers, Drafts, Live
  configurations or Rulesets.

### Logging

- All logging goes through one module. It writes one JSON line per event
  (level, event name, platform ids) to stdout or stderr, which the systemd
  journal keeps.
- **Logged events:**
  - startup (release commit, migrations run), shutdown, and a crash with its
    stack;
  - Apply, delivery sent, and result reported;
  - superseded, and the "More than one server is using this key" warning;
  - a reported build that is not the Supported build, when it changes;
  - sign-in, and sign-in refused as "invite-only" with no Discord id;
  - "key rejected" polls, as one count per hour;
  - every operator action, and every error.

  Routine polls are never logged.
- **Never logged:** any part of a Game server key; session tokens; `Cookie`
  or `Authorization` headers; Invite codes or links; Discord OAuth codes,
  tokens or client secret; Note bodies; configuration values; Discord
  usernames; IP addresses.
- The module never serializes a raw request or error object, only the message
  and stack. As a backstop it redacts anything matching the `ezc_gsk_` pattern
  and the configured client secret.
- Errors and warnings also feed the health panel.

### Security headers

- The app sets a Content-Security-Policy with a nonce per request, in Next.js
  middleware. It allows `'self'` plus Discord avatars from
  `cdn.discordapp.com`, and blocks inline script that has no nonce.
- The platform is served over HTTPS only. Caddy adds HSTS (one year, no
  preload).

### Supported build and release order

- The Supported build is one build stamp (`YYYYMMDD-HHMMSS`), stored as a
  platform setting and set by the operator without a deploy.
- Release order:
  1. Publish the mod build.
  2. Deploy any schema change and switch the Supported build together.

  Until the switch, servers that restarted onto the new pak get nothing; after
  it, servers still on the old pak get nothing.
- Every mod publish disables Apply on every game server until it restarts onto
  the new pak. This is accepted for V1.

### Hosting and deployment

- **AWS project.** The owner's project on the Paid plan, in the selected
  Region us-east-2 (Ohio). The owner confirms the Region in AWS Settings >
  View all projects > Overview > Additional Info > Region before creating
  anything. Spend limit around $40, with an AWS Budgets alert at $20.
- **Cost.** About $15 a month: Lightsail $12, snapshots under $1, the bucket
  $1, the Route 53 zone $0.50, and the domain at about $15 a year.
- **Instance.**
  - One Lightsail instance on the $12 bundle (2 GB RAM, 2 vCPUs, 60 GB SSD,
    static IPv4), running Ubuntu 24.04 LTS.
  - Firewall: 80 and 443 open; 22 only from the owner's IP, or through
    Lightsail's browser SSH.
  - Unattended security upgrades. When one needs a reboot, the box reboots
    at 10:00 UTC.
  - Daily automatic snapshots, 7 kept.
- **Domain.** A domain bought through Route 53 Domains, with auto-renew and
  privacy protection. One hostname under it (for example `platform.<domain>`)
  serves both pages and polls. It is the URL built into every mod build, so
  it is chosen before the mod's built-in URL is set.
- **Caddy.**
  - Gets and renews a Let's Encrypt certificate.
  - Redirects HTTP to HTTPS and adds HSTS.
  - Proxies to the app on localhost, with timeouts well above the 50 s hold.
  - Writes no access log.
  - Refuses the heartbeat path from outside.
- **App.** Runs under systemd as `bun --bun next start`, exactly one process,
  restarted whenever it exits.
- **Instance settings.** One root-only env file loaded by the systemd unit
  holds the Discord client id, client secret and redirect URL,
  `OPERATOR_DISCORD_IDS`, `DATABASE_PATH` and the public URL. Litestream's
  bucket key lives in Litestream's own root-only config. The master copy of
  all of these is kept in the owner's password manager. The repo holds only
  `.env.example`.
- **Logs.** journald keeps 30 days and at most 2 GB, both set explicitly.
- **Backups.**
  - Litestream, pinned to 0.5.x at 0.5.12 or later, streams to a Lightsail
    object storage bucket with versioning on and 14 days of point-in-time
    restore.
  - A weekly timer restores the latest backup into a temp file, runs
    `PRAGMA integrity_check`, compares row counts per table with the live
    database, and writes the result to the status file.
  - A full restore drill (a fresh instance, restore, start, sign in) is
    written as a runbook in `docs/`. It is run before launch and after any
    change to backups.
- **Deploy.** The owner runs `deploy <commit>` from their PC:
  1. Over SSH, the instance fetches that commit from the public GitHub repo.
  2. It runs `bun install` and builds into a new release directory.
  3. It switches a `current` link and restarts the service.

  The last 3 releases are kept, and rollback means deploying an older commit.
  Only commits pushed to `main` that passed typecheck and the suite locally
  are deployed. There is no CI and no staging.
- **When the platform is down.** A Lightsail alarm emails the owner when the
  instance fails its status check. There is no uptime monitoring outside AWS.
- **Restarts.** A restart drops held polls, so a game server is Not connected
  for about 10 to 20 s, and Apply is refused meanwhile.

### Mod work (done in the mod repo)

The mod's `.scratch/online-platform/` holds this work's evidence. The mod gets
an ADR when its poll loop is built, since the loop changes how ADR 0010's
batches arrive.

- **The poll loop and its guards.**
  - Check the URL is non-empty before each request.
  - POST only.
  - One request in flight per node.
  - A watchdog longer than 180 s that treats a lost callback as a failure.
  - `IsValid` on every response.
  - After a failure, wait about 10 s and poll again. After "superseded", wait
    about 10 s. After a delivery is processed, poll again at once with the
    result.
- **Reading Game.ini before every poll,** with `GetCustomConfigVar_String`:
  - `[EZConfigPlatform] GameServerKey`, sent as the Bearer token. With no
    key: no poll, one log line per map ("EZConfig: no GameServerKey in
    Game.ini; not contacting the platform"), and the value read again every
    60 s.
  - `PlatformUrl`, overriding the built-in URL. A missing or empty value, or
    one that is not `https://`, falls back to the built-in URL. Plain
    `http://` is allowed only to a loopback address. A rejected override is
    logged with its likely cause, a missing quote.
- **"Key rejected" (`401`):** log "EZConfig: the platform rejected this
  server's GameServerKey" once (log only, not chat), keep the snapshot, and
  retry every 60 s.
- **Every poll carries:**
  - the build stamp;
  - an instance id (a New Guid at each map start);
  - the last processed Live configuration id, with its result.
- **Processed id.** Saved with the snapshot only when processing ends,
  together with its result and the build stamp. No id is reported when the
  mod's own build stamp differs from the saved one.
- **Delivery message.** Counts changed values (added, changed, or removed
  back to the game default) against what the server had. It goes to chat and
  the log, for example "EZConfig: received 140 values, 12 changed", with
  "incomplete" added when processing stopped partway. With nothing changed,
  it goes to the log only. Manual commands keep today's command
  acknowledgment.
- **Built-in URL.** The platform URL is built into each mod build.
- **Proof.** A response above 64 KB (about 100 KB) decodes.
- The mod's chat and RCON config commands stay unchanged.

### One-time import

- A one-off Bun script, run by hand on the instance against `DATABASE_PATH`.
  It reads the old formats with its own readers.
- Arguments: the copied `Databases/`, `Presets/` and `Notes/` folders; the
  owner's Discord user id; the game server name; the owner's old username;
  optionally the "Self-hosted" Ruleset name.
- **What each thing becomes.**
  - `Databases/` becomes the named game server's Draft, and also version 1 of
    the "Self-hosted" Ruleset, which is the Draft's origin.
  - Each user preset, and each `Presets/Static/` preset except `GameDefault`,
    becomes a Ruleset with one version 1. The Ruleset takes the manifest's
    title (or the folder name if the title is empty or the manifest is
    missing), and version 1 takes the manifest's description.
  - Notes by the old username become the owner's; other Notes have no author.
    Created time is the import time, and the order within a key is kept.
    Bodies pass the sanitizer.
- **Values.**
  - Read by key name, with no category.
  - Unknown keys, unknown weapon classes and invalid values are dropped and
    reported.
  - A key found in two category files is imported once if both values match.
    If they differ, the file for the key's current category wins and the
    other value is reported as dropped.
  - Any file that is not valid JSON fails the import.
- **Safety.**
  - A dry run by default; `--commit` writes, in one transaction.
  - It refuses if the target Draft was ever saved or the server has a Live
    configuration, if a Ruleset name it would create already exists (ignoring
    case), or if two names inside the import collide.
- **The report:**
  - each destination with its value count;
  - every dropped value, with its database, weapon class, key, file and
    reason;
  - Note attributions and Notes on hidden keys;
  - Note bodies the sanitizer changed.
- The script and its tests are deleted after the owner's import has run.

### Docs

- `docs/automatic-sync.md`, `docs/server-processing-results.md` and
  `docs/parry-geometry-migration.md` describe removed code. They move to the
  archive.
- New docs:
  - the restore runbook;
  - deployment and instance setup;
  - the poll exchange contract;
  - the Game.ini contract.
- `AGENTS.md` changes:
  - its commands, environment settings and RCON safety sections describe the
    platform;
  - the pending decision on the parry-geometry hook is closed.

## Testing Decisions

**What makes a good test here.**

- A test drives the platform the way a browser or a game server would, through
  its HTTP route handlers. It asserts on responses and on what later requests
  return, not on tables, internal functions or call counts.
- The exception is a property that only exists at rest, such as a Game server
  key never appearing in the database file. A test may read the file itself
  for that.

**Seams, as confirmed with the owner on 2026-11-02.**

1. **The platform's route handlers. This is the one automated seam for the
   platform.**
   - Tests call the handlers in-process with real `Request`s, against a real
     SQLite database in a temp file with every migration applied.
   - The env must be set before import, so these tests run as child fixtures
     spawned by a test, the way they do today.
   - Discord's OAuth exchange is the only fake, replaced at its module
     boundary as the RCON service is mocked today. No test opens a real
     network connection.
   - Time comes from `bun:test`'s `setSystemTime`. The poll hold length can be
     set for tests.
2. **The import script,** run as a child process on temp copies of
   self-hosted folders built by the test. These tests are deleted with the
   script.
3. **The mod**, in the mod repo. Its harness runs against a local platform at
   `PlatformUrl="http://127.0.0.1:…"`, using the kit's `--allow-http` and
   `--game-ini` options. Evidence goes in the mod's `.scratch/online-platform/`.
4. **Hosting,** proved by hand on the instance in the first build slice, with
   the results recorded in this feature's `.scratch`:
   - a 2-minute held poll through Caddy and Next.js on Bun;
   - Litestream streaming to the Lightsail bucket, with its heartbeat
     reaching the app.

**What the route-handler seam covers.**

- **Sign-in:**
  - an operator gets in without an Invite;
  - an Invite is spent, and an expired, revoked or used one is refused;
  - an existing owner who opens an Invite leaves it unused;
  - "invite-only" stores nothing;
  - removed access is refused even with an Invite;
  - session expiry, sign out and sign out everywhere;
  - the `Origin` check on requests that change data.
- **Game servers:**
  - register, with names unique per owner ignoring case;
  - the key is shown once and only its hash and last 4 characters are kept;
  - regenerate rejects the old key at once, including a held poll;
  - delete;
  - each connection status, with time moved forward.
- **The poll exchange:**
  - `401` for an unknown key;
  - "not the Supported build", and nothing sent while no Supported build is
    set;
  - the whole Live configuration only when the reported id differs,
    including an unknown id;
  - "no change" when the hold ends;
  - an Apply waking a held poll;
  - superseding and the shared-key warning;
  - a new server receiving nothing before its first Apply;
  - re-delivery after the mod reports no id;
  - the delivered configuration grouped by category.
- **Live configuration state:** Pending, Confirmed (with an ignored-keys
  warning) and Failed, computed from reported results.
- **Draft:**
  - auto-save validation;
  - stale-revision rejection on every kind of Draft write;
  - Discard changes and Reset to game defaults;
  - Unapplied changes and modified.
- **Apply:**
  - the review (added, changed, reset; the first-Apply list; no changes);
  - refused when Not connected, Never connected or on another build;
  - refused on a stale revision or Live configuration id;
  - blocked by values the schema rejects;
  - a no-change Apply gets a new id.
- **Rulesets:**
  - save a new Ruleset or the next version;
  - load, replacing the Draft, setting its origin and counting dropped
    values;
  - values placed under their key's current category;
  - rename with unique names;
  - delete clears origins and keeps values;
  - privacy between owners.
- **Notes:**
  - author taken from the session;
  - edit and delete only one's own;
  - the operator deletes any Note;
  - the sanitizer allowlist;
  - Notes on hidden keys;
  - "a former server owner".
- **Operator:**
  - Invites, Remove and Restore access, Delete with its cascade;
  - the Supported build with its set at and set by;
  - counts;
  - no access to another owner's data;
  - none of the operator actions offered against an operator.
- **Logging:** with stdout captured during a poll, an Apply and a failed
  sign-in, no key, token, value, username or IP appears, and a planted
  `ezc_gsk_` string is redacted.
- **Content-Security-Policy:** a page response carries the nonce-based policy
  with the allowed sources.
- **Startup:**
  - migrations apply in order, each in a transaction;
  - the `VACUUM INTO` copy is taken and pruned;
  - the app refuses a database newer than its code.

**Prior art.**

- Route handlers called in-process against isolated temp storage, from a
  spawned child fixture: the config-collaboration test and its fixture.
- Module mocking at a boundary: the console API test's mock of the RCON
  service.
- Startup and interruption fixtures for a storage migration: the
  parry-migration tests.
- Component-level UI tests in `.tsx`: the camera-policy and game-defaults UI
  tests.

**What stays and what goes.**

- The schema, validation and string-schema tests stay. Their counts and
  fixtures keep deriving from the string schemas.
- Tests of the self-hosted storage, the RCON transport, the batch client and
  automatic sync go with that code.
- Hand-off for every slice: `bun run typecheck` and the full suite pass, and
  the lint count does not rise.

## Out of Scope

- Co-admins and roles; V1 is owner-only.
- Sharing Rulesets (a public library, share links, forking).
- Live collaborative editing and per-key merging of Draft saves. Stale saves
  are rejected instead.
- Selective Apply, and a separate Retry action.
- Apply history: keeping, listing or rolling back to earlier Live
  configurations. Rolling back means loading a Ruleset version.
- Reading values back from a game server. The platform stays the source of
  truth, and drift from manual commands is not tracked.
- Configs for mods other than EZConfig.
- The self-hosted single-server mode, and supporting other instances of the
  open-source core beyond the Game.ini URL override.
- High availability, a database server, Redis or DynamoDB, and more than one
  app process.
- Public sign-up, billing and abuse handling.
- Importing other owners' self-hosted data.
- Key contracts: numbered contracts, migrating Ruleset versions, a list of
  supported stamps, and tooling for key renames.
- Alerts outside the platform (Discord DM, email) about game server states.
- Self-service account deletion.
- A recent-activity list per game server, an audit table, an error table, an
  outside error service, and reporting of browser errors.
- Pushing status to browsers over a held connection.
- Built-in presets.
- CI, a staging environment, Docker, CloudFront, a load balancer, ACM, and
  uptime monitoring outside AWS.

## Further Notes

- **Suggested slicing order.**
  1. A walking skeleton on the instance that proves the hosting risks
     (`online-platform#10`, `#15`): a 2-minute held poll through Caddy and
     Next.js on Bun, and Litestream with its heartbeat.
  2. Storage, migrations and sign-in with Invites.
  3. Game servers and the poll exchange, alongside the mod's poll loop.
  4. Draft, Apply and the indicators.
  5. Rulesets.
  6. Notes.
  7. Operator pages, logging and backup status.
  8. The import and the cutover.
- **Cutover order** (`online-platform#13`):
  1. Stop the self-hosted app on the VPS for good; its RCON automatic sync
     would otherwise push old values on a server restart.
  2. Copy the old folders to the instance.
  3. Sign in and register the game server.
  4. Dry-run the import, then `--commit`.
  5. Set up Game.ini and the Supported build.
  6. Review the Draft and Apply.
- **Derived while assembling.** These follow from the tickets but no ticket
  states them. Check them when slicing:
  - Grouping the delivered configuration by category on the platform. The
    mod's batch runs one command per category, while stored values carry no
    category.
  - Holding a "not the Supported build" poll like any other and answering it
    when the hold ends, so that an outdated game server does not poll in a
    tight loop.
  - The parry-geometry startup migration going with file storage, which
    closes the pending decision in `AGENTS.md`.
- **Not decided.** Renaming a game server. Rulesets can be renamed; if game
  servers can too, the same uniqueness rule applies.
- **Linux.** Linux rented hosts need no special handling beyond OS CA
  certificates, which standard images include (`online-platform#12`).
- **Mod tracking.** Mod-side tickets and evidence live in the mod's
  `.scratch/online-platform/`, and this repo's tracker holds the platform
  work. Refer to tickets as `online-platform#NN`.
