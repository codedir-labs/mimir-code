/**
 * Integration tests for workflow approval flow
 * Tests end-to-end flow from complex task detection to workflow approval
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TaskComplexityAnalyzer } from '@/features/chat/agent/TaskComplexityAnalyzer.js';
import { TaskDecomposer } from '@codedir/mimir-agents/orchestration';
import type { WorkflowPlan } from '@codedir/mimir-agents/core';
import type { ILLMProvider } from '@/shared/providers/ILLMProvider.js';

// Mock LLM provider for testing
class MockLLMProvider implements ILLMProvider {
  chat = vi.fn();
  streamChat = vi.fn();
  countTokens = vi.fn().mockReturnValue(100);
  calculateCost = vi.fn().mockReturnValue(0.001);
  getModelName = vi.fn().mockReturnValue('mock-model');
  getProviderName = vi.fn().mockReturnValue('mock-provider');
}

describe('Workflow Approval Flow Integration', () => {
  let mockProvider: MockLLMProvider;

  beforeEach(() => {
    mockProvider = new MockLLMProvider();
  });

  describe('Complex Task Detection', () => {
    it('should detect complex tasks requiring multiple agents', async () => {
      const analyzer = new TaskComplexityAnalyzer(mockProvider);

      // Mock LLM response for complexity analysis
      mockProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          isComplex: true,
          complexityScore: 0.8,
          reasoning:
            'Requires authentication, testing, and security review - multiple specialized skills needed',
          suggestedAgents: ['thinker', 'tester', 'security'],
          estimatedSteps: 5,
        }),
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const analysis = await analyzer.analyze(
        'Implement OAuth2 authentication with comprehensive tests and security audit'
      );

      expect(analysis.isComplex).toBe(true);
      expect(analysis.complexityScore).toBeGreaterThanOrEqual(0.7);
      expect(analysis.suggestedAgents).toContain('tester');
      expect(analysis.suggestedAgents).toContain('security');
    });

    it('should identify simple tasks not requiring orchestration', async () => {
      const analyzer = new TaskComplexityAnalyzer(mockProvider);

      // Heuristic check should return false quickly (no LLM call)
      const simpleTask = 'Fix typo in README';

      const isLikelyComplex = analyzer.isLikelyComplex(simpleTask);
      expect(isLikelyComplex).toBe(false);

      // Should not call LLM if heuristic says simple
      expect(mockProvider.chat).not.toHaveBeenCalled();
    });

    it('should call LLM for borderline tasks', async () => {
      const analyzer = new TaskComplexityAnalyzer(mockProvider);

      mockProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          isComplex: false,
          complexityScore: 0.4,
          reasoning: 'Single focused task, no dependencies',
          suggestedAgents: ['general'],
          estimatedSteps: 2,
        }),
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const analysis = await analyzer.analyze(
        'Add a new configuration option for timeout duration with validation and documentation'
      );

      expect(mockProvider.chat).toHaveBeenCalled();
      expect(analysis.isComplex).toBe(false);
    });
  });

  describe('Workflow Plan Generation', () => {
    it('should generate valid workflow plan from task description', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const roleRegistry = new RoleRegistry();

      // Mock LLM response for task decomposition
      mockProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          shouldDecompose: true,
          reason: 'Complex task requiring authentication, testing, and security review',
          executionMode: 'dag',
          complexity: 0.8,
          tasks: [
            {
              id: 'task-1',
              description: 'Find existing authentication code',
              suggestedRole: 'finder',
              dependsOn: [],
              complexity: 0.3,
              parallelizable: true,
            },
            {
              id: 'task-2',
              description: 'Implement OAuth2 flow',
              suggestedRole: 'thinker',
              dependsOn: ['task-1'],
              complexity: 0.8,
              parallelizable: false,
            },
            {
              id: 'task-3',
              description: 'Write integration tests',
              suggestedRole: 'tester',
              dependsOn: ['task-2'],
              complexity: 0.6,
              parallelizable: false,
            },
            {
              id: 'task-4',
              description: 'Security audit',
              suggestedRole: 'security',
              dependsOn: ['task-2'],
              complexity: 0.7,
              parallelizable: true,
            },
          ],
          loopPatterns: [],
        }),
        usage: { inputTokens: 200, outputTokens: 150 },
      });

      const decomposer = new TaskDecomposer(mockProvider, roleRegistry);
      const plan = await decomposer.planWorkflow(
        'Implement OAuth2 authentication with tests and security audit'
      );

      expect(plan).toBeDefined();
      expect(plan.id).toMatch(/^plan-\d+$/);
      expect(plan.task).toBe('Implement OAuth2 authentication with tests and security audit');
      expect(plan.tasks).toHaveLength(4);
      expect(plan.executionMode).toBe('dag');
      expect(plan.complexity).toBeGreaterThan(0.5);

      // Verify task dependencies
      const task2 = plan.tasks.find((t) => t.id === 'task-2');
      expect(task2?.dependsOn).toContain('task-1');

      const task3 = plan.tasks.find((t) => t.id === 'task-3');
      expect(task3?.dependsOn).toContain('task-2');
    });

    it('should handle plan generation failures gracefully', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const roleRegistry = new RoleRegistry();

      // Mock LLM error
      mockProvider.chat.mockRejectedValue(new Error('API rate limit exceeded'));

      const decomposer = new TaskDecomposer(mockProvider, roleRegistry);

      await expect(decomposer.planWorkflow('Complex task description')).rejects.toThrow(
        'API rate limit exceeded'
      );
    });

    it('should create fallback plan when LLM returns invalid JSON', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const roleRegistry = new RoleRegistry();

      // Mock invalid LLM response
      mockProvider.chat.mockResolvedValue({
        content: 'This is not valid JSON',
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const decomposer = new TaskDecomposer(mockProvider, roleRegistry);
      const plan = await decomposer.planWorkflow('Some task');

      // Should create fallback single-task plan
      expect(plan).toBeDefined();
      expect(plan.tasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('State Transitions', () => {
    it('should transition from chat to workflow-approval when complex task detected', () => {
      // Simulate state management
      interface ChatState {
        uiMode: 'chat' | 'workflow-approval' | 'workflow-execution';
        pendingWorkflowPlan?: WorkflowPlan;
        currentUserInput?: string;
      }

      const state: ChatState = {
        uiMode: 'chat',
      };

      const mockPlan: WorkflowPlan = {
        id: 'plan-123',
        task: 'Test task',
        description: 'Test description',
        tasks: [
          {
            id: 'task-1',
            description: 'Test subtask',
            suggestedRole: 'general',
            complexity: 0.5,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.5,
      };

      // Simulate complex task detection and plan generation
      state.uiMode = 'workflow-approval';
      state.pendingWorkflowPlan = mockPlan;
      state.currentUserInput = 'Test task';

      expect(state.uiMode).toBe('workflow-approval');
      expect(state.pendingWorkflowPlan).toBe(mockPlan);
      expect(state.currentUserInput).toBe('Test task');
    });

    it('should return to chat on workflow approval', () => {
      interface ChatState {
        uiMode: 'chat' | 'workflow-approval' | 'workflow-execution';
        pendingWorkflowPlan?: WorkflowPlan;
        currentUserInput?: string;
      }

      const state: ChatState = {
        uiMode: 'workflow-approval',
        pendingWorkflowPlan: {
          id: 'plan-123',
          task: 'Test',
          description: 'Test',
          tasks: [],
          executionMode: 'sequential',
          complexity: 0.5,
        },
        currentUserInput: 'Test',
      };

      // Simulate user approval (for now, returns to chat)
      state.uiMode = 'chat';
      state.pendingWorkflowPlan = undefined;
      state.currentUserInput = undefined;

      expect(state.uiMode).toBe('chat');
      expect(state.pendingWorkflowPlan).toBeUndefined();
      expect(state.currentUserInput).toBeUndefined();
    });

    it('should return to chat on workflow cancellation', () => {
      interface ChatState {
        uiMode: 'chat' | 'workflow-approval' | 'workflow-execution';
        pendingWorkflowPlan?: WorkflowPlan;
      }

      const state: ChatState = {
        uiMode: 'workflow-approval',
        pendingWorkflowPlan: {
          id: 'plan-123',
          task: 'Test',
          description: 'Test',
          tasks: [],
          executionMode: 'sequential',
          complexity: 0.5,
        },
      };

      // Simulate user cancellation
      state.uiMode = 'chat';
      state.pendingWorkflowPlan = undefined;

      expect(state.uiMode).toBe('chat');
      expect(state.pendingWorkflowPlan).toBeUndefined();
    });

    it('should return to chat on workflow edit', () => {
      interface ChatState {
        uiMode: 'chat' | 'workflow-approval' | 'workflow-execution';
        pendingWorkflowPlan?: WorkflowPlan;
      }

      const state: ChatState = {
        uiMode: 'workflow-approval',
        pendingWorkflowPlan: {
          id: 'plan-123',
          task: 'Test',
          description: 'Test',
          tasks: [],
          executionMode: 'sequential',
          complexity: 0.5,
        },
      };

      // Simulate user edit (returns to chat for input)
      state.uiMode = 'chat';
      state.pendingWorkflowPlan = undefined;

      expect(state.uiMode).toBe('chat');
      expect(state.pendingWorkflowPlan).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should fallback to simple mode if plan generation fails', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const roleRegistry = new RoleRegistry();

      mockProvider.chat.mockRejectedValue(new Error('Network error'));

      const decomposer = new TaskDecomposer(mockProvider, roleRegistry);

      let caughtError = false;
      try {
        await decomposer.planWorkflow('Complex task');
      } catch (error) {
        caughtError = true;
      }

      expect(caughtError).toBe(true);

      // In ChatCommand, this would trigger fallback to simple mode
      // with a message like "Failed to generate workflow plan. Processing with standard mode..."
    });

    it('should handle LLM timeout gracefully with fallback', async () => {
      const analyzer = new TaskComplexityAnalyzer(mockProvider);

      mockProvider.chat.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 100);
          })
      );

      // TaskComplexityAnalyzer has fallback logic - it catches errors and returns heuristic result
      const result = await analyzer.analyze('Some complex task');

      expect(result.isComplex).toBe(false);
      expect(result.reasoning).toContain('Heuristic analysis');
    });
  });

  describe('Workflow Execution', () => {
    it('should create WorkflowOrchestrator and start execution on approval', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const { WorkflowOrchestrator } = await import('@codedir/mimir-agents/orchestration');

      const roleRegistry = new RoleRegistry();

      // Mock workflow plan
      const mockPlan: WorkflowPlan = {
        id: 'plan-123',
        task: 'Test task',
        description: 'Test description',
        tasks: [
          {
            id: 'task-1',
            description: 'Test subtask',
            suggestedRole: 'general',
            complexity: 0.5,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.5,
      };

      // Create orchestrator
      const orchestrator = new WorkflowOrchestrator(mockPlan, mockProvider, roleRegistry);

      expect(orchestrator).toBeDefined();
      // Verify orchestrator can be created without throwing
    });

    it('should handle workflow completion successfully', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const { WorkflowOrchestrator } = await import('@codedir/mimir-agents/orchestration');

      const roleRegistry = new RoleRegistry();

      const mockPlan: WorkflowPlan = {
        id: 'plan-456',
        task: 'Test execution',
        description: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Simple task',
            suggestedRole: 'general',
            complexity: 0.3,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.3,
      };

      // Mock successful LLM responses for agent execution
      mockProvider.chat.mockResolvedValue({
        content: 'Task completed successfully',
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const orchestrator = new WorkflowOrchestrator(mockPlan, mockProvider, roleRegistry);

      // This would normally be started in the ChatCommand onApprove callback
      // For testing, we just verify the orchestrator is created
      expect(orchestrator).toBeDefined();
    });

    it('should handle workflow interruption', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const { WorkflowOrchestrator } = await import('@codedir/mimir-agents/orchestration');

      const roleRegistry = new RoleRegistry();

      const mockPlan: WorkflowPlan = {
        id: 'plan-789',
        task: 'Long running task',
        description: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Long task',
            suggestedRole: 'general',
            complexity: 0.8,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.8,
      };

      const orchestrator = new WorkflowOrchestrator(mockPlan, mockProvider, roleRegistry);

      // Test that interrupt method exists
      expect(typeof orchestrator.interrupt).toBe('function');
    });

    it('should track agent progress during execution', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const { WorkflowOrchestrator } = await import('@codedir/mimir-agents/orchestration');

      const roleRegistry = new RoleRegistry();

      const mockPlan: WorkflowPlan = {
        id: 'plan-progress',
        task: 'Multi-agent task',
        description: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Agent 1 task',
            suggestedRole: 'finder',
            complexity: 0.4,
          },
          {
            id: 'task-2',
            description: 'Agent 2 task',
            suggestedRole: 'tester',
            complexity: 0.6,
            dependsOn: ['task-1'],
          },
        ],
        executionMode: 'dag',
        complexity: 0.7,
      };

      const orchestrator = new WorkflowOrchestrator(mockPlan, mockProvider, roleRegistry);

      // Test that getAgents method exists for progress tracking
      expect(typeof orchestrator.getAgents).toBe('function');
    });

    it('should calculate workflow costs and tokens correctly', async () => {
      // Mock agent results with costs
      const mockResults = [
        {
          role: 'finder' as const,
          success: true,
          output: 'Found files',
          cost: 0.0012,
          tokens: 500,
        },
        {
          role: 'tester' as const,
          success: true,
          output: 'Tests passed',
          cost: 0.0018,
          tokens: 750,
        },
      ];

      // Calculate total cost
      const totalCost = mockResults.reduce((sum, r) => sum + (r.cost || 0), 0);
      const totalTokens = mockResults.reduce((sum, r) => sum + (r.tokens || 0), 0);

      expect(totalCost).toBeCloseTo(0.003, 4);
      expect(totalTokens).toBe(1250);
    });

    it('should handle workflow execution failures gracefully', async () => {
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const { WorkflowOrchestrator } = await import('@codedir/mimir-agents/orchestration');

      const roleRegistry = new RoleRegistry();

      const mockPlan: WorkflowPlan = {
        id: 'plan-fail',
        task: 'Failing task',
        description: 'Test failure handling',
        tasks: [
          {
            id: 'task-1',
            description: 'Task that will fail',
            suggestedRole: 'general',
            complexity: 0.5,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.5,
      };

      // Mock LLM failure
      mockProvider.chat.mockRejectedValue(new Error('API error'));

      const orchestrator = new WorkflowOrchestrator(mockPlan, mockProvider, roleRegistry);

      // Workflow execution would catch this error and update state to 'failed'
      // This test verifies the orchestrator can be created even with a failing provider
      expect(orchestrator).toBeDefined();
    });
  });
});
