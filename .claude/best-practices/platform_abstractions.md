# Platform Abstraction Layer

**CRITICAL**: All platform-specific operations MUST use abstraction interfaces.

## Abstractions

- **IFileSystem** (`src/shared/platform/`) - File operations (fs/promises + globby)
- **IProcessExecutor** (`src/shared/platform/`) - Command execution (execa)
- **IDockerClient** (`src/shared/platform/`) - Docker management (dockerode)

## Rules

### 1. File Operations

❌ **NEVER** use Node.js `fs` directly:
```typescript
import fs from 'fs';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
```

✅ **ALWAYS** inject `IFileSystem`:
```typescript
constructor(private fs: IFileSystem) {}
await this.fs.readFile(path);
await this.fs.writeFile(path, content);
```

### 2. Synchronous Operations

❌ **NEVER** use sync methods:
- `existsSync()`, `mkdirSync()`, `readFileSync()`, `writeFileSync()`

✅ **ALWAYS** use async:
- `await this.fs.exists()`, `await this.fs.mkdir()`, `await this.fs.readFile()`

### 3. Process APIs

❌ **NEVER** use directly:
- `process.cwd()` - Pass as parameter from CLI entry point
- `process.exit()` - Throw errors instead; let CLI handle exit

✅ **ALLOWED**:
- `process.env` - Reading environment variables
- `process.exit()` - Only in signal handlers (SIGINT/SIGTERM) as last resort

### 4. Exceptions (Infrastructure Only)

- `logger.ts` - Uses sync fs in constructor (pre-platform layer)
- `Database.ts` - Uses async factory: `DatabaseManager.create()`
- Migration scripts - Build-time only, not runtime

### 5. Dependency Injection Pattern

Accept abstractions via constructor. For async initialization, use static factory:

```typescript
class MyService {
  constructor(private fs: IFileSystem) {}

  static async create(fs: IFileSystem, config: Config): Promise<MyService> {
    const service = new MyService(fs);
    await service.initialize(config);
    return service;
  }
}
```

## Why This Matters

Violations break:
- Cross-platform compatibility (Windows/Unix)
- Testability (mocking in tests)
- Docker sandbox isolation
