# Technology Stack

**Analysis Date:** 2026-01-27

## Languages

**Primary:**
- TypeScript 5.x - All application code (`package.json`)

**Secondary:**
- JavaScript - Config files (postcss.config.mjs)

## Runtime

**Environment:**
- Bun - Primary runtime and package manager (`@types/bun` in devDependencies)
- Node.js 20.x - Compatible runtime (Next.js requirement)

**Package Manager:**
- Bun - `bun.lock` present
- npm - `package-lock.json` also present (fallback)

## Frameworks

**Core:**
- Next.js 16.1.4 - Full-stack React framework (`package.json`)
- React 19.2.3 - UI library (`package.json`)

**Testing:**
- Not configured - No test framework found in dependencies

**Build/Dev:**
- TypeScript 5.x - Type checking and compilation (`tsconfig.json`)
- Tailwind CSS 4.x - Styling (`@tailwindcss/postcss`)
- PostCSS - CSS processing (`postcss.config.mjs`)

## Key Dependencies

**Critical:**
- zustand 5.0.10 - Client-side state management (`src/lib/store/configStore.ts`)
- rcon-client 4.2.5 - RCON protocol client for game server communication (`src/lib/rcon/service.ts`)
- sonner 2.0.7 - Toast notifications (`src/lib/store/configStore.ts`)

**UI Components:**
- Radix UI - Headless UI primitives (accordion, dialog, select, tabs, etc.)
- lucide-react 0.563.0 - Icons
- class-variance-authority 0.7.1 - Component variant styling
- clsx 2.1.1 - Class name utilities
- tailwind-merge 3.4.0 - Tailwind class merging

**Rich Text:**
- TipTap 3.17.1 - Rich text editor (`@tiptap/react`, `@tiptap/starter-kit`)

**Utilities:**
- jszip 3.10.1 - ZIP file handling (likely for presets)

## Configuration

**Environment:**
- `.env` files - Runtime configuration
- `.env.example` - Template with required variables
- Required: RCON_HOST, RCON_PORT, RCON_PASSWORD, EZCONFIG_PASSWORD, ADMIN_USERNAME, ADMIN_PASSWORD

**Build:**
- `tsconfig.json` - TypeScript configuration (strict mode, ES2017 target)
- `next.config.ts` - Next.js configuration
- `postcss.config.mjs` - PostCSS/Tailwind configuration
- `components.json` - shadcn/ui configuration

**Path Aliases:**
- `@/*` maps to `./src/*` (`tsconfig.json`)

## Platform Requirements

**Development:**
- Any platform with Bun or Node.js
- No Docker required - uses local filesystem for data storage

**Production:**
- Self-hosted deployment (communicates with local game server via RCON)
- Requires filesystem access for Databases/, Presets/, Notes/ directories
- Local game server with RCON enabled

---

*Stack analysis: 2026-01-27*
*Update after major dependency changes*
