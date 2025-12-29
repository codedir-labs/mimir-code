# Roadmap Update - OpenCode Feature Integration

**Date**: 2025-12-28
**Status**: Complete
**Related**: OpenCode vs Mimir Feature Comparison

---

## Summary

Based on the comprehensive analysis of OpenCode's feature set, the following features have been **added to the Mimir roadmap**:

---

## ✅ Added to Roadmap

### Phase 3: LLM Provider Abstraction (Enhanced)

**Additional LLM Providers** (prioritized):
1. ✅ **OpenAI** (Priority 1) - Essential for market reach
2. ✅ **Google/Gemini** (Priority 2) - Growing popularity
3. ✅ **Azure OpenAI** (Priority 3) - Enterprise customers
4. ✅ **Qwen** (Priority 4) - Chinese market, cost-effective
5. ✅ **Ollama (Local)** (Priority 5) - Privacy, offline usage
6. ✅ **Amazon Bedrock** (Priority 6) - AWS enterprise customers
7. ✅ **Google Vertex AI** (Priority 7) - GCP enterprise customers

**Provider OAuth Authentication Abstraction**:
- ✅ Authentication layer (API keys vs OAuth)
- ✅ Browser-based OAuth flow
- ✅ Anthropic account authentication (`/connect anthropic`)
- ✅ Google/Gemini OAuth
- ✅ Azure OAuth (Microsoft)
- ✅ Token management (storage, refresh, expiration)
- ✅ Fallback to API keys
- ✅ Teams mode routing (hide individual accounts)

**Network & Proxy Support**:
- ✅ Proxy configuration (HTTPS_PROXY, HTTP_PROXY, NO_PROXY)
- ✅ Custom certificates (NODE_EXTRA_CA_CERTS)
- ✅ Proxy authentication (Basic, NTLM/Kerberos via gateway)
- ✅ Network diagnostics in `mimir doctor`

**Small Model Optimization**:
- ✅ Separate `smallModel` config for lightweight tasks
- ✅ Automatic task complexity detection
- ✅ Automatic model switching (Haiku/GPT-4o-mini for simple tasks)
- ✅ Cost optimization

---

### Phase 4: Tool System (Enhanced)

**Auto-Formatting Support** (15+ formatters):
- ✅ Auto-detect formatters in project (prettier, eslint, biome, ruff, gofmt, etc.)
- ✅ Auto-run after file writes/edits
- ✅ Built-in formatters:
  - JavaScript/TypeScript: Prettier, Biome, oxfmt
  - Python: Ruff, uv, black
  - Go: gofmt
  - Ruby: Rubocop, StandardRB
  - Others: Dart, Gleam, Terraform, Zig
- ✅ Configuration (enable/disable globally or per-formatter)
- ✅ Custom formatters (with `$FILE` placeholder)

**Timeline**: v1.1 (1 week)

---

### Phase 9: CLI & Terminal UI (Enhanced)

**External Editor Support**:
- ✅ `$EDITOR` environment variable support (VS Code, Vim, Nano, Cursor)
- ✅ `/editor` command for long prompt composition
- ✅ Editor integration (`code --wait`, Cursor, Vim, Nano)
- ✅ File-based composition (temp file workflow)

**Timeline**: v1.1 (3 days)

**Command Palette**:
- ✅ Ctrl+P (configurable) to open command palette
- ✅ Fuzzy search for slash commands, tools, settings
- ✅ Keyboard-first navigation
- ✅ Recent commands priority
- ✅ Inline help text

**Timeline**: v1.1 (1 week)

---

### Phase 13: GitHub/GitLab Integration & Auto-Update (NEW)

**GitHub Integration**:
- ✅ GitHub Actions workflow template (`.github/workflows/mimir.yml`)
- ✅ Trigger on issues/PRs (mention `/mimir`)
- ✅ Code review comments (comment on specific lines)
- ✅ Automatic PR creation
- ✅ Issue triage
- ✅ Custom prompts (override review criteria)

**GitLab Integration**:
- ✅ GitLab CI/CD component integration
- ✅ GitLab Duo integration (mention `@mimir`)
- ✅ Merge request automation
- ✅ Pipeline integration

**Auto-Update System**:
- ✅ Background update checks (daily)
- ✅ Update modes: `true`, `false`, `"notify"`
- ✅ One-click updates (`mimir upgrade`)
- ✅ Release notes display
- ✅ Rollback support (`mimir rollback`)

**Timeline**: v1.2 (3-4 weeks)

---

### Phase 14: Plugin System (NEW)

**See**: `.claude/outputs/architecture/plugin-system-design.md` for full architecture

**Core Plugin Infrastructure**:
- ✅ Plugin loader (disk/npm)
- ✅ Plugin validator (manifest, structure)
- ✅ Plugin registry
- ✅ Event bus (24 events)
- ✅ Plugin context API (fs, exec, config, llm, session, tools)
- ✅ V8 isolate sandbox

**Event System** (24 events across 8 categories):
- Tool events (2): tool.execute.before, tool.execute.after
- Permission events (2): permission.ask, permission.replied
- Session events (6): session.created, session.compacting, session.compacted, session.resumed, session.idle, session.error
- Message events (4): message.added, message.updated, message.removed, chat.message
- Agent events (4): agent.created, agent.started, agent.completed, agent.failed
- File events (2): file.modified, file.deleted
- Command events (2): command.executed, slash.command.executed
- Cost events (2): cost.updated, budget.exceeded

**Plugin API & SDK**:
- ✅ `@mimir/plugin` NPM package
- ✅ TypeScript types
- ✅ Tool builder (`tool()` helper)
- ✅ Plugin development docs
- ✅ 5+ example plugins

**Plugin Distribution**:
- ✅ NPM distribution (`mimir-plugin-*`)
- ✅ Plugin CLI commands (list, install, enable, disable, uninstall, info)
- ✅ Plugin marketplace (GitHub-based)
- ✅ Plugin discovery UI
- ✅ Security review process

**Security & Capabilities**:
- ✅ Capability-based security (explicit permissions in manifest)
- ✅ Plugin manifest (`plugin.yml`)
- ✅ Resource limits (CPU, memory, execution time)
- ✅ Audit logging
- ✅ Teams enforcement (allowlists/blocklists)

**Teams Integration**:
- ✅ Organization-wide plugins
- ✅ Plugin allowlist enforcement
- ✅ Required plugins (compliance)
- ✅ Plugin usage analytics

**Migration & Compatibility**:
- ✅ PreCompact hook → plugin (implement as built-in plugin)
- ✅ Backward compatibility (all existing hooks, tools, commands continue to work)
- ✅ No breaking changes

**Timeline**: v1.2 (Phase 1-3: 5-7 weeks), v2.0 (Phase 4: 3-4 weeks)

---

## Updated Implementation Timeline

### v1.0 (MVP - 4-6 months)

1. Config/Teams Foundation (Phase 2) - 2-3 weeks
2. **LLM Providers** (Phase 3) - Add OpenAI, Google/Gemini, proxy/auth - **2-3 weeks**
3. Tool System (Phase 4) - Built-in + custom + MCP - 3-4 weeks
4. Docker Sandbox (Phase 5) - 1-2 weeks
5. ReAct Agent Loop (Phase 6) - 2 weeks
6. Conversation History (Phase 7) - 1 week
7. Token Counting & Cost (Phase 8) - 1 week
8. CLI & Terminal UI (Phase 9) - 2-3 weeks
9. Agent Orchestration (Phase 10) - 3-4 weeks

**Total**: ~18-27 weeks (4-6 months)

### v1.1 (Quick Wins - 1.5-2 months)

1. **Auto-Formatting Support** - 1 week ⭐
2. **External Editor Support** - 3 days ⭐
3. **Proxy & Certificate Support** - 1 week ⭐
4. **Small Model Optimization** - 1 week ⭐
5. **Command Palette** - 1 week ⭐
6. Model Switching & Context (Phase 11) - 2 weeks
7. Custom Commands & Checkpoints (Phase 12) - 2-3 weeks

**Total**: ~7-9 weeks (1.5-2 months)

### v1.2 (Ecosystem & Integration - 2-3 months)

1. **GitHub/GitLab Integration** - 3-4 weeks ⭐
2. **Auto-Update System** - 1 week ⭐
3. **Plugin System** (Phase 1-3) - 5-7 weeks ⭐

**Total**: ~9-12 weeks (2-3 months)

### v2.0 (Mature Ecosystem - 6-12 months post-v1.0)

1. **Plugin Marketplace** - 3-4 weeks ⭐
2. 50+ Community Plugins - Ongoing
3. Advanced Teams Features - 4-6 weeks
4. Multi-Environment Operation (Desktop, Web UI) - 8-12 weeks
5. AI Gateway (Mimir Cloud) - 12+ weeks

**Timeline**: 6-12 months post-v1.0

---

## Key Architectural Decisions

### 1. Plugin System Coexists with Existing Extensibility

**PreCompact Hooks** (Keep):
- Simple, configuration-driven
- YAML-based
- User-friendly for non-developers

**Custom Tools** (Keep):
- YAML + TypeScript definitions
- Docker sandbox execution
- Rich context access

**Custom Commands** (Keep):
- YAML-based prompt substitution
- Simple and effective

**Plugin System** (New):
- Event-driven architecture (24 events)
- In-process execution (V8 isolates)
- Comprehensive interception capabilities
- NPM distribution

**All four coexist** - Different users, different use cases. No breaking changes.

### 2. Provider OAuth Abstraction

**Support Both Auth Methods**:
- API keys (current method)
- OAuth/account-based (new method)

**Provider Priority**:
- Anthropic: OAuth via `/connect anthropic` (like OpenCode)
- Google/Gemini: OAuth flow
- Azure: Microsoft OAuth
- OpenAI: API keys (may add OAuth later)

**Teams Mode**:
- Route all auth through Teams API
- Hide individual accounts
- Centralized credential management

### 3. Security-First Plugin System

**V8 Isolates**:
- Plugins run in isolated contexts (like Cloudflare Workers)
- Better security than OpenCode's trust-based model

**Capability-Based Security**:
- Explicit permissions in `plugin.yml` manifest
- No access unless granted
- Resource limits (CPU, memory, time)

**Teams Enforcement**:
- Enterprise can enforce plugin allowlists
- Required compliance plugins
- Plugin usage analytics

---

## Features NOT Added to Roadmap

### Deferred to Post-v2.0

**Multi-Environment Operation**:
- Desktop app (Electron/Tauri)
- Web UI (browser-based)
- IDE plugins (beyond terminal integration)
- **Reason**: Large effort, focus on CLI first

**Share Feature** (Public Links):
- Share conversations via public URLs
- **Reason**: Low priority, privacy concerns, self-hosting complexity

**AI Gateway (Mimir Cloud)**:
- Managed gateway like OpenCode Zen
- **Reason**: Revenue model undecided, focus on BYOK + Teams

**SDK for Programmatic Access**:
- Requires headless server mode first
- **Reason**: v2.0+ after CLI is mature

### Not Planned

**mdns Service Discovery**:
- Network service discovery for multi-device
- **Reason**: Niche use case, complexity

**Session Export/Import**:
- Import from other tools (Cursor, Aider)
- **Reason**: Low priority, export already planned

---

## Competitive Positioning

### Mimir's Unique Advantages (Keep Focus)

1. ✅ **Multi-Agent Orchestration** - 7+ specialized roles vs OpenCode's 2 subagents
2. ✅ **Enterprise Teams Architecture** - Multi-org, auto-detection, enforcement
3. ✅ **Advanced Permission System** - Risk assessment, audit trails, sandboxing
4. ✅ **Multiple Execution Modes** - Native/dev container/docker/cloud
5. ✅ **Hierarchical Memory** - MIMIR.md with overrides and imports
6. ✅ **Cost Analytics** - Provider comparison, recommendations
7. ✅ **Cloud Sandboxes (Teams)** - Enterprise security isolation
8. ✅ **LLM Proxy (Teams)** - Hide keys, enforce budgets

### New Features Close Gap with OpenCode

1. ✅ **Plugin System** - Event-driven extensibility (24 events, V8 isolates)
2. ✅ **Auto-Formatting** - 15+ built-in formatters
3. ✅ **Provider OAuth** - Anthropic account, Google/Gemini auth
4. ✅ **Proxy Support** - Enterprise network compatibility
5. ✅ **GitHub/GitLab Integration** - CI/CD automation
6. ✅ **Auto-Update** - Better UX for updates

### OpenCode Advantages (Accept)

1. ❌ **75+ LLM Providers** - Mimir targets 7-10 providers (quality over quantity)
2. ❌ **Multi-Environment** - Mimir focuses on CLI excellence first
3. ❌ **Mature Ecosystem** - Mimir will build ecosystem post-v1.0
4. ❌ **Share Feature** - Not a priority for Mimir's enterprise focus

---

## Strategic Recommendations

### Short-term (v1.0 - v1.1)

**Focus on Core Differentiators**:
1. Complete Tool System (Phase 4)
2. Complete Agent Orchestration (Phase 10)
3. Complete Teams Integration (Phase 2)

**Add Quick Wins** (v1.1):
1. Auto-formatting (1 week)
2. External editor (3 days)
3. Proxy support (1 week)
4. Small model optimization (1 week)

### Medium-term (v1.2)

**Build Ecosystem**:
1. Plugin system (5-7 weeks)
2. GitHub/GitLab integration (3-4 weeks)
3. Auto-update (1 week)

### Long-term (v2.0+)

**Expand Reach**:
1. Plugin marketplace
2. 50+ community plugins
3. Multi-environment operation (Desktop, Web UI)
4. Consider AI Gateway (if revenue model fits)

---

## Conclusion

The roadmap has been significantly enhanced with **10 new features** inspired by OpenCode:

**Phase 3 (LLM Providers)**: 7 additional providers, OAuth auth, proxy support, small model optimization

**Phase 4 (Tool System)**: Auto-formatting support

**Phase 9 (CLI & TUI)**: External editor support, command palette

**Phase 13 (NEW)**: GitHub/GitLab integration, auto-update system

**Phase 14 (NEW)**: Plugin system with 24 events, V8 isolates, NPM distribution

**Key Principles**:
- ✅ No breaking changes (plugins coexist with existing extensibility)
- ✅ Security-first (V8 isolates, capability-based permissions)
- ✅ Enterprise-ready (Teams plugin management)
- ✅ Community-friendly (NPM distribution, marketplace)

**Timeline**: v1.0 in 4-6 months, v1.1 in 1.5-2 months, v1.2 in 2-3 months, v2.0 in 6-12 months post-v1.0

**Strategic Focus**: Enterprise teams with advanced orchestration, security, and compliance. Compete on sophistication, not breadth.
