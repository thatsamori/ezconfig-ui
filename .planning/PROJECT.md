# EZConfig UI

## What This Is

A web-based configuration interface for the ezconfig game mod. The web app is the authoritative source for all user configuration — stored as JSON files on the server filesystem. The game mod reads from the web app on startup via API and receives live updates via RCON.

## Core Value

Database-driven configuration with working state persistence: edit freely, save explicitly, apply to game on demand.

## Current State

**Version:** v0.1 superseded, preparing v1.0
**LOC:** 3,015 TypeScript
**Tech stack:** Next.js 16, React 19, Tailwind CSS 4, Shadcn UI, Zustand

**What exists (from v0.1):**
- Next.js foundation with App Router
- Input components: BooleanInput, FloatInput, VectorInput, Vector2DInput, FloatArrayInput
- RCON connection service (needs formatter updates)
- Schema definitions for weapons and characters

**What's changing (for v1.0):**
- Source of truth: Game.ini → JSON files on web app
- UI paradigm: Bulk multi-select → Accordion per weapon
- State model: Staged checkboxes → Working → Save → Apply
- Loading: Eager → Lazy per weapon/category
- New: API endpoints for mod startup, localStorage working state

## Requirements

### Validated

- ✓ Schema-driven configuration definitions — v0.1
- ✓ Character config schema (Movement, Combat, General groups) — v0.1
- ✓ Weapon config schema (General + Attack types) — v0.1
- ✓ Data type support (Boolean, Float, FloatArray, Vector, Vector2D) — v0.1
- ✓ Type-specific input components — v0.1
- ✓ RCON connection and command execution — v0.1

### Active (v1.0)

- [ ] JSON database filesystem structure (Databases/Category/file.json)
- [ ] API endpoints: GET/POST /api/config/{database}/{category}
- [ ] API endpoint: POST /api/apply (with password auth)
- [ ] API endpoint: GET /api/databases (structure for UI)
- [ ] Working state backed by localStorage
- [ ] Save Changes button (persist to JSON files)
- [ ] Reset Working Changes button (discard, reload saved)
- [ ] Apply to Game button (RCON: WipeDatabases + batch commands)
- [ ] Accordion-based weapon list (one at a time, not bulk)
- [ ] Lazy loading on accordion expand
- [ ] Search/filter weapons by name
- [ ] Schema validation on save (reject invalid keys/types)
- [ ] Simple password auth for /api/apply

### Out of Scope

- Static presets (`./presets/static/` read-only folder) — deferred to future version
- Real-time collaboration — single user at a time
- Undo/redo — user can reload saved config
- Audit logging — not needed for this use case
- Config backups/versioning — deferred

## Context

**Architecture Decision (2026-01-25):**
Pivoted from Game.ini as source of truth to web app JSON files. This enables:
- Game mod can request config on startup (POST /api/apply)
- Cleaner separation: webapp owns config, mod just executes RCON
- localStorage persistence for uncommitted changes
- Lazy loading reduces initial load time

See `architecture_update.md` for full details.

**Existing Codebase:**
- TypeScript library with config schemas and RCON integration
- Schemas define all editable fields with data types, defaults, documentation flags
- RCON formatters convert native format to RCON string format

**Game Integration:**
- EZConfig mod receives commands: `string ezconfig {database} {category} {JSON}`
- `string ezconfig WipeDatabases` clears all mod config
- Mod applies commands immediately (hot reload)

**Tech Stack:**
- Bun + Next.js + TypeScript + Tailwind + Shadcn
- Zustand for UI state (working values, selections)
- Server Actions / API routes for file ops, RCON sends

## Constraints

- **Tech stack**: Must use Bun, Next.js, TypeScript, Tailwind, Shadcn — non-negotiable
- **RCON config**: Environment variables (RCON_HOST, RCON_PORT, RCON_PASSWORD)
- **Database path**: Environment variable for Databases/ root folder
- **Sequential RCON**: Commands must execute sequentially, not in parallel
- **Deployment**: Server has filesystem access to Databases/

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| new-york style for Shadcn | Cleaner aesthetic | ✓ Good |
| Copied tw-animate-css locally | Turbopack resolution workaround | ✓ Good |
| Staged state per config key | Selective apply workflow | ⚠️ Superseded |
| Multi-weapon bulk editing | Apply to all selected | ⚠️ Superseded |
| Game.ini as source of truth | Match existing mod behavior | ⚠️ Superseded |
| Web app JSON as source of truth | Mod can request config on startup | — Pending (v1.0) |
| Accordion-based weapon selection | Simpler UX, lazy loading | — Pending (v1.0) |
| Working → Save → Apply flow | Explicit persistence, clear state model | — Pending (v1.0) |

---
*Last updated: 2026-01-25 after v0.1 supersede*
