# 12: Does the HTTP node work on Linux, and can the mod read Game.ini?

Status: resolved
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
- `GetCustomConfigVar_String("EZConfigPlatform", "GameServerKey")` reads a
  value shaped like an issued Game server key (`ezc_gsk_` then 43 base64url
  characters, `-` and `_` included) back as the exact string.
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
- From [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md):
  the Game server key sits in the same section as `GameServerKey`, read before
  every poll like `PlatformUrl`.

## Answer

Resolved 2026-11-02. Yes to both. The HTTP node behaves on the Linux dedicated
server as it does on Windows. `GetCustomConfigVar_String` reads the
`[EZConfigPlatform]` section on both platforms, but **a URL must be quoted**:
an unquoted value ends at `//`. Evidence: mod
`.scratch/online-platform/linux-gameini-probe/README.md`; per-run numbers are
in `results.json` beside it.

**Linux dedicated server.** The run used a copy of the owner's live install on
Markbox (Ubuntu 24.04, binary identical), bound to loopback on its own ports
beside the live server. The live server was only read.
- HTTPS POST works. `Authorization`, an explicit
  `Content-Type: application/json` and the JSON body reached postman-echo
  intact, and the JSON reply decoded (0.25 s on a fresh connection).
- Certificates are verified: self-signed and expired ones fail with libcurl 60.
  The server ships no certificate bundle and uses the OS CA store.
- With `bAllowHttpRequests` off the node fails with `-1` and the endpoint
  receives nothing. With it on, requests go out.
- Every failure ends in a callback, and none crashed the server:
  - refused (libcurl 7, at once), DNS (6) and TLS (60) failures;
  - 4xx and 5xx responses, which complete with their code;
  - non-JSON, array and empty bodies, which complete with a null object.
- A POST held 170 s completes, and one held 200 s is cut at 180.005 s. An
  unreachable host fails at 60 s (`HttpConnectionTimeout`), against 21 s on
  Windows.
- Frame time stayed at one 60 Hz tick through every request, hold and
  timeout.

**Game.ini, on Linux and Windows.** Both platforms gave the same answers:
- Section absent, or key missing: `IsValid=false`.
- Empty value: `IsValid=true`, `""`.
- A value shaped like an issued key (`ezc_gsk_` + 43 base64url characters)
  reads back exactly.
- A quoted URL with port, path and query reads back exactly, with the quotes
  stripped. The file keeps the quotes.
- **The same URL unquoted reads as `https:`.** The server also rewrites
  Game.ini at startup and on a clean shutdown. That rewrite saves
  `PlatformUrl=https:` over the owner's line, so the original URL is gone from
  the file after the first start.
- Section and key names are case-insensitive.
- The section survives the rewrites (RCON `shutdown`, SIGINT and startup) and
  is read again after a restart.
- `modifyinivar game EZConfigPlatform PlatformUrl <url> string` changes the
  next read without a restart. The engine writes the value back quoted, and a
  restart reads it intact. `GameServerKey` goes through the same read, so
  `modifyinivar` covers it too.

**For the spec.**
- Every owner-facing Game.ini line quotes the URL: `PlatformUrl="https://…"`.
  The examples in
  [How do the platform and a game server talk?](05-platform-game-server-communication.md)
  and [How is V1 hosted and deployed on AWS?](10-aws-hosting-and-deployment.md)
  are unquoted. A comment on each points here. `GameServerKey` has no `//` and
  needs no quotes.
- Under 05's fallback rule, an unquoted override reads as `https:`. That
  fails the `https://` check, so the mod silently falls back to the built-in
  URL. The spec should have the mod log a rejected override and name the
  likely cause, a missing quote.
- [How are owners, servers and secrets trusted?](09-trust-owners-servers-secrets.md)
  said a key change takes a restart "or `modifyinivar` if this ticket proves
  it". It is proven.
- Linux rented hosts need no special handling: the same guards, the same 180 s
  hold limit and a watchdog over 180 s. The host must have OS CA certificates
  installed, as standard images do.

**Deviations from the ticket.**
- **Where Linux ran.** On Markbox, the owner's VPS, beside the live server
  (the owner chose it). The run used an rsync copy of the install without
  `Saved`, `.modio` and `steamapps`, with its own ports, bound to loopback.
  It is left at `~/ezc-probe` until the owner decides on cleanup.
- **Pak placement.** The Linux server refuses mod paks in `Content/Paks`
  ("mod paks are not allowed in the Paks directory"), which Windows accepts.
  The probe ran from `Content/CustomPaks/`.
- **Windows restart.** The kit sandbox writes Game.ini fresh each run, so its
  restart fed the rewritten section back in. Linux ran true restarts from the
  file the previous shutdown left.
- **Kit change.** The owner approved `harness.py smoke --game-ini FILE`
  (append owner-style sections) and `--clean-shutdown` (end with RCON
  `shutdown`, record the saved sections). Both are uncommitted in the kit,
  beside ticket 11's `--allow-http`, and the kit tests pass.
- **Probe.** Ticket 11's `EZHttpProbe`, restored from its park with one
  config-read branch added, recooked and parked again. The cook ended in the
  same late exit 3, and the pak was qualified by extracted hashes.
- **Not rerun on Linux:** overlapping requests with a forced GC. Windows
  evidence stands, and the one-in-flight rule covers it.
- **One Windows run** was stopped by the harness's own socket guard during
  the failing online login; the retry passed.
