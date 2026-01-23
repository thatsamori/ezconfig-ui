# Roadmap: EZConfig UI

## Overview

Build a web-based configuration interface for the ezconfig game mod. Starting with project foundation, then building the core UI components for weapon/character editing, integrating with the existing RCON/Game.ini systems, and finishing with preset management and auth.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - Next.js setup, Zustand store, environment config
- [ ] **Phase 2: Core UI** - Config tabs, inputs, collapsible sections, weapon multi-select
- [ ] **Phase 3: Integration** - RCON execution, Game.ini parsing, staged state sync
- [ ] **Phase 4: Features** - Preset system, search/filter, simple auth

## Phase Details

### Phase 1: Foundation
**Goal**: Working Next.js app with Zustand store structure and environment configuration
**Depends on**: Nothing (first phase)
**Research**: Unlikely (established patterns)
**Plans**: TBD

Plans:
- [ ] 01-01: Project setup (Next.js, Tailwind, Shadcn, Zustand)
- [ ] 01-02: Store structure and environment config

### Phase 2: Core UI
**Goal**: Complete UI for editing weapon and character configs with all input types
**Depends on**: Phase 1
**Research**: Unlikely (internal UI patterns, Shadcn components)
**Plans**: TBD

Plans:
- [ ] 02-01: Type-specific input components (Boolean, Float, Vector, etc.)
- [ ] 02-02: Weapon config tab with multi-select and collapsible sections
- [ ] 02-03: Character config tab with collapsible sections

### Phase 3: Integration
**Goal**: End-to-end flow: edit → stage → apply via RCON → verify in Game.ini
**Depends on**: Phase 2
**Research**: Unlikely (RCON patterns exist in codebase)
**Plans**: TBD

Plans:
- [ ] 03-01: Game.ini parsing and staged state initialization
- [ ] 03-02: RCON command execution (sequential) and UI sync

### Phase 4: Features
**Goal**: Preset save/load/delete, search filter, and simple JSON auth
**Depends on**: Phase 3
**Research**: Unlikely (standard patterns)
**Plans**: TBD

Plans:
- [ ] 04-01: Preset system (save, load, delete)
- [ ] 04-02: Search/filter and auth

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/2 | Not started | - |
| 2. Core UI | 0/3 | Not started | - |
| 3. Integration | 0/2 | Not started | - |
| 4. Features | 0/2 | Not started | - |
