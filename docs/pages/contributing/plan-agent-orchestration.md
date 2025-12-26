# Agent Orchestration - Implementation Plan

## Overview

Multi-agent system for Mimir, allowing complex tasks to be split across specialized agents running in parallel or nested hierarchies. Includes sub-agent creation, role-based specialization, interactive model selection, and comprehensive progress tracking.

## Goals

1. **Task Decomposition**: Automatically detect when tasks can be split
2. **Specialized Agents**: Role-based agents (finder, oracle, librarian, refactoring, etc.)
3. **Parallel Execution**: Run independent sub-agents simultaneously
4. **Nested Agents**: Support sub-agents creating their own sub-agents
5. **Interactive Setup**: User approval and customization of sub-agent plan
6. **Progress Tracking**: Real-time status, cost, time for each agent
7. **Centralized Communication**: Orchestrator manages all inter-agent coordination

---

## Architecture

### 1. Core Interfaces

```typescript
interface AgentOrchestrator {
  // Main execution
  execute(task: string, options: OrchestratorOptions): Promise<Result>;

  // Sub-agent management
  createSubAgent(config: SubAgentConfig): Promise<Agent>;
  createNestedAgent(parentId: string, config: SubAgentConfig): Promise<Agent>;

  // Detection & planning
  detectParallelTasks(task: string): Promise<ParallelTaskPlan>;
  shouldUseMultipleAgents(task: string): Promise<boolean>;

  // Specialized agents
  getSpecializedAgent(role: AgentRole): Promise<Agent>;

  // Communication
  sendMessage(fromAgentId: string, toAgentId: string, message: AgentMessage): Promise<void>;
  broadcastMessage(fromAgentId: string, message: AgentMessage): Promise<void>;
  getSharedContext(): SharedContext;
}

interface Agent {
  id: string;
  role: AgentRole;
  model: string;
  tools: Tool[];
  status: AgentStatus;
  parent?: string;
  children: string[];

  // Execution
  execute(task: string): Promise<AgentResult>;
  interrupt(): Promise<void>;
  resume(): Promise<void>;

  // Communication
  sendToOrchestrator(message: AgentMessage): Promise<void>;
  receiveMessage(message: AgentMessage): Promise<void>;

  // Metrics
  getMetrics(): AgentMetrics;
}

type AgentRole =
  | 'main'           // Main orchestrator agent
  | 'finder'         // Quick searches, file discovery
  | 'oracle'         // Deep reasoning, complex debugging
  | 'librarian'      // API/docs research
  | 'refactoring'    // Code refactoring
  | 'rush'           // Quick targeted loops
  | 'reviewer'       // Code review, security analysis
  | 'tester';        // Test generation

type AgentStatus =
  | 'pending'        // Not started
  | 'initializing'   // Setting up
  | 'running'        // Executing
  | 'waiting'        // Waiting for sub-agent or user input
  | 'completed'      // Finished successfully
  | 'failed'         // Encountered error
  | 'interrupted';   // User interrupted

interface SubAgentConfig {
  role: AgentRole;
  model: string;
  task: string;
  tools: string[];  // Tool names this agent can use
  budget: {
    maxTokens?: number;
    maxCost?: number;
    maxDuration?: number; // ms
  };
  parent?: string;  // Parent agent ID (for nested agents)
  autoStart: boolean;
}

interface ParallelTaskPlan {
  canParallelize: boolean;
  tasks: Array<{
    description: string;
    recommendedRole: AgentRole;
    recommendedModel: string;
    estimatedTokens: number;
    dependencies: string[]; // Task IDs this depends on
  }>;
}

interface AgentMetrics {
  startTime: Date;
  endTime?: Date;
  duration: number; // ms
  tokensUsed: number;
  cost: number;
  iterations: number;
  toolCalls: number;
}

interface AgentMessage {
  from: string;
  to: string;
  type: 'result' | 'request' | 'status' | 'error';
  content: any;
  timestamp: Date;
}

interface SharedContext {
  workingDirectory: string;
  conversationId: string;
  findings: Map<string, any>; // Shared results from agents
  decisions: PermissionDecision[];
}
```

### 2. Orchestrator Implementation

```typescript
class DefaultAgentOrchestrator implements AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private sharedContext: SharedContext;
  private messageQueue: AgentMessage[] = [];

  constructor(
    private config: Config,
    private llm: ILLMProvider,
    private toolRegistry: ToolRegistry,
    private storage: IStorageBackend
  ) {
    this.sharedContext = {
      workingDirectory: process.cwd(),
      conversationId: generateId(),
      findings: new Map(),
      decisions: [],
    };
  }

  async execute(
    task: string,
    options: OrchestratorOptions
  ): Promise<Result> {
    // 1. Detect if task needs multiple agents
    const shouldUseMultiple = await this.shouldUseMultipleAgents(task);

    if (!shouldUseMultiple) {
      // Single agent execution
      const mainAgent = await this.createMainAgent(task);
      return await mainAgent.execute(task);
    }

    // 2. Decompose task into parallel sub-tasks
    const plan = await this.detectParallelTasks(task);

    // 3. Present plan to user (if configured)
    if (this.config.agentOrchestration?.promptForApproval !== false) {
      const approved = await this.presentPlanToUser(plan);
      if (!approved) {
        return { success: false, message: 'User rejected plan' };
      }
    }

    // 4. Create sub-agents
    const agents = await this.createSubAgentsFromPlan(plan);

    // 5. Execute in parallel (or sequential based on dependencies)
    const results = await this.executeAgents(agents);

    // 6. Merge results
    return await this.mergeResults(results);
  }

  async shouldUseMultipleAgents(task: string): Promise<boolean> {
    // Use LLM to detect if task is complex enough for multiple agents
    const prompt = `
Analyze this task and determine if it should be split across multiple specialized agents.

Task: ${task}

Consider:
- Is this a single focused task, or multiple distinct sub-tasks?
- Would parallel execution significantly speed this up?
- Are there different types of work (research, coding, testing, etc.)?

Respond with JSON:
{
  "useMultipleAgents": boolean,
  "reasoning": string
}
    `;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a task analysis expert.' },
      { role: 'user', content: prompt },
    ]);

    const analysis = JSON.parse(response.content);
    return analysis.useMultipleAgents;
  }

  async detectParallelTasks(task: string): Promise<ParallelTaskPlan> {
    const prompt = `
Break down this task into parallel sub-tasks that can be executed by specialized agents.

Task: ${task}

Available agent roles:
- finder: Quick file searches, code discovery (fast model: Haiku, Qwen)
- oracle: Deep reasoning, complex debugging, tricky bugs (reasoning model: o3, GPT-5)
- librarian: API documentation, library research (Sonnet 4.5)
- refactoring: Code refactoring, optimization (Sonnet 4.5)
- reviewer: Code review, security analysis (Sonnet 4.5 or o3)
- tester: Test generation, test analysis (Sonnet 4.5)

Respond with JSON:
{
  "tasks": [
    {
      "id": "task-1",
      "description": "Search for all authentication files",
      "recommendedRole": "finder",
      "recommendedModel": "haiku-4.5",
      "estimatedTokens": 1000,
      "dependencies": []
    },
    {
      "id": "task-2",
      "description": "Review auth code for security issues",
      "recommendedRole": "reviewer",
      "recommendedModel": "sonnet-4.5",
      "estimatedTokens": 3000,
      "dependencies": ["task-1"]
    }
  ]
}
    `;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a task planning expert.' },
      { role: 'user', content: prompt },
    ]);

    const plan = JSON.parse(response.content);

    return {
      canParallelize: plan.tasks.length > 1,
      tasks: plan.tasks,
    };
  }

  private async presentPlanToUser(
    plan: ParallelTaskPlan
  ): Promise<boolean> {
    // Display interactive UI for user to review and customize plan
    const ui = new AgentPlanUI(plan, this.config);
    return await ui.present();
  }

  private async createSubAgentsFromPlan(
    plan: ParallelTaskPlan
  ): Promise<Agent[]> {
    const agents: Agent[] = [];

    for (const task of plan.tasks) {
      const config: SubAgentConfig = {
        role: task.recommendedRole as AgentRole,
        model: task.recommendedModel,
        task: task.description,
        tools: this.getToolsForRole(task.recommendedRole as AgentRole),
        budget: {
          maxTokens: task.estimatedTokens * 2, // 2x buffer
        },
        autoStart: task.dependencies.length === 0, // Auto-start if no deps
      };

      const agent = await this.createSubAgent(config);
      agents.push(agent);
    }

    return agents;
  }

  async createSubAgent(config: SubAgentConfig): Promise<Agent> {
    // Check if model is allowed by enterprise policy
    if (!this.isModelAllowed(config.model)) {
      config.model = this.getFallbackModel(config.role);
    }

    // Check if sub-agent is allowed
    if (!this.isSubAgentAllowed(config.role)) {
      throw new Error(
        `Sub-agent role '${config.role}' is not allowed by enterprise policy`
      );
    }

    // Get LLM provider for this model
    const llm = await this.createLLMProvider(config.model);

    // Get tools for this agent (restricted by role)
    const tools = this.getRestrictedTools(config.tools);

    // Create agent
    const agent = new SubAgent(
      generateId(),
      config,
      llm,
      tools,
      this,
      this.storage
    );

    this.agents.set(agent.id, agent);

    return agent;
  }

  async createNestedAgent(
    parentId: string,
    config: SubAgentConfig
  ): Promise<Agent> {
    // Check nesting depth
    const depth = this.getAgentDepth(parentId);
    const maxDepth = this.config.agentOrchestration?.maxNestingDepth ?? 2;

    if (depth >= maxDepth) {
      throw new Error(
        `Max nesting depth (${maxDepth}) exceeded. Cannot create nested agent.`
      );
    }

    config.parent = parentId;
    return await this.createSubAgent(config);
  }

  private async executeAgents(agents: Agent[]): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    // Build dependency graph
    const graph = this.buildDependencyGraph(agents);

    // Execute in topological order (respecting dependencies)
    const executionOrder = this.topologicalSort(graph);

    for (const batch of executionOrder) {
      // Execute agents in this batch in parallel
      const batchResults = await Promise.all(
        batch.map(agentId => {
          const agent = this.agents.get(agentId)!;
          return agent.execute(agent.config.task);
        })
      );

      results.push(...batchResults);

      // Store results in shared context for dependent agents
      for (let i = 0; i < batch.length; i++) {
        const agentId = batch[i];
        const result = batchResults[i];
        this.sharedContext.findings.set(agentId, result);
      }
    }

    return results;
  }

  private buildDependencyGraph(agents: Agent[]): Map<string, string[]> {
    // Build graph of agent dependencies
    const graph = new Map<string, string[]>();

    for (const agent of agents) {
      const deps = agent.config.dependencies || [];
      graph.set(agent.id, deps);
    }

    return graph;
  }

  private topologicalSort(graph: Map<string, string[]>): string[][] {
    // Return batches of agents that can run in parallel
    // Each batch contains agents with no dependencies on later batches

    const batches: string[][] = [];
    const processed = new Set<string>();

    while (processed.size < graph.size) {
      const batch: string[] = [];

      for (const [agentId, deps] of graph.entries()) {
        if (processed.has(agentId)) continue;

        // Can execute if all dependencies are processed
        const canExecute = deps.every(dep => processed.has(dep));

        if (canExecute) {
          batch.push(agentId);
        }
      }

      if (batch.length === 0) {
        throw new Error('Circular dependency detected in agent graph');
      }

      batches.push(batch);
      batch.forEach(id => processed.add(id));
    }

    return batches;
  }

  private getToolsForRole(role: AgentRole): string[] {
    // Map roles to allowed tools
    const roleToolMap: Record<AgentRole, string[]> = {
      main: ['*'], // All tools
      finder: ['file_operations', 'file_search', 'git'],
      oracle: ['file_operations', 'file_search', 'bash_execution', 'git'],
      librarian: ['file_operations', 'file_search'], // Read-only
      refactoring: ['file_operations', 'file_search', 'bash_execution'],
      rush: ['file_operations', 'bash_execution'],
      reviewer: ['file_operations', 'file_search', 'git'],
      tester: ['file_operations', 'bash_execution', 'git'],
    };

    return roleToolMap[role] || [];
  }

  private getRestrictedTools(toolNames: string[]): Tool[] {
    if (toolNames.includes('*')) {
      return this.toolRegistry.getAllTools();
    }

    return toolNames
      .map(name => this.toolRegistry.getTool(name))
      .filter(Boolean) as Tool[];
  }

  private isModelAllowed(model: string): boolean {
    const allowedModels = this.config.enforcement?.allowedModels;
    if (!allowedModels) return true;

    return allowedModels.includes(model);
  }

  private isSubAgentAllowed(role: AgentRole): boolean {
    const allowedSubAgents = this.config.enforcement?.allowedSubAgents;
    if (!allowedSubAgents) return true;

    return allowedSubAgents.includes(role);
  }

  private getFallbackModel(role: AgentRole): string {
    const allowedModels = this.config.enforcement?.allowedModels || [];

    // Role-based model preferences
    const preferences: Record<AgentRole, string[]> = {
      finder: ['haiku-4.5', 'qwen-3', 'sonnet-4.5'],
      oracle: ['o3', 'gpt-5', 'sonnet-4.5'],
      librarian: ['sonnet-4.5', 'haiku-4.5'],
      refactoring: ['sonnet-4.5'],
      reviewer: ['sonnet-4.5', 'o3'],
      tester: ['sonnet-4.5'],
      rush: ['haiku-4.5', 'qwen-3'],
      main: ['sonnet-4.5'],
    };

    const preferred = preferences[role];
    for (const model of preferred) {
      if (allowedModels.includes(model)) {
        return model;
      }
    }

    // Fallback to first allowed model
    return allowedModels[0] || 'sonnet-4.5';
  }

  private getAgentDepth(agentId: string): number {
    let depth = 0;
    let currentId: string | undefined = agentId;

    while (currentId) {
      const agent = this.agents.get(currentId);
      if (!agent) break;

      depth++;
      currentId = agent.parent;
    }

    return depth;
  }

  private async mergeResults(results: AgentResult[]): Promise<Result> {
    // Merge results from all agents into final result
    const allSuccess = results.every(r => r.success);

    const summary = results
      .map((r, i) => `Agent ${i + 1}: ${r.summary}`)
      .join('\n');

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);

    return {
      success: allSuccess,
      message: summary,
      metadata: {
        totalCost,
        totalTokens,
        agentCount: results.length,
      },
    };
  }

  // Communication methods
  async sendMessage(
    fromAgentId: string,
    toAgentId: string,
    message: AgentMessage
  ): Promise<void> {
    message.from = fromAgentId;
    message.to = toAgentId;
    message.timestamp = new Date();

    this.messageQueue.push(message);

    const toAgent = this.agents.get(toAgentId);
    if (toAgent) {
      await toAgent.receiveMessage(message);
    }
  }

  async broadcastMessage(
    fromAgentId: string,
    message: AgentMessage
  ): Promise<void> {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agentId !== fromAgentId) {
        await this.sendMessage(fromAgentId, agentId, message);
      }
    }
  }

  getSharedContext(): SharedContext {
    return this.sharedContext;
  }

  async getSpecializedAgent(role: AgentRole): Promise<Agent> {
    // Get or create a specialized agent for this role
    const existing = Array.from(this.agents.values()).find(
      a => a.role === role && a.status === 'pending'
    );

    if (existing) {
      return existing;
    }

    // Create new specialized agent
    const config: SubAgentConfig = {
      role,
      model: this.getDefaultModelForRole(role),
      task: '', // Will be set when executed
      tools: this.getToolsForRole(role),
      budget: {},
      autoStart: false,
    };

    return await this.createSubAgent(config);
  }

  private getDefaultModelForRole(role: AgentRole): string {
    const defaults: Record<AgentRole, string> = {
      finder: 'haiku-4.5',
      oracle: 'o3',
      librarian: 'sonnet-4.5',
      refactoring: 'sonnet-4.5',
      reviewer: 'sonnet-4.5',
      tester: 'sonnet-4.5',
      rush: 'haiku-4.5',
      main: 'sonnet-4.5',
    };

    return defaults[role];
  }
}
```

### 3. Sub-Agent Implementation

```typescript
class SubAgent implements Agent {
  public status: AgentStatus = 'pending';
  public children: string[] = [];
  private metrics: AgentMetrics;
  private todoList: TodoItem[] = [];

  constructor(
    public id: string,
    public config: SubAgentConfig,
    private llm: ILLMProvider,
    public tools: Tool[],
    private orchestrator: AgentOrchestrator,
    private storage: IStorageBackend
  ) {
    this.metrics = {
      startTime: new Date(),
      duration: 0,
      tokensUsed: 0,
      cost: 0,
      iterations: 0,
      toolCalls: 0,
    };
  }

  get role(): AgentRole {
    return this.config.role;
  }

  get model(): string {
    return this.config.model;
  }

  get parent(): string | undefined {
    return this.config.parent;
  }

  async execute(task: string): Promise<AgentResult> {
    this.status = 'initializing';
    this.metrics.startTime = new Date();

    try {
      // Create todo list for this task
      await this.createTodoList(task);

      this.status = 'running';

      // Execute ReAct loop
      const result = await this.reactLoop(task);

      this.status = 'completed';
      this.metrics.endTime = new Date();
      this.metrics.duration =
        this.metrics.endTime.getTime() - this.metrics.startTime.getTime();

      return {
        success: true,
        summary: result,
        tokensUsed: this.metrics.tokensUsed,
        cost: this.metrics.cost,
        agentId: this.id,
      };
    } catch (error) {
      this.status = 'failed';
      return {
        success: false,
        summary: `Failed: ${error.message}`,
        tokensUsed: this.metrics.tokensUsed,
        cost: this.metrics.cost,
        agentId: this.id,
        error: error.message,
      };
    }
  }

  private async createTodoList(task: string): Promise<void> {
    // Create task breakdown for progress tracking
    const prompt = `
Break down this task into concrete, actionable todo items.

Task: ${task}
Role: ${this.role}

Respond with JSON array of todo items:
[
  { "description": "Search for auth files", "status": "pending" },
  { "description": "Analyze authentication logic", "status": "pending" }
]
    `;

    const response = await this.llm.chat([
      { role: 'system', content: 'You are a task planning assistant.' },
      { role: 'user', content: prompt },
    ]);

    this.todoList = JSON.parse(response.content);
  }

  private async reactLoop(task: string): Promise<string> {
    const messages: Message[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(),
      },
      {
        role: 'user',
        content: task,
      },
    ];

    for (let i = 0; i < 20; i++) {
      this.metrics.iterations++;

      // Check budget
      if (this.isOverBudget()) {
        throw new Error('Budget exceeded');
      }

      // Reason: Get next action from LLM
      const response = await this.llm.chat(messages, this.tools);

      this.metrics.tokensUsed += response.usage.inputTokens + response.usage.outputTokens;
      this.metrics.cost += this.llm.calculateCost(
        response.usage.inputTokens,
        response.usage.outputTokens
      );

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Act: Execute tools
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          this.metrics.toolCalls++;

          const tool = this.tools.find(t => t.name === toolCall.name);
          if (!tool) {
            throw new Error(`Tool not found: ${toolCall.name}`);
          }

          const result = await tool.execute(toolCall.arguments, {
            platform: this.orchestrator.platform,
            config: this.orchestrator.config,
            conversation: this.orchestrator.getSharedContext(),
            logger: this.orchestrator.logger,
            llm: this.llm,
            permissions: this.orchestrator.permissions,
          });

          messages.push({
            role: 'tool',
            content: result.output,
            toolCallId: toolCall.id,
          });

          // Update todo list
          await this.updateTodoProgress();
        }
      }

      // Check if finished
      if (this.isTaskComplete(response)) {
        return this.extractFinalAnswer(response);
      }
    }

    throw new Error('Max iterations reached');
  }

  private buildSystemPrompt(): string {
    const rolePrompts: Record<AgentRole, string> = {
      finder: `You are a code finder agent. Your role is to quickly locate files and code patterns.
Use file search tools efficiently. Focus on speed and accuracy.`,

      oracle: `You are a reasoning agent specialized in complex problem-solving and debugging.
Take time to think through tricky issues. Use step-by-step reasoning.`,

      librarian: `You are a research agent specialized in API documentation and library usage.
Search documentation, find examples, explain library features.`,

      refactoring: `You are a refactoring agent. Analyze code and suggest improvements.
Focus on code quality, patterns, and best practices.`,

      reviewer: `You are a code review agent. Analyze code for correctness, security, and quality.
Look for bugs, vulnerabilities, and design issues.`,

      tester: `You are a test generation agent. Create comprehensive test cases.
Cover edge cases, error handling, and integration scenarios.`,

      rush: `You are a rapid execution agent. Execute quick, targeted operations efficiently.
Focus on speed and completing small tasks in 3-5 iterations.`,

      main: `You are the main orchestrator agent. Coordinate complex tasks and delegate to specialized agents when needed.`,
    };

    return rolePrompts[this.role];
  }

  private isOverBudget(): boolean {
    const { maxTokens, maxCost, maxDuration } = this.config.budget;

    if (maxTokens && this.metrics.tokensUsed > maxTokens) {
      return true;
    }

    if (maxCost && this.metrics.cost > maxCost) {
      return true;
    }

    if (maxDuration) {
      const elapsed = Date.now() - this.metrics.startTime.getTime();
      if (elapsed > maxDuration) {
        return true;
      }
    }

    return false;
  }

  private isTaskComplete(response: ChatResponse): boolean {
    // Check if LLM indicated completion
    return (
      response.content.includes('[COMPLETE]') ||
      response.content.includes('[DONE]') ||
      !response.toolCalls ||
      response.toolCalls.length === 0
    );
  }

  private extractFinalAnswer(response: ChatResponse): string {
    // Extract final answer from response
    return response.content;
  }

  private async updateTodoProgress(): Promise<void> {
    // Update todo list based on tool calls (simplified)
    // In real implementation, would use LLM to analyze progress
  }

  async interrupt(): Promise<void> {
    this.status = 'interrupted';
  }

  async resume(): Promise<void> {
    this.status = 'running';
  }

  async sendToOrchestrator(message: AgentMessage): Promise<void> {
    message.from = this.id;
    message.to = 'orchestrator';
    await this.orchestrator.receiveMessage(message);
  }

  async receiveMessage(message: AgentMessage): Promise<void> {
    // Handle messages from orchestrator or other agents
    if (message.type === 'request') {
      // Another agent needs information
      this.status = 'waiting';
    }
  }

  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  getTodoList(): TodoItem[] {
    return [...this.todoList];
  }
}
```

### 4. Interactive Agent Plan UI

```typescript
class AgentPlanUI {
  constructor(
    private plan: ParallelTaskPlan,
    private config: Config
  ) {}

  async present(): Promise<boolean> {
    console.log('\n' + chalk.bold('Multi-Agent Execution Plan'));
    console.log(chalk.gray('This task can be split into parallel sub-tasks:\n'));

    const tasks = this.plan.tasks.map((task, i) => ({
      id: task.id,
      index: i + 1,
      description: task.description,
      role: task.recommendedRole,
      model: task.recommendedModel,
      estimatedTokens: task.estimatedTokens,
      estimatedCost: this.estimateCost(task.estimatedTokens),
      dependencies: task.dependencies,
      // User can modify:
      customModel: task.recommendedModel,
      customTask: task.description,
    }));

    // Display each task
    for (const task of tasks) {
      console.log(chalk.cyan(`[${task.index}] ${task.role} agent`));
      console.log(`    Model: ${chalk.yellow(task.model)} (recommended)`);
      console.log(`    Task: ${task.description}`);
      console.log(`    Est: ${task.estimatedTokens} tokens (~$${task.estimatedCost})`);

      if (task.dependencies.length > 0) {
        console.log(
          `    Depends on: ${task.dependencies.map(d => `Task ${d}`).join(', ')}`
        );
      }

      console.log();
    }

    const totalTokens = tasks.reduce((sum, t) => sum + t.estimatedTokens, 0);
    const totalCost = this.estimateCost(totalTokens);

    console.log(
      chalk.bold(`Total estimated: ${totalTokens} tokens (~$${totalCost})\n`)
    );

    // Prompt options
    const promptMode = this.config.agentOrchestration?.promptForModels ?? true;

    if (!promptMode) {
      // Auto-approve
      return true;
    }

    // Interactive options
    console.log('Options:');
    console.log('  [Y] Proceed with recommended plan');
    console.log('  [n] Cancel');
    console.log('  [e] Edit task descriptions or models');
    console.log('  [m] Manual mode (configure each agent)');
    console.log();

    const answer = await this.prompt('Proceed?');

    switch (answer.toLowerCase()) {
      case 'y':
      case '':
        return true;

      case 'n':
        return false;

      case 'e':
        await this.editPlan(tasks);
        return true;

      case 'm':
        await this.manualConfiguration(tasks);
        return true;

      default:
        return false;
    }
  }

  private async editPlan(tasks: any[]): Promise<void> {
    for (const task of tasks) {
      console.log(chalk.cyan(`\nEdit Task ${task.index}:`));
      console.log(`Current: ${task.description}`);

      const newDesc = await this.prompt('New description (Enter to keep):');
      if (newDesc) {
        task.customTask = newDesc;
      }

      console.log(`Current model: ${task.model}`);
      const newModel = await this.prompt('New model (Enter to keep):');
      if (newModel) {
        task.customModel = newModel;
      }
    }
  }

  private async manualConfiguration(tasks: any[]): Promise<void> {
    // Full interactive configuration for each agent
    console.log(chalk.bold('\nManual Agent Configuration\n'));

    for (const task of tasks) {
      console.log(chalk.cyan(`Task ${task.index}: ${task.role} agent`));

      task.customTask = await this.prompt('Task description:', task.description);
      task.customModel = await this.prompt('Model:', task.model);

      const budgetStr = await this.prompt('Max tokens (optional):');
      if (budgetStr) {
        task.budget = { maxTokens: parseInt(budgetStr, 10) };
      }
    }
  }

  private estimateCost(tokens: number): string {
    // Rough estimate (varies by provider)
    const costPer1k = 0.001; // $0.001 per 1000 tokens
    return ((tokens / 1000) * costPer1k).toFixed(4);
  }

  private async prompt(question: string, defaultValue?: string): Promise<string> {
    // Implement interactive prompt (using readline or similar)
    // Simplified for example:
    return defaultValue || '';
  }
}
```

### 5. Multi-Agent UI (Ink Component)

```typescript
// Display all agents in one pane, stacked vertically
const MultiAgentView: React.FC<{ orchestrator: AgentOrchestrator }> = ({
  orchestrator,
}) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    // Update agents every 500ms
    const interval = setInterval(() => {
      setAgents(orchestrator.getAllAgents());
    }, 500);

    return () => clearInterval(interval);
  }, [orchestrator]);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text bold>Multi-Agent Execution</Text>
      </Box>

      {agents.map(agent => (
        <AgentCard
          key={agent.id}
          agent={agent}
          isSelected={selectedAgentId === agent.id}
          onSelect={() => setSelectedAgentId(agent.id)}
        />
      ))}

      <Box marginTop={1}>
        <Text dimColor>
          Press {formatKeyboardShortcut('ArrowUp')}/{formatKeyboardShortcut('ArrowDown')} to navigate,{' '}
          {formatKeyboardShortcut('Enter')} to expand agent details
        </Text>
      </Box>
    </Box>
  );
};

const AgentCard: React.FC<{
  agent: Agent;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ agent, isSelected, onSelect }) => {
  const metrics = agent.getMetrics();
  const elapsed = Date.now() - metrics.startTime.getTime();
  const todoList = agent.getTodoList();

  const statusIcon = {
    pending: '○',
    initializing: '◐',
    running: '●',
    waiting: '◌',
    completed: '✓',
    failed: '✗',
    interrupted: '⏸',
  }[agent.status];

  const statusColor = {
    pending: 'gray',
    initializing: 'yellow',
    running: 'green',
    waiting: 'cyan',
    completed: 'green',
    failed: 'red',
    interrupted: 'yellow',
  }[agent.status];

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isSelected ? 'cyan' : 'gray'}
      paddingX={1}
      marginY={0}
    >
      <Box justifyContent="space-between">
        <Text>
          <Text color={statusColor}>{statusIcon}</Text>{' '}
          <Text bold>{agent.role}</Text> ({agent.model})
        </Text>
        <Text dimColor>
          {formatDuration(elapsed)} | ${metrics.cost.toFixed(4)} | {metrics.tokensUsed} tokens
        </Text>
      </Box>

      {/* Todo list (compact) */}
      <Box flexDirection="column" marginLeft={2}>
        {todoList.slice(0, 3).map((todo, i) => (
          <Text key={i} dimColor>
            {todo.status === 'completed' ? '✓' : '○'} {todo.description}
          </Text>
        ))}
        {todoList.length > 3 && (
          <Text dimColor>... +{todoList.length - 3} more</Text>
        )}
      </Box>

      {/* Keyboard shortcut to expand */}
      {isSelected && (
        <Box marginTop={1}>
          <Text dimColor>
            Press {formatKeyboardShortcut('Enter')} to view full details
          </Text>
        </Box>
      )}
    </Box>
  );
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
```

---

## Configuration Schema

```yaml
# .mimir/config.yml
agentOrchestration:
  enabled: true

  # Auto-detect when to use multiple agents
  autoDetect: true

  # Prompt user for approval before creating sub-agents
  promptForApproval: true

  # Prompt user to select models for each sub-agent
  promptForModels: true  # false = auto-select recommended

  # Max nesting depth for sub-agents
  maxNestingDepth: 2

  # Parallel execution
  maxParallelAgents: 4

  # Agent roles configuration
  roles:
    finder:
      enabled: true
      defaultModel: haiku-4.5
      tools: [file_operations, file_search, git]

    oracle:
      enabled: true
      defaultModel: o3-mini
      tools: [file_operations, file_search, bash_execution, git]

    reviewer:
      enabled: true
      defaultModel: sonnet-4.5
      tools: [file_operations, file_search, git]

    # ... other roles

# Enterprise enforcement
enforcement:
  allowedSubAgents: [finder, oracle, reviewer, tester]

  forcedSubAgents:
    security:
      enabled: true
      model: sonnet-4.5
      trigger: on-write  # always | on-write | on-commit | manual
```

---

## Communication Protocol

Agents communicate through the orchestrator (centralized):

1. **Agent → Orchestrator**: Report progress, request resources, signal completion
2. **Orchestrator → Agent**: Forward results from other agents, send commands
3. **Agent → Agent** (via Orchestrator): Share findings, request collaboration

Messages are queued and delivered asynchronously.

---

## Testing Strategy

### Unit Tests
- Task decomposition logic
- Dependency graph construction
- Topological sorting
- Budget enforcement
- Model selection/fallbacks

### Integration Tests
- Multi-agent execution (mocked LLM)
- Inter-agent communication
- Nested agent creation
- Parallel execution

### End-to-End Tests
- Full orchestration flow
- UI interactions (agent plan approval)
- Progress tracking
- Cost aggregation

---

## Security Considerations

1. **Tool Restrictions**: Sub-agents have limited tool access based on role
2. **Budget Limits**: Per-agent token/cost/time budgets enforced
3. **Nesting Depth**: Prevent infinite recursion
4. **Enterprise Enforcement**: Cannot bypass allowed models/sub-agents

---

## Implementation Phases

### Phase 1: Core Orchestrator
- [ ] Task detection (single vs multi-agent)
- [ ] Task decomposition (parallel task plan)
- [ ] Sub-agent creation
- [ ] Dependency graph & topological sort

### Phase 2: Specialized Agents
- [ ] Finder agent implementation
- [ ] Oracle agent implementation
- [ ] Reviewer agent implementation
- [ ] Tester agent implementation
- [ ] Tool restrictions per role

### Phase 3: Communication & Context
- [ ] Centralized message queue
- [ ] Shared context management
- [ ] Inter-agent messaging
- [ ] Result aggregation

### Phase 4: UI & UX
- [ ] Interactive agent plan UI
- [ ] Multi-agent view (Ink component)
- [ ] Progress tracking per agent
- [ ] Cost/time/status display

### Phase 5: Enterprise Features
- [ ] Enforced security agent
- [ ] Allowed models/sub-agents
- [ ] Model selection for sub-agents
- [ ] Nested agent configuration

---

## Rush Agent (Future)

Quick, targeted execution agent for simple tasks:
- Max 3-5 iterations
- Fast model (Haiku, Qwen)
- Limited tools (read-only + bash)
- 30-second timeout
- Use for: quick searches, status checks, simple queries

---

## Next Steps

1. Implement core orchestrator
2. Build task decomposition (LLM-based)
3. Create specialized agents
4. Add interactive plan UI
5. Implement parallel execution
6. Test with complex multi-step tasks
