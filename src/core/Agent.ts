/**
 * Core Agent implementation (ReAct loop)
 */

import { ILLMProvider } from '../providers/ILLMProvider.js';
import { ToolRegistry } from './Tool.js';
import { Message, Action, Observation, Result, createOk, createErr } from '../types/index.js';

export interface AgentConfig {
  maxIterations: number;
  budgetLimit?: number;
}

export class Agent {
  // private provider: ILLMProvider; // TODO: Will be used when LLM integration is implemented
  private toolRegistry: ToolRegistry;
  private config: AgentConfig;
  private conversationHistory: Message[] = [];
  private currentIteration = 0;

  constructor(_provider: ILLMProvider, toolRegistry: ToolRegistry, config: AgentConfig) {
    // this.provider = provider; // TODO: Uncomment when implementing LLM integration
    this.toolRegistry = toolRegistry;
    this.config = config;
  }

  async run(task: string): Promise<Result<unknown>> {
    this.conversationHistory = [
      {
        role: 'system',
        content: 'You are a helpful coding assistant.',
      },
      {
        role: 'user',
        content: task,
      },
    ];

    while (this.currentIteration < this.config.maxIterations) {
      // 1. REASON: Get next action from LLM
      const action = await this.reason();

      if (action.type === 'finish') {
        return createOk(action.result);
      }

      // 2. ACT: Execute tool
      const observation = await this.act(action);

      // 3. OBSERVE: Record result
      await this.observe(observation);

      this.currentIteration++;
    }

    return createErr(new Error('Max iterations reached'));
  }

  private async reason(): Promise<Action> {
    // TODO: Implement LLM reasoning
    // For now, return a finish action
    return {
      type: 'finish',
      result: 'Task completed',
    };
  }

  private async act(action: Action): Promise<Observation> {
    if (!action.toolName || !action.arguments) {
      return {
        type: 'error',
        error: 'Invalid action: missing toolName or arguments',
      };
    }

    // TODO: Check permissions before execution

    const result = await this.toolRegistry.execute(action.toolName, action.arguments);

    return {
      type: 'tool_result',
      data: result,
    };
  }

  private async observe(observation: Observation): Promise<void> {
    // TODO: Update conversation history with observation
    // For now, just a placeholder
    this.conversationHistory.push({
      role: 'assistant',
      content: JSON.stringify(observation),
    });
  }
}
