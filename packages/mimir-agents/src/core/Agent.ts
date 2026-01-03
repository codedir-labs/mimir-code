/**
 * Agent - Core agent implementation with ReAct loop
 */

import type { IAgent } from './interfaces/IAgent.js';
import type {
  AgentAction,
  AgentBudget,
  AgentConfig,
  AgentContext,
  AgentObservation,
  AgentResult,
  AgentState,
  AgentStatus,
  AgentStep,
  StreamEvent,
  StreamEventType,
} from './types.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { IExecutor } from '../execution/IExecutor.js';

/**
 * LLM Provider interface (simplified for now)
 */
interface ILLMProvider {
  chat(
    messages: any[],
    tools?: any[]
  ): Promise<{
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>;
  countTokens(text: string): number;
  calculateCost(inputTokens: number, outputTokens: number): number;
}

/**
 * Core Agent implementation
 */
export class Agent implements IAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly role: string;

  private status: AgentStatus = 'idle';
  private steps: AgentStep[] = [];
  private context: AgentContext = {};
  private budget: AgentBudget;
  private startTime?: Date;
  private totalTokens = 0;
  private totalCost = 0;
  private stopRequested = false;
  private pauseRequested = false;

  private llm: ILLMProvider;
  private toolRegistry: ToolRegistry;
  private executor: IExecutor;
  private systemPrompt: string;
  // private temperature: number; // TODO: Pass to LLM when implemented

  constructor(
    config: AgentConfig,
    llm: ILLMProvider,
    toolRegistry: ToolRegistry,
    executor: IExecutor
  ) {
    this.id = `agent-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    this.name = config.name || 'Agent';
    this.role = config.role || 'general';
    this.llm = llm;
    this.toolRegistry = toolRegistry;
    this.executor = executor;
    this.systemPrompt = config.systemPrompt || this.getDefaultSystemPrompt();
    // this.temperature = config.temperature ?? 0.7; // TODO: Pass to LLM when implemented
    this.budget = config.budget || {};
  }

  /**
   * Emit a streaming event if callback is provided
   */
  private async emitStream(type: StreamEventType, data: StreamEvent['data']): Promise<void> {
    if (this.context.onStream) {
      const event: StreamEvent = {
        type,
        agentId: this.id,
        timestamp: new Date(),
        data,
      };
      await this.context.onStream(event);
    }
  }

  /**
   * Execute a task using ReAct loop
   */
  async execute(task: string, context?: AgentContext): Promise<AgentResult> {
    this.status = 'reasoning';
    this.context = context || {};
    this.startTime = new Date();
    this.stopRequested = false;
    this.pauseRequested = false;
    this.steps = [];
    this.totalTokens = 0;
    this.totalCost = 0;

    const maxIterations = this.budget.maxIterations || 20;
    let iteration = 0;

    try {
      while (iteration < maxIterations) {
        // Emit step start event
        await this.emitStream('step_start', {
          stepNumber: iteration + 1,
        });

        // Check for stop/pause requests
        if (this.stopRequested) {
          this.status = 'interrupted';
          break;
        }

        if (this.pauseRequested) {
          this.status = 'idle';
          throw new Error('Agent paused');
        }

        // Check budget constraints
        if (this.isOverBudget()) {
          this.status = 'failed';
          throw new Error('Budget exceeded');
        }

        // REASON: Get next action from LLM
        const action = await this.reason(task);

        // Emit thought event
        await this.emitStream('thought', {
          stepNumber: iteration + 1,
          thought: action.thought,
        });

        // ACT: Execute the action
        this.status = 'acting';

        // Emit action event
        await this.emitStream('action', {
          stepNumber: iteration + 1,
          action,
        });

        const observation = await this.act(action);

        // Emit observation event
        await this.emitStream('observation', {
          stepNumber: iteration + 1,
          observation,
        });

        // OBSERVE: Record the step
        this.status = 'observing';
        await this.observe(action, observation);

        // Emit step end event
        await this.emitStream('step_end', {
          stepNumber: iteration + 1,
        });

        // Check if agent wants to finish (after recording the step)
        if (action.type === 'finish') {
          this.status = 'completed';
          return this.createResult(true, action.response);
        }

        iteration++;

        // Emit progress event
        await this.emitStream('progress', {
          progress: {
            current: iteration,
            total: maxIterations,
            message: `Step ${iteration}/${maxIterations} completed`,
          },
        });
      }

      // Max iterations reached
      if (iteration >= maxIterations) {
        this.status = 'failed';
        return this.createResult(false, undefined, 'Maximum iterations reached');
      }

      // Interrupted or paused
      return this.createResult(false, undefined, 'Execution interrupted');
    } catch (error) {
      this.status = 'failed';
      return this.createResult(
        false,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * REASON: Determine next action using LLM
   */
  private async reason(task: string): Promise<AgentAction> {
    const messages = this.buildMessages(task);
    const tools = this.toolRegistry.getSchemas(this.budget.maxTokens ? undefined : undefined);

    const response = await this.llm.chat(messages, tools.length > 0 ? tools : undefined);

    // Track tokens
    const promptTokens = messages.reduce(
      (sum, msg) => sum + this.llm.countTokens(JSON.stringify(msg)),
      0
    );
    const completionTokens = this.llm.countTokens(response.content);
    this.totalTokens += promptTokens + completionTokens;
    this.totalCost += this.llm.calculateCost(promptTokens, completionTokens);

    // Parse action from response
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0]!;
      return {
        type: 'tool',
        tool: toolCall.name,
        input: toolCall.arguments,
        thought: response.content,
      };
    }

    // Check for finish signal
    if (
      response.content.toLowerCase().includes('task completed') ||
      response.content.toLowerCase().includes('final answer')
    ) {
      return {
        type: 'finish',
        thought: response.content,
        response: response.content,
      };
    }

    // Default to thinking
    return {
      type: 'think',
      thought: response.content,
    };
  }

  /**
   * ACT: Execute an action
   */
  private async act(action: AgentAction): Promise<AgentObservation> {
    if (action.type === 'tool' && action.tool) {
      const result = await this.toolRegistry.execute(action.tool, action.input || {}, {
        conversationId: this.context.conversationId,
        agentId: this.id,
        workingDirectory: this.executor.getCwd(),
        executor: this.executor,
        metadata: this.context.metadata,
      });

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        metadata: result.metadata,
      };
    }

    // For think/ask actions, no execution needed
    return {
      success: true,
      output: action.thought,
    };
  }

  /**
   * OBSERVE: Record the step
   */
  private async observe(action: AgentAction, observation: AgentObservation): Promise<void> {
    const step: AgentStep = {
      stepNumber: this.steps.length + 1,
      timestamp: new Date(),
      thought: action.thought || '',
      action,
      observation,
      tokens: this.totalTokens,
      cost: this.totalCost,
    };

    this.steps.push(step);
  }

  /**
   * Build messages for LLM
   */
  private buildMessages(task: string): any[] {
    const messages = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      {
        role: 'user',
        content: task,
      },
    ];

    // Add previous steps as context
    for (const step of this.steps) {
      messages.push({
        role: 'assistant',
        content: step.thought,
      });

      if (step.observation) {
        messages.push({
          role: 'user',
          content: `Observation: ${step.observation.success ? 'Success' : 'Error'}\n${
            step.observation.output || step.observation.error
          }`,
        });
      }
    }

    return messages;
  }

  /**
   * Check if budget is exceeded
   */
  private isOverBudget(): boolean {
    if (this.budget.maxTokens && this.totalTokens >= this.budget.maxTokens) {
      return true;
    }

    if (this.budget.maxCost && this.totalCost >= this.budget.maxCost) {
      return true;
    }

    if (this.budget.maxDuration && this.startTime) {
      const elapsed = Date.now() - this.startTime.getTime();
      if (elapsed >= this.budget.maxDuration) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create final result
   */
  private createResult(success: boolean, finalResponse?: string, error?: string): AgentResult {
    const duration = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    return {
      success,
      status: this.status,
      steps: this.steps,
      finalResponse,
      error,
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      duration,
    };
  }

  /**
   * Stop agent execution
   */
  async stop(): Promise<void> {
    this.stopRequested = true;
  }

  /**
   * Pause agent execution
   */
  async pause(): Promise<AgentState> {
    this.pauseRequested = true;
    return this.getStatus();
  }

  /**
   * Resume from paused state
   */
  async resume(state: AgentState): Promise<void> {
    this.status = state.status;
    this.steps = state.steps;
    this.context = state.context;
    this.budget = state.budget;
    this.startTime = state.startTime;
    this.totalTokens = state.totalTokens;
    this.totalCost = state.totalCost;
    this.pauseRequested = false;
  }

  /**
   * Get current status
   */
  getStatus(): AgentState {
    return {
      agentId: this.id,
      status: this.status,
      currentStep: this.steps.length,
      steps: this.steps,
      context: this.context,
      budget: this.budget,
      startTime: this.startTime || new Date(),
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgentConfig>): void {
    if (config.systemPrompt !== undefined) {
      this.systemPrompt = config.systemPrompt;
    }
    // if (config.temperature !== undefined) {
    //   this.temperature = config.temperature;
    // }
    if (config.budget !== undefined) {
      this.budget = { ...this.budget, ...config.budget };
    }
  }

  /**
   * Get default system prompt
   */
  private getDefaultSystemPrompt(): string {
    return `You are an AI agent that helps users accomplish tasks.

You follow a Reason-Act-Observe cycle:
1. REASON: Think about what to do next
2. ACT: Use tools to make progress
3. OBSERVE: Examine the results and continue

When you have completed the task, respond with "Task completed: [summary]".

Available tools: ${this.toolRegistry
      .listEnabled()
      .map((t) => t.definition.name)
      .join(', ')}

Be concise and focused on the task.`;
  }
}
