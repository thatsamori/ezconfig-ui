# 10: How is V1 hosted and deployed on AWS?

Status: open
Type: grilling
Created: 2026-11-01
Blocked by: 03, 05, 07
Parent: [Map: EZConfig online platform](../map.md)

## Question

Pick the AWS compute (the database is settled as one SQLite file, no
cache), region, backups and a restore check, secrets handling, domain and
TLS, and how a change gets deployed. Compute must fit whether the platform
holds long-lived connections to game servers. Confirm or revise the
~$25/month soft ceiling against the priced setups.

## Context

- [What does each candidate AWS setup cost per month at V1 scale?](03-aws-stack-costs.md)
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
- [Where does each entity get stored?](07-entity-storage.md)
- [How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md):
  the Supported build is a runtime setting the operator changes without a
  deploy. Settled by
  [Where does each entity get stored?](07-entity-storage.md): a stored platform
  setting.
- From [Where does each entity get stored?](07-entity-storage.md): all data is
  one SQLite file at `DATABASE_PATH`, with no Redis and no database server.
  Decide how that file is backed up and restored (for example continuous
  copying to S3, or nightly consistent copies), how schema changes run on
  deploy, and whether the app runs on Node or Bun: tests run on Bun, which
  cannot load `node:sqlite`, so the SQLite driver follows that choice.
  Earlier Live configurations are kept, worst case about 2 GB a year.
