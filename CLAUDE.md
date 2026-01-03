# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

Mimir is a platform-agnostic, BYOK AI coding agent CLI built with TypeScript.

**Key Features**:
- Cross-platform (Windows/Unix)
- Multiple LLM providers (DeepSeek, Anthropic; planned: OpenAI, Gemini, Qwen, Ollama)
- Model Context Protocol (MCP) integration
- Security-first with permission system and Docker sandboxing
- Test-driven development (Vitest, 80%+ coverage target)

**Package Manager**: **yarn** (not npm)

**Status**: Work in Progress - documentation complete, implementation in progress

## Package Architecture

**CRITICAL**: This is a **monorepo** with two distinct packages. Understanding their separation is essential:

### `@codedir/mimir-agents` (Platform-Agnostic Core)

**Location:** `packages/mimir-agents/`
**Package:** `@codedir/mimir-agents`
**Status:** ✅ Implemented and building successfully

**Purpose:** Pure TypeScript abstractions and business logic. **Zero** platform-specific dependencies.

**Contains:**
- 🧠 **Orchestration Logic**: `WorkflowOrchestrator`, `TaskDecomposer`, `Agent`
- 📋 **Interfaces**: `IExecutor`, `IFileSystem`, `ILLMProvider`, `IProcessExecutor`, `IDockerClient`
- 🔒 **Security**: `PermissionManager`, `RiskAssessor` (business logic only)
- 🧩 **Core Types**: All shared types, schemas, and enums
- 📚 **Memory/Context**: Memory management, context compaction
- 🛠️ **Tools**: Tool registry, base tool classes

**Key Principle:** This package defines **WHAT** to do, not **HOW** to do it.

**Import Example:**
```typescript
import { Agent, WorkflowOrchestrator } from '@codedir/mimir-agents/orchestration';
import { PermissionManager } from '@codedir/mimir-agents';
import type { IExecutor, ILLMProvider, IFileSystem } from '@codedir/mimir-agents';
```

**Dependencies:** Only `zod` for validation. No Node.js, no LLM SDKs, no database libraries.

**Why Separate?**
- ✅ Can be used in any JavaScript runtime (Node, Deno, Cloudflare Workers, Browser)
- ✅ Teams backend service can import without CLI baggage
- ✅ Testing without platform dependencies
- ✅ IDE extensions can use orchestration logic
- ✅ Clean architecture: business logic separated from infrastructure

---

### `@codedir/mimir-agents-node` (Node.js Runtime)

**Location:** `packages/mimir-agents-node/`
**Package:** `@codedir/mimir-agents-node`
**Status:** ✅ Implemented and building successfully

**Purpose:** Node.js-specific implementations of all interfaces defined in `mimir-agents`.

**Contains:**
- 💾 **Platform Adapters**: `FileSystemAdapter` (Node.js `fs/promises`), `ProcessExecutorAdapter` (`execa`)
- 🤖 **LLM Providers**: `AnthropicProvider`, `DeepSeekProvider`, `ProviderFactory`, `BaseLLMProvider`
- 🗄️ **Storage**: `DatabaseManager` (sql.js), `ConversationRepository`, Drizzle schemas
- 🔧 **Utilities**: `APIClient` (axios), `pricingData`, `toolFormatters`, `streamParsers`

**Key Principle:** This package implements **HOW** to do things using Node.js APIs.

**Import Example:**
```typescript
import { FileSystemAdapter, ProcessExecutorAdapter } from '@codedir/mimir-agents-node/platform';
import { AnthropicProvider, ProviderFactory } from '@codedir/mimir-agents-node/providers';
import { DatabaseManager } from '@codedir/mimir-agents-node/storage';
```

**Dependencies:** Node.js APIs, `axios`, `execa`, `gpt-tokenizer`, `sql.js`, `drizzle-orm`, `uuid`, `fast-glob`

**Why Separate?**
- ✅ Keeps core package platform-agnostic
- ✅ Future: Create `mimir-agents-browser`, `mimir-agents-edge`, `mimir-agents-deno`
- ✅ Clear separation: abstractions vs concrete implementations
- ✅ Web backends can use same runtime as CLI

---

### `mimir` (CLI Application)

**Location:** `src/` (root package)

**Purpose:** User-facing CLI application. Uses both packages above.

**Contains:**
- 🎨 **UI Components**: Ink components, themes, terminal rendering
- ⌨️ **Commands**: `/chat`, `/init`, `/history`, `/doctor`, etc.
- 🔧 **Config Loading**: Merges local/global/Teams configs
- 👤 **User Interaction**: Prompts, approvals, visualizations

**Import Example:**
```typescript
// Abstractions from core
import { Agent } from '@codedir/mimir-agents/core';
// Implementations from runtime
import { AnthropicProvider } from '@codedir/mimir-agents-node/providers';
import { NativeExecutor } from '@codedir/mimir-agents-node/execution';
```

**Key Principle:** CLI is just a consumer. It **composes** core logic + runtime implementations + UI.

---

### 🚨 CRITICAL RULES:

1. **`mimir-agents` NEVER imports from `mimir-agents-node`**
   - Core defines interfaces only
   - Runtime implements interfaces

2. **`mimir-agents-node` imports interfaces from `mimir-agents`**
   - Runtime depends on core
   - Implements core interfaces

3. **`mimir` CLI imports from BOTH packages**
   - Uses core abstractions
   - Provides runtime implementations via dependency injection

4. **When working on orchestration/business logic → `mimir-agents`**
   - No Node.js APIs allowed
   - No external SDKs (Anthropic, OpenAI)
   - Only pure TypeScript + Zod

5. **When working on platform integration → `mimir-agents-node`**
   - Node.js APIs allowed
   - External SDKs allowed
   - Must implement interfaces from `mimir-agents`

---

### 📚 Required Reading When Working With Packages:

- **Before editing `packages/mimir-agents/`**: Read `packages/mimir-agents/README.md`
- **Before editing `packages/mimir-agents-node/`**: Read `packages/mimir-agents-node/README.md`
- **Architecture rationale**: See `.claude/best-practices/package_architecture.md`

## Development Commands

### Validation (Run After Making Changes)

**Quick validation** - run before committing:
```bash
yarn validate         # typecheck + lint + test
```

**Full validation** - run before pushing/PR:
```bash
yarn validate:full    # typecheck + lint + test:coverage + deadcode analysis
```

### Individual Commands

| Command | Description | When to Use |
|---------|-------------|-------------|
| `yarn typecheck` | TypeScript type checking | After any code change |
| `yarn lint` | ESLint (includes complexity + sonarjs rules) | After any code change |
| `yarn lint:fix` | Auto-fix lint issues | To fix formatting/simple issues |
| `yarn test` | Run all tests once | After any code change |
| `yarn test:watch` | Run tests in watch mode | During active development |
| `yarn test:unit` | Unit tests only | Quick feedback loop |
| `yarn test:coverage` | Tests with 80% coverage enforcement | Before PR |
| `yarn format` | Prettier formatting | Before commit |

### Quality Analysis (CI runs these)

| Command | Description |
|---------|-------------|
| `yarn quality:deadcode` | Find unused exports/files (Knip) |
| `yarn quality:duplicates` | Find duplicate code (jscpd) |

### Build Commands

```bash
yarn dev              # Run CLI in dev mode (tsx)
yarn build            # Build all packages + CLI
yarn build:packages   # Build workspace packages only
yarn build:binary     # Single platform binary (bun)
yarn build:binary:all # All platform binaries
yarn clean            # Remove all dist folders
```

### Package-Specific Commands

```bash
yarn test:packages    # Run tests for mimir-agents + mimir-agents-node
```

## Architecture

### Core Systems

- **Platform Abstraction** - See `.claude/best-practices/platform_abstractions.md`
  - `IFileSystem`, `IProcessExecutor`, `IDockerClient`
  - **NEVER use Node.js APIs directly**

- **Vertical Slicing** - See `.claude/best-practices/vertical_slicing.md`
  - Feature-based organization, not layered
  - Public APIs via `index.ts`
  - Import paths: `@/features/*`, `@/shared/*`, `@/types/*`

- **Keyboard System** - See `.claude/best-practices/keyboard_shortcuts.md`
  - All shortcuts configurable via `.mimir/config.yml`
  - **NEVER hardcode shortcuts in UI**
  - Use `formatKeyboardShortcut()` for display

- **UI Development** - See `.claude/best-practices/ui_development.md`
  - Ink (React for terminals)
  - **NEVER hardcode colors** - use theme system
  - Use chalk's `bgHex()` for backgrounds

### LLM Providers

All providers extend `BaseLLMProvider` implementing `ILLMProvider`:
- `chat()`, `streamChat()`, `countTokens()`, `calculateCost()`
- Created via `ProviderFactory.create()`
- Located in `src/shared/providers/`

### Configuration

Hierarchy (low to high priority):
1. Default config
2. Global (`~/.mimir/config.yml`)
3. Project (`.mimir/config.yml`)
4. Environment (`.env`)
5. **Teams/Enterprise** (ENFORCED, highest priority)

Validated with Zod schemas. Key areas:
- LLM settings (provider, model, temperature, maxTokens)
- Permission system (autoAccept, riskLevel)
- Keyboard shortcuts
- Docker settings
- Teams settings (apiUrl, orgId)
- Tool configuration
- Agent orchestration

### Agent Architecture

**ReAct Loop**: Reason → Act → Observe

Stops when:
- Task completed
- Max iterations reached
- Budget exceeded
- User interrupts (Ctrl+C)

### Tool System

Interface:
```typescript
interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  enabled: boolean;
  tokenCost: number;
  source: 'built-in' | 'custom' | 'mcp' | 'teams';
  execute(args: any, context: ToolContext): Promise<ToolResult>;
}
```

**Built-in**: FileOperations, FileSearch, BashExecution, Git
**Custom**: `.mimir/tools/*.yml` (TypeScript, Docker sandboxed)
**MCP**: Dynamically loaded from external servers

Management: `/tools`, `/tools enable/disable`, `/tools tokens`

### Permission System

Process:
1. Assess risk (low/medium/high/critical)
2. Check allowlist/blocklist
3. Prompt user if needed (y/n/a/never/edit/view)
4. Log to audit trail
5. Execute or reject

Risk patterns in `RiskAssessor` class.

### Storage

SQLite at `.mimir/mimir.db`:
- conversations, messages, tool_calls, permissions

Abstraction layer (`IStorageBackend`):
- Local SQLite (default)
- Teams cloud storage
- Hybrid (local-first with sync)

### Teams/Enterprise

See `docs/pages/contributing/mimir-teams/architecture.md`

Features: centralized config, policy enforcement, shared resources, cloud storage, LLM proxy, cloud sandboxes, budget quotas

Commands: `mimir teams login/logout/status/sync`

Architecture: `TeamsAPIClient`, `IStorageBackend`, `SyncManager`, `TeamsConfigSource`

### Context Management

See `.claude/best-practices/context_management.md`

- Auto-compact at 95% (configurable)
- Manual: `/compact [instructions]`
- Memory: Hierarchical MIMIR.md files
- Monitoring: `/context`, `/cost`
- Commands: `/clear`, `/resume`, `/memory`

### Multi-Agent Orchestration

See `docs/pages/contributing/plan-agent-orchestration.md`

Specialized roles: finder, oracle, librarian, refactoring, reviewer, tester, rush

Workflow: detect → decompose → approve → execute → merge

## Code Style

### TypeScript
- Strict mode: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`
- Target: ES2022, Module: ESNext
- Avoid `any`, use `unknown`
- Prefer Result types over exceptions

### ESLint Enforcement Policy

**CRITICAL**: ESLint errors are blocking - PRs cannot be merged with ESLint errors.

**NEVER do the following:**
- Disable ESLint rules with `eslint-disable` comments
- Downgrade `error` rules to `warn` in eslint.config.js
- Ignore ESLint errors - they must be fixed properly

**Rules enforced as ERRORS (must fix):**

| Rule | Why | Fix |
|------|-----|-----|
| `no-console` | CLI uses Ink for output, logger for logging | Use `logger.*()` or Ink components |
| `no-explicit-any` | Type safety | Define proper types/interfaces |
| `no-unsafe-*` | Type safety | Add type assertions or proper types |
| `no-unused-vars` | Dead code | Remove unused imports/variables |
| `no-floating-promises` | Unhandled promises | Add `await` or `void` operator |
| `no-misused-promises` | Promise in wrong context | Fix async/sync mismatch |
| `complexity` (max 20) | Maintainability | Extract helper functions |
| `cognitive-complexity` (max 20) | Readability | Simplify logic, extract functions |
| `max-lines-per-function` (max 150) | Maintainability | Split into smaller functions |
| `max-depth` (max 5) | Nesting too deep | Use early returns, extract functions |

**Allowed as WARNINGS (fix when possible):**
- `sonarjs/no-duplicate-string` - Extract to constants when > 3 occurrences
- `no-control-regex` - May be intentional for terminal handling

### Naming
- camelCase: variables, functions
- PascalCase: classes, types, interfaces
- UPPER_SNAKE_CASE: constants
- I prefix: interfaces (`ILLMProvider`, `IFileSystem`)

### Patterns
- Async/await over promises
- Factory pattern for providers/tools
- Dependency injection
- Interface-based abstractions

## Best Practices

**CRITICAL - Read These First**:
- `.claude/best-practices/platform_abstractions.md` - **MUST READ**
- `.claude/best-practices/vertical_slicing.md` - **MUST READ**
- `.github/workflows/README.md` - **MUST READ** (when working with GitHub Actions)
- `.claude/best-practices/keyboard_shortcuts.md`
- `.claude/best-practices/ui_development.md`
- `.claude/best-practices/security.md`
- `.claude/best-practices/testing.md`
- `.claude/best-practices/context_management.md`

## Security

See `.claude/best-practices/security.md`

Checklist:
- [ ] Zod validation for all input
- [ ] Path sanitization
- [ ] Parameterized command execution
- [ ] No hardcoded secrets
- [ ] Audit logging
- [ ] Docker isolation for untrusted code

## Testing

See `.claude/best-practices/testing.md`

- Pattern: Arrange-Act-Assert
- Mock: HTTP (MSW), filesystem, Docker (testcontainers)
- Coverage: 80%+ (85%+ for v1.0)
- Structure mirrors source

## CLI Structure

### Main Commands
```bash
mimir                    # Start chat
mimir init               # Initialize project
mimir history            # list/resume/export/clear
mimir cost               # today/week/month/compare
mimir doctor             # Diagnostics
mimir permissions        # list/add/remove
mimir teams              # login/logout/status/sync
```

### Slash Commands

Built-in: `/discuss`, `/plan`, `/act`, `/mode`, `/model`, `/checkpoint`, `/undo`, `/tools`, `/help`

Custom: YAML files in `.mimir/commands/`
- Loaded from global (`~/.mimir/commands/`) and project (`.mimir/commands/`)
- Placeholders: `$1`, `$2`, `$3`, `$ARGUMENTS`

Example on init: `/update-docs [file-or-symbol]`

## Key Dependencies

- **Commander.js** - CLI framework
- **Ink** - React for terminals
- **Vitest** - Testing
- **MSW** - HTTP mocking
- **Zod** - Validation
- **execa** - Process execution
- **dockerode** - Docker
- **tiktoken** - Tokenizer
- **sqlite3** - Database

## Development Workflow

When implementing:

1. **Read architecture first** - `docs/architecture.md`, relevant best-practices
2. **Check roadmap** - `docs/roadmap.md` for dependencies
3. **Use abstractions** - Never use Node.js APIs directly
4. **Write tests first** - TDD approach
5. **Validate input** - Zod schemas
6. **Handle errors** - Result types or custom errors
7. **Cross-platform** - Test Windows + Unix
8. **Run validation** - `yarn validate` before commit, `yarn validate:full` before PR
9. **Document** - Update this file for major components

### Git Hooks (Husky)

| Hook | Checks | Blocks on |
|------|--------|-----------|
| `pre-commit` | lint-staged, typecheck | TS errors |
| `pre-push` | validate (typecheck + lint + test), security audit | Any failure |

### CI Quality Gates

PRs must pass these automated checks:

| Gate | Threshold | Workflow |
|------|-----------|----------|
| TypeScript | No errors | `test.yml` |
| ESLint | No errors (warnings allowed) | `test.yml` |
| Prettier | Formatted | `test.yml` |
| Test Coverage | 80% lines/functions/branches | `test.yml` |
| Complexity | Max 15 cyclomatic, 15 cognitive | `code-quality.yml` |
| Duplication | Max 5% | `code-quality.yml` |
| Dead Code | Advisory (no block) | `code-quality.yml` |
| Security | npm audit, CodeQL, secrets scan | `security.yml` |

**Workflow Security**: See `.github/workflows/README.md` for action pinning requirements and security best practices.

## AI Output Organization

**CRITICAL**: All AI-generated artifacts go in `.claude/outputs/`:

```
.claude/outputs/
├── architecture/       # Design decisions
├── implementation/     # Plans, progress
├── testing/           # Test analysis
└── research/          # Investigations
```

**Rules**:
1. **NEVER clutter root** with .md files
2. **Organize by topic** in subdirectories
3. **Descriptive filenames** with dates (snake_case)
4. **Focused content** - One doc per topic
5. **Commit to git** - Version control for accountability

**Naming**:
- **snake_case** for all .md filenames (e.g., `execution_modes.md`, `api_key_management.md`)
- **NEVER** use uppercase, PascalCase, or kebab-case
- Descriptive but concise (e.g., `roadmap_update_2025_12_28.md`)

**Style**:
- Direct and to the point
- Short and concise
- Actionable, not obvious
- 3-5 bullet summaries max
- Tables for comparisons
- < 500 lines per doc (split if needed)
