# Vertical Slicing Architecture - Complete Proposal

## Overview

Restructure Mimir from **horizontal/layered architecture** to **vertical slicing by feature**. This improves cohesion, discoverability, and enables parallel development.

**Migration Strategy**: Big Bang (restructure all at once)

---

## Proposed Structure

```
src/
├── features/                    # Feature Modules (Vertical Slices)
│   ├── chat/                   # Interactive chat & main agent
│   │   ├── commands/           # ChatCommand
│   │   ├── components/         # ChatInterface, MessageList, InputBox
│   │   ├── agent/             # Agent.ts (ReAct loop)
│   │   ├── memory/            # ConversationMemory, message management
│   │   ├── slash-commands/    # Built-in slash commands (/help, /mode, etc.)
│   │   ├── types.ts
│   │   └── index.ts           # Public API
│   │
│   ├── agent-orchestration/   # Multi-agent system
│   │   ├── orchestrator/      # AgentOrchestrator implementation
│   │   ├── agents/            # SubAgent, specialized agents
│   │   ├── roles/             # RoleRegistry, role configs
│   │   ├── components/        # AgentPlanUI, MultiAgentView
│   │   ├── communication/     # Message queue, shared context
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── tools/                 # Tool system
│   │   ├── built-in/          # FileOperationsTool, BashExecutionTool, GitTool, FileSearchTool
│   │   ├── custom/            # Custom tool loader, sandbox runtime
│   │   ├── mcp/              # MCP client, MCP tool adapter
│   │   ├── registry/          # ToolRegistry
│   │   ├── commands/          # /tools slash command
│   │   ├── components/        # Tool UI (token cost chart, etc.)
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── permissions/           # Permission system
│   │   ├── manager/          # PermissionManager
│   │   ├── assessor/         # RiskAssessor
│   │   ├── commands/         # CLI commands (permissions list/add/remove)
│   │   ├── components/       # Permission prompt UI
│   │   ├── storage/          # Permissions audit storage
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── auth/                  # Authentication
│   │   ├── commands/         # teams login/logout/status
│   │   ├── manager/          # AuthManager
│   │   ├── api/              # Auth API client
│   │   ├── storage/          # Token storage
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── teams/                 # Teams/Enterprise
│   │   ├── commands/         # teams commands (sync, etc.)
│   │   ├── api/              # TeamsAPIClient
│   │   ├── detector/         # WorkspaceTeamDetector
│   │   ├── config/           # TeamsConfigSource
│   │   ├── sync/             # SyncManager
│   │   ├── enforcement/      # Policy enforcement
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── modes/                 # Plan/Act/Discuss modes
│   │   ├── plan/             # Plan mode agent & UI
│   │   ├── act/              # Act mode agent & UI
│   │   ├── discuss/          # Architect/Discuss mode
│   │   ├── commands/         # /mode, /plan, /act, /discuss
│   │   ├── components/       # Mode indicator, mode switcher
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── history/               # Conversation history
│   │   ├── commands/         # history list/resume/export/clear
│   │   ├── components/       # History list UI
│   │   ├── storage/          # ConversationRepository
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── cost/                  # Cost tracking & analytics
│   │   ├── commands/         # cost today/week/month/compare
│   │   ├── components/       # Cost display, cost comparison dashboard
│   │   ├── tracker/          # CostTracker, token counting
│   │   ├── budget/           # Budget enforcement
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── init/                  # Project initialization
│   │   ├── commands/         # init, setup, uninstall
│   │   ├── components/       # SetupWizard, FirstRunDetector
│   │   ├── templates/        # Config templates, example commands
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── checkpoints/           # Checkpoint/undo system
│   │   ├── commands/         # checkpoint list/restore, /undo, /checkpoint
│   │   ├── manager/          # CheckpointManager
│   │   ├── storage/          # Checkpoint storage
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── custom-commands/       # Custom slash commands
│   │   ├── loader/           # CustomCommandLoader
│   │   ├── parser/           # SlashCommandParser
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   └── doctor/                # Diagnostics
│       ├── commands/          # doctor command
│       ├── checks/            # Health checks (node, docker, api keys, etc.)
│       ├── components/        # Doctor UI, fix suggestions
│       ├── types.ts
│       └── index.ts
│
├── shared/                     # Truly Shared Infrastructure
│   ├── platform/              # IFileSystem, IProcessExecutor, IDockerClient
│   ├── config/                # ConfigLoader, ConfigManager, schemas
│   ├── storage/               # Database, IStorageBackend, base repositories
│   ├── providers/             # LLM providers (used by all agent features)
│   │   ├── anthropic/
│   │   ├── deepseek/
│   │   ├── base/
│   │   ├── factory/
│   │   ├── pricing/
│   │   └── utils/
│   ├── ui/                    # Shared UI components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── Logo.tsx
│   │   ├── Spinner.tsx
│   │   └── theme/
│   ├── keyboard/              # Keyboard system
│   │   ├── KeyboardEventBus.ts
│   │   ├── KeyboardContext.tsx
│   │   ├── useKeyboardAction.ts
│   │   └── KeyBindingsManager.ts
│   └── utils/                 # Shared utilities
│       ├── logger.ts
│       ├── errors.ts
│       ├── cache.ts
│       ├── keyboardFormatter.ts
│       └── ...
│
└── types/                      # Global TypeScript types
    └── index.ts
```

---

## Feature Slice Details

### 1. **chat/** - Interactive Chat & Main Agent
**Owns**: Main chat loop, agent ReAct loop, conversation memory, message display
**Entry Points**: `mimir` command (no args)
**Dependencies**: `shared/providers`, `features/tools`, `features/permissions`

### 2. **agent-orchestration/** - Multi-Agent System
**Owns**: Task decomposition, sub-agent creation, parallel execution, specialized agents
**Entry Points**: Auto-triggered when task needs multiple agents
**Dependencies**: `features/chat`, `shared/providers`, `features/tools`

### 3. **tools/** - Tool System
**Owns**: Built-in tools, custom tools, MCP integration, tool registry, `/tools` command
**Entry Points**: Used by agents, `/tools` slash command
**Dependencies**: `shared/platform`, `features/permissions`

### 4. **permissions/** - Permission System
**Owns**: Risk assessment, allowlist, permission prompts, audit trail
**Entry Points**: `mimir permissions` commands, triggered before tool execution
**Dependencies**: `shared/storage`

### 5. **auth/** - Authentication
**Owns**: Teams login/logout, token management, OAuth flow
**Entry Points**: `mimir teams login/logout/status`
**Dependencies**: `features/teams` (API client), `shared/storage`

### 6. **teams/** - Teams/Enterprise
**Owns**: Teams API client, config enforcement, sync manager, team detection
**Entry Points**: `mimir teams sync`, config loading
**Dependencies**: `shared/config`, `shared/storage`

### 7. **modes/** - Plan/Act/Discuss Modes
**Owns**: Mode-specific agents, mode switching, mode indicator UI
**Entry Points**: `/mode`, `/plan`, `/act`, `/discuss` slash commands
**Dependencies**: `features/chat`, `features/agent-orchestration`

### 8. **history/** - Conversation History
**Owns**: Conversation persistence, history commands, conversation resume
**Entry Points**: `mimir history` commands
**Dependencies**: `shared/storage`

### 9. **cost/** - Cost Tracking & Analytics
**Owns**: Token counting, cost calculation, budget enforcement, cost analytics
**Entry Points**: `mimir cost` commands, inline cost display
**Dependencies**: `shared/providers`, `shared/storage`

### 10. **init/** - Project Initialization
**Owns**: Project setup, setup wizard, first run detection, uninstall
**Entry Points**: `mimir init`, `mimir setup`, `mimir uninstall`
**Dependencies**: `shared/platform`, `shared/config`

### 11. **checkpoints/** - Checkpoint/Undo System
**Owns**: Checkpoint creation, restoration, undo/redo, backup storage
**Entry Points**: `mimir checkpoint` commands, `/checkpoint`, `/undo` slash commands
**Dependencies**: `shared/platform`, `shared/storage`

### 12. **custom-commands/** - Custom Slash Commands
**Owns**: Custom command loading, slash command parsing, YAML parsing
**Entry Points**: Used by chat for slash command routing
**Dependencies**: `shared/platform`

### 13. **doctor/** - Diagnostics
**Owns**: Health checks, environment diagnostics, fix suggestions
**Entry Points**: `mimir doctor` command
**Dependencies**: `shared/platform`, `shared/providers`, `features/teams`

---

## Shared Code Placement

### **shared/providers/** - LLM Providers
**Rationale**: Used by multiple features (chat, agent-orchestration, custom-commands, doctor)
**Not a domain feature**: Infrastructure concern, external API abstraction

### **shared/platform/** - Platform Abstractions
**Rationale**: Cross-cutting infrastructure, used by all features

### **shared/config/** - Configuration System
**Rationale**: Used by all features, hierarchical loading

### **shared/storage/** - Database Infrastructure
**Rationale**: Persistence layer, used by history, permissions, teams, cost

### **shared/ui/** - Shared UI Components
**Rationale**: Header, Footer, Logo used across features

### **shared/keyboard/** - Keyboard System
**Rationale**: Cross-cutting concern, used by all interactive UI

### **shared/utils/** - Utilities
**Rationale**: Logging, errors, caching used everywhere

---

## Public API Pattern

Each feature exports a clean public API via `index.ts`:

```typescript
// features/teams/index.ts
export { createTeamsCommand } from './commands/teams.js';
export { TeamsAPIClient } from './api/TeamsAPIClient.js';
export { TeamsConfigSource } from './config/TeamsConfigSource.js';
export { SyncManager } from './sync/SyncManager.js';
export type { Team, Organization, TeamsConfig } from './types.js';

// Internal files NOT exported:
// - ./api/TeamsAPIClientImpl.ts (implementation detail)
// - ./sync/BatchSyncQueue.ts (internal)
```

**Rule**: Other features MUST import from the public API, not internal files:
```typescript
// ✅ Good
import { TeamsAPIClient } from '@/features/teams';

// ❌ Bad
import { TeamsAPIClientImpl } from '@/features/teams/api/TeamsAPIClientImpl';
```

---

## Migration Plan (Big Bang)

### Phase 1: Create New Structure
1. Create `src/features/` directory
2. Create `src/shared/` directory
3. Create feature subdirectories

### Phase 2: Move Files (Feature by Feature)
For each feature (e.g., `teams`):
1. Create `features/teams/` subdirectories
2. Move CLI commands → `features/teams/commands/`
3. Move core logic → `features/teams/api/`, `features/teams/detector/`, etc.
4. Move types → `features/teams/types.ts`
5. Create public API → `features/teams/index.ts`

### Phase 3: Move Shared Code
1. Move `src/platform/` → `shared/platform/`
2. Move `src/providers/` → `shared/providers/`
3. Move `src/config/` → `shared/config/`
4. Move `src/storage/` → `shared/storage/`
5. Move `src/utils/` → `shared/utils/`
6. Extract shared UI from `src/cli/components/` → `shared/ui/`
7. Move `src/cli/keyboard/` → `shared/keyboard/`

### Phase 4: Update Imports
1. Update all imports to use new paths
2. Use path aliases for cleaner imports:
   ```typescript
   import { TeamsAPIClient } from '@/features/teams';
   import { IFileSystem } from '@/shared/platform';
   ```

### Phase 5: Update Tests
1. Reorganize tests to mirror new structure:
   ```
   tests/
   ├── features/
   │   ├── teams/
   │   │   ├── api/TeamsAPIClient.test.ts
   │   │   └── ...
   │   ├── chat/
   │   └── ...
   └── shared/
       ├── platform/
       └── ...
   ```

### Phase 6: Update Documentation
1. Update CLAUDE.md with new structure
2. Update architecture docs
3. Update contributor guides

---

## Benefits of Vertical Slicing

### ✅ **Cohesion**
All code for a feature in one place. To work on "teams", go to `features/teams/`.

### ✅ **Discoverability**
"Where's the auth code?" → `features/auth/`

### ✅ **Parallel Development**
Multiple developers can work on different features without conflicts.

### ✅ **Clear Boundaries**
Features interact via public APIs, reducing coupling.

### ✅ **Easier Testing**
Test features in isolation with clear dependencies.

### ✅ **Future Modularity**
Easy to extract features into separate packages/plugins.

### ✅ **Onboarding**
New contributors can understand features independently.

---

## Path Aliases (tsconfig.json)

```json
{
  "compilerOptions": {
    "paths": {
      "@/features/*": ["./src/features/*"],
      "@/shared/*": ["./src/shared/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

**Usage**:
```typescript
import { TeamsAPIClient } from '@/features/teams';
import { IFileSystem } from '@/shared/platform';
import { Config } from '@/types';
```

---

## Questions Resolved

1. ✅ **Feature slices identified**: 13 features (chat, agent-orchestration, tools, permissions, auth, teams, modes, history, cost, init, checkpoints, custom-commands, doctor)

2. ✅ **Shared code**: Lives in `shared/` (platform, config, storage, providers, ui, keyboard, utils)

3. ✅ **Providers placement**: `shared/providers/` (used by multiple features, infrastructure concern)

4. ✅ **Migration strategy**: Big Bang (restructure everything at once)

5. ✅ **Public API pattern**: Each feature exports via `index.ts`, other features import from public API only

---

## Next Steps

1. Review and approve this proposal
2. Create migration script (automated file moves)
3. Execute migration (big bang)
4. Update all imports
5. Run tests to verify nothing broke
6. Update documentation

---

**Estimated Migration Time**: 4-6 hours (with automated script)
**Risk**: Medium (big changes, but all at once = easier to track)
**Benefit**: High (long-term maintainability, scalability, developer experience)
