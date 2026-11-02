# 11: Does the Mordhau Http Request node work on a cooked dedicated server?

Status: open
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
