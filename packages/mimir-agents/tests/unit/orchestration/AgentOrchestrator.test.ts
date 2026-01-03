/**
 * Tests for AgentOrchestrator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentOrchestrator,
  type IAgentFactory,
} from '../../../src/orchestration/AgentOrchestrator.js';
import type { AgentConfig, AgentContext, AgentResult } from '../../../src/core/types.js';
import type { IAgent } from '../../../src/core/interfaces/IAgent.js';

// Mock agent for testing
class MockAgent implements IAgent {
  id: string;
  status: 'idle' | 'reasoning' | 'acting' | 'observing' | 'completed' | 'failed' = 'idle';
  private executionDelay: number;
  private shouldFail: boolean;

  constructor(id: string, executionDelay = 10, shouldFail = false) {
    this.id = id;
    this.executionDelay = executionDelay;
    this.shouldFail = shouldFail;
  }

  async execute(_task: string, _context: AgentContext): Promise<AgentResult> {
    this.status = 'reasoning';
    await new Promise((resolve) => setTimeout(resolve, this.executionDelay));

    if (this.shouldFail) {
      this.status = 'failed';
      return {
        success: false,
        finalResponse: 'Task failed',
        steps: [],
        totalTokens: 50,
        totalCost: 0.005,
        duration: this.executionDelay,
      };
    }

    this.status = 'completed';
    return {
      success: true,
      finalResponse: 'Task completed',
      steps: [
        {
          iteration: 1,
          action: { type: 'finish', response: 'Done' },
          observation: { type: 'final' },
          timestamp: new Date(),
        },
      ],
      totalTokens: 100,
      totalCost: 0.01,
      duration: this.executionDelay,
    };
  }

  async stop(): Promise<void> {
    this.status = 'idle';
  }

  async pause(): Promise<object> {
    return {};
  }

  async resume(_state: object): Promise<void> {}
}

// Mock agent factory
class MockAgentFactory implements IAgentFactory {
  private nextId = 1;
  private failurePattern?: (id: string) => boolean;
  private executionDelay: number;

  constructor(executionDelay = 10) {
    this.executionDelay = executionDelay;
  }

  setFailurePattern(pattern: (id: string) => boolean) {
    this.failurePattern = pattern;
  }

  createAgent(_config: AgentConfig): IAgent {
    const id = `agent-${this.nextId++}`;
    const shouldFail = this.failurePattern ? this.failurePattern(id) : false;
    return new MockAgent(id, this.executionDelay, shouldFail);
  }
}

describe('AgentOrchestrator', () => {
  let factory: MockAgentFactory;
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    factory = new MockAgentFactory();
    orchestrator = new AgentOrchestrator(factory, { maxParallel: 2 });
  });

  describe('spawn', () => {
    it('should spawn a new agent', async () => {
      const { agentId, agent } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      expect(agentId).toBeDefined();
      expect(agent).toBeDefined();
      expect(agent.id).toBe(agentId);
    });

    it('should track spawned agent', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      const status = orchestrator.getStatus(agentId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('pending');
      expect(status?.task).toBe('Test task');
    });
  });

  describe('execute', () => {
    it('should execute agent successfully', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      const result = await orchestrator.execute(agentId, { conversationId: 'test' });

      expect(result.success).toBe(true);
      expect(result.finalResponse).toBe('Task completed');

      const status = orchestrator.getStatus(agentId);
      expect(status?.status).toBe('completed');
      expect(status?.result).toEqual(result);
    });

    it('should handle agent failure', async () => {
      factory.setFailurePattern(() => true);

      const { agentId } = await orchestrator.spawn(
        'Failing task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      const result = await orchestrator.execute(agentId, { conversationId: 'test' });

      expect(result.success).toBe(false);

      const status = orchestrator.getStatus(agentId);
      expect(status?.status).toBe('failed');
    });

    it('should throw error for non-existent agent', async () => {
      await expect(
        orchestrator.execute('non-existent', { conversationId: 'test' })
      ).rejects.toThrow('Agent non-existent not found');
    });

    it('should track execution timing', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      await orchestrator.execute(agentId, { conversationId: 'test' });

      const status = orchestrator.getStatus(agentId);
      expect(status?.startTime).toBeDefined();
      expect(status?.endTime).toBeDefined();
      expect(status?.endTime!.getTime()).toBeGreaterThanOrEqual(status?.startTime!.getTime());
    });
  });

  describe('executeBackground', () => {
    it('should execute agent in background', async () => {
      const { agentId } = await orchestrator.spawn(
        'Background task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      // Should return immediately
      await orchestrator.executeBackground(agentId, { conversationId: 'test' });

      // Agent might still be running
      const status = orchestrator.getStatus(agentId);
      expect(status?.status).toMatch(/pending|running|completed/);
    });

    it('should handle background execution errors', async () => {
      factory.setFailurePattern(() => true);

      const { agentId } = await orchestrator.spawn(
        'Failing background task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      await orchestrator.executeBackground(agentId, { conversationId: 'test' });

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = orchestrator.getStatus(agentId);
      expect(status?.status).toBe('failed');
      expect(status?.error).toBeDefined();
    });
  });

  describe('executeParallel', () => {
    it('should execute multiple agents in parallel', async () => {
      const startTime = Date.now();

      const result = await orchestrator.executeParallel([
        {
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
          context: { conversationId: 'test' },
        },
        {
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
          context: { conversationId: 'test' },
        },
      ]);

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(result.totalTokens).toBe(200); // 100 per agent
      expect(result.totalCost).toBe(0.02); // 0.01 per agent
      expect(result.errors).toHaveLength(0);

      // Should run in parallel (< 50ms for 2 agents with 10ms each)
      expect(duration).toBeLessThan(100);
    });

    it('should respect maxParallel limit', async () => {
      // Create orchestrator with maxParallel = 1
      const sequentialOrchestrator = new AgentOrchestrator(factory, { maxParallel: 1 });
      const startTime = Date.now();

      await sequentialOrchestrator.executeParallel([
        {
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
        },
        {
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
        },
      ]);

      const duration = Date.now() - startTime;

      // Should run sequentially (>= 20ms for 2 agents with 10ms each)
      expect(duration).toBeGreaterThanOrEqual(20);
    });

    it('should handle partial failures', async () => {
      factory.setFailurePattern((id) => id === 'agent-2');

      const result = await orchestrator.executeParallel([
        { task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
        { task: 'Task 2', config: { name: 'Agent 2', role: 'general' } },
        { task: 'Task 3', config: { name: 'Agent 3', role: 'general' } },
      ]);

      expect(result.success).toBe(false); // One failed
      expect(result.agents).toHaveLength(3);
      expect(result.agents[0].status).toBe('completed');
      expect(result.agents[1].status).toBe('failed');
      expect(result.agents[2].status).toBe('completed');
    });

    it('should collect errors from failed agents', async () => {
      factory.setFailurePattern(() => true);

      const result = await orchestrator.executeParallel([
        { task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle spawn errors', async () => {
      const errorFactory: IAgentFactory = {
        createAgent() {
          throw new Error('Failed to create agent');
        },
      };

      const errorOrchestrator = new AgentOrchestrator(errorFactory);
      const result = await errorOrchestrator.executeParallel([
        { task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Failed to create agent');
    });
  });

  describe('executeSequential', () => {
    it('should execute agents sequentially', async () => {
      const result = await orchestrator.executeSequential([
        { task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
        { task: 'Task 2', config: { name: 'Agent 2', role: 'general' } },
      ]);

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(result.totalTokens).toBe(200);
      expect(result.totalCost).toBe(0.02);
    });

    it('should run agents in order', async () => {
      const executionOrder: string[] = [];

      const orderTrackingFactory: IAgentFactory = {
        createAgent(config: AgentConfig): IAgent {
          return {
            id: config.name || 'unknown',
            status: 'idle',
            async execute() {
              executionOrder.push(config.name || 'unknown');
              return {
                success: true,
                finalResponse: 'Done',
                steps: [],
                totalTokens: 100,
                totalCost: 0.01,
                duration: 10,
              };
            },
            async stop() {},
            async pause() {
              return {};
            },
            async resume() {},
          };
        },
      };

      const orderOrchestrator = new AgentOrchestrator(orderTrackingFactory);
      await orderOrchestrator.executeSequential([
        { task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
        { task: 'Task 2', config: { name: 'Agent 2', role: 'general' } },
        { task: 'Task 3', config: { name: 'Agent 3', role: 'general' } },
      ]);

      expect(executionOrder).toEqual(['Agent 1', 'Agent 2', 'Agent 3']);
    });

    it('should handle failures', async () => {
      factory.setFailurePattern((id) => id === 'agent-2');

      const result = await orchestrator.executeSequential([
        { task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
        { task: 'Task 2', config: { name: 'Agent 2', role: 'general' } },
        { task: 'Task 3', config: { name: 'Agent 3', role: 'general' } },
      ]);

      expect(result.success).toBe(false);
      expect(result.agents.length).toBeGreaterThan(0);
    });
  });

  describe('getResult', () => {
    it('should get result for completed agent', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      await orchestrator.execute(agentId, { conversationId: 'test' });
      const result = await orchestrator.getResult(agentId);

      expect(result.success).toBe(true);
      expect(result.finalResponse).toBe('Task completed');
    });

    it('should execute pending agent', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      // Don't execute yet, getResult should trigger execution
      const result = await orchestrator.getResult(agentId);

      expect(result.success).toBe(true);
    });

    it('should wait for running agent', async () => {
      const slowFactory = new MockAgentFactory(50); // 50ms execution
      const slowOrchestrator = new AgentOrchestrator(slowFactory);

      const { agentId } = await slowOrchestrator.spawn(
        'Slow task',
        { name: 'Slow Agent', role: 'general' },
        { conversationId: 'test' }
      );

      // Start execution in background
      slowOrchestrator.executeBackground(agentId, { conversationId: 'test' });

      // Wait a bit to ensure it's running
      await new Promise((resolve) => setTimeout(resolve, 10));

      // getResult should wait for completion
      const result = await slowOrchestrator.getResult(agentId);

      expect(result.success).toBe(true);
    });

    it('should throw error for non-existent agent', async () => {
      await expect(orchestrator.getResult('non-existent')).rejects.toThrow(
        'Agent non-existent not found'
      );
    });
  });

  describe('checkResult', () => {
    it('should return result if available', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      await orchestrator.execute(agentId, { conversationId: 'test' });
      const result = await orchestrator.checkResult(agentId);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });

    it('should return null if not completed', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      const result = await orchestrator.checkResult(agentId);

      expect(result).toBeNull();
    });

    it('should throw error for non-existent agent', async () => {
      await expect(orchestrator.checkResult('non-existent')).rejects.toThrow(
        'Agent non-existent not found'
      );
    });
  });

  describe('stop', () => {
    it('should stop an agent', async () => {
      const { agentId } = await orchestrator.spawn(
        'Test task',
        { name: 'Test Agent', role: 'general' },
        { conversationId: 'test' }
      );

      await orchestrator.stop(agentId);

      const status = orchestrator.getStatus(agentId);
      expect(status).toBeDefined();
    });

    it('should throw error for non-existent agent', async () => {
      await expect(orchestrator.stop('non-existent')).rejects.toThrow(
        'Agent non-existent not found'
      );
    });
  });

  describe('listAgents', () => {
    it('should list all agents', async () => {
      await orchestrator.spawn('Task 1', { name: 'Agent 1', role: 'general' }, {});
      await orchestrator.spawn('Task 2', { name: 'Agent 2', role: 'general' }, {});

      const agents = orchestrator.listAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].task).toBe('Task 1');
      expect(agents[1].task).toBe('Task 2');
    });

    it('should return empty array if no agents', () => {
      const agents = orchestrator.listAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('clearCompleted', () => {
    it('should clear completed agents', async () => {
      const { agentId: id1 } = await orchestrator.spawn(
        'Task 1',
        { name: 'Agent 1', role: 'general' },
        {}
      );
      const { agentId: id2 } = await orchestrator.spawn(
        'Task 2',
        { name: 'Agent 2', role: 'general' },
        {}
      );

      await orchestrator.execute(id1, {});
      // Don't execute id2

      orchestrator.clearCompleted();

      const agents = orchestrator.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].agentId).toBe(id2);
    });

    it('should clear failed agents', async () => {
      factory.setFailurePattern(() => true);

      const { agentId } = await orchestrator.spawn(
        'Failing task',
        { name: 'Agent 1', role: 'general' },
        {}
      );

      await orchestrator.execute(agentId, {});
      orchestrator.clearCompleted();

      const agents = orchestrator.listAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const { agentId: id1 } = await orchestrator.spawn(
        'Task 1',
        { name: 'Agent 1', role: 'general' },
        {}
      );
      await orchestrator.spawn('Task 2', { name: 'Agent 2', role: 'general' }, {});
      await orchestrator.spawn('Task 3', { name: 'Agent 3', role: 'general' }, {});

      await orchestrator.execute(id1, {});

      factory.setFailurePattern((id) => id === 'agent-4');
      const { agentId: id4 } = await orchestrator.spawn(
        'Task 4',
        { name: 'Agent 4', role: 'general' },
        {}
      );
      await orchestrator.execute(id4, {});

      const stats = orchestrator.getStats();

      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(0);
    });

    it('should return zeros for empty orchestrator', () => {
      const stats = orchestrator.getStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('executeWithDependencies', () => {
    it('should execute independent tasks in parallel', async () => {
      const startTime = Date.now();

      const result = await orchestrator.executeWithDependencies([
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
        },
        {
          id: 'task2',
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
        },
      ]);

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(2);
      // Should run in parallel (< 100ms for 2 agents with 10ms each)
      expect(duration).toBeLessThan(100);
    });

    it('should execute dependent tasks in order', async () => {
      const executionOrder: string[] = [];

      const orderTrackingFactory: IAgentFactory = {
        createAgent(config: AgentConfig): IAgent {
          return {
            id: config.name || 'unknown',
            status: 'idle',
            async execute() {
              executionOrder.push(config.name || 'unknown');
              return {
                success: true,
                finalResponse: 'Done',
                steps: [],
                totalTokens: 100,
                totalCost: 0.01,
                duration: 10,
              };
            },
            async stop() {},
            async pause() {
              return {};
            },
            async resume() {},
          };
        },
      };

      const depOrchestrator = new AgentOrchestrator(orderTrackingFactory);

      await depOrchestrator.executeWithDependencies([
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
        },
        {
          id: 'task2',
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
          dependsOn: ['task1'],
        },
        {
          id: 'task3',
          task: 'Task 3',
          config: { name: 'Agent 3', role: 'general' },
          dependsOn: ['task2'],
        },
      ]);

      expect(executionOrder).toEqual(['Agent 1', 'Agent 2', 'Agent 3']);
    });

    it('should execute tasks in waves based on dependencies', async () => {
      const executionTimes: Record<string, number> = {};

      const timingFactory: IAgentFactory = {
        createAgent(config: AgentConfig): IAgent {
          return {
            id: config.name || 'unknown',
            status: 'idle',
            async execute() {
              executionTimes[config.name || 'unknown'] = Date.now();
              await new Promise((resolve) => setTimeout(resolve, 10));
              return {
                success: true,
                finalResponse: 'Done',
                steps: [],
                totalTokens: 100,
                totalCost: 0.01,
                duration: 10,
              };
            },
            async stop() {},
            async pause() {
              return {};
            },
            async resume() {},
          };
        },
      };

      const waveOrchestrator = new AgentOrchestrator(timingFactory);

      await waveOrchestrator.executeWithDependencies([
        // Wave 1: task1, task2 (no dependencies)
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
        },
        {
          id: 'task2',
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
        },
        // Wave 2: task3 (depends on task1)
        {
          id: 'task3',
          task: 'Task 3',
          config: { name: 'Agent 3', role: 'general' },
          dependsOn: ['task1'],
        },
        // Wave 3: task4 (depends on task2 and task3)
        {
          id: 'task4',
          task: 'Task 4',
          config: { name: 'Agent 4', role: 'general' },
          dependsOn: ['task2', 'task3'],
        },
      ]);

      // task1 and task2 should start at roughly the same time
      const wave1Diff = Math.abs(executionTimes['Agent 1']! - executionTimes['Agent 2']!);
      expect(wave1Diff).toBeLessThan(20);

      // task3 should start after task1
      expect(executionTimes['Agent 3']!).toBeGreaterThan(executionTimes['Agent 1']!);

      // task4 should start after both task2 and task3
      expect(executionTimes['Agent 4']!).toBeGreaterThan(executionTimes['Agent 2']!);
      expect(executionTimes['Agent 4']!).toBeGreaterThan(executionTimes['Agent 3']!);
    });

    it('should detect circular dependencies', async () => {
      const result = await orchestrator.executeWithDependencies([
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
          dependsOn: ['task2'],
        },
        {
          id: 'task2',
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
          dependsOn: ['task1'],
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Circular dependency detected');
    });

    it('should validate dependencies exist', async () => {
      const result = await orchestrator.executeWithDependencies([
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
          dependsOn: ['nonexistent'],
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('depends on non-existent task');
    });

    it('should handle failures in dependency graph', async () => {
      factory.setFailurePattern((id) => id === 'agent-2');

      const result = await orchestrator.executeWithDependencies([
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
        },
        {
          id: 'task2',
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
          dependsOn: ['task1'],
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.agents[0].status).toBe('completed');
      expect(result.agents[1].status).toBe('failed');
      expect(result.errors).toContain('Task task2 failed: Task failed');
    });

    it('should calculate totals correctly', async () => {
      const result = await orchestrator.executeWithDependencies([
        {
          id: 'task1',
          task: 'Task 1',
          config: { name: 'Agent 1', role: 'general' },
        },
        {
          id: 'task2',
          task: 'Task 2',
          config: { name: 'Agent 2', role: 'general' },
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(200); // 100 per agent
      expect(result.totalCost).toBe(0.02); // 0.01 per agent
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    it('should handle complex dependency graphs', async () => {
      const result = await orchestrator.executeWithDependencies([
        // Root tasks
        { id: 'a', task: 'Task A', config: { name: 'A', role: 'general' } },
        { id: 'b', task: 'Task B', config: { name: 'B', role: 'general' } },

        // Second level
        {
          id: 'c',
          task: 'Task C',
          config: { name: 'C', role: 'general' },
          dependsOn: ['a'],
        },
        {
          id: 'd',
          task: 'Task D',
          config: { name: 'D', role: 'general' },
          dependsOn: ['a', 'b'],
        },

        // Third level
        {
          id: 'e',
          task: 'Task E',
          config: { name: 'E', role: 'general' },
          dependsOn: ['c', 'd'],
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(5);
    });

    it('should respect maxParallel within waves', async () => {
      const sequentialOrchestrator = new AgentOrchestrator(factory, { maxParallel: 1 });
      const startTime = Date.now();

      await sequentialOrchestrator.executeWithDependencies([
        { id: 'task1', task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
        { id: 'task2', task: 'Task 2', config: { name: 'Agent 2', role: 'general' } },
        { id: 'task3', task: 'Task 3', config: { name: 'Agent 3', role: 'general' } },
      ]);

      const duration = Date.now() - startTime;

      // Should run sequentially (>= 30ms for 3 agents with 10ms each)
      expect(duration).toBeGreaterThanOrEqual(30);
    });

    it('should handle empty task list', async () => {
      const result = await orchestrator.executeWithDependencies([]);

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('should handle single task with no dependencies', async () => {
      const result = await orchestrator.executeWithDependencies([
        { id: 'task1', task: 'Task 1', config: { name: 'Agent 1', role: 'general' } },
      ]);

      expect(result.success).toBe(true);
      expect(result.agents).toHaveLength(1);
    });
  });
});
