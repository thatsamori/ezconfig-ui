# ezconfig-ui

The EZConfig platform: a hosted, invite-only Next.js app on Bun where server
owners sign in with Discord, register their Mordhau game servers and edit
each one's EZConfig configuration. Everything it stores is in one SQLite
database. A game server's EZConfig mod polls the platform over HTTPS with its
Game server key and receives its Live configuration as `string ezconfig ...`
commands, which it processes itself. Platform terms are in
[CONTEXT.md](CONTEXT.md); the poll contract is
[docs/poll-exchange.md](docs/poll-exchange.md).

## App setup

To install dependencies:

```bash
bun install
```

Copy `.env.example` to `.env` and fill in `DATABASE_PATH`, `PUBLIC_URL`, a
Discord application's client id and secret, and `OPERATOR_DISCORD_IDS`. Then
run the app on Bun (platform storage uses `bun:sqlite`); startup creates and
migrates the database:

```bash
bun --bun run dev
```

The hosted instance, its settings files and deploys are in
[docs/hosting.md](docs/hosting.md).

## Game server setup

Register the game server on its page under Game servers. The page shows its
Game server key once, in the block to paste into the server's `Game.ini`
(`Mordhau/Saved/Config/WindowsServer/Game.ini`, or `LinuxServer/` on Linux),
followed by a server restart:

```ini
[/Script/Mordhau.MordhauGameSession]
bAllowHttpRequests=True

[EZConfigPlatform]
GameServerKey=<the key>
```

The EZConfig mod must also be in the server's mod list. The page shows
Connected once the mod's first poll arrives, and the platform sends
configuration only to the Supported build that the platform operator sets.

## Development

| Command | Purpose |
| --- | --- |
| `bun --bun run dev` | Next dev server on Bun, on the database at `DATABASE_PATH` |
| `bun test ./tests` | Test suite (temp databases; Discord is never called) |
| `bun run typecheck` | TypeScript check (`tsc --noEmit`) |
| `bun run lint` | ESLint (`eslint.config.mjs`) |
| `bun run deploy <commit>` | Deploy a commit to the hosted instance (owner only; `docs/hosting.md`) |

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

Notes are shared by config key with every server owner, using the rich-text
editor. Their authors edit or delete them, and the platform operator can
delete any. Save as Ruleset version
snapshots the open Draft as a numbered version of a Ruleset, and loading a
version replaces the Draft. A version can be exported as a Ruleset file, to send
to someone who imports it as a new Ruleset of their own.

`NEXT_BUILD_DIR` can point to a separate build directory for an isolated preview while another development server is running.

Run the regression tests with `bun test ./tests`. They cover attack-column selection, unknown defaults, Sweep math, the Draft's saves, the encoder and the platform's routes, on temp databases.
