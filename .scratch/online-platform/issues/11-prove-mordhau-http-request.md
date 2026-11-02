# 11: Does the Mordhau Http Request node work on a cooked dedicated server?

Status: resolved
Type: task
Created: 2026-11-01
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

HITL: needs the owner's go-ahead for a cooked local dedicated-server run and an
HTTPS test endpoint (a new execution environment under
mod `docs/agents/verification.md`).

Where: the work runs in the mod repo; notes and evidence go in mod
`.scratch/online-platform/`, linked from this ticket.

## Question

[Can a server mod built only from Blueprints make outbound HTTP requests?](01-blueprint-outbound-http.md)
found the node in the binaries but never ran it. From a throwaway Blueprint in
`/EZConfig/_BridgeTest/online-platform-http/`, cooked and run on a local
dedicated server, establish:

- HTTPS GET and POST with custom headers reach a real endpoint and return
  JSON.
- `bAllowHttpRequests` off fails with `-1`; on, requests go out.
- Non-JSON bodies, 4xx and 5xx responses, network failures and slow
  responses end in `OnRequestFailed` or a handled result, without a crash.
- Overlapping requests survive garbage collection; server frame time while
  requests are in flight.
- Round-trip time, and whether a held request (long poll) survives the
  engine's `[HTTP]` timeouts.

Record the facts
[How do the platform and a game server talk?](05-platform-game-server-communication.md)
needs: a workable poll interval, whether long polling is possible, and any
crash risks the mod must guard against.

## Context

- Section 7 of [research/01](../research/01-blueprint-outbound-http.md) has
  the full checklist.
- An empty URL or an unsupported verb likely crashes the server; guard both
  before the first run.
- Kit rules apply: `docs/EDITOR_SAFETY.md`, `harness.py doctor`, scratch
  hygiene and `harness.py retire` before any packaging (mod `AGENTS.md`).

## Answer

Resolved 2026-11-02. Yes, on the Windows dedicated server, if the mod uses POST
only. A cooked test pak ran in the kit's native sandbox against a local
endpoint and public test hosts. Evidence: mod
`.scratch/online-platform/http-probe/README.md`; per-step numbers are in
`results.json` beside it.

**What was proven.**
- With `bAllowHttpRequests=False` the node fails at once with `-1` / `-1.0`
  and sends nothing. With `True`, requests go out.
- HTTPS POST works. `Authorization`, a custom header, an explicit
  `Content-Type` and the JSON body all reached postman-echo intact. It
  answered 200 in 0.16 s, and the response was decoded. Certificates are
  verified: self-signed and expired ones fail.
- GET does not work. The node declares `Content-Length` for the JSON object
  (4 bytes for `null`) but never sends the body. postman-echo resets the
  connection after 15 s, and on a reused keep-alive connection the next
  request is corrupted (Bun answered it 400).
- Error handling:
  - 4xx and 5xx responses complete with their code.
  - Non-JSON, array or empty bodies complete with a null object.
  - Refused, DNS, TLS and unreachable-host failures end in `OnRequestFailed`
    with code 0.
  - None of these crashed the server.
- Overlapping requests from one node do not survive GC. After
  `CollectGarbage`, one of two callbacks never ran. The same pair without GC
  delivered both, and a single request survived a forced GC. One request in
  flight per node, or a held proxy, is safe.
- Frame time stayed at one 60 Hz tick throughout: stalls, a 64 KB body,
  forced GCs and 180 s holds. One 18 ms frame appeared in 10 204 ticks.
- Round trip: 4–5 ms locally, and 158 ms over HTTPS to a public host on a
  fresh connection.
- Holds:
  - 60 s and 170 s holds complete.
  - A 200 s hold is cut at 180.00 s, by `HttpTimeout`, a total limit per
    request. `HttpReceiveTimeout=30` does not cut idle holds.
  - An unreachable host fails at 21 s.

**For [How do the platform and a game server talk?](05-platform-game-server-communication.md).**
- **Poll interval.** Any interval works: a request has no measurable server
  cost.
- **Long polling.** Possible. One POST can be held for up to just under 180
  s, or less if the hosting in front of the platform has a shorter idle
  timeout. A change then arrives in about one round trip.
- **Crash risks to guard.**
  - Check the URL (non-empty) and the verb before the node.
  - Keep one request in flight per node.
  - Run a watchdog longer than 180 s, because a callback can be lost.
  - Call `IsValid` on every response object.
- **Untested.** `bEnableHttp=False`, and a host outside a non-empty
  `[HTTP] AllowedDomains`. Both are expected to give the node a null request
  or response. Real servers ship with no `AllowedDomains`, which allows every
  host.

**Deviations from the ticket.**
- **Separate mod.** The probe was a throwaway mod, `EZHttpProbe`, not a
  Blueprint under `/EZConfig/_BridgeTest/online-platform-http/`. That way
  EZConfig's content, which includes another owner's uncommitted assets, was
  never saved, cooked or packaged. The probe was moved out of the SDK
  afterwards with every hash verified.
- **Linux not run.** The owner chose Windows only, keeping Linux as a risk.
  It remains the main open risk if rented hosts run Linux servers.
- **Qualified cook.** The cook exited 3 after `Success - 0 error(s)`. That is
  the SDK's late forced exit, with the same signature as an earlier cook.
  The pak was not recooked. Instead it was qualified: every extracted file
  matched its cooked hash, and the runs proved the server loads it.
- **Kit change.** The kit sandbox gained an opt-in `--allow-http` with a
  domain allowlist (uncommitted in the kit). The engine's public-IP lookups
  and PlayFab hosts stay blocked.
- **One preflight interrupt.** One kit preflight exited `0xC000013A` before
  the runs; a repeat passed.
