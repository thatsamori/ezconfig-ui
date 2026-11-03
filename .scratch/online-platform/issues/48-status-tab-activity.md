# 48: Activity on the Status tab

Status: in-progress
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The owner is about to invite friends to test the platform and wants to see how
they are getting on without SSH. The Status tab shows game servers, health and
backup, and the Server owners tab shows each owner's last seen, but nothing
shows activity across all of them. Decided with the owner on 2026-11-03: extend
the Status tab rather than build anything separate.

An **Activity** section on the Status tab, computed when the page loads like
the rest of the tab. Counts only, and all from tables that already exist:

- **Server owners:** how many, and how many were seen in the last 24 h and the
  last 7 days, from `sessions.last_seen_at`.
- **Live configurations by state:** Pending, Blocked, Confirmed and Failed, plus
  game servers with none yet. State is computed, never stored
  (`liveConfigurationState`).
- **Game servers Applied** in the last 24 h and the last 7 days, from
  `live_configurations.applied_at`. There is one row per game server, so this
  counts game servers, not Applies, and is labelled that way.

Limits:
- It names no game server or owner. Per-owner last seen stays on the Server
  owners tab.
- No migration and no new table. The spec's out-of-scope list rules out an audit
  table, an error table, a recent-activity list, alerts outside the platform and
  outside services.
- State reads each Live configuration's document and checks it against the
  schema, so the page's load time is measured with about 50 full configurations.

## Acceptance criteria

- [ ] The Status tab has an Activity section with the three groups above, naming
      no game server or owner.
- [ ] Each state count comes from `liveConfigurationState`, so it cannot differ
      from what the game server's page shows.
- [ ] Route-handler tests cover: an empty platform, the window edges (24 h and
      7 days), an owner with two sessions counted once, each state plus none,
      and a game server Applied twice counted once.
- [ ] The page's load time with about 50 full configurations is recorded here.
      If it is slow, this says so and proposes a fix.
- [ ] The header comment in `status.ts`, `docs/hosting.md` and the spec's list
      describe it.
- [ ] Checked in a browser at narrow and wide widths on a built app with a temp
      database.
- [ ] `bun run typecheck` and the full suite pass, the lint count does not rise,
      and there is no migration.

## Comments
