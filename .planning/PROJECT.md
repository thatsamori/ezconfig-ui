# EZConfig UI

## What This Is

A web-based configuration interface for the ezconfig game mod. Allows users to edit character and weapon settings through a visual UI, stage changes selectively, and apply them to a game server via RCON commands. Supports saving/loading configuration presets.

## Core Value

Weapon configuration with multi-weapon selection must work end-to-end: edit values, stage changes, apply via RCON, verify in Game.ini.

## Requirements

### Validated

- ✓ Schema-driven configuration definitions — existing
- ✓ Character config schema (Movement, Combat, General groups) — existing
- ✓ Weapon config schema (General + Attack types) — existing
- ✓ Data type support (Boolean, Float, FloatArray, Vector, Vector2D) — existing
- ✓ RCON command formatting and validation — existing
- ✓ Type-safe config key lookups via flat maps — existing

### Active

- [ ] Weapon configuration tab with multi-weapon selection
  - Select multiple weapons, changes apply to all selected
  - Each weapon tracks its own staged checkboxes independently
  - Collapsible sections: General, Strike, AltStrike, Stab, AltStab
- [ ] Character configuration tab
  - Collapsible sections: Movement, Combat, General
- [ ] Staged changes system
  - Checkbox per config option to include/exclude from apply
  - Initialize staged state by parsing Game.ini `EZCONFIG_*` sections
  - Values from Game.ini are pre-checked as staged
- [ ] Type-specific input components
  - Boolean: toggle switch
  - Float: number input
  - Vector: X/Y/Z inputs
  - Vector2D: X/Y inputs
  - FloatArray: dynamic array of number inputs
- [ ] Apply changes flow
  - Sequential RCON command execution (not parallel)
  - Re-read Game.ini after completion to sync UI
- [ ] Quick search/filter on both tabs
- [ ] Preset system
  - Save current staged config to `./presets/{name}.json`
  - Load preset: applies values and checks those options
  - Delete presets
- [ ] Header with Apply Changes button
- [ ] Simple auth (JSON file with username/password combos) — for remote access

### Out of Scope

- Static presets (`./presets/static/` read-only folder) — deferred to future version
- Real-time collaboration — single user at a time
- Undo/redo — user can reload preset or re-read Game.ini
- Audit logging — not needed for this use case

## Context

**Existing Codebase:**
- TypeScript library with config schemas and RCON integration
- Schemas define all editable fields with data types, defaults, documentation flags
- `rconExamples.ts` has working RCON send functions and value conversion
- RCON credentials currently hardcoded (needs env var migration)

**Game Integration:**
- EZConfig mod reads from Game.ini sections prefixed `EZCONFIG_`
- Section format: `[EZCONFIG_{Category}_{Group}]` with key=value pairs
- Mod only overwrites values it receives; others stay at game default
- After RCON commands, mod auto-updates Game.ini

**Tech Stack Decision:**
- Bun + Next.js + TypeScript + Tailwind + Shadcn
- Zustand for staged config state (cross-tab, cross-component)
- Server Actions for Game.ini reads, RCON sends, preset file ops
- rcon-client package (already in use)

## Constraints

- **Tech stack**: Must use Bun, Next.js, TypeScript, Tailwind, Shadcn — non-negotiable
- **RCON config**: Environment variables (RCON_HOST, RCON_PORT, RCON_PASSWORD)
- **Game.ini path**: Environment variable for file path
- **Sequential RCON**: Commands must execute sequentially, not in parallel
- **Deployment**: Server has filesystem access to Game.ini

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Zustand for state | Cross-tab staged state, simpler than Context for this scale | — Pending |
| Server Actions for mutations | Next.js native, secure, good for file/RCON ops | — Pending |
| Collapsible sections (not sub-tabs) | Single view for weapon config, less navigation | — Pending |
| JSON file auth | Simple, security not critical, easy to implement | — Pending |
| Presets store only staged options | Lightweight, applies minimal overrides | — Pending |

---
*Last updated: 2026-01-23 after initialization*
