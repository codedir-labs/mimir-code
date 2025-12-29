# Skipped Tests Analysis

**Date**: 2025-12-29
**Total Skipped**: 46 tests (44 unit + 2 integration)

## Summary by Category

| Category | Count | Reason |
|----------|-------|--------|
| FileSystemAdapter extras | 24 tests (4 describe blocks) | Methods not in IFileSystem interface |
| ProcessExecutorAdapter | 18 tests (1 describe block) | Outdated API signature |
| ProviderSetupWizard | 1 test suite (~50+ tests) | UI component needs keyboard input fix |
| Platform-specific paths | 3 tests | Windows-only tests (run on Windows) |
| Real API integration | 2 tests | Conditional (only if API keys present) |
| Deprecated API | 1 test | Old ProviderFactory.create() removed |

## Detailed Breakdown

### 1. FileSystemAdapter - Extra Methods (24 tests)

**File**: `tests/unit/platform/FileSystemAdapter.test.ts`

**Skipped test suites**:
- `describe.skip('stat')` - 8 tests
- `describe.skip('copyFile')` - 8 tests
- `describe.skip('glob')` - 8 tests
- `it.skip('should remove directory')` - 1 test (within rmdir suite)

**Reason**: These methods are NOT in the `IFileSystem` interface but exist in Node.js `fs/promises`.

**Comments in code**:
```typescript
// SKIPPED: stat() method not in IFileSystem interface
describe.skip('stat', () => { ... });

// SKIPPED: rmdir() method not in IFileSystem interface, use remove() instead
it.skip('should remove directory', async () => { ... });

// SKIPPED: copyFile() method not in IFileSystem interface
describe.skip('copyFile', () => { ... });

// SKIPPED: glob() method not in IFileSystem interface
describe.skip('glob', () => { ... });
```

**Should we fix?**:
- ❓ **Decision needed**: Should these methods be added to `IFileSystem` interface?
- If YES: Add to interface, enable tests
- If NO: Remove test code entirely (clean up)
- Current approach: Interface is intentionally minimal for platform abstraction

---

### 2. ProcessExecutorAdapter - Entire Suite (18 tests)

**File**: `tests/unit/platform/ProcessExecutorAdapter.test.ts`

**Skipped**: Entire test suite with `describe.skip('ProcessExecutorAdapter')`

**Reason**: API signature changed. Old tests use outdated signature.

**Comment in code**:
```typescript
// SKIPPED: ProcessExecutorAdapter tests use outdated API (execute() signature changed)
// TODO: Rewrite tests to use current execute(command: string, options) signature
describe.skip('ProcessExecutorAdapter', () => {
  // 18 tests here...
});
```

**Should we fix?**:
- ✅ **YES - HIGH PRIORITY**
- These are critical platform abstraction tests
- ProcessExecutorAdapter is core infrastructure
- Action: Rewrite tests to match current API signature

---

### 3. ProviderSetupWizard - UI Component (~50+ tests)

**File**: `tests/unit/features/providers/ProviderSetupWizard.test.tsx`

**Skipped**: Entire test suite with `describe.skip('ProviderSetupWizard')`

**Reason**: Component doesn't handle keyboard input properly.

**Comment in code**:
```typescript
// SKIPPED: ProviderSetupWizard welcome screen doesn't handle keyboard input
// TODO: Add useInput hook to welcome screen to handle Enter key press
// The component renders "Press Enter to continue" but doesn't listen for Enter key
// See: src/features/providers/components/ProviderSetupWizard.tsx:201-227
describe.skip('ProviderSetupWizard', () => {
  // Welcome Screen (5 tests)
  // Provider Selection Screen (5 tests)
  // Provider Configuration Screen (6 tests)
  // Storage Selection Screen (3 tests)
  // Connection Test Screen (3 tests)
  // Summary Screen (3 tests)
  // Keyboard Navigation (2 tests)
  // Multiple Providers Flow (1 test)
  // Error Handling (2 tests)
  // ~30+ tests total
});
```

**Should we fix?**:
- ✅ **YES - MEDIUM PRIORITY**
- ProviderSetupWizard is user-facing feature
- Tests are written, just need component fix
- Action: Add `useInput` hook to welcome screen to handle Enter key

---

### 4. Platform-Specific Path Tests (3 tests)

**File**: `tests/unit/platform/pathUtils.test.ts`

**Tests**:
```typescript
it.skipIf(platform() !== 'win32')('should handle Windows paths', () => { ... });
it.skipIf(platform() !== 'win32')('should detect absolute Windows path', () => { ... });
it.skipIf(platform() !== 'win32')('should parse Windows path', () => { ... });
```

**Reason**: Windows-specific tests that only run on Windows platform.

**Current status**:
- ✅ **WORKING AS INTENDED**
- These tests DO run on Windows
- Skipped on Unix/macOS to prevent cross-platform test failures
- This is the correct approach for platform-specific behavior

**On Windows**: All 3 tests run ✅
**On Unix/Mac**: All 3 tests skipped ✅

---

### 5. Real API Integration Tests (2 tests)

**File**: `tests/integration/provider-setup-to-usage-e2e.spec.ts`

**Tests**:
```typescript
it.skipIf(!hasDeepSeekKey)('should make real API call with DeepSeek if DEEPSEEK_API_KEY is set', async () => { ... });
it.skipIf(!hasAnthropicKey)('should make real API call with Anthropic if ANTHROPIC_API_KEY is set', async () => { ... });
```

**Reason**: Optional tests that only run if API keys are available in environment.

**Current status**:
- ✅ **WORKING AS INTENDED**
- Tests make real API calls (cost money)
- Should only run when explicitly enabled via environment variables
- Currently SKIPPED because no valid API keys present

**Should we fix?**:
- ❌ **NO - Keep as conditional**
- These are optional integration tests for real provider validation
- Not needed for CI/CD (use mocks instead)
- Only for manual testing with real credentials

---

### 6. Deprecated API Test (1 test)

**File**: `tests/integration/provider-setup-to-usage-e2e.spec.ts`

**Test**:
```typescript
// SKIPPED: Old ProviderFactory.create() API removed in AI SDK migration
// The new API requires async credential resolution via createFromConfig()
it.skip('should support old llm.apiKey config format', async () => {
  // Old format (pre-providers)
  const oldConfig = {
    llm: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-old-format-key',
      temperature: 0.7,
      maxTokens: 4096,
    },
  };

  // Old API no longer exists - would need to migrate to:
  // ProviderFactory.createFromConfig({ provider, model }, credentialsResolver)
});
```

**Reason**: AI SDK v6 migration removed synchronous `ProviderFactory.create()` API.

**Should we fix?**:
- ❌ **NO - Remove test entirely**
- Old API no longer exists
- Config migration not supported (users must update manually)
- Action: Delete this test in cleanup

---

## Recommendations

### High Priority (Must Fix)
1. ✅ **ProcessExecutorAdapter tests** (18 tests)
   - Rewrite to use current API signature
   - Critical infrastructure tests
   - Timeline: Next sprint

### Medium Priority (Should Fix)
2. ✅ **ProviderSetupWizard tests** (~30 tests)
   - Add `useInput` hook to welcome screen
   - User-facing feature
   - Timeline: Next sprint

### Low Priority (Cleanup)
3. 🧹 **FileSystemAdapter extra methods** (24 tests)
   - Decision: Keep interface minimal OR expand interface?
   - If minimal: Remove test code
   - If expand: Add methods to interface, enable tests
   - Timeline: Architecture review needed

4. 🧹 **Deprecated API test** (1 test)
   - Delete test entirely
   - No longer applicable
   - Timeline: Immediate cleanup

### Keep As-Is (Working Correctly)
5. ✅ **Platform-specific tests** (3 tests)
   - Working correctly
   - Run on Windows, skip on Unix/Mac
   - No action needed

6. ✅ **Real API integration tests** (2 tests)
   - Working correctly
   - Conditional execution is intentional
   - No action needed

---

## Summary for CI/CD

Current skipped tests breakdown:
- **40 tests**: Need fixing (ProcessExecutorAdapter + ProviderSetupWizard + FileSystemAdapter)
- **3 tests**: Platform-specific (correct behavior)
- **2 tests**: Conditional API tests (correct behavior)
- **1 test**: Deprecated (should be deleted)

After fixes, expected skip count:
- **5 tests**: Platform-specific + conditional API tests (normal)
- **0 tests**: Blocking issues

Target: Reduce skipped tests from 46 to ~5 (conditional/platform-specific only).
