# 05: How do the platform and a game server talk?

Status: resolved
Type: grilling
Created: 2026-11-01
Blocked by: 01, 02, 11
Parent: [Map: EZConfig online platform](../map.md)

## Question

Which side opens the connection, and over what? The options so far: the
platform dials each server's RCON; the mod polls the platform over HTTP; or a
mix, such as RCON as a nudge and HTTP for the data. With rented hosting and no
helper process beside the game, decide:

- The path for config delivery, for the startup and reload handshake
  (`ezconfig requestupdate`), and for processing results.
- What each GameServer record holds: RCON host, port and password, a
  per-server platform credential (the "game mod client key" from the owner's
  first design), or both.
- How the 5 s requirement is met (poll interval, push or nudge).
- What the existing acknowledged batch protocol keeps or loses.

## Context

- [Can a server mod built only from Blueprints make outbound HTTP requests?](01-blueprint-outbound-http.md)
- [Can a hosted platform use Mordhau RCON, and what do rented Mordhau hosts expose?](02-rcon-and-rented-hosts.md)
- [Does the Mordhau Http Request node work on a cooked dedicated server?](11-prove-mordhau-http-request.md):
  its answer lists the poll, long-poll and crash-risk facts this ticket needs.
- Latency from charting: RCON push is about one round trip; polling is up to
  one poll interval plus a round trip; a long poll is about one round trip if
  the mod's HTTP client can hold a request open. Polling also coalesces edits,
  at most one in-game re-apply per interval, which bears on auto-save in
  [How does a server's live configuration relate to Rulesets?](04-live-configuration-and-rulesets.md).
- Today's RCON apply: one command per non-empty category (a JSON object of that
  category's keys) inside an `ezconfig batch` begin/command/end frame
  (mod `docs/adr/0010-command-batches-and-atomic-commands.md`),
  sent one at a time, each waiting for its processing result (`src/lib/rcon/batch.ts`). A full apply costs 3 + (non-empty categories)
  round trips, which across the internet decides whether it fits in 5 s.
- Hosted RCON means every customer server exposes its RCON port to the
  internet, the platform stores admin passwords, and the responder holds one
  long-lived connection per server, which rules out request-only hosting.
- From [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md):
  the platform sends nothing to a game server unless it runs the Supported
  build, so the mod must report its build stamp in a form the platform can
  read. Today the stamp reaches only the console and chat (`ezconfig version`).

## Answer

Resolved 2026-11-02 by grilling the owner. Terms added to
[CONTEXT.md](../../../CONTEXT.md): Game server key, Connected. How the mod reads
Game.ini: [research/05](../research/05-blueprint-read-server-config.md).

**HTTP, not RCON.** Each game server's mod long-polls the platform over HTTPS.
The platform never uses RCON.
- Rejected: the platform dialling each server's RCON. It would hold every
  owner's full-admin password and send it in plain text across the internet,
  keep one connection per server, and pay 3 + (non-empty categories) round
  trips per Apply in 4 KB packets.
- Rejected: an RCON nudge with HTTP for the data. It keeps all of RCON's
  exposure for speed that long polling already gives.
- The owner sets `bAllowHttpRequests=True` in Game.ini. Without it every
  request fails with `-1` and nothing reaches the platform.
- POST only: GET is broken
  ([Does the Mordhau Http Request node work on a cooked dedicated server?](11-prove-mordhau-http-request.md)).
  Every request sends an explicit `Content-Type: application/json` and
  `Authorization: Bearer <Game server key>`.

**One poll exchange.** One endpoint carries delivery, the startup handshake and
results.
- The request carries the build stamp, the id of the Live configuration the
  server last processed, and that processing's result if it has not been
  reported yet. The id is saved with the mod's snapshot, so it survives
  restarts and map changes.
- The response is one of:
  - "no change", when the hold ends;
  - the whole Live configuration (both databases) with its id, sent only when
    that id differs from the reported one;
  - "not the Supported build", with nothing sent.
- After processing, the mod polls again at once with the result. That poll
  makes the Live configuration Confirmed.
- The first poll after a restart or map change replaces
  `ezconfig requestupdate`. A server whose snapshot already holds the Live
  configuration gets nothing.
- After a failure the mod waits about 10 s and polls again. A watchdog longer
  than 180 s treats a lost callback as a failure. The newest poll from a game
  server supersedes one the platform still holds.
- The whole configuration, never a diff: Apply takes the whole Draft, and
  wipe-then-replace makes a repeat harmless. A typical one is a few KB; every
  key on every weapon is about 100 KB, and only 64 KB is proven.

**The 5 s requirement.** Long polling: the platform answers a held poll the
moment Apply makes a new Live configuration, so it arrives in about one round
trip. The platform sets the hold below the engine's 180 s `HttpTimeout` and
below the idle timeout of anything in front of it. The promise covers
Connected game servers.
- Long polls need a process that stays running. On Lambda every held second is
  billed, about $100/month at 20 servers.
- Rejected: short polling every ~3 s. It fits request-only hosting (Lambda
  plus DynamoDB), but costs about 17 M requests a month at 20 servers and adds
  up to 3 s.

**The acknowledged batch protocol.** Its processing stays in the mod; its RCON
wire goes.
- Kept: a delivery runs as today's batch. The mod wipes, runs one command per
  non-empty category, each command all-or-nothing, stops at the first failed
  command and keeps what it applied (mod
  `docs/adr/0010-command-batches-and-atomic-commands.md`). One result carries
  the counts and unknown keys.
- A failed delivery counts as processed: its id is reported, so it is never
  resent automatically, as today.
- Lost: the wire handshake (admission, `listen custom`, the `Custom:` envelope,
  request and sequence correlation, the bounded abort), the per-command round
  trips, and in the webapp the RCON service, the automatic-sync responder and
  its owner lock.
- Rejected: all-or-nothing deliveries. Rollback would be new mod work, and a
  rejection means a bug: the platform checks every value before Apply, and the
  Supported build keeps the key sets matched.

**Delivery message.** After a delivery the mod tells chat (every player) and
the server log how many values it received and how many changed, for example
"EZConfig: received 140 values, 12 changed".
- Changed means added, changed or removed (back to the game default) compared
  with what the server had.
- With nothing changed it writes only to the log. A delivery that stopped
  partway adds "incomplete".
- Counting changed values is new: today's counts include unchanged values
  (ADR 0010). Manual commands keep today's Command acknowledgment.

**Manual commands.** The mod's chat and RCON config commands stay as they are.
A manual change on a game server is drift the platform does not track, until
the next Apply wipes and replaces it.

**GameServer record.** Name, owner, Game server key, last reported build stamp,
last poll time, and the id of the Live configuration it last reported
processing, with that result. No RCON host, port or password. Connection status
is computed when asked, never stored: a stored status would stay "connected"
after a crash or restart.
- Connected: a poll is open, or one ended within about 15 s.
- Not connected: shown with "last seen".
- Never connected: registered, no poll yet.

**Platform URL.** Each mod build has the platform URL built in. An owner
overrides it in Game.ini, beside `RconPassword` and `bAllowHttpRequests`; the
mod reads it on the server with Mordhau's `GetCustomConfigVar_String` before
each poll.

```ini
[EZConfigPlatform]
PlatformUrl=https://platform.example.org
```

- A missing or empty value, or one that is not `https://` (plain `http://` only
  to a loopback address, for testing), falls back to the built-in URL.
- The section and key names never change once published. `[EZCONFIG]` is
  avoided: the SDK has a stale section of that name, and section names ignore
  case.
- Why an override: the platform's core will be open source, so others may run
  their own instance (map Notes).
- Dropped: an admin-only override command, since Game.ini covers testing and
  other instances. Rejected: a Blueprint config variable (`BP_EZConfigB` would
  read Engine.ini) and a startup argument (rented hosts rarely allow one).

**Mod work for the spec.**
- The poll loop and its guards: a non-empty URL, POST only, one request in
  flight per node, the watchdog, `IsValid` on every response.
- The build stamp in every poll.
- The processed Live configuration id, saved with the snapshot.
- Counting changed values, and the delivery message.
- Reading the Game.ini URL.
- Proving a response above 64 KB (about 100 KB) decodes.

**Graduated.**
[Does the HTTP node work on Linux, and can the mod read Game.ini?](12-prove-linux-http-and-game-ini.md):
one throwaway probe on the owner's Linux box and in the Windows kit sandbox.

**Handed on.**
- [Where does each entity get stored?](07-entity-storage.md): the GameServer
  fields above; a Live configuration has an id; connection status is not
  stored.
- [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  Confirmed comes from the poll that reports processing the id; a failed
  delivery is not resent; a server that restarts onto the Supported build
  reports its id and gets the Live configuration if it differs. Decide what
  the owner sees for another build, a failed or an incomplete delivery.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  no RCON passwords are stored. Issuing, storing and rotating the Game server
  key, where the owner enters it (the `[EZConfigPlatform]` section is the
  natural place), and proving control of the server. A Game.ini URL override
  sends the key to that address.
- [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  compute that holds long polls in a process that stays running; the hold
  length; how the one instance holds polls and answers them on Apply.
- No ADR yet: the mod gets one when its poll loop is built, since that changes
  how ADR 0010's batches arrive.

## Comments

- 2026-11-02, from
  [What happens between a live change and the server confirming it?](08-live-change-to-confirmed.md):
  refines the poll exchange. The mod saves the processed id only when
  processing ends, so an interrupted delivery is sent again. It saves the
  result and its build stamp with the id, sends the result on every poll (not
  only until reported), and reports no id when its own build stamp differs
  from the saved one. These join the mod work above.
- 2026-11-02, from
  [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  adds to the poll exchange. The mod reads `[EZConfigPlatform] GameServerKey`
  before every poll and sends it as the Bearer token. With no key it does not
  poll (one log line per map, the value read again every 60 s). After `401`
  "key rejected" it logs once and retries every 60 s. Every poll carries an
  instance id the mod picks when it starts on a map; a superseded poll is
  answered "superseded" and the mod waits about 10 s. These join the mod work
  above.
- 2026-11-02, from
  [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md):
  the platform holds each poll for up to 50 s, then answers "no change".
  Held polls live in one in-process registry, and Apply wakes the game
  server's held poll after its transaction commits. A platform restart drops
  held polls, so a game server is Not connected for about 10 to 20 s.
