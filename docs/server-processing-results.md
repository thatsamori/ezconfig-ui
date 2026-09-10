# Server processing results

Implementation status: standalone receiver, correlated batch sender and UI apply
integration implemented. Production broker topology, rollback composition and
real-time expiry passed independent review. The official dedicated server with
the cooked mod has delivered standalone and batch results as actual native TCP
packets. The real UI driver passed success with wipe/counts and malformed-value
fail-stop. A second subscribed connection received zero targeted result packets.

`src/lib/rcon/processing.ts` recognizes the mod helper's `EZCONFIG_RESULT `
prefix followed by JSON with protocol `EZConfig/1`, normalized command text,
success, accepted and ignored counts, and an error string. Rejection counts
are zero. A success count includes unchanged recognized config values.

The mod constructs these strings with its native PlayFab JSON object library.
The captured fixture in `tests/fixtures/server-processing-results.json` comes
from real Blueprint parser/outcome runs. It is an actor-output capture, not a
network packet capture. The loopback TCP tests use the real `rcon-client`
library with controlled backend packets; they verify receiver behavior only.

`tests/fixtures/native-processing-packets.json` separately preserves seven actual
native exchanges captured on 2026-09-09 from official server version702625635.
Their unsolicited packet ID was54328/type0, with `Custom: EZCONFIG_RESULT ` or
`Custom: EZCONFIG_BATCH_RESULT ` followed by JSON. Generic command output arrived
in a separate request-matched packet. Both codecs remove exactly one leading
`Custom: ` envelope; they do not search arbitrary chat/broadcast text for markers.
The fixture regression replays unchanged wire bytes through the real receiver,
including fragmentation and adjacent generic responses.

The library version currently installed, rcon-client 4.2.5, drops unsolicited
packets when their request ID has no callback. The adapter observes its private
connected Socket's data stream without replacing authentication, command
queuing, or generic output handling. It fails before sending if that narrow
dependency seam is unavailable. It supports fragmented/coalesced Source frames
and completes each waiter on success, rejection, disconnect, error or timeout.
Call `prepareProcessingResultReceiver` immediately after authentication and
before subscribing to Custom broadcasts. One decoder retains framing state
for the whole connection, including partial broadcasts between commands.
Per-command waiters and timers finish at each outcome; connection observers
are removed at connection end. The public client error listener also handles
the library's forwarded socket errors without an uncaught EventEmitter error.
The adapter's 1 MiB frame bound is a receiver safeguard; the game's actual
packet size and long-result behavior still need native transport measurement.

Full and selected apply now use `executeAcknowledgedBatch`, which prepares a
fresh connection's receiver, requests the native `listen custom` subscription, then
requires a matching compatible batch admission before any wipe or data command.
Generic `rcon.send()` output cannot establish processing success. An older or
incompatible server fails before configuration mutation.

Batch frames use the reserved `ezconfig batch ` JSON wrapper and preserve each
existing inner config payload. Semantic integer fields `v`, `seq` and `commands`
are canonical decimal strings on the wire, avoiding Blueprint JSON Float32
rounding before validation. Results carry compact request/operation/token/sequence
correlation and exact per-command/cumulative counts. The game emits result
integers without converting cumulative counts through a Float32 value.

Result failures distinguish server rejection from missing processing results,
transport failure, malformed/incompatible protocol, unavailable capability and
overlapping waits. A missing result or transport failure means processing is
uncertain; it does not prove that the server skipped the command. Never replay
automatically. The adapter allows one pending command per connection. Standalone
echo-based requests require a fresh connection after uncertainty. Tagged batch
requests can issue one bounded abort on a healthy stream after a missing reply:
its new request ID cannot match the late data result. Transport/framing errors
make the connection unusable. Each apply creates its own Rcon object and closes
or destroys that owned connection after bounded cleanup.

The UI retains confirmed progress on interrupted applies. If a later matching
terminal reply proves that end already completed, the diagnostic client attempt
remains marked interrupted, but the UI explicitly reports server completion and
records that confirmed processing. It never automatically replays. A separate
history-write failure also keeps server completion visible instead of presenting
it as a failed apply.

Local SDK dedicated-process experiments reached a loopback RCON listener but
received no authentication responses. Native GameSession prerequisites prevented
the RCON processing loop in that environment. No actual server-to-sender packet
delivery is claimed from those experiments. The later official dedicated-server
distribution and cooked mod established actual packet delivery without modifying
native tick gates. The isolated live driver probe uses explicit loopback test
configuration and never reads the application's production environment.

Evidence boundaries: database/runtime rollback and delivered chat were measured
in PIE (including two local receiving controllers). The cooked-server test proves
native packets and the real UI receiver/driver, not new remote held-motion timing
or a new human remote-chat observation. The stock WindowsServer cook logged a
nonfatal missing cosmetic BP_InteractWidget referenced by an EZ weapon; actor
startup and processing continued. The test pak was fingerprinted and did not
replace release artifacts or receive a final release stamp.
