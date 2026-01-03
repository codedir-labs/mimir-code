/**
 * TaskTool - Spawn sub-agents for complex tasks
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';
import type { IAgent } from '../../core/interfaces/IAgent.js';
import type { AgentConfig, AgentResult } from '../../core/types.js';

/**
 * Agent spawner interface
 */
export interface IAgentSpawner {
  /**
   * Spawn a new sub-agent
   */
  spawn(
    task: string,
    config: AgentConfig,
    parentContext: ToolContext
  ): Promise<{ agentId: string; agent: IAgent }>;

  /**
   * Get result from a spawned agent (blocking)
   */
  getResult(agentId: string): Promise<AgentResult>;

  /**
   * Get result from a spawned agent (non-blocking)
   */
  checkResult(agentId: string): Promise<AgentResult | null>;
}

/**
 * Task execution modes
 */
type TaskMode = 'blocking' | 'background';

/**
 * Task tool for spawning sub-agents
 */
export class TaskTool extends BaseTool {
  constructor(private spawner: IAgentSpawner) {
    super({
      name: 'task',
      description: `Spawn a sub-agent to handle a complex task autonomously. Sub-agents run in isolation to avoid context pollution.

Use this when:
- Task requires multiple steps or exploration
- You want to offload work without polluting your context
- Task can run in parallel with other work

Sub-agents have their own context and tool access.`,
      parameters: z.object({
        description: z.string().describe('Short description (3-5 words) of what the agent will do'),
        prompt: z.string().describe('Detailed task prompt for the sub-agent'),
        mode: z
          .enum(['blocking', 'background'])
          .optional()
          .describe('Execution mode (default: blocking)'),
        role: z
          .string()
          .optional()
          .describe('Agent role/specialization (e.g., "finder", "reviewer")'),
        tools: z.array(z.string()).optional().describe('Tools to enable for sub-agent'),
        maxIterations: z.number().optional().describe('Max iterations for sub-agent'),
        agentId: z.string().optional().describe('Agent ID to resume (for getting results)'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 120,
      },
    });
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const {
      description,
      prompt,
      mode = 'blocking',
      role,
      tools,
      maxIterations,
      agentId,
    } = args as {
      description: string;
      prompt?: string;
      mode?: TaskMode;
      role?: string;
      tools?: string[];
      maxIterations?: number;
      agentId?: string;
    };

    try {
      // If agentId provided, get existing result
      if (agentId) {
        const result =
          mode === 'blocking'
            ? await this.spawner.getResult(agentId)
            : await this.spawner.checkResult(agentId);

        if (!result) {
          return this.success({ status: 'running', agentId }, { agentId, isRunning: true });
        }

        return this.success(
          {
            status: result.success ? 'completed' : 'failed',
            result: result.finalResponse,
            steps: result.steps.length,
            tokens: result.totalTokens,
            cost: result.totalCost,
            duration: result.duration,
          },
          {
            agentId,
            success: result.success,
            steps: result.steps.length,
          }
        );
      }

      // Spawn new sub-agent
      if (!prompt) {
        return this.error('Prompt is required when spawning new agent');
      }

      const config: AgentConfig = {
        name: description,
        role: role || 'general',
        tools,
        budget: {
          maxIterations: maxIterations || 20,
        },
      };

      const { agentId: newAgentId } = await this.spawner.spawn(prompt, config, context);

      // For blocking mode, wait for result
      if (mode === 'blocking') {
        const result = await this.spawner.getResult(newAgentId);

        return this.success(
          {
            agentId: newAgentId,
            status: result.success ? 'completed' : 'failed',
            result: result.finalResponse,
            steps: result.steps.length,
            tokens: result.totalTokens,
            cost: result.totalCost,
            duration: result.duration,
          },
          {
            agentId: newAgentId,
            success: result.success,
            mode: 'blocking',
          }
        );
      }

      // For background mode, return immediately
      return this.success(
        {
          agentId: newAgentId,
          status: 'running',
          message: 'Agent started in background. Use task tool with agentId to check progress.',
        },
        {
          agentId: newAgentId,
          mode: 'background',
        }
      );
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to spawn sub-agent');
    }
  }
}
