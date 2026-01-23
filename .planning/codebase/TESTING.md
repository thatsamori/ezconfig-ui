# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Runner:**
- Not configured

**Assertion Library:**
- Not configured

**Run Commands:**
```bash
# No test commands available yet
# Coverage directory in .gitignore indicates future planning
```

## Test File Organization

**Location:**
- No test files present
- Future pattern expected: `*.test.ts` co-located with source (based on common Bun/TypeScript patterns)

**Naming:**
- Not established
- Suggested: `types.test.ts`, `characterConfigSchema.test.ts`

**Structure:**
```
ezconfig-ui/
├── types.ts
├── types.test.ts              # (future)
├── characterConfigSchema.ts
├── characterConfigSchema.test.ts  # (future)
├── weaponConfigSchema.ts
├── weaponConfigSchema.test.ts     # (future)
└── rconExamples.ts
```

## Test Structure

**Suite Organization:**
- Not established
- Suggested pattern for Bun:

```typescript
import { describe, it, expect } from "bun:test";

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle valid input', () => {
      // arrange
      // act
      // assert
    });
  });
});
```

**Patterns:**
- Not established

## Mocking

**Framework:**
- Not configured
- Bun has built-in mocking via `mock` from "bun:test"

**What Would Need Mocking:**
- RCON client (`rcon.send()` calls)
- Network operations

## Fixtures and Factories

**Test Data:**
- Not established
- Config entries from schema files could serve as test fixtures

**Location:**
- Not established
- Suggested: `tests/fixtures/` or inline in test files

## Coverage

**Requirements:**
- None established
- `.gitignore` includes `coverage/` and `*.lcov` (prepared for future)

**Configuration:**
- Not configured
- Bun supports coverage via `bun test --coverage`

**View Coverage:**
```bash
# Future command
bun test --coverage
```

## Test Types

**Unit Tests:**
- Not implemented
- Key candidates:
  - `validateAndConvertDataType()` in `rconExamples.ts`
  - Flat map generation in schema files
  - Type validation logic

**Integration Tests:**
- Not implemented
- Key candidates:
  - RCON command formatting
  - End-to-end config update flow (with mocked RCON)

**E2E Tests:**
- Not implemented
- Would require actual RCON server connection

## What Needs Testing

**Critical Paths:**
1. `validateAndConvertDataType()` - All data type conversions
   - Boolean → "True"/"False"
   - Float → fixed decimal string
   - Vector → "X=0.00,Y=0.00,Z=0.00"
   - Vector2D → "X=0.00,Y=0.00"
   - FloatArray → "(0.00,0.00,...)"

2. Schema flat map generation
   - All config keys present
   - Correct lookup returns

3. RCON command formatting
   - Correct string format
   - Proper escaping if needed

**Edge Cases:**
- Invalid input types
- Boundary values for floats
- Empty arrays for FloatArray
- Null/undefined handling

## Recommended Test Setup

**Install Bun Test (built-in):**
```bash
# No installation needed - Bun includes test runner
```

**Add to package.json:**
```json
{
  "scripts": {
    "test": "bun test",
    "test:coverage": "bun test --coverage"
  }
}
```

**Example Test File (`validateAndConvertDataType.test.ts`):**
```typescript
import { describe, it, expect } from "bun:test";

describe('validateAndConvertDataType', () => {
  it('should convert boolean true to "True"', () => {
    // Test implementation
  });

  it('should throw on invalid boolean', () => {
    // Test implementation
  });
});
```

---

*Testing analysis: 2026-01-23*
*Update when test patterns change*
