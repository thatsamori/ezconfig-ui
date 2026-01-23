# Codebase Structure

**Analysis Date:** 2026-01-23

## Directory Layout

```
ezconfig-ui/
├── types.ts                    # Core type definitions and enums
├── characterConfigSchema.ts    # Character configuration schema (532 lines)
├── weaponConfigSchema.ts       # Weapon configuration schema (497 lines)
├── rconExamples.ts            # RCON client integration (102 lines) [gitignored]
├── package.json               # Project manifest
├── tsconfig.json              # TypeScript configuration
├── bun.lock                   # Dependency lock file
├── README.md                  # Project documentation
├── t.md                       # Additional notes/documentation
├── .gitignore                 # Git ignore rules
├── .planning/                 # Planning documentation
│   └── codebase/             # Codebase analysis (this folder)
└── node_modules/             # Dependencies (gitignored)
    ├── rcon-client/          # RCON protocol implementation
    ├── typescript/           # TypeScript compiler
    ├── @types/bun/           # Bun type definitions
    └── @types/node/          # Node.js type definitions
```

## Directory Purposes

**Root Directory:**
- Purpose: All source code lives at root level (flat structure)
- Contains: TypeScript source files, configuration files, documentation
- Key files: All `.ts` files are source code
- Subdirectories: Only node_modules and .planning

**.planning/codebase/:**
- Purpose: Codebase analysis documentation
- Contains: Architecture, stack, conventions docs
- Key files: This documentation set
- Subdirectories: None

## Key File Locations

**Entry Points:**
- `rconExamples.ts` - RCON integration and API (gitignored - contains credentials)

**Configuration:**
- `tsconfig.json` - TypeScript compiler options
- `package.json` - Dependencies and project metadata
- `.gitignore` - Excluded files

**Core Logic:**
- `types.ts` - Foundation types (ConfigEntry, DataType enum)
- `characterConfigSchema.ts` - Character config definitions
- `weaponConfigSchema.ts` - Weapon config definitions

**Testing:**
- No test files present
- `coverage/` directory in `.gitignore` for future use

**Documentation:**
- `README.md` - Installation and run instructions
- `t.md` - Design notes for planned UI

## Naming Conventions

**Files:**
- camelCase for all TypeScript files: `characterConfigSchema.ts`, `weaponConfigSchema.ts`
- Single word lowercase for utility files: `types.ts`
- UPPERCASE.md for documentation: `README.md`

**Directories:**
- kebab-case: `.planning`
- All lowercase: `node_modules`, `codebase`

**Special Patterns:**
- `*Schema.ts` suffix for configuration schema files
- No index.ts barrel exports (direct imports)

## Where to Add New Code

**New Configuration Schema:**
- Implementation: `[entityName]ConfigSchema.ts` at root
- Import types from: `types.ts`
- Export: Group enum, config options constant, flat map, key type

**New Data Type:**
- Type definition: Add to `DataType` enum in `types.ts`
- Validation: Add case to `validateAndConvertDataType()` in `rconExamples.ts`

**New RCON Function:**
- Implementation: Add to `rconExamples.ts`
- Pattern: Follow `sendCharacterConfigUpdate()` / `sendWeaponConfigUpdate()`

**Utilities:**
- Shared helpers: Create `utils.ts` at root
- Type utilities: Add to `types.ts`

## Special Directories

**.planning/:**
- Purpose: Project planning and codebase documentation
- Source: Created by GSD workflow
- Committed: Yes

**node_modules/:**
- Purpose: Installed dependencies
- Source: `bun install`
- Committed: No (gitignored)

---

*Structure analysis: 2026-01-23*
*Update when directory structure changes*
