# 29: Mod polls the platform

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 26
Parent: [Spec: EZConfig online platform (V1)](../spec.md)
Repo: the EZConfig mod. Evidence goes in the mod's `.scratch/online-platform/`.

## What to build

A Mordhau server running EZConfig reads its Game server key and optional
platform URL from Game.ini and long-polls the platform. Its game server shows
Connected on the platform within a few seconds of the server starting.

Processing a delivered Live configuration comes later, in
[Mod processes a delivered Live configuration](34-mod-processes-live-configuration.md).
This ticket builds the loop, its guards and its back-offs against the poll
exchange contract that
[Register a game server and see it Connected](26-register-game-server-and-connect.md)
documents.

## Acceptance criteria

- [x] Before every poll, the mod reads `[EZConfigPlatform] GameServerKey` and
      `PlatformUrl` with `GetCustomConfigVar_String`, so a `modifyinivar`
      change takes effect without a restart.
- [x] With no key, the mod does not poll. It logs "EZConfig: no GameServerKey
      in Game.ini; not contacting the platform" once per map and reads the
      value again every 60 s.
- [x] `PlatformUrl` overrides the built-in URL only when it is `https://`
      (plain `http://` is allowed only to a loopback address). Otherwise the
      mod falls back to the built-in URL and logs the rejected override,
      naming the likely cause: a missing quote.
- [x] Each poll is a POST with `Content-Type: application/json` and
      `Authorization: Bearer <key>`. It carries the build stamp and an
      instance id, a New Guid picked when the mod starts on a map.
- [x] Guards:
      - the URL is checked before each request;
      - POST only;
      - one request in flight per node;
      - `IsValid` on every response;
      - a watchdog longer than 180 s treats a lost callback as a failure.
- [x] Back-offs:
      - after a failure, about 10 s;
      - after "superseded", about 10 s;
      - after `401` "key rejected", log "EZConfig: the platform rejected this
        server's GameServerKey" once (log only, not chat) and retry every
        60 s;
      - after "no change" or "not the Supported build", poll again at once.
- [x] A built-in platform URL constant exists. Its real value is set in
      [Launch and cutover](42-launch-and-cutover.md).
- [x] The mod's chat and RCON config commands and their acknowledgments are
      unchanged.
- [x] Proof, from a sandbox server run by the kit harness (`--allow-http`,
      `--game-ini`) against a local platform at a quoted loopback
      `PlatformUrl`:
      - Connected while running;
      - Not connected after it stops;
      - key rejected after a regenerate;
      - no polls without a key;
      - frame time flat.
- [x] The mod gets an ADR for the poll loop, covering how ADR 0010's batches
      now arrive.
- [x] The mod's contract checks still pass.

## Comments

2026-11-03: Done in the EZConfig mod (not pushed). Evidence is in the mod's
`.scratch/online-platform/poll-loop/`; start at its `README.md`. Raw logs,
captures and the test Game server keys stay in
`C:\Users\chris\projects\ezconfig-local-tests\op29\`.

- Commits:
  - `656bbaa`: the owner's stamped dynamic-feint-window `BP_EZConfigB`,
    committed first as the owner chose;
  - `8b90b2b`: `BP_EZPlatformPoll`, its builder `build_platform_poll.py`,
    the startup-request hook, and `BP_EZConfigB` at stamp `20261102-231144`;
  - `68c431d`: ADR 0013 (with the ADR 0010 amendment), engine notes, build
    order, `AGENTS.md`, `STATUS.md`;
  - `5bf8767`: the evidence folder.
- The loop is its own server-only actor, spawned by the config actor at the
  end of its startup request; no hand-built graph changed. One `Delay` drives
  every wait. The watchdog is 200 s (the engine's `HttpTimeout` is 180 s). The
  built-in URL is the placeholder `https://platform.invalid` for
  [#42](42-launch-and-cutover.md).
- Sandbox proof (`run-*.json`). The kit smoke ran with `--allow-http` and
  `--game-ini` against a clean export of main (f963092) on `127.0.0.1:3929`,
  behind a recording proxy, with the quoted loopback
  `PlatformUrl="http://127.0.0.1:3930"`:
  - Connected 3 s after the first poll;
  - `not-supported-build` then `no-change` ×3, each held 50 s and re-polled
    at once;
  - Not connected 17.6 s after the last poll;
  - after a Regenerate key, a 401 at once, the rejection line logged once and
    401 retries every 60 s;
  - no key: no request in 120 s, the line logged once;
  - frame time 59.98 to 59.99 Hz over 2 to 6 minutes; the only intervals
    losing 2 or more frames (one each in two runs) fell inside held polls
    with no request event;
  - every request a POST with the JSON content type, a Bearer token, body
    `{buildStamp, instanceId}`, one instance id per run, one in flight.

  The 10 s failure back-off shows in a run where the proxy broke the gzip
  answers.
- Covered by the wiring audit and the code only, not run:
  - the `superseded` back-off;
  - the 200 s watchdog;
  - a `modifyinivar` change (the key and URL are read at each poll);
  - the PlatformUrl rejection fallback.

  The kit's smoke endpoint guard stopped every sandbox attempt with an
  unquoted or non-loopback PlatformUrl. It also stopped a re-run of an ini
  that had passed, so it does not depend on the ini
  (`endpoint-guard.json`). That run did show the engine reading an unquoted
  `http://...` as `http:`, the case the rejection line's "missing quote"
  names.
- Contract checks: `check_contract.py --webapp` "OK: 182 keys and 14
  categories match"; `check_weapon_contract.py` "OK: 65 public keys".
  `verify_server_persistence` passes. `verify_command_batches` fails for a
  reason that predates this ticket: it does not skip the `DebugTools_Start`
  hook added in `19e132f` (in the mod's `STATUS.md` Next list).
- Main has no Regenerate key route yet ([#28](28-regenerate-key-delete-shared-key.md)),
  so the regenerate was done in the database (new hash), which the poll route
  reads.
