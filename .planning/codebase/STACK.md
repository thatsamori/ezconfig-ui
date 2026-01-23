# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript ^5 - All application code

**Secondary:**
- None

## Runtime

**Environment:**
- Bun v1.3.2 - JavaScript/TypeScript runtime
- No Node.js dependency (Bun native)

**Package Manager:**
- Bun (native package manager)
- Lockfile: `bun.lock` present

## Frameworks

**Core:**
- None (vanilla TypeScript modules, no framework yet)

**Testing:**
- Not detected

**Build/Dev:**
- TypeScript ^5 - Type checking only (noEmit: true in `tsconfig.json`)
- Bun bundler mode (`moduleResolution: bundler`)

## Key Dependencies

**Critical:**
- rcon-client ^4.2.5 - RCON protocol client for game server communication - `package.json`
- rcon ^1.1.0 - RCON protocol implementation - `package.json`

**Infrastructure:**
- @types/bun - Bun type definitions - `package.json`

## Configuration

**Environment:**
- No .env file detected
- Hardcoded connection settings in `rconExamples.ts` (host, port, password)

**Build:**
- `tsconfig.json` - TypeScript compiler options (strict mode, ESNext target, React JSX support)

## Platform Requirements

**Development:**
- Bun runtime required (v1.3.2+)
- Any platform with Bun support (macOS, Linux, Windows)

**Production:**
- Bun runtime
- Network access to game server RCON port

---

*Stack analysis: 2026-01-23*
*Update after major dependency changes*
