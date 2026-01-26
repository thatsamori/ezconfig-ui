# Roadmap: EZConfig UI

## Overview

Build a web-based configuration interface for the ezconfig game mod. The web app is the authoritative source for all user configuration. The game mod reads from the web app on startup and receives live updates via RCON.

## Domain Expertise

None

## Milestones

- **v0.1 Game.ini Integration** — Phases 1-3 (SUPERSEDED 2026-01-25) — [Archive](milestones/v0.1-ROADMAP.md)
- **v1.0 Database-Driven Config** — Phases 5+ (planned)

## Completed Milestones

<details>
<summary>v0.1 Game.ini Integration (Phases 1-3) — SUPERSEDED 2026-01-25</summary>

Initial implementation using Game.ini as source of truth. Superseded before shipping due to architectural pivot to database-driven configuration.

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-01-23
- [x] Phase 2: Core UI (3/3 plans) — completed 2026-01-23
- [x] Phase 3: Integration (2/2 plans) — completed 2026-01-23
- [ ] ~~Phase 4: Features~~ — not started, superseded

See [v0.1-ROADMAP.md](milestones/v0.1-ROADMAP.md) for full details.

</details>

## Current Milestone: v1.0 Database-Driven Config

**Goal:** Web app as source of truth with JSON database, lazy loading, and mod startup integration

**Architecture:** See `architecture_update.md`

### Phases

- [x] **Phase 5: Database Layer** — JSON file storage, API endpoints, schema validation — COMPLETE 2026-01-25
  - [x] Plan 01: Database service layer (2026-01-25)
  - [x] Plan 02: Databases structure & apply endpoints (2026-01-25)
- [x] **Phase 6: UI Refactor** — Accordion-based weapon list, lazy loading, working state — COMPLETE 2026-01-25
  - [x] Plan 01: Store refactor for working state model (2026-01-25)
  - [x] Plan 02: Weapon accordion UI (2026-01-25)
- [x] **Phase 7: Apply Flow** — Save/Reset/Apply buttons, WipeDatabases + batch RCON — COMPLETE 2026-01-26
  - [x] Plan 01: Action buttons (Save/Reset/Apply) (2026-01-26)
- [x] **Phase 8: Polish** — Search/filter, cleanup, error handling — COMPLETE 2026-01-26
  - [x] Plan 01: Search/filter for weapons (2026-01-26)
  - [x] Plan 02: Cleanup & error handling (2026-01-26)
- [ ] **Phase 9: Overrides View** — Toggle to show only config values that override game defaults

**Phase Numbering:**
- Phases 1-4: v0.1 (superseded)
- Phases 5+: v1.0 (current milestone)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v0.1 | 2/2 | Superseded | 2026-01-23 |
| 2. Core UI | v0.1 | 3/3 | Superseded | 2026-01-23 |
| 3. Integration | v0.1 | 2/2 | Superseded | 2026-01-23 |
| 4. Features | v0.1 | 0/2 | Superseded | - |
| 5. Database Layer | v1.0 | 2/2 | Complete | 2026-01-25 |
| 6. UI Refactor | v1.0 | 2/2 | Complete | 2026-01-25 |
| 7. Apply Flow | v1.0 | 1/1 | Complete | 2026-01-26 |
| 8. Polish | v1.0 | 2/2 | Complete | 2026-01-26 |
| 9. Overrides View | v1.0 | 0/? | Not started | - |
