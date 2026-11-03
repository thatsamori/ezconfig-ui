# Archive

`planning-2026-01/` is the January 2026 GSD-era project plan (roadmap, phases,
state) for the web app. It is kept for history only and is no longer
maintained: current status and work tracking live in the mod repo's
`STATUS.md` and its `.scratch/<feature>/` tickets. `ueprompt.md` is an early
Unreal Engine prompt from the same period, also kept for history.

Three docs describe the self-hosted app, which online-platform#41 removed
(November 2026). The code, tests, fixtures and settings they name are gone:
- `automatic-sync.md` - the startup, reconnect and reload responder that sent
  the `Databases/` files to one game server over RCON.
- `server-processing-results.md` - the acknowledged RCON batch protocol and
  its captured results. The platform's poll contract is `docs/poll-exchange.md`.
- `parry-geometry-migration.md` - the startup migration that moved the six
  block collider transforms from Combat to Parry in the `Databases/` and
  `Presets/` files.
