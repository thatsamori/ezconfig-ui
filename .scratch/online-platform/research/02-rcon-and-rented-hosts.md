# Research 02: Mordhau RCON over the internet, and what rented Mordhau hosts expose

Ticket: [02-rcon-and-rented-hosts](../issues/02-rcon-and-rented-hosts.md).
Researched 2026-11-01. Read-only: no connection was opened to any game server;
the "Mordhau-verified" facts come from captures already in this repo and the
webapp, recorded against the official dedicated server on 2026-09-09.

Evidence labels used below:

- **[M]** Mordhau-verified: official dedicated server build `702625635`
  (`info` reports "Release 26, Revision 25635"), Mordhau's own generated
  `Game.ini`, or the local SDK binary.
- **[S]** Generic Source RCON (Valve spec). True of SRCDS; Mordhau may differ.
- **[C]** Community client code (what people running Mordhau bots do).
- **[P]** Hosting-provider documentation or product page.

## Summary

- **Plain text, no encryption [S][M].** The Source RCON protocol sends the
  password in the body of the first (`SERVERDATA_AUTH`) packet as ASCII, and
  every command and response the same way. The spec defines no TLS or
  encryption. Mordhau's full `[/Script/Mordhau.MordhauGameSession]` key list
  has no TLS, certificate or IP allow-list key. Anyone on the network path
  can read the password and the payloads.
- **The password is full admin [M].** Mordhau's RCON `help` includes
  `shutdown`, `mountpak <Path to pak file>`, `modifyinivar` (rewrite
  `game`/`engine` ini values), `ban`/`unban` and `addadmin`. A platform
  holding 20 RCON passwords holds full control of 20 servers.
- **Connection limit: none documented, none hit [M].** Recorded runs kept a
  listener, a batch connection and a second subscriber open at once, and one
  run had six live client entries at the same moment. No hard cap was found
  in any source.
- **Idle timeout ~120 s; keep alive with `alive` [M][C].** `RconTimeout=120`
  is the generated default. Mordhau has an `alive` command whose reply is
  "Keeping client alive for another N seconds". Community bots send `alive`
  every 10 s (Refractor) or 30 s (Mordhau-RCON) and reconnect on failure.
- **`listen` is per connection and survives map travel [M].** `listen custom`
  replies "Now listening to custom broadcasts". The connection and its
  subscription survived a native `changelevel`. The help text says `listen`
  *toggles*, so sending it twice may unsubscribe. A reconnect starts
  unsubscribed.
- **Packet size: 4096 by default, configurable [M][S].** Mordhau writes
  `MaxRconPacketSize=4096`. The Valve spec caps packets at 4096 bytes and
  splits long responses. Mordhau's handling of oversize requests and its
  response splitting are untested.
- **Rented hosts [P].** Owners can edit `Game.ini`, so they can set
  `RconPassword`/`RconPort`. Mods are installed by mod.io ID, either as
  `Mods=<id>` in `Game.ini` or through a panel field. Hosts tell customers
  to use desktop RCON tools, which means the port is reachable from the
  internet. No sampled host documents a source-IP allow-list for RCON, and
  none offers a way to run an extra process. TCAdmin-based panels
  (Pingperfect, GTXGaming, LogicServers) send panel RCON commands one at a
  time and do not hold a `listen` connection.

## 1. Mordhau RCON as an internet transport

### 1.1 Protocol, framing and authentication

| Fact | Label | Source |
|---|---|---|
| TCP; each packet is `size` (int32 LE), `id` (int32), `type` (int32), body (ASCIIZ), empty-string terminator | S, M | Valve spec; the webapp fixture frames match it exactly (`wire_hex` begins `f7000000 38d40000 00000000 …`) |
| Auth: client sends type 3 with the **password as the packet body**. Server answers with an empty `RESPONSE_VALUE`, then `AUTH_RESPONSE` whose id is the request id on success or -1 on failure | S | Valve spec |
| Mordhau auth reply observed: type 2 with the request id (probe id 701) | M | `.scratch/stun-rules/rcon-shipping-probe/trial-serverprotocol1.json` |
| The spec mentions no encryption, TLS or challenge-response. The password crosses the wire as-is on every new connection | S | Valve spec (absence) |
| Mordhau RCON settings: `RconPassword`, `RconPort` (`0` = disabled, the generated default), `RconTimeout=120.000000`, `bRconTieredAdmins`, `bAllowJsonForRconClients=False`, `MaxRconPacketSize=4096`. No TLS, cert or IP allow-list key exists | M | Mordhau-generated `Game.ini`: `.scratch/stun-rules/server-fresh/Game.ini` and the SDK's `Saved/Config/Windows/Game.ini` (passwords not read) |
| An empty password stops RCON from starting. The native init also reads an `RCONPORT=` command-line option | M | Offline PE analysis in `.scratch/stun-rules/review-sync-preflight.md` |
| RCON starts only on a dedicated server (`StaticDedicatedServerCheck`), so PIE has no RCON | M | same |
| The server log records each client with its IP: `LogRcon … RconClient_N (<ip>:<port>)` | M | `.scratch/stun-rules/rcon-shipping-probe/server*.log` |
| `bAllowJsonForRconClients` exists but nobody documents it. A community tool author wrote that the developers would "move to JSON format for outputs". It is about output format, not security | M (key), C | Game.ini; [WaGi-Coding/mordhau-rcon-tool](https://github.com/WaGi-Coding/mordhau-rcon-tool) |
| Behaviour on failed auth (lockout, ban) is unknown for Mordhau. SRCDS has ban-on-failure cvars, but they are not in the protocol spec | unknown | no source found |

**Encrypted option:** none in the protocol and none in Mordhau's config. The
usual workaround (SSH tunnel or stunnel beside the server) needs a process on
the game host, which rented hosting does not allow.

### 1.2 Concurrent connections

- No limit is documented anywhere, in Mordhau's config keys, help text or any
  provider or community page. **[M]/unknown**
- Recorded official-server runs [M]:
  - `automatic-startup-finalstartup10.json`: the listener (peer 1) stayed
    open from 5.7 s to 15.5 s while batch connections (peers 3 and 4) opened
    and closed, so at least two or three were open at once.
  - `serverautomaticnext7.log`: eleven client connections in one session.
    At one instant the server tried to send to six of them (`RconClient_3,
    4, 6, 7, 8, 9`), so it held at least six client entries together. The
    "Failed to send packet" errors came from clients that had already
    closed; the server kept running.
- The ceiling is untested. Twenty platform connections each go to a
  *different* server (one per server), so per-server load would be one
  platform connection plus whatever the owner's own tools hold.

### 1.3 Idle timeout and keepalive

- `RconTimeout=120.000000` is the generated default **[M]**. That it is an
  idle timeout in seconds is an inference from the name and the `alive`
  reply. It was not measured.
- `alive` is a Mordhau RCON command **[M]** (listed first in the server's
  `help`). Its reply matches "Keeping client alive for another [0-9]+
  seconds"; Refractor filters that text out as a broadcast **[C]**
  ([Refractor `mordhau.go`](https://github.com/RefractorGSCM/Refractor/blob/main/src/games/mordhau/mordhau.go)).
- An older copy of Mordhau's help text, reproduced by Pingperfect, says
  `alive` prevents an inactivity timeout and is usually needed only when the
  client isn't listening to broadcasts or the server has been idle a long
  time **[P]**
  ([Pingperfect KB 782](https://pingperfect.com/knowledgebase/782/Mordhau--RCON-Commands-and-How-to-Use-RCON.html)).
  So a `listen` subscription on a quiet, empty server can still time out.
- Community practice **[C]**: Refractor sends `alive` every 10 s
  (`AlivePingInterval: time.Second * 10`). Tom-Beijner's
  [Mordhau-RCON](https://github.com/Tom-Beijner/Mordhau-RCON) bot (last
  commit 2025-01-01) sends `alive` every 30 s and reconnects 2.5 s after a
  failure or socket `end`.

### 1.4 Long-lived `listen` subscriptions

- Valid types **[M]** (server reply to a bad option): `allon, alloff, chat,
  login, matchstate, killfeed, scorefeed, custom, punishment`. The older
  "all" is rejected ("Invalid broadcast option!"), and provider pages listing
  `all` are out of date.
- `help` describes `listen <Type>` as a *toggle* **[M]**. Tom-Beijner's bot
  checks `listenstatus` and sends `listen X` only for types it isn't already
  receiving **[C]**, which is consistent with toggling. A client that blindly
  re-sends `listen custom` on a live connection may unsubscribe itself.
  Untested.
- A subscription belongs to its connection **[M]**: it is lost when the
  connection drops, and every community client re-subscribes after
  reconnecting **[C]**.
- **It survives map travel [M].** On build 702625635 the probe's connection
  stayed open through `changelevel FFA_ThePit`; the probe recorded no
  `travel_closed_rcon`, and later commands on the same socket succeeded.
  `finalstartup10` records `listenerReadyBeforeGameplayTravel: true`, and the
  pre-travel listener received the mod's `Custom: ezconfig requestupdate`
  after the native level change.
- Fan-out **[M]**: broadcasts from `SendMessageToRconClients(bToAll=true)`
  reach every connection subscribed to `custom`; two peers received
  `ezconfig requestupdate`. Targeted results (`bToAll=false`, by native
  ClientId) reach only the connection that issued the command; a second
  subscribed connection got zero result frames (webapp
  `docs/server-processing-results.md`). On the wire, the broadcast used
  packet id `54329` and the targeted results `54328`, both type 0. Neither
  is a request id.
- A server restart or crash closes every connection. That is the inherent
  "disconnect" case; the mod's startup `requestupdate` exists to recover from
  it.

### 1.5 Packet size, multi-packet responses, reliability

| Fact | Label | Source |
|---|---|---|
| Spec maximum packet size is 4096 bytes. Longer *responses* are split across several `RESPONSE_VALUE` packets, and the client cannot tell from the first packet whether a split happened | S | Valve spec |
| Spec workaround: after each command, send an empty `RESPONSE_VALUE`. SRCDS echoes it back, which marks the end of the response because responses come back in order | S | Valve spec. **Untested on Mordhau**: an unknown command logs `LogRcon: Warning: Received unknown command status from RconClient_1` (seen when the probe sent `status`); how Mordhau handles a type-0 request is unknown |
| `MaxRconPacketSize=4096` is a Mordhau key, so the limit is configurable | M | Game.ini |
| Whether the limit applies to inbound commands, outbound responses or both, and what happens on overflow (truncate, drop, disconnect), is unknown. An `ezconfig` command over ~4 KB is the risk case | unknown | webapp doc: the 1 MiB adapter bound is a receiver safeguard, and "the game's actual packet size … still need[s] native transport measurement" |
| Mordhau has no identifier that separates broadcasts from command output. Community clients used two sockets, one for commands and one for broadcasts, to tell them apart | C | [cloud-hybrid Mordhau-MFC-Statistics RCON README](https://github.com/cloud-hybrid/Mordhau-MFC-Statistics) |
| EZConfig instead uses the reserved unsolicited ids (54328/54329), the `Custom: ` prefix and request correlation. `rcon-client` 4.2.5 silently drops packets whose id has no waiting callback | M | webapp `docs/server-processing-results.md` |
| Mordhau's generic command reply ("Processed string command successfully") arrives even when the mod rejected the value. Transport success does not mean processing success | M | fixture `native-processing-packets.json`; ADR 0010 |
| Responses arrive in request order on one connection (spec). Observed Mordhau ordering: the targeted `Custom:` result frame came *before* the request-matched generic reply | S, M | Valve spec; fixture exchanges 1007–1009 |
| SRCDS closes all authenticated connections when `rcon_password` changes. Mordhau's behaviour when `RconPassword` is changed live (e.g. via `modifyinivar`) is unknown | S / unknown | Valve spec |

## 2. Rented Mordhau hosting

### 2.1 Cross-cutting facts

- **Every sampled host lets the owner edit `Game.ini`**, through a web
  config editor or FTP. That covers `RconPassword` and `RconPort`.
  Mordhau rewrites `Game.ini` on shutdown, so edits must be made while the
  server is stopped [P] (EmeraldHost; also GTXGaming and Shockbyte steps).
- **The RCON port is usually a separate port the host allocates.** It is
  TCP, separate from the game and query ports; `RconPort=0` disables RCON
  [P][M]. Some hosts make the owner add the port in the dashboard first
  (EmeraldHost, FreakHosting).
- **The port is reachable from the internet.** Hosts direct customers to
  run RCON tools from their own computer: Pingperfect suggests mcrcon,
  GTXGaming shows "RCON Details" for desktop tools, and Nitrado's panel lists
  the RCON port and password "for remote access" [P]. No host documented an
  RCON on localhost only.
- **Source-IP restriction is not available from Mordhau** [M]: there is no
  allow-list key, and `-MULTIHOME=` only chooses the bind address. No sampled
  host documents a customer firewall or allow-list for the RCON port [P].
  Treat it as unavailable unless a specific host says otherwise.
- **mod.io mods.** Add `Mods=<mod.io resource id>`, one line per mod, under
  `[/Script/Mordhau.MordhauGameSession]` (Pingperfect, GTXGaming), or use a
  panel field: G-Portal "Mods", Shockbyte "Active Mods", Nitrado "Mods,
  Plugins and DLC" [P]. The old `ServerModAuthToken` method is pre-Patch 18
  [P].
- **Startup arguments.** None of the hosts' Mordhau pages documents editing
  them. TCAdmin hosts generally have a command-line manager, but the
  Mordhau-specific evidence is absent. Low confidence either way.
  Everything EZConfig needs (`RconPassword`, `RconPort`, `Mods=`) is in
  `Game.ini`, so startup arguments are not required.
- **Extra processes: no.** The products are a panel, config editor and
  FTP/SFTP plus a game-process console. None offers a shell, sidecar or
  custom process [P]. EmeraldHost says outright that the dashboard console
  is not a Mordhau command line and that kick/ban work only through RCON.
- **Panel-held RCON connections.** On TCAdmin (Pingperfect, GTXGaming,
  LogicServers, Streamline), the panel "RCON Client" (under "Current Activity
  and Stats") and "Scheduled Tasks" send commands one at a time. The TCAdmin
  forum shows scheduled RCON going through the bundled `SourceRcon.exe`
  (connect, send one command, exit) [P][C]. No host documented a
  persistent panel `listen`. A panel connection cannot steal EZConfig's
  results anyway: results are targeted by ClientId, and `requestupdate` fans
  out to every `custom` subscriber [M]. The real competition is owners'
  *own* always-on tools (Discord bots such as Mordhau-RCON or Refractor),
  each of which is another persistent connection on the same port.

### 2.2 Per-provider table

"—" means the provider's public docs don't say; the cross-cutting defaults
above then apply. Pages read 2026-11-01.

| Provider | Sells Mordhau now? | Panel | RCON from internet | Restrict by source IP | Owner sets RCON password | Edit Game.ini | Startup args | mod.io mods | Extra process | Panel holds RCON? |
|---|---|---|---|---|---|---|---|---|---|---|
| **G-Portal** | Yes: order page, from $4.03 / 3 days; 30 days × 10 slots $15.35; Central Europe | Own web interface | — | — | Via Game.ini (inferred) | Yes ("configuration files", Game.ini) | — | Yes, "Mods" field in Basic Settings | No | No Mordhau web RCON documented |
| **Nitrado** | Listed by comparison sites ($6.59 / 4 slots) and has Mordhau guides; product page renders client-side, so not confirmed | Own web interface | Panel shows RCON port and password "for remote access" (generic panel guide, search snippet) | — | Panel / Game.ini (unverified) | Yes (map-rotation guide edits Game.ini in the web interface) | — | Panel "Mods, Plugins and DLC" (generic) | No | Unknown |
| **Host Havoc** | Yes: order page £6.61/mo, 12–64 slots, NA/EU/APAC | Not stated | — | — | — | — | — | "vanilla or modded" | No | Unknown |
| **GTXGaming** | Yes: product page (updated 2025-02-11); Mordhau mod KB (2026) | TCAdmin-style ("Configuration Files → Config Editor") | Yes (generic RCON KBs: desktop tool + panel "RCON Details"; web console for some games) | — | Via Game.ini | Yes, Config Editor | — | Yes, `Mods=<id>` in Game.ini | No | Scheduled "automatic RCON/Console commands" (one-shot) |
| **Shockbyte** | Yes: Light $5.99 to Heavy $29.99 plans; Mordhau KBs | Own panel (KB says it was written for an "old control panel") | — | — | Yes, "RCON Password" field in Mordhau Server Settings (search snippet; KB returns 403 to fetch) | Yes, Game.ini | — | Yes, "Active Mods" field (resource IDs) | No | Unknown |
| **Pingperfect** | Yes: Mordhau KBs "Updated for Patch 18 Hotfix #1" | TCAdmin ("Configuration Files", "Text Editor", "Scheduled Task", "Current Activity and Stats") | Yes: suggests third-party mcrcon | — | Via Game.ini | Yes, Text Editor | — | Yes, `Mods=<id>` under MordhauGameSession | No | Panel RCON Client + Scheduled Tasks, one-shot |
| **LogicServers** | Yes: product page; 10 Mordhau KBs | TCAdmin (their KB documents TCAdmin scheduled tasks) | — | — | — | Yes, "Game.ini Config Editor" | — | — | No | TCAdmin one-shot (not Mordhau-specific) |
| **EmeraldHost** (DE) | Yes: "Mordhau Server mieten" page; docs updated 2026-07-30 | Own dashboard; Linux server (`Saved/Config/LinuxServer/Game.ini`) | Yes (any Source RCON tool; owner adds an extra port in the dashboard) | — | Yes, `RconPassword` in Game.ini | Yes (edit while stopped) | — | — | No | No: says the dashboard console is not RCON |
| Others seen | GGServers, holy.gg, XGamingServer (sample Game.ini matches the real key list), Winternode (Mordhau help updated 2026-02-28), DeluxHost, FreakHosting, Streamline (old page only) | — | FreakHosting: mRCON from desktop | — | — | Yes | — | — | No | — |

Reliability note: FreakHosting's guide (updated January 2026) puts RCON under
`[Server.Settings]` with `RconEnabled=1`. That contradicts Mordhau's real
`Game.ini` and looks templated, so it is not relied on here.

## 3. Facts that bear on ticket 05 (no recommendation)

- Dialing in from AWS means a plaintext password crossing the internet to
  about 20 hosts whose RCON ports are open to everyone and cannot be
  allow-listed to the platform's IP.
- A held connection needs an `alive` well inside 120 s, re-subscription
  after every reconnect, and care never to re-toggle `listen custom`.
  Mordhau keeps the connection through map changes, so only restarts and
  network drops force a reconnect.
- Delivery over a held, subscribed connection is immediate, well inside the
  ~5 s target. Results come back targeted to the issuing connection.
- Owners' own bots and panel tasks share the port. They don't intercept
  targeted results, but they are extra connections against an untested
  server ceiling.
- Open measurements, which need a test server, not a production one:
  Mordhau's behaviour above 4096 bytes in each direction; the real meaning
  of `RconTimeout` with and without `listen`; the effect of repeated
  `listen custom`; lockout after failed auth; the maximum concurrent
  clients.

## Sources

All read 2026-11-01 unless noted.

Primary, generic:
- Valve Developer Community, *Source RCON Protocol*. The live page sits
  behind a bot check, so it was read from the Internet Archive snapshot of
  2026-10-09 (page last edited 2026-03-22):
  <https://web.archive.org/web/20261009062023/https://developer.valvesoftware.com/wiki/Source_RCON_Protocol>
  (live: <https://developer.valvesoftware.com/wiki/Source_RCON_Protocol>).

Primary, Mordhau (local evidence in this repo and the webapp; nothing re-run):
- `.scratch/stun-rules/rcon-shipping-probe/trial-serverprotocol1.json`: the
  stock server's `help`, `listen` options, `changelevel` survival, `info`
  version (2026-09-09).
- `.scratch/stun-rules/rcon-shipping-probe/automatic-startup-finalstartup10.json`,
  `automatic-next-automaticnext7.json`, `serverautomaticnext7.log`,
  `serverserverprotocol1.log`: concurrent clients, broadcast ids 54329/54328,
  listener across travel, `LogRcon` lines.
- `.scratch/stun-rules/server-fresh/Game.ini` and the SDK's
  `Mordhau/Saved/Config/Windows/Game.ini`: Mordhau-generated
  `MordhauGameSession` keys (password values not read).
- `.scratch/stun-rules/review-sync-preflight.md`: offline PE analysis of
  RCON initialization.
- Webapp: `docs/automatic-sync.md`, `docs/server-processing-results.md`,
  `tests/fixtures/native-processing-packets.json`.

Community code:
- RefractorGSCM/Refractor, `src/games/mordhau/mordhau.go` (last commit
  2022-01-29):
  <https://github.com/RefractorGSCM/Refractor/blob/main/src/games/mordhau/mordhau.go>
- Tom-Beijner/Mordhau-RCON, `src/structures/Rcon.ts` (last commit
  2025-01-01): <https://github.com/Tom-Beijner/Mordhau-RCON>
- cloud-hybrid/Mordhau-MFC-Statistics, `RCON/GO/.Mordhau/README.md`:
  <https://github.com/cloud-hybrid/Mordhau-MFC-Statistics>
- WaGi-Coding/mordhau-rcon-tool README:
  <https://github.com/WaGi-Coding/mordhau-rcon-tool>
- TCAdmin community forum, "ARK and RCON" (2018):
  <https://community.tcadmin.com/topic/10848-ark-and-rcon/>

Providers:
- G-Portal product page <https://www.g-portal.com/Mordhau>; wiki
  <https://www.g-portal.com/wiki/en/mordhau/>
- Nitrado guides (client-rendered, read via search snippets):
  <https://server.nitrado.net/en-US/guides/navigating-nitrado-server-panel>,
  <https://server.nitrado.net/en-US/guides/how-to-change-map-and-game-mode-for-mordhau-en>
- Host Havoc order page <https://hosthavoc.com/en-GB/order/mordhau>; RCON tag
  <https://hosthavoc.com/billing/knowledgebase/tag/RCon>
- GTXGaming product page <https://www.gtxgaming.co.uk/mordhau-server-hosting/>;
  mods KB <https://www.gtxgaming.co.uk/clientarea/knowledgebase/643/How-to-add-mods-to-your-Mordhau--server.html>;
  RCON KB <https://www.gtxgaming.co.uk/clientarea/knowledgebase/623/How-to-connect-to-your-server-RCON.html>
- Shockbyte KBs (403 to direct fetch; search snippets):
  <https://shockbyte.com/billing/knowledgebase/919/How-to-Configure-your-Mordhau-Server.html>,
  <https://shockbyte.com/billing/knowledgebase/975/How-to-Install-Mods-on-your-Mordhau-Server.html>;
  plans <https://www.whtop.com/plans/shockbyte.com/159125>
- Pingperfect KBs <https://pingperfect.com/knowledgebase/782/Mordhau--RCON-Commands-and-How-to-Use-RCON.html>,
  <https://pingperfect.com/index.php/knowledgebase/393/Mordhau--Server-Configuration.html>,
  <https://pingperfect.com/index.php/knowledgebase/397/Mordhau--How-to-Mod-Your-Server-Mods.html>
- LogicServers KB <https://my.logicservers.com/knowledgebase/29/Mordhau>;
  product <https://logicservers.com/game-servers/mordhau>
- EmeraldHost docs <https://emeraldhost.de/docs-redirect/en/gameserver/mordhau/kick-ban-players>
- XGamingServer sample config <https://xgamingserver.com/configs/mh>
- FreakHosting <https://help.freakhosting.com/games/mordhau/using-rcon-for-mordhau>
- Winternode <https://winternode.com/help/games/mordhau/quick-start/overview>
- Price comparison (secondary, used only for "who sells"):
  <https://geekflare.com/hosting/best-mordhau-server-hosting/>
