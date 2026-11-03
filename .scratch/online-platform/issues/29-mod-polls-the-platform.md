# 29: Mod polls the platform

Status: open
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

- [ ] Before every poll, the mod reads `[EZConfigPlatform] GameServerKey` and
      `PlatformUrl` with `GetCustomConfigVar_String`, so a `modifyinivar`
      change takes effect without a restart.
- [ ] With no key, the mod does not poll. It logs "EZConfig: no GameServerKey
      in Game.ini; not contacting the platform" once per map and reads the
      value again every 60 s.
- [ ] `PlatformUrl` overrides the built-in URL only when it is `https://`
      (plain `http://` is allowed only to a loopback address). Otherwise the
      mod falls back to the built-in URL and logs the rejected override,
      naming the likely cause: a missing quote.
- [ ] Each poll is a POST with `Content-Type: application/json` and
      `Authorization: Bearer <key>`. It carries the build stamp and an
      instance id, a New Guid picked when the mod starts on a map.
- [ ] Guards:
      - the URL is checked before each request;
      - POST only;
      - one request in flight per node;
      - `IsValid` on every response;
      - a watchdog longer than 180 s treats a lost callback as a failure.
- [ ] Back-offs:
      - after a failure, about 10 s;
      - after "superseded", about 10 s;
      - after `401` "key rejected", log "EZConfig: the platform rejected this
        server's GameServerKey" once (log only, not chat) and retry every
        60 s;
      - after "no change" or "not the Supported build", poll again at once.
- [ ] A built-in platform URL constant exists. Its real value is set in
      [Launch and cutover](42-launch-and-cutover.md).
- [ ] The mod's chat and RCON config commands and their acknowledgments are
      unchanged.
- [ ] Proof, from a sandbox server run by the kit harness (`--allow-http`,
      `--game-ini`) against a local platform at a quoted loopback
      `PlatformUrl`:
      - Connected while running;
      - Not connected after it stops;
      - key rejected after a regenerate;
      - no polls without a key;
      - frame time flat.
- [ ] The mod gets an ADR for the poll loop, covering how ADR 0010's batches
      now arrive.
- [ ] The mod's contract checks still pass.
