# Execution Integration Architecture

**Date**: 2025-12-28
**Status**: Architecture Analysis & Integration Plan
**Package**: `@codedir/mimir-agents` v0.1.0

---

## 🏗️ Current Architecture Overview

### Package Structure

```
packages/mimir-agents/
├── src/
│   ├── core/                    # Agent core (ReAct loop)
│   │   ├── Agent.ts             # Main agent implementation
│   │   ├── AgentFactory.ts      # Agent factory
│   │   ├── interfaces/          # IAgent interface
│   │   └── roles/               # Role system (RoleRegistry, EnforcementEngine)
│   │
│   ├── execution/               # ✨ NEW - Execution modes
│   │   ├── NativeExecutor.ts    # Local execution
│   │   ├── DevContainerExecutor.ts
│   │   ├── DockerExecutor.ts
│   │   ├── CloudExecutor.ts
│   │   ├── ExecutorFactory.ts   # Auto-detection & creation
│   │   ├── IExecutor.ts         # Executor interface
│   │   └── index.ts
│   │
│   ├── tools/                   # Tool system
│   │   ├── ToolRegistry.ts      # Tool manager
│   │   ├── BaseTool.ts          # Base tool class
│   │   ├── built-in/            # Built-in tools
│   │   │   ├── BashTool.ts      # ⚠️ Needs executor
│   │   │   ├── ReadFileTool.ts  # ⚠️ Needs executor
│   │   │   ├── WriteFileTool.ts # ⚠️ Needs executor
│   │   │   ├── GrepTool.ts
│   │   │   ├── GlobTool.ts
│   │   │   ├── DiffTool.ts
│   │   │   └── TodoTool.ts
│   │   ├── interfaces/
│   │   └── types.ts             # ToolContext, ToolResult
│   │
│   ├── memory/                  # Context & conversation memory
│   │   ├── managers/
│   │   │   ├── ContextManager.ts
│   │   │   └── SnapshotManager.ts
│   │   └── storage/
│   │       ├── LocalContextStorage.ts
│   │       ├── TeamsContextStorage.ts
│   │       └── HybridContextStorage.ts
│   │
│   ├── orchestration/           # Multi-agent orchestration
│   │   └── AgentOrchestrator.ts
│   │
│   ├── shared/                  # Shared infrastructure
│   │   └── platform/            # ✨ NEW - Platform abstractions
│   │       ├── IFileSystem.ts
│   │       ├── IProcessExecutor.ts
│   │       ├── IDockerClient.ts
│   │       └── index.ts
│   │
│   ├── modes/                   # Placeholder (future)
│   ├── mcp/                     # MCP integration (future)
│   └── index.ts                 # Main export
│
└── tests/
    └── unit/
        ├── execution/           # ✨ NEW - 101 tests
        │   ├── NativeExecutor.test.ts
        │   ├── DevContainerExecutor.test.ts
        │   ├── DockerExecutor.test.ts
        │   ├── CloudExecutor.test.ts
        │   └── ExecutorFactory.test.ts
        ├── core/
        ├── tools/
        └── memory/
```

---

## 🔌 Integration Points

### Current State: Tools Use Platform Abstractions

**Example: BashTool (before integration)**
```typescript
// src/tools/built-in/BashTool.ts
export class BashTool extends BaseTool {
  constructor(private executor: IProcessExecutor) {
    super({ ... });
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    // Direct use of platform abstraction
    const result = await this.executor.execute(command, { cwd, timeout });
    return this.success({ stdout, stderr, exitCode });
  }
}
```

**Problem**: Tools take `IProcessExecutor` directly, which only supports native execution.

---

### Target State: Tools Use IExecutor

**Proposed: BashTool (after integration)**
```typescript
// src/tools/built-in/BashTool.ts
import type { IExecutor } from '../../execution/IExecutor.js';

export class BashTool extends BaseTool {
  constructor(private executor: IExecutor) {
    super({ ... });
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    // Use executor (supports all modes: native, docker, cloud, etc.)
    const result = await this.executor.execute(command, { cwd, timeout });
    return this.success({ stdout, stderr, exitCode });
  }
}
```

**Benefit**: Tools now work with any executor (native, docker, cloud, etc.)

---

## 🎯 Integration Strategy

### Phase 1: Add Executor to ToolContext ✅ Recommended

**Approach**: Pass executor via ToolContext (least invasive)

**Change 1: Update ToolContext**
```typescript
// src/tools/types.ts
import type { IExecutor } from '../execution/IExecutor.js';

export interface ToolContext {
  conversationId?: string;
  agentId?: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  executor?: IExecutor;  // ✨ NEW - Optional for backward compatibility
  metadata?: Record<string, unknown>;
}
```

**Change 2: Update Tools to Use Executor from Context**
```typescript
// src/tools/built-in/BashTool.ts
export class BashTool extends BaseTool {
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const executor = context.executor;

    if (!executor) {
      return this.error('Executor not provided in context');
    }

    const result = await executor.execute(command, { cwd, timeout });
    return this.success({ stdout, stderr, exitCode });
  }
}
```

**Change 3: Agent Passes Executor via Context**
```typescript
// src/core/Agent.ts
export class Agent implements IAgent {
  constructor(
    config: AgentConfig,
    llm: ILLMProvider,
    toolRegistry: ToolRegistry,
    private executor: IExecutor  // ✨ NEW
  ) { ... }

  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    // ...
    const result = await this.toolRegistry.execute(action.tool, action.input || {}, {
      agentId: this.id,
      workingDirectory: this.executor.getCwd(),
      executor: this.executor,  // ✨ Pass executor to tools
    });
    // ...
  }
}
```

**Pros**:
- ✅ Non-breaking (executor is optional in ToolContext)
- ✅ Flexible (tools can use executor or not)
- ✅ Clean separation (tools don't need constructor changes)

**Cons**:
- ⚠️ Requires runtime check in tools (if executor not provided)
- ⚠️ Tools need to be updated to use context.executor

---

### Phase 2: Update Built-in Tools

**Tools that need IExecutor**:

1. **BashTool** - Execute commands via executor
   ```typescript
   const result = await context.executor.execute(command, { cwd, timeout });
   ```

2. **ReadFileTool** - Read files via executor
   ```typescript
   const content = await context.executor.readFile(filePath);
   ```

3. **WriteFileTool** - Write files via executor
   ```typescript
   await context.executor.writeFile(filePath, content);
   ```

4. **GrepTool** - Search files via executor
   ```typescript
   const files = await context.executor.listDir(dirPath);
   const content = await context.executor.readFile(file);
   ```

5. **GlobTool** - List files via executor
   ```typescript
   const files = await context.executor.listDir(dirPath);
   ```

6. **DiffTool** - Read files via executor
   ```typescript
   const contentA = await context.executor.readFile(fileA);
   const contentB = await context.executor.readFile(fileB);
   ```

**Tools that don't need IExecutor**:
- **TodoTool** - In-memory only (no file/process operations)

---

### Phase 3: CLI Integration

**Entry Point: Main CLI**
```typescript
// packages/mimir-cli/src/index.ts (future)
import { createExecutor } from '@codedir/mimir-agents/execution';
import { Agent } from '@codedir/mimir-agents';

async function main() {
  // Parse CLI args
  const args = parseArgs(process.argv);

  // Load config
  const config = await loadConfig(args.projectDir);

  // Create executor (auto-detect or explicit)
  const executor = await createExecutor(
    {
      mode: args.executionMode || config.execution?.mode || 'auto',
      projectDir: args.projectDir,
      ...config.execution,
    },
    {
      fs: new FileSystemAdapter(),
      process: new ProcessExecutorAdapter(),
      docker: new DockerClientAdapter(),
      teamsClient: config.teams ? new TeamsAPIClient(config.teams) : undefined,
      permissionManager: new PermissionManager(...),
    }
  );

  // Initialize executor
  await executor.initialize();

  // Create tools (pass executor via context, not constructor)
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new BashTool());      // No executor in constructor
  toolRegistry.register(new ReadFileTool());   // No executor in constructor
  toolRegistry.register(new WriteFileTool());  // No executor in constructor

  // Create agent (pass executor)
  const agent = new Agent(
    {
      name: 'Mimir',
      role: 'general',
      systemPrompt: config.systemPrompt,
    },
    llm,
    toolRegistry,
    executor  // ✨ NEW
  );

  // Run agent
  const result = await agent.execute(args.task, {
    executor,  // ✨ Passed to tools via context
  });

  // Cleanup executor
  await executor.cleanup();
}
```

**CLI Flags**:
```bash
# Auto-detect execution mode
mimir "run tests"

# Explicit mode
mimir --execution-mode=docker "run tests"
mimir --execution-mode=cloud "run tests"
mimir --execution-mode=native "run tests"

# Show available modes
mimir --list-modes
```

---

## 📦 Export Strategy

### Add Execution to Main Export

**Update: src/index.ts**
```typescript
// Main entry point - re-export all modules

// ... existing exports ...

// Execution exports ✨ NEW
export {
  NativeExecutor,
  DevContainerExecutor,
  DockerExecutor,
  CloudExecutor,
  ExecutorFactory,
  createExecutorFactory,
  createExecutor,
  EXECUTION_VERSION,
} from './execution/index.js';

export type {
  IExecutor,
  ExecutionMode,
  ExecutionConfig,
  ExecuteOptions,
  ExecuteResult,
  FileOptions,
  ExecutorFactoryDependencies,
  ExecutorDetectionResult,
  DockerConfig,
  CloudConfig,
} from './execution/index.js';

// Platform exports ✨ NEW
export type {
  IFileSystem,
  IProcessExecutor,
  IDockerClient,
} from './shared/platform/index.js';
```

---

## 🔄 Data Flow

### Before Integration (Current)

```
CLI
 └─> Agent
      └─> ToolRegistry
           └─> BashTool (IProcessExecutor)
                └─> ProcessExecutorAdapter
                     └─> Native process.exec()
```

**Problem**: Only supports native execution

---

### After Integration (Target)

```
CLI
 ├─> ExecutorFactory
 │    └─> Auto-detect mode
 │         └─> Create IExecutor (Native/DevContainer/Docker/Cloud)
 │
 └─> Agent (receives IExecutor)
      └─> ToolRegistry
           └─> BashTool (no dependencies)
                └─> context.executor.execute()
                     ├─> NativeExecutor (process.exec)
                     ├─> DevContainerExecutor (docker exec)
                     ├─> DockerExecutor (docker exec)
                     └─> CloudExecutor (Teams API)
```

**Benefit**: All tools work with all execution modes

---

## 🎯 Migration Path

### Step 1: Add Executor to ToolContext ✅

**Files to modify**:
1. `src/tools/types.ts` - Add `executor?: IExecutor`
2. `src/core/Agent.ts` - Accept IExecutor, pass via context
3. `src/index.ts` - Export execution module

**Backward Compatible**: Yes (executor is optional)

---

### Step 2: Update Built-in Tools

**Files to modify**:
1. `src/tools/built-in/BashTool.ts`
2. `src/tools/built-in/ReadFileTool.ts`
3. `src/tools/built-in/WriteFileTool.ts`
4. `src/tools/built-in/GrepTool.ts`
5. `src/tools/built-in/GlobTool.ts`
6. `src/tools/built-in/DiffTool.ts`

**Pattern**:
```typescript
async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  if (!context.executor) {
    return this.error('Executor not available');
  }

  // Use context.executor instead of this.executor
  const result = await context.executor.execute(...);
  return this.success(result);
}
```

---

### Step 3: CLI Integration

**Create**: `packages/mimir-cli/src/index.ts`

**Features**:
- Create executor via ExecutorFactory
- Pass executor to Agent
- Handle cleanup on exit
- Show available modes (--list-modes)
- Allow mode override (--execution-mode)

---

### Step 4: Tests

**Add Integration Tests**:
1. `tests/integration/agent-with-executor.spec.ts`
   - Test Agent + NativeExecutor
   - Test Agent + DockerExecutor
   - Test Agent + CloudExecutor

2. `tests/integration/tools-with-executor.spec.ts`
   - Test BashTool with different executors
   - Test file tools with different executors

---

## 🏗️ Architecture Benefits

### Separation of Concerns

**Executor Layer** (How to execute):
- Native (instant, local)
- DevContainer (team-shared environment)
- Docker (isolated, ephemeral)
- Cloud (enterprise, audit logs)

**Tool Layer** (What to execute):
- BashTool (run commands)
- ReadFileTool (read files)
- WriteFileTool (write files)
- etc.

**Agent Layer** (Why to execute):
- ReAct loop (reason, act, observe)
- Tool selection
- Task planning

---

### Polymorphism

**All executors implement IExecutor**:
```typescript
interface IExecutor {
  initialize(): Promise<void>;
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;
  readFile(filePath: string, options?: FileOptions): Promise<string>;
  writeFile(filePath: string, content: string, options?: FileOptions): Promise<void>;
  cleanup(): Promise<void>;
  getMode(): ExecutionMode;
}
```

**Tools are mode-agnostic**:
```typescript
// Same tool code works with ANY executor
const result = await context.executor.execute('npm test');

// Works with:
// - NativeExecutor (local)
// - DevContainerExecutor (.devcontainer)
// - DockerExecutor (Dockerfile)
// - CloudExecutor (Teams VM)
```

---

### Testability

**Mock executors in tests**:
```typescript
const mockExecutor: IExecutor = {
  execute: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  // ...
};

const tool = new BashTool();
const result = await tool.execute({ command: 'ls' }, { executor: mockExecutor });

expect(mockExecutor.execute).toHaveBeenCalledWith('ls', { ... });
```

---

## 🎯 Next Steps

### Immediate (Required for Integration)

1. **Add executor to ToolContext** ✅ Priority 1
   - Modify `src/tools/types.ts`
   - Modify `src/core/Agent.ts`
   - Export execution module in `src/index.ts`

2. **Update built-in tools** ✅ Priority 2
   - BashTool, ReadFileTool, WriteFileTool (critical)
   - GrepTool, GlobTool, DiffTool (nice-to-have)

3. **Add integration tests** ✅ Priority 3
   - Agent + Executor integration
   - Tools + Executor integration

### Future (CLI Package)

4. **Create CLI package** (separate package)
   - `packages/mimir-cli/`
   - Entry point with ExecutorFactory
   - CLI argument parsing
   - Config loading

5. **Create platform adapters** (separate package or CLI)
   - `packages/mimir-platform/` or in CLI
   - FileSystemAdapter (IFileSystem impl)
   - ProcessExecutorAdapter (IProcessExecutor impl)
   - DockerClientAdapter (IDockerClient impl)

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                            │
│  - Arg parsing                                              │
│  - Config loading                                           │
│  - Executor creation (ExecutorFactory)                      │
│  - Agent initialization                                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Layer                             │
│  - ReAct loop (reason → act → observe)                      │
│  - Tool selection                                           │
│  - Context management                                       │
│  - Receives: IExecutor, ToolRegistry, LLMProvider          │
│  - Passes: context.executor to tools                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      Tool Layer                             │
│  - BashTool, ReadFileTool, WriteFileTool, etc.             │
│  - Uses: context.executor (IExecutor interface)            │
│  - Mode-agnostic (works with any executor)                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Execution Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐        │
│  │   Native    │  │ DevContainer │  │   Docker   │  ...   │
│  │  Executor   │  │   Executor   │  │  Executor  │        │
│  └─────────────┘  └──────────────┘  └────────────┘        │
│                                                             │
│  All implement IExecutor interface                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Platform Layer                            │
│  - IFileSystem, IProcessExecutor, IDockerClient            │
│  - Platform adapters (OS-specific implementations)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎉 Summary

### Current Architecture
- ✅ Execution module implemented (5 executors + factory)
- ✅ 556/556 tests passing
- ✅ Platform abstractions defined
- ⚠️ NOT YET integrated with Agent/Tools

### Integration Plan
1. Add `executor?: IExecutor` to ToolContext
2. Update Agent to pass executor via context
3. Update tools to use `context.executor`
4. Export execution module
5. Add integration tests

### Final State
- Tools work with ANY executor (native, docker, cloud, etc.)
- Agent is execution-mode agnostic
- CLI controls execution mode via config/flags
- Clean separation of concerns (what vs how vs why)

**Status**: ✅ Execution implementation complete, ready for integration
**Next**: Integrate with Agent and Tools (3 file changes)
