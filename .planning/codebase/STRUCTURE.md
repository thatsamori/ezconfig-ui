# Codebase Structure

**Analysis Date:** 2026-01-27

## Directory Layout

```
ezconfig-ui/
├── src/                    # Application source code
│   ├── app/               # Next.js App Router pages and API routes
│   ├── components/        # React components
│   └── lib/               # Shared libraries and utilities
├── Databases/             # JSON config storage (runtime data)
├── Presets/               # Saved preset configurations
├── Notes/                 # Per-schema notes storage
├── scripts/               # Utility scripts
├── public/                # Static assets
├── .planning/             # Project planning documents
└── string-schemas/        # String format schemas
```

## Directory Purposes

**src/app/**
- Purpose: Next.js App Router - pages and API routes
- Contains: `page.tsx`, `layout.tsx`, `api/` directory
- Key files: `page.tsx` (main SPA), `layout.tsx` (root layout)
- Subdirectories:
  - `actions/` - Server actions for RCON and GameINI
  - `api/` - API route handlers

**src/app/api/**
- Purpose: REST API endpoints
- Contains: Route handlers organized by resource
- Key directories:
  - `auth/` - Login, logout, session management
  - `config/` - Config CRUD operations
  - `presets/` - Preset management
  - `users/` - User management (admin only)
  - `apply/` - Apply config to game server
  - `databases/` - Database structure endpoints
  - `notes/` - Notes CRUD

**src/components/**
- Purpose: React UI components
- Contains: Feature components and shared UI
- Subdirectories:
  - `ui/` - Reusable UI primitives (shadcn/ui)
  - `weapons/` - Weapon config components
  - `character/` - Character config components
  - `presets/` - Preset management components
  - `auth/` - Authentication components
  - `users/` - User management components
  - `config/` - Config input components
  - `notes/` - Notes feature components

**src/lib/**
- Purpose: Shared libraries, services, and utilities
- Contains: Business logic, types, hooks
- Subdirectories:
  - `store/` - Zustand state stores
  - `database/` - File-based storage service
  - `rcon/` - RCON protocol service
  - `auth/` - Authentication service
  - `config/` - Config schemas and types
  - `presets/` - Preset service
  - `notes/` - Notes service
  - `hooks/` - Custom React hooks
  - `gameini/` - Game INI file parser

**Databases/**
- Purpose: Runtime JSON config storage
- Contains: Nested JSON files by database/category
- Structure: `{DatabaseName}/{Category}.json` or `Weapon/{WeaponName}/{Category}.json`
- Generated: Created on-demand when configs are saved

**Presets/**
- Purpose: Saved configuration presets
- Contains: Preset JSON files and user preset subdirectories

**Notes/**
- Purpose: Per-schema rich text notes
- Contains: JSON files with TipTap editor content

## Key File Locations

**Entry Points:**
- `src/app/page.tsx` - Main application page
- `src/app/layout.tsx` - Root layout with providers

**Configuration:**
- `tsconfig.json` - TypeScript configuration
- `next.config.ts` - Next.js configuration
- `postcss.config.mjs` - PostCSS/Tailwind configuration
- `components.json` - shadcn/ui configuration
- `.env.example` - Environment variable template

**Core Logic:**
- `src/lib/store/configStore.ts` - Config state management
- `src/lib/database/service.ts` - JSON file storage
- `src/lib/rcon/service.ts` - Game server communication
- `src/lib/auth/service.ts` - User authentication

**Schemas:**
- `src/lib/config/weaponConfigSchema.ts` - Weapon config definitions
- `src/lib/config/characterConfigSchema.ts` - Character config definitions
- `src/lib/config/types.ts` - Shared config types

**Testing:**
- No dedicated test files (tests embedded in service files via `import.meta.main`)

## Naming Conventions

**Files:**
- camelCase.ts/tsx - All TypeScript files
- PascalCase.tsx - React component files
- index.ts - Barrel exports for directories

**Directories:**
- kebab-case - Feature directories under components/
- camelCase - Library directories under lib/

**Special Patterns:**
- `route.ts` - Next.js API route handler
- `[param]/` - Dynamic route segments
- `[...path]/` - Catch-all route segments

## Where to Add New Code

**New Feature:**
- Primary code: `src/components/{feature}/`
- State management: `src/lib/store/`
- API routes: `src/app/api/{resource}/`
- Types: `src/lib/{feature}/types.ts`

**New Component:**
- UI primitive: `src/components/ui/`
- Feature component: `src/components/{feature}/`
- Export: Add to `src/components/{feature}/index.ts`

**New API Endpoint:**
- Route: `src/app/api/{resource}/route.ts`
- Dynamic: `src/app/api/{resource}/[param]/route.ts`
- Service logic: `src/lib/{domain}/service.ts`

**New Service:**
- Implementation: `src/lib/{domain}/service.ts`
- Types: `src/lib/{domain}/types.ts`
- Export: `src/lib/{domain}/index.ts`

**Utilities:**
- Shared helpers: `src/lib/utils.ts`
- Hooks: `src/lib/hooks/`
- Type definitions: `src/lib/{domain}/types.ts`

## Special Directories

**Databases/**
- Purpose: Runtime config storage (JSON files)
- Source: Created by database service when configs saved
- Committed: No (gitignored)

**Presets/**
- Purpose: Saved configuration presets
- Source: User-created presets
- Committed: Yes (default presets)

**Notes/**
- Purpose: Per-schema notes with rich text
- Source: User-created notes
- Committed: No (gitignored)

**.next/**
- Purpose: Next.js build output
- Source: Generated by Next.js build
- Committed: No (gitignored)

---

*Structure analysis: 2026-01-27*
*Update when directory structure changes*
