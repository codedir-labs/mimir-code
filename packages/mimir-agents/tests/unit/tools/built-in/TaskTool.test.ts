/**
 * Tests for TaskTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskTool, type IAgentSpawner } from '../../../../src/tools/built-in/TaskTool.js';
import type { AgentConfig, AgentResult } from '../../../../src/core/types.js';
import type { IAgent } from '../../../../src/core/interfaces/IAgent.js';
import type { ToolContext } from '../../../../src/tools/types.js';

// Mock agent spawner
class MockAgentSpawner implements IAgentSpawner {
  private agents: Map<string, { task: string; config: AgentConfig; result?: AgentResult }> =
    new Map();
  private nextId = 1;

  async spawn(
    task: string,
    config: AgentConfig,
    _parentContext: ToolContext
  ): Promise<{ agentId: string; agent: IAgent }> {
    const agentId = `agent-${this.nextId++}`;
    this.agents.set(agentId, { task, config });

    const mockAgent: IAgent = {
      id: agentId,
      status: 'idle',
      execute: async () => ({
        success: true,
        finalResponse: 'Task completed',
        steps: [],
        totalTokens: 100,
        totalCost: 0.01,
        duration: 1000,
      }),
      stop: async () => {},
      pause: async () => ({}),
      resume: async () => {},
    };

    return { agentId, agent: mockAgent };
  }

  async getResult(agentId: string): Promise<AgentResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Simulate blocking wait
    if (!agent.result) {
      agent.result = {
        success: true,
        finalResponse: 'Task completed',
        steps: [
          {
            iteration: 1,
            action: {
              type: 'tool',
              tool: 'read_file',
              arguments: { path: 'test.txt' },
              response: '',
            },
            observation: { type: 'tool_result', result: { success: true, output: 'content' } },
            timestamp: new Date(),
          },
        ],
        totalTokens: 100,
        totalCost: 0.01,
        duration: 1000,
      };
    }

    return agent.result;
  }

  async checkResult(agentId: string): Promise<AgentResult | null> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent.result || null;
  }

  // Test helper
  setResult(agentId: string, result: AgentResult) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.result = result;
    }
  }
}

describe('TaskTool', () => {
  let spawner: MockAgentSpawner;
  let tool: TaskTool;

  beforeEach(() => {
    spawner = new MockAgentSpawner();
    tool = new TaskTool(spawner);
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('task');
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(120);
    });

    it('should have description about sub-agents', () => {
      expect(tool.definition.description).toContain('sub-agent');
      expect(tool.definition.description).toContain('context pollution');
    });
  });

  describe('execute - spawning new agents', () => {
    it('should spawn agent in blocking mode', async () => {
      const result = await tool.execute(
        {
          description: 'Find files',
          prompt: 'Find all TypeScript files',
          mode: 'blocking',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('agentId');
      expect(result.output?.status).toBe('completed');
      expect(result.output).toHaveProperty('result');
      expect(result.output).toHaveProperty('steps');
      expect(result.output).toHaveProperty('tokens');
      expect(result.output).toHaveProperty('cost');
      expect(result.metadata?.mode).toBe('blocking');
    });

    it('should spawn agent in background mode', async () => {
      const result = await tool.execute(
        {
          description: 'Run tests',
          prompt: 'Run all unit tests',
          mode: 'background',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('agentId');
      expect(result.output?.status).toBe('running');
      expect(result.output?.message).toContain('background');
      expect(result.metadata?.mode).toBe('background');
    });

    it('should use default blocking mode', async () => {
      const result = await tool.execute(
        {
          description: 'Analyze code',
          prompt: 'Analyze the codebase',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.output?.status).toBe('completed');
    });

    it('should pass role to agent config', async () => {
      const result = await tool.execute(
        {
          description: 'Find bugs',
          prompt: 'Search for potential bugs',
          role: 'reviewer',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
    });

    it('should pass tools to agent config', async () => {
      const result = await tool.execute(
        {
          description: 'Search files',
          prompt: 'Search for pattern',
          tools: ['grep', 'glob'],
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
    });

    it('should pass maxIterations to agent config', async () => {
      const result = await tool.execute(
        {
          description: 'Quick search',
          prompt: 'Find file quickly',
          maxIterations: 5,
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
    });

    it('should use default role if not specified', async () => {
      const result = await tool.execute(
        {
          description: 'Generic task',
          prompt: 'Do something',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(true);
    });

    it('should return error if prompt missing', async () => {
      const result = await tool.execute(
        {
          description: 'Task without prompt',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Prompt is required');
    });
  });

  describe('execute - checking existing agents', () => {
    it('should check agent result in blocking mode', async () => {
      // First spawn an agent
      const spawnResult = await tool.execute(
        {
          description: 'Task 1',
          prompt: 'Do task 1',
          mode: 'background',
        },
        { conversationId: 'test' }
      );

      const agentId = spawnResult.output?.agentId;

      // Set the result
      spawner.setResult(agentId, {
        success: true,
        finalResponse: 'Completed successfully',
        steps: [
          {
            iteration: 1,
            action: { type: 'finish', response: 'Done' },
            observation: { type: 'final' },
            timestamp: new Date(),
          },
        ],
        totalTokens: 200,
        totalCost: 0.02,
        duration: 2000,
      });

      // Check result
      const checkResult = await tool.execute(
        {
          description: 'Check task',
          agentId,
          mode: 'blocking',
        },
        { conversationId: 'test' }
      );

      expect(checkResult.success).toBe(true);
      expect(checkResult.output?.status).toBe('completed');
      expect(checkResult.output?.result).toBe('Completed successfully');
      expect(checkResult.output?.tokens).toBe(200);
      expect(checkResult.output?.cost).toBe(0.02);
    });

    it('should check agent result in background mode', async () => {
      // First spawn an agent
      const spawnResult = await tool.execute(
        {
          description: 'Task 2',
          prompt: 'Do task 2',
          mode: 'background',
        },
        { conversationId: 'test' }
      );

      const agentId = spawnResult.output?.agentId;

      // Check before completion (no result yet)
      const checkResult = await tool.execute(
        {
          description: 'Check task',
          agentId,
          mode: 'background',
        },
        { conversationId: 'test' }
      );

      expect(checkResult.success).toBe(true);
      expect(checkResult.output?.status).toBe('running');
      expect(checkResult.metadata?.isRunning).toBe(true);
    });

    it('should handle failed agent', async () => {
      // Spawn agent
      const spawnResult = await tool.execute(
        {
          description: 'Failing task',
          prompt: 'This will fail',
          mode: 'background',
        },
        { conversationId: 'test' }
      );

      const agentId = spawnResult.output?.agentId;

      // Set failed result
      spawner.setResult(agentId, {
        success: false,
        finalResponse: 'Task failed',
        steps: [],
        totalTokens: 50,
        totalCost: 0.005,
        duration: 500,
      });

      // Check result
      const checkResult = await tool.execute(
        {
          description: 'Check failed task',
          agentId,
          mode: 'blocking',
        },
        { conversationId: 'test' }
      );

      expect(checkResult.success).toBe(true);
      expect(checkResult.output?.status).toBe('failed');
      expect(checkResult.metadata?.success).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle spawner errors', async () => {
      const errorSpawner: IAgentSpawner = {
        async spawn() {
          throw new Error('Failed to spawn agent');
        },
        async getResult() {
          throw new Error('Not implemented');
        },
        async checkResult() {
          throw new Error('Not implemented');
        },
      };

      const errorTool = new TaskTool(errorSpawner);
      const result = await errorTool.execute(
        {
          description: 'Test task',
          prompt: 'Test prompt',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to spawn agent');
    });

    it('should handle non-Error exceptions', async () => {
      const errorSpawner: IAgentSpawner = {
        async spawn() {
          throw 'String error';
        },
        async getResult() {
          throw new Error('Not implemented');
        },
        async checkResult() {
          throw new Error('Not implemented');
        },
      };

      const errorTool = new TaskTool(errorSpawner);
      const result = await errorTool.execute(
        {
          description: 'Test task',
          prompt: 'Test prompt',
        },
        { conversationId: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to spawn sub-agent');
    });
  });
});
