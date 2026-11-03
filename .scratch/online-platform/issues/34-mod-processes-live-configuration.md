# 34: Mod processes a delivered Live configuration

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 29, 33
Parent: [Spec: EZConfig online platform (V1)](../spec.md)
Repo: the EZConfig mod. Evidence goes in the mod's `.scratch/online-platform/`.

## What to build

When a poll brings a Live configuration, the mod processes it as today's
command batch and reports the result. The owner sees Confirmed or Failed on
the platform, and players see a delivery message in chat.

The processed id is saved with the snapshot, so:
- an interrupted delivery is delivered again;
- a restart onto a new build gets the configuration once more;
- a plain restart or map change gets nothing.

## Acceptance criteria

- [x] A delivered Live configuration runs as today's command batch: a wipe,
      then one command per non-empty category. Each command is
      all-or-nothing, processing stops at the first failed command, and what
      was applied before it is kept.
- [x] Only when processing ends, the mod saves the processed id with its
      snapshot, together with the result and its own build stamp.
- [x] Every poll sends the saved id and result. The mod reports no id when
      its build stamp differs from the saved one.
- [x] After processing, the mod polls again at once with the result.
- [x] The result carries the counts and unknown keys, and on failure the
      category (and weapon) and the error.
- [x] The delivery message counts changed values (added, changed, or removed
      back to the game default) against what the server had. It goes to chat
      and the log, for example "EZConfig: received 140 values, 12 changed",
      with "incomplete" added when processing stopped. With nothing changed it
      goes only to the log. Manual commands keep today's command
      acknowledgment.
- [x] Proof: a response of about 100 KB (every key on every weapon) decodes
      and processes.
- [x] Proof, from a sandbox server against a local platform:
      - an Apply changes in-game values within about 5 s and shows Confirmed;
      - a map change during processing gets the configuration again;
      - a new build stamp gets it again;
      - a restart on the same build gets nothing;
      - a failing command shows Failed with its category;
      - frame time stays flat.
- [x] The mod's contract checks pass, and its ADR for the poll loop covers
      processing and reporting.

## Comments

2026-11-03: Built in the EZConfig mod (not pushed). Evidence is in the mod's
`.scratch/online-platform/live-configuration/`; start at its `README.md`.
Raw logs, captures, saves and the test Game server key stay in
`C:\Users\chris\projects\ezconfig-local-tests\op34\`.

- Commits:
  - `7299c1f`: the processed record saved with the snapshot
    (`build_server_persistence.py`, `verify_server_persistence.py`);
  - `08dbe80`: delivered commands neither save nor acknowledge one by one
    (`build_command_acknowledgments.py`);
  - `b56d827`: processing and reporting in `build_platform_poll.py`;
  - `a05a1e3`: build 1 assets, stamp `20261103-011722`;
  - `b1a6b35` and `37549e9`: changed-count fixes found in the sandbox (the
    parser leaves the previous key's values in an entry's unused fields; the
    DataType enum's bytes are not its display order);
  - `1ecac0f`: build 3 assets, stamp `20261103-015605`;
  - `c8203ee`: ADR 0013 "Processing and reporting a Live configuration",
    CONTEXT.md, engine notes, server persistence, STATUS.md;
  - `b2115fe`: the evidence folder.
- Sandbox proof (pak 3, kit smoke, a clean export of main `7ec87c4` on
  `127.0.0.1:3929` behind a recording proxy):
  - Apply: the held poll answered 1 ms after the Apply. The mod processed
    and reported `processed` 369 ms after it, and logged "received 175
    values, 3 changed", matching the review's 3 changed. An unchanged Apply
    logged "0 changed".
  - Size: every key on every weapon, 189 commands. The answer was 218 871
    bytes decoded (10 954 gzipped) and logged "6422 values, 6250 changed",
    matching the review's 6247 added + 3 changed.
  - Removal: a Character-only Apply after the full one logged "175 values,
    6247 changed" (review: 6247 reset).
  - Map change during processing: no message or processed record on that map.
    The next map's poll carried no `processed` and got the configuration
    again.
  - Restart on the same build: the save restored, the first poll carried the
    saved id and result, and it was held with no delivery.
  - New build stamp, simulated: the save's processed stamp was rewritten to an
    older one. No `processed` was sent, and the configuration came again.
  - Failing command: "processing stopped at Axe General: Invalid numeric
    representation" and "received 353 values, 353 changed, incomplete". The
    report had `success:false`, `failure {database: Axe, category: General,
    error}` and `unknownKeys [{Character, Camera, Op34RetiredKey}]`.
  - The processed poll always followed at once, and every later poll repeated
    the id and result.
- Not proven at runtime:
  - Confirmed and Failed on the platform: #33 is not on main yet. The mod's
    reports match the #33 branch's expectations.
  - The chat half of the delivery message: the sandbox has no players. The
    log line is proven, and the graph broadcasts only when the changed count
    is above 0.
  - In-game values on a player: the databases changed and saved. Players get
    them through the existing replication and apply.
  - A failed wipe, and an invalid answer.

  For these reasons two criteria stay open: the delivery message and the
  sandbox proofs.
- Frame time: a character-sized delivery runs in 0.32 s with 1 frame lost,
  so it is flat. Every key on every weapon is not flat: about 11.5 s at
  about 20 fps. The same 189 commands sent over RCON cost the same or more
  (16.3 s, 551 frames lost). The parser's per-command cost grows with the
  Weapon database, from 0.5 to 3.1 ms per value through a delivery and to
  3.6 ms over RCON. The mod's STATUS.md lists indexing the hand-built
  parser's weapon upsert as a follow-up; that needs an owner decision.
- Contract: `docs/poll-exchange.md` says `changedValues` is "Of those, how
  many changed a value", which reads as at most `acceptedValues`. This
  ticket counts removals back to the default too, so it can be higher (6247
  against 175 in the removal run). The platform accepted it. Only the
  wording needs a look; I did not change it.
- Conservative choices (ADR 0013): an invalid answer is a failure and runs
  nothing; `unknownKeys` is capped at 100; "received N values" is
  `acceptedValues` (on a failure, the values before the stop); a manual
  command after a delivery leaves the saved id and result as they are.

2026-11-03, later: Confirmed and Failed proven against main `bd5e1b9` (#33
merged). The platform was a fresh `git archive` on `127.0.0.1:3929` with
fresh test data and a newly registered server. The mod is the same pak 3,
and the evidence commit is `1c23026` (`run-confirmed.json`,
`run-failed.json`, `run-recovered.json`). The proofs read the
`liveConfiguration` state from `GET /api/game-servers`, the view the page
renders.

- Confirmed:
  - An Apply while the first poll was held showed `confirmed`, with
    `reportedAt` 401 ms after `appliedAt`.
  - Three values toggled and applied: `confirmed` for the new id 376 ms
    after the Apply.
  - Confirmed stayed beside Not connected once the server stopped.
- Failed:
  - With every key on every weapon Live and the test proxy breaking command
    20, an Apply showed `failed`, `failure {database: Axe, category:
    General, error: "Invalid numeric representation"}`, 504 ms after the
    Apply.
  - The failed report was held 50 s and answered `no-change`: nothing was
    re-sent.
- Restart after the failure:
  - The save held the categories before the failure: 175 Character and 178
    weapon entries.
  - The server reported the same failure, `reportedAt` unchanged, and was
    held with nothing re-sent.
- Recovery:
  - A no-change Apply re-sent the configuration under a new id. The state
    was `pending` while it ran, then `confirmed` 11.6 s after the Apply.
  - That run also carried an unknown key, and `ignoredKeys` named it
    (`Character`, `Camera`, `Op34RetiredKey`).
- The sandbox-proofs criterion is now ticked. One criterion stays open: the
  chat half of the delivery message.
  - The broadcast sends `ClientMessageBP` to each player controller, so a
    sandbox with no players cannot show it, and RCON cannot see it.
  - The owner needs to watch a Live configuration arrive in-game on a server
    with a player: "EZConfig: received N values, M changed" in chat, and
    nothing in chat for an unchanged Apply.
- Still not run: a failed wipe (the mod builds the wipe command itself, so
  the test proxy cannot break it) and an invalid answer. Both are covered by
  the graph.
- Note: the first bd5e1b9 start used a copy of the earlier test data in a
  new folder. Migration 0008 ran, then startup stopped with "Parry
  migration: backup does not match these storage roots". The parry
  migration's backup is tied to its storage paths. That may matter for a
  restore onto different paths (#39's runbook). The proofs used fresh data
  instead.

2026-11-03, later still: The owner saw "EZConfig: received N values, M changed" in
chat when an Apply reached the Oregon game server with their player connected, so
the last criterion is ticked. Nobody watched chat during an unchanged Apply. That
half rests on the sandbox's log line and the graph, which broadcasts only when the
changed count is above 0. A failed wipe and an invalid answer are still not run.
