# 01: Can a server mod built only from Blueprints make outbound HTTP requests?

Status: resolved
Type: research
Created: 2026-11-01
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

## Question

Can EZConfig, a cooked Mordhau pak built only from Blueprints and running on a
dedicated server, send an HTTP(S) request to an arbitrary URL and read the
response? If yes: through which classes or nodes, and with what limits (HTTPS,
custom headers, timeouts, server versus client availability, availability in a
cooked shipping server rather than only in the editor). If no, give the
evidence.

This decides whether
[How do the platform and a game server talk?](05-platform-game-server-communication.md)
can consider the mod polling the platform.

## Context

- The mod already builds JSON with its native PlayFab JSON object library
  (`docs/server-processing-results.md`). The PlayFab Blueprint SDK is
  believed to descend from VaRest; check whether a request class in the
  shipped plugin accepts an arbitrary URL.
- Editor-only success is not proof. Precedent: Kismet `DrawDebugBox` is
  DevelopmentOnly and needed a packaged proof
  (`.scratch/allow-visualize-block-collider/integration-findings.md`).
- Sources: the SDK install (`C:\Program Files\Epic Games\MORDHAUEditor`:
  engine and game plugins, `.uplugin` files, module lists), the kit's
  `docs/OFFLINE_TOOLS.md`, installed server binaries and PDB if present,
  Epic and PlayFab documentation, Mordhau modding community sources.
- Read-only: no editor, `uexec.py`, harness or builder runs. If the answer is
  "probably", say what a prototype ticket would need to prove in the editor.

## Answer

Yes, through Mordhau's native async node `UMordhauHttpRequest` ("Mordhau Http Request", category Http). It takes any URL, verb, header map and a `UPlayFabJsonObject` body. Its outputs are `OnRequestComplete(ResponseObject, ResponseCode, ElapsedTime)` and `OnRequestFailed(ResponseCode, ElapsedTime)`. It is compiled into both the Windows and Linux shipping dedicated servers. It runs only on the server, and only when the owner sets `bAllowHttpRequests=True` under `[/Script/Mordhau.MordhauGameSession]` in `Game.ini` (generated default `False`). Otherwise it fails with `-1`.
Limits: requests and responses are JSON objects only; there is no per-request timeout (engine `[HTTP]` defaults apply); passing custom headers drops the automatic `Content-Type`. An empty URL or an unsupported verb would likely crash the server, so guard both in Blueprint.
The PlayFab plugin is a dead end: it has VaRest's JSON object but no generic request class.
Confidence: high on existence, the gate and the Blueprint path (verified in binaries). Medium on runtime behaviour, which needs a prototype on a cooked dedicated server. It must prove: HTTPS GET and POST with headers against a real endpoint, gate off/on, non-JSON and 4xx/5xx handling, network failures and timeouts ending in `OnRequestFailed` without a crash, overlapping requests surviving GC, and server frame time. The full checklist is in section 7 of the findings.
Findings: [research/01-blueprint-outbound-http.md](../research/01-blueprint-outbound-http.md)
