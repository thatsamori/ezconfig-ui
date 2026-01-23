# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**RCON (Remote Console) Server:**
- Service: Game server configuration via RCON protocol
- SDK/Client: rcon-client npm package v4.2.5 (`package.json`)
- Connection: `rconExamples.ts` (lines 16-20)
  - Host: `15.204.103.39`
  - Port: `4747`
  - Password: `ezbones` (hardcoded - security concern)
- Commands: `string ezconfig [Entity] [Group] [Key] [Value]`
- Usage: Character and weapon configuration updates

**Payment Processing:**
- Not applicable

**Email/SMS:**
- Not applicable

**External APIs:**
- None

## Data Storage

**Databases:**
- None (configuration sent directly to game server)

**File Storage:**
- Not applicable

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- RCON password authentication only
- Credentials: Hardcoded in `rconExamples.ts` (line 19)

**OAuth Integrations:**
- None

## Monitoring & Observability

**Error Tracking:**
- None configured

**Analytics:**
- None

**Logs:**
- Console.log only (`rconExamples.ts` line 101)
- No structured logging

## CI/CD & Deployment

**Hosting:**
- Not configured (local development tool)

**CI Pipeline:**
- Not configured
- No GitHub Actions or similar

## Environment Configuration

**Development:**
- Required env vars: None currently (credentials hardcoded)
- Secrets location: Should be `.env.local` (pattern in `.gitignore`)
- Mock/stub services: None (direct RCON connection)

**Future Environment Setup:**
- `.gitignore` prepared for env files:
  - `.env`
  - `.env.local`
  - `.env.development.local`
  - `.env.test.local`
  - `.env.production.local`

**Recommended Environment Variables:**
```
RCON_HOST=15.204.103.39
RCON_PORT=4747
RCON_PASSWORD=<secret>
```

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## RCON Protocol Details

**Connection Pattern:**
```typescript
// rconExamples.ts (lines 16-20)
const rcon = await Rcon.connect({
  host: "15.204.103.39",
  port: 4747,
  password: "ezbones",
});
```

**Command Format:**
- Character: `string ezconfig Character [GroupName] [ConfigKey] [FormattedValue]`
- Weapon: `string ezconfig [WeaponName] [GroupName] [ConfigKey] [FormattedValue]`

**Value Formatting:**
- Boolean: `"True"` or `"False"`
- Float: `"0.00"` (2 decimal places)
- Vector: `"X=0.00,Y=0.00,Z=0.00"`
- Vector2D: `"X=0.00,Y=0.00"`
- FloatArray: `"(0.00,0.00,0.00)"`

**Transitive Dependencies:**
- typed-emitter v0.1.0 - Event emitter for RCON client internals

---

*Integration audit: 2026-01-23*
*Update when adding/removing external services*
