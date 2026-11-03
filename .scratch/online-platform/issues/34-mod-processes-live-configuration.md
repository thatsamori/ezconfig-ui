# 34: Mod processes a delivered Live configuration

Status: open
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

- [ ] A delivered Live configuration runs as today's command batch: a wipe,
      then one command per non-empty category. Each command is
      all-or-nothing, processing stops at the first failed command, and what
      was applied before it is kept.
- [ ] Only when processing ends, the mod saves the processed id with its
      snapshot, together with the result and its own build stamp.
- [ ] Every poll sends the saved id and result. The mod reports no id when
      its build stamp differs from the saved one.
- [ ] After processing, the mod polls again at once with the result.
- [ ] The result carries the counts and unknown keys, and on failure the
      category (and weapon) and the error.
- [ ] The delivery message counts changed values (added, changed, or removed
      back to the game default) against what the server had. It goes to chat
      and the log, for example "EZConfig: received 140 values, 12 changed",
      with "incomplete" added when processing stopped. With nothing changed it
      goes only to the log. Manual commands keep today's command
      acknowledgment.
- [ ] Proof: a response of about 100 KB (every key on every weapon) decodes
      and processes.
- [ ] Proof, from a sandbox server against a local platform:
      - an Apply changes in-game values within about 5 s and shows Confirmed;
      - a map change during processing gets the configuration again;
      - a new build stamp gets it again;
      - a restart on the same build gets nothing;
      - a failing command shows Failed with its category;
      - frame time stays flat.
- [ ] The mod's contract checks pass, and its ADR for the poll loop covers
      processing and reporting.
