# 12: Does the HTTP node work on Linux, and can the mod read Game.ini?

Status: open
Type: task
Created: 2026-11-02
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

HITL: runs on the owner's Linux box (a Linux dedicated server, a new execution
environment under mod `docs/agents/verification.md`) and in the kit sandbox
(Windows). The Windows run needs a kit change the owner approves when this
ticket runs: `harness.py smoke` writes a fixed Game.ini (`config_text` in kit
`sdk_harness/sandbox.py`) and needs an option to add an extra section.

Where: the work runs in the mod repo; notes and evidence go in mod
`.scratch/online-platform/`, linked from this ticket. Use a throwaway probe mod
like the parked `EZHttpProbe`, never EZConfig's content.

## Question

[How do the platform and a game server talk?](05-platform-game-server-communication.md)
made HTTP the only path and put the platform URL override in Game.ini. With one
throwaway probe mod, establish:

On the Linux dedicated server:
- HTTPS POST with `Authorization` and an explicit
  `Content-Type: application/json` reaches a real endpoint and returns JSON.
  Certificates are verified: self-signed and expired ones fail.
- With `bAllowHttpRequests` off the node fails with `-1`; on, requests go out.
- Refused, DNS and TLS failures, 4xx and 5xx responses and non-JSON bodies end
  in a callback without a crash.
- A POST held for 170 s completes; one held longer is cut at 180 s.
- Server frame time while requests are in flight.

On the Linux and the Windows dedicated server:
- `GetCustomConfigVar_String("EZConfigPlatform", "PlatformUrl")` reads the
  owner's value from `Saved/Config/<Platform>Server/Game.ini`, next to the
  `MordhauGameSession` keys:
  - section absent: `IsValid=false`;
  - a URL with port, path and query: the exact string, unquoted and quoted
    (record whether quotes are stripped);
  - an empty value: `IsValid=true`, `""`.
- The section survives Mordhau's rewrite of Game.ini on a clean shutdown and is
  read again after a restart.
- Optional: `modifyinivar game EZConfigPlatform PlatformUrl <new> string` over
  RCON changes a later read without a restart.

## Context

- [Does the Mordhau Http Request node work on a cooked dedicated server?](11-prove-mordhau-http-request.md):
  the Windows run, its guards and probe driver. Evidence: mod
  `.scratch/online-platform/http-probe/README.md`.
- [research/05](../research/05-blueprint-read-server-config.md): the Game.ini
  read, its proof cases, and why not a config variable or the command line.
- Guard before the node: a non-empty URL, POST only, one request in flight per
  node, a watchdog longer than 180 s.
