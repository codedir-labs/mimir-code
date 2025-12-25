# Mimir - Development Roadmap

Platform-agnostic, BYOK AI coding agent CLI. TypeScript, test-driven, cross-platform.

---

## Phase 1: Foundation & Infrastructure

**Goal**: Core project structure, CI/CD, platform abstractions, infrastructure

### Project Setup
- [x] Initialize TypeScript project with yarn
- [x] Configure tsconfig.json (strict mode)
- [x] Set up ESLint + Prettier
- [x] Configure Vitest for testing
- [x] Set up project directory structure
- [x] Create .gitignore with .mimir/ entries
- [x] Initialize Git repository

### Core Infrastructure
- [x] **Logging**: Winston/Pino, log rotation, `.mimir/logs/`, context-aware logging
- [x] **Error Handling**: Custom error classes, global handler, Sentry integration
- [x] **Monitoring**: Performance hooks, metrics collection, health checks
- [x] **Security**: npm audit, Snyk, input validation, secrets management, rate limiting
- [x] **Database**: SQLite schema, migrations, connection pooling, backup strategy
- [x] **Configuration**: Zod validation, env configs, secrets encryption, migration system
- [x] **Caching**: In-memory cache for tokens/files, invalidation, size limits
- [x] **Build**: tsup bundling, binary compilation, multi-platform builds
- [x] **Development**: VSCode settings, debug configs, git hooks (pre-commit, pre-push)

### CI/CD Pipeline
- [x] GitHub Actions: test.yml, build.yml, release.yml
- [x] Code coverage (Codecov)
- [x] Automated linting and type checking

### Installation Scripts
- [x] `install.ps1` for Windows (PowerShell)
- [x] `install.sh` for Unix (bash/zsh)
- [x] Test on Windows 10/11, macOS, Linux (Ubuntu, Debian, Fedora) - via GitHub Actions test-installation.yml

### Platform Abstraction Layer
- [x] `IFileSystem` interface + cross-platform implementation (fs/promises + globby)
- [x] `IProcessExecutor` interface + cross-platform implementation (execa)
- [x] `IDockerClient` interface skeleton
- [x] Path utilities (normalize, resolve, join)
- [x] Unit tests for all abstractions

---

## Phase 2: Configuration System

**Goal**: Robust configuration with permissions, security, keyboard shortcuts

### Configuration Schema
- [x] Define Zod schemas for all config types
- [x] Generate TypeScript types from schemas
- [x] Default configuration values
- [x] Configuration documentation

### Configuration Loader
- [x] YAML parser for `.mimir/config.yml`
- [x] Global config (`~/.mimir/config.yml`)
- [x] Project config (`.mimir/config.yml`)
- [x] `.env` file support
- [x] Environment variable overrides
- [x] CLI flag overrides
- [x] Configuration merge/priority system
- [x] Zod validation

### Permission & Security Configuration
- [x] **Command Allowlist**
  - Glob patterns and regex matching
  - Default allowlist (safe commands)
  - Custom allowlist in config
  - Team-shared allowlist templates (`.mimir/allowlist.yml`)
- [x] **Auto-Accept Configuration**
  - `autoAccept: true/false/ask`
  - `alwaysAcceptCommands` list
  - Command-specific auto-accept rules
- [x] **Risk Assessment Levels**
  - Risk levels: low, medium, high, critical
  - Command classification by risk
  - `acceptRiskLevel` config setting
  - Auto-block above configured risk level

### Keyboard Shortcuts Configuration
- [x] Define default keyboard shortcuts
- [x] Allow customization in config (`keyBindings` section)
- [x] Support for Ctrl, Alt, Shift combinations
- [x] Platform-specific defaults (Cmd on macOS, Ctrl on Windows/Linux)
- [x] Configurable shortcuts for:
  - Interrupt/cancel (default: Ctrl+C)
  - Mode switching (default: Shift+Tab)
  - Accept command (default: Enter)
  - Quick reject (default: Escape)
  - Alternative instruction (default: Ctrl+E)
  - Help overlay (default: ?)
- [x] Load custom shortcuts from CLAUDE.md (KeyBindingsManager)

### Configuration Storage
- [x] Create `~/.mimir/` on first run
- [x] Generate default `config.yml` template
- [x] Create `.mimir/` on `mimir init`
- [x] Auto-add `.mimir/` to `.gitignore`
- [x] Example configurations and templates
- [x] Example custom commands (test-coverage.md, commit.md, doctor.md)

### Testing
- [x] Test loading from all sources
- [x] Test priority/override system
- [x] Test validation with invalid configs
- [x] Test permission system
- [x] Test risk assessment
- [x] Test allowlist loader
- [x] Test keyboard bindings (platform-specific)

---

## Phase 3: LLM Provider Abstraction

**Goal**: Provider-agnostic LLM integration (7+ providers + local models)

### Base Provider Architecture
- [x] `ILLMProvider` interface (chat, streamChat, countTokens, calculateCost)
- [x] `BaseLLMProvider` abstract class
- [x] Common HTTP request logic (APIClient)
- [x] Retry logic with exponential backoff
- [x] Error handling for API failures

### Provider Implementations
- [x] **DeepSeek**: API integration, tiktoken, model selection, cost calc, streaming (OpenAI-compatible)
- [x] **Anthropic**: API integration, tiktoken approximation, model selection, cost calc, streaming
- [ ] **OpenAI**: Coming later (similar to DeepSeek, OpenAI-compatible)
- [ ] **Google/Gemini**: Coming later (requires Gemini SDK)
- [ ] **Qwen**: Coming later (OpenAI-compatible, similar to DeepSeek)
- [ ] **Ollama (Local)**: Coming later (local API, no cost)

### Provider Factory
- [x] `ProviderFactory.create()`
- [x] API key loading from config/env
- [x] Graceful handling of missing keys
- [x] Provider-specific configurations

### Shared Utilities
- [x] Pricing data (hybrid: API + static fallback, 24h cache)
- [x] Tool formatters (OpenAI ↔ Anthropic format conversion)
- [x] Stream parsers (SSE for OpenAI/Anthropic formats)
- [x] API client wrapper (axios-based with error mapping)

### Testing
- [ ] Mock HTTP requests (MSW)
- [ ] Test DeepSeek provider (chat, streaming, tools, errors)
- [ ] Test Anthropic provider (chat, streaming, tools, errors)
- [ ] Test error scenarios (rate limits, network)
- [ ] Test token counting accuracy
- [ ] Test cost calculations

---

## Phase 4: Core Agent Tools & MCP Support

**Goal**: Essential tools (file, bash, git) + MCP integration

### Tool Architecture
- [ ] `Tool` interface
- [ ] `ToolRegistry` class
- [ ] Tool discovery system
- [ ] Tool execution wrapper
- [ ] Tool result formatting

### Model Context Protocol (MCP) Support
- [ ] **MCP Client**: stdio/HTTP transports, server lifecycle, tool parsing
- [ ] **MCP Server Management**: Discovery, auto-start, health checks, failure handling
- [ ] **MCP Configuration**: Config schema, server definitions (command, args, env)
- [ ] **MCP Tool Registry**: Dynamic registration, namespacing (server/tool), conflict handling
- [ ] **Built-in MCP Servers**: Filesystem server, Git server (optional dependencies)

### File Operations Tool
- [ ] Read, write (with backup), edit (find/replace, line-based)
- [ ] List directory, create directories
- [ ] Delete (with confirmation)
- [ ] Check existence, get metadata

### File Search Tool
- [ ] grep/ripgrep integration
- [ ] Glob pattern matching
- [ ] Regex search
- [ ] Include/exclude patterns
- [ ] Formatted results with line numbers

### Bash Execution Tool
- [ ] Execute commands in project directory
- [ ] Capture stdout/stderr
- [ ] Timeout handling
- [ ] Failure handling
- [ ] Windows (PowerShell) and Unix (bash/zsh) support
- [ ] Command allowlist/blocklist
- [ ] **Permission Prompt**
  - Show command + risk level
  - Options: y/n/a(always)/never/edit/view
  - Remember choices
  - Auto-accept for allowed commands

### Git Tool
- [ ] git status, diff, log, branch, commit, checkout
- [ ] Detect git repository
- [ ] Parse git output

### Syntax Highlighting
- [ ] Integrate highlighter (Shiki/highlight.js)
- [ ] Support major languages (TS, JS, Python, Go, Rust, .NET, etc.)
- [ ] Apply to file content and code blocks

### Testing
- [ ] Unit tests per tool
- [ ] Integration tests with real operations
- [ ] Mock filesystem
- [ ] Platform-specific behavior tests
- [ ] MCP client with mock servers
- [ ] Permission prompt system tests

---

## Phase 5: Docker Sandbox

**Goal**: Secure, isolated code execution

### Docker Client
- [ ] Complete `DockerClient` class (dockerode)
- [ ] Detect Docker installation
- [ ] Handle Windows Docker Desktop and Unix daemon
- [ ] Connection error handling

### Sandbox Images
- [ ] `Dockerfile.base` (Alpine/Ubuntu)
- [ ] `Dockerfile.node` (Node.js)
- [ ] `Dockerfile.python` (Python)
- [ ] Multi-arch builds (amd64, arm64)

### Container Management
- [ ] Build custom images
- [ ] Run containers with commands
- [ ] Resource limits (CPU, memory, timeout)
- [ ] Mount project directory (read-only option)
- [ ] Capture output (stdout/stderr)
- [ ] Cleanup and timeout handling
- [ ] Result caching

### Code Execution Tool
- [ ] Integrate Docker sandbox
- [ ] Execute in sandboxed environment
- [ ] Multiple runtimes (Node, Python, etc.)
- [ ] Return results to agent
- [ ] Error handling

### Testing
- [ ] testcontainers for integration tests
- [ ] Container creation/cleanup tests
- [ ] Resource limits enforcement
- [ ] Timeout handling
- [ ] Multi-platform Docker support

---

## Phase 6: ReAct Agent Loop

**Goal**: Core agent reasoning, action loop, interrupt handling

### Agent Architecture
- [ ] `Agent` class
- [ ] ReAct loop (Reason -> Act -> Observe)
- [ ] LLM provider integration
- [ ] Tool registry integration
- [ ] Max iteration limit
- [ ] Early stopping conditions

### Interrupt & Control System
- [ ] **Cancel/Interrupt**
  - Graceful SIGINT handling (Ctrl+C)
  - Save agent state before interruption
  - Resume from interruption point
  - Show partial results on cancel
  - Resource cleanup (containers, temp files)
- [ ] **Mode Switching During Execution**
  - Pause agent, show mode menu
  - Switch between plan/act/discuss modes
  - Preserve context when switching
  - Resume in new mode
- [ ] **Alternative Instructions**
  - On permission prompt, allow typing alternative
  - "edit" option instead of just "always accept"
  - Parse alternative instruction
  - Update agent plan
  - Show updated plan before proceeding

### Reasoning
- [ ] Format messages for LLM (system prompt, history, tools)
- [ ] Parse LLM response for actions
- [ ] Handle tool calling format
- [ ] Handle "finish" action
- [ ] Handle malformed responses

### Acting
- [ ] Execute tool based on LLM action
- [ ] Pass arguments to tool
- [ ] Handle tool errors
- [ ] Format tool results
- [ ] **Permission & Risk Assessment**
  - Assess command risk before execution
  - Check against allowed commands
  - Prompt user if not auto-accepted
  - Block high-risk if configured
  - Log all permission decisions

### Observing
- [ ] Store tool results in history
- [ ] Update agent state
- [ ] Log actions and observations
- [ ] Track token usage per iteration

### Error Handling
- [ ] LLM API errors
- [ ] Tool execution errors
- [ ] Retry logic
- [ ] Helpful error messages
- [ ] Failure recovery

### Testing
- [ ] Mock LLM responses
- [ ] Test complete agent loops
- [ ] Test error recovery
- [ ] Test max iteration handling
- [ ] Test permission system
- [ ] Test interrupt handling
- [ ] Test mode switching
- [ ] Test alternative instruction parsing

---

## Phase 7: Conversation History & Memory

**Goal**: Persistent conversation storage

### Storage
- [ ] SQLite schema (conversations, messages, tool_calls, permissions)
- [ ] Database initialization
- [ ] Conversation CRUD operations
- [ ] Message append operations
- [ ] Permission decision audit trail

### Memory Management
- [ ] `ConversationMemory` class
- [ ] Load history on resume
- [ ] Append new messages
- [ ] Context window management
- [ ] Message truncation strategies
- [ ] Export to JSON/Markdown

### History Management (CLI commands)
- [ ] `mimir history list` - list recent conversations
- [ ] `mimir history resume <id>` - continue conversation
- [ ] `mimir history export <id>` - export to file
- [ ] `mimir history clear` - delete conversation history

### Testing
- [ ] SQLite operations
- [ ] Conversation persistence
- [ ] Resume functionality
- [ ] Export formats

---

## Phase 8: Token Counting & Cost Analysis

**Goal**: Real-time token and cost tracking

### Token Counting
- [ ] Integrate tiktoken
- [ ] Count input tokens before LLM call
- [ ] Extract output tokens from response
- [ ] Count per message
- [ ] Track cumulative per session

### Cost Calculation
- [ ] Pricing data structure (per provider/model)
- [ ] Load pricing from config
- [ ] Calculate cost per message
- [ ] Calculate cumulative cost per session
- [ ] Store costs in database

### Real-Time Display
- [ ] Show token count after each message
- [ ] Show cost after each message
- [ ] Show session total (tokens + cost)
- [ ] Color-code warnings (80%, 90% of budget)

### Budget Management
- [ ] Budget limit in config
- [ ] Check budget before LLM calls
- [ ] Warn when approaching limit
- [ ] Stop when budget exceeded
- [ ] Allow override with flag

### Cost Analytics (CLI commands)
- [ ] `mimir cost today` - today's spending
- [ ] `mimir cost week` - weekly spending
- [ ] `mimir cost month` - monthly spending
- [ ] `mimir cost compare` - compare providers
- [ ] `mimir cost export` - export to CSV
- [ ] In-chat display: show cost after each message

### Cost Comparison Dashboard
- [ ] Comparison table (DeepSeek vs others)
- [ ] Calculate savings
- [ ] Show historical trends
- [ ] Recommend cheaper alternatives

### Testing
- [ ] Token counting accuracy
- [ ] Cost calculations
- [ ] Budget enforcement
- [ ] Analytics queries

---

## Phase 9: CLI & Terminal UI

**Goal**: Polished terminal interface with modes and shortcuts

### Command Structure

**CLI Commands** (repo/session management):
- [ ] `mimir` - start interactive chat (main command)
- [ ] `mimir init` - initialize project (create .mimir/)
- [ ] `mimir history list` - list conversations
- [ ] `mimir history resume <id>` - resume conversation
- [ ] `mimir history export <id>` - export conversation
- [ ] `mimir history clear` - delete old conversations
- [ ] `mimir cost today` - today's spending
- [ ] `mimir cost week` - weekly spending
- [ ] `mimir cost month` - monthly spending
- [ ] `mimir cost compare` - compare providers
- [ ] `mimir doctor` - run diagnostics
- [ ] `mimir permissions list` - show allowlist
- [ ] `mimir permissions add <pattern>` - add to allowlist
- [ ] `mimir permissions remove <pattern>` - remove from allowlist
- [ ] `mimir checkpoint list` - list checkpoints
- [ ] `mimir checkpoint restore <id>` - restore checkpoint
- [ ] `mimir --version` - show version
- [ ] `mimir --help` - show help

**Slash Commands** (in-chat, context-specific):
- [ ] `/discuss <topic>` - switch to architect/discuss mode
- [ ] `/plan <description>` - create execution plan
- [ ] `/act` - switch to autonomous execution mode
- [ ] `/mode <plan|act|discuss>` - change mode
- [ ] `/compact` - manually compact context
- [ ] `/model <provider>` - switch LLM provider
- [ ] `/models` - list available models
- [ ] `/checkpoint` - create checkpoint now
- [ ] `/undo` - undo last operation
- [ ] `/help` - show slash commands
- [ ] Custom commands loaded from `.mimir/commands/`

### Interactive Chat UI (Ink)
- [ ] Display user/assistant messages (streaming)
- [ ] Display tool calls with spinners
- [ ] Display tool results (formatted)
- [ ] Show token/cost info
- [ ] Status indicators (thinking, executing, etc.)
- [ ] User input with autocomplete
- [ ] Slash command support
- [ ] **Permission Prompts**
  - Display command and risk level (color-coded)
  - Options: y/n/a(always)/never/edit/view
  - On "edit": show command, allow alternative, replan, show updated plan
  - "Always accepted" indicator for auto-approved
- [ ] **Keyboard Shortcuts**
  - Implement configured shortcuts
  - Help overlay (show shortcuts)
  - Customizable per user config

### Plan, Act, Discuss Modes
- [ ] **Plan Mode**: Create task breakdown, get approval, allow editing
- [ ] **Act Mode**: Execute autonomously, show progress, checkpoints, allow interruption
- [ ] **Architect/Discuss Mode**: Interactive planning
  - Agent asks clarifying questions
  - Multi-turn Q&A
  - Present approaches with pros/cons
  - Discuss trade-offs
  - Let user guide decisions
  - Generate architecture plan
  - Questions: scale, preferences, performance vs maintainability, existing patterns
  - Switch to Act mode after approval

### Mode Switching
- [ ] Smooth transitions between modes
- [ ] Mode indicator in UI
- [ ] Commands: `/mode plan`, `/mode act`, `/mode discuss`
- [ ] Keyboard shortcut (configurable, default Shift+Tab)
- [ ] Preserve agent state
- [ ] Cancel current operation with confirmation

### Task Display
- [ ] Todo list (checkboxes)
- [ ] Progress bars
- [ ] Tree view for nested tasks
- [ ] Status updates (pending, in-progress, done, failed)

### Syntax Highlighting
- [ ] Code in chat messages
- [ ] File diffs
- [ ] Command output

### Logging
- [ ] Structured logger (Winston/Pino)
- [ ] Log levels (debug, info, warn, error)
- [ ] Write to `.mimir/logs/`
- [ ] `--verbose` flag for debug
- [ ] `--quiet` flag for minimal output

### Testing
- [ ] CLI commands with mocked dependencies
- [ ] Ink components (@testing-library/react)
- [ ] User interactions
- [ ] Permission prompt flows
- [ ] Interrupt/cancel handling
- [ ] Mode switching
- [ ] Alternative instruction system
- [ ] Discuss mode Q&A flow
- [ ] Keyboard shortcuts

---

## Phase 10: Model Switching & Context Management

**Goal**: Dynamic model switching, intelligent context pruning

### Model Switching (slash commands in chat)
- [ ] `/model <provider>` - switch provider mid-conversation
- [ ] `/models` - list available models
- [ ] Context transfer when switching
- [ ] Preserve conversation history
- [ ] Adjust token limits per model

### Context Compaction
- [ ] Context window monitoring
- [ ] Detect approaching token limit
- [ ] Summarize old messages
- [ ] Clear tool results
- [ ] Adaptive pruning strategies
- [ ] Manual compaction: `/compact` command

### Smart Context Management
- [ ] Relevance scoring for messages
- [ ] Keep important context (system prompts, recent)
- [ ] Prune low-relevance old messages
- [ ] Preserve critical info (file paths, decisions)

### Local Model Support
- [ ] Detect Ollama installation
- [ ] List available Ollama models
- [ ] Pull models if missing
- [ ] Handle model loading time
- [ ] Optimize prompts for smaller models

### Testing
- [ ] Model switching
- [ ] Context compaction strategies
- [ ] Various context sizes

---

## Phase 11: Custom Commands & Checkpoints

**Goal**: User extensibility, code safety

### Custom Slash Commands
- [ ] Command file format (Markdown with frontmatter)
- [ ] Load from `.mimir/commands/` and `~/.mimir/commands/`
- [ ] Parse arguments (`$1`, `$2`, `$ARGUMENTS`)
- [ ] Bash execution support (`!command`)
- [ ] Register with agent
- [ ] `/help` shows custom commands
- [ ] Example commands
- [ ] **Permissions in Commands**
  - Specify required permissions
  - Inherit risk level from definition
  - Support `auto-accept: true` in frontmatter

### Checkpoint System
- [ ] Auto-create before file changes
- [ ] Store git diff and file backups in `.mimir/checkpoints/`
- [ ] **CLI Commands**:
  - `mimir checkpoint list` - show all checkpoints
  - `mimir checkpoint restore <id>` - restore checkpoint
- [ ] **Slash Commands**:
  - `/checkpoint` - create checkpoint now
  - `/undo` - undo last operation
- [ ] Show diff before restore
- [ ] Confirm destructive operations
- [ ] Auto cleanup (keep last N)

### Doctor Command (CLI)
- [ ] `mimir doctor` - run full diagnostics
  - Node.js version check
  - Docker installation check
  - API keys configured
  - File permissions
  - Network connectivity
  - LLM provider connection test
  - MCP server health
- [ ] Suggest fixes
- [ ] Auto-fix when possible

### MIMIR.md Support
- [ ] Load context from `MIMIR.md` (or custom file via config)
- [ ] Include in system prompt
- [ ] Hierarchical MIMIR.md (global + project)
- [ ] Template generation with `mimir init`

### Testing
- [ ] Custom command loading
- [ ] Checkpoint creation/restoration
- [ ] Doctor diagnostics
- [ ] Command permission system

---

## Phase 12: Multi-Agent Collaboration

**Goal**: Multiple agents working together

### Agent Orchestration
- [ ] `AgentOrchestrator` class (use from start when multi-agent added)
- [ ] Spawn multiple agent instances
- [ ] Assign tasks to agents
- [ ] Track agent states

### Task Distribution
- [ ] Parse tasks into subtasks
- [ ] Assign subtasks to agents
- [ ] Define task dependencies
- [ ] Execute in parallel when possible

### Inter-Agent Communication
- [ ] Share results via orchestrator
- [ ] Query other agents' progress
- [ ] Request help from other agents
- [ ] Merge results from multiple agents

### Agent Awareness
- [ ] Know about other active agents
- [ ] Display all activities in UI
- [ ] Show task assignments and progress
- [ ] Highlight conflicts/blockers

### Agent Roles
- [ ] Define roles (reviewer, tester, implementer)
- [ ] Route tasks to specialists
- [ ] Configure expertise in config

### Testing
- [ ] Multi-agent task distribution
- [ ] Inter-agent communication
- [ ] Parallel execution
- [ ] Conflict resolution

---

## Phase 13: Polish & Launch

**Goal**: Production-ready release

### Code Quality
- [ ] 85%+ test coverage
- [ ] Fix all linting errors
- [ ] Address TypeScript strict mode issues
- [ ] Optimize performance bottlenecks
- [ ] Memory leak detection and fixes

### Documentation
- [ ] README with quickstart
- [ ] Installation guide
- [ ] Configuration guide
- [ ] Custom commands guide
- [ ] MCP integration guide
- [ ] Permission system guide
- [ ] API documentation
- [ ] Example projects

### Examples
- [ ] Simple task automation
- [ ] Code review workflow
- [ ] Multi-file refactoring
- [ ] Custom command for team
- [ ] Multi-agent collaboration
- [ ] MCP server integration
- [ ] Permission templates

### Error Messages & UX
- [ ] Review error messages for clarity
- [ ] Add helpful suggestions
- [ ] Improve onboarding
- [ ] Interactive setup wizard

### Performance
- [ ] Benchmark common operations
- [ ] Optimize slow paths
- [ ] Implement caching
- [ ] Profile memory usage

### Security Audit
- [ ] User input handling
- [ ] Command injection vulnerabilities
- [ ] Path traversal vulnerabilities
- [ ] Docker sandbox security
- [ ] Permission system security
- [ ] Dependency audit (npm audit)

### Release
- [ ] Version 1.0.0
- [ ] Build binaries (all platforms)
- [ ] Publish to npm
- [ ] GitHub release

---

## Success Metrics

**MVP (Phase 1-10)**
- [ ] CLI on Windows, macOS, Linux
- [ ] 7+ LLM providers
- [ ] MCP protocol integration
- [ ] Permission & security system
- [ ] Interrupt/cancel support
- [ ] Architect/discuss mode
- [ ] Docker sandbox
- [ ] Conversation history
- [ ] Cost tracking
- [ ] 80%+ test coverage

**v1.0 (Phase 1-13)**
- [ ] All MVP features
- [ ] Multi-agent collaboration
- [ ] Custom commands
- [ ] Alternative instruction system
- [ ] Mode switching
- [ ] Keyboard shortcuts
- [ ] 85%+ test coverage
- [ ] Documentation