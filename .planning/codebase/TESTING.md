# Testing Patterns

**Analysis Date:** 2026-01-27

## Test Framework

**Runner:**
- No dedicated test framework configured
- No test dependencies in `package.json`

**Assertion Library:**
- None configured

**Run Commands:**
```bash
# No test command defined
# Tests are embedded in service files
bun run src/lib/database/service.ts  # Run inline tests
```

## Test File Organization

**Location:**
- No dedicated test files
- Tests embedded in service files using `import.meta.main` pattern

**Naming:**
- No test file naming convention (no *.test.ts files)

**Structure:**
```
src/
  lib/
    database/
      service.ts    # Contains inline tests at bottom
```

## Test Structure

**Inline Test Pattern:**
```typescript
// At the bottom of service.ts files
if (import.meta.main) {
  console.log('Running database service tests...\n');

  // Test 1
  console.log('Test 1: Writing test data...');
  await writeCategory(testDatabase, testCategory, testData);
  console.log('  PASS: Write succeeded\n');

  // Test 2
  console.log('Test 2: Reading test data...');
  const readData = await readCategory(testDatabase, testCategory);
  if (JSON.stringify(readData) === JSON.stringify(testData)) {
    console.log('  PASS: Read data matches written data\n');
  } else {
    console.log('  FAIL: Read data does not match');
    process.exit(1);
  }
}
```

**Patterns:**
- Manual test execution via Bun
- Console.log for test output
- Process.exit(1) for failures
- Cleanup at end of tests

## Mocking

**Framework:**
- None configured

**Patterns:**
- No mocking framework available
- Tests use real file system
- Tests clean up after themselves

**What to Mock:**
- Currently nothing mocked

**What NOT to Mock:**
- File system operations (tested against real filesystem)

## Fixtures and Factories

**Test Data:**
```typescript
// Inline in test code
const testDatabase = 'Test';
const testCategory = 'General';
const testData: ConfigData = { TestKey: true, AnotherKey: 42 };
```

**Location:**
- No fixtures directory
- Test data defined inline in service files

## Coverage

**Requirements:**
- No coverage requirements
- No coverage tooling configured

**Configuration:**
- Not applicable

**View Coverage:**
- Not available

## Test Types

**Unit Tests:**
- Embedded in service files
- Test single service functions
- Use real filesystem

**Integration Tests:**
- None configured

**E2E Tests:**
- None configured

## Common Patterns

**Async Testing:**
```typescript
if (import.meta.main) {
  // Use top-level await
  const result = await asyncFunction();
  // Manual assertion
  if (result !== expected) {
    console.log('FAIL');
    process.exit(1);
  }
}
```

**Error Testing:**
```typescript
try {
  await readCategory('../etc', 'passwd');
  console.log('  FAIL: Path traversal was not prevented');
  process.exit(1);
} catch (error) {
  if ((error as Error).message.includes('path traversal')) {
    console.log('  PASS: Path traversal correctly rejected\n');
  }
}
```

**Cleanup:**
```typescript
// Cleanup at end of tests
try {
  await rm(join(getDatabasesRoot(), testDatabase), { recursive: true, force: true });
} catch { /* ignore */ }
```

## Recommendations

**Missing Test Infrastructure:**
- Consider adding Vitest for proper test framework
- Add test coverage reporting
- Create dedicated test files (`*.test.ts`)
- Add E2E tests for critical flows (auth, config save, RCON)

**Priority Test Areas:**
1. RCON command execution (critical for game server sync)
2. Config store state management
3. API route handlers
4. Auth flow (login, logout, token validation)
5. Preset load/save

---

*Testing analysis: 2026-01-27*
*Update when test patterns change*
