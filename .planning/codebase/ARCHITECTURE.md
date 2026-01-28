# Architecture

**Analysis Date:** 2026-01-27

## Pattern Overview

**Overall:** Full-stack Next.js Application with File-based Data Storage

**Key Characteristics:**
- Single-page application with tabbed interface
- File-based JSON storage (no database)
- Real-time sync to game server via RCON
- Optimistic UI updates with fire-and-forget API writes
- Role-based access control (admin/user)

## Layers

**Presentation Layer:**
- Purpose: React components for user interface
- Contains: Page components, UI components, feature components
- Location: `src/app/page.tsx`, `src/components/`
- Depends on: Store layer, API routes
- Used by: End users via browser

**Store Layer (Client State):**
- Purpose: Client-side state management with Zustand
- Contains: Config values, auth state, UI state
- Location: `src/lib/store/configStore.ts`, `src/lib/store/authStore.ts`
- Depends on: API layer for persistence
- Used by: React components

**API Layer (Route Handlers):**
- Purpose: HTTP endpoints for data operations
- Contains: Next.js route handlers (GET, POST, DELETE)
- Location: `src/app/api/`
- Depends on: Service layer
- Used by: Client-side fetch calls

**Service Layer:**
- Purpose: Business logic and external integrations
- Contains: Database service, RCON service, Auth service, Presets service
- Location: `src/lib/database/service.ts`, `src/lib/rcon/service.ts`, `src/lib/auth/service.ts`
- Depends on: File system, RCON protocol
- Used by: API route handlers

**Schema Layer:**
- Purpose: Configuration schemas and validation
- Contains: Weapon config schema, character config schema, data types
- Location: `src/lib/config/weaponConfigSchema.ts`, `src/lib/config/characterConfigSchema.ts`
- Used by: Components for rendering, service layer for validation

## Data Flow

**Config Edit Flow:**

1. User edits a config value in UI
2. React component calls `setValue()` from configStore
3. Store updates local state immediately (optimistic)
4. Store fires fire-and-forget POST to `/api/config/{database}/{category}`
5. API route calls `writeCategory()` to write JSON file
6. If API fails, toast notification shown (no rollback)

**Apply to Game Server Flow:**

1. User clicks "Apply" button
2. Client calls `/api/apply` endpoint
3. API reads all database JSON files
4. Service generates RCON commands from config data
5. `executeBatchCommands()` sends commands to game server via RCON
6. Responses returned to client

**State Management:**
- Single source of truth: Zustand store (`useConfigStore`)
- Values synced to JSON files in `./Databases/` directory
- No working/saved distinction - all edits persist immediately
- Presets load by clearing all databases and writing new values

## Key Abstractions

**ConfigStore:**
- Purpose: Centralized config state with API persistence
- Location: `src/lib/store/configStore.ts`
- Pattern: Zustand store with async side effects

**Database Service:**
- Purpose: JSON file CRUD operations
- Location: `src/lib/database/service.ts`
- Pattern: Pure functions for file I/O with path security

**Config Schema:**
- Purpose: Define available config options per weapon/character
- Location: `src/lib/config/weaponConfigSchema.ts`
- Pattern: TypeScript enums and const objects with metadata

**RCON Service:**
- Purpose: Game server communication
- Location: `src/lib/rcon/service.ts`
- Pattern: Connection-per-batch with sequential command execution

## Entry Points

**Web Application:**
- Location: `src/app/page.tsx`
- Triggers: Browser navigation to root URL
- Responsibilities: Render main UI with auth gate

**API Routes:**
- Location: `src/app/api/**/*.ts`
- Triggers: HTTP requests from client
- Responsibilities: Handle data CRUD, auth, game server communication

## Error Handling

**Strategy:** Optimistic updates with toast notifications on failure

**Patterns:**
- Service layer throws errors on invalid operations
- API routes catch errors and return appropriate HTTP status
- Client shows toast notifications for failed API calls
- No automatic retry - user must manually retry

## Cross-Cutting Concerns

**Logging:**
- Console.log for RCON command execution
- No structured logging framework

**Validation:**
- Path traversal prevention in database service
- Schema-based validation for config values (DataType enum)
- Auth middleware for protected API routes

**Authentication:**
- Cookie-based session tokens
- JSON file storage for users (`users.json`)
- Admin bootstrap from environment variables
- Middleware pattern for route protection (`src/lib/auth/middleware.ts`)

---

*Architecture analysis: 2026-01-27*
*Update when major patterns change*
