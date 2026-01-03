# Hooks System

**Inspired by**: [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
**Last Updated**: 2025-12-27

---

## Overview

The **hooks system** allows users to run custom shell commands in response to agent events. Hooks enable:

- **Custom workflows**: Run linters, formatters, tests automatically
- **Integration**: Trigger CI/CD, notifications, logging
- **Validation**: Pre-validate tool calls, post-validate results
- **Automation**: Auto-commit, auto-deploy, auto-backup

Hooks are **shell commands** that execute at specific lifecycle events.

---

## Hook Types

### **Tool Execution Hooks**

| Hook | When | Use Case |
|------|------|----------|
| `pre-tool-call` | Before any tool executes | Validate arguments, check permissions |
| `post-tool-call` | After any tool executes | Log results, trigger notifications |
| `pre-file-write` | Before writing to a file | Backup file, run linter |
| `post-file-write` | After writing to a file | Format file, run tests |
| `pre-bash-execution` | Before running bash command | Validate command, check sandbox |
| `post-bash-execution` | After running bash command | Log output, analyze errors |

### **Agent Lifecycle Hooks**

| Hook | When | Use Case |
|------|------|----------|
| `pre-agent-execute` | Before agent starts task | Initialize environment, log task |
| `post-agent-execute` | After agent completes task | Cleanup, commit changes, notify |
| `pre-subagent-create` | Before creating sub-agent | Validate config, check budget |
| `post-subagent-complete` | After sub-agent finishes | Merge results, log metrics |
| `on-agent-error` | When agent encounters error | Alert, rollback, retry |
| `on-agent-interrupt` | When user interrupts agent | Save state, cleanup |

### **Conversation Hooks**

| Hook | When | Use Case |
|------|------|----------|
| `pre-context-add` | Before adding item to context | Validate size, check relevance |
| `post-context-prune` | After pruning context | Log pruned messages, backup |
| `pre-conversation-save` | Before saving conversation | Encrypt sensitive data |
| `post-conversation-save` | After saving conversation | Sync to cloud, backup |

### **Mode Hooks**

| Hook | When | Use Case |
|------|------|----------|
| `on-mode-switch` | When switching modes | Log mode change, reset state |
| `on-plan-approve` | When user approves plan | Commit plan to file, notify team |
| `on-plan-reject` | When user rejects plan | Log rejection reason |

---

## Configuration

### **Global Hooks** (`~/.mimir/config.yml`)

```yaml
hooks:
  # Pre-file-write: Run linter before writing
  pre-file-write:
    command: npx eslint --fix {file_path}
    timeout: 10000  # 10 seconds
    continueOnError: true  # Don't block write if linter fails

  # Post-file-write: Run tests
  post-file-write:
    command: npm test -- {file_path}
    timeout: 30000
    continueOnError: true
    patterns:
      - "**/*.ts"  # Only for TypeScript files
      - "!**/*.test.ts"  # Exclude test files

  # Pre-bash-execution: Validate command
  pre-bash-execution:
    command: python scripts/validate-command.py "{bash_command}"
    timeout: 5000
    continueOnError: false  # Block execution if validation fails

  # Post-agent-execute: Auto-commit
  post-agent-execute:
    command: |
      git add .
      git commit -m "Agent task: {task_description}"
    timeout: 10000
    continueOnError: true
    prompt: true  # Ask user before running
```

### **Project Hooks** (`.mimir/config.yml`)

```yaml
hooks:
  # Pre-file-write: Format with Prettier
  pre-file-write:
    command: npx prettier --write {file_path}
    timeout: 5000
    continueOnError: true

  # Post-file-write: Run type check
  post-file-write:
    command: npx tsc --noEmit
    timeout: 20000
    continueOnError: true
    patterns:
      - "**/*.ts"
      - "**/*.tsx"

  # On-agent-error: Send Slack notification
  on-agent-error:
    command: |
      curl -X POST https://hooks.slack.com/... \
        -d '{"text":"Agent error: {error_message}"}'
    timeout: 5000
    continueOnError: true
```

---

## Hook Variables

Hooks can use **template variables** that are replaced at runtime:

### **File Operations**

- `{file_path}` - Full path to file
- `{file_name}` - File name only
- `{file_ext}` - File extension
- `{working_dir}` - Current working directory

### **Bash Execution**

- `{bash_command}` - Command being executed
- `{bash_exit_code}` - Exit code (post-hook only)
- `{bash_stdout}` - Standard output (post-hook only)
- `{bash_stderr}` - Standard error (post-hook only)

### **Agent Context**

- `{task_description}` - Current task
- `{agent_id}` - Agent ID
- `{agent_role}` - Agent role (finder, thinker, etc.)
- `{agent_model}` - LLM model being used
- `{conversation_id}` - Conversation ID

### **Tool Calls**

- `{tool_name}` - Tool being called
- `{tool_args}` - Tool arguments (JSON)
- `{tool_result}` - Tool result (post-hook only, JSON)

### **Metrics**

- `{tokens_used}` - Tokens used so far
- `{cost}` - Cost in USD
- `{duration}` - Duration in ms

---

## Hook Execution

### **Hook Behavior**

```typescript
interface HookConfig {
  command: string;              // Shell command to run
  timeout?: number;             // Max execution time (ms), default 10000
  continueOnError?: boolean;    // Continue if hook fails, default true
  prompt?: boolean;             // Ask user before running, default false
  patterns?: string[];          // File patterns (glob), only for file hooks
  environment?: Record<string, string>; // Custom env vars
}

interface HookContext {
  hookName: string;
  event: HookEvent;
  variables: Record<string, string>; // Template variables
}

interface HookResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

### **Execution Flow**

1. **Event occurs** (e.g., file write)
2. **Check if hook configured** for this event
3. **Filter by patterns** (if file-based hook)
4. **Replace template variables** in command
5. **Prompt user** (if `prompt: true`)
6. **Execute command** with timeout
7. **Handle result**:
   - If `continueOnError: false` and hook fails → block operation
   - If `continueOnError: true` and hook fails → log warning, continue
8. **Log hook execution** to audit trail

---

## Examples

### **Example 1: Pre-commit Hook (Auto-format)**

```yaml
hooks:
  pre-file-write:
    command: |
      # Format with Prettier
      npx prettier --write {file_path}

      # Lint with ESLint
      npx eslint --fix {file_path}
    timeout: 15000
    continueOnError: true
    patterns:
      - "**/*.ts"
      - "**/*.tsx"
      - "**/*.js"
```

**Behavior**:
- Before writing any `.ts`/`.tsx`/`.js` file
- Runs Prettier and ESLint
- If formatting fails, still writes file (warning logged)

---

### **Example 2: Post-write Hook (Run Tests)**

```yaml
hooks:
  post-file-write:
    command: npm test -- --findRelatedTests {file_path}
    timeout: 60000  # 1 minute
    continueOnError: true
    patterns:
      - "src/**/*.ts"
      - "!src/**/*.test.ts"
```

**Behavior**:
- After writing files in `src/` (except tests)
- Runs related tests only
- If tests fail, logs warning but doesn't undo write

---

### **Example 3: Validate Bash Commands**

```yaml
hooks:
  pre-bash-execution:
    command: python scripts/validate-bash.py "{bash_command}"
    timeout: 5000
    continueOnError: false  # Block dangerous commands
```

**`scripts/validate-bash.py`**:
```python
import sys
import re

command = sys.argv[1]

# Block dangerous commands
dangerous_patterns = [
    r'rm\s+-rf\s+/',  # rm -rf /
    r':\(\)\{\s*:\|:&\s*\};:',  # Fork bomb
    r'dd\s+if=/dev/random',  # Random data overwrite
]

for pattern in dangerous_patterns:
    if re.search(pattern, command):
        print(f"BLOCKED: Dangerous command detected: {pattern}")
        sys.exit(1)

print("Command validated")
sys.exit(0)
```

**Behavior**:
- Before running any bash command
- Validates command against dangerous patterns
- If validation fails → blocks execution

---

### **Example 4: Auto-commit on Task Complete**

```yaml
hooks:
  post-agent-execute:
    command: |
      # Only commit if agent succeeded
      if [ "{agent_status}" = "completed" ]; then
        git add .
        git commit -m "🤖 Agent task: {task_description}

        Agent: {agent_role} ({agent_model})
        Tokens: {tokens_used}
        Cost: ${cost}
        "
      fi
    timeout: 10000
    continueOnError: true
    prompt: true  # Ask user before committing
```

**Behavior**:
- After agent completes task successfully
- Prompts user: "Run auto-commit hook? (y/n)"
- If approved, commits all changes with detailed message

---

### **Example 5: Slack Notification on Error**

```yaml
hooks:
  on-agent-error:
    command: |
      curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
        -H 'Content-Type: application/json' \
        -d '{
          "text": "🚨 Agent Error",
          "blocks": [
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": "*Task:* {task_description}\n*Error:* {error_message}\n*Agent:* {agent_role} ({agent_model})"
              }
            }
          ]
        }'
    timeout: 5000
    continueOnError: true
    environment:
      SLACK_WEBHOOK_URL: "${SLACK_WEBHOOK_URL}"
```

---

### **Example 6: Context Size Monitoring**

```yaml
hooks:
  pre-context-add:
    command: |
      # Check context size before adding
      CURRENT_SIZE={context_tokens}
      MAX_SIZE=100000

      if [ $CURRENT_SIZE -gt $MAX_SIZE ]; then
        echo "⚠️ Context size exceeds limit: $CURRENT_SIZE / $MAX_SIZE tokens"
        echo "Consider running: /context prune"
        exit 1  # Block adding to context
      fi
    timeout: 1000
    continueOnError: false
```

---

## Teams Enforcement

### **Forced Hooks**

Teams can enforce hooks that **cannot be disabled** by users:

```yaml
# Teams config (enforced)
enforcement:
  hooks:
    # Forced pre-bash validation
    pre-bash-execution:
      command: curl -X POST https://api.company.com/validate-command \
        -d '{"command":"{bash_command}","user":"{user_email}"}'
      timeout: 5000
      continueOnError: false
      enforced: true  # Cannot be overridden

    # Forced audit logging
    post-tool-call:
      command: |
        curl -X POST https://api.company.com/audit \
          -d '{
            "tool": "{tool_name}",
            "args": "{tool_args}",
            "result": "{tool_result}",
            "user": "{user_email}",
            "org": "{org_slug}",
            "team": "{team_id}"
          }'
      timeout: 5000
      continueOnError: true
      enforced: true
```

**Behavior**:
- Users cannot disable enforced hooks
- Enforced hooks run in addition to user hooks
- Enforced hooks run first (before user hooks)

---

## Hook Registry

### **Implementation**

```typescript
export interface IHookRegistry {
  register(hookName: string, config: HookConfig): void;
  execute(hookName: string, context: HookContext): Promise<HookResult>;
  list(): Array<{ name: string; config: HookConfig }>;
  isEnforced(hookName: string): boolean;
}

export class HookRegistry implements IHookRegistry {
  private hooks: Map<string, HookConfig> = new Map();
  private enforcedHooks: Set<string> = new Set();

  constructor(
    private executor: IProcessExecutor,
    private logger: ILogger
  ) {}

  register(hookName: string, config: HookConfig): void {
    // Teams-enforced hooks cannot be overridden
    if (this.enforcedHooks.has(hookName) && !config.enforced) {
      this.logger.warn(
        `Hook '${hookName}' is enforced by organization. User config ignored.`
      );
      return;
    }

    this.hooks.set(hookName, config);
    if (config.enforced) {
      this.enforcedHooks.add(hookName);
    }
  }

  async execute(hookName: string, context: HookContext): Promise<HookResult> {
    const config = this.hooks.get(hookName);
    if (!config) {
      return { success: true, exitCode: 0, stdout: '', stderr: '', duration: 0 };
    }

    // Check file patterns (if file-based hook)
    if (config.patterns && context.variables.file_path) {
      const matches = config.patterns.some(pattern =>
        minimatch(context.variables.file_path, pattern)
      );
      if (!matches) {
        return { success: true, exitCode: 0, stdout: '', stderr: '', duration: 0 };
      }
    }

    // Replace template variables in command
    const command = this.replaceVariables(config.command, context.variables);

    // Prompt user (if configured)
    if (config.prompt) {
      const approved = await this.promptUser(hookName, command);
      if (!approved) {
        return { success: true, exitCode: 0, stdout: 'User skipped hook', stderr: '', duration: 0 };
      }
    }

    // Execute command
    const startTime = Date.now();
    try {
      const result = await this.executor.execute(command, {
        timeout: config.timeout || 10000,
        env: config.environment,
      });

      const duration = Date.now() - startTime;

      // Log execution
      this.logger.debug(`Hook '${hookName}' executed in ${duration}ms`, {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(`Hook '${hookName}' failed:`, error);

      if (!config.continueOnError) {
        throw new Error(`Hook '${hookName}' failed: ${error.message}`);
      }

      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        duration,
      };
    }
  }

  private replaceVariables(command: string, variables: Record<string, string>): string {
    let result = command;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  private async promptUser(hookName: string, command: string): Promise<boolean> {
    console.log(`\nRun hook '${hookName}'?`);
    console.log(`Command: ${command}`);
    const answer = await prompt('Run? (y/n): ');
    return answer.toLowerCase() === 'y';
  }

  list(): Array<{ name: string; config: HookConfig }> {
    return Array.from(this.hooks.entries()).map(([name, config]) => ({ name, config }));
  }

  isEnforced(hookName: string): boolean {
    return this.enforcedHooks.has(hookName);
  }
}
```

---

## Security Considerations

1. **Sandbox hooks**: Run hooks in Docker container (optional, Teams can enforce)
2. **Validate commands**: Pre-validate hook commands for dangerous patterns
3. **Audit trail**: Log all hook executions to audit log
4. **User approval**: Require user approval for potentially dangerous hooks
5. **Teams enforcement**: Org-level hooks cannot be disabled or modified

---

**Last Updated**: 2025-12-27
