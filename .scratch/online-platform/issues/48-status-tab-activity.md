# 48: Activity on the Status tab

Status: completed
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

- [x] The Status tab has an Activity section with the three groups above, naming
      no game server or owner.
- [x] Each state count comes from `liveConfigurationState`, so it cannot differ
      from what the game server's page shows.
- [x] Route-handler tests cover: an empty platform, the window edges (24 h and
      7 days), an owner with two sessions counted once, each state plus none,
      and a game server Applied twice counted once.
- [x] The page's load time with about 50 full configurations is recorded here.
      If it is slow, this says so and proposes a fix.
- [x] The header comment in `status.ts`, `docs/hosting.md` and the spec's list
      describe it.
- [x] Checked in a browser at narrow and wide widths on a built app with a temp
      database.
- [x] `bun run typecheck` and the full suite pass, the lint count does not rise,
      and there is no migration.

## Comments

2026-11-03: Done on branch `claude/vigilant-kapitsa-948052` (not pushed), on main
`5fe3bc1`. 227 tests pass across 44 files, typecheck is clean, and lint
stays at 5. No migration.

- Commits:
  - `0a51cf2` adds the counts: `countLiveConfigurations` in
    `live-configurations.ts` and `activity` in `status.ts`, with three scenarios
    in `tests/fixtures/platform-status.ts`.
  - `bc24e53` is the section, `ActivitySection` in `StatusPage.tsx`, with
    `tests/status-activity.test.tsx`.
  - `cc42910` stacks it at narrow widths and updates `docs/hosting.md` and the
    spec's list.
- `GET /api/operator/status` gains `activity`: `serverOwners` (`total`,
  `seenLast24h`, `seenLast7Days`), `liveConfigurations` (`pending`, `blocked`,
  `confirmed`, `failed`, `none`) and `gameServersApplied` (`last24h`,
  `last7Days`). Either edge of a window counts, and the last 7 days include the
  last 24 h. Last seen comes from `listServerOwners`, so it is the Server owners
  tab's own value.
- Read these counts knowing:
  - **Seen can run low.** Last seen lives on the session, so signing out, Sign
    out everywhere and Remove access all clear it: a friend who used the platform
    this morning and signed out reads as not seen, here and on the Server owners
    tab. It is also written at most once an hour, so a count can miss someone by
    up to an hour at a window's edge. Fixing the first needs a last seen kept on
    the server owner, which is a migration, so it is not done here. The page's
    note says so, and the `activity-server-owners` scenario pins it.
  - **The operator counts.** A platform operator is a server owner, as on the
    Server owners tab, and is seen by opening the page, so "seen in the last 24 h"
    is always at least 1. A server owner with access removed counts in the total,
    and never as seen. The page's note says "include you".
  - **Game servers Applied** reads each game server's latest Apply only. One
    Applied three days ago and again an hour ago is in both windows once. A deleted
    game server leaves all of these counts.
- Load time, with 50 full configurations: **about 70 ms, worst case. Not slow; no
  fix needed.** Each document holds every key the schema has a place for, on every
  weapon: 6,429 values, 157 KB, all accepted by the schema. Timed on the built app
  (`next start`) on this Windows machine, 30 requests per run, two runs:

  | 50 Live configurations | `GET /api/operator/status`, median | p95 | Slowest |
  |---|---|---|---|
  | None (for comparison) | 1.7 ms | 4.7 ms | 5.9 ms |
  | All Confirmed: parsed, not checked | 23 ms | 31 ms | 33 ms |
  | All Pending: parsed and checked (worst case) | 70-74 ms | 76-91 ms | 98 ms |

  - In the browser, with all 50 Pending: the tab showed its counts 116 ms after the
    click, and 20 Refreshes took 87 ms at the median. Timed from a script, the first
    request of each run took about 120 ms.
  - A real Draft sets far fewer values than 6,429, so real loads are lower.
  - The check runs on the app's one process, so other requests wait for it, but
    only while the operator loads or refreshes this tab. The instance is a $12
    Lightsail bundle and was not measured (nothing is sent to it). It may be several
    times slower, which would still be well under a second.
  - If it ever matters: Confirmed and Failed never need the document, so they could
    skip parsing it, and the check's result could be kept per Live configuration id
    for the life of the process, since a row is never updated and the schema changes
    only with a deploy. Neither is worth doing now.
- Checked by hand on the built app (`next start`) on a temp database at
  `op48.localhost:3551`, signed in with `signInForTest` as a made-up operator, with
  a script polling as the mod for two made-up game servers.
  - Seeded with six server owners and eight game servers, the page read 6 in all, 3
    seen in the last 24 h and 4 in the last 7 days (one was last seen 10 days ago,
    and one had signed out); 1 Pending, 1 Blocked, 3 Confirmed and 1 Failed; 2 with
    no Live configuration; 3 and 5 Applied. All as seeded. One Confirmed and the
    Failed came from the poller over HTTP: delivered, then reported.
  - Registering a game server changed nothing until Refresh, which then showed 9
    registered and 3 with none. No made-up name appears on the page.
  - Widths: at 800 and 1280 px the section is two columns. At 320 px the first
    build's labels squeezed the values off the side of the page, so below 560 px it
    now stacks each label over its value. Nothing overflows at 320, 420, 800 or
    1280 px.
- Not in the Needs attention box: a Failed or Blocked count shows here but raises no
  warning there, since this ticket is counts only.
