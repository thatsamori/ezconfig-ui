# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**Game Server RCON:**
- RCON Protocol - Remote console for game server configuration
  - SDK/Client: rcon-client npm package v4.2.5 - `package.json`
  - Connection: Host/Port/Password based - `rconExamples.ts`
  - Commands: `string ezconfig <target> <group> <key> <value>`

**Payment Processing:**
- Not applicable

**Email/SMS:**
- Not applicable

**External APIs:**
- None detected

## Data Storage

**Databases:**
- None detected

**File Storage:**
- Local filesystem (planned for presets in `./presets/` per `t.md`)

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Not applicable (no user auth)

**RCON Authentication:**
- Password-based RCON authentication
- Currently hardcoded in `rconExamples.ts`
- Needs: Move to environment variables

## Monitoring & Observability

**Error Tracking:**
- None configured

**Analytics:**
- None configured

**Logs:**
- Console output only

## CI/CD & Deployment

**Hosting:**
- Not configured (local development only)

**CI Pipeline:**
- Not configured

## Environment Configuration

**Development:**
- Required: Bun runtime
- RCON credentials: Currently hardcoded (needs .env)
  - RCON_HOST
  - RCON_PORT
  - RCON_PASSWORD

**Staging:**
- Not applicable

**Production:**
- Not configured

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- RCON commands to game server (not webhooks, but similar pattern)

---

*Integration audit: 2026-01-23*
*Update when adding/removing external services*
