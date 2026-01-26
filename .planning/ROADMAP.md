# Roadmap: EZConfig UI

## Overview

Build a web-based configuration interface for the ezconfig game mod. The web app is the authoritative source for all user configuration. The game mod reads from the web app on startup and receives live updates via RCON.

## Domain Expertise

None

## Milestones

- **v0.1 Game.ini Integration** — Phases 1-3 (SUPERSEDED 2026-01-25) — [Archive](milestones/v0.1-ROADMAP.md)
- **v1.0 Database-Driven Config** — Phases 5-10 (SHIPPED 2026-01-26) — [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Presets** — Phases 11-13 (SHIPPED 2026-01-26) — [Archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Database Simplification** — Phases 14-15 (in progress)

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

<details>
<summary>v1.0 Database-Driven Config (Phases 5-10) — SHIPPED 2026-01-26</summary>

Web app as source of truth with JSON database, lazy loading, and mod startup integration.

- [x] Phase 5: Database Layer (2/2 plans) — completed 2026-01-25
- [x] Phase 6: UI Refactor (2/2 plans) — completed 2026-01-25
- [x] Phase 7: Apply Flow (1/1 plans) — completed 2026-01-26
- [x] Phase 8: Polish (2/2 plans) — completed 2026-01-26
- [x] Phase 9: Overrides View (2/2 plans) — completed 2026-01-26
- [x] Phase 10: Bulk Weapon Update (1/1 plans) — completed 2026-01-26

See [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) for full details.

</details>

<details>
<summary>v1.1 Presets (Phases 11-13) — SHIPPED 2026-01-26</summary>

Full preset system with static read-only presets and user-defined presets.

- [x] Phase 11: Static Presets (2/2 plans) — completed 2026-01-26
- [x] Phase 12: User Presets (2/2 plans) — completed 2026-01-26
- [x] Phase 13: Preset Polish (2/2 plans) — completed 2026-01-26

See [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) for full details.

</details>

### 🚧 v1.2 Database Simplification (In Progress)

**Milestone Goal:** Simplify database layer by converting to object format and implementing on-demand file management.

#### Phase 14: Object Format

**Goal**: Convert JSON storage from array format to single object format
**Depends on**: Previous milestone complete
**Research**: Unlikely (internal refactor)
**Plans**: 1 plan

Plans:
- [x] 14-01: Object format migration — completed 2026-01-26

#### Phase 15: On-Demand Storage

**Goal**: Create files only when data exists, delete empty files and directories
**Depends on**: Phase 14
**Research**: Unlikely (internal refactor)
**Plans**: TBD

Plans:
- [ ] 15-01: TBD (run /gsd:plan-phase 15 to break down)

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
| 9. Overrides View | v1.0 | 2/2 | Complete | 2026-01-26 |
| 10. Bulk Weapon Update | v1.0 | 1/1 | Complete | 2026-01-26 |
| 11. Static Presets | v1.1 | 2/2 | Complete | 2026-01-26 |
| 12. User Presets | v1.1 | 2/2 | Complete | 2026-01-26 |
| 13. Preset Polish | v1.1 | 2/2 | Complete | 2026-01-26 |
| 14. Object Format | v1.2 | 1/1 | Complete | 2026-01-26 |
| 15. On-Demand Storage | v1.2 | 0/? | Not started | - |
