# 08: What happens between a live change and the server confirming it?

Status: resolved
Type: grilling
Created: 2026-11-01
Blocked by: 04, 05
Parent: [Map: EZConfig online platform](../map.md)

## Question

From the moment a change becomes live (on Apply, per
[How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md))
until the game server confirms it, decide:

- What the platform records: the state the owner wants versus the state the
  server has confirmed.
- What happens when the server is offline, restarts or changes map, rejects a
  value, or the result is uncertain.
- How the owner sees each of those states.
- How a stale save is rejected, for example from two open tabs.

## Context

- On startup the config actor restores its saved snapshot, then asks for an
  update (mod `docs/server-persistence.md`).
- Today's rule for uncertain results: never replay automatically (`docs/server-processing-results.md`).
- Today's stale-save check: `src/lib/database/revision.ts`.
- From [How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md):
  a change becomes live only on Apply, which sends the whole Draft after a
  review that includes reset-to-default rows. The Draft auto-saves, so the
  stale-save check runs on every auto-save, and two tabs on one Draft will
  meet it often. A Live configuration is Pending until confirmed, then
  Confirmed ([CONTEXT.md](../../../CONTEXT.md)).
- From [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md):
  a game server not running the Supported build gets nothing sent and keeps
  its saved snapshot; every mod publish cuts every server off until it
  restarts onto the new pak. Decide what the owner sees meanwhile, and whether
  the Live configuration is re-delivered once the server reports the
  Supported build (today every map start asks for a full re-sync).
- From [How do the platform and a game server talk?](05-platform-game-server-communication.md):
  the mod long-polls; each poll reports the id of the Live configuration it
  last processed and that result, and the platform sends the whole Live
  configuration only when the id differs. Confirmed comes from the poll that
  reports processing the id. A failed delivery counts as processed and is
  never resent automatically. A server that restarts onto the Supported build
  reports its id and gets the Live configuration if it differs. A delivery
  that stops partway is reported "incomplete". Connection status (Connected,
  Not connected, Never connected) is computed. Decide what the owner sees for
  another build, and for a failed or an incomplete delivery.
- From [Where does each entity get stored?](07-entity-storage.md): the Draft
  carries a revision raised on every save, for the stale-save check. A game
  server has no Live configuration until its first Apply and keeps its saved
  snapshot meanwhile, so the first Apply's review cannot know what the server
  holds. A reported id the platform does not know counts as differing. The
  game server keeps only the last reported result.

## Answer

Resolved 2026-11-02 by grilling the owner. Terms changed in
[CONTEXT.md](../../../CONTEXT.md): Failed and Unapplied changes added;
Confirmed narrowed to a successful result.

**States.** A game server's Live configuration is Pending, then Confirmed or
Failed. The state is computed from the game server's last reported processed
id and result (the fields set by
[Where does each entity get stored?](07-entity-storage.md)), never stored.
- Confirmed: the reported id is the current Live configuration's and its
  result succeeded. A success that ignored keys is still Confirmed, with a
  warning naming them. With the Supported build matched that means the
  operator switched the build before deploying its schema.
- Failed: processing stopped at a failed command. The server keeps what it
  applied before that command, so it runs only part of the configuration. The
  delivery message's "incomplete" is the in-game wording for Failed, not a
  separate state. Never resent automatically.
- Pending: anything else, including a reported id the platform does not know.
- Only the current Live configuration has a state. Before the first Apply there
  is none, and the server runs its own saved values.

**Interrupted processing is delivered again.** The mod saves the processed id
only when processing ends. The mod saves its snapshot after every accepted
command, wipe included (mod `docs/server-persistence.md`), so a crash or map
change partway leaves a partial snapshot and the old id, and the next poll gets
the whole configuration again. The owner sees Pending throughout; there is no
uncertain state. This drops today's "never replay automatically"
(`docs/server-processing-results.md`) for this case: RCON could not tell
whether a command ran, the id can, and wipe-then-replace is safe to repeat.

**Every poll carries its result.** The mod saves the result with the processed
id and sends both on every poll. This refines
[How do the platform and a game server talk?](05-platform-game-server-communication.md),
which sent the result only until reported: a lost reporting poll followed by a
restart no longer loses it.

**Re-delivery after a build change.** The mod saves its build stamp with the
processed id and reports no id when its own stamp differs, so a server that
restarts onto a new build gets its Live configuration once more.
- Why: the snapshot holds values under their category. A build that moves a
  key between categories, as the parry-geometry move did
  (`docs/parry-geometry-migration.md`), would leave that value unread while
  the platform shows Confirmed.
- Rejected: re-delivering on every map start (today's behaviour: a full wipe
  and re-apply on every client each map), and never re-delivering.

**Apply only when the server can receive it.** Apply is enabled only while the
game server is Connected and runs the Supported build; the platform checks both
again when the request arrives. The disabled button says which is missing: Not
connected, Never connected, or EZConfig needs updating. The Draft stays
editable throughout. This settles
[How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md)'s
"Apply says EZConfig needs updating" as a disabled Apply.
- Why (the owner): to the owner, Apply edits what is on the game server. It
  also keeps a server that returns days later from switching configuration
  mid-session on an Apply the owner has forgotten.
- Accepted: every mod publish disables Apply on every game server until it
  restarts onto the new pak.
- Rejected: Apply always allowed, Pending until the server can receive it.
- A server that drops after Apply, before delivery, stays Pending and gets
  that Live configuration when it returns. Nothing expires.
- Apply while a delivery is in flight needs no rule: the newer Live
  configuration replaces the current one, and the server's next poll gets it.

**Apply with no changes re-sends.** Apply is allowed when the Draft equals the
Live configuration. It makes a new Live configuration with the same values, so
the server is sent it again; the review says "No changes; the server will be
sent this configuration again". This is the owner's recovery after Failed and
for wiping drift left by manual commands. There is no separate Retry.

**The first Apply's review** lists every value the Draft sets, under a
warning: every EZConfig value the server has now is replaced, and anything not
in this Draft returns to game default. Only the first Apply gets it, since the
platform cannot know what the server holds until then.

**Stale saves.** Every Draft write carries the Draft revision it was based on
and is rejected if the Draft has moved on: auto-save, loading a Ruleset
version, Discard changes, Reset to game defaults, and Save as Ruleset version.
The rejected tab reloads the Draft and names the edits it did not save. Open
tabs refresh the Draft within a few seconds, so an idle tab rarely meets a
rejection.
- Apply carries the Draft revision and the Live configuration id (or none) its
  review was built from. If either has changed, Apply is rejected and the
  review reopens.
- Rejected: a per-key check, which merges edits and edges toward live
  collaborative editing (out of scope). Today's per-key, last-writer-wins
  saves (`src/lib/store/configSync.ts`) go.

**Invalid values.** Invalid values never enter a Draft: each auto-save
validates against the schema, and an invalid field shows its error in the
editor and is not saved. Apply validates the whole Draft again against the
current schema, since a deploy can tighten a key, and blocks with the list of
values to fix. A rejection on the game server is then a bug, shown as Failed.

**What the owner sees.** The server list and the server page show three things
for each game server, refreshed about every 2 s while the page is open:
- Connection: Connected; Not connected, with last seen; Never connected, with
  a setup checklist (`bAllowHttpRequests`, the Game server key in Game.ini);
  EZConfig needs updating, with the running and the Supported build stamps.
- Live configuration: none yet (the server runs its own saved values);
  Pending, with how long, and no timeout or stuck state; Confirmed, with when,
  plus any ignored-keys warning; Failed, naming the category (and weapon) it
  stopped at and the mod's error, and saying the server runs only the
  categories before it.
- Unapplied changes, when the Draft differs from the Live configuration.
- Rejected: one merged status line, which hides states such as "Failed, and
  now Not connected"; pushing status to the browser over a held connection.
- No alerts outside the platform (Discord DM, email) in V1: the in-game
  delivery message already tells players and the log. Ruled out of scope on
  the map.

**Graduated.** History was already graduated, while this ticket was open, by
[Where does each entity get stored?](07-entity-storage.md), as
[What does the owner see of earlier Live configurations?](14-earlier-live-configurations.md).

**Handed on.**
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
  (resolved): its mod work gains saving the processed id only when processing
  ends, saving the result and build stamp with it, sending the result on every
  poll, and reporting no id after a build change. Noted on that ticket.
- [What does the owner see of earlier Live configurations?](14-earlier-live-configurations.md):
  states are computed from the last reported id and result, so only the
  current Live configuration has one; an outcome for earlier ones needs more
  storage. A no-change Apply makes a Live configuration identical to the one
  before it.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  the Never connected view's setup checklist includes the step that puts the
  Game server key on the game server.
- [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  each open server page polls status about every 2 s; Apply needs to know at
  request time whether the game server is Connected.
- No ADR: each decision here reverses cheaply. The spec carries the review,
  the indicators and the Failed detail.
