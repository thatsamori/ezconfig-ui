# Poll exchange: the platform–mod contract

Status: the platform side is built (online-platform#26, with Regenerate key,
Delete and the shared-key warning from #28). The mod builds its
poll loop against this page ([#29](../.scratch/online-platform/issues/29-mod-polls-the-platform.md)).
The field names, answers and status codes are a published contract, like the
Game.ini names: change them only together with the mod, and record the change
here and in the mod's ADR for the poll loop.

The platform side is `src/app/game-server/poll/route.ts`, which reads polls
with `src/lib/platform/poll-exchange.ts` and holds them in
`src/lib/platform/polls.ts`.

## Endpoint

```
POST <PlatformUrl>/game-server/poll
Content-Type: application/json
Authorization: Bearer <Game server key>
```

- POST only. Other methods get `405`. GET is never used, because the engine's
  HTTP node does not send a GET's body.
- HTTPS. The mod allows plain `http://` only to a loopback address, for tests.
- The Game server key is `ezc_gsk_` followed by 43 base64url characters, 51 in
  all. It comes from the server's Game.ini, `[EZConfigPlatform] GameServerKey`.
  The word `Bearer` ignores case; the key does not.

## Request body

A JSON object of at most 131072 bytes (128 KiB). The platform ignores fields
this page does not name, so a newer mod may send more. Lengths are in Unicode
characters (code points).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `buildStamp` | string, 0 to 64 | yes | The mod's build stamp. `""` for a build without one; the platform records that as no stamp. |
| `instanceId` | string, 1 to 64 | yes | A new random id (a New Guid) each time the mod starts on a map. |
| `processed` | object or `null` | no | The Live configuration the mod last finished processing, with its result. Absent or `null` when it never processed one, or when its build stamp differs from the one it saved with that id. |

`processed`:

| Field | Type | Meaning |
|---|---|---|
| `liveConfigurationId` | string, 1 to 64 | The id the delivery carried. Recorded as reported, even an id the platform does not know. |
| `result` | object | How processing ended, below. |

`processed.result`:

| Field | Type | Meaning |
|---|---|---|
| `success` | boolean | Every command succeeded. |
| `acceptedValues` | integer ≥ 0 | Config values the game server recognized and set, unchanged ones included. |
| `changedValues` | integer ≥ 0 | Of those, how many changed a value. |
| `unknownKeys` | array | Keys the mod's build does not know and skipped: `{ "database", "category", "key" }`, each a string of 1 to 128. `database` is `Character` or a weapon class, as in the delivered commands. |
| `failure` | object or `null` | `null` or absent when `success` is true. Otherwise required: `{ "database", "category", "error" }`, where the command processing stopped at and the mod's error. `database` and `category` are strings of 0 to 128, both `""` when the wipe failed. `error` is a string; the platform keeps its first 1000 characters. |

Example:

```json
{
  "buildStamp": "20261102-153000",
  "instanceId": "8F2C9A41B7D34E0F9C1A2B3C4D5E6F70",
  "processed": {
    "liveConfigurationId": "0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11",
    "result": {
      "success": true,
      "acceptedValues": 140,
      "changedValues": 12,
      "unknownKeys": [{ "database": "Greatsword", "category": "Strike", "key": "RetiredKey" }],
      "failure": null
    }
  }
}
```

## Responses

Every response is a JSON object whose `answer` the mod switches on, with
`Cache-Control: no-store`.

| Status | `answer` | When | Other fields | The mod then |
|---|---|---|---|---|
| `200` | `no-change` | The hold (50 s) ended with nothing to deliver. | none | polls again at once |
| `200` | `superseded` | A newer poll with the same key arrived while this one was held. | none | waits about 10 s, then polls |
| `401` | `key-rejected` | The `Authorization` header is missing or not `Bearer <key>`, or the key is unknown: never registered, regenerated, or its game server deleted. Also a held poll, at once, when Regenerate key or Delete ends its key. | none | logs once, then retries every 60 s |
| `400` | `bad-request` | The key is known but the body breaks this contract. | `error`: which field and why | treats it as a failure: logs `error`, waits about 10 s |
| `500` | `error` | The platform failed. | none | treats it as a failure: waits about 10 s |

Coming with later slices, and part of the contract now:

| Status | `answer` | Slice | When | Other fields | The mod then |
|---|---|---|---|---|---|
| `200` | `not-supported-build` | [#27](../.scratch/online-platform/issues/27-supported-build.md) | `buildStamp` is not the Supported build, or none is set. Answered when the hold ends; nothing is delivered. | none | polls again at once |
| `200` | `live-configuration` | [#32](../.scratch/online-platform/issues/32-apply-a-draft-and-deliver-it.md) | The game server's Live configuration differs from the reported `processed.liveConfigurationId` (answered at once), or an Apply wakes the held poll. | `liveConfigurationId`, `commands` | processes it, then polls at once with `processed` |

A `live-configuration` answer:

```json
{
  "answer": "live-configuration",
  "liveConfigurationId": "0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11",
  "commands": [
    { "database": "Character", "category": "Movement", "values": "{\"CanDodge\":\"True\",\"TimeToMaxSprint\":\"0.94\"}" },
    { "database": "Greatsword", "category": "Strike", "values": "{\"Windup\":\"0.45\"}" }
  ]
}
```

- `commands` holds one entry per non-empty category, grouped with the deploy's
  schema. `database` is `Character` or a weapon class. `values` is a string:
  the JSON object text today's `ezconfig <database> <category> <values>`
  command takes, with values encoded as today's command builder encodes them
  (`buildCommandForCategory` in `src/lib/database/apply.ts`: every value a string).
- The mod processes it as today's command batch: wipe first, then one command
  per entry in order. Each command is all-or-nothing. Processing stops at the
  first failed command and keeps what was applied before it.
- One result covers the whole delivery, reported as `processed` on every later
  poll.

Anything else is a failure, and the mod waits about 10 s: no response, a
timeout, a status not listed here (a proxy's `502` or `504`), a body that is
not JSON, or an `answer` the mod does not know.

## Holding and superseding

- The platform checks the key first, then the body, so an unknown key gets
  `401` whatever the body. A known key's report is recorded, then the poll is
  held.
- A poll is held for up to 50 s. The mod's request timeout, and any proxy in
  front of the platform, must allow at least 60 s.
- Held polls are keyed by game server. The newest poll supersedes the held
  one, whichever instance sent it. Two game servers sharing one key supersede
  each other on every poll.
- The shared-key warning: a supersede counts when the instance that sends it
  was itself superseded, by a different instance, within the last 5 minutes.
  Three that count within 5 minutes warn "More than one server is using this
  key" on the server page. Two servers on one key trip it within about 30 s.
  A restart or map change brings a new `instanceId` that was never superseded,
  so it never counts, however often it happens. Regenerate key starts the
  count again. The count is kept in memory with the held polls.
- Regenerate key and Delete end the key at once. A poll held on it is answered
  `401` `key-rejected`, and so is a poll whose body was still arriving when
  the key ended.
- A poll whose game server hangs up while it is held ends at once.
- A platform restart drops every held poll. Each game server gets a failure
  and polls again about 10 s later.

## What the owner sees

- **Connected**: a poll is held, or one ended within about 15 s. A mod that
  polls again at once after `no-change`, or about 10 s after `superseded`,
  stays Connected.
- **Not connected**, with last seen: no poll for more than about 15 s. Also
  straight after Regenerate key, until a poll with the new key is held.
- **Never connected**: no poll yet.
- **More than one server is using this key**, with a pointer to Regenerate
  key, while the shared-key warning above is tripped.
- The last build stamp and the last `processed` id and result, as reported.

## Recorded and logged

- The key is stored only as its SHA-256 hash, plus its last 4 characters for
  the server page. It never appears in a log line.
- Each poll records its time, build stamp and `processed`. An unchanged report
  writes its time to the database at most every 5 minutes. Between writes the
  exact time is kept in memory.
- Routine polls are never logged. The platform logs:
  - `poll.superseded` (info, with `gameServerId`);
  - `key.shared` (warning, with `gameServerId`), once each time the shared-key
    warning trips;
  - `poll.bad-request` (warning, with `gameServerId` and the `error`);
  - `poll.key-rejected` (info, with `count`), once per clock hour that had any.

## Trying it by hand

Register a game server on the Game servers tab, copy its key, then:

```bash
curl -X POST http://localhost:3000/game-server/poll -H "Authorization: Bearer ezc_gsk_..." -H "Content-Type: application/json" -d '{"buildStamp":"20261102-120000","instanceId":"manual-test"}'
```

The server page shows Connected within 2 s. The command answers
`{"answer":"no-change"}` after 50 s, and the page shows Not connected about
15 s later.
