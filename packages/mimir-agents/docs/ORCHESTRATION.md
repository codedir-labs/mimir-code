# Agent Orchestration

The `AgentOrchestrator` manages multiple sub-agents for complex, multi-step tasks.

## Overview

The orchestrator provides:
- **Parallel execution**: Run multiple agents simultaneously (respects `maxParallel` limit)
- **Sequential execution**: Run agents one after another
- **Context isolation**: Each sub-agent has its own context to avoid pollution
- **State management**: Track and monitor agent execution
- **Result aggregation**: Collect results from all agents

## Key Concepts

### Sub-Agent State

Each spawned agent tracks:
- `agentId`: Unique identifier
- `status`: 'pending' | 'running' | 'completed' | 'failed'
- `startTime` / `endTime`: Execution timing
- `result`: Agent execution result
- `error`: Error message if failed

### Execution Modes

1. **Parallel Execution**: Agents run concurrently (up to `maxParallel`)
2. **Sequential Execution**: Agents run one at a time
3. **Background Execution**: Fire-and-forget, check result later

## Usage

### Creating an Orchestrator

```typescript
import { AgentOrchestrator } from '@codedir/mimir-agents';

const orchestrator = new AgentOrchestrator(agentFactory, {
  maxParallel: 4  // Maximum concurrent agents (default: 4)
});
```

### Spawning a Sub-Agent

```typescript
const { agentId, agent } = await orchestrator.spawn(
  'Find all TypeScript errors',
  {
    name: 'Error Finder',
    role: 'finder',
    tools: ['grep', 'glob'],
    budget: { maxIterations: 10 }
  },
  context
);
```

### Executing in Parallel

```typescript
const result = await orchestrator.executeParallel([
  {
    task: 'Run unit tests',
    config: { name: 'Tester', role: 'tester', tools: ['bash'] }
  },
  {
    task: 'Check linting',
    config: { name: 'Linter', role: 'reviewer', tools: ['bash', 'grep'] }
  },
  {
    task: 'Build project',
    config: { name: 'Builder', role: 'general', tools: ['bash'] }
  }
]);

console.log(`Success: ${result.success}`);
console.log(`Total tokens: ${result.totalTokens}`);
console.log(`Total cost: $${result.totalCost}`);
console.log(`Duration: ${result.totalDuration}ms`);
```

### Executing Sequentially

```typescript
const result = await orchestrator.executeSequential([
  {
    task: 'Install dependencies',
    config: { name: 'Installer', tools: ['bash'] }
  },
  {
    task: 'Run build',
    config: { name: 'Builder', tools: ['bash'] }
  },
  {
    task: 'Run tests',
    config: { name: 'Tester', tools: ['bash'] }
  }
]);
```

### Background Execution

```typescript
// Spawn and start in background
const { agentId } = await orchestrator.spawn(task, config, context);
await orchestrator.executeBackground(agentId, context);

// Check result later (non-blocking)
const result = await orchestrator.checkResult(agentId);
if (result) {
  console.log('Agent completed:', result);
} else {
  console.log('Agent still running');
}

// Or wait for result (blocking)
const result = await orchestrator.getResult(agentId);
```

### Monitoring Agents

```typescript
// Get single agent status
const state = orchestrator.getStatus(agentId);
console.log(`Status: ${state.status}`);

// Get all agents
const allAgents = orchestrator.listAgents();

// Get statistics
const stats = orchestrator.getStats();
console.log(`Total: ${stats.total}`);
console.log(`Running: ${stats.running}`);
console.log(`Completed: ${stats.completed}`);
```

### Stopping Agents

```typescript
// Stop a specific agent
await orchestrator.stop(agentId);

// Clear completed agents
orchestrator.clearCompleted();
```

## OrchestrationResult

The result object from `executeParallel` and `executeSequential`:

```typescript
{
  success: boolean;              // All agents completed successfully
  agents: SubAgentState[];       // All agent states
  totalDuration: number;         // Total execution time (ms)
  totalTokens: number;           // Sum of all agent tokens
  totalCost: number;             // Sum of all agent costs
  errors: string[];              // Any errors encountered
}
```

## Best Practices

### 1. Choose Execution Mode Wisely

**Parallel** - Use when:
- Tasks are independent
- Want to minimize total time
- Have adequate resources

**Sequential** - Use when:
- Tasks depend on each other
- Need to preserve order
- Want to limit resource usage

### 2. Set Appropriate maxParallel

```typescript
// For CPU-bound tasks on 8-core machine
maxParallel: 4

// For I/O-bound tasks (can be higher)
maxParallel: 8

// For rate-limited APIs
maxParallel: 2
```

### 3. Context Isolation

Each sub-agent gets isolated context:
```typescript
const { agentId } = await orchestrator.spawn(
  task,
  config,
  {
    conversationId: 'different-conversation',  // Isolated
    parentAgentId: mainAgent.id,
    metadata: { purpose: 'background-research' }
  }
);
```

### 4. Error Handling

```typescript
const result = await orchestrator.executeParallel(tasks);

if (!result.success) {
  console.error('Some agents failed:');
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }

  // Check individual agent results
  for (const agent of result.agents) {
    if (agent.status === 'failed') {
      console.error(`Agent ${agent.agentId} failed: ${agent.error}`);
    }
  }
}
```

### 5. Clean Up Resources

```typescript
// Clear completed agents periodically
orchestrator.clearCompleted();

// Or stop and clear all
const agents = orchestrator.listAgents();
for (const agent of agents) {
  if (agent.status === 'running') {
    await orchestrator.stop(agent.agentId);
  }
}
orchestrator.clearCompleted();
```

## Integration with Task Tool

The `task` tool uses the orchestrator internally:

```typescript
// This tool call:
{
  name: 'task',
  arguments: {
    description: 'Find errors',
    prompt: 'Search for TypeScript errors',
    mode: 'background'
  }
}

// Internally calls:
orchestrator.spawn(task, config, context);
orchestrator.executeBackground(agentId, context);
```

## Example: Complex Multi-Agent Workflow

```typescript
// Phase 1: Parallel research
const research = await orchestrator.executeParallel([
  {
    task: 'Research API patterns in codebase',
    config: { role: 'librarian', tools: ['grep', 'glob', 'read_file'] }
  },
  {
    task: 'Find similar implementations',
    config: { role: 'finder', tools: ['grep', 'glob'] }
  }
]);

// Phase 2: Sequential implementation
const implementation = await orchestrator.executeSequential([
  {
    task: 'Design the API based on research',
    config: { role: 'oracle', tools: [] }  // Pure reasoning
  },
  {
    task: 'Implement the API',
    config: { role: 'general', tools: ['write_file', 'read_file'] }
  },
  {
    task: 'Write tests for the API',
    config: { role: 'tester', tools: ['write_file', 'read_file', 'bash'] }
  }
]);

// Phase 3: Parallel validation
const validation = await orchestrator.executeParallel([
  {
    task: 'Run tests',
    config: { role: 'tester', tools: ['bash'] }
  },
  {
    task: 'Review code quality',
    config: { role: 'reviewer', tools: ['grep', 'read_file'] }
  },
  {
    task: 'Check documentation',
    config: { role: 'reviewer', tools: ['read_file', 'grep'] }
  }
]);

console.log('Total tokens:',
  research.totalTokens + implementation.totalTokens + validation.totalTokens
);
```

## Performance Considerations

### Token Usage
- Each sub-agent has its own context (doesn't inherit parent's full history)
- Agents share tools but have separate conversation memory
- Total tokens = sum of all agent tokens

### Memory
- Each agent maintains its own execution steps
- Completed agents can be cleared to free memory
- Use `maxParallel` to limit concurrent memory usage

### Cost Control
- Set budget limits per agent
- Monitor `totalCost` in results
- Stop expensive agents early if needed

---

**See also:**
- [Tools Documentation](./TOOLS.md) for available tools
- [Agent Configuration](../README.md#agent-configuration) for config options
