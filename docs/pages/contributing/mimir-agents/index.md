# Mimir Agents Package - Overview

**Package**: `@codedir/mimir-agents`
**Status**: Planning Phase
**Last Updated**: 2025-12-27

---

## What is mimir-agents?

`mimir-agents` is a **reusable, platform-agnostic agent framework** that powers Mimir CLI, web version, and future integrations. It provides single & multi-agent execution, specialized roles, context management, tool orchestration, and Teams enforcement.

### Key Features

✅ **Reusable**: Import into CLI, web, VS Code extension, etc.
✅ **Platform-agnostic**: Uses `IFileSystem`, `IProcessExecutor` abstractions
✅ **Vertically sliced**: Can be modular if needed
✅ **Cloud-ready**: Context syncs to Teams backend when authenticated
✅ **Isolated subagents**: Like Amp/Claude Code - main thread sees only final results
✅ **Checkpoint system**: Full filesystem snapshots for safe rewinding (like Replit)
✅ **Hybrid tools**: Direct calls + scripting for complex operations
✅ **MCP integration**: Model Context Protocol support
✅ **Mode system**: Plan, Act, Discuss modes
✅ **Auto-fix loops**: Configurable retry limits with severity-based escalation
✅ **Teams enforcement**: Allowed models, forced subagents

---

## Design Principles

### 1. **Isolation Over Shared Context**

**Subagents have isolated context windows** (like Amp, Claude Code):
- Main conversation sees only final results
- Debugging/iterations happen in subagent's space
- Keeps main thread clean and focused
- Better scalability and context management

### 2. **Vertical Slicing for Modularity**

Package is structured to be modular if needed:
```
@codedir/mimir-agents
├── /core          # Core agent, ReAct loop
├── /orchestration # Multi-agent orchestration
├── /modes         # Plan, Act, Discuss modes
├── /tools         # Tool integration + built-ins
├── /mcp           # MCP client integration
├── /memory        # Context management (local + cloud)
└── /roles         # Specialized agent roles
```

Future: Can split into `@codedir/mimir-tools`, `@codedir/mimir-mcp` if needed.

### 3. **Hybrid Context Management**

**Small data inline, large data as artifacts**:
- Messages: Task descriptions, summaries, final results
- Artifacts: File contents, search results, large outputs (stored separately with IDs)
- Storage: `.mimir/context/` (local) or Teams cloud (when authenticated)
- Abstractions: `IContextStorage` interface

See: [Context Management](./context-management.md)

### 4. **Checkpoint System for Safe Rewinding**

**Full filesystem snapshots (like Replit)**:
- Auto-snapshot before every agent execution
- Manual snapshots via `/checkpoint` command
- Per-conversation storage (not git-based, works for all users)
- Interactive timeline UI with agent-level detail
- Restore options: files-only, conversation-only, selective files
- 24-hour retention per conversation (configurable)
- Severity-based merge conflict resolution
- Auto-fix loops with configurable retry limits
- Abstractions: `ISnapshotManager` interface

See: [Checkpoint System](./checkpoint-system.md)

### 5. **Hybrid Tool Strategy**

**Start with direct calls, add scripting later**:
- **Phase 1**: Direct tool calls (`file_operations.read()`)
- **Phase 2**: Scripting for complex multi-step operations (agent writes code to call tools)

### 6. **Enforcement via Injection**

**Teams enforcement injected via config** (not hardcoded in package):
```typescript
const orchestrator = new AgentOrchestrator({
  enforcement: {
    allowedModels: ['sonnet-4.5', 'haiku-4.5'],
    allowedSubAgents: ['finder', 'thinker', 'reviewer'],
    forcedSubAgents: {
      security: { enabled: true, trigger: 'on-write' }
    }
  }
});
```

Local config can specify preferences, Teams config **overrides and enforces**.

See: [Teams Integration](./teams-integration.md)

---

## Documentation

- **[Agent Roles](./agent-roles.md)**: Specialized agent roles (finder, thinker, planner, etc.)
- **[Context Management](./context-management.md)**: Hybrid context storage, artifacts, visualization
- **[Checkpoint System](./checkpoint-system.md)**: Snapshots, rewind, merge conflicts, auto-fix loops
- **[Hooks System](./hooks-system.md)**: Event-driven hooks like Claude Code
- **[Implementation Phases](./implementation-phases.md)**: Vertical slices, timeline, deliverables
- **[Package Structure](./package-structure.md)**: Directory layout, exports, interfaces (TODO)
- **[Usage Examples](./usage-examples.md)**: CLI, web, multi-agent examples (TODO)
- **[Teams Integration](./teams-integration.md)**: Enforcement, cloud storage, sync (TODO)

---

## Quick Start

### Installation

```bash
# In mimir monorepo
cd packages/mimir-agents
yarn install
yarn build

# Link to CLI
cd ../../
yarn link @codedir/mimir-agents
```

### Basic Usage

```typescript
import { Agent } from '@codedir/mimir-agents/core';
import { LocalContextStorage } from '@codedir/mimir-agents/memory';

const agent = new Agent({
  role: 'main',
  model: 'sonnet-4.5',
  llm: providerFactory.create(config.llm),
  tools: toolRegistry.getAllTools(),
  contextStorage: new LocalContextStorage(fs, '.mimir/context'),
  platform: { fs, executor, docker },
  config,
});

const result = await agent.execute('Add authentication');
```

See: [Usage Examples](./usage-examples.md) for more

---

## Research & Inspiration

This package design is inspired by:

- **[Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)**: Reusable agent harness
- **[Claude Code](https://www.anthropic.com/engineering/claude-code-best-practices)**: Subagents, isolated contexts, scripting over abstraction
- **[Amp](https://medium.com/@matthewtanner91/how-to-use-subagents-in-ai-coding-with-amp-8b8418486782)**: Specialized roles (Oracle, Librarian, Search)
- **[Aider](https://github.com/aider-ai/aider/issues/4428)**: Multi-agent proposal, architect mode
- **[Google ADK](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)**: Context as architecture, artifacts
- **[Azure AI Agents](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)**: Orchestration patterns

---

## Status

- ✅ **Research complete**: Analyzed Claude Code, Amp, Aider, industry patterns
- ✅ **Architecture finalized**: Design principles, package structure, interfaces
- ✅ **Checkpoint system designed**: Snapshots, merge conflicts, auto-fix loops documented
- 📋 **Phase 0 ready**: Package setup can begin
- 📋 **Phase 1 next**: Context, memory & checkpoints implementation (PRIORITY)

---

## Next Steps

1. **Review and refine** this architecture with team
2. **Start Phase 0**: Package setup (2-3 days)
3. **Start Phase 1**: Context, memory & checkpoints (Week 1, PRIORITY)
   - IContextStorage + ISnapshotManager interfaces
   - Local storage implementations
   - Checkpoint timeline UI
   - Auto-fix loops and merge conflict resolution
4. **Iterate**: Build vertically, slice by slice

See: [Implementation Phases](./implementation-phases.md) for detailed roadmap

---

**Last Updated**: 2025-12-27
**Status**: Planning Complete, Ready for Implementation
