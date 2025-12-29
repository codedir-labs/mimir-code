# Mimir Plugin System Architecture

**Date**: 2025-12-28
**Status**: Design Complete - Implementation Planned for v1.2+
**Related**: OpenCode Feature Comparison

---

## Overview

Mimir will implement an **event-driven plugin system** inspired by OpenCode, enabling community extensibility while maintaining security and performance. Plugins will coexist with existing hooks and custom tools.

---

## Key Design Decisions

### 1. Plugins vs Hooks vs Custom Tools

**PreCompact Hooks** (Keep):
- Simple, configuration-driven
- Single purpose (cleanup before compaction)
- User-friendly for non-developers

**Custom Tools** (Keep):
- YAML + TypeScript definitions
- Docker sandbox execution
- Rich context access
- Tool-specific functionality

**Plugin System** (New):
- Event-driven architecture (24 events)
- In-process execution (V8 isolates)
- Comprehensive interception capabilities
- NPM distribution

**All three coexist** - Different users, different use cases.

---

## Event Architecture

### Event Categories (24 events)

**Tool Events** (2):
- `tool.execute.before` - Pre-execution validation
- `tool.execute.after` - Post-execution processing

**Permission Events** (2):
- `permission.ask` - Auto-approve/deny permissions
- `permission.replied` - Audit permission decisions

**Session Events** (6):
- `session.created` - New conversation started
- `session.compacting` - Before context compaction
- `session.compacted` - After compaction complete
- `session.resumed` - Resume from history
- `session.idle` - Session ended
- `session.error` - Session error occurred

**Message Events** (4):
- `message.added` - New message added
- `message.updated` - Message edited
- `message.removed` - Message deleted
- `chat.message` - Intercept before LLM call

**Agent Events** (4):
- `agent.created` - Sub-agent created (orchestration)
- `agent.started` - Agent begins execution
- `agent.completed` - Agent finishes successfully
- `agent.failed` - Agent error/failure

**File Events** (2):
- `file.modified` - File write/edit operation
- `file.deleted` - File deletion

**Command Events** (2):
- `command.executed` - After CLI command execution
- `slash.command.executed` - After slash command

**Cost Events** (2):
- `cost.updated` - Token/cost tracking update
- `budget.exceeded` - Budget limit exceeded

---

## Plugin API Design

### Plugin Structure

```typescript
import type { Plugin } from '@mimir/plugin';
import { tool } from '@mimir/plugin';
import { z } from 'zod';

export const MyMimirPlugin: Plugin = async (ctx) => {
  // Context access
  const { fs, exec, docker, config, llm, session, tools, project } = ctx;

  return {
    // Register custom tools
    tools: [
      tool({
        name: 'my-tool',
        description: 'Custom tool description',
        schema: z.object({
          input: z.string(),
        }),
        async execute(args, ctx) {
          // Tool implementation
          return { success: true, data: 'result' };
        }
      })
    ],

    // Event handlers
    on: {
      'tool.execute.before': async (event) => {
        // Intercept tool execution
        if (event.tool === 'bash' && event.args.command.includes('rm -rf /')) {
          throw new Error('Dangerous command blocked by plugin');
        }
      },

      'session.compacting': async (event) => {
        // Custom compaction logic (replaces PreCompact hook)
        await ctx.exec('cleanup-script.sh', { trigger: event.trigger });
      },

      'permission.ask': async (event) => {
        // Auto-approve safe commands
        if (event.command.startsWith('npm install')) {
          return { allow: true };
        }
      },

      'agent.created': async (event) => {
        // Track multi-agent orchestration
        console.log(`Sub-agent: ${event.agent.role} (${event.agent.model})`);
      },

      'cost.updated': async (event) => {
        // Custom budget alerts
        if (event.totalCost > 10) {
          await ctx.notify('Budget warning: $10 exceeded');
        }
      }
    },

    // Authentication providers (for OAuth, Teams SSO, etc.)
    auth: {
      providers: {
        'custom-sso': async (config) => {
          return { token: await getToken() };
        }
      }
    },

    // Custom slash commands
    commands: [
      {
        name: 'my-command',
        description: 'Custom slash command',
        async execute(args, ctx) {
          return { success: true };
        }
      }
    ]
  }
}
```

### Plugin Context

```typescript
interface PluginContext {
  // Platform abstractions
  fs: IFileSystem;
  exec: IProcessExecutor;
  docker: IDockerClient;

  // Configuration (read-only)
  config: Config;

  // LLM provider (with budget limits)
  llm: ILLMProvider;

  // Current session
  session: {
    id: string;
    messages: Message[];
    metadata: Record<string, unknown>;
  };

  // Tool registry
  tools: ToolRegistry;

  // Project metadata
  project: {
    root: string;
    worktree: string;
  };

  // Helper functions
  notify: (message: string) => Promise<void>;
  log: Logger;
}
```

---

## Security Model

### Capability-Based Security

```typescript
interface PluginCapabilities {
  filesystem: {
    read: boolean;       // Allow file reads
    write: boolean;      // Allow file writes
    delete: boolean;     // Allow file deletions
    restricted: string[]; // Restricted paths (e.g., /etc, ~/.ssh)
  };
  network: {
    enabled: boolean;    // Allow network requests
    allowlist: string[]; // Allowed domains
  };
  exec: {
    enabled: boolean;    // Allow command execution
    allowlist: string[]; // Allowed commands (glob patterns)
  };
  llm: {
    enabled: boolean;    // Allow LLM calls
    budget: number;      // Max spend per session ($)
  };
}
```

### Plugin Manifest

```yaml
# my-plugin/plugin.yml
name: my-plugin
version: 1.0.0
author: user@example.com
description: Custom Mimir plugin
license: MIT

capabilities:
  filesystem:
    read: true
    write: false
    delete: false
    restricted: ['.env', '.ssh/*']
  network:
    enabled: true
    allowlist: ['api.example.com']
  exec:
    enabled: false
  llm:
    enabled: true
    budget: 5.0  # Max $5 per session

events:
  - tool.execute.before
  - session.compacting
  - cost.updated
```

### Sandbox Execution

- **V8 Isolates**: Plugins run in isolated V8 contexts (similar to Cloudflare Workers)
- **Capability Control**: No access unless explicitly granted in manifest
- **Resource Limits**: CPU, memory, execution time limits
- **Teams Enforcement**: Enterprise can enforce plugin allowlists

---

## Vertical Slice Architecture

### Feature: `features/plugins/`

```
src/features/plugins/
├── commands/                # CLI commands
│   └── PluginCommand.ts    # mimir plugin list/enable/disable/install
├── loader/                  # Plugin loading
│   ├── PluginLoader.ts     # Load plugins from disk/npm
│   ├── PluginValidator.ts  # Validate plugin structure & manifest
│   └── PluginCache.ts      # Hot reload support
├── registry/                # Plugin registry
│   ├── PluginRegistry.ts   # Register/unregister plugins
│   └── EventBus.ts         # Event emission and subscription
├── api/                     # Plugin API
│   ├── PluginContext.ts    # Context object passed to plugins
│   ├── ToolBuilder.ts      # tool() schema builder
│   └── types.ts            # Plugin, PluginEvent, PluginContext
├── hooks/                   # Hook implementations
│   ├── ToolHooks.ts        # tool.execute.before/after
│   ├── SessionHooks.ts     # session.* events
│   ├── MessageHooks.ts     # message.* events
│   ├── PermissionHooks.ts  # permission.* events
│   ├── AgentHooks.ts       # agent.* events
│   ├── FileHooks.ts        # file.* events
│   ├── CommandHooks.ts     # command.* events
│   └── CostHooks.ts        # cost.* events
├── sandbox/                 # Plugin execution sandbox
│   ├── PluginSandbox.ts    # V8 isolate management
│   └── CapabilityControl.ts # Restrict plugin capabilities
├── types.ts
└── index.ts                 # Public API
```

### Integration Points

**Event Emission (Features → Plugins)**:

```typescript
// features/chat/agent/Agent.ts
import { PluginEventBus } from '@/features/plugins';

class Agent {
  constructor(private pluginBus: PluginEventBus) {}

  async executeTool(tool: Tool, args: unknown) {
    // Emit: tool.execute.before
    const beforeResult = await this.pluginBus.emit('tool.execute.before', {
      tool: tool.name,
      args,
      timestamp: Date.now(),
    });

    // Check if blocked by plugin
    if (beforeResult.blocked) {
      return { success: false, error: beforeResult.reason };
    }

    // Execute tool
    const result = await tool.execute(args);

    // Emit: tool.execute.after
    await this.pluginBus.emit('tool.execute.after', {
      tool: tool.name,
      args,
      result,
      timestamp: Date.now(),
    });

    return result;
  }
}
```

**Dependency Flow**:

```
features/plugins/ → shared/platform
                  → shared/config
                  → shared/providers
                  → NO dependency on other features

features/chat/     → features/plugins (emit events only)
features/tools/    → features/plugins (emit events only)
features/permissions/ → features/plugins (emit events only)
```

**Key Principle**: Plugins depend on `shared/`, but features only emit events (loose coupling).

---

## Plugin Loading & Distribution

### Loading Mechanism

**Loading Locations (priority order)**:
1. `.mimir/plugins/` (project-level)
2. `~/.mimir/plugins/` (global)
3. `node_modules/` (NPM packages)

**Configuration**:
```yaml
# .mimir/config.yml
plugins:
  enabled:
    - ./plugins/my-local-plugin
    - mimir-plugin-formatter  # NPM package
    - @user/mimir-custom      # Scoped NPM package
  disabled:
    - mimir-plugin-telemetry
```

### NPM Distribution

**Naming Convention**: `mimir-plugin-*`

**Package Structure**:
```
mimir-plugin-my-plugin/
├── package.json
├── plugin.yml           # Manifest
├── src/
│   └── index.ts         # Plugin implementation
├── README.md
└── LICENSE
```

**package.json**:
```json
{
  "name": "mimir-plugin-my-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["mimir", "plugin"],
  "peerDependencies": {
    "@mimir/plugin": "^1.0.0"
  }
}
```

### CLI Commands

```bash
# List installed plugins
mimir plugin list

# Install plugin from NPM
mimir plugin install mimir-plugin-formatter

# Enable/disable plugin
mimir plugin enable mimir-plugin-formatter
mimir plugin disable mimir-plugin-formatter

# Uninstall plugin
mimir plugin uninstall mimir-plugin-formatter

# Show plugin info
mimir plugin info mimir-plugin-formatter
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 weeks)

**Tasks**:
- [ ] Plugin loader (load from disk/npm)
- [ ] Plugin validator (manifest, structure)
- [ ] Plugin registry (register/unregister)
- [ ] Event bus (emit, subscribe, unsubscribe)
- [ ] Plugin context API
- [ ] Basic V8 isolate sandbox

**Deliverables**:
- `features/plugins/` structure
- Load and execute basic plugins
- Emit 2-3 core events (tool.execute.before, session.created)

### Phase 2: Event Integration (2-3 weeks)

**Tasks**:
- [ ] Emit all 24 events from features
- [ ] Implement hook interception
- [ ] Test with built-in plugins
- [ ] Capability-based security

**Deliverables**:
- All features emit events to plugin bus
- Plugins can intercept and modify behavior
- Security model enforced

### Phase 3: Plugin SDK (1-2 weeks)

**Tasks**:
- [ ] `@mimir/plugin` NPM package
- [ ] TypeScript types and API
- [ ] Plugin development docs
- [ ] Example plugins (3-5 examples)

**Deliverables**:
- Published `@mimir/plugin` package
- Documentation with examples
- Plugin development guide

### Phase 4: Distribution & Ecosystem (3-4 weeks)

**Tasks**:
- [ ] `mimir plugin` CLI commands
- [ ] Plugin registry (GitHub-based)
- [ ] Plugin discovery UI
- [ ] Security review process
- [ ] Official plugins (formatters, CI/CD)

**Deliverables**:
- Plugin installation workflow
- Plugin marketplace
- 5+ official plugins

---

## Example Plugins

### 1. Auto-Formatter Plugin

```typescript
export const FormatterPlugin: Plugin = async (ctx) => {
  return {
    on: {
      'file.modified': async (event) => {
        // Auto-format after file writes
        const ext = path.extname(event.path);

        if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
          await ctx.exec('npx', ['prettier', '--write', event.path]);
        }
      }
    }
  }
}
```

### 2. Budget Alert Plugin

```typescript
export const BudgetAlertPlugin: Plugin = async (ctx) => {
  return {
    on: {
      'cost.updated': async (event) => {
        const budget = ctx.config.budget?.maxCost || 100;
        const percent = (event.totalCost / budget) * 100;

        if (percent >= 80) {
          await ctx.notify(`⚠️ Budget warning: ${percent.toFixed(0)}% used`);
        }
      }
    }
  }
}
```

### 3. Security Audit Plugin

```typescript
export const SecurityAuditPlugin: Plugin = async (ctx) => {
  return {
    on: {
      'tool.execute.before': async (event) => {
        // Block dangerous patterns
        const dangerous = [
          /rm\s+-rf\s+\//,
          /chmod\s+777/,
          /wget.*\|.*sh/,
        ];

        if (event.tool === 'bash') {
          for (const pattern of dangerous) {
            if (pattern.test(event.args.command)) {
              throw new Error(`Security: Blocked dangerous command pattern`);
            }
          }
        }
      }
    }
  }
}
```

### 4. PreCompact Migration Plugin

```typescript
// Migrate existing PreCompact hooks to plugin system
export const PreCompactPlugin: Plugin = async (ctx) => {
  return {
    on: {
      'session.compacting': async (event) => {
        const hooks = ctx.config.hooks?.PreCompact || [];

        for (const hook of hooks) {
          if (hook.matcher === event.trigger || hook.matcher === 'auto') {
            await ctx.exec(hook.command, {
              trigger: event.trigger,
              session_id: event.sessionId,
              custom_instructions: event.instructions || '',
            });
          }
        }
      }
    }
  }
}
```

### 5. GitHub PR Comment Plugin

```typescript
export const GitHubPRPlugin: Plugin = async (ctx) => {
  return {
    on: {
      'session.completed': async (event) => {
        if (process.env.CI && process.env.GITHUB_PR) {
          const summary = await generateSummary(event.session);
          await postPRComment(summary);
        }
      }
    }
  }
}
```

---

## Migration Path

### Existing Features → Plugin System

**1. PreCompact Hook**:
- Keep YAML config format
- Implement as built-in plugin internally
- Users don't notice change (backward compatible)

**2. Custom Tools**:
- Keep YAML + TypeScript format
- Can optionally migrate to plugins
- Plugins offer more capabilities (event hooks)

**3. Custom Commands**:
- Keep YAML format
- Can optionally migrate to plugins
- Plugins can register slash commands programmatically

**No breaking changes** - All existing extensibility mechanisms continue to work.

---

## Teams Integration

### Enterprise Plugin Management

**Features**:
- Plugin allowlist enforcement (Teams API)
- Organization-wide plugin distribution
- Security review for approved plugins
- Plugin usage analytics

**Configuration**:
```yaml
# Teams-enforced config
teams:
  plugins:
    allowlist:
      - mimir-plugin-formatter
      - @company/mimir-security-audit
    blocklist:
      - mimir-plugin-telemetry
    required:
      - @company/mimir-compliance
```

**Teams API Endpoints**:
- `GET /orgs/{orgId}/plugins` - List approved plugins
- `POST /orgs/{orgId}/plugins/install` - Install plugin org-wide
- `GET /orgs/{orgId}/plugins/{id}/analytics` - Plugin usage stats

---

## Security Considerations

### Plugin Review Process

**For Official Plugins**:
1. Code review by Mimir core team
2. Security audit (dependency scan, code analysis)
3. Capability review (minimal permissions)
4. Testing (unit + integration)
5. Documentation review
6. Approval and publication

**For Community Plugins**:
1. Automated security scan (Snyk, npm audit)
2. Capability disclosure (visible in marketplace)
3. Community reviews and ratings
4. Optional: Request official review

### Runtime Security

- **V8 Isolates**: Plugins cannot escape sandbox
- **Capability Control**: Explicit permissions required
- **Resource Limits**: CPU, memory, time limits per plugin
- **Audit Logging**: All plugin actions logged
- **Teams Enforcement**: Enterprise can restrict plugins

---

## Success Metrics

### v1.2 (Initial Release)

- [ ] Plugin system implemented (24 events)
- [ ] `@mimir/plugin` SDK published
- [ ] 5+ official plugins available
- [ ] Plugin documentation complete
- [ ] Security model enforced

### v2.0 (Ecosystem Maturity)

- [ ] 50+ community plugins
- [ ] Plugin marketplace live
- [ ] Hot-reload support
- [ ] Teams plugin management
- [ ] Plugin analytics dashboard

---

## Comparison: OpenCode vs Mimir Plugins

| Aspect | OpenCode | Mimir (Proposed) |
|--------|----------|------------------|
| Events | 32+ | 24 |
| Context | Full SDK client | Scoped (platform, config, llm) |
| Sandbox | Trust-based | V8 isolates (capability-based) |
| Distribution | NPM | NPM + YAML |
| Security | Community trust | Manifest + capability control |
| Teams | Limited | Full enterprise management |
| Hot Reload | Yes | Yes (v2.0) |
| UI Modification | Yes (TUI events) | No (Ink limitation) |

**Mimir's Advantages**:
- Better security model (V8 isolates + capabilities)
- Enterprise plugin management (Teams)
- Coexists with existing extensibility (hooks, tools, commands)

**OpenCode's Advantages**:
- More events (32+ vs 24)
- Fuller context (direct SDK access)
- More mature ecosystem

---

## Conclusion

The plugin system will:
1. **Coexist** with PreCompact hooks, custom tools, custom commands
2. **Enable** community extensibility without core changes
3. **Enhance** Mimir's enterprise differentiators (security, Teams)
4. **Provide** OpenCode-level extensibility with better security

**Strategic Value**:
- Community growth and ecosystem development
- Enterprise customization for specific workflows
- Backward compatible (no breaking changes)
- Security-first design (V8 isolates + capabilities)

**Timeline**: v1.2+ (after v1.0 launch, Tool System, Agent Orchestration complete)
