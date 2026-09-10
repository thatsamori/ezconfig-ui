# Automatic synchronization

The UI now owns the `ezconfig requestupdate` responder. Run the application as
a long-lived Node server (`next start`, or `next dev` for development). Enable
the responder explicitly with `RCON_AUTO_SYNC_ENABLED=true`, alongside the
existing `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD` and `DATABASES_PATH` settings.
The default is disabled, so updating the application does not unexpectedly
apply configuration to an existing server. Builds and Edge execution never
start it. No credentials are changed by installation or verification.

On connection or reconnection, the app reads the current saved configuration
and starts a fresh acknowledged replacement. Its persistent RCON listener also
responds to the exact native `Custom: ezconfig requestupdate` message emitted
by the mod's startup and reload paths. The listener and each batch have separate
connections. A reload acknowledgment says the sync was requested; only the
batch's server-authored terminal summary confirms processing.

Each replacement asks for admission before wiping, then waits for each command's
processing result. Accepted unchanged values count, unknown server keys are
reported separately, and an empty saved configuration is a wipe-only batch.
Missing/unreadable storage, invalid JSON, invalid value types/choices, nonfinite
values or unknown stored schema keys fail before admission and wipe. Fix the
stored configuration and issue a later reload; a failed batch has no automatic
retry. A later explicit request or connection generation rereads storage and
starts a new batch, never resumes an interrupted sequence.

Bursts before admission coalesce. Once work starts, at most one later explicit
request is retained for a fresh attempt. Identical desired values are not used
to discard that request: a newly started game actor may need them. Manual
applies and sync requests share the server's existing admission/ownership
rules. Admission contention is reported rather than retried in a loop.

Only one local process can own automatic synchronization for a target. A small
exclusive loopback socket provides ownership and is automatically released
if the process exits. Its default port is deterministically derived from the
configured RCON host/port in the range40000–49999. `RCON_AUTO_SYNC_OWNER_PORT`
can override it if another application occupies that port; all local instances
for the target must use the same setting and consistent target hostname.
Contention leaves the process in standby without connecting or applying until
ownership becomes available. Across machines, enable exactly one authoritative
responder; this local guard is not distributed leader election.

Next's process-global registration prevents duplicate listeners during repeated
registration. Shutdown aborts pending work, closes connections and retry timers,
then releases ownership. If abrupt process termination prevents an abort from
arriving, the server's batch timeout remains responsible for its incomplete
summary. Startup with no players does not queue retrospective chat messages.

Automatic outcomes appear in server chat and `[EZConfig sync]` application logs.
The existing manual apply-history record remains owned by manual submissions.
Logs do not include credentials or configuration payloads. The responder does
not need a separate daemon or an external callback service.

For isolated verification, the runtime accepts explicit connection and storage
options; test fixtures use a loopback-only dedicated server and temporary
databases. Production bootstrap stays disabled unless that isolated process is
explicitly enabled. The default UI environment and installed game are not test
targets. The mod's startup hook and actual startup/reconnect/reload evidence
are tracked in the six-ticket work notes before final handoff.
