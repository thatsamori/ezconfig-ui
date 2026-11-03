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

Copy `.env.example` to `.env` and fill in your server's RCON details and the
Discord sign-in settings, then run the app on Bun (platform storage uses
`bun:sqlite`):

```bash
bun --bun run dev
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

## Development

| Command | Purpose |
| --- | --- |
| `bun --bun run dev` | Next dev server on Bun (connects to the RCON server in `.env`) |
| `bun test ./tests` | Test suite (RCON and disk writes are mocked) |
| `bun run typecheck` | TypeScript check (`tsc --noEmit`) |
| `bun run lint` | ESLint (`eslint.config.mjs`) |
| `bun run init-db` | Create the empty `Databases/` structure |

Contributors and coding agents should read [AGENTS.md](AGENTS.md) first.

### Cross-repo contract

Config key names and types are the contract with the EZConfig mod
(`C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig`). The
generated `string-schemas/*.txt` files must match the mod's
`builders/character_config_keys.txt` and `builders/weapon_config_keys.txt`;
the mod's `builders/check_contract.py --webapp <this repo>` verifies the
character keys and categories. Published key names never change; see
AGENTS.md for the add-a-key procedure.

## Sidebar console

The UI follows [`docs/design/redesign-handoff/README.md`](docs/design/redesign-handoff/README.md): choose a weapon or character group in the sidebar, then compare attack types as columns. General has its own keys. Untouched values show verified SDK defaults or documented motion variants; they remain unset overrides until edited. Numeric overrides start with an empty input.

The editor works on one game server's Draft: open a game server and choose
**Edit Draft**. Every edit auto-saves the whole Draft with the revision it was
based on. The platform validates each value against the current schema,
camera policy included: a save holding an invalid value is refused, and each
invalid field shows its error. A save from a stale revision is refused too.
**All weapons →** opens Sweep for Set, Multiply, or Add, with a per-weapon
preview, and saves into the Draft. Relative operations skip weapons with
missing values in any selected attack type unless you provide a base.
**Reset to game defaults** empties the Draft. Nothing reaches the game server
until Apply.

A Draft is one JSON document keyed by database, weapon class and key name,
with no category (`src/lib/config/valuesDocument.ts`). Loading places each
value under its key's current category; values whose key or weapon class the
schema lacks are not shown, are counted, and stay stored. The encoder
(`src/lib/config/encodeValues.ts`) turns a document into the wipe and one
command per non-empty category, in today's command encoding.

Notes remain shared by schema key, using the existing rich-text editor and author edit/delete controls. Presets snapshot the open Draft as saved, and loading one replaces it.

`NEXT_BUILD_DIR` can point to a separate build directory for an isolated preview while another development server is running.

Run redesign regression tests with `bun test ./tests`. They cover attack-column selection, unknown defaults, Sweep math, the Draft's saves and the encoder. Tests mock RCON and use temp storage.

## Automatic synchronization

The app includes a managed RCON responder for game startup, reconnect and
`ezconfig reload`. It is disabled by default; enable it explicitly with
`RCON_AUTO_SYNC_ENABLED=true` after configuring the intended server and saved
database directory. Each sync uses the same acknowledged batch protocol as
manual apply. See [automatic synchronization](docs/automatic-sync.md) for
ownership, deployment and failure behavior.

Human validation for the Stun/acknowledgment batch is deferred by user request;
see [validation status](docs/stun-rules-validation.md).
