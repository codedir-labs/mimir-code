# Context Management

Comprehensive context management inspired by Claude Code.

## Core Features

### 1. Auto-Compact (Default: Enabled)

Automatically triggers at 95% context capacity:
- Summarizes conversation history
- Frees token space
- Works transparently
- Configurable: `autoCompact.enabled`, `autoCompact.threshold`

### 2. Manual Compaction

`/compact [instructions]` - User-triggered summarization

```
/compact Focus on test results and code changes
```

- Accepts optional custom instructions
- Preserves system prompts and recent context
- Can be customized via MIMIR.md

### 3. Memory System (Hierarchical)

Priority (low to high):
1. Global: `~/.mimir/MIMIR.md` - User preferences across projects
2. Project: `./.mimir/MIMIR.md` - Team-shared context
3. Local: `./MIMIR.local.md` - Personal overrides
4. Enterprise: System-level (enforced)

Features:
- Supports imports: `@path/to/file` (max 5 hops)
- Path-specific rules: `.mimir/rules/` with glob patterns

### 4. Context Monitoring

- `/context` - Visualize token usage (colored grid)
- `/cost` - Show token stats, duration, spending
- Real-time tracking
- Warning indicators near limits

### 5. Pollution Prevention

- Relevance-based message scoring
- Intelligent summarization
- Manual clearing: `/clear` (full reset)
- Session isolation: `/resume <session>`

## Best Practices

1. **Proactive compacting** - Compact at 75-80%, don't wait for 95%
2. **Custom focus** - Preserve critical context: `/compact Keep latest test results`
3. **Session isolation** - Break unrelated tasks into separate sessions
4. **Memory organization** - Use `.mimir/rules/` for modular context
5. **Monitoring** - Regularly check `/context` for patterns

## Configuration

```typescript
interface ContextConfig {
  autoCompact: {
    enabled: boolean;        // Default: true
    threshold: number;       // Default: 0.95
  };
  maxTokens: number;         // Model-specific limit
  reservedTokens: number;    // For system prompts
  summarizationStrategy: 'relevance' | 'recency' | 'hybrid';
}
```

## Message Scoring

```typescript
interface MessageScore {
  message: Message;
  score: number;             // 0-1 relevance
  factors: {
    recency: number;         // Time-based
    toolUse: number;         // Has tool calls/results
    userInteraction: number; // User messages higher
    contextual: number;      // Semantic relevance
  };
}
```

## PreCompact Hook

Run cleanup before compaction:

```yaml
hooks:
  PreCompact:
    - matcher: auto  # 'auto' | 'manual'
      command: /path/to/cleanup.sh
      input:
        trigger: auto
        session_id: abc123
        custom_instructions: ""
```

## Token Reduction Strategies

1. **Compact conversations** - Primary method for long sessions
2. **Write specific queries** - Avoid vague requests triggering broad scans
3. **Break down tasks** - Split complex work into focused sessions
4. **Clear between tasks** - `/clear` when switching contexts
5. **Disable unused tools** - Reduce system prompt via `/tools disable`

## Cost Factors

- Codebase size analyzed
- Conversation history length
- Number of tools enabled
- File operation frequency
- Background summarization

## Related Commands

- `/compact [instructions]` - Manual compaction
- `/context` - Visualize usage
- `/cost` - Token/cost statistics
- `/clear` - Clear history
- `/resume <session>` - Resume with preserved memory
- `/memory` - Edit MIMIR.md files
- `/tools tokens` - Show tool token costs
