# Roadmap: EZConfig UI

## Overview

Build a web-based configuration interface for the ezconfig game mod. The web app is the authoritative source for all user configuration. The game mod reads from the web app on startup and receives live updates via RCON.

## Domain Expertise

None

## Milestones

- **v0.1 Game.ini Integration** — Phases 1-3 (SUPERSEDED 2026-01-25) — [Archive](milestones/v0.1-ROADMAP.md)
- **v1.0 Database-Driven Config** — Phases 5-10 (SHIPPED 2026-01-26) — [Archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Presets** — Phases 11-13 (in progress)

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

## Current Milestone: v1.1 Presets

**Goal:** Full preset system with static read-only presets and user-defined presets for saving/loading configurations

### Phases

- [x] **Phase 11: Static Presets** — Read-only preset files, UI to browse and load (2/2 plans) ✓
- [x] **Phase 12: User Presets** — Save current config as preset, manage user presets (2/2 plans) ✓
- [ ] **Phase 13: Preset Polish** — Preview before load, import/export, UX refinements

### Phase Details

#### Phase 11: Static Presets

**Goal:** Read-only preset files that ship with the app, UI to browse and load them
**Depends on:** v1.0 complete
**Research:** Unlikely (extends existing filesystem patterns)
**Plans:** 2

Plans:
- [x] 11-01: Preset service layer and API endpoints ✓
- [x] 11-02: Preset gallery UI and load flow ✓

#### Phase 12: User Presets

**Goal:** Allow users to save current config as a preset, manage saved presets
**Depends on:** Phase 11
**Research:** Unlikely (extends existing patterns)
**Plans:** 2

Plans:
- [x] 12-01: User preset service layer and API endpoints ✓
- [x] 12-02: Save as Preset UI and preset management ✓

#### Phase 13: Preset Polish

**Goal:** Preview preset before loading, import/export presets
**Depends on:** Phase 12
**Research:** No (extends existing patterns)
**Plans:** 2

Plans:
- [ ] 13-01: Preset preview before load
- [ ] 13-02: Import/export with ZIP files

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
| 13. Preset Polish | v1.1 | 0/2 | Planned | - |
