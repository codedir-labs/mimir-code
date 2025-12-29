# Package Architecture

**Last Updated:** 2025-12-28

This document explains the **two-package architecture** and why it's critical to maintain the separation.

---

## The Problem

Originally, Mimir was a single monolithic package:

```
mimir/
├── src/
│   ├── core/               # Business logic
│   ├── platform/           # Node.js adapters
│   ├── providers/          # LLM SDKs
│   ├── storage/            # SQLite
│   └── cli/                # UI
```

**Issues:**
1. ❌ Teams backend couldn't use orchestration without importing CLI UI
2. ❌ IDE extensions couldn't use agent logic
3. ❌ Impossible to run in Deno, Cloudflare Workers, or Browser
4. ❌ Testing required mocking Node.js APIs
5. ❌ Business logic coupled to infrastructure

---

## The Solution: Two Packages

### Package 1: `@codedir/mimir-agents` (Platform-Agnostic Core)

**Location:** `packages/mimir-agents/`

**Contains:**
- 🧠 Business logic (Agent, WorkflowOrchestrator, TaskDecomposer)
- 📋 Interface definitions (IExecutor, IFileSystem, ILLMProvider)
- 🔒 Security logic (PermissionManager, RiskAssessor)
- 🧩 Core types and schemas
- 📚 Memory and context management

**Dependencies:** **ONLY** `zod` for validation

**Rules:**
- ✅ Can define interfaces
- ✅ Can have business logic
- ✅ Can use Zod for validation
- ❌ **NEVER** import Node.js APIs (`fs`, `child_process`, `path`)
- ❌ **NEVER** import external SDKs (`@anthropic-ai/sdk`, `dockerode`)
- ❌ **NEVER** implement platform-specific code

**Mental Model:** This package answers **"WHAT should happen?"**

---

### Package 2: `@codedir/mimir-agents-runtime` (Node.js Implementations)

**Location:** `packages/mimir-agents-runtime/`

**Contains:**
- 💾 Platform adapters (FileSystemAdapter, ProcessExecutorAdapter)
- 🐳 Docker client (wraps `dockerode`)
- 🤖 LLM providers (AnthropicProvider, DeepSeekProvider)
- 🗄️ Storage backends (SQLiteBackend)
- ⚙️ Executors (NativeExecutor, DockerExecutor, etc.)

**Dependencies:** All Node.js APIs, external SDKs, database libraries

**Rules:**
- ✅ Can import from `@codedir/mimir-agents` (interfaces only)
- ✅ Can use Node.js APIs
- ✅ Can use external SDKs
- ✅ Must implement interfaces from core package
- ❌ **NEVER** import core implementations (only types)

**Mental Model:** This package answers **"HOW does it happen?"**

---

## Dependency Graph

```
┌─────────────────────────────────────┐
│ @codedir/mimir-agents               │
│ (Core Package)                      │
│                                     │
│ Exports:                            │
│ - IExecutor (interface)             │
│ - ILLMProvider (interface)          │
│ - PermissionManager (business logic)│
│                                     │
│ Dependencies: zod only              │
└─────────────────────────────────────┘
                 ↑
                 │
         Implements interfaces
                 │
                 │
┌─────────────────────────────────────┐
│ @codedir/mimir-agents-runtime       │
│ (Runtime Package)                   │
│                                     │
│ Exports:                            │
│ - NativeExecutor (IExecutor impl)   │
│ - AnthropicProvider (ILLMProvider)  │
│ - FileSystemAdapter (IFileSystem)   │
│                                     │
│ Dependencies:                       │
│ - @codedir/mimir-agents (types)     │
│ - @anthropic-ai/sdk                 │
│ - dockerode                         │
│ - better-sqlite3                    │
└─────────────────────────────────────┘
                 ↑
                 │
         Uses both packages
                 │
                 │
┌─────────────────────────────────────┐
│ mimir (CLI)                         │
│                                     │
│ Uses:                               │
│ - Agent (from core)                 │
│ - AnthropicProvider (from runtime)  │
│ - NativeExecutor (from runtime)     │
│                                     │
│ Adds: UI, config loading, prompts  │
└─────────────────────────────────────┘
```

**Critical Rule:** Dependencies flow **downward only**.

- ✅ Runtime → Core (implements interfaces)
- ✅ CLI → Both packages (composes them)
- ❌ Core → Runtime (NEVER!)

---

## Real-World Example

### ❌ Before: Monolithic (BAD)

```typescript
// mimir/src/core/Agent.ts
import fs from 'node:fs';  // ❌ Direct Node.js API
import Anthropic from '@anthropic-ai/sdk';  // ❌ External SDK

export class Agent {
  async execute(command: string) {
    // Tightly coupled to Node.js
    const result = fs.readFileSync('file.txt');

    // Tightly coupled to Anthropic SDK
    const client = new Anthropic({ apiKey: 'key' });
    const response = await client.messages.create({...});

    return result;
  }
}
```

**Problems:**
- Can't run in Deno (no Node.js `fs`)
- Can't test without file system
- Can't swap Anthropic for DeepSeek
- Teams backend imports Anthropic even if using different provider

---

### ✅ After: Two-Package (GOOD)

**Core Package:**
```typescript
// @codedir/mimir-agents/core/Agent.ts
import type { IFileSystem } from '../platform/IFileSystem';
import type { ILLMProvider } from '../providers/ILLMProvider';

export class Agent {
  constructor(
    private llmProvider: ILLMProvider,
    private fileSystem: IFileSystem
  ) {}

  async execute(command: string) {
    // Uses abstraction, not implementation
    const result = await this.fileSystem.readFile('file.txt');

    // Uses abstraction, not specific SDK
    const response = await this.llmProvider.chat([...]);

    return result;
  }
}
```

**Runtime Package:**
```typescript
// @codedir/mimir-agents-runtime/platform/FileSystemAdapter.ts
import fs from 'node:fs/promises';
import type { IFileSystem } from '@codedir/mimir-agents';

export class FileSystemAdapter implements IFileSystem {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }
}

// @codedir/mimir-agents-runtime/providers/AnthropicProvider.ts
import Anthropic from '@anthropic-ai/sdk';
import type { ILLMProvider } from '@codedir/mimir-agents';

export class AnthropicProvider implements ILLMProvider {
  private client: Anthropic;

  constructor(config: { apiKey: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async chat(messages: Message[]): Promise<Message> {
    const response = await this.client.messages.create({...});
    return { role: 'assistant', content: response.content };
  }
}
```

**CLI Usage:**
```typescript
// mimir/src/cli.ts
import { Agent } from '@codedir/mimir-agents/core';
import { AnthropicProvider } from '@codedir/mimir-agents-runtime/providers';
import { FileSystemAdapter } from '@codedir/mimir-agents-runtime/platform';

const agent = new Agent(
  new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  new FileSystemAdapter()
);

await agent.execute('List files');
```

**Benefits:**
- ✅ Can test `Agent` with mock implementations
- ✅ Can swap `AnthropicProvider` for `DeepSeekProvider`
- ✅ Can create `DenoFileSystemAdapter` for Deno runtime
- ✅ Teams backend only imports what it needs

---

## When to Use Which Package?

### Working on `@codedir/mimir-agents`

**When:**
- Implementing orchestration logic
- Defining new interfaces
- Adding business rules
- Updating security logic
- Working on context management

**Examples:**
- Adding a new agent mode
- Improving task decomposition
- Enhancing permission rules
- Optimizing memory management

**Remember:** If you need Node.js APIs, you're in the wrong package!

---

### Working on `@codedir/mimir-agents-runtime`

**When:**
- Adding new LLM provider
- Implementing new executor
- Creating platform adapter
- Integrating external service

**Examples:**
- Adding OpenAI provider
- Implementing Cloudflare Workers executor
- Creating PostgreSQL storage backend
- Wrapping new Docker API

**Remember:** Always implement an interface from core package!

---

## Testing Strategy

### Core Package Tests

```typescript
// @codedir/mimir-agents/tests/core/Agent.test.ts
import { Agent } from '@codedir/mimir-agents/core';
import type { ILLMProvider, IFileSystem } from '@codedir/mimir-agents';

// Mock implementations (no real I/O)
class MockLLMProvider implements ILLMProvider {
  async chat() { return { role: 'assistant', content: 'mocked' }; }
}

class MockFileSystem implements IFileSystem {
  async readFile() { return 'mocked content'; }
}

test('agent executes task', async () => {
  const agent = new Agent(
    new MockLLMProvider(),
    new MockFileSystem()
  );

  const result = await agent.execute('test');
  expect(result).toBeDefined();
});
```

**Benefits:**
- ✅ Pure unit tests (no I/O)
- ✅ Fast (no network, no disk)
- ✅ Deterministic (no external dependencies)

---

### Runtime Package Tests

```typescript
// @codedir/mimir-agents-runtime/tests/platform/FileSystemAdapter.test.ts
import { FileSystemAdapter } from '@codedir/mimir-agents-runtime/platform';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('reads actual file', async () => {
  const adapter = new FileSystemAdapter();
  const tempFile = join(tmpdir(), 'test.txt');

  await fs.writeFile(tempFile, 'test content');

  const result = await adapter.readFile(tempFile);
  expect(result).toBe('test content');

  await fs.unlink(tempFile);
});
```

**Benefits:**
- ✅ Integration tests (real I/O)
- ✅ Verify actual behavior
- ✅ Catch platform-specific issues

---

## Migration Path

Currently, implementations are in CLI (`src/shared/*`). We need to:

### Phase 1: Move Executors (DONE ✅)
- ✅ Moved `NativeExecutor`, `DockerExecutor`, etc. to `mimir-agents`
- ✅ Moved `PermissionManager`, `RiskAssessor` to `mimir-agents/core`
- ✅ Updated imports in CLI

### Phase 2: Create Runtime Package (TODO)
1. Create `packages/mimir-agents-runtime/` structure
2. Move platform adapters from `src/shared/platform/`
3. Move LLM providers from `src/shared/providers/`
4. Move storage from `src/shared/storage/`
5. Move executors from `mimir-agents/execution/` (implementations only)
6. Update CLI imports
7. Update tests

### Phase 3: Extract Interfaces (TODO)
1. Keep interfaces in `mimir-agents`
2. Move implementations to `mimir-agents-runtime`
3. Ensure zero Node.js dependencies in core

---

## Common Mistakes

### ❌ Mistake 1: Importing Node.js in Core

```typescript
// @codedir/mimir-agents/core/Agent.ts
import path from 'node:path';  // ❌ NO!

export class Agent {
  getProjectPath() {
    return path.join(__dirname, 'project');  // ❌ Breaks in non-Node environments
  }
}
```

**Fix:**
```typescript
// @codedir/mimir-agents/core/Agent.ts
export class Agent {
  constructor(private projectDir: string) {}  // ✅ Injected

  getProjectPath() {
    return this.projectDir;  // ✅ No platform-specific code
  }
}
```

---

### ❌ Mistake 2: Core Implementing Instead of Defining

```typescript
// @codedir/mimir-agents/execution/NativeExecutor.ts
import { exec } from 'node:child_process';  // ❌ Implementation in core!

export class NativeExecutor implements IExecutor {
  async execute(cmd: string) {
    return exec(cmd);  // ❌ Uses Node.js API
  }
}
```

**Fix:** Move to runtime package!
```typescript
// @codedir/mimir-agents/execution/IExecutor.ts
export interface IExecutor {
  execute(cmd: string): Promise<ExecuteResult>;
}

// @codedir/mimir-agents-runtime/execution/NativeExecutor.ts
import { exec } from 'node:child_process';  // ✅ OK in runtime package!

export class NativeExecutor implements IExecutor {
  async execute(cmd: string) {
    return exec(cmd);  // ✅ Implementation belongs here
  }
}
```

---

### ❌ Mistake 3: Runtime Importing Core Implementations

```typescript
// @codedir/mimir-agents-runtime/execution/DockerExecutor.ts
import { PermissionManager } from '@codedir/mimir-agents/core';  // ❌ Importing implementation

export class DockerExecutor {
  private permissionManager: PermissionManager;  // ❌ Concrete class
}
```

**Fix:**
```typescript
// @codedir/mimir-agents-runtime/execution/DockerExecutor.ts
import type { IPermissionManager } from '@codedir/mimir-agents';  // ✅ Type import only

export class DockerExecutor {
  constructor(
    private permissionManager: IPermissionManager  // ✅ Interface, not implementation
  ) {}
}
```

---

## Future: Multiple Runtimes

With this architecture, we can create:

### `@codedir/mimir-agents-runtime-deno`
```typescript
// Deno implementations
import { IFileSystem } from '@codedir/mimir-agents';

export class DenoFileSystemAdapter implements IFileSystem {
  async readFile(path: string): Promise<string> {
    return await Deno.readTextFile(path);  // Deno API
  }
}
```

### `@codedir/mimir-agents-runtime-cloudflare`
```typescript
// Cloudflare Workers implementations
import { IStorageBackend } from '@codedir/mimir-agents';

export class KVStorageBackend implements IStorageBackend {
  async save(key: string, value: any): Promise<void> {
    await NAMESPACE.put(key, JSON.stringify(value));  // KV API
  }
}
```

### `@codedir/mimir-agents-runtime-browser`
```typescript
// Browser implementations
import { IStorageBackend } from '@codedir/mimir-agents';

export class IndexedDBBackend implements IStorageBackend {
  async save(key: string, value: any): Promise<void> {
    // IndexedDB API
  }
}
```

**Same core package, different runtime packages!** 🎉

---

## Summary

### The Golden Rule

> **Interfaces live in `mimir-agents`, implementations live in `mimir-agents-runtime`.**

### Quick Reference

| Task | Package | Allowed |
|------|---------|---------|
| Define interface | `mimir-agents` | ✅ |
| Implement interface | `mimir-agents-runtime` | ✅ |
| Use Node.js APIs | `mimir-agents-runtime` | ✅ |
| Use Node.js APIs | `mimir-agents` | ❌ |
| Import external SDKs | `mimir-agents-runtime` | ✅ |
| Import external SDKs | `mimir-agents` | ❌ |
| Business logic | `mimir-agents` | ✅ |
| Platform adapters | `mimir-agents-runtime` | ✅ |

---

## Questions?

- **"Where should `PermissionManager` live?"**
  → `mimir-agents/core` - It's business logic, not platform-specific

- **"Where should `FileSystemAdapter` live?"**
  → `mimir-agents-runtime/platform` - It uses Node.js `fs`

- **"Where should `IFileSystem` interface live?"**
  → `mimir-agents/platform` - It's an abstraction

- **"Can core package import from runtime?"**
  → **NO!** Only types for dependency injection

- **"Can runtime package import from core?"**
  → **YES!** But only type imports (interfaces)

---

**Last Updated:** 2025-12-28
**Status:** Phase 1 complete, Phase 2 in progress
