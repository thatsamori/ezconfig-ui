# 10: How is V1 hosted and deployed on AWS?

Status: open
Type: grilling
Created: 2026-11-01
Blocked by: 03, 05, 07
Parent: [Map: EZConfig online platform](../map.md)

## Question

Pick the AWS compute, database and cache services, region, backups and a
restore check, secrets handling, domain and TLS, and how a change gets
deployed. Compute must fit whether the platform holds long-lived connections
to game servers. Confirm or revise the ~$25/month soft ceiling against the
priced setups.

## Context

- [What does each candidate AWS setup cost per month at V1 scale?](03-aws-stack-costs.md)
- [How do the platform and a game server talk?](05-platform-game-server-communication.md)
- [Where does each entity get stored?](07-entity-storage.md)
