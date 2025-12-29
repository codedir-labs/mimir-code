# OpenCode vs Mimir Feature Comparison

**Date**: 2025-12-28
**Status**: Analysis Complete
**Purpose**: Identify feature gaps and unique differentiators between OpenCode and Mimir

---

## Executive Summary

**OpenCode** is a mature, production-ready AI coding agent CLI with 41K+ GitHub stars and ~400K monthly users. It emphasizes:
- 75+ LLM provider support via AI SDK
- Multi-environment operation (Terminal, Desktop, IDE, Web UI, Headless Server)
- Extensive ecosystem (plugins, SDK, API)
- Enterprise features (SSO, private registry, sharing control)

**Mimir** is a platform-agnostic BYOK AI coding agent CLI in development. It emphasizes:
- Enterprise Teams support with multi-organization architecture
- Advanced multi-agent orchestration with specialized roles
- Comprehensive permission system with risk assessment
- Multiple execution modes (native, dev container, docker, cloud)

---

## 🔴 Features OpenCode Has That Mimir Lacks

### 1. **Multi-Environment Operation**
**OpenCode**: Terminal TUI, Desktop app, Web UI, IDE plugins, Headless server
**Mimir**: Terminal TUI only (planned)

**Gap**: Mimir should consider:
- Desktop app (Electron/Tauri)
- Web UI for browser-based usage
- IDE plugins beyond terminal integration

### 2. **75+ LLM Provider Support via AI SDK**
**OpenCode**: Supports 75+ providers through AI SDK and Models.dev integration
**Mimir**: 2 providers (DeepSeek, Anthropic), 4 more planned (OpenAI, Google/Gemini, Qwen, Ollama)

**Gap**: Mimir should consider:
- Azure OpenAI
- Amazon Bedrock
- Google Vertex AI
- LM Studio, llama.cpp
- AI SDK integration for broader provider support

### 3. **OpenCode Zen (AI Gateway)**
**OpenCode**: Curated AI gateway with tested models, pay-as-go pricing, team features (RBAC, spending limits, BYOK)
**Mimir**: No equivalent gateway service (relies on user's own API keys or Teams LLM proxy)

**Gap**: Consider if Mimir should offer:
- Optional managed gateway for non-enterprise users
- Model recommendations/curation
- Simplified onboarding without API key setup

### 4. **Share Feature (Public Links)**
**OpenCode**: Share conversations via public URLs (`opncd.ai/s/<share-id>`), auto/manual modes
**Mimir**: No sharing feature

**Gap**: Low priority, but could be useful for:
- Collaboration and debugging help
- Showcasing Mimir capabilities
- Enterprise customers may want self-hosted sharing infrastructure

### 5. **Extensive Plugin System**
**OpenCode**: JavaScript/TypeScript plugins for events (Commands, Files, LSP, Messages, Permissions, Sessions, Tools, TUI)
**Mimir**: No plugin system (has custom tools and custom commands, but not full event-driven plugins)

**Gap**: Mimir should consider:
- Event-driven plugin architecture
- Community plugin marketplace
- Hooks for: pre-tool execution, post-message, session start/end, etc.

### 6. **Code Formatters (Auto-formatting)**
**OpenCode**: 15+ built-in formatters (Prettier, Biome, Ruff, gofmt, etc.), automatic formatting after write/edit
**Mimir**: No auto-formatting

**Gap**: Add built-in formatter integration:
- Detect formatters in project (prettier, eslint, biome, etc.)
- Auto-run after file writes
- Configurable enable/disable

### 7. **GitHub & GitLab Integration**
**OpenCode**:
- GitHub Actions integration (mention `/opencode` in issues/PRs)
- GitLab CI/CD integration and GitLab Duo
- Automated triage, fix, and PR creation

**Mimir**: No CI/CD integration

**Gap**: Consider adding:
- GitHub Actions workflow
- GitLab CI integration
- Automated issue triage and PR creation
- Code review automation

### 8. **SDK for Programmatic Access**
**OpenCode**: `@opencode-ai/sdk` for JavaScript/TypeScript with full API coverage
**Mimir**: No SDK (headless server mode not yet implemented)

**Gap**: Add SDK once headless server is implemented:
- TypeScript/JavaScript SDK
- Python SDK (for data science workflows)
- REST API documentation

### 9. **Community Ecosystem**
**OpenCode**:
- 15+ community plugins
- Discord bot for session control
- Neovim integration
- Mobile-first web UI
- "awesome-opencode" repository

**Mimir**: No ecosystem yet (project in development)

**Gap**: Ecosystem development (post-v1.0):
- Community guidelines and contribution docs
- Example projects and templates
- Plugin/tool marketplace
- Integration examples

### 10. **Session Export/Import**
**OpenCode**: Export sessions as JSON, import from files or share URLs
**Mimir**: Planned export (Markdown/JSON), no import feature

**Gap**: Add import functionality:
- Import from JSON
- Import from other tools (Cursor, Aider, etc.)
- Migration tools

### 11. **Advanced TUI Features**
**OpenCode**:
- Timeline view for sessions
- Message scrolling with Page Up/Down
- Username visibility toggle
- External editor composition (`EDITOR` env var)
- Command palette (Ctrl+P)

**Mimir**: Basic TUI planned, some features missing

**Gap**: Enhance TUI with:
- Timeline view
- External editor support
- Command palette
- Session switching UI

### 12. **Network & Proxy Support**
**OpenCode**:
- Full proxy support (HTTPS_PROXY, HTTP_PROXY, NO_PROXY)
- NTLM/Kerberos authentication (via gateway)
- Custom certificates (NODE_EXTRA_CA_CERTS)

**Mimir**: No documented proxy support

**Gap**: Add enterprise network support:
- Proxy configuration
- Custom CA certificates
- Corporate firewall compatibility

### 13. **mdns Service Discovery**
**OpenCode**: Network service discovery for multi-device access
**Mimir**: No service discovery

**Gap**: Low priority, but useful for:
- Multi-device workflows
- Remote access in local networks

### 14. **Small Model Configuration**
**OpenCode**: Separate `small_model` for lightweight tasks (title generation, etc.)
**Mimir**: No small model concept

**Gap**: Add small model optimization:
- Use cheaper/faster models for simple tasks
- Automatic task complexity detection
- Cost optimization

### 15. **Autoupdate System**
**OpenCode**: Auto-download updates with `true`, `false`, or `"notify"` modes
**Mimir**: Manual updates (planned `mimir upgrade`)

**Gap**: Consider auto-update for better UX:
- Background update checks
- One-click updates
- Release notes display

---

## 🟢 Features Mimir Has That OpenCode Lacks

### 1. **Multi-Agent Orchestration with Specialized Roles**
**Mimir**: Full multi-agent system with 7+ specialized roles (finder, thinker, librarian, refactoring, reviewer, tester, security, rush)
**OpenCode**: 2 subagents only (General, Explore)

**Advantage**: Mimir's multi-agent orchestration is significantly more advanced:
- Task decomposition with LLM-powered planning
- Parallel and sequential execution
- Quality gates enforcement
- Role-based tool restrictions
- Dynamic workflow patterns

### 2. **Enterprise Teams with Multi-Organization Architecture**
**Mimir**:
- Multi-org support (GitHub-like single login, multiple organizations)
- Team-based workspaces with auto-detection from git remote
- Per-user budget enforcement within teams
- Configuration enforcement (allowed models, forced sub-agents, etc.)

**OpenCode**: Basic team features in OpenCode Zen (RBAC, spending limits, BYOK), but no multi-org architecture

**Advantage**: Mimir's Teams architecture is more sophisticated:
- Multiple teams per repository
- Auto-detection from git remotes
- Hierarchical organization structure
- Per-user budgets within teams

### 3. **Multiple Execution Modes**
**Mimir**: 4 execution modes (Native, Dev Container, Docker, Cloud)
**OpenCode**: Single execution mode (native)

**Advantage**: Mimir offers flexibility and security:
- Auto-detect dev containers
- User-provided Docker images
- Cloud execution for enterprise
- Security isolation options

### 4. **Advanced Permission System with Risk Assessment**
**Mimir**:
- Risk levels (low, medium, high, critical)
- Allowlist/blocklist with glob patterns and regex
- Risk assessment before execution
- Audit trail with HMAC signing
- Filesystem restrictions (read anywhere, write in project only)

**OpenCode**: Basic permissions (ask/allow/deny) per tool

**Advantage**: Mimir's permission system is more granular:
- Automatic risk assessment
- Command pattern matching
- Immutable audit logs
- Filesystem boundaries

### 5. **Context Management with Auto-Compact**
**Mimir**:
- Auto-compact at 95% context capacity
- Manual compaction with custom instructions
- Relevance-based message scoring
- PreCompact hooks for cleanup tasks

**OpenCode**: Manual `/compact` only

**Advantage**: Mimir's context management is more automated:
- Transparent auto-compact
- Intelligent message pruning
- Hook system for cleanup

### 6. **Hierarchical Memory System (MIMIR.md)**
**Mimir**:
- Project memory (`.mimir/MIMIR.md`)
- Local memory (`MIMIR.local.md`)
- Global memory (`~/.mimir/MIMIR.md`)
- Enterprise policy (highest priority)
- Path-specific rules with glob patterns (`.mimir/rules/`)
- Import syntax (`@path/to/file`, max 5 hops)

**OpenCode**: Single `AGENTS.md` file (project or global)

**Advantage**: Mimir's memory system is more hierarchical:
- Multi-level overrides
- Modular rules organization
- Enterprise policy enforcement
- Lazy loading with imports

### 7. **Comprehensive Tool System**
**Mimir**:
- Custom tools with TypeScript runtime
- Docker sandbox execution for custom tools
- Full context injection (platform, config, conversation, logger, LLM)
- Token cost tracking per tool
- `/tools tokens` command with visual chart

**OpenCode**: Custom tools via plugins (simpler)

**Advantage**: Mimir's tool system is more powerful:
- Sandboxed execution
- Token cost visibility
- Rich context access
- TypeScript compilation

### 8. **Checkpoint System**
**Mimir**:
- Full filesystem snapshots
- Per-conversation snapshot directories
- Agent-specific snapshots
- Timeline visualization
- Diff between snapshots
- Restore with conflict resolution

**OpenCode**: `/undo` and `/redo` with Git only

**Advantage**: Mimir's checkpoints are more comprehensive:
- Beyond Git (entire filesystem state)
- Conversation-aware
- Multi-agent snapshots

### 9. **Cost Analytics with Provider Comparison**
**Mimir**:
- `mimir cost today/week/month/compare`
- Comparison table between providers
- Savings calculation
- Historical trends
- Recommend cheaper alternatives
- Export to CSV

**OpenCode**: `opencode stats` (basic token usage)

**Advantage**: Mimir's cost analytics are more detailed:
- Provider comparison
- Cost optimization recommendations
- Time-series analysis

### 10. **Doctor Command (Diagnostics)**
**Mimir**:
- `mimir doctor` - comprehensive diagnostics
- Auto-detect and suggest fixes
- Auto-fix when possible
- Check: Node.js, Docker, API keys, file permissions, network, LLM provider, MCP server health, Teams connection

**OpenCode**: No diagnostic command

**Advantage**: Mimir's doctor command improves DX:
- Proactive problem detection
- Guided troubleshooting
- Automatic fixes

### 11. **Alternative Instruction System**
**Mimir**:
- "edit" option in permission prompts to provide alternative instruction
- Ctrl+E keyboard shortcut for alternative instruction
- Agent re-plans based on feedback

**OpenCode**: No alternative instruction system

**Advantage**: Better UX for correcting the agent:
- In-context feedback
- No need to restart conversation
- Agent learns from corrections

### 12. **Cloud Sandboxes (Teams)**
**Mimir**:
- Execute Docker containers in cloud environment (Teams mode)
- Centralized audit logs
- Network proxy with allowlisting
- Enterprise compliance (SOC 2, ISO 27001, GDPR ready)

**OpenCode**: No cloud sandbox execution

**Advantage**: Better for enterprise security:
- Zero trust architecture
- Centralized monitoring
- Compliance-ready

### 13. **LLM Proxy (Teams)**
**Mimir**:
- Route all LLM calls through Teams backend
- Per-user budget enforcement (hard limits)
- Hide individual API keys
- Usage tracking (tokens, cost, requests)

**OpenCode**: OpenCode Zen provides gateway, but no full proxy architecture

**Advantage**: Mimir's LLM proxy provides:
- Complete key abstraction
- Granular budget control
- Enterprise visibility

### 14. **Workspace Team Auto-Detection**
**Mimir**:
- Auto-detect team from git repository URL
- Parse git remote URLs (GitHub, GitLab, Bitbucket)
- Cache team mappings locally (7-day TTL)
- Support multiple teams per repository

**OpenCode**: No auto-detection (manual org selection)

**Advantage**: Seamless team experience:
- Zero-config team detection
- Multi-team support
- Git-based discovery

---

## 🟡 Shared Features (Different Implementation)

### 1. **Configuration System**
**OpenCode**:
- Hierarchy: Global → Project → Env var → CLI flag
- JSON/JSONC format
- Variable substitution (`{env:VAR}`, `{file:path}`)

**Mimir**:
- Hierarchy: Default → Teams (enforced) → Global → Project → Env → CLI flag
- YAML format
- Zod schema validation
- Teams config cannot be overridden

**Difference**: Mimir adds Teams enforcement layer and uses YAML instead of JSON.

### 2. **Agent System**
**OpenCode**:
- Primary agents (Build, Plan) switchable with Tab
- 2 subagents (General, Explore)
- JSON or Markdown configuration

**Mimir**:
- 3 modes (Plan, Act, Discuss/Architect)
- 7+ specialized sub-agent roles
- Multi-agent orchestration with task decomposition

**Difference**: Mimir has more sophisticated orchestration and more specialized roles.

### 3. **Custom Commands**
**OpenCode**:
- Markdown files in `.opencode/command/`
- JSON configuration alternative
- Placeholders: `$ARGUMENTS`, `$1-$9`, `!command`, `@filename`

**Mimir**:
- YAML files in `.mimir/commands/`
- Placeholders: `$ARGUMENTS`, `$1-$3`
- Permissions in frontmatter

**Difference**: Similar functionality, different formats. OpenCode has more placeholder types.

### 4. **Keyboard Shortcuts**
**OpenCode**:
- Leader key system (default `Ctrl+X`)
- Leader timeout (1 second)
- Extensive shortcuts for navigation, session management, input editing

**Mimir**:
- Configurable shortcuts in YAML
- No leader key (yet)
- Platform-specific handling (Cmd on macOS)
- `formatKeyboardShortcut()` for icon rendering

**Difference**: OpenCode has leader key system (vim-like), Mimir has more visual formatting.

### 5. **MCP (Model Context Protocol) Support**
**OpenCode**:
- Local and remote MCP servers
- OAuth support with Dynamic Client Registration
- Notable servers: Sentry, Context7, Grep by Vercel

**Mimir**:
- MCP Client with stdio/HTTP transports
- Server lifecycle management
- Namespacing (server/tool)
- Conflict handling

**Difference**: Similar functionality, Mimir emphasizes lifecycle management and conflict handling.

### 6. **Theme System**
**OpenCode**:
- 10 built-in themes
- Custom themes with JSON
- Dark/light variants
- System theme adapts to terminal background

**Mimir**:
- 7 themes (dark, light, dark-ansi, light-ansi, dark-colorblind, light-colorblind, mimir)
- Custom themes with JSON
- Theme system integrated with Ink UI

**Difference**: OpenCode has more built-in themes, similar customization.

### 7. **Tool System**
**OpenCode**:
- 12 built-in tools
- Custom tools via plugins
- MCP tools
- Global and per-agent configuration

**Mimir**:
- 4 core built-in tools (planned)
- Custom tools with TypeScript runtime and Docker sandbox
- MCP tools
- Token cost tracking
- `/tools tokens` command

**Difference**: Mimir has fewer built-in tools but more sophisticated custom tool system.

### 8. **Permission System**
**OpenCode**:
- Per-tool permissions (ask/allow/deny)
- Per-command wildcards for bash
- `doom_loop` prevention (same tool 3x)
- `external_directory` protection

**Mimir**:
- Risk assessment (low/medium/high/critical)
- Allowlist/blocklist with glob and regex
- Audit trail with HMAC signing
- Filesystem restrictions
- "edit" option for alternative instruction

**Difference**: Mimir has more sophisticated risk assessment and audit trail.

### 9. **LSP Integration**
**OpenCode**:
- LSP tool (experimental)
- Code intelligence features

**Mimir**:
- Planned LSP tool
- Not yet implemented

**Difference**: OpenCode has working LSP (experimental), Mimir planning.

### 10. **Session Management**
**OpenCode**:
- `opencode session list`
- `/sessions` command (Ctrl+X L)
- Resume with `-s` flag or `-c` for last session
- Session export/import

**Mimir**:
- `mimir history list/resume/export/clear`
- `/resume <session>` command
- SQLite storage with conversations, messages, tool_calls

**Difference**: Similar functionality, different command naming. Mimir has more detailed storage schema.

---

## 📊 Feature Gap Analysis

### Critical Gaps for Mimir v1.0

**Priority 1: Essential for MVP**
1. ✅ Additional LLM providers (at least OpenAI, Google/Gemini) - **Already planned**
2. ✅ Tool system implementation - **Already planned (Priority 2)**
3. ✅ Agent orchestration - **Already planned (Priority 3)**
4. ❌ Auto-formatting (15+ formatters) - **NOT on roadmap**
5. ❌ External editor support (`EDITOR` env var) - **NOT on roadmap**

**Priority 2: Important for Adoption**
1. ❌ Multi-environment operation (Desktop app, Web UI) - **NOT on roadmap**
2. ❌ SDK for programmatic access - **NOT on roadmap**
3. ❌ Plugin system (event-driven) - **NOT on roadmap**
4. ❌ GitHub/GitLab integration - **NOT on roadmap**
5. ❌ Proxy support for enterprise networks - **NOT on roadmap**

**Priority 3: Nice to Have**
1. ❌ Share feature (public links) - **NOT on roadmap**
2. ❌ Auto-update system - **NOT on roadmap**
3. ❌ Small model optimization - **NOT on roadmap**
4. ❌ Community ecosystem tools - **NOT on roadmap (post-v1.0)**

### Unique Mimir Advantages (Keep & Enhance)

**Core Differentiators**:
1. ✅ Multi-agent orchestration with 7+ specialized roles
2. ✅ Enterprise Teams with multi-org architecture
3. ✅ Multiple execution modes (native/dev container/docker/cloud)
4. ✅ Advanced permission system with risk assessment
5. ✅ Hierarchical memory system (MIMIR.md)
6. ✅ Comprehensive checkpoint system
7. ✅ Cost analytics with provider comparison
8. ✅ Doctor command (diagnostics)
9. ✅ Alternative instruction system
10. ✅ Cloud sandboxes (Teams)
11. ✅ LLM proxy (Teams)
12. ✅ Workspace team auto-detection

**Recommendations**: These are Mimir's competitive advantages. Double down on:
- Multi-agent orchestration (make it the best in class)
- Enterprise Teams (target enterprise market)
- Security and compliance (SOC 2, ISO 27001, GDPR)
- Cost optimization (provider comparison, recommendations)

---

## 🎯 Recommendations for Mimir Roadmap

### Add to Roadmap (High Priority)

1. **Auto-Formatting Support** (1 week)
   - Detect formatters in project (prettier, eslint, biome, ruff, etc.)
   - Auto-run after file writes/edits
   - Configurable enable/disable
   - **Value**: Expected feature for code quality

2. **External Editor Support** (3 days)
   - `EDITOR` environment variable support
   - `/editor` command (Ctrl+X E)
   - Compose messages in preferred editor (VS Code, Vim, etc.)
   - **Value**: Better UX for long prompts

3. **Proxy & Certificate Support** (1 week)
   - HTTPS_PROXY, HTTP_PROXY, NO_PROXY
   - Custom CA certificates (NODE_EXTRA_CA_CERTS)
   - Corporate firewall compatibility
   - **Value**: Essential for enterprise adoption

4. **Additional LLM Providers** (2-3 weeks)
   - OpenAI (priority 1)
   - Google Gemini (priority 2)
   - Azure OpenAI (priority 3 - enterprise)
   - Qwen, Ollama (priority 4)
   - **Value**: Competitive parity with OpenCode

5. **Small Model Optimization** (1 week)
   - Separate `small_model` config for lightweight tasks
   - Automatic task complexity detection
   - Use Haiku/GPT-4o-mini for simple tasks
   - **Value**: Cost optimization

### Consider for v1.1+ (Medium Priority)

1. **Plugin System** (3-4 weeks)
   - Event-driven architecture
   - Hooks: pre-tool, post-message, session start/end
   - Plugin marketplace
   - **Value**: Community extensibility

2. **SDK for Programmatic Access** (2-3 weeks)
   - Requires headless server implementation first
   - TypeScript/JavaScript SDK
   - REST API with OpenAPI spec
   - **Value**: Integration with other tools

3. **Command Palette** (1 week)
   - Ctrl+P for command access
   - Fuzzy search for commands
   - Keyboard-first navigation
   - **Value**: Better UX

4. **GitHub/GitLab Integration** (2-3 weeks)
   - GitHub Actions workflow
   - GitLab CI integration
   - Automated issue triage and PR creation
   - **Value**: CI/CD automation

5. **Auto-Update System** (1 week)
   - Background update checks
   - One-click updates
   - Release notes display
   - **Value**: Better UX for non-technical users

### Consider for v2.0+ (Low Priority)

1. **Multi-Environment Operation** (8-12 weeks)
   - Desktop app (Electron/Tauri)
   - Web UI (browser-based)
   - IDE plugins (VS Code, JetBrains)
   - **Value**: Broader user base

2. **Share Feature** (2-3 weeks)
   - Public URLs for conversation sharing
   - Self-hosted infrastructure option
   - Privacy controls
   - **Value**: Collaboration and showcasing

3. **AI Gateway (Mimir Cloud)** (12+ weeks)
   - Optional managed gateway for non-enterprise users
   - Curated model recommendations
   - Pay-as-you-go pricing
   - **Value**: Revenue opportunity, simplified onboarding

4. **Community Ecosystem** (Ongoing)
   - Plugin marketplace
   - Example projects and templates
   - Integration examples
   - Community guidelines
   - **Value**: Long-term growth

---

## 📈 Market Positioning

### OpenCode Positioning
- **Target**: Individual developers, small teams
- **Strengths**: Ease of use, extensive provider support, ecosystem
- **Pricing**: Free (BYOK) + OpenCode Zen (pay-as-you-go)

### Mimir Positioning (Recommended)
- **Target**: Enterprise teams, security-conscious organizations
- **Strengths**: Multi-agent orchestration, Teams architecture, security/compliance
- **Pricing**: Free (BYOK individual) + Mimir Teams (per-seat enterprise)

### Differentiation Strategy
1. **Multi-Agent Orchestration**: Position as "most advanced multi-agent system"
2. **Enterprise Teams**: Target Fortune 500 with multi-org, compliance, security
3. **Cost Optimization**: Market cost analytics and provider comparison
4. **Security First**: Emphasize risk assessment, audit trails, sandboxing

### Competitive Advantages
- ✅ More sophisticated multi-agent orchestration than OpenCode
- ✅ Better enterprise architecture (multi-org, auto-detection)
- ✅ More advanced permission system and security
- ✅ Better cost visibility and optimization
- ❌ Smaller ecosystem (but addressable post-v1.0)
- ❌ Fewer LLM providers (but addressable in v1.0)

---

## 📝 Conclusion

**Mimir has strong differentiation in:**
1. Multi-agent orchestration (7+ specialized roles vs 2 subagents)
2. Enterprise Teams architecture (multi-org, auto-detection, enforcement)
3. Security and compliance (risk assessment, audit trails, sandboxing)
4. Cost optimization (analytics, provider comparison, recommendations)

**Mimir should add (critical gaps):**
1. Auto-formatting support
2. External editor support
3. Proxy & certificate support
4. Additional LLM providers (OpenAI, Google, Azure)
5. Small model optimization

**Mimir should defer (nice to have):**
1. Multi-environment operation (Desktop, Web UI)
2. Share feature
3. AI Gateway (Mimir Cloud)
4. Community ecosystem (focus post-v1.0)

**Strategic Focus**:
- **v1.0**: Complete core features + critical gaps above
- **v1.1**: Plugin system, SDK, GitHub/GitLab integration
- **v2.0**: Multi-environment, ecosystem, potential AI gateway

**Market Position**: Target enterprise teams with advanced orchestration, security, and compliance. Compete on sophistication, not breadth.
