# 39: Weekly restore check and restore runbook

Status: blocked; waits on the owner to run the drill on a fresh Lightsail instance
Type: task
Created: 2026-11-02
Blocked by: 38
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The instance checks its own backups every week and the operator's page shows
the result. The owner can rebuild the platform from the bucket by following a
written runbook, and has done so once before launch.

Human in the loop: the drill creates and removes a Lightsail instance in the
owner's project. An agent can write the timer, the check script and the
runbook.

## Acceptance criteria

- [ ] A weekly systemd timer on the instance:
      - restores the latest Litestream backup into a temp file;
      - runs `PRAGMA integrity_check`;
      - compares row counts per table with the live database;
      - writes the result (time, passed or failed, reason) to the status file
        beside the database, never into it.
- [ ] The operator's page shows the timer's result.
- [ ] `docs/` holds:
      - a restore runbook: build a fresh instance, restore from the bucket,
        start the app and sign in;
      - a deployment and instance setup doc covering the env file, Caddy,
        systemd, journald, Litestream and the deploy script.
- [ ] The restore drill is run once, end to end, on a fresh Lightsail
      instance. The result is recorded under this ticket's Comments, and the
      drill instance is removed afterwards with the owner's go-ahead.
- [ ] `AGENTS.md`'s docs index lists the new docs.
