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
- **v1.3 Users & Auth** — Phases 16-18 (SHIPPED 2026-01-27)

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

### v1.3 Users & Auth (SHIPPED 2026-01-27)

**Milestone Goal:** Add user authentication and access control for multi-user configuration management.

#### Phase 16: Auth Setup

**Goal**: Login/logout with users.json storage, env bootstrap, simple localStorage token
**Depends on**: Previous milestone complete
**Research**: Unlikely (simple file-based auth, no external libraries)
**Plans**: 2

Plans:
- [x] 16-01: Auth Backend — users service, login/logout/me API endpoints — completed 2026-01-27
- [x] 16-02: Auth Frontend — auth store, login UI, app gate — completed 2026-01-27

#### Phase 17: User Management

**Goal**: Users tab for admin to create/edit/delete users
**Depends on**: Phase 16
**Research**: Unlikely (CRUD patterns, existing tab UI)
**Plans**: 2

Plans:
- [x] 17-01: User API — CRUD endpoints with role-based access — completed 2026-01-27
- [x] 17-02: Users Tab UI — user table, create/edit/delete dialogs — completed 2026-01-27

#### Phase 18: Access Control

**Goal**: Role enforcement - Users tab only visible to admin
**Depends on**: Phase 17
**Research**: Unlikely (internal patterns, role checks)
**Plans**: 1

Roles (simplified):
- config_editor: Full config control except user management
- admin: Full access

Plans:
- [x] 18-01: Role Enforcement UI — simplified to 2 roles, admin-only Users tab — completed 2026-01-27

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
