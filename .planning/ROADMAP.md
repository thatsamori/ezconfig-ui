# Roadmap: EZConfig UI

## Overview

Build a web-based configuration interface for the ezconfig game mod. The web app is the authoritative source for all user configuration. The game mod reads from the web app on startup and receives live updates via RCON.

## Domain Expertise

None

## Milestones

- **v0.1 Game.ini Integration** — Phases 1-3 (SUPERSEDED 2026-01-25) — [Archive](milestones/v0.1-ROADMAP.md)
- **v1.0 Database-Driven Config** — Phases 5-10 (SHIPPED 2026-01-26) — [Archive](milestones/v1.0-ROADMAP.md)
- **v1.1 Presets** — Phases 11-13 (SHIPPED 2026-01-26) — [Archive](milestones/v1.1-ROADMAP.md)
- **v1.2 Database Simplification** — Phases 14-15 (SHIPPED 2026-01-26) — [Archive](milestones/v1.2-ROADMAP.md)
- **v1.3 Users & Auth** — Phases 16-18 (SHIPPED 2026-01-27) — [Archive](milestones/v1.3-ROADMAP.md)
- 🚧 **v1.4 UX Improvements** — Phases 19-20 (in progress)

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

<details>
<summary>v1.2 Database Simplification (Phases 14-15) — SHIPPED 2026-01-26</summary>

Simplified database layer with object format and on-demand file management.

- [x] Phase 14: Object Format (1/1 plans) — completed 2026-01-26
- [x] Phase 15: On-Demand Storage (1/1 plans) — completed 2026-01-26

See [v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full details.

</details>

<details>
<summary>v1.3 Users & Auth (Phases 16-18) — SHIPPED 2026-01-27</summary>

User authentication and role-based access control with simplified 2-role system.

- [x] Phase 16: Auth Setup (2/2 plans) — completed 2026-01-27
- [x] Phase 17: User Management (2/2 plans) — completed 2026-01-27
- [x] Phase 18: Access Control (1/1 plan) — completed 2026-01-27

See [v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) for full details.

</details>

### 🚧 v1.4 UX Improvements (In Progress)

**Milestone Goal:** Improve user experience with selective apply and override filtering

#### Phase 19: Selective Apply

**Goal**: Dialog with selectable command list for granular control over which changes are sent to the game server
**Depends on**: Phase 18
**Research**: Unlikely (internal UI patterns)
**Plans**: TBD

Plans:
- [ ] 19-01: TBD (run /gsd:plan-phase 19 to break down)

#### Phase 20: Overrides Filter

**Goal**: Filter weapons and categories to show only those with overrides
**Depends on**: Phase 19
**Research**: Unlikely (internal filtering patterns)
**Plans**: TBD

Plans:
- [ ] 20-01: TBD (run /gsd:plan-phase 20 to break down)

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
| 15. On-Demand Storage | v1.2 | 1/1 | Complete | 2026-01-26 |
| 16. Auth Setup | v1.3 | 2/2 | Complete | 2026-01-27 |
| 17. User Management | v1.3 | 2/2 | Complete | 2026-01-27 |
| 18. Access Control | v1.3 | 1/1 | Complete | 2026-01-27 |
| 19. Selective Apply | v1.4 | 0/? | Not started | - |
| 20. Overrides Filter | v1.4 | 0/? | Not started | - |
