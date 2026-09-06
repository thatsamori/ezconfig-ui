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
