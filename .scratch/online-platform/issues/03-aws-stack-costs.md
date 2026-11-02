# 03: What does each candidate AWS setup cost per month at V1 scale?

Status: resolved
Type: research
Created: 2026-11-01
Blocked by: None
Parent: [Map: EZConfig online platform](../map.md)

## Question

Monthly AWS cost, with us-east-1 as the baseline and the difference for one EU
region noted, of the parts a V1 could use, then of three or four assembled
setups compared against the ~$25/month soft ceiling.

V1 scale: at most 100 users (about 20 daily), at most 20 game servers, a
change every few seconds while someone is tuning, game servers possibly polling
every 2 to 5 s, under 1 GB of data.

Parts to price:
- Compute that can hold long-lived TCP connections (small EC2 such as t4g,
  Lightsail, ECS Fargate, App Runner) and request-only compute (Lambda).
- Postgres: RDS smallest instance, Lightsail managed database, self-run on the
  instance.
- Redis: ElastiCache smallest node and serverless, self-run.
- DynamoDB on-demand at this load.
- Backups (RDS automated, EBS snapshots), Secrets Manager versus SSM Parameter
  Store, KMS, Route 53, ACM, data transfer, the public IPv4 charge.
- The free tier that applies to an existing account today (the credit-based
  free plan for newer accounts versus the legacy 12-month tier).

## Context

- Sources: AWS pricing pages and calculator, AWS free-tier documentation.
  Record the date prices were read.

## Answer

Prices read 2026-11-01, monthly, us-east-1 [Frankfurt].
- Cheapest that holds RCON: one Lightsail $12 box running app + Postgres + Valkey, $12.35 [$12.35].
- Also fit: EC2 t4g.small all-in-one $18.36 [$20.45]; EC2 t4g.micro + DynamoDB $11.62 [$12.75].
- Lambda URLs + DynamoDB: $3.95 to $10.84 [$4.18 to $12.01], but polling only (no RCON).
- Over the ceiling: EC2 + RDS $25.21 [$28.88]; with managed Redis $31 to $35; Fargate + ALB $33 before a database.
- App Runner has been closed to new customers since 2026-04-30.
- Accounts created before 2025-07-15 have no 12-month offers left: only Always Free and the t4g.small trial (ends 2026-12-31).

Details and sources: [research/03-aws-stack-costs.md](../research/03-aws-stack-costs.md).
