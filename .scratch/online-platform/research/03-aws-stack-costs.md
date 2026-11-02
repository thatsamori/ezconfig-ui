# 03: AWS stack costs at V1 scale

Ticket: [online-platform#03](../issues/03-aws-stack-costs.md)

Prices read on **2026-11-01**. Most figures come from the JSON price data that
AWS's own pricing pages render (`b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/...`,
publication dates 2026-09-11 to 2026-10-30) and from the public AWS Price List
bulk API (`pricing.us-east-1.amazonaws.com/offers/...`, published 2026-10-07 and
2026-10-16). The interactive AWS Pricing Calculator was not used; it reads the
same price data. Free-tier rules, plan limits and backup rules come from
AWS docs and FAQ pages. All prices are USD, on-demand, Linux, 730 hours a month.
Nothing was signed in to.

## Short answer

| Setup | us-east-1 | eu-central-1 | Fits $25? | Can hold RCON TCP? |
|---|---:|---:|---|---|
| A. Lightsail $12 (2 GB): app + Postgres + Valkey on the box | **$12.35** | $12.35 | yes | yes |
| A'. Lightsail $7 (1 GB): app + Postgres, no Redis | $7.35 | $7.35 | yes | yes |
| A''. Lightsail $7 instance + Lightsail managed Postgres $15 | $22.35 | $22.35 | yes, barely | yes |
| B. EC2 t4g.small: app + Postgres + Valkey on the box | $18.36 ($6.10 until 2026-12-31) | $20.45 | yes | yes |
| B'. EC2 t4g.micro: app + Postgres on the box | $12.23 | $13.44 | yes | yes |
| C. EC2 t4g.micro + RDS db.t4g.micro | $25.21 | $28.88 | no (at/over) | yes |
| C + ElastiCache Valkey t4g.micro | $34.56 | $39.39 | no | yes |
| D. EC2 t4g.micro + DynamoDB on-demand | $11.62 | $12.75 | yes | yes |
| E. Lambda function URLs + DynamoDB, polls every 2 s | $8.09 to $10.84 | $8.53 to $12.01 | yes | **no** |
| E. Same, polls every 5 s | $3.95 | $4.18 | yes | **no** |
| F. Fargate (ECS Express Mode, with ALB), before any database | $32.89 | $37.26 | no | yes |

The cheapest setup that can hold long-lived connections and keeps Postgres is
**A, a single Lightsail instance at about $12.35 a month, with the same price in
the EU**. Lambda plus DynamoDB is cheapest of all ($4 to $11), but only works if
game servers poll over HTTP, because Lambda cannot hold an RCON connection.

## Load model used

- 20 game servers polling every 2 s gives 26.28 M requests a month; every 5 s
  gives 10.51 M (20 × 2,628,000 s ÷ interval).
- Average poll response on the wire about 1.5 KB. That is 39 GB a month at 2 s
  and 16 GB at 5 s, both inside the 100 GB monthly free data transfer out.
- Lambda poll handler: arm64, 256 MB, 30 ms average. DynamoDB poll read: one
  eventually consistent `GetItem` of 4 KB or less (0.5 read request unit).
- Writes: about 200,000 a month (tuning sessions, acknowledgements, audit).
  Webapp UI traffic from 20 daily users is negligible.
- Data under 1 GB. Single instance, no high availability.

## Free tier: what applies to the owner's account

There are three cases, and which one applies depends on the account's creation date.

- **Account created before 2025-07-15 (legacy free tier).** The legacy 12-month
  offers run "for one year from the date the account was activated" (legacy FAQ).
  Any such account is now more than 15 months old, so **no 12-month offers remain**
  (no free 750 h EC2 micro, RDS micro or ElastiCache micro). Only the Always Free
  allowances apply.
- **Account created on or after 2025-07-15 (credit-based plans).** New customers
  get $100 in credits at sign-up and can earn up to $100 more through five $20
  activities: launching an EC2 instance, configuring RDS, building a Lambda
  function with a function URL, a Bedrock prompt, and an AWS Budgets alert.
  - The **Free plan** ends after 6 months or when the credits run out. The account
    then closes, with 90 days to upgrade before its data is deleted.
  - The **Paid plan** keeps running and applies leftover credits to bills. The FAQ
    contradicts itself on how long credits last: one answer says 6 months from
    account creation, the Paid-plan answer says 12 months. The launch blog says
    "up to 12 months from your initial sign-up date" after upgrading.
  - So an account created after about November 2025 may still hold up to $200 in
    credits, which would cover 1 to 2 years of setup A. Accounts that were
    existing customers before the change are not eligible for these credits.
- **Applies to every account today:**
  - The **t4g.small free trial**: 750 hours a month "until December 31, 2026" for
    "all existing and new customers". Surplus CPU credits, EBS and IPv4 are still
    charged. It ends two months from today, so it should not shape V1.
  - **Always Free allowances**, used below:
    - Lambda: 1 M requests and 400,000 GB-s a month.
    - DynamoDB: 25 GB storage plus 25 WCU and 25 RCU, provisioned mode only.
    - CloudWatch Logs: 5 GB a month.
    - Data transfer out: 100 GB a month across all services and regions.
    - KMS: 20,000 requests a month.
    - SSM standard parameters: free.
    - Lightsail DNS: up to 6 zones and 3 M queries a month, free.
- Note: the free-tier FAQ also mentions a "new sign-up experience" launched in
  October 2026. I could not find official terms for it beyond that FAQ line.

## Parts, priced per month

### Compute that can hold long-lived connections

| Item | us-east-1 | eu-central-1 | Notes |
|---|---:|---:|---|
| EC2 t4g.nano (2 vCPU burst, 0.5 GiB) | $3.07 | $3.50 | $0.0042/h; FRA $0.0048/h. Too little RAM for Next.js + Postgres |
| EC2 t4g.micro (1 GiB) | $6.13 | $7.01 | $0.0084/h; FRA $0.0096/h |
| EC2 t4g.small (2 GiB) | $12.26 | $14.02 | $0.0168/h; FRA $0.0192/h. Free 750 h/mo until 2026-12-31 |
| + public IPv4 (each address) | $3.65 | $3.65 | $0.005/h in-use or idle, same in every region |
| + EBS gp3 root, 20 GB | $1.60 | $1.90 | $0.08 vs $0.0952 per GB-month |
| Lightsail Linux $5 / $7 / $12 / $24 | $5 / $7 / $12 / $24 | same | 0.5 / 1 / 2 / 4 GB RAM, 20 / 40 / 60 / 80 GB SSD, 1 to 4 TB transfer; **public IPv4 and static IP included** |
| Lightsail IPv6-only $3.50 / $5 / $10 | same | same | Game servers and users would need IPv6 |
| Fargate arm64, 0.25 vCPU / 0.5 GB, 24/7 | $7.21 | $8.29 | $0.03238 per vCPU-h + $0.00356 per GB-h; x86 is $9.01. With 1 GB: $8.51 |
| + task public IPv4 (no load balancer) | $3.65 | $3.65 | The IP changes on every redeploy |
| + ALB, which ECS Express Mode creates | $16.43 + $7.30 IPv4 + LCU | $19.71 + $7.30 + LCU | $0.0225/h (FRA $0.027/h); an internet-facing ALB uses one public IPv4 per AZ, at least 2 |
| App Runner 0.25 vCPU / 0.5 GB | $14.23 if always active, $2.56 if idle | n/a | **Closed to new customers since 2026-04-30**; AWS points to ECS Express Mode |

On EC2, a 2 GB t4g.small with an IPv4 address and a 20 GB disk costs $17.51.
The 2 GB Lightsail bundle costs $12 and includes its IPv4 address, a 60 GB disk and
3 TB of transfer. Lightsail is cheaper than EC2 at every size and has the same
price in us-east-1, Frankfurt and Ireland.

### Request-only compute (polling model only)

| Item | us-east-1 | eu-central-1 | Notes |
|---|---:|---:|---|
| Lambda requests, polls every 2 s | $5.06 | $5.06 | $0.20 per M after 1 M free |
| Lambda requests, polls every 5 s | $1.90 | $1.90 | |
| Lambda duration | $0 | $0 | 197,100 GB-s at 2 s, under the 400,000 free |
| Function URL | $0 | $0 | No separate charge |
| API Gateway HTTP API instead, 2 s / 5 s | $26.28 / $10.51 | $31.54 / $12.61 | $1.00 per M (FRA $1.20) |
| API Gateway REST API instead, 2 s / 5 s | $91.98 / $36.79 | $97.24 / $38.89 | $3.50 per M (FRA $3.70) |
| Lambda platform logs, 2 s | $2.76 | $3.47 | About 0.4 KB of START/REPORT lines per call is 10.5 GB; $0.50/GB (FRA $0.63) after 5 GB free. JSON log format with system log level WARN removes them |

### Postgres

| Item | us-east-1 | eu-central-1 | Notes |
|---|---:|---:|---|
| RDS db.t4g.micro single-AZ (1 GiB) | $11.68 | $13.87 | $0.016/h; FRA $0.019/h; Ireland $0.017/h |
| + gp3 storage, 20 GB minimum | $2.30 | $2.74 | $0.115 vs $0.137 per GB-month |
| + automated backups | $0 | $0 | Free backup storage up to 100% of provisioned storage per region; above that $0.095 (FRA $0.103) per GB-month |
| **RDS total** | **$13.98** | **$16.61** | |
| Lightsail managed DB, standard 1 GB | $15 | $15 | 40 GB SSD, 100 GB transfer. 7-day point-in-time restore included free. The pricing page marks this plan "No Data encryption" while the FAQ says data is encrypted at rest. The $30 plan is marked encrypted |
| Self-run on the instance | instance RAM + disk + snapshots | | Daily EBS snapshots kept 7 days, about 7 GB stored: $0.35 (FRA $0.38). Lightsail snapshots $0.05/GB-month, billed on storage used |

### Redis / Valkey

| Item | us-east-1 | eu-central-1 | Notes |
|---|---:|---:|---|
| ElastiCache Valkey cache.t4g.micro (0.5 GiB) | $9.34 | $10.51 | $0.0128/h; Valkey nodes cost 20% less than Redis OSS |
| ElastiCache Redis OSS cache.t4g.micro | $11.68 | $13.14 | $0.016/h |
| ElastiCache Serverless Valkey (100 MB minimum) | $6.13 | $7.37 | $0.084 per GB-h × 0.1 GB; ECPUs $0.0023 per M, pennies at this load |
| ElastiCache Serverless Redis OSS (1 GB minimum) | **$91.25** | $110.23 | $0.125 per GB-h × 1 GB. Avoid |
| Self-run Valkey on the instance | $0 | $0 | Needs RAM headroom: the 2 GB box, not the 1 GB one |

### DynamoDB (on-demand)

| Item | us-east-1 | eu-central-1 | Notes |
|---|---:|---:|---|
| Reads | $0.125 per M RRU | $0.1525 per M | |
| Writes | $0.625 per M WRU | $0.7625 per M | |
| Storage, under 1 GB | $0 | $0 | $0.25 per GB-month after 25 GB free |
| Point-in-time recovery, 1 GB | $0.20 | $0.24 | On-demand backups $0.10 per GB-month |
| Light use behind an app server that caches (setup D) | about $0.39 | about $0.47 | |
| Every poll reads DynamoDB, 2 s / 5 s | $1.64 / $0.66 | $2.00 / $0.80 | Eventually consistent; strongly consistent costs double |
| **Every poll also writes a heartbeat**, 2 s / 5 s | **$16.43 / $6.57** | $20.04 / $8.02 | Design trap: keep last-seen in memory or write it rarely |

Provisioned mode at 25 RCU and 25 WCU is inside the free tier and covers 50
eventually consistent reads a second. That would make the polling reads in
setup E free, but provisioned mode needs capacity planning.

### Supporting services

| Item | Price | Notes |
|---|---|---|
| EBS snapshots | $0.05 per GB-month (FRA $0.054) | Incremental. Data Lifecycle Manager schedules them |
| SSM Parameter Store, standard | $0 | Advanced parameters $0.05 each a month |
| Secrets Manager | $0.40 per secret a month + $0.05 per 10,000 calls | 3 secrets = $1.20. Not needed at V1; SSM SecureString covers it |
| KMS | AWS-managed keys free; a customer-managed key is $1 a month | 20,000 requests a month free, then $0.03 per 10,000 |
| Route 53 | $0.50 per hosted zone a month; $0.40 per M queries | Alias queries to AWS resources are free. A Lightsail DNS zone is free (6 zones, 3 M queries) |
| ACM public certificate | $0 on integrated services (ALB, CloudFront, API Gateway) | Cannot be installed on a plain EC2 or Lightsail box. An exportable certificate costs $7 per name at issue and at each renewal. On a single box use Let's Encrypt (free) |
| CloudFront flat-rate plans | Free $0 (1 M requests, 100 GB); Pro $15 (10 M requests) | An option to put a free ACM certificate in front of a single box for the UI. The free plan cannot carry the polling traffic |
| Data transfer out | First 100 GB a month free, then $0.09 per GB (same in FRA and Ireland) | Inbound is free. Every setup here stays under 100 GB unless poll responses grow past about 4 KB at 2 s |
| Public IPv4 | $0.005/h = $3.65 a month per address, every region | Included in Lightsail bundles. Charged on EC2, Fargate, ALB (per AZ) and a public RDS |

### EU difference, in one line

Frankfurt (eu-central-1) costs more than us-east-1 for:

| Item | Frankfurt extra |
|---|---:|
| EC2 | +14% |
| EBS | +19% |
| RDS instance | +19% |
| RDS storage | +19% |
| ElastiCache | +12 to 20% |
| Fargate arm64 | +15% |
| DynamoDB requests and storage | +22% |
| CloudWatch Logs | +26% |

These cost the same in Frankfurt as in us-east-1: Lightsail, Lambda requests and
duration, public IPv4, and data transfer out.

Ireland (eu-west-1) sits in between:

| Item | Ireland price | Change vs us-east-1 |
|---|---:|---:|
| t4g.micro | $0.0092/h | +10% |
| db.t4g.micro | $0.017/h | +6% |
| gp3 | $0.088 per GB-month | +10% |
| Fargate | same as us-east-1 | 0% |

## The setups

Every EC2 setup below includes one public IPv4 address, a gp3 root disk, daily
snapshots kept 7 days, and a $0.50 Route 53 zone. A free Lightsail DNS zone can
replace the Route 53 zone. Secrets live in SSM standard parameters ($0). TLS on
a single box comes from Let's Encrypt.

- **A. Lightsail single instance, app + Postgres (+ Valkey) on the box: $12.35
  (EU $12.35).** The $12 bundle (2 GB) plus about 7 GB of automatic snapshots.
  Drop Valkey and use the $7 bundle (1 GB) for $7.35. That is tight: build the
  Next.js app elsewhere, not on the box.
  - Backups: automatic daily snapshots (7 kept). Add a nightly `pg_dump` to S3 for
    a logical copy, because snapshots are only crash-consistent.
  - Patching: the owner patches the OS and Postgres (for example unattended upgrades).
  - Caveats: Lightsail has no IAM instance roles, so calling SSM or S3 needs stored
    access keys. Lightsail sits outside your VPC; VPC peering is available.
    The CPU is burstable.
- **A''. Lightsail instance + Lightsail managed Postgres: $22.35.**
  - Lightsail runs the database: minor upgrades in a maintenance window, and 7-day
    point-in-time restore at no extra cost.
  - Caveats: the $15 plan's encryption-at-rest status is contradictory (see above).
    The plan has 1 GB RAM and one core. You cannot scale down. Lightsail's
    Postgres major versions lag RDS; check the blueprint list at create time.
- **B. EC2 t4g.small, everything on the box: $18.36 (EU $20.45); $6.10 until
  2026-12-31 thanks to the trial.** The same shape as A, with full VPC, IAM roles
  and Data Lifecycle Manager. It costs about $6 more than A for the same RAM.
  t4g.micro without Redis: $12.23 (EU $13.44).
- **C. EC2 t4g.micro + RDS db.t4g.micro: $25.21 (EU $28.88).**
  - The app box costs $11.23 and RDS costs $13.98.
  - This setup is at the ceiling in us-east-1 and over it in Frankfurt.
    A t4g.nano app box brings it to $22.15, but 0.5 GB is too small for Next.js.
  - Adding any managed Redis breaks the budget: Valkey t4g.micro brings it to
    $34.56; serverless Valkey to $31.34.
  - RDS gives managed backups, point-in-time restore and minor-version patching.
    Major upgrades are still the owner's job. RDS Extended Support charges
    apply if a major version is kept past its end of standard support.
- **D. EC2 t4g.micro + DynamoDB on-demand: $11.62 (EU $12.75).**
  - No database to patch. Point-in-time recovery costs $0.20.
  - If every 2 s poll reads DynamoDB without an in-memory cache, add $1.64.
    Never write on every poll.
  - Whether DynamoDB fits the data model is a question for ticket 07.
- **E. Lambda function URLs + DynamoDB, polling only: $3.95 at 5 s; $8.09 at 2 s
  ($10.84 with default Lambda logs).** EU $4.18 and $8.53 to $12.01.
  - No servers to run. The webapp UI on Lambda is estimated at about $0.50.
  - Cannot hold RCON connections, so this setup only works if game servers poll.
  - Use function URLs, not API Gateway: the HTTP API would add $26.28 at 2 s.
  - Set the JSON log format with system level WARN.
- **F. Fargate / ECS Express Mode: $32.89 (EU $37.26) before any database.**
  The ALB alone costs $16.43, plus $7.30 for its two IPv4 addresses. Without an
  ALB, Fargate plus a task IPv4 is $11.36, but the IP changes on every deploy.
  App Runner is closed to new customers. Not a V1 candidate.

## Surprises

1. **The legacy 12-month free tier is gone for every pre-July-2025 account.**
   Only Always Free allowances and the t4g.small trial apply, and the trial ends
   2026-12-31. Only an account opened after about November 2025 can still have credits.
2. **App Runner closed to new customers on 2026-04-30.** AWS now points to ECS
   Express Mode, which brings an ALB costing about $24 a month on its own.
3. **The public IPv4 charge ($3.65 per address) is a large share of small EC2
   setups.** It is 60% of the t4g.micro price and more than doubles the cost of a t4g.nano. Lightsail
   bundles include it, which is why Lightsail undercuts EC2.
4. **ElastiCache Serverless for Redis OSS has a 1 GB minimum, about $91 a month.**
   Valkey's 100 MB minimum costs $6.13.
5. **Polling cost depends on two easy-to-miss line items:**
   - API Gateway, which costs 5 times the Lambda request price.
   - A heartbeat write on every poll, which costs $16 a month in DynamoDB at 2 s.

   Lambda's default START/REPORT log lines add about $2.76 a month at 2 s.
6. **The Lightsail $15 database plan is listed as "No Data encryption"** on the
   pricing page, which contradicts the Lightsail FAQ.

## Not verified

- Official terms of the October 2026 "new sign-up experience" (only one FAQ line
  mentions it).
- Which free-tier credit expiry applies (6 vs 12 months; the AWS FAQ contradicts
  itself).
- Current Lightsail Postgres major versions (the English FAQ still lists 9 to 12;
  a translated guide lists 12 to 16).
- The Lambda log size per invocation (about 0.4 KB) and the poll response size
  (about 1.5 KB) are estimates, not measurements.

## Sources

- AWS Free Tier: https://aws.amazon.com/free/ ;
  FAQs: https://aws.amazon.com/free/free-tier-faqs/ ;
  legacy FAQs: https://aws.amazon.com/free/legacy/free-tier-faqs ;
  docs, plans: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html ;
  docs, overview: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html ;
  launch blog (2025-07-15): https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits
- T4g free trial: https://aws.amazon.com/ec2/instance-types/t4/ and https://aws.amazon.com/ec2/faqs/
- EC2 on-demand price data: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/US%20East%20(N.%20Virginia)/Linux/index.json
  (and the `EU (Frankfurt)` / `EU (Ireland)` variants); page: https://aws.amazon.com/ec2/pricing/on-demand/
- EBS: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ebs.json ; https://aws.amazon.com/ebs/pricing/
- Public IPv4: https://aws.amazon.com/vpc/pricing/ ; Price List https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/eu-central-1/index.json ;
  ALB IPv4 example: https://aws.amazon.com/blogs/networking-and-content-delivery/identify-and-optimize-public-ipv4-address-usage-on-aws/
- RDS for PostgreSQL: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/rds/USD/current/rds-postgresql-ondemand.json ; https://aws.amazon.com/rds/postgresql/pricing/ ;
  backup allowance: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html
- ElastiCache: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/elasticache/USD/current/elasticache.json ; https://aws.amazon.com/elasticache/pricing/
- Fargate: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ecs/USD/current/ecs.json ; https://aws.amazon.com/fargate/pricing/
- ALB: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/elb.json ; https://aws.amazon.com/elasticloadbalancing/pricing/
- App Runner: https://aws.amazon.com/apprunner/pricing/ ; availability change: https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
- Lightsail:
  - price data: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/lightsail/USD/current/lightsail.json
  - pricing page: https://aws.amazon.com/lightsail/pricing/
  - FAQ: https://aws.amazon.com/lightsail/faq/
  - database FAQ: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-databases.html
  - snapshot FAQ: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html
  - DNS: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-dns-in-amazon-lightsail.html
- Lambda: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/lambda/USD/current/lambda.json ; https://aws.amazon.com/lambda/pricing/ ;
  log-level filtering: https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html
- API Gateway: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/apigateway/USD/current/apigateway.json
- DynamoDB: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/dynamodb/USD/current/dynamodb.json ; https://aws.amazon.com/dynamodb/pricing/on-demand/
- CloudWatch Logs: https://aws.amazon.com/cloudwatch/pricing/ ; Price List https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/eu-central-1/index.json
- Data transfer: https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/datatransfer/USD/current/datatransfer.json ; 100 GB free statement on https://aws.amazon.com/ec2/pricing/on-demand/
- Secrets Manager: https://aws.amazon.com/secrets-manager/pricing/ ; SSM: https://aws.amazon.com/systems-manager/pricing/ ; KMS: https://aws.amazon.com/kms/pricing/
- Route 53: https://aws.amazon.com/route53/pricing/ ; ACM: https://aws.amazon.com/certificate-manager/pricing/ ; CloudFront: https://aws.amazon.com/cloudfront/pricing/
- ECS Express Mode: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
