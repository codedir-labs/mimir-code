# Mimir Agents Package - Documentation

**Package**: `@codedir/mimir-agents`
**Version**: 0.1.0 (Planning Phase)
**Last Updated**: 2025-12-27

---

## 📚 Documentation Index

### **Core Documentation**

- **[Overview](./index.md)** - Architecture, design principles, quick start
- **[Agent Roles](./agent-roles.md)** - Specialized agent roles (finder, thinker, planner, etc.)
- **[Context Management](./context-management.md)** - Hybrid storage, artifacts, pruning, visualization
- **[Checkpoint System](./checkpoint-system.md)** - Snapshots, rewind, merge conflicts, auto-fix loops
- **[Hooks System](./hooks-system.md)** - Event-driven hooks like Claude Code
- **[Implementation Phases](./implementation-phases.md)** - 7-phase roadmap with deliverables

---

## 🎯 What is mimir-agents?

`mimir-agents` is a **reusable, platform-agnostic agent framework** designed to power:
- **Mimir CLI** - Terminal-based coding agent
- **Mimir Web** - Browser-based version (future)
- **VS Code Extension** - IDE integration (future)
- **Custom Integrations** - Your own applications

### Key Features

✅ **Single & multi-agent execution**
✅ **Isolated subagent contexts** (like Amp/Claude Code)
✅ **Hybrid context management** (local + cloud storage)
✅ **Checkpoint/snapshot system** (full filesystem snapshots like Replit)
✅ **Specialized agent roles** (finder, thinker, planner, reviewer, etc.)
✅ **Mode system** (Plan, Act, Discuss)
✅ **Auto-fix loops** (configurable retry limits with severity-based escalation)
✅ **Hooks system** (pre/post tool execution, lifecycle events)
✅ **MCP integration** (Model Context Protocol)
✅ **Tool orchestration** (built-in + custom + MCP tools)
✅ **Teams enforcement** (allowed models, forced subagents, policy control)

---

## 🏗️ Architecture Overview

### **Design Principles**

1. **Isolation Over Shared Context**: Subagents have isolated context windows (main sees only final results)
2. **Vertical Slicing**: Modular package structure, can be split if needed
3. **Hybrid Context Management**: Small data inline, large data as artifacts
4. **Checkpoint System for Safe Rewinding**: Full filesystem snapshots (like Replit) with auto-snapshots before agents
5. **Hybrid Tools**: Direct calls first, scripting for complex operations later
6. **Enforcement via Injection**: Teams config injected at runtime

### **Package Structure**

```
@codedir/mimir-agents
├── /core          # Core agent, ReAct loop
├── /memory        # Context management (local + cloud)
├── /modes         # Plan, Act, Discuss modes
├── /orchestration # Multi-agent orchestration
├── /roles         # Specialized agent roles
├── /tools         # Tool integration + built-ins
├── /mcp           # MCP client integration
└── /commands      # Slash command system
```

---

## 📖 Documentation Guide

### **Getting Started**

1. **Read [Overview](./index.md)** - Understand architecture and design principles
2. **Review [Agent Roles](./agent-roles.md)** - Learn about specialized agents
3. **Understand [Context Management](./context-management.md)** - Critical for all agents
4. **Review [Checkpoint System](./checkpoint-system.md)** - Safe rewinding and conflict resolution

### **For Implementers**

1. **Follow [Implementation Phases](./implementation-phases.md)** - Step-by-step roadmap (start with Phase 1: Context + Checkpoints)
2. **Review [Checkpoint System](./checkpoint-system.md)** - PRIORITY - Foundation for agent orchestration
3. **Review [Hooks System](./hooks-system.md)** - Event-driven automation

### **For Integrators**

1. **Read [Overview](./index.md)** - Quick start guide
2. **Check examples** - CLI, web, custom integration patterns

---

## 🚀 Quick Start

### **Installation** (Future)

```bash
# Install from npm (when published)
npm install @codedir/mimir-agents

# Or in Mimir monorepo
cd packages/mimir-agents
yarn install
yarn build
yarn link
```

### **Basic Usage**

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

const result = await agent.execute('Add authentication to the app');
```

See [Overview](./index.md) for more examples.

---

## 🎭 Agent Roles

| Role | Purpose | Preferred Model | Tools | Status |
|------|---------|-----------------|-------|--------|
| **main** | Main orchestrator | Sonnet 4.5 | All tools | ✅ Phase 1 |
| **finder** | File/code search | Haiku 4.5, Qwen 3 | Read-only | ✅ Phase 2 |
| **thinker** | Deep reasoning | o3, GPT-5, R1 | Full tools | ✅ Phase 2 |
| **planner** | Plan mode | Sonnet 4.5 | Read-only | ✅ Phase 2 |
| **actor** | Act mode | Sonnet 4.5 | All tools | ✅ Phase 2 |
| **architect** | Discuss mode | Sonnet 4.5 | Read-only | ✅ Phase 2 |
| **researcher** | Docs/web research | Sonnet 4.5 | web_search | 📋 Phase 3 |
| **reviewer** | Code review | Sonnet 4.5, o3 | Read + git | 📋 Phase 3 |
| **tester** | Test generation | Sonnet 4.5 | Write + bash | 📋 Phase 4 |
| **security** | Security scanning | Sonnet 4.5, o3 | Read-only | 📋 Phase 4 |
| **rush** | Quick ops (3-5 iterations) | Haiku 4.5 | Limited | 📋 Phase 4 |

See [Agent Roles](./agent-roles.md) for details.

---

## 🗂️ Context Management

### **Architecture**

**Context = Messages + Artifacts + Metadata**

- **Messages**: Task descriptions, agent responses, summaries
- **Artifacts**: Large data (files, search results) stored separately
- **Storage**: Local (`.mimir/context/`) or Cloud (Teams API)

### **Slash Commands**

```bash
/context                  # Show summary
/context messages         # List messages
/context artifacts        # List artifacts
/context add <file>       # Add file as artifact
/context prune            # Prune context
/context export <file>    # Export conversation
```

See [Context Management](./context-management.md) for details.

---

## 📸 Checkpoint System

Full filesystem snapshots for safe rewinding (like Replit):

### **Features**

- **Auto-snapshots**: Before every agent execution
- **Manual snapshots**: Via `/checkpoint` command
- **Interactive timeline**: Visual UI with agent-level detail
- **Restore options**: Files-only, conversation-only, selective files
- **Merge conflict resolution**: Severity-based (auto-resolve low, merger agent for medium, user prompt for high/critical)
- **Auto-fix loops**: Configurable retry limits by severity (low: 5, medium: 3, high: 1, critical: 0)
- **24-hour retention**: Per conversation (configurable)

### **Slash Commands**

```bash
/checkpoint                      # Interactive timeline UI
/checkpoint create [description] # Manual checkpoint
/checkpoint list                 # List all checkpoints
/checkpoint restore <id>         # Restore from checkpoint
/checkpoint diff <id1> <id2>     # Diff between checkpoints
/checkpoint timeline             # Visual timeline with agent details
```

### **Storage Structure**

```
.mimir/context/conversations/{id}/snapshots/
├── snap-001/
│   ├── files/           # Full file copies
│   ├── conversation-state.json
│   └── metadata.json
├── snap-002/
└── index.json
```

See [Checkpoint System](./checkpoint-system.md) for details.

---

## 🪝 Hooks System

Event-driven shell commands triggered by agent lifecycle events:

### **Hook Types**

- `pre-tool-call`, `post-tool-call`
- `pre-file-write`, `post-file-write`
- `pre-bash-execution`, `post-bash-execution`
- `pre-agent-execute`, `post-agent-execute`
- `on-agent-error`, `on-agent-interrupt`

### **Example**

```yaml
# .mimir/config.yml
hooks:
  pre-file-write:
    command: npx prettier --write {file_path}
    timeout: 5000
    continueOnError: true

  post-agent-execute:
    command: git add . && git commit -m "Agent: {task_description}"
    prompt: true  # Ask before running
```

See [Hooks System](./hooks-system.md) for details.

---

## 🛠️ Implementation

### **Phases**

| Phase | Week | Focus | Priority |
|-------|------|-------|----------|
| 0 | 0 (2-3 days) | Package setup | Bootstrap |
| **1** | **1** | **Context, Memory & Checkpoints** | **🔥 FIRST** |
| 2 | 2 | Core Agent & Modes | Foundation |
| 3 | 3-4 | Orchestration | Multi-agent |
| 4 | 5 | Specialized Roles | Finder, Thinker |
| 5 | 6 | Hooks System | Automation |
| 6 | 7 | MCP Integration | External tools |
| 7 | 8 | Polish & Testing | v1.0 |

**Why Context/Memory/Checkpoints First?**
- Foundation for all agents (storage + rewind capability)
- Most complex (hybrid storage, sync, pruning, snapshots)
- Enables safe agent orchestration and parallel execution
- Critical for auto-fix loops and merge conflict resolution
- Can be tested independently
- High impact on agent quality and safety

See [Implementation Phases](./implementation-phases.md) for detailed roadmap.

---

## 🔗 Research & Inspiration

This package design is inspired by industry-leading agent frameworks:

- **[Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)**: Reusable agent harness
- **[Claude Code](https://www.anthropic.com/engineering/claude-code-best-practices)**: Subagents, TDD, scripting over abstraction
- **[Amp](https://medium.com/@matthewtanner91/how-to-use-subagents-in-ai-coding-with-amp-8b8418486782)**: Specialized roles (Oracle, Librarian)
- **[Aider](https://github.com/aider-ai/aider/issues/4428)**: Multi-agent proposal, architect mode
- **[Google ADK](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)**: Context as architecture
- **[Azure AI Agents](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)**: Orchestration patterns

---

## 📊 Status

- ✅ **Research complete**: Analyzed competing tools and industry patterns
- ✅ **Architecture finalized**: Design principles, interfaces, package structure
- ✅ **Checkpoint system designed**: Snapshots, merge conflicts, auto-fix loops documented
- ✅ **All core documentation complete**: Context, checkpoints, hooks, agent roles, implementation phases
- 📋 **Phase 0 ready**: Can start package setup immediately
- 📋 **Phase 1 next**: Context, memory & checkpoints implementation (PRIORITY)

---

## 🤝 Contributing

When implementing features for `mimir-agents`:

1. **Read architecture docs first**: Understand design principles
2. **Follow vertical slicing**: Implement phase by phase
3. **Use abstractions**: `IFileSystem`, `IProcessExecutor`, `IContextStorage`, `ISnapshotManager`
4. **Phase 1 is PRIORITY**: Context + Checkpoints must be implemented first (foundation for everything)
5. **Write tests first**: TDD approach, 80%+ coverage
6. **Document as you go**: Update docs when adding features

---

## 📬 Next Steps

1. **Review and refine** this architecture
2. **Start Phase 0**: Package setup (2-3 days)
3. **Start Phase 1**: Context, memory & checkpoints (Week 1, PRIORITY)
   - Define `IContextStorage` + `ISnapshotManager` interfaces
   - Implement `LocalContextStorage` + `LocalSnapshotStorage`
   - Build checkpoint timeline UI
   - Implement merge conflict resolution + auto-fix loops
   - Create `/context` and `/checkpoint` slash commands
4. **Iterate**: Build vertically, deliver working features incrementally

---

**Last Updated**: 2025-12-27
**Status**: Planning Complete, Ready for Implementation
