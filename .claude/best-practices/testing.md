# Testing Guidelines

**CRITICAL**: Test-driven development with 80%+ coverage (85%+ for v1.0).

## Test Types

- **Unit tests** - `*.test.ts` in `tests/unit/`
- **Integration tests** - `*.spec.ts` in `tests/integration/`

## Structure

Tests mirror source structure:

```
tests/
├── features/
│   ├── chat/
│   │   ├── agent/Agent.test.ts
│   │   └── commands/ChatCommand.test.ts
│   └── teams/
│       └── api/TeamsAPIClient.test.ts
└── shared/
    ├── platform/
    │   └── FileSystemAdapter.test.ts
    └── config/
        └── ConfigLoader.test.ts
```

## Pattern: Arrange-Act-Assert

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('FeatureName', () => {
  let service: MyService;
  let mockFs: IFileSystem;

  beforeEach(() => {
    // Arrange - Set up test dependencies
    mockFs = createMockFileSystem();
    service = new MyService(mockFs);
  });

  it('should handle specific scenario', async () => {
    // Arrange - Prepare test data
    const input = { foo: 'bar' };

    // Act - Execute the code under test
    const result = await service.process(input);

    // Assert - Verify expectations
    expect(result.success).toBe(true);
    expect(mockFs.writeFile).toHaveBeenCalledWith('/path', 'content');
  });
});
```

## Mocking

### File System

```typescript
import { createMockFileSystem } from '../mocks/MockFileSystem';

const mockFs = createMockFileSystem({
  '/config.yml': 'provider: anthropic',
  '/data.json': '{"key": "value"}',
});

mockFs.readFile('/config.yml'); // Returns 'provider: anthropic'
```

### Process Executor

```typescript
import { createMockProcessExecutor } from '../mocks/MockProcessExecutor';

const mockExec = createMockProcessExecutor({
  'git status': { stdout: 'On branch main', exitCode: 0 },
});
```

### HTTP Requests (MSW)

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      content: [{ type: 'text', text: 'Response' }],
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Docker (Testcontainers)

```typescript
import { GenericContainer } from 'testcontainers';

it('should run code in docker', async () => {
  const container = await new GenericContainer('mimir-sandbox')
    .withExposedPorts(8080)
    .start();

  // Run tests against container

  await container.stop();
});
```

## Best Practices

1. **Test behavior, not implementation** - Test what code does, not how
2. **One assertion per test** - Keep tests focused (prefer multiple small tests)
3. **Descriptive names** - `should throw error when file not found`
4. **Mock external dependencies** - HTTP, filesystem, Docker, etc.
5. **Avoid test interdependence** - Each test runs independently
6. **Fast execution** - Unit tests < 1s, integration tests < 10s
7. **Deterministic** - Tests always pass/fail consistently

## Coverage Targets

- **Overall**: 80%+ (85%+ for v1.0)
- **Critical paths**: 95%+ (security, permission system, data integrity)
- **UI components**: 60%+ (harder to test terminal UI)
- **Utils**: 90%+

## Running Tests

```bash
yarn test              # Run all tests
yarn test:unit         # Unit tests only
yarn test:integration  # Integration tests only
yarn test:watch        # Watch mode
yarn test:coverage     # Coverage report
```

## CI/CD Integration

Tests run on:
- Every commit (pre-commit hook)
- Pull requests (GitHub Actions)
- Main branch (GitHub Actions)

Fail conditions:
- Any test failure
- Coverage below threshold
- Linting errors
- Type errors

## Common Patterns

### Testing Async Code

```typescript
it('should resolve promise', async () => {
  await expect(service.fetch()).resolves.toEqual({ data: 'value' });
});

it('should reject promise', async () => {
  await expect(service.fail()).rejects.toThrow('Error message');
});
```

### Testing Errors

```typescript
it('should throw specific error', () => {
  expect(() => service.validate(invalidInput)).toThrow(ValidationError);
  expect(() => service.validate(invalidInput)).toThrow('Invalid input');
});
```

### Testing Events

```typescript
it('should emit event', async () => {
  const handler = vi.fn();
  emitter.on('event', handler);

  await service.trigger();

  expect(handler).toHaveBeenCalledWith({ data: 'value' });
});
```

### Snapshot Testing (Use Sparingly)

```typescript
it('should match snapshot', () => {
  const output = renderer.render(component);
  expect(output).toMatchSnapshot();
});
```

## Feature Test Independence

Each feature's tests should:
- Run independently without other features
- Use feature-specific mocks
- Test only public APIs (via `index.ts`)
- Not rely on shared test state
