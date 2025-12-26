# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mimir is a platform-agnostic, BYOK (Bring Your Own Key) AI coding agent CLI built with TypeScript. The project emphasizes:
- Cross-platform compatibility (Windows/Unix)
- Test-driven development with Vitest
- Support for multiple LLM providers (Currently: DeepSeek, Anthropic; Planned: OpenAI, Google/Gemini, Qwen, Ollama)
- Model Context Protocol (MCP) integration
- Security-first design with permission system and Docker sandboxing

**Current Status**: Work in Progress - documentation and architecture complete, implementation in progress.

## Development Commands

```bash
# Development (when implemented)
yarn dev              # Run in development mode
yarn build            # Build TypeScript to dist/
yarn build:binary     # Create platform-specific executables
yarn test             # Run all tests with Vitest
yarn test:unit        # Run unit tests (*.test.ts)
yarn test:integration # Run integration tests (*.spec.ts)
yarn lint             # Run ESLint
yarn format           # Run Prettier
```

## Core Architecture

### Platform Abstraction Layer

The codebase uses platform abstractions to ensure cross-platform compatibility:

- **`IFileSystem`** (src/platform/) - File system operations wrapper using fs/promises + globby
- **`IProcessExecutor`** (src/platform/) - Command execution using execa (handles Windows PowerShell and Unix shells)
- **`IDockerClient`** (src/platform/) - Docker container management using dockerode

**CRITICAL RULES - Platform Abstraction Compliance:**

1. **NEVER import or use direct Node.js APIs for file operations:**
   - ❌ `import fs from 'fs'`, `import { readFileSync, writeFileSync } from 'fs'`
   - ❌ `import fs from 'fs/promises'`
   - ✅ Inject `IFileSystem` via constructor and use `this.fs.readFile()`, `this.fs.writeFile()`, etc.

2. **NEVER use synchronous fs operations:**
   - ❌ `existsSync()`, `mkdirSync()`, `readFileSync()`, `writeFileSync()`
   - ✅ Use async `IFileSystem` methods: `await this.fs.exists()`, `await this.fs.mkdir()`, etc.

3. **NEVER use direct `process` APIs for environment:**
   - ❌ `process.cwd()` - Should be passed as parameter from CLI entry point
   - ❌ `process.exit()` - Throw errors instead; let CLI handle exit
   - ✅ Signal handlers (SIGINT/SIGTERM) may use `process.exit()` as a last resort
   - ✅ `process.env` is acceptable for reading environment variables

4. **Exceptions (infrastructure code only):**
   - `logger.ts` - Uses sync fs in constructor (infrastructure-level, runs before platform layer)
   - `Database.ts` - Now uses async factory method `DatabaseManager.create()` with IFileSystem
   - Migration scripts - Build-time concerns, not runtime

5. **For classes that need file/process operations:**
   - Accept `IFileSystem` and/or `IProcessExecutor` via constructor
   - Use dependency injection pattern
   - If initialization requires async operations, provide static async factory method

   Example:
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

**Violations will break cross-platform compatibility and testability.**

### LLM Provider System

All LLM providers extend `BaseLLMProvider` which implements `ILLMProvider`:

```typescript
interface ILLMProvider {
  chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse>;
  streamChat(messages: Message[], tools?: Tool[]): AsyncGenerator<ChatChunk>;
  countTokens(text: string): number;
  calculateCost(inputTokens: number, outputTokens: number): number;
}
```

Providers are created via `ProviderFactory.create()`. Each provider handles:
- API communication with retry logic
- Token counting (tiktoken or provider-specific)
- Cost calculation based on pricing data
- Error handling for rate limits and network issues

### Configuration System

Configuration follows a strict hierarchy (lowest to highest priority):
1. Default config (hardcoded fallback)
2. **Teams/Enterprise cloud config** (highest priority, ENFORCED - cannot be overridden)
3. Global (`~/.mimir/config.yml`)
4. Project (`.mimir/config.yml`)
5. Environment variables (`.env`)
6. CLI flags (TBD - may be restricted in enterprise mode)

**CRITICAL**: Teams/Enterprise config is ENFORCED - users cannot override settings like:
- Allowed models
- Allowed sub-agents
- Forced sub-agents (e.g., required security agent)
- API keys (proxied through Teams backend)
- Budget limits
- Docker sandbox mode (local/cloud/auto)

All config is validated with Zod schemas. Key configuration areas:
- LLM provider settings (provider, model, temperature, maxTokens)
- Permission system (autoAccept, acceptRiskLevel, alwaysAcceptCommands)
- Keyboard shortcuts (interrupt, modeSwitch, editCommand)
- Docker settings (enabled, baseImage, cpuLimit, memoryLimit)
- **NEW: Teams settings** (apiUrl, orgId, features, enforcement)
- **NEW: Tool configuration** (enable/disable tools, token costs)
- **NEW: Agent orchestration** (multi-agent settings, sub-agent roles)

### Keyboard Shortcuts

All keyboard shortcuts are configured in `.mimir/config.yml` under the `keyBindings` section. Platform-specific bindings are automatically handled (Cmd on macOS, Ctrl on Windows/Linux).

Default shortcuts:

- `Ctrl+C`, `Escape` - Cancel/interrupt current operation
- `Shift+Tab` - Switch between modes (Plan/Act/Discuss)
- `Ctrl+E` - Edit/provide alternative instruction
- `Enter` - Accept/confirm action
- `Ctrl+Space`, `Tab` - Show autocomplete/tooltip
- `ArrowUp`, `ArrowDown` - Navigate in lists
- `?` - Show help overlay with all shortcuts
- `Ctrl+L` - Clear screen
- `Ctrl+Z` - Undo last action
- `Ctrl+Y` (Cmd+Shift+Z on Mac) - Redo last undone action

To customize shortcuts, edit `.mimir/config.yml`:
```yaml
keyBindings:
  interrupt: [Ctrl+C, Escape]  # Multiple shortcuts per action
  accept: Enter                # Single shortcut
  showTooltip: [Ctrl+Space, Tab]
```

**CRITICAL RULE - Keyboard Shortcut Configurability:**

All keyboard shortcuts MUST be configurable and dynamically loaded from config:

1. **NEVER hardcode keyboard shortcuts in UI components:**
   - ❌ `<Text>Press Enter to accept</Text>`
   - ❌ `const footer = '↑↓ navigate | Enter select | Esc cancel';`
   - ✅ Load shortcuts from `config.keyBindings` and display dynamically

2. **ALWAYS use the centralized keyboard system:**
   - All keyboard handling goes through `KeyboardEventBus` and `useKeyboardAction`
   - Action-based routing (e.g., 'accept', 'interrupt', 'navigateUp')
   - Supports multiple keys per action (e.g., Tab and Ctrl+Space both trigger 'showTooltip')

3. **Pass keyboard config to components that display shortcuts:**
   ```typescript
   // Good - dynamic shortcuts in footer
   const footerText = useMemo(() => {
     const navigateKeys = `${keyBindings.navigateUp[0]}${keyBindings.navigateDown[0]}`;
     const acceptKeys = keyBindings.showTooltip.concat(keyBindings.accept).join(', ');
     return ` ${navigateKeys} navigate | ${acceptKeys} select `;
   }, [keyBindings]);
   ```

4. **Platform-specific handling:**
   - `KeyBindingsManager` automatically converts `Ctrl` to `Cmd` on macOS
   - Use `KeyBindingsManager.toPlatformBinding()` for display text

5. **ALWAYS use `formatKeyboardShortcut()` for rendering shortcuts:**
   - Import from `src/utils/keyboardFormatter.js`
   - Automatically converts key names to icons (ArrowUp → ↑, Enter → ↵, Escape → ⎋)
   - Handles platform-specific modifiers (Ctrl/Cmd)
   - Supports both single shortcuts and arrays

   ```typescript
   import { formatKeyboardShortcut, buildFooterText } from '../utils/keyboardFormatter.js';

   // Single shortcut with icons
   formatKeyboardShortcut('ArrowUp');  // → '↑'
   formatKeyboardShortcut('Enter');    // → '↵'

   // Multiple shortcuts
   formatKeyboardShortcut(['Ctrl+C', 'Escape']);  // → 'Ctrl+C, ⎋'

   // Navigation arrows (common pattern)
   formatNavigationArrows(['ArrowUp'], ['ArrowDown']);  // → '↑↓'

   // Build complete footer text
   buildFooterText([
     { shortcut: ['ArrowUp', 'ArrowDown'], label: 'navigate' },
     { shortcut: 'Enter', label: 'select' },
     { shortcut: ['Ctrl+C', 'Escape'], label: 'cancel' },
   ]);
   // → '↑↓ navigate | ↵ select | Ctrl+C, ⎋ cancel'
   ```

   **Icon mappings:**
   - Arrow keys: ↑ ↓ ← →
   - Special keys: ↵ (Enter), ⎋ (Escape), ⇥ (Tab), ⌫ (Backspace), ⌦ (Delete)
   - Modifiers (optional): ⇧ (Shift), ⌃ (Ctrl), ⌥ (Alt), ⌘ (Cmd)

**Example: Autocomplete footer with dynamic shortcuts**
```typescript
// Bad - hardcoded shortcuts
<Text>↑↓ navigate | Enter select | Esc cancel</Text>

// Good - dynamic shortcuts with formatKeyboardShortcut
import { buildFooterText } from '../utils/keyboardFormatter.js';

const footerText = useMemo(() => {
  return buildFooterText([
    { shortcut: [keyBindings.navigateUp[0], keyBindings.navigateDown[0]], label: 'navigate' },
    { shortcut: keyBindings.accept, label: 'select' },
    { shortcut: keyBindings.interrupt, label: 'cancel' },
  ]);
}, [keyBindings]);

<Text>{footerText}</Text>
// → '↑↓ navigate | ↵ select | Ctrl+C, ⎋ cancel'
```

**Violations will confuse users who customize their shortcuts.**

### Agent Architecture (ReAct Loop)

The core agent follows a Reason-Act-Observe cycle:

1. **REASON**: LLM determines next action based on task and observations
2. **ACT**: Execute tool after permission check
3. **OBSERVE**: Record results and update conversation memory

The agent stops when:
- Task is completed (finish action)
- Max iterations reached
- Budget exceeded
- User interrupts (Ctrl+C)

### Tool System

Tools implement the `Tool` interface with Zod schema validation:

```typescript
interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  execute(args: any): Promise<ToolResult>;
}
```

Core tools:
- **FileOperationsTool** - read/write/edit/list/delete files
- **FileSearchTool** - grep/glob/regex search
- **BashExecutionTool** - execute commands with permission system
- **GitTool** - git operations (status, diff, log, commit, etc.)

MCP tools are loaded dynamically via `MCPClient` and namespaced as `server-name/tool-name`.

### Permission System

Before executing commands, the system:
1. Assesses risk level (low, medium, high, critical)
2. Checks against allowlist/blocklist
3. Prompts user if not auto-accepted:
   - `y` - yes
   - `n` - no
   - `a` - always allow
   - `never` - never allow
   - `edit` - provide alternative instruction
   - `view` - show command details
4. Logs decision to audit trail
5. Executes or rejects

Risk patterns are defined in `RiskAssessor` class.

### Storage (SQLite)

All persistent data stored in SQLite database at `.mimir/mimir.db`:
- **conversations** - conversation metadata
- **messages** - message history with tokens/cost
- **tool_calls** - tool execution records
- **permissions** - audit trail of permission decisions

**NEW**: Storage now uses abstraction layer (`IStorageBackend`) to support:
- Local SQLite storage (default)
- Teams cloud storage (API-based)
- Hybrid storage (local-first with background sync)

### Teams/Enterprise Support

**See**: `docs/contributing/plan-enterprise-teams.md` for full architecture

Mimir supports enterprise/teams deployments with centralized management:

**Features:**
- **Centralized Configuration**: Admin-managed config via cloud API
- **Policy Enforcement**: Cannot be overridden by users (API keys, allowed models, etc.)
- **Shared Resources**: Tools, custom commands, MCP servers, allowlists
- **Cloud Storage**: Conversation history and audit logs synced to cloud
- **LLM Proxy**: Route LLM calls through Teams backend (hide individual keys)
- **Cloud Sandboxes**: Execute Docker containers in cloud environment
- **Budget Quotas**: Organization-level spending limits

**Authentication:**
```bash
mimir teams login   # Authenticate with organization
mimir teams status  # Show org, user, quota usage
mimir teams logout  # Sign out
```

**Architecture:**
- `TeamsAPIClient` - API client for Teams backend
- `IStorageBackend` - Storage abstraction (local/cloud/hybrid)
- `SyncManager` - Background batch sync for conversations/audits
- `TeamsConfigSource` - Highest priority config source (enforced)

**Key Principles:**
1. **Offline Mode**: Not available for enterprise (requires connection)
2. **Local-First Sync**: Write locally, sync in background batches
3. **Enforcement**: Teams config cannot be overridden by users
4. **Backward Compatible**: Works seamlessly for non-enterprise users

### Tool System

**See**: `docs/contributing/plan-tools.md` for full architecture

All tools implement the `Tool` interface:

```typescript
interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  enabled: boolean;
  tokenCost: number;  // Estimated tokens added to system prompt
  source: 'built-in' | 'custom' | 'mcp' | 'teams';
  execute(args: any, context: ToolContext): Promise<ToolResult>;
}
```

**Built-in Tools:**
- **FileOperationsTool** - read/write/edit/list/delete files
- **FileSearchTool** - grep/glob/regex search
- **BashExecutionTool** - execute commands with permission system
- **GitTool** - git operations (status, diff, log, commit, etc.)

**Custom Tools:**
- Defined in `.mimir/tools/*.yml`
- TypeScript runtime (compiled with esbuild)
- Execute in Docker sandbox (isolated context)
- Full access to: platform abstractions, config, conversation, logger, LLM
- Inherit permission system (allowlist, risk assessment)

**Tool Management:**
```bash
/tools              # List all tools with token costs
/tools enable NAME  # Enable a tool
/tools disable NAME # Disable a tool (if not enforced)
/tools info NAME    # Show tool details
/tools tokens       # Token cost breakdown (visual chart)
```

**Configuration:**
```yaml
tools:
  file_operations:
    enabled: true
  run_tests:  # Custom tool
    enabled: true
```

**Token Cost Tracking:**
- Each tool reports estimated tokens added to system prompt
- `/tools tokens` shows visual breakdown
- Total system prompt cost displayed

**Teams Integration:**
- Tools loaded from Teams API
- Teams tools override local tools
- Teams tools cannot be disabled

### Agent Orchestration

**See**: `docs/contributing/plan-agent-orchestration.md` for full architecture

Multi-agent system for complex tasks:

**Core Components:**
- `AgentOrchestrator` - Main orchestrator managing sub-agents
- `Agent` - Individual agent with role, model, tools, budget
- `SubAgentConfig` - Configuration for creating sub-agents

**Specialized Roles:**
- **finder** - Quick file searches (Haiku/Qwen, read-only tools)
- **oracle** - Deep reasoning, complex bugs (o3/GPT-5, full tools)
- **librarian** - API/docs research (Sonnet 4.5, read-only)
- **refactoring** - Code refactoring (Sonnet 4.5, write tools)
- **reviewer** - Security/quality review (Sonnet 4.5/o3, read+git)
- **tester** - Test generation (Sonnet 4.5, write+bash)
- **rush** - Quick targeted loops (Haiku, 3-5 iterations)

**Workflow:**
1. Orchestrator detects if task needs multiple agents
2. Decomposes task into parallel sub-tasks (LLM-based)
3. Presents plan to user (interactive approval)
4. Creates specialized agents with role-based tool restrictions
5. Executes agents in parallel (respecting dependencies)
6. Merges results and presents to user

**UI Display:**
- All agents stacked vertically in one pane
- Each shows: status icon, elapsed time, cost, tokens, compact todo list
- Keyboard shortcut to expand agent details
- Real-time updates (500ms refresh)

**Teams Enforcement:**
- Allowed models per agent
- Allowed/forced sub-agent roles
- Model selection per sub-agent
- Nesting depth limits

**Configuration:**
```yaml
agentOrchestration:
  enabled: true
  autoDetect: true           # Auto-detect multi-agent tasks
  promptForApproval: true    # User approval before creating agents
  promptForModels: true      # Let user select models
  maxNestingDepth: 2         # Max sub-agent nesting
  maxParallelAgents: 4
```

## Code Style Guidelines

### TypeScript
- Strict mode enabled (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`)
- Target: ES2022, Module: ESNext
- Avoid `any`, use `unknown` if needed
- Prefer Result types over throwing exceptions

### Naming Conventions
- **camelCase**: variables, functions
- **PascalCase**: classes, types, interfaces
- **UPPER_SNAKE_CASE**: constants
- **I prefix**: interfaces (e.g., `ILLMProvider`, `IFileSystem`)

### Patterns
- Async/await preferred over raw promises
- Factory pattern for providers and tools
- Dependency injection for testability
- Interface-based abstractions for platform code

### UI Development (Ink Terminal Components)
- **CRITICAL**: All colors MUST be selected from the theme system
  - Import `getTheme` from `src/config/themes/index.js`
  - Access colors via `getTheme(theme).colors.propertyName`
  - Use `getTheme(theme).rawColors.propertyName` for raw hex values when needed by Ink components
  - NEVER hardcode colors (no `#hexcodes`, no named colors like `'cyan'` directly)
- Use chalk's `bgHex()` for backgrounds in terminal UI (Ink's `backgroundColor` prop is unreliable)
- For full-width backgrounds, apply chalk background colors to text content and pad to desired width
- Reserve fixed space for popups/autocomplete to prevent layout shifts (no true z-axis overlays in Ink)
- Example:
  ```typescript
  const themeDefinition = getTheme(config.ui.theme);
  const bg = chalk.bgHex(themeDefinition.rawColors.autocompleteBg);
  const fg = chalk.hex('#eceff4');
  <Text>{bg(fg('Content with background'))}</Text>
  ```

### Testing
- Unit tests: `*.test.ts` in `tests/unit/`
- Integration tests: `*.spec.ts` in `tests/integration/`
- Follow Arrange-Act-Assert pattern
- Mock external dependencies (HTTP via MSW, filesystem, Docker via testcontainers)
- Target: 80%+ coverage (85%+ for v1.0)

## Security Considerations

When implementing features:

1. **Input Validation**: Always use Zod schemas
2. **Path Sanitization**: Prevent `../` traversal attacks
3. **Command Execution**: Use parameterized execution, never string interpolation
4. **Docker Isolation**: Run untrusted code in containers with resource limits
5. **Secret Management**: Never commit API keys; use environment variables
6. **Audit Trail**: Log all command executions to `permissions` table

## Important Architecture Details

### MCP (Model Context Protocol) Integration

MCP allows dynamic tool loading from external servers:
- `MCPClient` manages stdio/HTTP connections to MCP servers
- Servers defined in `.mimir/config.yml` with command, args, and env
- Tools are automatically registered in `MCPToolRegistry`
- Handle server lifecycle (auto-start, health checks, failure recovery)

### Mode System

Three operating modes:
1. **Plan Mode** - Create task breakdown, get approval before execution
2. **Act Mode** - Autonomous execution with progress tracking
3. **Discuss/Architect Mode** - Interactive planning with Q&A

Users can switch modes mid-execution with `/mode <name>` or Shift+Tab.

### Interrupt Handling

Support graceful interruption:
- Save agent state on SIGINT (Ctrl+C)
- Clean up resources (containers, temp files)
- Allow resume from interruption point
- Show partial results

### Context Management

Monitor token usage and implement pruning strategies:
- Summarize old messages when approaching limit
- Keep system prompts and recent context
- Score messages by relevance
- Manual compaction via `/compact` command

## CLI Structure

### Main Commands (repo/session management)
- `mimir` - start interactive chat
- `mimir init` - initialize project (.mimir/ directory)
- `mimir history list/resume/export/clear` - conversation history
- `mimir cost today/week/month/compare` - cost analytics
- `mimir doctor` - run diagnostics
- `mimir permissions list/add/remove` - manage allowlist
- **NEW: `mimir teams login/logout/status/sync`** - Teams authentication and sync

### Slash Commands (in-chat)

**Built-in Commands:**
- `/discuss <topic>` - architect/discuss mode
- `/plan <description>` - create execution plan
- `/act` - autonomous execution mode
- `/mode <plan|act|discuss>` - change mode
- `/model <provider>` - switch LLM provider
- `/checkpoint` - create checkpoint
- `/undo` - undo last operation
- **NEW: `/tools [list|enable|disable|info|tokens]`** - manage tools, show token costs
- `/help` - show commands

**Example Custom Commands (provided on `mimir init`):**
- `/security [file-or-commit]` - Analyze git diffs for security vulnerabilities (OWASP top 10, SQL injection, XSS, etc.)
- `/refactor [file-or-pattern]` - Suggest refactoring improvements (code smells, design patterns, performance)
- `/test [file-or-function]` - Generate comprehensive test cases (unit, integration, edge cases)
- `/docs [file-or-symbol]` - Generate or improve documentation (JSDoc, README, API docs)
- `/review [file-or-commit]` - Perform comprehensive code review (correctness, quality, security)
- `/perf [file-or-function]` - Analyze performance issues (algorithmic complexity, I/O, memory)

Custom commands are YAML files in `.mimir/commands/` directory:
```yaml
name: security
description: Analyze git changes for security vulnerabilities
usage: /security [file-or-commit]
aliases: [sec, vuln]
prompt: |
  Perform a comprehensive security analysis of the git diff.
  Focus on SQL injection, XSS, command injection, path traversal...
  [Full sophisticated prompt with analysis criteria]

  Target: $ARGUMENTS
```

**Placeholder substitution:**
- `$1`, `$2`, `$3` - Individual arguments (e.g., `/security src/auth.ts` → `$1` = `src/auth.ts`)
- `$ARGUMENTS` - All arguments joined (e.g., `/test utils.ts unit` → `$ARGUMENTS` = `utils.ts unit`)

Commands are loaded from both global (`~/.mimir/commands/`) and project (`.mimir/commands/`) directories. Project commands override global ones. Custom commands that conflict with built-in names are skipped.

## Key Dependencies

- **Commander.js** - CLI framework
- **Ink** - React for terminal UI
- **Vitest** - Testing framework
- **MSW** - HTTP mocking for tests
- **Zod** - Schema validation
- **execa** - Cross-platform process execution
- **dockerode** - Docker API client
- **tiktoken** - OpenAI tokenizer
- **sqlite3** - Database

## Development Workflow

When implementing new features:

1. **Read Architecture First**: Review `docs/architecture.md` and relevant sections
2. **Check Roadmap**: See `docs/roadmap.md` for planned implementation order and dependencies
3. **Use Abstractions**: Never use Node.js APIs directly - use platform abstractions
4. **Write Tests First**: Follow TDD approach - write tests before implementation
5. **Validate Input**: Always define Zod schemas for configuration and tool arguments
6. **Handle Errors**: Return Result types or throw custom error classes
7. **Cross-Platform**: Test on Windows and Unix; use `IProcessExecutor` for shell commands
8. **Document**: Update this file if adding major architectural components

## Project Structure

```
src/
├── cli/          # CLI commands and Ink UI components
├── core/         # Agent loop, LLM interface, tools, memory
├── platform/     # Platform abstraction (IFileSystem, IProcessExecutor, IDockerClient)
├── config/       # Configuration management and Zod schemas
├── providers/    # LLM provider implementations
├── utils/        # Logging, error handling, token counting
└── types/        # TypeScript type definitions

tests/
├── unit/         # *.test.ts - unit tests with mocks
├── integration/  # *.spec.ts - integration tests with testcontainers
└── fixtures/     # Test data and mock responses

docs/             # Architecture and roadmap documentation
```
