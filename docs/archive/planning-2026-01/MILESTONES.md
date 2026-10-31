# Project Milestones: EZConfig UI

## v1.2 Database Simplification (Shipped: 2026-01-26)

**Delivered:** Simplified database layer with object format and on-demand file management.

**Phases completed:** 14-15 (2 plans total)

**Key accomplishments:**
- Converted JSON storage from array format `[{key: value}]` to object format `{key: value}`
- Renamed `ConfigEntry` to `ConfigData` for semantic clarity
- Implemented on-demand file storage (files deleted when data is empty)
- Added automatic empty directory cleanup
- Net code simplification (-23 lines)

**Stats:**
- 13 files modified (+198 / -221 lines)
- 2 phases, 2 plans, 5 tasks
- Same day implementation

**Git range:** `3cc4ea0` → current HEAD

**What's next:** TBD - milestone complete, planning next features

---

## v1.1 Presets (Shipped: 2026-01-26)

**Delivered:** Full preset system with static read-only presets and user-defined presets with import/export.

**Phases completed:** 11-13 (6 plans total)

**Key accomplishments:**
- Static presets (read-only) with folder structure
- User presets (save/load/delete)
- Preview before load with content summary
- Import/export via ZIP files with name validation
- Two-stage dialog pattern protecting unsaved changes

**Stats:**
- 20 files created/modified (+2,425 lines)
- 3 phases, 6 plans
- Same day implementation

**Git range:** `feat(11-01)` → `chore: complete v1.1 milestone`

**What's next:** v1.2 Database Simplification

---

## v1.0 Database-Driven Config (Shipped: 2026-01-26)

**Delivered:** Complete web-based configuration interface with JSON database, working state persistence, and bulk weapon update features.

**Phases completed:** 5-10 (10 plans total)

**Key accomplishments:**
- JSON database filesystem with schema validation and type-safe API endpoints
- Working/saved state model with localStorage persistence
- Accordion-based weapon list with lazy loading on expand
- Save/Reset/Apply workflow with confirmation dialogs and password-protected game apply
- Overrides view toggle showing only customized config values
- Bulk weapon update via context menu with batch state updates

**Stats:**
- 55 files created/modified (+6,332 / -543 lines)
- 6,177 lines of TypeScript
- 6 phases, 10 plans, ~30 tasks
- 2 days from start to ship (2026-01-25 → 2026-01-26)

**Git range:** `feat(05-01)` → `docs(10-01)`

**What's next:** TBD - milestone complete, planning next features

---

## v0.1 Game.ini Integration (Superseded: 2026-01-25)

**Delivered:** Initial implementation with Game.ini as source of truth — superseded before shipping due to architectural pivot.

**Phases completed:** 1-3 (7 plans total)

**Key accomplishments:**
- Next.js 16 foundation with Tailwind CSS 4, Shadcn UI, Zustand
- Type-specific input components (Boolean, Float, Vector, Vector2D, FloatArray)
- Weapon config tab with multi-weapon selection and collapsible sections
- Character config tab with collapsible sections
- Game.ini parsing with schema-driven type conversion
- RCON command execution with value formatters

**Stats:**
- 84 files created/modified
- 3,015 lines of TypeScript
- 3 phases, 7 plans
- 2 days from start to supersede

**Git range:** `32f8153` → `5d1bae1`

**Why superseded:** Pivoting to database-driven architecture where web app JSON files are the source of truth. Game mod will request config from web app on startup. See `architecture_update.md` for details.

**What carries forward:**
- Next.js/Tailwind/Shadcn foundation
- Input components (reusable)
- RCON connection logic
- Schema definitions

---
