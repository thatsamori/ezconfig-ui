# External Integrations

**Analysis Date:** 2026-01-27

## APIs & External Services

**Game Server (RCON):**
- Mordhau game server - Real-time config application
  - SDK/Client: `rcon-client` 4.2.5 (`src/lib/rcon/service.ts`)
  - Auth: Password in RCON_PASSWORD env var
  - Protocol: RCON (Source engine protocol)
  - Connection: TCP to RCON_HOST:RCON_PORT
  - Usage: Execute batch commands to apply config changes

**External APIs:**
- None - Self-contained application

## Data Storage

**Databases:**
- File-based JSON storage (no database server)
  - Location: `./Databases/` directory
  - Client: Node.js fs/promises (`src/lib/database/service.ts`)
  - Structure: `{Database}/{Category}.json`

**File Storage:**
- Local filesystem for all data
  - Config data: `./Databases/`
  - Presets: `./Presets/`
  - Notes: `./Notes/`
  - Users: `./users.json`

**Caching:**
- None - All reads from filesystem
- Zustand store acts as client-side cache

## Authentication & Identity

**Auth Provider:**
- Custom file-based authentication
  - Implementation: `src/lib/auth/service.ts`
  - Token storage: HTTP-only cookies (`src/lib/auth/tokens.ts`)
  - Session management: UUID tokens with in-memory token store

**User Storage:**
- JSON file (`users.json`)
  - Passwords stored in plain text (development only)
  - Roles: 'admin' or 'user'
  - Bootstrap: Admin created from ADMIN_USERNAME/ADMIN_PASSWORD env vars

**OAuth Integrations:**
- None

## Monitoring & Observability

**Error Tracking:**
- None configured

**Analytics:**
- None configured

**Logs:**
- Console.log only (stdout)
- No structured logging
- No log aggregation

## CI/CD & Deployment

**Hosting:**
- Self-hosted deployment
  - Requires local access to game server
  - Must run on same network as game server (RCON access)

**CI Pipeline:**
- None configured
  - No GitHub Actions workflows
  - No automated testing

## Environment Configuration

**Development:**
- Required env vars:
  - `RCON_HOST` - Game server hostname (default: localhost)
  - `RCON_PORT` - RCON port (default: 27015)
  - `RCON_PASSWORD` - RCON password
  - `EZCONFIG_PASSWORD` - App verification password
  - `ADMIN_USERNAME` - Initial admin username
  - `ADMIN_PASSWORD` - Initial admin password
- Secrets location: `.env` file (gitignored), `.env.example` template provided
- Optional vars:
  - `DATABASES_PATH` - Config storage location (default: ./Databases)
  - `PRESETS_PATH` - Presets location (default: ./Presets)
  - `NOTES_PATH` - Notes location (default: ./Notes)
  - `USERS_PATH` - Users file location (default: ./users.json)

**Staging:**
- Not applicable (single environment)

**Production:**
- Same as development
- Run alongside game server
- Secrets in environment variables

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Integration Points Summary

| Service | Purpose | Config Location |
|---------|---------|-----------------|
| Game Server | Apply configs via RCON | `src/lib/rcon/service.ts` |
| Filesystem | JSON data storage | `src/lib/database/service.ts` |
| Local Auth | User management | `src/lib/auth/service.ts` |

---

*Integration audit: 2026-01-27*
*Update when adding/removing external services*
