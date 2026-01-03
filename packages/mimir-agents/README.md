# @codedir/mimir-agents

**Platform-Agnostic Agent Orchestration Framework**

Pure TypeScript abstractions and business logic for AI agent orchestration. **Zero runtime dependencies** (except Zod).

---

## 🎯 Purpose

This package defines **WHAT** agents do, not **HOW** they do it. It contains:
- 🧠 Orchestration logic (WorkflowOrchestrator, TaskDecomposer)
- 📋 Platform interfaces (IExecutor, IFileSystem, ILLMProvider)
- 🔒 Security logic (PermissionManager, RiskAssessor)
- 🧩 Core types and schemas

**This package is NOT executable on its own.** It requires runtime implementations from `@codedir/mimir-agents-runtime`.

---

## 🏗️ Architecture

### The Two-Package System

```
┌─────────────────────────────────────┐
│ @codedir/mimir-agents               │  ← You are here
│ (Platform-Agnostic Core)            │
│                                     │
│ • Interfaces only                   │
│ • Business logic                    │
│ • Zero Node.js dependencies         │
│ • Works in any JS runtime           │
└─────────────────────────────────────┘
                 ↓
         Defines interfaces
                 ↓
┌─────────────────────────────────────┐
│ @codedir/mimir-agents-runtime       │
│ (Node.js Implementations)           │
│                                     │
│ • Implements all interfaces         │
│ • Uses Node.js APIs                 │
│ • Wraps external SDKs               │
│ • Provides concrete executors       │
└─────────────────────────────────────┘
```

### Why This Separation?

**Problem Solved:**
- ✅ Teams backend can use orchestration without CLI UI
- ✅ IDE extensions can use agent logic
- ✅ Future: Deno, Cloudflare Workers, Browser runtimes
- ✅ Clean architecture: business logic separated from infrastructure

**Key Principle:** This package answers "What should happen?" while `mimir-agents-runtime` answers "How does it happen?"

---

## 📦 What's Inside

### Core (`@codedir/mimir-agents/core`)
- `Agent` - Main agent with ReAct loop
- `AgentFactory` - Create agents with dependency injection
- `PermissionManager` - Security decision logic (no user prompts!)
- `RiskAssessor` - Command risk analysis
- `RoleRegistry` - Agent role definitions
- Core types and interfaces

### Execution (`@codedir/mimir-agents/execution`)
- `IExecutor` - Executor interface
- `ExecutorFactory` - Auto-detect and create executors
- Error types: `PermissionDeniedError`, `SecurityError`, `ExecutionError`

**Note:** Actual executor implementations (`NativeExecutor`, `DockerExecutor`) are in `mimir-agents-runtime`.

### Memory (`@codedir/mimir-agents/memory`)
- Context window management
- Conversation history
- Checkpoint system

### Orchestration (`@codedir/mimir-agents/orchestration`)
- `WorkflowOrchestrator` - Multi-agent coordination
- `TaskDecomposer` - Break tasks into subtasks
- Parallel/sequential execution strategies

### Tools (`@codedir/mimir-agents/tools`)
- `ToolRegistry` - Tool management
- Built-in tool definitions (interfaces only)

### MCP (`@codedir/mimir-agents/mcp`)
- Model Context Protocol integration (planned)

---

## 🚀 Installation

```bash
yarn add @codedir/mimir-agents
```

**Important:** You also need a runtime package:
```bash
yarn add @codedir/mimir-agents-runtime  # For Node.js
```

---

## 💡 Usage

### Basic Agent (Requires Runtime)

```typescript
import { Agent } from '@codedir/mimir-agents/core';
import { PermissionManager } from '@codedir/mimir-agents/core';
import type { IExecutor, ILLMProvider } from '@codedir/mimir-agents';

// Runtime implementations (from separate package)
import { AnthropicProvider } from '@codedir/mimir-agents-runtime/providers';
import { NativeExecutor } from '@codedir/mimir-agents-runtime/execution';
import { FileSystemAdapter } from '@codedir/mimir-agents-runtime/platform';

// Create LLM provider
const provider: ILLMProvider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5',
});

// Create permission manager
const permissionManager = new PermissionManager({
  allowlist: ['npm install', 'git status'],
  blocklist: ['rm -rf /'],
  acceptRiskLevel: 'medium',
  autoAccept: true,
});

// Create executor
const executor: IExecutor = new NativeExecutor(
  new FileSystemAdapter(),
  new ProcessExecutorAdapter(),
  permissionManager,
  { mode: 'native', projectDir: process.cwd() }
);

// Create agent (from this package)
const agent = new Agent(provider, executor, toolRegistry);

// Run agent
const result = await agent.execute('List files in current directory');
```

### Multi-Agent Orchestration

```typescript
import { WorkflowOrchestrator, TaskDecomposer } from '@codedir/mimir-agents/orchestration';
import { RoleRegistry } from '@codedir/mimir-agents/core';

const roleRegistry = new RoleRegistry();
const orchestrator = new WorkflowOrchestrator(
  roleRegistry,
  toolRegistry,
  provider,
  executor,
  { promptForApproval: true }
);

// Decompose task
const decomposer = new TaskDecomposer(provider, roleRegistry);
const plan = await decomposer.planWorkflow(
  'Refactor authentication system and add tests'
);

// Execute workflow
const result = await orchestrator.executeWorkflow(plan);
```

### Permission System

```typescript
import { PermissionManager, RiskAssessor } from '@codedir/mimir-agents/core';
import type { PermissionManagerConfig } from '@codedir/mimir-agents/core';

// Configuration (usually from config files)
const config: PermissionManagerConfig = {
  allowlist: ['npm test', 'git status'],
  blocklist: ['rm -rf /', 'format c:'],
  acceptRiskLevel: 'medium',
  autoAccept: true,
  auditLogger: {
    async log(entry) {
      console.log('Audit:', entry);
    }
  }
};

const permissionManager = new PermissionManager(config);

// Check permission (returns decision, doesn't prompt user!)
const result = await permissionManager.checkPermission({
  type: 'bash',
  command: 'npm install lodash',
  workingDir: '/project'
});

if (result.allowed) {
  console.log('Command allowed:', result.reason);
} else {
  console.log('Command denied:', result.reason);
  // CLI would prompt user here
}
```

---

## 🔒 Security Model

**PermissionManager** in this package:
- ✅ Assesses risk levels (low/medium/high/critical)
- ✅ Checks allowlist/blocklist patterns
- ✅ Returns decisions with reasons
- ✅ Logs to optional audit callback
- ❌ **Does NOT prompt users** (that's the CLI's job)

**Why?** This package can be used in non-interactive environments (Teams backend, automated workflows).

---

## 📁 Package Structure

```
packages/mimir-agents/
├── src/
│   ├── core/
│   │   ├── Agent.ts                    # Main agent implementation
│   │   ├── AgentFactory.ts             # Agent creation
│   │   ├── interfaces/
│   │   │   └── IAgent.ts               # Agent interface
│   │   ├── permissions/
│   │   │   ├── PermissionManager.ts    # Permission logic
│   │   │   ├── RiskAssessor.ts         # Risk assessment
│   │   │   └── types.ts                # Permission types
│   │   ├── roles/
│   │   │   └── RoleRegistry.ts         # Agent roles
│   │   └── types.ts                    # Core types
│   ├── execution/
│   │   ├── IExecutor.ts                # Executor interface
│   │   └── ExecutorFactory.ts          # Executor creation
│   ├── memory/
│   │   └── ...                         # Memory management
│   ├── orchestration/
│   │   ├── WorkflowOrchestrator.ts     # Multi-agent coordination
│   │   └── TaskDecomposer.ts           # Task planning
│   ├── tools/
│   │   └── ToolRegistry.ts             # Tool management
│   ├── mcp/
│   │   └── ...                         # MCP integration
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

## 🚨 Critical Rules

### 1. **NEVER import Node.js APIs directly**

```typescript
// ❌ BAD
import fs from 'node:fs';

// ✅ GOOD
import type { IFileSystem } from './shared/platform/IFileSystem';
```

### 2. **NEVER import external SDKs**

```typescript
// ❌ BAD
import Anthropic from '@anthropic-ai/sdk';

// ✅ GOOD
import type { ILLMProvider } from './providers/ILLMProvider';
```

### 3. **Define interfaces, not implementations**

```typescript
// ✅ GOOD - This package
export interface IExecutor {
  execute(command: string): Promise<ExecuteResult>;
}

// ❌ BAD - This belongs in mimir-agents-runtime
export class NativeExecutor implements IExecutor {
  execute(command: string) {
    return childProcess.exec(command); // Node.js API!
  }
}
```

### 4. **PermissionManager returns decisions, doesn't prompt**

```typescript
// ✅ GOOD - This package
const result = await permissionManager.checkPermission(request);
if (!result.allowed) {
  return result; // Return decision to caller
}

// ❌ BAD - CLI's responsibility
const result = await permissionManager.checkPermission(request);
if (!result.allowed) {
  const answer = await prompt('Allow command?'); // NO!
}
```

---

## 📚 Related Packages

- **[@codedir/mimir-agents-runtime](../mimir-agents-runtime/)** - Node.js implementations
- **[mimir](../../)** - CLI application (main package)

---

## 🎓 Architecture Philosophy

This package follows **Clean Architecture** principles:

1. **Core Domain Logic** (this package)
   - Business rules
   - Entity definitions
   - Use cases

2. **Infrastructure** (mimir-agents-runtime)
   - External APIs
   - Databases
   - File systems

3. **Interface Adapters** (mimir CLI)
   - Controllers
   - Presenters
   - UI components

**Dependency Rule:** Dependencies point inward. Core never depends on infrastructure.

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
