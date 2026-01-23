# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code (`characterConfigSchema.ts`, `weaponConfigSchema.ts`, `types.ts`, `rconExamples.ts`)

**Secondary:**
- None

## Runtime

**Environment:**
- Bun v1.3.2+ - Runtime and package manager
- Created with `bun init` - `README.md`

**Package Manager:**
- Bun
- Lockfile: `bun.lock` present (lockfileVersion: 1)

## Frameworks

**Core:**
- None (vanilla TypeScript library)

**Testing:**
- Not configured (coverage directory in `.gitignore` indicates future planning)

**Build/Dev:**
- TypeScript 5.9.3 - Compilation and type checking
- `tsconfig.json` configured for ESNext target, bundler mode, strict checks

## Key Dependencies

**Critical:**
- rcon-client 4.2.5 - RCON protocol client for game server communication (`package.json`)

**Infrastructure:**
- typed-emitter 0.1.0 - Event emitter with TypeScript support (transitive via rcon-client)

**Dev Dependencies:**
- @types/bun 1.3.6 - Bun runtime type definitions
- @types/node 25.0.10 - Node.js type definitions (transitive)
- bun-types 1.3.6 - Additional Bun type definitions

## Configuration

**Environment:**
- Environment variables not yet used in code
- `.gitignore` includes `.env`, `.env.local`, `.env.*.local` patterns (ready for future use)
- Comment in `rconExamples.ts` line 15: "These should be moved to env vars"

**Build:**
- `tsconfig.json` - TypeScript compiler configuration
  - Target: ESNext
  - Module: Preserve
  - Strict mode enabled
  - JSX: react-jsx (React 17+ support)
  - moduleResolution: bundler

## Platform Requirements

**Development:**
- Any platform with Bun runtime installed
- No external dependencies required

**Production:**
- Bun runtime required
- Network access to RCON server (currently hardcoded: 15.204.103.39:4747)

---

*Stack analysis: 2026-01-23*
*Update after major dependency changes*
