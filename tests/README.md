# Testing Guide

## Running Tests

```bash
# Run all tests
yarn test

# Run unit tests only
yarn test:unit

# Run integration tests only
yarn test:integration

# Run tests in watch mode
yarn test --watch

# Run with coverage
yarn test --coverage
```

## Test Structure

```
tests/
├── helpers/              # Test utilities and helpers
│   └── platformHelpers.ts # Platform-specific test utilities
├── unit/                 # Unit tests (*.test.ts)
│   ├── cli/             # CLI component tests
│   ├── core/            # Core agent logic tests
│   ├── platform/        # Platform abstraction tests
│   ├── providers/       # LLM provider tests
│   └── utils/           # Utility function tests
└── integration/          # Integration tests (*.spec.ts)
    ├── e2e/             # End-to-end workflow tests
    └── providers/       # Provider integration tests
```

## Platform-Specific Testing

### Using Platform Helpers

The `tests/helpers/platformHelpers.ts` module provides utilities for writing cross-platform tests:

```typescript
import {
  isWindows,
  isMacOS,
  isUnix,
  getPlatformKey,
  platformCommands,
  platformPaths,
} from '../helpers/platformHelpers.js';

// Platform detection
if (isWindows) {
  // Windows-specific test logic
}

// Platform-specific keyboard shortcuts
const interruptKey = getPlatformKey('Ctrl+C'); // Returns 'Cmd+C' on macOS, 'Ctrl+C' elsewhere

// Platform-specific commands
const { command, args } = platformCommands.echo;
const echoArgs = args('hello'); // Returns ['hello'] on Unix, ['/c', 'echo', 'hello'] on Windows
```

### Conditional Test Execution

Use Vitest's `.skipIf()` and `.runIf()` for platform-specific tests:

```typescript
import { platform } from 'os';
import { describe, it, expect } from 'vitest';

describe('Path utilities', () => {
  // Skip test on non-Windows platforms
  it.skipIf(platform() !== 'win32')('should handle Windows paths', () => {
    const result = parsePath('C:\\foo\\bar\\baz.txt');
    expect(result.base).toBe('baz.txt');
  });

  // Run only on Unix platforms
  it.runIf(platform() !== 'win32')('should handle Unix paths', () => {
    const result = parsePath('/foo/bar/baz.txt');
    expect(result.base).toBe('baz.txt');
  });

  // Skip on macOS (e.g., for tests incompatible with macOS behavior)
  it.skipIf(platform() === 'darwin')('should respect timeout', async () => {
    // Test logic that doesn't work on macOS
  });
});
```

### Platform-Specific Test Tagging

**Naming Convention:**
- Tests that only work on Windows: Prefix with `[Windows]` or use `.skipIf()`
- Tests that only work on Unix: Prefix with `[Unix]` or use `.skipIf()`
- Tests that only work on macOS: Prefix with `[macOS]` or use `.skipIf()`

**Examples:**

```typescript
// Good - Uses platform helper
it('should dispatch keyboard event', () => {
  const interruptKey = getPlatformKey('Ctrl+C');
  eventBus.dispatch(interruptKey);
  expect(handler).toHaveBeenCalled();
});

// Good - Conditional execution
it.skipIf(platform() !== 'win32')('should parse Windows path', () => {
  // Windows-only test
});

// Bad - Hardcoded platform behavior
it('should use Ctrl+C', () => {
  eventBus.dispatch('Ctrl+C'); // Fails on macOS where it's Cmd+C
});
```

## Common Test Patterns

### Testing File System Operations

```typescript
import { FileSystemAdapter } from '../../../src/platform/FileSystemAdapter.js';

describe('FileSystemAdapter', () => {
  let fs: FileSystemAdapter;
  let tempDir: string;

  beforeEach(async () => {
    fs = new FileSystemAdapter();
    tempDir = await fs.createTempDir();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should write and read file', async () => {
    const filePath = path.join(tempDir, 'test.txt');
    await fs.writeFile(filePath, 'content');
    const result = await fs.readFile(filePath, 'utf-8');
    expect(result).toBe('content');
  });
});
```

### Testing Process Execution

```typescript
import { ProcessExecutorAdapter } from '../../../src/platform/ProcessExecutorAdapter.js';
import { platformCommands } from '../../helpers/platformHelpers.js';

describe('ProcessExecutorAdapter', () => {
  let executor: ProcessExecutorAdapter;

  beforeEach(() => {
    executor = new ProcessExecutorAdapter();
  });

  it('should execute command', async () => {
    const { command, args } = platformCommands.echo;
    const echoArgs = args('hello');

    const result = await executor.execute(command, echoArgs);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });
});
```

### Mocking LLM Providers

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## CI/CD Testing

Tests run on three platforms in GitHub Actions:
- **Ubuntu 22.04** (Node 20, 22)
- **macOS 14** (Node 20, 22)
- **Windows Server 2022** (Node 20, 22)

Platform-specific tests are automatically skipped on incompatible platforms using `.skipIf()`.

## Test Coverage

Target coverage thresholds:
- **Lines**: 80%+
- **Functions**: 80%+
- **Branches**: 75%+
- **Statements**: 80%+

Critical paths (agent loop, permission system, tool execution) should have 90%+ coverage.

## Debugging Tests

```bash
# Run specific test file
yarn test tests/unit/platform/pathUtils.test.ts

# Run tests matching pattern
yarn test -t "should parse path"

# Show verbose output
yarn test --reporter=verbose

# Run with debugging
NODE_OPTIONS='--inspect-brk' yarn test
```

## Best Practices

1. **Use Platform Abstractions**: Never use `fs`, `child_process`, or `os` directly - use platform adapters
2. **Mock External Dependencies**: Use MSW for HTTP, testcontainers for Docker, in-memory for DB
3. **Isolate Tests**: Each test should be independent and not rely on execution order
4. **Clean Up Resources**: Always clean up temp files, processes, and database connections
5. **Test Error Cases**: Include tests for error handling and edge cases
6. **Keep Tests Fast**: Unit tests should run in <100ms, integration tests in <5s
7. **Use Descriptive Names**: Test names should describe behavior, not implementation
8. **Avoid Test Duplication**: Use `beforeEach`, `describe.each`, or `it.each` for repeated setup
