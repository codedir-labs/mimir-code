# Agent Roles

**Last Updated**: 2025-12-27

---

## Overview

Mimir supports specialized agent roles optimized for specific tasks. Each role has:

- **Preferred LLM models** (user can change via prompt)
- **Tool restrictions** (role-based access)
- **Custom system prompts** (role-specific instructions)
- **Budget limits** (optional per-role configuration)

---

## Core Roles

### **main** - Main Orchestrator

**Purpose**: Default agent role, handles general tasks and orchestration

**Preferred Models**:
1. Claude Sonnet 4.5 *(recommended)*
2. DeepSeek Chat V3
3. GPT-4o

**Tools**: All tools (no restrictions)

**Status**: ✅ Implemented in Phase 1

---

### **finder** - File & Code Discovery

**Purpose**: Quick file searches, code pattern discovery, repository navigation

**Preferred Models**:
1. Claude Haiku 4.5 *(fast, cost-effective)*
2. Qwen 3
3. Gemini 3 Flash

**Tools**:
- `file_operations` (read-only)
- `file_search` (grep, glob)
- `git` (status, log, show)

**System Prompt**:
```
You are a code finder agent specialized in quickly locating files and code patterns.

Your role:
- Use file search tools efficiently
- Focus on speed and accuracy
- Return precise locations (file:line)
- Suggest related files when relevant

Best practices:
- Start with broad searches, then narrow down
- Use glob patterns for file discovery
- Use grep for code patterns
- Check git history for moved/renamed files
```

**Status**: ✅ Implemented in Phase 2

---

### **thinker** - Deep Reasoning & Complex Debugging

**Purpose**: Complex problem-solving, tricky bugs, architectural decisions

**Preferred Models**:
1. OpenAI o3 *(best reasoning)*
2. DeepSeek R1
3. GPT-5
4. Claude Sonnet 4.5

**Tools**:
- `file_operations` (read + write)
- `file_search`
- `bash_execution`
- `git`

**System Prompt**:
```
You are a reasoning agent specialized in complex problem-solving and debugging.

Your role:
- Take time to think through tricky issues
- Use step-by-step reasoning
- Break down complex problems
- Verify assumptions before acting

Best practices:
- Analyze the problem deeply before proposing solutions
- Consider edge cases and failure modes
- Test hypotheses systematically
- Explain your reasoning process
```

**Status**: ✅ Implemented in Phase 2

---

## Mode Agents

### **planner** - Plan Mode

**Purpose**: Create task breakdowns, no code changes (read-only)

**Preferred Models**:
1. Claude Sonnet 4.5
2. GPT-4o
3. DeepSeek Chat V3

**Tools**:
- `file_operations` (read-only)
- `file_search`

**System Prompt**:
```
You are a planning agent specialized in task decomposition.

Your role:
- Analyze tasks and create detailed execution plans
- Break down complex work into actionable steps
- Identify dependencies and risks
- DO NOT make code changes (read-only mode)

Output format:
1. Task overview
2. Sub-tasks (numbered, with dependencies)
3. Estimated effort per task
4. Risks and considerations
```

**Status**: ✅ Implemented in Phase 2

---

### **actor** - Act Mode

**Purpose**: Autonomous execution with full tool access

**Preferred Models**:
1. Claude Sonnet 4.5
2. GPT-4o
3. DeepSeek Chat V3

**Tools**: All tools (no restrictions)

**System Prompt**:
```
You are an execution agent specialized in autonomous task completion.

Your role:
- Execute tasks from approved plans
- Make decisions independently when unambiguous
- Track progress and report status
- Handle errors gracefully

Best practices:
- Follow the plan systematically
- Create checkpoints before major changes
- Report progress clearly
- Ask for clarification when needed
```

**Status**: ✅ Implemented in Phase 2

---

### **architect** - Discuss Mode

**Purpose**: Interactive planning, Q&A, architecture discussions

**Preferred Models**:
1. Claude Sonnet 4.5
2. GPT-4o
3. o3-mini

**Tools**:
- `file_operations` (read-only)
- `file_search`

**System Prompt**:
```
You are an architect agent specialized in interactive planning and design.

Your role:
- Ask clarifying questions
- Present multiple approaches with pros/cons
- Discuss trade-offs
- Guide architectural decisions
- DO NOT make code changes (discussion only)

Interaction style:
- Start with open-ended questions
- Present 2-3 options when relevant
- Explain implications of each choice
- Summarize decisions at the end
```

**Status**: ✅ Implemented in Phase 2

---

## Specialized Roles (Future)

### **researcher** - Documentation & API Research

**Purpose**: Search docs, libraries, GitHub repos, web

**Preferred Models**:
1. Claude Sonnet 4.5
2. GPT-4o
3. Perplexity Sonar

**Tools**:
- `file_operations` (read-only)
- `file_search`
- `web_search`
- `github_search` (via MCP)

**Status**: 📋 Planned for Phase 3

---

### **refactoring** - Code Refactoring

**Purpose**: Code quality improvements, pattern refactoring

**Preferred Models**:
1. Claude Sonnet 4.5
2. GPT-4o
3. DeepSeek Chat V3

**Tools**:
- `file_operations` (read + write)
- `file_search`
- `bash_execution` (for testing)

**Status**: 📋 Planned for Phase 3

---

### **reviewer** - Code Review & Quality Analysis

**Purpose**: Code review, security analysis, best practices

**Preferred Models**:
1. Claude Sonnet 4.5 *(best for security)*
2. OpenAI o3
3. GPT-4o

**Tools**:
- `file_operations` (read-only)
- `file_search`
- `git` (diff, log)

**Status**: 📋 Planned for Phase 3

---

### **tester** - Test Generation

**Purpose**: Create tests, analyze coverage, suggest test cases

**Preferred Models**:
1. Claude Sonnet 4.5
2. GPT-4o
3. DeepSeek Chat V3

**Tools**:
- `file_operations` (read + write)
- `bash_execution` (run tests)
- `git`

**Status**: 📋 Planned for Phase 4

---

### **security** - Security Scanning

**Purpose**: Vulnerability detection, security best practices (can be forced by Teams)

**Preferred Models**:
1. Claude Sonnet 4.5
2. OpenAI o3
3. GPT-4o

**Tools**:
- `file_operations` (read-only)
- `file_search`
- `git` (history analysis)

**Trigger**: Can be forced by Teams on `on-write`, `on-commit`, `always`

**Status**: 📋 Planned for Phase 4

---

### **rush** - Quick Targeted Operations

**Purpose**: Fast, simple tasks in 3-5 iterations

**Preferred Models**:
1. Claude Haiku 4.5 *(fastest)*
2. Qwen 3
3. Gemini 3 Flash

**Tools**:
- `file_operations` (read + write)
- `bash_execution`

**Limits**:
- Max 5 iterations
- 30-second timeout

**Status**: 📋 Planned for Phase 4

---

## Model Selection Flow

### **1. Default Behavior (No Prompt)**

When creating a sub-agent, use the **first preferred model** for that role:

```typescript
const finderAgent = await orchestrator.createSubAgent({
  role: 'finder',
  // No model specified → uses Haiku 4.5 (first preferred)
});
```

### **2. User Prompted for Selection**

When `config.agentOrchestration.promptForModels === true`:

```
Creating finder agent for task: "Search for authentication files"

Preferred models for finder role:
  1. Claude Haiku 4.5 (recommended) - Fast, cost-effective
  2. Qwen 3 - Alternative fast model
  3. Gemini 3 Flash - Google's fast model

Select model (1-3, or enter custom model): _
```

User can:
- Select `1` (recommended)
- Select `2` or `3` (alternatives)
- Enter custom model: `deepseek-chat`

### **3. Teams Enforcement**

If Teams config enforces a specific model for a role:

```yaml
# Teams config (enforced)
enforcement:
  subAgentModels:
    finder: haiku-4.5  # Enforced
    thinker: o3-mini   # Enforced
```

User prompt shows:

```
Creating finder agent for task: "Search for authentication files"

Model: Claude Haiku 4.5 (enforced by organization)

This model is required by your organization policy and cannot be changed.
```

### **4. Allowed Models Enforcement**

If Teams restricts allowed models:

```yaml
enforcement:
  allowedModels:
    - sonnet-4.5
    - haiku-4.5
    - o3-mini
```

User prompt filters options:

```
Preferred models for finder role:
  1. Claude Haiku 4.5 (recommended)

Other models (Qwen 3, Gemini 3 Flash) are not allowed by your organization.

Select model or press Enter for default: _
```

---

## Configuration

### **Default Configuration**

```yaml
# .mimir/config.yml
agentOrchestration:
  enabled: true

  # Prompt user to select models for each sub-agent
  promptForModels: true  # false = auto-select first preferred

  # Role-specific overrides
  roles:
    finder:
      preferredModels:
        - haiku-4.5
        - qwen-3
        - gemini-3-flash
      tools:
        - file_operations
        - file_search
        - git

    thinker:
      preferredModels:
        - o3
        - deepseek-r1
        - gpt-5
        - sonnet-4.5
      tools:
        - file_operations
        - file_search
        - bash_execution
        - git
```

### **Teams Enforcement**

```yaml
# From Teams API (enforced, cannot be overridden)
enforcement:
  # Allowed models across all agents
  allowedModels:
    - sonnet-4.5
    - haiku-4.5
    - o3-mini

  # Force specific models for specific roles
  subAgentModels:
    thinker: o3-mini  # Override user preference
    security: sonnet-4.5  # Force Sonnet for security agent

  # Allowed sub-agent roles
  allowedSubAgents:
    - finder
    - thinker
    - reviewer
    - security

  # Forced sub-agents (always created)
  forcedSubAgents:
    security:
      enabled: true
      model: sonnet-4.5
      trigger: on-write  # Run security scan on every file write
```

---

## Implementation Notes

### **RoleRegistry**

```typescript
export class RoleRegistry {
  private roles: Map<AgentRole, RoleConfig> = new Map();

  register(role: AgentRole, config: RoleConfig): void {
    this.roles.set(role, config);
  }

  get(role: AgentRole): RoleConfig | undefined {
    return this.roles.get(role);
  }

  getPreferredModels(role: AgentRole): string[] {
    return this.roles.get(role)?.preferredModels || ['sonnet-4.5'];
  }

  getDefaultModel(role: AgentRole): string {
    return this.getPreferredModels(role)[0] || 'sonnet-4.5';
  }

  getTools(role: AgentRole): string[] {
    return this.roles.get(role)?.tools || ['*'];
  }

  getSystemPrompt(role: AgentRole): string {
    return this.roles.get(role)?.systemPrompt || '';
  }
}

export interface RoleConfig {
  preferredModels: string[];
  tools: string[];
  systemPrompt: string;
  budget?: {
    maxTokens?: number;
    maxCost?: number;
    maxDuration?: number;
  };
}
```

### **Model Selection Logic**

```typescript
async function selectModelForAgent(
  role: AgentRole,
  enforcement: EnforcementConfig,
  registry: RoleRegistry,
  promptUser: boolean
): Promise<string> {
  // 1. Check if Teams enforces a specific model for this role
  if (enforcement.subAgentModels?.[role]) {
    const enforcedModel = enforcement.subAgentModels[role];
    console.log(`Model: ${enforcedModel} (enforced by organization)`);
    return enforcedModel;
  }

  // 2. Get preferred models for this role
  const preferredModels = registry.getPreferredModels(role);

  // 3. Filter by allowed models (if Teams restricts)
  const allowedModels = enforcement.allowedModels || ['*'];
  const availableModels = allowedModels.includes('*')
    ? preferredModels
    : preferredModels.filter(m => allowedModels.includes(m));

  if (availableModels.length === 0) {
    throw new Error(
      `No allowed models available for role '${role}'. ` +
      `Preferred: ${preferredModels.join(', ')}. ` +
      `Allowed: ${allowedModels.join(', ')}`
    );
  }

  // 4. If not prompting user, return first available
  if (!promptUser) {
    return availableModels[0];
  }

  // 5. Prompt user to select model
  const selected = await promptUserForModel(role, availableModels, preferredModels);
  return selected;
}
```

---

**Last Updated**: 2025-12-27
