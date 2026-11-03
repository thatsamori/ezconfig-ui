# 33: Confirmed and Failed

Status: open
Type: task
Created: 2026-11-02
Blocked by: 32
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner sees whether the game server processed its Live configuration.
The state is Confirmed (with any ignored keys named), Failed (with where
processing stopped and why), or still Pending. It is computed from the
game server's last report, never stored.

The platform also handles the re-delivery rules:
- a server that reports no id, or an id the platform does not know, gets the
  Live configuration again;
- a server that reports the current id gets nothing.

## Acceptance criteria

- [ ] The state is computed from the game server's last reported processed id
      and result:
      - Confirmed: the id is the current Live configuration's and the result
        succeeded. A warning names any keys the server ignored.
      - Failed: the id is the current Live configuration's and processing
        stopped at a failed command. The page names the category (and weapon)
        and the mod's error, and says the server runs only the categories
        before it.
      - Pending: anything else, including an id the platform does not know.
      - None: before the first Apply.
- [ ] A Failed configuration is never resent automatically. A no-change Apply
      re-sends it.
- [ ] A poll reporting no processed id gets the whole Live configuration
      again, as after the mod's build changes. A poll reporting the current id
      gets nothing, as after a restart or map change.
- [ ] Connection and Live configuration state are separate indicators, so a
      state like "Failed, and now Not connected" shows both.
- [ ] Each reported result is logged once, when it changes.
- [ ] The feature review harness's simulated success report makes the
      configuration Confirmed.
- [ ] Route-handler tests cover:
      - Confirmed, with and without ignored keys;
      - Failed, with its detail;
      - Pending for an unknown id;
      - re-delivery after no id is reported;
      - no re-send after Failed;
      - recovery by a no-change Apply.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
