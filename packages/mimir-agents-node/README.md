# @codedir/mimir-agents-runtime

**Node.js Runtime Implementations for Mimir Agents**

Concrete implementations of all interfaces defined in `@codedir/mimir-agents`. This package makes agents executable in Node.js environments.

---

## 🎯 Purpose

This package provides **HOW** agents execute, implementing all platform abstractions defined in `@codedir/mimir-agents`.

**Key Principle:** This package answers "How does it happen?" while `@codedir/mimir-agents` answers "What should happen?"

---

## 🏗️ Architecture

### The Two-Package System

```
┌─────────────────────────────────────┐
│ @codedir/mimir-agents               │
│ (Platform-Agnostic Core)            │
│                                     │
│ • Defines interfaces                │
│ • Business logic                    │
│ • Zero Node.js dependencies         │
└─────────────────────────────────────┘
                 ↑
         Implements interfaces
                 ↑
┌─────────────────────────────────────┐
│ @codedir/mimir-agents-runtime       │  ← You are here
│ (Node.js Implementations)           │
│                                     │
│ • Implements IExecutor              │
│ • Implements ILLMProvider           │
│ • Implements IFileSystem            │
│ • Wraps external SDKs               │
└─────────────────────────────────────┘
```

### Why This Separation?

**Problem Solved:**
- ✅ Core package stays platform-agnostic (can run in Deno, browser, etc.)
- ✅ All Node.js-specific code isolated here
- ✅ External SDK dependencies (Anthropic, OpenAI) only in this package
- ✅ Easy to create `mimir-agents-runtime-deno`, `mimir-agents-runtime-cloudflare`

---

## 📦 What's Inside

### Platform Adapters (`@codedir/mimir-agents-runtime/platform`)

**Implements:** `IFileSystem`, `IProcessExecutor`, `IDockerClient`

- `FileSystemAdapter` - Wraps Node.js `fs` module
- `ProcessExecutorAdapter` - Wraps `child_process` for command execution
- `DockerClient` - Wraps `dockerode` for Docker operations

**Example:**
```typescript
import { FileSystemAdapter } from '@codedir/mimir-agents-runtime/platform';

const fs = new FileSystemAdapter();
const content = await fs.readFile('/path/to/file', 'utf-8');
```

---

### LLM Providers (`@codedir/mimir-agents-runtime/providers`)

**Implements:** `ILLMProvider`

- `AnthropicProvider` - Claude integration via `@anthropic-ai/sdk`
- `DeepSeekProvider` - DeepSeek integration
- `OpenAIProvider` - OpenAI/GPT integration (planned)
- `GeminiProvider` - Google Gemini integration (planned)
- `OllamaProvider` - Local model integration (planned)

**Example:**
```typescript
import { AnthropicProvider } from '@codedir/mimir-agents-runtime/providers';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5',
  temperature: 0.7,
});

const response = await provider.chat(messages);
```

---

### Storage (`@codedir/mimir-agents-runtime/storage`)

**Implements:** `IStorageBackend`

- `SQLiteBackend` - Local storage via `better-sqlite3`
- `PostgreSQLBackend` - Teams backend storage (planned)

**Example:**
```typescript
import { SQLiteBackend } from '@codedir/mimir-agents-runtime/storage';

const storage = new SQLiteBackend({
  path: '.mimir/mimir.db',
});

await storage.saveConversation(conversation);
```

---

### Executors (`@codedir/mimir-agents-runtime/execution`)

**Implements:** `IExecutor`

- `NativeExecutor` - Direct execution on host machine
- `DockerExecutor` - Execution in ephemeral Docker containers
- `DevContainerExecutor` - Execution in dev containers
- `CloudExecutor` - Execution in Teams cloud VMs

**Example:**
```typescript
import { NativeExecutor } from '@codedir/mimir-agents-runtime/execution';
import { FileSystemAdapter, ProcessExecutorAdapter } from '@codedir/mimir-agents-runtime/platform';
import { PermissionManager } from '@codedir/mimir-agents/core';

const executor = new NativeExecutor(
  new FileSystemAdapter(),
  new ProcessExecutorAdapter(),
  new PermissionManager(permissionConfig),
  { mode: 'native', projectDir: process.cwd() }
);

const result = await executor.execute('npm test');
```

---

## 🚀 Installation

```bash
yarn add @codedir/mimir-agents-runtime
```

**Important:** You also need the core package:
```bash
yarn add @codedir/mimir-agents
```

---

## 💡 Usage

### Complete Agent Setup

```typescript
// Core abstractions
import { Agent } from '@codedir/mimir-agents/core';
import { ToolRegistry } from '@codedir/mimir-agents/tools';
import { PermissionManager } from '@codedir/mimir-agents/core';

// Runtime implementations (this package)
import { AnthropicProvider } from '@codedir/mimir-agents-runtime/providers';
import { NativeExecutor } from '@codedir/mimir-agents-runtime/execution';
import { FileSystemAdapter, ProcessExecutorAdapter } from '@codedir/mimir-agents-runtime/platform';
import { SQLiteBackend } from '@codedir/mimir-agents-runtime/storage';

// 1. Create platform adapters
const fs = new FileSystemAdapter();
const processExecutor = new ProcessExecutorAdapter();

// 2. Create LLM provider
const llmProvider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-5',
});

// 3. Create permission manager
const permissionManager = new PermissionManager({
  allowlist: ['npm test', 'git status'],
  blocklist: ['rm -rf /'],
  acceptRiskLevel: 'medium',
  autoAccept: true,
});

// 4. Create executor
const executor = new NativeExecutor(
  fs,
  processExecutor,
  permissionManager,
  { mode: 'native', projectDir: process.cwd() }
);

// 5. Create tool registry
const toolRegistry = new ToolRegistry();

// 6. Create storage
const storage = new SQLiteBackend({
  path: '.mimir/mimir.db',
});

// 7. Create agent (core logic from mimir-agents)
const agent = new Agent(
  llmProvider,
  executor,
  toolRegistry,
  storage
);

// 8. Execute
const result = await agent.execute('Write tests for the auth module');
```

---

## 📁 Package Structure

```
packages/mimir-agents-runtime/
├── src/
│   ├── platform/
│   │   ├── FileSystemAdapter.ts        # Node.js fs wrapper
│   │   ├── ProcessExecutorAdapter.ts   # child_process wrapper
│   │   └── DockerClient.ts             # dockerode wrapper
│   ├── providers/
│   │   ├── AnthropicProvider.ts        # Claude integration
│   │   ├── DeepSeekProvider.ts         # DeepSeek integration
│   │   └── BaseLLMProvider.ts          # Base provider class
│   ├── storage/
│   │   ├── SQLiteBackend.ts            # SQLite storage
│   │   └── PostgreSQLBackend.ts        # PostgreSQL (Teams)
│   ├── execution/
│   │   ├── NativeExecutor.ts           # Host execution
│   │   ├── DockerExecutor.ts           # Docker execution
│   │   ├── DevContainerExecutor.ts     # Dev container execution
│   │   └── CloudExecutor.ts            # Cloud VM execution
│   └── index.ts                        # Main entry
├── dist/                               # Build output
├── tests/                              # Tests
├── package.json
├── tsconfig.json
└── README.md                           # You are here
```

---

## 🧪 Development

### Build

```bash
yarn build
```

### Tests

```bash
yarn test              # Run all tests
yarn test:unit         # Unit tests only
yarn test:integration  # Integration tests only
yarn test:coverage     # With coverage report
```

### Linting & Formatting

```bash
yarn lint              # ESLint
yarn lint:fix          # Auto-fix issues
yarn format            # Prettier
yarn typecheck         # TypeScript check (no emit)
```

---

## 🔌 Implementing Custom Providers

Want to add a new LLM provider? Implement `ILLMProvider`:

```typescript
import type { ILLMProvider, Message } from '@codedir/mimir-agents';

export class CustomProvider implements ILLMProvider {
  async chat(messages: Message[]): Promise<Message> {
    // Your implementation
  }

  async streamChat(
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<Message> {
    // Your implementation
  }

  countTokens(text: string): number {
    // Your implementation
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    // Your implementation
  }
}
```

---

## 🔒 Security Considerations

### FileSystemAdapter

- ✅ Uses Node.js path sanitization
- ✅ Respects permission boundaries from PermissionManager
- ✅ Validates paths to prevent directory traversal

### ProcessExecutorAdapter

- ✅ Uses `execa` for secure command execution
- ✅ No shell injection vulnerabilities
- ✅ Timeout protection
- ✅ All commands checked by PermissionManager first

### DockerClient

- ✅ Isolates execution from host
- ✅ Network restrictions configurable
- ✅ Resource limits (CPU, memory)
- ✅ Capability dropping (runs with minimal privileges)

---

## 🚨 Critical Rules

### 1. **Always implement core interfaces**

```typescript
// ✅ GOOD
import type { IFileSystem } from '@codedir/mimir-agents';

export class FileSystemAdapter implements IFileSystem {
  // Implementation
}

// ❌ BAD
export class FileSystemAdapter {
  // No interface = not compatible with core package
}
```

### 2. **Never import core implementations**

```typescript
// ❌ BAD - Core defines interfaces, we implement them
import { NativeExecutor } from '@codedir/mimir-agents/execution';

// ✅ GOOD - Import interface types only
import type { IExecutor } from '@codedir/mimir-agents';
```

### 3. **All external SDKs go here**

```typescript
// ✅ GOOD - This package
import Anthropic from '@anthropic-ai/sdk';

// ❌ BAD - Core package must NOT import SDKs
// (in mimir-agents package)
import Anthropic from '@anthropic-ai/sdk'; // NEVER!
```

---

## 📚 Related Packages

- **[@codedir/mimir-agents](../mimir-agents/)** - Platform-agnostic core
- **[mimir](../../)** - CLI application (main package)

---

## 🎓 Design Philosophy

This package follows the **Dependency Inversion Principle**:

1. **Core package** (`mimir-agents`) defines abstractions
2. **This package** (`mimir-agents-runtime`) provides concrete implementations
3. **CLI** (`mimir`) depends on abstractions, receives implementations via DI

**Why?**
- ✅ Core business logic testable without real I/O
- ✅ Easy to swap implementations (SQLite → PostgreSQL)
- ✅ Platform-specific code isolated
- ✅ Clear boundaries and responsibilities

---

## 🌍 Future Runtime Packages

- `@codedir/mimir-agents-runtime-deno` - Deno implementations
- `@codedir/mimir-agents-runtime-cloudflare` - Cloudflare Workers
- `@codedir/mimir-agents-runtime-browser` - Browser-based execution

---

## 📄 License

AGPL-3.0

## 👥 Author

Codedir Labs

---

## 🔗 Links

- [Main Repository](../../)
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
- [Architecture Docs](../../docs/pages/contributing/)
- [Core Package](../mimir-agents/) - Platform-agnostic abstractions
