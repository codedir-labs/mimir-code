# Phase 5: LLM Proxy

**Status**: Ready for Implementation
**Estimated Duration**: 2 weeks
**Prerequisites**: Phase 4 (Config Enforcement) Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Goals](#goals)
3. [Architecture](#architecture)
4. [Implementation Tasks](#implementation-tasks)
5. [Budget Enforcement](#budget-enforcement)
6. [Usage Tracking](#usage-tracking)
7. [Testing Strategy](#testing-strategy)
8. [Success Criteria](#success-criteria)

---

## Overview

Phase 5 implements the LLM proxy system, routing all LLM API calls through the Teams backend instead of directly to providers. This enables:
- Centralized API key management (users don't need individual keys)
- Budget enforcement at organization/team/user level
- Usage tracking and analytics
- Security audit trail
- Provider abstraction (backend handles provider details)

**Key Principle**: In Teams mode, the CLI becomes a thin client - all LLM calls go through the backend, which enforces budgets, logs usage, and manages API keys.

---

## Goals

### Primary Goals
1. ✅ Route LLM calls through Teams backend
2. ✅ Enforce per-user budgets
3. ✅ Track usage (tokens, cost, requests)
4. ✅ Handle proxy failures gracefully
5. ✅ Support streaming responses

### Secondary Goals
1. ✅ Cache common queries (optional)
2. ✅ Provide real-time budget warnings
3. ✅ Support budget reset cycles (daily/weekly/monthly)
4. ✅ Show usage analytics

### Non-Goals (Future Phases)
- ❌ Cloud storage sync (Phase 6)
- ❌ Custom model hosting
- ❌ LLM fine-tuning

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Agent                            │
│  (Conversation loop, tool execution)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      ProxiedLLMProvider                      │
│  - chat()                                                    │
│  - streamChat()                                              │
│  - countTokens()                                             │
│  - calculateCost()                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│   Direct Provider       │   │   Teams LLM Proxy       │
│   (Local mode)          │   │   (Teams mode)          │
│                         │   │                         │
│  → DeepSeek API         │   │  POST /llm/chat         │
│  → Anthropic API        │   │  POST /llm/stream       │
│  → OpenAI API           │   │                         │
└─────────────────────────┘   └─────────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │   Teams Backend         │
                              │  - Check budget         │
                              │  - Call real LLM        │
                              │  - Track usage          │
                              │  - Return response      │
                              └─────────────────────────┘
```

### Request Flow

```
User sends message
  │
  ├─> Agent.chat(message)
  │   │
  │   ├─> Check if Teams mode
  │   │
  │   ├─> If Teams mode:
  │   │   │
  │   │   ├─> ProxiedLLMProvider.chat()
  │   │   │   │
  │   │   │   ├─> Prepare request
  │   │   │   │   {
  │   │   │   │     messages: [...],
  │   │   │   │     tools: [...],
  │   │   │   │     model: "deepseek-chat",
  │   │   │   │     temperature: 0.7
  │   │   │   │   }
  │   │   │   │
  │   │   │   ├─> POST /llm/chat
  │   │   │   │   Authorization: Bearer {accessToken}
  │   │   │   │   X-Team-ID: {teamId}
  │   │   │   │
  │   │   │   ├─> Backend checks:
  │   │   │   │   - User budget remaining?
  │   │   │   │   - Model allowed?
  │   │   │   │   - Team quota OK?
  │   │   │   │
  │   │   │   ├─> If OK:
  │   │   │   │   ├─> Call real LLM (DeepSeek/Anthropic/etc)
  │   │   │   │   ├─> Record usage
  │   │   │   │   └─> Return response
  │   │   │   │
  │   │   │   └─> If budget exceeded:
  │   │   │       └─> Return 429 Too Many Requests
  │   │   │
  │   │   └─> Handle response
  │   │
  │   └─> If Local mode:
  │       └─> DirectLLMProvider.chat()
  │           (existing behavior)
  │
  └─> Display response
```

---

## Implementation Tasks

### Task 1: ProxiedLLMProvider

**File**: `src/providers/ProxiedLLMProvider.ts` (new)

```typescript
export interface ProxyConfig {
  apiUrl: string;
  teamId: string;
  accessToken: string;
}

export class ProxiedLLMProvider implements ILLMProvider {
  constructor(
    private config: ProxyConfig,
    private authManager: IAuthManager
  ) {}

  async chat(
    messages: Message[],
    tools?: Tool[]
  ): Promise<ChatResponse> {
    // Ensure token is fresh
    const context = await this.authManager.getActiveContext();
    if (!context) {
      throw new Error('Not authenticated');
    }

    const requestBody = {
      messages: messages.map(this.transformMessage),
      tools: tools?.map(this.transformTool),
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    };

    try {
      const response = await fetch(`${this.config.apiUrl}/llm/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.accessToken}`,
          'X-Team-ID': this.config.teamId,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      const data = await response.json();

      logger.info('LLM request completed (proxied)', {
        teamId: this.config.teamId,
        model: data.model,
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        cost: data.usage.cost,
      });

      return this.transformResponse(data);
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        throw error; // Re-throw budget errors
      }
      logger.error('Proxied LLM request failed', { error });
      throw error;
    }
  }

  async *streamChat(
    messages: Message[],
    tools?: Tool[]
  ): AsyncGenerator<ChatChunk> {
    const context = await this.authManager.getActiveContext();
    if (!context) {
      throw new Error('Not authenticated');
    }

    const requestBody = {
      messages: messages.map(this.transformMessage),
      tools: tools?.map(this.transformTool),
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      stream: true,
    };

    const response = await fetch(`${this.config.apiUrl}/llm/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.accessToken}`,
        'X-Team-ID': this.config.teamId,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    // Parse SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              yield this.transformChunk(data);
            } else if (data.type === 'usage') {
              // Final usage stats
              logger.info('Stream completed (proxied)', {
                teamId: this.config.teamId,
                usage: data.usage,
              });
            } else if (data.type === 'error') {
              throw new Error(data.error.message);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  countTokens(text: string): number {
    // Use tiktoken for estimation (client-side)
    // Actual count done by backend
    return estimateTokens(text);
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    // Backend handles actual cost calculation
    // This is for estimation only
    return 0; // Or estimate based on model pricing
  }

  // Private helpers

  private async handleError(response: Response): Promise<never> {
    const error = await response.json();

    if (response.status === 429) {
      // Budget exceeded
      throw new BudgetExceededError(
        error.message,
        error.usage,
        error.limit
      );
    } else if (response.status === 403) {
      // Model not allowed
      throw new ModelNotAllowedError(error.message);
    } else if (response.status === 401) {
      // Token expired
      throw new AuthenticationError('Token expired. Please re-authenticate.');
    } else {
      throw new Error(`LLM proxy error: ${error.message}`);
    }
  }

  private transformMessage(msg: Message): any {
    return {
      role: msg.role,
      content: msg.content,
    };
  }

  private transformTool(tool: Tool): any {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    };
  }

  private transformResponse(data: any): ChatResponse {
    return {
      content: data.content,
      role: 'assistant',
      toolCalls: data.toolCalls?.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
      usage: {
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        totalTokens: data.usage.totalTokens,
        cost: data.usage.cost,
      },
      model: data.model,
    };
  }

  private transformChunk(data: any): ChatChunk {
    return {
      delta: data.delta,
      toolCall: data.toolCall,
    };
  }
}
```

### Task 2: Budget Error Handling

**File**: `src/errors/BudgetErrors.ts` (new)

```typescript
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public usage: {
      current: number;
      limit: number;
      period: string;
    },
    public resetAt?: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }

  displayMessage(): string {
    const resetDate = this.resetAt
      ? new Date(this.resetAt).toLocaleString()
      : 'unknown';

    return (
      chalk.red.bold('\n✗ Budget Exceeded\n\n') +
      `You have reached your ${this.usage.period} budget limit.\n\n` +
      `Current usage: ${chalk.yellow(`$${this.usage.current.toFixed(2)}`)}\n` +
      `Limit: ${chalk.red(`$${this.usage.limit.toFixed(2)}`)}\n` +
      `Resets at: ${chalk.cyan(resetDate)}\n\n` +
      `Contact your team administrator to increase your budget.`
    );
  }
}

export class ModelNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelNotAllowedError';
  }
}
```

### Task 3: Budget Warning System

**File**: `src/budget/BudgetMonitor.ts` (new)

```typescript
export interface BudgetStatus {
  current: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  period: 'daily' | 'weekly' | 'monthly';
  resetAt: number;
}

export class BudgetMonitor {
  private warningThreshold = 0.8; // 80%
  private criticalThreshold = 0.95; // 95%

  constructor(
    private teamsClient: ITeamsAPIClient,
    private authManager: IAuthManager
  ) {}

  async getStatus(teamId: string): Promise<BudgetStatus> {
    const context = await this.authManager.getActiveContext();
    if (!context) {
      throw new Error('Not authenticated');
    }

    const response = await this.teamsClient.budget.getStatus(
      context.orgSlug,
      teamId,
      context.userId
    );

    return {
      current: response.currentUsage,
      limit: response.limit,
      remaining: response.limit - response.currentUsage,
      percentUsed: (response.currentUsage / response.limit) * 100,
      period: response.period,
      resetAt: response.resetAt,
    };
  }

  async checkAndWarn(teamId: string): Promise<void> {
    const status = await this.getStatus(teamId);

    if (status.percentUsed >= this.criticalThreshold) {
      console.log(
        chalk.red.bold('\n⚠️  CRITICAL: Budget almost exhausted!\n')
      );
      this.displayStatus(status);
    } else if (status.percentUsed >= this.warningThreshold) {
      console.log(
        chalk.yellow.bold('\n⚠️  WARNING: Budget running low\n')
      );
      this.displayStatus(status);
    }
  }

  private displayStatus(status: BudgetStatus): void {
    const remaining = status.limit - status.current;
    const resetDate = new Date(status.resetAt).toLocaleString();

    console.log(`Used: ${chalk.yellow(`$${status.current.toFixed(2)}`)} / ${chalk.cyan(`$${status.limit.toFixed(2)}`)}`);
    console.log(`Remaining: ${chalk.green(`$${remaining.toFixed(2)}`)}`);
    console.log(`Resets: ${chalk.cyan(resetDate)}`);
    console.log();
  }
}
```

### Task 4: Provider Factory Update

**File**: `src/providers/ProviderFactory.ts` (update)

```typescript
export class ProviderFactory {
  static async create(
    config: Config,
    authManager: IAuthManager,
    teamDetector: IWorkspaceTeamDetector
  ): Promise<ILLMProvider> {
    // Check if in Teams mode
    if (config.teams?.enabled && await authManager.isAuthenticated()) {
      const team = await teamDetector.detectTeam(process.cwd());

      if (team) {
        logger.info('Using proxied LLM provider (Teams mode)', {
          teamId: team.teamId,
        });

        const context = await authManager.getActiveContext();

        return new ProxiedLLMProvider(
          {
            apiUrl: config.teams.apiUrl!,
            teamId: team.teamId,
            accessToken: context!.accessToken,
            model: config.llm.model,
            temperature: config.llm.temperature,
            maxTokens: config.llm.maxTokens,
          },
          authManager
        );
      }
    }

    // Local mode - use direct provider
    logger.info('Using direct LLM provider (Local mode)', {
      provider: config.llm.provider,
    });

    switch (config.llm.provider) {
      case 'deepseek':
        return new DeepSeekProvider(config.llm);
      case 'anthropic':
        return new AnthropicProvider(config.llm);
      case 'openai':
        return new OpenAIProvider(config.llm);
      default:
        throw new Error(`Unsupported provider: ${config.llm.provider}`);
    }
  }
}
```

### Task 5: Usage Analytics Command

**File**: `src/cli/commands/usage.ts` (new)

```typescript
export function buildUsageCommand(): Command {
  const cmd = new Command('usage');
  cmd.description('View LLM usage and budget');

  cmd
    .command('status')
    .description('Show current budget status')
    .action(async () => {
      const budgetMonitor = getBudgetMonitor(); // From DI
      const teamDetector = getTeamDetector();

      const team = await teamDetector.detectTeam(process.cwd());
      if (!team) {
        console.log(chalk.yellow('Not in a team workspace'));
        return;
      }

      const status = await budgetMonitor.getStatus(team.teamId);

      console.log(chalk.bold(`\nBudget Status (${status.period})\n`));

      const percentBar = this.renderProgressBar(status.percentUsed);
      console.log(`  ${percentBar}`);
      console.log();
      console.log(`  Used: ${chalk.yellow(`$${status.current.toFixed(2)}`)} / ${chalk.cyan(`$${status.limit.toFixed(2)}`)}`);
      console.log(`  Remaining: ${chalk.green(`$${status.remaining.toFixed(2)}`)}`);
      console.log(`  Resets: ${chalk.cyan(new Date(status.resetAt).toLocaleString())}`);
      console.log();
    });

  cmd
    .command('history')
    .description('Show usage history')
    .option('--days <n>', 'Number of days', '7')
    .action(async (options) => {
      // Fetch and display usage history
    });

  return cmd;

  // Helper for progress bar
  function renderProgressBar(percent: number): string {
    const width = 40;
    const filled = Math.floor((percent / 100) * width);
    const empty = width - filled;

    let color = chalk.green;
    if (percent >= 95) color = chalk.red;
    else if (percent >= 80) color = chalk.yellow;

    return color('█'.repeat(filled)) + '░'.repeat(empty) + ` ${percent.toFixed(1)}%`;
  }
}
```

---

## Budget Enforcement

### Backend Implementation (Reference)

The Teams backend enforces budgets at multiple levels:

```typescript
// Backend pseudo-code (for reference)
async function handleLLMRequest(req: LLMRequest): Promise<LLMResponse> {
  const { teamId, userId } = req.auth;

  // 1. Check budgets (cascade)
  const budgets = await getBudgets(teamId, userId);

  // Check user budget
  if (budgets.user.current >= budgets.user.limit) {
    throw new BudgetExceededError('User budget exceeded', budgets.user);
  }

  // Check team budget
  if (budgets.team.current >= budgets.team.limit) {
    throw new BudgetExceededError('Team budget exceeded', budgets.team);
  }

  // Check org budget
  if (budgets.org.current >= budgets.org.limit) {
    throw new BudgetExceededError('Organization budget exceeded', budgets.org);
  }

  // 2. Call LLM
  const response = await callRealLLM(req);

  // 3. Calculate cost
  const cost = calculateCost(response.usage);

  // 4. Record usage
  await recordUsage({
    orgId: req.auth.orgId,
    teamId,
    userId,
    model: req.model,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    cost,
    timestamp: Date.now(),
  });

  // 5. Update budgets
  await incrementBudget(userId, cost);
  await incrementBudget(teamId, cost);
  await incrementBudget(req.auth.orgId, cost);

  // 6. Return response
  return response;
}
```

---

## Usage Tracking

### Data Collected

For each LLM request:
- User ID
- Team ID
- Organization ID
- Model used
- Input tokens
- Output tokens
- Cost
- Timestamp
- Request/response (optional, for debugging)

### Analytics

Teams admins can view:
- Usage by team member
- Usage by model
- Usage trends over time
- Cost breakdown
- Top conversations by cost

---

## Testing Strategy

### Unit Tests

```typescript
describe('ProxiedLLMProvider', () => {
  it('should route request through proxy', async () => {
    // Mock Teams API
    // Call chat()
    // Verify proxy endpoint called
  });

  it('should handle budget exceeded error', async () => {
    // Mock 429 response
    // Call chat()
    // Verify BudgetExceededError thrown
  });

  it('should stream responses correctly', async () => {
    // Mock SSE stream
    // Call streamChat()
    // Verify chunks received
  });

  it('should refresh token if expired', async () => {
    // Mock expired token
    // Call chat()
    // Verify token refresh triggered
  });
});
```

### Integration Tests

```typescript
describe('LLM Proxy Flow', () => {
  it('should complete full proxied request', async () => {
    // Authenticate
    // Detect team
    // Send LLM request
    // Verify response
    // Check budget updated
  });

  it('should fall back to local mode when not authenticated', async () => {
    // No auth
    // Send LLM request
    // Verify direct provider used
  });
});
```

---

## Success Criteria

Phase 5 is complete when:

- [ ] **Proxy provider implemented**
  - [ ] Route requests through Teams backend
  - [ ] Handle streaming responses
  - [ ] Token refresh on expiry

- [ ] **Budget enforcement working**
  - [ ] Block requests when budget exceeded
  - [ ] Show clear error messages
  - [ ] Display remaining budget

- [ ] **Usage tracking**
  - [ ] Record all LLM requests
  - [ ] Track tokens and cost
  - [ ] Show usage analytics

- [ ] **Commands functional**
  - [ ] `mimir usage status` - budget status
  - [ ] `mimir usage history` - usage history

- [ ] **Testing complete**
  - [ ] Unit tests: 80%+ coverage
  - [ ] Integration tests pass
  - [ ] Manual testing with real backend

---

## Timeline

**Week 1**:
- Day 1-2: ProxiedLLMProvider
- Day 3: Budget error handling
- Day 4: Budget monitor
- Day 5: Provider factory updates

**Week 2**:
- Day 6: Usage commands
- Day 7-8: Testing
- Day 9: Documentation
- Day 10: Code review

---

## Next Phase

After Phase 5 completes → **Phase 6: Cloud Storage**
- Sync conversations to Teams backend
- Sync audit logs
- Hybrid storage (local-first with background sync)
