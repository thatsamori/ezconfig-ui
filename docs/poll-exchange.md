# Poll exchange: the platform–mod contract

Status: the platform side is built (online-platform#26, the Supported build
in #27, Regenerate key, Delete and the shared-key warning in #28, Apply's
delivery in #32, Confirmed, Failed and the re-delivery rules in #33, and
Blocked in #44). The mod builds its poll loop against this page
([#29](../.scratch/online-platform/issues/29-mod-polls-the-platform.md)), and
processes and reports deliveries against it
([#34](../.scratch/online-platform/issues/34-mod-processes-live-configuration.md)).
The field names, answers and status codes are a published contract, like the
Game.ini names: change them only together with the mod, and record the change
here and in the mod's ADR for the poll loop.

The platform side is `src/app/game-server/poll/route.ts`, which reads polls
with `src/lib/platform/poll-exchange.ts`, holds them in
`src/lib/platform/polls.ts` and delivers Live configurations from
`src/lib/platform/live-configurations.ts`.

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
| `200` | `live-configuration` | On the Supported build only. At once, never held: the game server has a Live configuration that is not Blocked, and its id is not the reported `processed.liveConfigurationId` (another id, one the platform does not know, or no `processed`). Or, while the poll is held, an Apply makes a new Live configuration. Never before the game server's first Apply. | `liveConfigurationId`, `commands` (below) | processes it, then polls at once with `processed` |
| `200` | `no-change` | The hold (50 s) ended with nothing to deliver (a Blocked Live configuration is never delivered), and `buildStamp` is the Supported build. | none | polls again at once |
| `200` | `not-supported-build` | The hold (50 s) ended, and `buildStamp` is not the Supported build: another stamp, `""`, or no Supported build is set. Nothing is ever delivered to it. | none | polls again at once |
| `200` | `superseded` | A newer poll with the same key arrived while this one was held. | none | waits about 10 s, then polls |
| `401` | `key-rejected` | The `Authorization` header is missing or not `Bearer <key>`, or the key is unknown: never registered, regenerated, or its game server deleted. Also a held poll, at once, when Regenerate key or Delete ends its key. | none | logs once, then retries every 60 s |
| `400` | `bad-request` | The key is known but the body breaks this contract. | `error`: which field and why | treats it as a failure: logs `error`, waits about 10 s |
| `500` | `error` | The platform failed. | none | treats it as a failure: waits about 10 s |

## Delivery: the `live-configuration` answer

A game server is sent its whole Live configuration, never part of one:

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

- `liveConfigurationId` is a random UUID, new with each Apply, even an Apply
  that changed nothing. The mod reports it back as
  `processed.liveConfigurationId` once it has processed the delivery.
- `commands` holds one entry per non-empty category, grouped with the deploy's
  schema when it is sent (`encodeValues` in `src/lib/config/encodeValues.ts`),
  Character categories first, then each weapon's, in schema order.
  `database` is `Character` or a weapon class. `values` is a string: the JSON
  object text today's `ezconfig <database> <category> <values>` command takes,
  with values encoded as today's command builder encodes them (every value a
  string). A value whose key or weapon class this deploy's schema lacks is
  not sent. An empty Live configuration has no entries: the wipe alone.
- The mod processes it as today's command batch: wipe first, then one command
  per entry in order. Each command is all-or-nothing. Processing stops at the
  first failed command and keeps what was applied before it.
- One result covers the whole delivery, reported as `processed` on every later
  poll.

When it is sent (the re-delivery rules):

- Only to a poll whose `buildStamp` is the Supported build. Any other build is
  sent nothing, whatever it reports.
- At once, when the reported `processed.liveConfigurationId` is not the Live
  configuration's: an id from an earlier Apply, one the platform does not know,
  or no `processed` at all (the mod never finished processing one, or its
  build stamp changed since). So a delivery cut off by a crash or a map
  change, or a game server restarted onto a new build, gets it again, and one
  that already processed it gets nothing more after a restart or map change.
  A poll answered at once is never held, but it supersedes the held poll like
  any newer poll.
- Never again, on its own, to a poll reporting the Live configuration's id,
  whatever its `result`: a Failed configuration is not resent automatically,
  since it would fail at the same command. An Apply sends it again, even one
  with no changes: it makes a new id. So does a build change, since the mod
  then reports no `processed`.
- From a held poll, when an Apply makes a new Live configuration: Apply wakes
  the poll as soon as its transaction commits, so a Connected game server
  gets it within about one round trip. Whether the poll's build is the
  Supported build is still decided when it is answered: if it no longer is,
  it gets `not-supported-build` instead.
- Never to a game server that has no Live configuration yet (before its
  first Apply): its polls get `no-change`, so the first poll from a server
  that already runs EZConfig never wipes the values it has.
- Never while it is Blocked: the current schema refuses a value in it that
  the schema has a place for, as a deploy that tightens a key (a whole number
  where a fraction was allowed, a smaller range) can leave a stored one. It
  is never sent in part either, since the wipe would put a dropped value at
  its game default. A poll that would get it is held and answered
  `no-change`, as if there were nothing to send, so the mod keeps the values
  it has and polls once per hold. An Apply of the fixed Draft wakes the held
  poll with the new Live configuration: Apply refuses a Draft the schema
  refuses.
- A game server that is not Connected when an Apply happens gets it at its
  next poll; nothing expires. A newer Apply replaces the Live configuration,
  so the newest one is delivered.

Anything else is a failure, and the mod waits about 10 s: no response, a
timeout, a status not listed here (a proxy's `502` or `504`), a body that is
not JSON, or an `answer` the mod does not know.

## Reporting: Confirmed, Failed and Pending

The owner sees the Live configuration as Pending, Blocked, Confirmed or
Failed. The platform computes it from the game server's last reported
`processed` and the current schema when asked, and never stores it:

- **Confirmed**: `processed.liveConfigurationId` is the Live configuration's
  and `result.success` is true. Keys in `result.unknownKeys` show as a warning
  that names them; the configuration is still Confirmed.
- **Failed**: `processed.liveConfigurationId` is the Live configuration's and
  `result.success` is false. The page names `failure.category` (and
  `failure.database` when it is a weapon class, or the wipe when both are
  `""`), shows `failure.error`, and says the game server runs only the
  categories before it.
- **Blocked**: it would be Pending, and the current schema refuses a value in
  it, so it cannot be sent (above). The page names each value (Character or
  the weapon class, the category, the key and the schema's error), and says
  to fix them in the Draft and Apply. Confirmed and Failed stay as reported
  when the schema now refuses a value, since they say what the game server
  runs. Such a configuration becomes Blocked only when it has to be sent
  again, as after a build change.
- **Pending**: anything else, including an id the platform does not know,
  an earlier Apply's id, or no `processed`.
- None before the first Apply.

So the mod reports what it has finished:

- `processed` names a Live configuration only once processing it has ended,
  in success or at a failed command. A delivery cut off before then leaves
  the previous `processed` (or none), and the next poll gets it again.
- It sends the same `processed` on every poll until it processes another
  delivery, across restarts and map changes, so a lost reporting poll loses
  nothing.
- It sends no `processed` when its build stamp differs from the one it saved
  with that id: the new build gets the whole configuration again.

The first poll that reports a given id and result sets when it became
Confirmed or Failed; repeating it changes nothing.

## Holding and superseding

- The platform checks the key first, then the body, so an unknown key gets
  `401` whatever the body. A known key's report is recorded, then the poll is
  held.
- A poll is held for up to 50 s. The mod's request timeout, and any proxy in
  front of the platform, must allow at least 60 s.
- A poll whose `buildStamp` is not the Supported build is held like any
  other, so an outdated game server stays Connected without polling in a
  tight loop. Whether it is the Supported build is decided when the hold
  ends: the platform operator can switch the Supported build at any time,
  without a deploy, and a held poll gets the answer for the build it reported.
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
- **EZConfig needs updating**, beside the connection status: the last
  reported `buildStamp` is not the Supported build. The page shows both
  stamps. While no Supported build is set, it says so instead.
- **More than one server is using this key**, with a pointer to Regenerate
  key, while the shared-key warning above is tripped.
- The Live configuration's state, as its own indicator beside the connection
  status, on the server list and the server page, so "Failed, and now Not
  connected" shows both: Pending with how long since the Apply, Blocked,
  Confirmed with when, or Failed with when; none before the first Apply. The
  server page adds the ignored keys, the Failed detail and the values a
  Blocked one holds that the schema refuses.
- The last build stamp and the last `processed` id and result, as reported.

## Recorded and logged

- The key is stored only as its SHA-256 hash, plus its last 4 characters for
  the server page. It never appears in a log line.
- Each poll records its time, build stamp and `processed`. An unchanged report
  writes its time to the database at most every 5 minutes. Between writes the
  exact time is kept in memory. A `processed` id or result that differs from
  the last one recorded also records its own time: when it became Confirmed or
  Failed.
- Routine polls are never logged. The platform logs:
  - `poll.superseded` (info, with `gameServerId`);
  - `key.shared` (warning, with `gameServerId`), once each time the shared-key
    warning trips;
  - `poll.bad-request` (warning, with `gameServerId` and the `error`);
  - `poll.not-supported-build` (info, with `gameServerId` and the
    `buildStamp` when it has the `YYYYMMDD-HHMMSS` form), when a game
    server's first poll, or a poll whose `buildStamp` differs from its last
    one, reports a build that is not the Supported build;
  - `poll.key-rejected` (info, with `count`), once per clock hour that had any;
  - `live-configuration.delivered` (info, with `gameServerId` and
    `liveConfigurationId`), for each delivery, at once or from a held poll.
    The Apply that made it is logged as `live-configuration.applied`, with the
    server owner's `userId` as well. Neither logs any value.
  - `live-configuration.blocked` (warning, with `gameServerId` and
    `liveConfigurationId`), the first time since the platform started that a
    poll on the Supported build finds that Live configuration Blocked. A
    restart logs it once more. No key name, category or value is logged.
  - each reported result once, when a poll reports a `processed` id or result
    that differs from the last one recorded, with `gameServerId` and the
    reported `liveConfigurationId`, known or not, when it has the form the
    platform makes (a UUID):
    `live-configuration.processed` (info) for a success,
    `live-configuration.keys-ignored` (warning, with how many) for a success
    with `unknownKeys`, and `live-configuration.failed` (warning) for a
    failure. No key name, category or `failure.error` is logged. A poll
    reporting no `processed` logs nothing.

## Trying it by hand

Register a game server on the Game servers tab, copy its key, and as the
platform operator set the Supported build to `20261102-120000` on the
Supported build page. Then:

```bash
curl -X POST http://localhost:3000/game-server/poll -H "Authorization: Bearer ezc_gsk_..." -H "Content-Type: application/json" -d '{"buildStamp":"20261102-120000","instanceId":"manual-test"}'
```

The server page shows Connected within 2 s. The command answers
`{"answer":"no-change"}` after 50 s, and the page shows Not connected about
15 s later. With another `buildStamp`, or before the Supported build is set,
it answers `{"answer":"not-supported-build"}` after 50 s and the page shows
EZConfig needs updating.

To see a delivery, edit the Draft, run the command again, and choose Review
and Apply on the server page while it is held: it answers at once with
`live-configuration`. Run it again with
`"processed":{"liveConfigurationId":"<that id>","result":{"success":true,"acceptedValues":1,"changedValues":1,"unknownKeys":[]}}`
in the body and it is held, and the page shows Confirmed; without `processed`,
it gets the Live configuration again at once, and the page shows Pending.
With
`"result":{"success":false,"acceptedValues":0,"changedValues":0,"unknownKeys":[],"failure":{"database":"Character","category":"Movement","error":"COULD NOT PARSE DATA TYPE FOR KEY: MaxWalkSpeed"}}`
it is held too, and the page shows Failed at Movement with that error.
Review and Apply with no changes then answers the held poll with the same
configuration under a new id, and the page shows Pending again.
