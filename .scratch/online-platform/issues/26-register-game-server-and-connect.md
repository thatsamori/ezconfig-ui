# 26: Register a game server and see it Connected

Status: open
Type: task
Created: 2026-11-02
Blocked by: 23
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner registers a game server and gets its Game server key once,
with the setup checklist. When anything polls with that key, the server page
shows Connected within a few seconds.

This slice builds the poll endpoint and its in-process registry of held polls.
Nothing is delivered yet: [Supported build](27-supported-build.md) and
[Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) add that.
The poll exchange's JSON fields are chosen here and documented as the contract
that [Mod polls the platform](29-mod-polls-the-platform.md) builds against.

## Acceptance criteria

- [ ] A server owner registers a game server by name. Names are unique per
      owner, ignoring case. An empty Draft is created with it.
- [ ] The key is `ezc_gsk_` followed by 32 random bytes in base64url. It is
      stored only as a SHA-256 hash with a unique index, plus its last 4
      characters. It is shown in full once, with a copy button and "You won't
      see this key again".
- [ ] A Never connected game server's page shows the setup checklist from the
      spec. The Game.ini block holds the real key only while it is shown;
      afterwards the step reads "Key ending in `ab12`. Lost it? Regenerate
      key."
- [ ] The poll endpoint accepts only POST, with `Authorization: Bearer <key>`:
      - An unknown key gets `401` "key rejected". These polls are logged as
        one count per hour.
      - A known key records the last poll time, the reported build stamp, and
        the reported processed id and result as reported.
      - The poll is held for up to 50 s (settable for tests), then answered
        "no change".
      - A newer poll from the same game server supersedes the held one, which
        is answered "superseded".
- [ ] Held polls live in one in-process registry keyed by game server, along
      with the instance ids. Routine polls are never logged; superseding is.
- [ ] Connection status is computed, never stored:
      - Connected: a poll is held, or one ended within about 15 s.
      - Not connected: shown with last seen.
      - Never connected: no poll yet.
- [ ] The server list and the server page refresh about every 2 s while open.
- [ ] The poll exchange's request and response fields are documented in
      `docs/` as the contract for the mod.
- [ ] If the walking skeleton's temporary held-poll route exists, this
      endpoint replaces it.
- [ ] Route-handler tests cover:
      - registering, including duplicate names;
      - the key shown once and stored only hashed (the database file never
        contains the key);
      - `401`, the hold ending in "no change", and superseding;
      - each connection status, with time moved forward.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
