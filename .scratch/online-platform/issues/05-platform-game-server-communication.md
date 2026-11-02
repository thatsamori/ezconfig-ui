# 05: How do the platform and a game server talk?

Status: open
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
