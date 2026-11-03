# Research 05: Can a Blueprint-only mod read an owner-set value from the server's Game.ini or command line?

Purpose: decide how a server owner overrides the mod's built-in platform URL.
Researched 2026-11-02. Read-only: no editor, `uexec.py`, harness, builder or
server was run. Evidence is the SDK and shipping server binaries on this
machine (export tables, UHT reflection statics, x64 disassembly with system
Python `pefile` + `capstone`, Linux symbols from
`MordhauServer-Linux-Shipping.debug`; throwaway scripts in the session
scratchpad), saved T3D exports, and the kit docs.

Labels:

- **[B]** Verified in a binary, asset export or config file on this machine.
- **[K]** Stated by the kit (`docs/SERVER_MODS.md`: "All verified on live
  servers"); not re-checked here.
- **[U]** General UE 4.26 knowledge (engine source not read).
- **[I]** Inferred; not run.

## Answer

**Yes.** The best mechanism is Mordhau's own Blueprint node
`GetCustomConfigVar_String(SectionName, VariableName) -> ReturnValue, IsValid`
in `MordhauUtilityLibrary`. It reads any `[Section] Key=` from the server's
`Game.ini` (the same in-memory file that holds `RconPassword`). A missing key
gives `IsValid=false`, so the mod keeps its built-in URL. Confidence **high**
for the code path, **medium-high** for runtime: another mod.io server mod
relies on it, but no EZConfig proof has run.

## Per mechanism

### 1. `MordhauUtilityLibrary.GetCustomConfigVar_*`: **works; high**

| Fact | Label | Evidence |
|---|---|---|
| Variants: String, Int, Float, Bool, Vector, Vector2D, Rotator, Color, Array (plus matching `SetCustomConfigVar_*`) | [B] | `UE4Editor-Mordhau.dll` exports; names in `MordhauServer-Win64-Shipping.exe` and `MordhauServer-Linux-Shipping` |
| `GetCustomConfigVar_String` is `GConfig->GetString(*Section, *Key, Out, GGameIni)`. The bool result becomes `IsValid`. A null `GConfig` returns an empty string. Bool, Int, Float, Array and Vector also use `GGameIni` | [B] | disassembly of the editor DLL exports |
| The **Linux shipping server** compiles the same thing: `FConfigCacheIni::GetString(..., GGameIni)` (4th argument resolves to symbol `GGameIni`) | [B] | `Binaries/Linux/MordhauServer-Linux-Shipping` + `.debug` symbols, `UMordhauUtilityLibrary::GetCustomConfigVar_String` at `0x2df3a40`; exec thunk `execGetCustomConfigVar_String` present |
| The Windows shipping server does the same | [I] | same source; the reflection names are present, but the function was not located without symbols |
| Blueprint shape: a pure node with pins `SectionName`, `VariableName`, outputs `IsValid`, `ReturnValue` | [B] | `BP_ModificationActor_VersionA.T3D`, `K2Node_CallFunction_872` (`bIsPureFunc=True`) |
| Precedent: the Cswics comp mod (mod.io 1148860) reads 94 `[CompModifiers]` options through 218 of these nodes; server owners configure it in `Game.ini` | [B] asset; [K] live | `EZConfig/.scratch/cswics-audit/cswic-config-reads.json`, `cswic-inventory.md`; kit `docs/SERVER_MODS.md` "Reading config from any Blueprint" |
| On a dedicated server `GGameIni` is `Saved/Config/<WindowsServer\|LinuxServer>/Game.ini` merged over the defaults (or the `-GAMEINI=` file). Values come from memory loaded at startup, so edits need a restart. Owners already edit while the server is stopped (research 02) | [U] + [B] paths in `.scratch/stun-rules/rcon-shipping-probe/trial-*.json`; kit `gotchas/02-editor-session.md` | |
| RCON `modifyinivar game <Section> <Key> <Value> string` (UConfigCommand) calls `SetCustomConfigVar_*` / `GetCustomConfigVar_*`, so it changes the same in-memory `GGameIni`. A later read would see the new value without a restart. It also has a read mode | [B] call graph (Linux symbols, help text in editor DLL); live effect [I] | |

Notes for the design:

- An empty value (`PlatformUrl=`) returns `IsValid=true` and `""`. Treat empty
  as "use the default". This also keeps the empty-URL crash hazard (research
  01) away from the HTTP node.
- Section names are case-insensitive [U]. The SDK's `Config/DefaultGame.ini`
  still has stale `[EZCONFIG]`/`[EZCONFIG_Greatsword]` sections (archived
  issue 003), so pick a distinct name such as `[EZConfigPlatform]`.
- Read it only on the server (`HasAuthority`); the kit's rule is that clients
  never read their own ini for server settings [K].
- The mod cannot see `Engine.ini` `[HTTP] AllowedDomains` this way. An owner
  URL outside a non-empty allowlist is the untested null-response risk from
  the HTTP probe; document it for owners.

### 2. Blueprint "Config Variable" (CPF_Config): **works, but reads Engine.ini for BP_EZConfigB; medium-high**

| Fact | Label | Evidence |
|---|---|---|
| A cooked BP class re-reads its config after load. In the Linux shipping server, `UBlueprintGeneratedClass::PostLoadDefaultObject` calls `PostLoad`; then, for the CDO, if `ClassFlags & CLASS_Config` (0x4) is set, it calls `ClassDefaultObject->LoadConfig()`. That runs whenever the class loads, so a pak mounted after engine start is fine: GConfig is already filled | [B] code; timing [I] | Linux symbols, `0x472b320` |
| Which ini depends on the inherited class config name: **Engine** for `AActor`, `AInfo`, `APlayerState`, `ALevelScriptActor`. **Game** for `APawn`, `ACharacter`, `AGameModeBase`, `AGameSession`, `AGameStateBase`, `APlayerController`, `AHUD` and the Mordhau GameMode/GameSession/GameState/Character | [B] | `ClassConfigNameUTF8` in each `Z_Construct_UClass_*_Statics::ClassParams`, Linux server |
| The section is the class path, e.g. `[/EZConfig/BP_EZConfigB.BP_EZConfigB_C]`; the key is the variable name. An absent key leaves the BP default | [U]; matches the comp mod's `[/Game/Mordhau/Maps/WeaponRemovalMap_VersionA/BP_ModificationActor_VersionA.BP_ModificationActor_VersionA_C] WeaponsConfig=` [K] | |
| `BP_EZConfigB`'s parent is `/Script/Engine.Actor`, so a config variable on it would read **Engine.ini**, not Game.ini. The comp mod's actor works from Game.ini because its parent is `/Script/Engine.Character` | [B] | `EZConfig/.scratch/geometry-rules/ticket04/BP_EZConfigB-after.T3D` (`ParentClass`); comp-mod T3D |

Downsides: getting Game.ini needs a config=Game parent class. The section is a
long asset path that changes if the asset moves. Changing it needs a restart
(there is no Blueprint `ReloadConfig`), and `modifyinivar` would not update
the CDO.

### 3. Command line: **readable; high for the API, low for usefulness**

| Fact | Label | Evidence |
|---|---|---|
| `KismetSystemLibrary.GetCommandLine` returns `FString(FCommandLine::Get())` in the Linux shipping server. `ParseParamValue` is `FParse::Value(InString, InParam, Out, true)`. `ParseParam` and `ParseCommandLine` and their exec thunks are present | [B] | Linux symbols `0x496f370`, `0x496f5e0` and others |
| No command-line allow-list code is compiled in (no `FCommandLine` approve/filter symbols; only `Get`, `Set`, `GetOriginal*`, `Parse` and related) | [B] absence | Linux symbols |
| Windows shipping server contains the `GetCommandLine`, `ParseParamValue`, `ParseParam`, `ParseCommandLine` names | [B] | string scan |
| Use: `ParseParamValue(GetCommandLine(), "EZConfigUrl=")`. Include the `=`; the value stops at a separator | [U] | |
| Rented hosts do not document editing Mordhau startup arguments | low; research 02 §2.1 | |
| Related: `GameMode.OptionsString` + `GameplayStatics.ParseOption` (map-URL `?Key=Value`) exist, but also need startup control, and `://` inside a map URL is untested | [B] symbols; rest [I] | |

### 4. Other surfaces (not viable)

- `MordhauUtilityLibrary.GetConsoleVariableString/Int/Float` reads only
  existing cvars, and Blueprint cannot register a new one [U].
- `LoadUserConfig`/`SaveUserConfig` are keyed by the local PlayFab player
  (client settings) [B].
- The SaveGame slot (server persistence) is not owner-editable.

## Precedent in EZConfig and the kit

- **EZConfig: none live.** No exported EZ Blueprint has a CPF_Config variable
  (scan of every `.T3D` under the mod's `.scratch`). No builder or doc calls
  `GetCustomConfigVar_*`, `GetCommandLine` or `ParseParam*`. The leftovers of
  an earlier ini-driven design are the stale `[EZCONFIG*]` sections and an
  empty `Deleteme` function on `BP_EZConfigB` whose tooltip says "Loads
  config from Game.ini" (entry node only). [B]
- **Kit:** documents `GetCustomConfigVar_*` as the way to read config, and
  the comp mod's CPF_Config section pattern. Nothing on the command line. [K]
- The native server reads `RCONPORT=` from the command line (native code,
  not a mod) [B, `.scratch/stun-rules/review-sync-preflight.md`].

## Recommendation

Use `GetCustomConfigVar_String("EZConfigPlatform", "PlatformUrl")` on the
server. If `IsValid` is false, the value is empty or it fails the mod's URL
check, fall back to the built-in URL. The owner adds this to the same
`Game.ini` that holds `RconPassword` and `bAllowHttpRequests`:

```ini
[EZConfigPlatform]
PlatformUrl=https://platform.example.org
```

Correction (2026-11-02, from
[Does the HTTP node work on Linux, and can the mod read Game.ini?](../issues/12-prove-linux-http-and-game-ini.md)):
quote the value, `PlatformUrl="https://platform.example.org"`. Unquoted, the
read stops at `//` and returns `https:`, and the server saves `https:` back
to the file. Proof item 2 below came out that way on both servers.

Reading it just before each poll costs one in-memory lookup. That way an RCON
`modifyinivar` change applies without a restart (unproven). Skip CPF_Config,
since BP_EZConfigB would read Engine.ini. Skip command-line overrides, since
owners rarely control startup arguments.

## What a cooked dedicated-server proof must show

On the Windows shipping server, with a throwaway probe mod (like
`EZHttpProbe`) whose server actor reports over an RCON `Custom` frame or
`PrintToConsoleAndLog`:

1. `[EZConfigPlatform]` absent: `IsValid=false`, empty string.
2. `PlatformUrl=https://host:8443/path?a=b`: the exact string comes back,
   unquoted and quoted (`"..."`). Record whether the quotes are stripped.
3. `PlatformUrl=` (empty): `IsValid=true`, `""`.
4. The value sits in the real owner file
   `Saved/Config/WindowsServer/Game.ini` next to the `MordhauGameSession`
   keys, not only in a `-GAMEINI=` file.
5. After a clean shutdown and restart, the section is still in `Game.ini` and
   still read. Mordhau rewrites the file on shutdown.
6. Optional: `modifyinivar game EZConfigPlatform PlatformUrl <new> string`
   over RCON, then a re-read returns `<new>` without a restart; record
   whether the file changes.
7. Optional: `ParseParamValue(GetCommandLine(), "EZConfigUrl=")` with
   `-EZConfigUrl=https://...` on the launch line.
8. Linux (`Saved/Config/LinuxServer/Game.ini`) if target hosts run Linux.

Blocker: the kit's `harness.py smoke` writes a fixed `Game.ini`
(`sdk_harness/sandbox.py`, `config_text`), so it needs an option to add an
extra section first. That is a kit change and needs the owner's approval.

## Unproven

No runtime read on a cooked server; ini quote handling; whether the section
survives the shutdown rewrite; live `modifyinivar` effect; anything on Linux
at runtime; Windows shipping `GetCustomConfigVar_String` (no symbols; same
source assumed); command-line access on rented hosts.

## Sources (read 2026-11-02)

- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Binaries\Win64\{UE4Editor-Mordhau.dll, MordhauServer-Win64-Shipping.exe}`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Binaries\Linux\{MordhauServer-Linux-Shipping, MordhauServer-Linux-Shipping.debug, .sym}`
- `C:\Users\chris\AppData\Local\MordhauSDK\Saved\GraphAudit\Game\Mordhau\Maps\WeaponRemovalMap_VersionA\BP_ModificationActor_VersionA.T3D`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\.scratch\cswics-audit\{cswic-inventory.md, cswic-config-reads.json}`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\.scratch\geometry-rules\ticket04\BP_EZConfigB-after.T3D`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\archived_issues_may_still_be_relevant\003-stale-ezconfig-ini-sections.md`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Config\DefaultGame.ini` (section headers only)
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\.scratch\online-platform\http-probe\README.md`
- `C:\Users\chris\projects\mordhau-sdk-ai-kit\docs\{SERVER_MODS.md, gotchas\02-editor-session.md, OFFLINE_TOOLS.md}`, `sdk_harness\sandbox.py`
- Research [01](01-blueprint-outbound-http.md), [02](02-rcon-and-rented-hosts.md)
