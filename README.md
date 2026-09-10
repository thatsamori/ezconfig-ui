# ezconfig-ui

Web control panel for the EZConfig Mordhau mod. Stores config in local JSON
databases (`Databases/`) and pushes it to the game server as
`string ezconfig ...` commands over RCON.

## App setup

To install dependencies:

```bash
bun install
```

Create the database folder structure (idempotent):

```bash
bun run init-db
```

Copy `.env.example` to `.env` and fill in your server's RCON details, then run:

```bash
bun run dev
```

## Mordhau server setup

The game server needs two things in `Game.ini`
(`Mordhau/Saved/Config/WindowsServer/Game.ini` or `LinuxServer/` on Linux),
followed by a server restart:

**1. RCON enabled** — must match `RCON_PORT` / `RCON_PASSWORD` in `.env`:

```ini
[/Script/Mordhau.MordhauGameSession]
RconPassword=your_password
RconPort=4747
```

**2. The EZConfig mod actor spawned on map load** — without this the mod never
runs and RCON commands are silently ignored:

```ini
[/Script/Mordhau.MordhauGameMode]
SpawnServerActorsOnMapLoad=/EZConfig/BP_EZConfigB.BP_EZConfigB_C
```

The RCON port is TCP and separate from the game port — make sure it's open in
the server's firewall.

---

This project was created using `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Sidebar console

The UI follows `design_handoff_ezconfig_redesign/README.md`: choose a weapon or character group in the sidebar, then compare attack types as columns. General has its own keys. Untouched values show verified SDK defaults or documented motion variants; they remain unset overrides until edited. Numeric overrides start with an empty input.

Edits are saved to the web app's database. **All weapons →** opens Sweep for Set, Multiply, or Add, with a per-weapon preview. Relative operations skip weapons with missing values in any selected attack type unless you provide a base. **Review & apply** lets you select individual keys and groups before sending commands over RCON. Unselected overrides remain saved in the web app. With wipe enabled, previous mod settings are cleared before the selected commands are sent.

The action bar counts every stored override as unapplied because the backend does not track an applied baseline. Apply history records the last successful request in `Databases/.last-apply.json`. Notes remain shared by schema key, using the existing rich-text editor and author edit/delete controls. Presets snapshot all stored overrides and loading one replaces the working set.

Set `NEXT_PUBLIC_SERVER_NAME` for the sign-in label and `SERVER_NAME` for the review destination. `NEXT_BUILD_DIR` can point to a separate build directory for an isolated preview while another development server is running.

Run redesign regression tests with `bun test ./tests`. They cover attack-column selection, unknown defaults, Sweep math, selective command generation, wipe-only apply, and bulk validation/partial failures. API tests mock RCON and disk writes.

## Automatic synchronization

The app includes a managed RCON responder for game startup, reconnect and
`ezconfig reload`. It is disabled by default; enable it explicitly with
`RCON_AUTO_SYNC_ENABLED=true` after configuring the intended server and saved
database directory. Each sync uses the same acknowledged batch protocol as
manual apply. See [automatic synchronization](docs/automatic-sync.md) for
ownership, deployment and failure behavior.

Human validation for the Stun/acknowledgment batch is deferred by user request;
see [validation status](docs/stun-rules-validation.md).
