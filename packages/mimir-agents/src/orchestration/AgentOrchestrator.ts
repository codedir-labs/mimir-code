/**
 * AgentOrchestrator - Coordinate multiple agents for complex tasks
 */

import type { IAgent } from '../core/interfaces/IAgent.js';
import type { AgentConfig, AgentContext, AgentResult } from '../core/types.js';

/**
 * Sub-agent execution state
 */
export interface SubAgentState {
  agentId: string;
  agent: IAgent;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  result?: AgentResult;
  error?: string;
}

/**
 * Orchestration result
 */
export interface OrchestrationResult {
  success: boolean;
  agents: SubAgentState[];
  totalDuration: number;
  totalTokens: number;
  totalCost: number;
  errors: string[];
}

/**
 * Task specification with dependencies
 */
export interface TaskSpec {
  id: string; // Unique task ID
  task: string;
  config: AgentConfig;
  context?: AgentContext;
  dependsOn?: string[]; // IDs of tasks this depends on
}

/**
 * Agent factory interface
 */
export interface IAgentFactory {
  createAgent(config: AgentConfig): IAgent;
}

/**
 * Agent orchestrator for managing multiple sub-agents
 */
export class AgentOrchestrator {
  private agents: Map<string, SubAgentState> = new Map();
  private executingCount = 0;
  private maxParallel: number;

  constructor(
    private agentFactory: IAgentFactory,
    options: {
      maxParallel?: number;
    } = {}
  ) {
    this.maxParallel = options.maxParallel || 4;
  }

  /**
   * Spawn a sub-agent
   */
  async spawn(
    task: string,
    config: AgentConfig,
    _context: AgentContext
  ): Promise<{ agentId: string; agent: IAgent }> {
    const agent = this.agentFactory.createAgent(config);
    const agentId = agent.id;

    const state: SubAgentState = {
      agentId,
      agent,
      task,
      status: 'pending',
    };

    this.agents.set(agentId, state);

    return { agentId, agent };
  }

  /**
   * Execute a sub-agent (blocking)
   */
  async execute(agentId: string, context: AgentContext): Promise<AgentResult> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Wait for execution slot if at max parallel
    while (this.executingCount >= this.maxParallel) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.executingCount++;
    state.status = 'running';
    state.startTime = new Date();

    try {
      const result = await state.agent.execute(state.task, context);
      state.result = result;
      state.status = result.success ? 'completed' : 'failed';
      state.endTime = new Date();

      // Set error message if agent failed
      if (!result.success) {
        state.error = result.finalResponse || 'Agent execution failed';
      }

      return result;
    } catch (error) {
      state.status = 'failed';
      state.error = error instanceof Error ? error.message : 'Unknown error';
      state.endTime = new Date();

      throw error;
    } finally {
      this.executingCount--;
    }
  }

  /**
   * Execute a sub-agent in background (non-blocking)
   */
  async executeBackground(agentId: string, context: AgentContext): Promise<void> {
    // Fire and forget
    this.execute(agentId, context).catch((error) => {
      const state = this.agents.get(agentId);
      if (state) {
        state.error = error instanceof Error ? error.message : 'Unknown error';
      }
    });
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel(
    tasks: Array<{ task: string; config: AgentConfig; context?: AgentContext }>
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const agents: SubAgentState[] = [];
    const errors: string[] = [];

    // Spawn all agents
    for (const { task, config, context } of tasks) {
      try {
        const { agentId } = await this.spawn(task, config, context || {});
        const state = this.agents.get(agentId)!;
        agents.push(state);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Failed to spawn agent');
      }
    }

    // Execute all agents in parallel (respecting maxParallel)
    const executions = agents.map((state) =>
      this.execute(state.agentId, tasks[agents.indexOf(state)]?.context || {}).catch((error) => {
        errors.push(`Agent ${state.agentId}: ${error.message}`);
        return null;
      })
    );

    await Promise.all(executions);

    // Collect errors from failed agents (even if they didn't throw)
    for (const state of agents) {
      if (
        state.status === 'failed' &&
        state.error &&
        !errors.some((e) => e.includes(state.agentId))
      ) {
        errors.push(`Agent ${state.agentId}: ${state.error}`);
      }
    }

    // Calculate totals
    let totalTokens = 0;
    let totalCost = 0;
    const totalDuration = Date.now() - startTime;

    for (const state of agents) {
      if (state.result) {
        totalTokens += state.result.totalTokens;
        totalCost += state.result.totalCost;
      }
    }

    const success = agents.every((s) => s.status === 'completed') && errors.length === 0;

    return {
      success,
      agents,
      totalDuration,
      totalTokens,
      totalCost,
      errors,
    };
  }

  /**
   * Execute agents sequentially
   */
  async executeSequential(
    tasks: Array<{ task: string; config: AgentConfig; context?: AgentContext }>
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const agents: SubAgentState[] = [];
    const errors: string[] = [];

    for (const { task, config, context } of tasks) {
      try {
        const { agentId } = await this.spawn(task, config, context || {});
        await this.execute(agentId, context || {});
        const state = this.agents.get(agentId)!;
        agents.push(state);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Agent execution failed');
      }
    }

    // Calculate totals
    let totalTokens = 0;
    let totalCost = 0;
    const totalDuration = Date.now() - startTime;

    for (const state of agents) {
      if (state.result) {
        totalTokens += state.result.totalTokens;
        totalCost += state.result.totalCost;
      }
    }

    const success = agents.every((s) => s.status === 'completed') && errors.length === 0;

    return {
      success,
      agents,
      totalDuration,
      totalTokens,
      totalCost,
      errors,
    };
  }

  /**
   * Execute agents with dependency graph (DAG-based execution)
   *
   * Performs topological sort and executes agents in waves, where each
   * wave contains agents whose dependencies have been satisfied.
   *
   * @param tasks - Array of task specifications with dependencies
   * @returns Orchestration result
   */
  async executeWithDependencies(tasks: TaskSpec[]): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const taskMap = new Map<string, TaskSpec>();
    const completed = new Set<string>();
    const agentStates: SubAgentState[] = [];

    // Build task map
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    // Validate dependencies
    for (const task of tasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskMap.has(depId)) {
            errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        agents: [],
        totalDuration: Date.now() - startTime,
        totalTokens: 0,
        totalCost: 0,
        errors,
      };
    }

    // Execute in waves (topological sort)
    while (completed.size < tasks.length) {
      // Find tasks ready to execute (all dependencies completed)
      const ready: TaskSpec[] = [];
      for (const task of tasks) {
        if (completed.has(task.id)) continue;

        const depsReady = !task.dependsOn || task.dependsOn.every((depId) => completed.has(depId));
        if (depsReady) {
          ready.push(task);
        }
      }

      if (ready.length === 0 && completed.size < tasks.length) {
        // Circular dependency detected
        const remaining = tasks
          .filter((t) => !completed.has(t.id))
          .map((t) => t.id)
          .join(', ');
        errors.push(`Circular dependency detected. Remaining tasks: ${remaining}`);
        break;
      }

      // Execute ready tasks in parallel
      const waveTasks = ready.map((taskSpec) => ({
        task: taskSpec.task,
        config: taskSpec.config,
        context: taskSpec.context,
      }));

      const waveResult = await this.executeParallel(waveTasks);

      // Mark completed and collect results
      for (let i = 0; i < ready.length; i++) {
        const taskSpec = ready[i]!;
        const state = waveResult.agents[i];
        if (state) {
          completed.add(taskSpec.id);
          agentStates.push(state);

          if (state.status === 'failed') {
            errors.push(`Task ${taskSpec.id} failed: ${state.error}`);
          }
        }
      }

      errors.push(...waveResult.errors);
    }

    // Calculate totals
    let totalTokens = 0;
    let totalCost = 0;

    for (const state of agentStates) {
      if (state.result) {
        totalTokens += state.result.totalTokens;
        totalCost += state.result.totalCost;
      }
    }

    const success = agentStates.every((s) => s.status === 'completed') && errors.length === 0;

    return {
      success,
      agents: agentStates,
      totalDuration: Date.now() - startTime,
      totalTokens,
      totalCost,
      errors,
    };
  }

  /**
   * Get agent status
   */
  getStatus(agentId: string): SubAgentState | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get result (blocking - waits for completion)
   */
  async getResult(agentId: string): Promise<AgentResult> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // If already completed, return result
    if (state.result) {
      return state.result;
    }

    // If not running yet, start execution
    if (state.status === 'pending') {
      return await this.execute(agentId, {});
    }

    // Wait for running agent to complete
    while (!state.result && state.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!state.result) {
      throw new Error(`Agent ${agentId} failed: ${state.error}`);
    }

    return state.result;
  }

  /**
   * Check result (non-blocking)
   */
  async checkResult(agentId: string): Promise<AgentResult | null> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return state.result || null;
  }

  /**
   * Stop an agent
   */
  async stop(agentId: string): Promise<void> {
    const state = this.agents.get(agentId);
    if (!state) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await state.agent.stop();
  }

  /**
   * Get all agents
   */
  listAgents(): SubAgentState[] {
    return Array.from(this.agents.values());
  }

  /**
   * Clear completed agents
   */
  clearCompleted(): void {
    for (const [id, state] of this.agents.entries()) {
      if (state.status === 'completed' || state.status === 'failed') {
        this.agents.delete(id);
      }
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const agents = Array.from(this.agents.values());
    return {
      total: agents.length,
      pending: agents.filter((a) => a.status === 'pending').length,
      running: agents.filter((a) => a.status === 'running').length,
      completed: agents.filter((a) => a.status === 'completed').length,
      failed: agents.filter((a) => a.status === 'failed').length,
    };
  }
}
