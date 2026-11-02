# 07: Where does each entity get stored?

Status: open
Type: grilling
Created: 2026-11-01
Blocked by: 03, 04, 05, 06
Parent: [Map: EZConfig online platform](../map.md)

## Question

Choose storage for User and sessions, GameServer, Ruleset, Ruleset version and
the live configuration, and sketch their schemas.

## Context

The owner's starting proposal (2026-11-01): User, sessions, GameServer and
Ruleset in Postgres; the live configuration in Redis, with last-updated and
sent-to-server metadata; Ruleset versions in DynamoDB, because the key set
keeps growing.

Points raised while charting, to answer or overturn:
- Size: 182 Character keys plus 65 Weapon keys across 38 EZ weapon classes
  makes 2,652 values; about 100 KB of JSON if every key is set, a few KB for
  typical overrides. Around 10k versions, about 100 MB at the worst. Well under
  one write per second.
- Postgres JSONB is as schemaless as DynamoDB; a growing key set is a
  versioning problem
  ([How do Ruleset versions stay usable as the key contract changes?](06-ruleset-versions-and-key-contract.md)),
  not a document-store problem.
- Spreading Ruleset and Ruleset version across two stores loses the foreign key
  and the transaction (deleting a Ruleset), and adds backups and local setup.
  DynamoDB items are capped at 400 KB.
- The live configuration is source-of-truth data; Redis needs persistence
  settings to hold it, or it serves only as a cache or for notifications.
- Counterpoint: on AWS, DynamoDB on-demand may cost cents while managed
  Postgres is likely the biggest monthly line
  ([What does each candidate AWS setup cost per month at V1 scale?](03-aws-stack-costs.md)).
