# EZConfig UI

## What This Is

A web-based configuration interface for the ezconfig game mod. The web app is the authoritative source for all user configuration — stored as JSON files on the server filesystem. The game mod reads from the web app on startup via API and receives live updates via RCON.

## Core Value

Database-driven configuration with working state persistence: edit freely, save explicitly, apply to game on demand.

## Current State

**Version:** v1.2 shipped 2026-01-26
**LOC:** ~8,600 TypeScript
**Tech stack:** Next.js 16, React 19, Tailwind CSS 4, Shadcn UI, Zustand, JSZip

**What shipped in v1.2:**
- Object format for JSON storage (`{key: value}` instead of `[{key: value}]`)
- On-demand file storage (files deleted when data is empty)
- Automatic empty directory cleanup
- Net code simplification (-23 lines)

<details>
<summary>v1.1 (shipped 2026-01-26)</summary>

- Static presets (read-only) with folder structure
- User presets (save/load/delete)
- Preview before load with content summary
- Import/export via ZIP files with name validation

</details>

<details>
<summary>v1.0 (shipped 2026-01-26)</summary>

- JSON database filesystem with schema validation
- API endpoints for config CRUD and apply to game
- Accordion-based weapon list with lazy loading
- Working/saved state model with localStorage persistence
- Save/Reset/Apply workflow with confirmation dialogs
- Overrides view toggle showing only customized values
- Bulk weapon update via context menu
- Search/filter for weapons

</details>

## Requirements

### Validated

- ✓ Schema-driven configuration definitions — v0.1
- ✓ Character config schema (Movement, Combat, General groups) — v0.1
- ✓ Weapon config schema (General + Attack types) — v0.1
- ✓ Data type support (Boolean, Float, FloatArray, Vector, Vector2D) — v0.1
- ✓ Type-specific input components — v0.1
- ✓ RCON connection and command execution — v0.1
- ✓ JSON database filesystem structure (Databases/Category/file.json) — v1.0
- ✓ API endpoints: GET/POST /api/config/{database}/{category} — v1.0
- ✓ API endpoint: POST /api/apply (with password auth) — v1.0
- ✓ API endpoint: GET /api/databases (structure for UI) — v1.0
- ✓ Working state backed by localStorage — v1.0
- ✓ Save Changes button (persist to JSON files) — v1.0
- ✓ Reset Working Changes button (discard, reload saved) — v1.0
- ✓ Apply to Game button (RCON: WipeDatabases + batch commands) — v1.0
- ✓ Accordion-based weapon list (one at a time, not bulk) — v1.0
- ✓ Lazy loading on accordion expand — v1.0
- ✓ Search/filter weapons by name — v1.0
- ✓ Schema validation on save (reject invalid keys/types) — v1.0
- ✓ Simple password auth for /api/apply — v1.0
- ✓ Static presets (read-only folder structure) — v1.1
- ✓ User presets (save/load/delete) — v1.1
- ✓ Preset preview before loading — v1.1
- ✓ Import/export presets via ZIP — v1.1
- ✓ Object format for JSON storage — v1.2
- ✓ On-demand file storage (delete empty files) — v1.2

### Active

None — no active milestone

### Out of Scope
- Real-time collaboration — single user at a time
- Undo/redo — user can reload saved config
- Audit logging — not needed for this use case
- Config backups/versioning — deferred

## Context

**Architecture (v1.0):**
Web app JSON files are the source of truth. This enables:
- Game mod requests config on startup (POST /api/apply)
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
| Web app JSON as source of truth | Mod can request config on startup | ✓ Good |
| Accordion-based weapon selection | Simpler UX, lazy loading | ✓ Good |
| Working → Save → Apply flow | Explicit persistence, clear state model | ✓ Good |
| Context menu on all rows | Users want to bulk-reset to defaults too | ✓ Good |
| ~~Staged state per config key~~ | ~~Selective apply workflow~~ | ⚠️ Superseded |
| ~~Multi-weapon bulk editing~~ | ~~Apply to all selected~~ | ⚠️ Superseded |
| ~~Game.ini as source of truth~~ | ~~Match existing mod behavior~~ | ⚠️ Superseded |

| Filesystem-based presets | Presets stored as folders with manifest.json + config files | ✓ Good |
| Two-stage dialog for preset loading | Protect unsaved changes before loading | ✓ Good |
| Preview-before-action pattern | Show preset contents before destructive operation | ✓ Good |
| ZIP import with dialog | Let user customize name/title/description on import | ✓ Good |
| Object format for JSON | Single object `{key: value}` instead of array `[{key: value}]` | ✓ Good |
| On-demand file storage | Delete files when data is empty, cleanup empty dirs | ✓ Good |

---
*Last updated: 2026-01-26 after v1.2 milestone*
