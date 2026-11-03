---
status: accepted
---

# One SQLite file holds all hosted platform data

The hosted platform (V1) keeps every entity in one SQLite file on its one
instance: users, sessions, game servers, Drafts, Live configurations,
Rulesets and their versions, Notes and the Supported build setting. There is
no Redis, no DynamoDB and no database server. V1 is one instance with no high
availability, writes stay well under one a second and data under 1 GB, so a
database server would add patching, securing, RAM and a separate backup for
nothing the platform uses. Decided in
[Where does each entity get stored?](../../.scratch/online-platform/issues/07-entity-storage.md).

## Considered options

- **Postgres on the instance** (the owner's first proposal): the same client
  works under Bun and Node, and Lightsail's managed Postgres is an upgrade
  path. Rejected because it needs the larger box, self-run patching and
  `pg_dump`, and a Postgres for every test run; the managed path only matters
  for high availability, which is out of scope, and RDS is over the budget.
- **Redis for the Live configuration**: it is source-of-truth data, so Redis
  would need persistence and its own backup. Its one remaining job, waking
  held long polls on Apply, is an in-process event on the one instance.
- **DynamoDB for Ruleset versions**: splitting stores loses the foreign keys
  and transactions that keep deleting a Ruleset and saving a version atomic,
  and the growing key set is handled without a document store. Its cost edge
  needed Lambda, which long polling rules out.

## Consequences

- A backup is a consistent copy of one file, and a restore puts it back.
- Tests and local development use a real database in a temp file at
  `DATABASE_PATH`, with no service to run.
- Tests run on Bun, which cannot load `node:sqlite` (Bun 1.3.14), while the
  app runs on Node 22: the build needs a thin adapter over `bun:sqlite` and
  `node:sqlite`, or runs the app on Bun. Settled in
  [How is V1 hosted and deployed on AWS?](../../.scratch/online-platform/issues/10-aws-hosting-and-deployment.md):
  the app runs on Bun, and `bun:sqlite` is the one driver.
- More than one instance would mean moving to a database server first. The
  in-memory registry of held polls already ties the platform to one process.
