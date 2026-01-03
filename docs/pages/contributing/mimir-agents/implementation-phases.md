# Implementation Phases

**Last Updated**: 2025-12-27

---

## Overview

The `mimir-agents` package will be implemented in **7 phases** over **7 weeks**, using vertical slicing to deliver working features incrementally.

**Priority**: Context/Memory/Checkpoints → Core Agent → Modes → Orchestration → Roles → Hooks → MCP → Polish

**Critical First Phase**: Context management + checkpoint/snapshot system are the foundation for all other features. Without solid context storage and rewind capability, agents cannot operate safely or effectively.

---

## Phase 0: Package Setup

**Duration**: 2-3 days
**Goal**: Bootstrap package structure, CI/CD, link to CLI

### Tasks

- [ ] Create `packages/mimir-agents/` directory
- [ ] Initialize package.json
  ```json
  {
    "name": "@codedir/mimir-agents",
    "version": "0.1.0",
    "type": "module",
    "main": "./dist/index.js",
    "exports": {
      ".": "./dist/index.js",
      "./core": "./dist/core/index.js",
      "./memory": "./dist/memory/index.js",
      "./modes": "./dist/modes/index.js",
      "./orchestration": "./dist/orchestration/index.js",
      "./tools": "./dist/tools/index.js",
      "./mcp": "./dist/mcp/index.js"
    }
  }
  ```
- [ ] Configure TypeScript (tsconfig.json, strict mode)
- [ ] Set up build (tsup or tsc)
- [ ] Set up testing (Vitest)
- [ ] Set up linting (ESLint + Prettier)
- [ ] CI/CD (GitHub Actions: test.yml, build.yml)
- [ ] Link to main CLI (`yarn link`)
- [ ] Create initial directory structure

### Deliverables

✅ Package builds successfully
✅ Tests run (placeholder tests)
✅ Can import in CLI
✅ CI/CD pipeline working

---

## Phase 1: Context, Memory & Checkpoints (PRIORITY)

**Duration**: Week 1
**Goal**: Context management + checkpoint/snapshot system foundation

### Why First?

- **Foundation for everything**: Agents need context storage + rewind capability
- **Most complex**: Hybrid storage, sync logic, pruning, snapshots
- **High impact**: Good context + checkpoints = better agents + safe rewinding
- **Can test independently**: No agent dependencies
- **Enables agent orchestration**: Checkpoints critical for parallel agents and auto-fix loops

### Tasks

#### **1.1: Interfaces & Types**

- [ ] Define `IContextStorage` interface
  - Methods: appendMessage, getMessages, storeArtifact, getArtifact, etc.
- [ ] Define `ISnapshotManager` interface (CRITICAL - foundation for checkpoints)
  - Methods: createSnapshot, createAgentSnapshot, restore, diff, prune, etc.
- [ ] Define types: Conversation, Message, Artifact, Metadata
- [ ] Define snapshot types: Snapshot, SnapshotMetadata, SnapshotDiff, RestoreOptions
- [ ] Define PruningStrategy interface (context)
- [ ] Define RetentionPolicy interface (snapshots)
- [ ] Define SyncResult type
- [ ] Define MergeConflict types (severity, resolution strategies)

#### **1.2: LocalContextStorage**

- [ ] Implement LocalContextStorage class
- [ ] Messages as JSONL (append-only)
- [ ] Artifacts as separate files
- [ ] Metadata as JSON
- [ ] Conversation index
- [ ] Unit tests (mocked IFileSystem)

#### **1.3: TeamsContextStorage** (Stub)

- [ ] Stub implementation (throws "Not implemented")
- [ ] API client methods defined
- [ ] Sync logic placeholder
- [ ] Will be fully implemented later

#### **1.4: HybridContextStorage**

- [ ] Wraps LocalContextStorage + TeamsContextStorage
- [ ] Local-first writes
- [ ] Background sync queue
- [ ] Conflict resolution (timestamp-based)
- [ ] Sync status tracking

#### **1.5: ArtifactStorage**

- [ ] Generate artifact IDs
- [ ] Store artifacts separately
- [ ] Retrieve artifacts by ID
- [ ] Compression (optional, using zlib)

#### **1.6: PruningStrategy**

- [ ] Relevance scoring
- [ ] Token-based pruning
- [ ] Age-based pruning
- [ ] Keep recent messages
- [ ] Unit tests

#### **1.7: ContextManager**

- [ ] High-level API for context management
- [ ] Add files to context (as artifacts)
- [ ] Add search results
- [ ] Prune context
- [ ] Export context (JSON, Markdown)
- [ ] Clear context

#### **1.8: ContextCommands** (Slash Commands)

- [ ] `/context` - show summary
- [ ] `/context messages` - list messages
- [ ] `/context artifacts` - list artifacts
- [ ] `/context show <artifact-id>` - show artifact
- [ ] `/context add <file>` - add file
- [ ] `/context prune` - prune context
- [ ] `/context clear` - clear
- [ ] `/context export` - export

#### **1.9: LocalSnapshotStorage** (PRIORITY - Checkpoint System)

- [ ] Implement LocalSnapshotStorage class
- [ ] Full filesystem snapshots (copy all changed files)
- [ ] Per-conversation snapshot directories
- [ ] Snapshot metadata (agent ID, type, description, timestamp)
- [ ] Conversation state snapshots (messages, artifacts, context)
- [ ] Generate snapshot IDs
- [ ] Unit tests (mocked IFileSystem)

#### **1.10: SnapshotManager**

- [ ] High-level API for snapshot management
- [ ] Auto-snapshot before agent execution
- [ ] Manual snapshots via `/checkpoint`
- [ ] Restore functionality (files-only, conversation-only, selective)
- [ ] Diff between snapshots
- [ ] Timeline visualization (agent-level detail)
- [ ] Integration with Agent lifecycle

#### **1.11: MergeConflictResolver**

- [ ] Detect merge conflicts from parallel agents
- [ ] Severity categorization (low, medium, high, critical)
- [ ] Auto-resolve low severity conflicts (whitespace, formatting)
- [ ] Merger agent for medium severity conflicts
- [ ] User prompt for high/critical conflicts with options
- [ ] Optimistic concurrency for read-only agents

#### **1.12: AutoFixLoop**

- [ ] Configurable retry limits by severity (low: 5, medium: 3, high: 1, critical: 0)
- [ ] Total retry cap (default: 10)
- [ ] Exponential backoff between retries
- [ ] Integration with reviewer agent
- [ ] Escalate to user after max retries
- [ ] User options (accept/reject/manual/continue)

#### **1.13: RetentionPolicyManager**

- [ ] 24-hour retention per conversation (configurable)
- [ ] Prune old snapshots automatically
- [ ] Keep agent-related snapshots grouped
- [ ] Manual retention override for important snapshots
- [ ] Disk usage tracking

#### **1.14: CheckpointCommands** (Slash Commands)

- [ ] `/checkpoint` - interactive timeline UI
- [ ] `/checkpoint create [description]` - manual checkpoint
- [ ] `/checkpoint list` - list all checkpoints
- [ ] `/checkpoint restore <id>` - restore from checkpoint
- [ ] `/checkpoint diff <id1> <id2>` - diff between checkpoints
- [ ] `/checkpoint timeline` - visual timeline with agent details
- [ ] `/checkpoint prune` - prune old checkpoints

#### **1.15: TeamsSnapshotStorage** (Stub - TODO/Low Priority)

- [ ] Stub implementation (throws "Not implemented")
- [ ] API client methods defined
- [ ] Background batch sync queue (marked as TODO)
- [ ] Will be fully implemented later (low priority)

### Deliverables

✅ LocalContextStorage working
✅ HybridContextStorage working (with stub Teams)
✅ Pruning strategies implemented
✅ **LocalSnapshotStorage working** (PRIORITY)
✅ **SnapshotManager with timeline UI** (PRIORITY)
✅ **Merge conflict resolution** (PRIORITY)
✅ **Auto-fix loop implementation** (PRIORITY)
✅ **Retention policy working** (PRIORITY)
✅ Context slash commands functional
✅ **Checkpoint slash commands functional** (PRIORITY)
✅ Can import and use in CLI
✅ 80%+ test coverage (includes checkpoint system)

### Integration Tests

#### **Test 1: Context Management**

```typescript
// Test: Add messages, prune, export
const storage = new LocalContextStorage(fs, '.mimir/context');
const conversationId = await storage.createConversation({ title: 'Test' });

// Add 100 messages
for (let i = 0; i < 100; i++) {
  await storage.appendMessage(conversationId, {
    role: 'user',
    content: `Message ${i}`,
  });
}

// Prune to 50
await storage.pruneMessages(conversationId, {
  type: 'relevance',
  maxTokens: 10000,
  keepRecent: 10,
});

// Export
const conversation = await storage.getConversation(conversationId);
expect(conversation.messages.length).toBeLessThan(60);
```

#### **Test 2: Checkpoint System** (PRIORITY)

```typescript
// Test: Create checkpoints, modify files, restore
const snapshotManager = new SnapshotManager(fs, '.mimir/context');
const conversationId = await storage.createConversation({ title: 'Test Checkpoint' });

// Create initial snapshot
const snap1 = await snapshotManager.createSnapshot(conversationId, 'manual', 'Initial state');

// Modify files (simulate agent work)
await fs.writeFile('src/auth.ts', 'export const login = () => {}');
await fs.writeFile('src/session.ts', 'export const session = {}');

// Create second snapshot (auto-agent)
const snap2 = await snapshotManager.createAgentSnapshot(conversationId, 'agent-001');

// Modify more files
await fs.writeFile('src/auth.ts', 'export const login = () => { /* bug */ }');

// Restore to snap1
await snapshotManager.restore(conversationId, snap1.id, {
  restoreFiles: true,
  restoreConversation: false,
});

// Verify files restored
const authContent = await fs.readFile('src/auth.ts', 'utf-8');
expect(authContent).not.toContain('bug');

// Test timeline
const timeline = await snapshotManager.getTimeline(conversationId);
expect(timeline.snapshots.length).toBe(2);
expect(timeline.snapshots[0].agents).toBeDefined();

// Test retention
await snapshotManager.prune(conversationId, {
  type: 'age',
  maxAge: 86400000, // 24 hours
  keepRecent: 5,
});
```

---

## Phase 2: Core Agent & Modes

**Duration**: Week 2
**Goal**: Single agent execution, mode system

### Tasks

#### **2.1: Core Agent**

- [ ] Agent class
- [ ] ReAct loop (Reason → Act → Observe)
- [ ] Tool execution integration
- [ ] Context integration (use IContextStorage)
- [ ] Metrics tracking
- [ ] Interrupt handling

#### **2.2: PlanMode** (Planner Agent)

- [ ] Task breakdown (LLM-based)
- [ ] Read-only tools
- [ ] No code changes
- [ ] User approval workflow
- [ ] Export plan to `/plan` command

#### **2.3: ActMode** (Actor Agent)

- [ ] Autonomous execution
- [ ] Full tool access
- [ ] Progress tracking
- [ ] Checkpoints before major changes

#### **2.4: DiscussMode** (Architect Agent)

- [ ] Interactive Q&A
- [ ] Clarifying questions
- [ ] Present approaches with pros/cons
- [ ] Generate architecture plan

#### **2.5: ModeManager**

- [ ] Switch between modes
- [ ] Preserve context across switches
- [ ] `/mode plan`, `/mode act`, `/mode discuss`
- [ ] Keyboard shortcut (Shift+Tab)

#### **2.6: Agent Role Configuration**

- [ ] RoleRegistry class
- [ ] Register default roles (main, finder, thinker, planner, actor, architect)
- [ ] Preferred models per role
- [ ] Tool restrictions per role
- [ ] System prompts per role

#### **2.7: Model Selection**

- [ ] Prompt user to select model for agent
- [ ] Show preferred models
- [ ] Allow custom model input
- [ ] Enforce allowed models (Teams)

### Deliverables

✅ Single agent can execute tasks
✅ Three modes working
✅ Mode switching functional
✅ Model selection prompts working
✅ Can use in CLI for basic tasks

### Integration Test

```typescript
// Test: Plan → Approve → Act
const planner = new PlanMode({ llm, tools, contextStorage });
const plan = await planner.execute('Add authentication');

// User approves plan

const actor = new ActMode({ llm, tools, contextStorage });
const result = await actor.execute(plan.tasks);

expect(result.success).toBe(true);
```

---

## Phase 3: Orchestration

**Duration**: Week 3-4
**Goal**: Multi-agent orchestration, parallel execution

### Tasks

#### **3.1: AgentOrchestrator**

- [ ] Task complexity detection (LLM-based)
- [ ] Decompose into parallel sub-tasks
- [ ] Dependency graph construction
- [ ] Topological sort

#### **3.2: SubAgent**

- [ ] Isolated context window
- [ ] Inherit tools from orchestrator
- [ ] Report results to parent
- [ ] Metrics tracking

#### **3.3: ParallelExecutor**

- [ ] Execute agents in batches
- [ ] Respect dependencies
- [ ] Result aggregation

#### **3.4: Interactive Agent Plan UI** (CLI only)

- [ ] Display plan to user
- [ ] Allow model selection per agent
- [ ] Edit task descriptions
- [ ] Approve/cancel/edit options

### Deliverables

✅ Multi-agent orchestration working
✅ Parallel execution functional
✅ User approval workflow
✅ Dependency management correct

---

## Phase 4: Specialized Roles

**Duration**: Week 5
**Goal**: Implement specialized agent roles

### Tasks

- [ ] **Finder agent**: Fast file search (Haiku, read-only)
- [ ] **Thinker agent**: Deep reasoning (o3, GPT-5)
- [ ] **Researcher agent**: Docs, web search (Sonnet 4.5)
- [ ] **Reviewer agent**: Code review (Sonnet 4.5, o3)
- [ ] **Tester agent**: Test generation (Sonnet 4.5)
- [ ] **Security agent**: Vulnerability scanning (Sonnet 4.5)
- [ ] **Rush agent**: Quick operations (Haiku, 3-5 iterations)
- [ ] Role-based tool restrictions
- [ ] Role-based system prompts

### Deliverables

✅ Finder and Thinker working
✅ Other roles documented (implemented later)
✅ Role registry complete
✅ Tool restrictions enforced

---

## Phase 5: Hooks System

**Duration**: Week 6
**Goal**: Hook system like Claude Code

### Tasks

- [ ] HookRegistry class
- [ ] Hook types (pre-tool-call, post-tool-call, etc.)
- [ ] Execute hooks with timeout
- [ ] Template variable replacement
- [ ] User prompts for hooks (if configured)
- [ ] Teams-enforced hooks
- [ ] Audit trail for hook executions

### Deliverables

✅ Hooks system working
✅ Can configure hooks in config.yml
✅ Teams can enforce hooks
✅ All hook types supported

---

## Phase 6: MCP Integration

**Duration**: Week 7
**Goal**: MCP server support, dynamic tool loading

### Tasks

- [ ] MCPClient
- [ ] MCPServerManager
- [ ] MCPToolAdapter
- [ ] Built-in MCP servers (filesystem, git)

### Deliverables

✅ MCP client working
✅ Can load tools from MCP servers
✅ Integrated with tool registry

---

## Phase 7: Polish & Testing

**Duration**: Week 8
**Goal**: Testing, documentation, examples

### Tasks

- [ ] Unit tests (all modules)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Documentation (README, API docs)
- [ ] Example usage
- [ ] Performance optimization

### Deliverables

✅ 80%+ test coverage
✅ Comprehensive documentation
✅ Example projects
✅ Package ready for v1.0

---

## Timeline Summary

| Phase | Week | Focus | Deliverable |
|-------|------|-------|-------------|
| 0 | 0 (2-3 days) | Package setup | Bootstrap complete, CI/CD working |
| **1** | **1** | **Context, Memory & Checkpoints** | **Storage + snapshot system working** |
| 2 | 2 | Core Agent & Modes | Single agent + modes functional |
| 3 | 3-4 | Orchestration | Multi-agent working |
| 4 | 5 | Specialized Roles | Finder, Thinker implemented |
| 5 | 6 | Hooks System | Hooks working |
| 6 | 7 | MCP Integration | MCP tools working |
| 7 | 8 | Polish & Testing | v1.0 ready |

**Note**: Phase 1 is the PRIORITY and includes checkpoint/snapshot system as a critical foundation for agent orchestration, parallel execution, and auto-fix loops.

---

**Last Updated**: 2025-12-27
