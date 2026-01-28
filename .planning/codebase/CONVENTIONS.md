# Coding Conventions

**Analysis Date:** 2026-01-27

## Naming Patterns

**Files:**
- camelCase.ts for library/utility files (`configStore.ts`, `service.ts`)
- PascalCase.tsx for React components (`WeaponConfigTab.tsx`, `LoginForm.tsx`)
- index.ts for barrel exports
- route.ts for Next.js API routes

**Functions:**
- camelCase for all functions (`setValue`, `readCategory`, `executeBatchCommands`)
- No special prefix for async functions
- Descriptive verb-noun pattern (`validateCredentials`, `generateToken`)

**Variables:**
- camelCase for variables and parameters
- UPPER_SNAKE_CASE for enums values (`DataType.Bool`, `CategoryName.Greatsword`)
- No underscore prefix for private members

**Types:**
- PascalCase for interfaces and types (`ConfigValue`, `RconConfig`, `User`)
- No I prefix for interfaces
- PascalCase for enums (`DataType`, `CategoryName`, `WeaponConfigGroupName`)

## Code Style

**Formatting:**
- 2 space indentation (inferred from source files)
- Single quotes for strings in JSX
- Double quotes for strings in TypeScript
- Semicolons required
- No trailing commas after last property

**Linting:**
- ESLint with `eslint-config-next` (`package.json`)
- Run: `npm run lint` or `bun lint`

## Import Organization

**Order:**
1. React imports (`'use client'`, React hooks)
2. External packages (zustand, sonner, etc.)
3. Internal modules with path alias (`@/components/`, `@/lib/`)
4. Relative imports (`./`, `../`)
5. Type imports (`import type {}`)

**Grouping:**
- No blank lines between import groups
- Types imported separately with `import type`

**Path Aliases:**
- `@/` maps to `src/` (`tsconfig.json`)

## Error Handling

**Patterns:**
- Service functions throw errors with descriptive messages
- API routes wrap in try/catch, return appropriate HTTP status
- Client uses toast notifications for user-facing errors

**Error Types:**
- Standard Error class with descriptive messages
- NodeJS.ErrnoException for file system errors
- ENOENT check for missing files (return empty defaults)

**Examples from codebase:**
```typescript
// Service throws
throw new Error(`Invalid path: path traversal detected in "${combined}"`);

// API catches and returns
if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
  return {};
}
```

## Logging

**Framework:**
- console.log for server-side logging
- toast() from sonner for client-side notifications

**Patterns:**
- Log RCON command execution: `console.log("Successfully executed command:", command)`
- No structured logging

## Comments

**When to Comment:**
- JSDoc comments for service functions explaining purpose
- Inline comments for non-obvious logic
- Section comments for grouped config options

**JSDoc/TSDoc:**
- Used for public service functions
- `@param` and `@returns` tags when helpful
- Example:
```typescript
/**
 * Execute a batch of RCON commands sequentially using a single connection
 * @param commands Array of command strings to execute
 * @returns Array of responses from each command
 */
```

**TODO Comments:**
- Not found in codebase (clean)

## Function Design

**Size:**
- Functions generally under 50 lines
- Complex logic extracted to helper functions

**Parameters:**
- Max 3-4 parameters typical
- Options objects used for complex configurations
- Destructuring used in React components

**Return Values:**
- Explicit return types on service functions
- Async functions return Promise types
- Empty objects `{}` returned for missing data (not null)

## Module Design

**Exports:**
- Named exports preferred for services and utilities
- Default export for React page components
- Barrel files (index.ts) for feature directories

**Barrel Files:**
- Each feature directory has index.ts re-exporting public API
- Example: `src/components/weapons/index.ts` exports `WeaponConfigTab`, `WeaponAccordion`

## React Patterns

**Component Structure:**
- `'use client'` directive at top for client components
- Hooks at top of component body
- useMemo for derived state
- Props destructured in function signature

**State Management:**
- Zustand for global state (`useConfigStore`, `useAuthStore`)
- useState for local UI state
- useMemo for computed values

**Event Handlers:**
- Inline arrow functions for simple handlers
- Named handlers for complex logic

## API Route Patterns

**Structure:**
```typescript
export async function GET(request: Request) {
  // Auth check
  // Business logic
  // Return NextResponse.json()
}
```

**Response Format:**
- NextResponse.json() for data responses
- Appropriate HTTP status codes (200, 400, 401, 404, 500)

---

*Convention analysis: 2026-01-27*
*Update when patterns change*
