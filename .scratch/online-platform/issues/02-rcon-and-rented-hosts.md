# 02: Can a hosted platform use Mordhau RCON, and what do rented Mordhau hosts expose?

Status: resolved
Type: research
Created: 2026-11-01
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

## Question

Facts that [How do the platform and a game server talk?](05-platform-game-server-communication.md)
waits on:

1. Mordhau RCON as a transport across the internet: is the password and
   payload sent in plain text; is there any encrypted option; how many
   concurrent connections does the server allow; idle timeouts and keepalive;
   how long-lived `listen` subscriptions behave; known reliability problems.
2. Rented Mordhau hosting: which providers host Mordhau servers today, and for
   each, whether the RCON port is reachable from the internet, whether access
   can be limited by source IP, whether the owner sets the RCON password,
   edits `Game.ini` and startup arguments, installs mod.io mods, or can run any
   extra process; and whether the provider's own panel holds an RCON
   connection.

## Context

- Existing protocol facts: `docs/automatic-sync.md`,
  `docs/server-processing-results.md` (native packet capture, `rcon-client`
  4.2.5 dropping unsolicited packets) and
  `tests/fixtures/native-processing-packets.json`.
- Read-only: never open a connection to a real server.

## Answer

- RCON is plaintext Source RCON: the password and every payload cross the wire unencrypted. Mordhau has no TLS option and no IP allow-list key (high confidence: Valve spec plus Mordhau's own Game.ini). The password is full admin (`shutdown`, `mountpak`, `modifyinivar`).
- No documented connection cap. Official-server runs held at least 6 client entries at once (medium; the ceiling is untested).
- `RconTimeout=120` by default. Keep the connection alive with `alive` (community bots send it every 10–30 s). `listen` is per connection and toggles, so re-subscribe after reconnecting and never send it twice. It survives `changelevel` (verified on build 702625635).
- `MaxRconPacketSize=4096` is configurable. Overflow behaviour and multi-packet splitting are untested on Mordhau (the >4 KB command risk is open).
- Rented hosts (G-Portal, Nitrado, Host Havoc, GTXGaming, Shockbyte, Pingperfect, LogicServers, EmeraldHost, others): the owner edits Game.ini (RCON password/port, `Mods=<mod.io id>`). The RCON port is internet-reachable. No host documents source-IP restriction or extra processes. TCAdmin panels send RCON commands one at a time and hold no `listen` (medium-high; per-host docs are thin).
- Detail, sources and per-provider table: [research/02-rcon-and-rented-hosts.md](../research/02-rcon-and-rented-hosts.md).
