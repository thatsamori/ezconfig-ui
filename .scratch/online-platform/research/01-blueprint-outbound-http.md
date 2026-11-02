# Research 01: Can a Blueprint-only server mod make outbound HTTP(S) requests?

Ticket: [01-blueprint-outbound-http](../issues/01-blueprint-outbound-http.md).
Researched 2026-11-01. Read-only: no editor, `uexec.py`, harness or builder
run, no game server started, no request sent. Evidence is the shipped SDK and
game binaries on this machine, read with string extraction, UHT reflection
tables and x64 disassembly (system Python with `pefile` and `capstone`;
throwaway scripts in the session scratchpad, not in the repo), plus PlayFab
plugin source on GitHub.

Evidence labels:

- **[B]** Verified in a binary or config file on this machine.
- **[S]** Verified in published primary source (PlayFab plugin source).
- **[I]** Inferred from the verified facts; not run.

## Answer

**Yes, through Mordhau's own native node, with conditions.** Mordhau's game
module has `UMordhauHttpRequest`, a Blueprint async action that takes any URL,
verb, header map and JSON body and returns the response as a JSON object. It is
compiled into the shipping dedicated-server binaries for both Windows and
Linux. It only sends when the server's `Game.ini` sets
`[/Script/Mordhau.MordhauGameSession] bAllowHttpRequests=True`. The generated
default is `False`, so each server owner has to opt in. Nothing about it is
documented publicly that I could find.

Confidence: **high** that the node exists, can be called from a mod Blueprint,
ships in the server build and is gated as described. **Medium** on end-to-end
runtime behaviour (HTTPS against a real endpoint, timeouts, failure handling),
because nothing was run. Two failure paths would crash the server (see
[Hazards](#4-hazards-found-in-the-code)); both can be guarded in Blueprint.

The PlayFab lead is a dead end. The shipped PlayFab plugin keeps VaRest's JSON
object but not VaRest's generic request class. Its API proxies only call
PlayFab endpoints.

## 1. Versions

| Fact | Label | Source |
|---|---|---|
| SDK engine is UE **4.26.2**, branch `++UE4+4.26-Mordhau`, CompatibleChangelist 14830424 | [B] | `InstalledBuild\Windows\Engine\Build\Build.version`; same block in `Mordhau\Binaries\Win64\MordhauServer-Win64-Shipping.target` |
| SDK ships shipping **server** binaries: `MordhauServer-Win64-Shipping.exe` and `MordhauServer-Linux-Shipping` (+ `.sym`, `.debug`), dated 2026-01-16 | [B] | `Mordhau\Binaries\Win64`, `Mordhau\Binaries\Linux` |
| Installed Steam client is version `702625635` (exe and PDB dated 2024-11-06). It also contains `bAllowHttpRequests` and `MordhauHttpRequest`, so the feature is in the live game, not just the SDK | [B] | `steamapps\common\Mordhau\version.txt`; string match in `Mordhau-Win64-Shipping.exe` / `.pdb` |
| Shipped PlayFab plugin: "PlayFab Marketplace Plugin" `1.104.221107`, EngineVersion 4.26.0 | [B] | `Mordhau\Plugins\PlayFab\PlayFab.uplugin` |

## 2. The node: `UMordhauHttpRequest`

### 2.1 Shape (from the UHT reflection tables in `UE4Editor-Mordhau.dll`)

| Fact | Label |
|---|---|
| Source files `Mordhau/Public/MordhauHttpRequest.h`, `Private/MordhauHttpRequest.cpp` | [B] |
| Parent class is `UBlueprintAsyncActionBase` (its `RegisterWithGameInstance` ×2 and `SetReadyToDestroy` fill vtable slots 102 to 104). `Activate` is overridden. The class is `BlueprintType`. | [B] |
| Factory: `static UMordhauHttpRequest* MordhauHttpRequest(UObject* WorldContext, FString InUrl, FString InVerb, TMap<FString,FString> InHeaderMap, UPlayFabJsonObject* InPlayFabJsonObject = None)`. Flags `BlueprintCallable | Static | Native`; metadata `BlueprintInternalUseOnly=true`, `Category=Http`. The tooltip is a copy-paste error ("Returns all supported mod tags"). | [B] |
| `BlueprintInternalUseOnly` plus a `UBlueprintAsyncActionBase` parent means the editor shows it as a latent async node ("Mordhau Http Request") with exec outputs per delegate | [I] (standard UE behaviour; not opened in the editor) |
| `WorldContext` has no `WorldContext`/`DefaultToSelf` metadata, so it is an ordinary pin that must be wired (e.g. Self) | [B] metadata absent; pin behaviour [I] |
| Output `OnRequestComplete(UPlayFabJsonObject* ResponseObject, int32 ResponseCode, float ElapsedTime)` | [B] |
| Output `OnRequestFailed(int32 ResponseCode, float ElapsedTime)` | [B] |

### 2.2 What `Activate` does (disassembly of the editor DLL)

1. `UMordhauUtilityLibrary::GetMordhauGameSession(WorldContext)`. That reads
   `World->AuthorityGameMode->GameSession`, which exists only on the server.
   If it is null **or** `GameSession->bAllowHttpRequests` is false,
   `Activate` broadcasts `OnRequestFailed(-1, -1.0)` and logs
   *"This server currently does not support http requests or session is
   invalid"* to `LogTemp`. No request is created. [B]
2. `FHttpModule::Get().CreateRequest()`. [B]
3. If the JSON object is set, it is serialized and passed to
   `SetContentAsString`. [B]
4. `SetVerb(InVerb)`. [B]
5. If `InHeaderMap` is **empty**, it sets `Content-Type: application/json`.
   Otherwise it calls `AppendToHeader(key, value)` for each pair and does
   **not** add the default Content-Type. [B]
6. `SetURL(InUrl)`, binds `OnProcessRequestComplete` to `OnHttpResponse`, then
   `ProcessRequest()`. [B]
7. It never calls `SetTimeout`, so there is no per-request timeout. [B]

The vtable slot names in steps 3 to 7 are verified against the engine's own
`FCurlHttpRequest` vtable in `UE4Editor-HTTP.dll`, where each slot's function
logs its own name: 0x48 SetVerb, 0x50 SetURL, 0x68 SetContentAsString,
0x80 SetHeader, 0x88 AppendToHeader, 0x90/0x98/0xA0 Set/Clear/GetTimeout,
0xA8 ProcessRequest, 0xB0 OnProcessRequestComplete. [B]

### 2.3 What `OnHttpResponse` does

- If `bWasSuccessful` is true (curl finished the transfer; HTTP 4xx/5xx still
  count), it calls `UPlayFabJsonObject::DecodeJson(Response->GetContentAsString())`.
  - If decoding succeeds: `OnRequestComplete(obj, code, elapsed)`. [B]
  - If decoding fails: `OnRequestComplete(None, code, elapsed)`. A non-JSON,
    empty or top-level-array body arrives on the **Complete** pin with a null
    object. [B] `DecodeJson` only accepts a JSON object. [S]
- If `bWasSuccessful` is false, it calls
  `OnRequestFailed(Response->GetResponseCode(), Request->GetElapsedTime())`.
  It dereferences `Response` without checking it. [B]
- It does not call `SetReadyToDestroy`, and the factory never calls
  `RegisterWithGameInstance`. The proxy is created in the transient package and
  bound with `BindUObject` (a weak binding). [B]

### 2.4 Present in the shipping dedicated server

| Fact | Label | Source |
|---|---|---|
| Windows shipping server contains the reflection names `MordhauHttpRequest`, `InUrl`, `InVerb`, `InHeaderMap`, `OnRequestComplete`, `OnRequestFailed`, `UMordhauHttpRequest`, `bAllowHttpRequests` | [B] | `MordhauServer-Win64-Shipping.exe` |
| Linux shipping server's symbol file lists `UMordhauHttpRequest::Activate()`, `::OnHttpResponse(...)`, `::execMordhauHttpRequest`, the delegate thunk bound to `OnHttpResponse`, and `MordhauHttpRequest.gen.cpp` built under `Intermediate/Build/Linux/.../UE4Server/`. The HTTP path is compiled into the server target, not `#if`'d out. | [B] | `MordhauServer-Linux-Shipping.sym` |
| PlayFab modules (and `UPlayFabJsonObject`) are in both server binaries, even though `PlayFab.uplugin` whitelists only Win64/Win32/Mac/consoles and the Linux `.target` does not list the plugin | [B] | `.sym`: `D:/Mordhau/Plugins/PlayFab/Intermediate/Build/Linux/.../UE4Server/...`; `URconCommand::ExecuteCommand_Implementation(FString const&, UPlayFabJsonObject*, int, int)` |
| Log format strings (e.g. "Game Engine Initialized") are absent from both shipping server binaries, so the gate's warning will not appear in a shipping server log. Debug with the `-1/-1.0` failure values instead. | [B] absence; consequence [I] | string scan |

## 3. The gate: `bAllowHttpRequests` (coordinator lead from ticket 02)

| Fact | Label | Source |
|---|---|---|
| A `UPROPERTY` of **`AMordhauGameSession`**, flags `CPF_Config` + public, not editable and not Blueprint-visible, declared in `Public/MordhauGameSession.h`. Its section is `[/Script/Mordhau.MordhauGameSession]` in `Game.ini`, next to the RCON keys. | [B] | reflection bool-param table and setter in `UE4Editor-Mordhau.dll` |
| What it gates: only `UMordhauHttpRequest::Activate` (the code reads `GameSession+0x711`, the byte this property's setter writes). No other gate site was searched for. | [B] for this site | disassembly |
| Generated default is `False` on the official server and in the SDK | [B] | `.scratch/stun-rules/server-fresh/Game.ini`, `.scratch/stun-rules/server/Game.ini`, SDK `Saved/Config/Windows/Game.ini` |
| A mod cannot flip it: no Blueprint access, and writing class defaults is barred by ADR 0004. Ticket 02 notes the RCON `modifyinivar` command can rewrite game ini values; whether a running server re-reads this key without a restart is untested. | [B] flags; rest [I] | |
| Reachable from Blueprint on a dedicated server: yes, through the node above, once the owner sets it to `True` | [B] code path; runtime [I] | |
| No public documentation or community mention found (web searches 2026-11-01 for `bAllowHttpRequests` and `MordhauHttpRequest`) | | |

## 4. Hazards found in the code

1. **Empty URL → likely server crash.** In the engine's curl request (UE 4.26,
   `UE4Editor-HTTP.dll`), `SetupRequest` rejects an empty URL ("Cannot
   process HTTP request: URL is empty") **before** it allocates the response
   object. The same applies to "Http disabled" and a domain-allowlist
   rejection. `ProcessRequest` then sets `Response = nullptr` and finishes with
   `bWasSuccessful=false`. Mordhau's `OnHttpResponse` dereferences that null
   `Response`. The editor build hits a `check(IsValid())` in
   `SharedPointer.h`. Shipping builds compile `check` out, so the result is a
   null-pointer access. [B] for each piece; the crash itself [I].
   **Guard:** never call the node with an empty URL.
2. **Unsupported verb → fatal error.** The engine's curl `SetupRequest`
   accepts `POST`, `PUT`, `PATCH`, `GET`, `HEAD`, `DELETE`, and an empty verb
   means `GET`. Any other verb hits a `Fatal` `UE_LOG` ("Unsupported verb '%s',
   can be perhaps added with CURLOPT_CUSTOMREQUEST") and then
   `FDebug::ProcessFatalError`. This is engine behaviour, independent of
   Mordhau, and the string is present in both server binaries. [B]
   **Guard:** hard-code the verb.
3. **Ordinary network failures look safe.** The response object is allocated
   in `SetupRequest` right after the empty-URL check. So DNS, connect, TLS and
   timeout failures should reach `OnRequestFailed(code, elapsed)` with a valid
   response object (code probably 0). [B] allocation site; outcome [I].
4. **Proxy lifetime.** Nothing roots the proxy except the Blueprint's own
   reference to the node's return value. Firing the node again before the
   previous request returns may let GC drop the earlier proxy, and the weak
   binding would then swallow its callback with no pin firing. [I]
5. **Header map replaces the default.** Passing any header (e.g. an
   `Authorization` token) drops the automatic `Content-Type: application/json`.
   Include it yourself for JSON bodies. [B]
6. **Numbers are `float`.** `UPlayFabJsonObject` number fields are 32-bit
   floats, the same Float32 limit the webapp already works around with
   decimal strings. [S]

## 5. Transport limits

| Topic | Finding | Label |
|---|---|---|
| HTTPS | Windows: the SDK editor run as a server (`.scratch/stun-rules/server-fresh/server.log`) logged "Using libcurl 7.55.1-DEV … supports SSL with OpenSSL/1.1.1" and "bVerifyPeer = true". The shipping server exe contains libcurl and "OpenSSL 1.1.1 11 Sep 2018". The Linux server searches `/etc/pki/tls/certs/ca-bundle.crt`, `/etc/ssl/ca-bundle.pem` and `/etc/ssl/certs/ca-certificates.crt`. Mordhau's own PlayFab calls (`.playfabapi.com` is in the server exe) go through `FHttpModule` over HTTPS [S], so the module already works on live dedicated servers [I]. | [B] unless marked; the shipping binary's backend choice (curl vs WinHttp, both linked) [I] |
| Certificates | Peer verification is on, so the platform needs a publicly trusted certificate. The engine's bundled `cacert.pem` (Mozilla, 2018-01-17) contains ISRG Root X1 (Let's Encrypt) and Amazon Root CA 1 (ACM). Whether the shipping server reads this bundle or the OS store is not verified. | [B] bundle; use [I] |
| Custom headers | Arbitrary, via the map (see hazard 5) | [B] |
| Body | Request: the serialized JSON object only. Response: a JSON object only. Raw text and response headers are not exposed. | [B] |
| Timeouts | No per-request timeout. Engine defaults in `BaseEngine.ini` `[HTTP]`: `HttpTimeout=180`, `HttpConnectionTimeout=60`, `HttpReceiveTimeout=30`, `HttpSendTimeout=30`. Mordhau's SDK config does not override them. The receive/send pair look WinHttp-only (their only nearby strings are WinHttp ones). Under curl, the 180 s total and 60 s connect limits are what apply. A shipping server's packaged config was not read. | [B] values; which ones bind [I] |
| Connections | libcurl reuses connections, `MaxHostConnections = 16` | [B] SDK log |
| Server vs client | Server only. On a client there is no authority GameMode, so the node fires `OnRequestFailed(-1, -1.0)`. | [B] code; [I] runtime |
| Threading | Async. Callbacks arrive on the game thread through the engine's normal HTTP completion path. | [I] |

## 6. Other HTTP-capable surfaces checked

| Surface | Verdict | Label |
|---|---|---|
| PlayFab Blueprint SDK (`UPlayFab*API`) | Every call posts to `GeneratePfUrl("/<Api>/<Call>")` on the PlayFab title domain with a fixed body model. The complete list of PlayFab UClasses in the Linux server has no generic request class. `UPlayFabJsonObject` credits "Vladimir Alyamkin" (VaRest's author) but carries only the JSON wrapper. | [B] class list; [S] source |
| `UPlayFabUtilities::setPlayFabSettings(GameTitleId, SecretKey, ProductionUrl, …)` | Blueprint-callable and can change the PlayFab base URL, but it rewrites the whole game's PlayFab settings and paths stay PlayFab-shaped. Not viable. | [S]; shipped DLL has the `ProductionUrl` parameter [B] |
| `AMordhauGameSession::UploadAdminActionDataToWebhook(Command, Sender, Details)` | Blueprint-callable member with no return value. By its name and the `AdminActionWebhookURL` key, it posts to the owner-configured Discord-style webhook. Push-only at best. | [B] signature; destination [I] (body not disassembled) |
| `UMordhauUtilityLibrary::UploadChat(ChatString) → FString` | Static and Blueprint-callable, purpose not established. Not a generic request. | [B] signature |
| Engine `UAsyncTaskDownloadImage` ("Download Image") | Present, but returns only a texture. My recollection of the 4.26 source is that `UE_SERVER` builds skip the request; not verified here. | [B] presence; [I] server stub |
| `UWebBrowser` (WebBrowserWidget), Unreal.js-core | The widget is client-side (CEF). Unreal.js is disabled in the `.uproject` and absent from the server target. | [B] |
| mod.io plugin | Fixed mod.io API | [B] class names |
| Engine "HTTP Blueprint" plugin | Not in this 4.26 install | [B] |

## 7. What an in-editor/packaged prototype must prove

Editor or PIE success is not proof (the `DrawDebugBox` precedent). The
following must hold on a **cooked mod on a shipping dedicated server**, with a
local or staging HTTPS endpoint the platform controls:

1. The node appears in the SDK editor and compiles in a probe Blueprint under
   `/EZConfig/_BridgeTest/`, and the cook keeps the `/Script/Mordhau`
   reference.
2. With `bAllowHttpRequests=False`, it fires `OnRequestFailed(-1, -1.0)` and
   the endpoint receives nothing.
3. With `True`, a `GET` to an `https://` URL with a public certificate returns
   `OnRequestComplete` with the decoded object and code 200. Check both
   Windows and Linux if rented hosts run Linux (ticket 02).
4. A `POST` with a JSON body and a header map (`Authorization` plus explicit
   `Content-Type`) arrives intact at the endpoint.
5. 4xx/5xx with a JSON body, and 200 with a non-JSON body, both land on
   `OnRequestComplete` with the expected code, and the second has a null
   object.
6. Unreachable host, refused port, DNS failure, untrusted certificate and a
   server that stalls past the timeout each end in `OnRequestFailed` without
   crashing. Record the codes and elapsed times; this finds the effective
   timeout for long-polling (try holds of about 25, 60 and 170 s).
7. Two overlapping requests from one node instance, with a forced GC in
   between (`obj gc`), both deliver. Otherwise, hold each proxy in a variable.
8. Server frame time stays flat while requests are in flight.

Do **not** test the empty-URL or bad-verb paths except on a disposable local
server process. Guard them in the Blueprint instead.

## Sources (all read 2026-11-01)

Local (this machine):

- `C:\Program Files\Epic Games\MORDHAUEditor\InstalledBuild\Windows\Engine\Build\Build.version`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\MordhauSDK.uproject`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Binaries\Win64\{UE4Editor-Mordhau.dll, MordhauServer-Win64-Shipping.exe, MordhauServer-Win64-Shipping.target, Mordhau-Win64-Shipping.target}`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Binaries\Linux\{MordhauServer-Linux-Shipping, MordhauServer-Linux-Shipping.sym, MordhauServer-Linux-Shipping.target}`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Plugins\PlayFab\PlayFab.uplugin`, `...\Binaries\Win64\UE4Editor-PlayFab.dll`
- `C:\Program Files\Epic Games\MORDHAUEditor\InstalledBuild\Windows\Engine\Binaries\Win64\UE4Editor-HTTP.dll`
- `C:\Program Files\Epic Games\MORDHAUEditor\InstalledBuild\Windows\Engine\Config\BaseEngine.ini` (`[HTTP]`)
- `C:\Program Files\Epic Games\MORDHAUEditor\InstalledBuild\Windows\Engine\Content\Certificates\ThirdParty\cacert.pem`
- `C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Saved\Config\Windows\Game.ini`
- `C:\Program Files (x86)\Steam\steamapps\common\Mordhau\{version.txt, Mordhau\Binaries\Win64\Mordhau-Win64-Shipping.exe, .pdb}`
- `.scratch/stun-rules/server-fresh/{Game.ini, server.log}`, `.scratch/stun-rules/server/Game.ini`
- Ticket 02 findings: [02-rcon-and-rented-hosts.md](02-rcon-and-rented-hosts.md)
- Webapp: `C:\Users\chris\projects\ezconfig-ui\docs\server-processing-results.md`

Published:

- PlayFab Unreal Marketplace Plugin, tag `1.104.221107`, 4.26 Blueprint
  module:
  [PlayFabServerAPI.cpp](https://github.com/PlayFab/UnrealMarketplacePlugin/blob/1.104.221107/4.26/PlayFabPlugin/PlayFab/Source/PlayFab/Private/PlayFabServerAPI.cpp)
  (`Activate`: `GeneratePfUrl`, `SetVerb("POST")`),
  [PlayFabJsonObject.h](https://github.com/PlayFab/UnrealMarketplacePlugin/blob/1.104.221107/4.26/PlayFabPlugin/PlayFab/Source/PlayFab/Classes/PlayFabJsonObject.h)
  (VaRest credit),
  [PlayFabJsonObject.cpp](https://github.com/PlayFab/UnrealMarketplacePlugin/blob/1.104.221107/4.26/PlayFabPlugin/PlayFab/Source/PlayFab/Private/PlayFabJsonObject.cpp)
  (`DecodeJson`),
  [PlayFabUtilities.h](https://github.com/PlayFab/UnrealMarketplacePlugin/blob/1.104.221107/4.26/PlayFabPlugin/PlayFab/Source/PlayFab/Classes/PlayFabUtilities.h)
  (`setPlayFabSettings`),
  [IPlayFab.h](https://github.com/PlayFab/UnrealMarketplacePlugin/blob/1.104.221107/4.26/PlayFabPlugin/PlayFab/Source/PlayFab/Public/IPlayFab.h)
  (`GeneratePfUrl`).
- Epic API reference,
  [FHttpRequestCompleteDelegate](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/HTTP/Interfaces/FHttpRequestCompleteDelegate?application_version=5.4).
  It gives only the signature, so the null-response behaviour above comes from
  the 4.26 binary, not docs. The 4.26 engine source itself is behind Epic's
  private GitHub and was not read.
