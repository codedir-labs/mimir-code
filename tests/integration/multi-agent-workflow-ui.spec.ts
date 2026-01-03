/**
 * Integration tests for multi-agent workflow UI components
 * Tests Ink rendering, keyboard shortcuts, and user interactions
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { AgentSelectionUI } from '@/features/chat/components/AgentSelectionUI.js';
import { MultiAgentProgressView } from '@/features/chat/components/MultiAgentProgressView.js';
import { AgentDetailView } from '@/features/chat/components/AgentDetailView.js';
import type { WorkflowPlan, IFileSystem } from '@codedir/mimir-agents/core';
import type { AgentProgressData, AgentDetailData } from '@/features/chat/index.js';
import { KeyboardProvider } from '@/shared/keyboard/KeyboardContext.js';
import type { KeyBindingsConfig } from '@/shared/config/schemas.js';

// Test helper to wrap components in KeyboardProvider
function withKeyboardProvider(element: React.ReactElement): React.ReactElement {
  const bindingsConfig: KeyBindingsConfig = {
    leader: null,
    leaderTimeout: 1000,
    enabled: true,
    interrupt: ['ctrl+C', 'escape'],
    accept: ['enter'],
    modeSwitch: ['shift+Tab'],
    editCommand: ['ctrl+E'],
    showTooltip: ['tab'],
    navigateUp: ['arrowup'],
    navigateDown: ['arrowdown'],
    help: ['?'],
    clearScreen: ['ctrl+L'],
    undo: ['ctrl+Z'],
    redo: ['ctrl+Y'],
    newSession: ['n'],
    listSessions: ['l'],
    resumeSession: ['r'],
  };

  // Mock IFileSystem for testing
  const mockFs = {
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    unlink: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([]),
  };

  return React.createElement(
    KeyboardProvider,
    { bindingsConfig, fs: mockFs as unknown as IFileSystem, projectRoot: '/test' },
    element
  );
}

describe('Multi-Agent Workflow UI Integration', () => {
  describe('AgentSelectionUI', () => {
    const mockPlan: WorkflowPlan = {
      id: 'test-plan-1',
      task: 'Implement authentication with OAuth2 and tests',
      description: 'Add OAuth2 authentication with security review',
      tasks: [
        {
          id: 'task-1',
          description: 'Find existing auth files',
          suggestedRole: 'finder',
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
        {
          id: 'task-5',
          description: 'Code review',
          suggestedRole: 'reviewer',
          dependsOn: ['task-3', 'task-4'],
          complexity: 0.5,
          parallelizable: false,
        },
      ],
      executionMode: 'dag',
      complexity: 0.75,
    };

    it('should render workflow plan with all agents', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentSelectionUI, {
            plan: mockPlan,
            theme: 'mimir',
            onApprove: vi.fn(),
            onCancel: vi.fn(),
            onEdit: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('Multi-Agent Workflow Plan');
      expect(output).toContain('Implement authentication with OAuth2 and tests');
      expect(output).toContain('[1]');
      expect(output).toContain('Finder');
      expect(output).toContain('[2]');
      expect(output).toContain('Thinker');
      expect(output).toContain('[3]');
      expect(output).toContain('Tester');
      expect(output).toContain('[4]');
      expect(output).toContain('Security');
      expect(output).toContain('[5]');
      expect(output).toContain('Reviewer');
    });

    it('should display execution mode and complexity', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentSelectionUI, {
            plan: mockPlan,
            theme: 'mimir',
            onApprove: vi.fn(),
            onCancel: vi.fn(),
            onEdit: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('dag');
      expect(output).toContain('75%'); // 0.75 * 100
    });

    it('should show keyboard shortcuts in footer', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentSelectionUI, {
            plan: mockPlan,
            theme: 'mimir',
            onApprove: vi.fn(),
            onCancel: vi.fn(),
            onEdit: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      // Check for formatted shortcuts (using keyboard formatter)
      expect(output).toMatch(/approve|select/i);
      expect(output).toMatch(/cancel/i);
      expect(output).toMatch(/edit/i);
    });

    it('should handle plans with fewer than 5 agents', () => {
      const smallPlan: WorkflowPlan = {
        ...mockPlan,
        tasks: mockPlan.tasks.slice(0, 2),
      };

      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentSelectionUI, {
            plan: smallPlan,
            theme: 'mimir',
            onApprove: vi.fn(),
            onCancel: vi.fn(),
            onEdit: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('[1]');
      expect(output).toContain('[2]');
      expect(output).not.toContain('[3]');
      expect(output).not.toContain('[4]');
      expect(output).not.toContain('[5]');
    });

    it('should limit display to first 5 agents for large plans', () => {
      const largePlan: WorkflowPlan = {
        ...mockPlan,
        tasks: [
          ...mockPlan.tasks,
          {
            id: 'task-6',
            description: 'Extra task',
            suggestedRole: 'general',
            complexity: 0.5,
          },
          {
            id: 'task-7',
            description: 'Another extra task',
            suggestedRole: 'general',
            complexity: 0.5,
          },
        ],
      };

      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentSelectionUI, {
            plan: largePlan,
            theme: 'mimir',
            onApprove: vi.fn(),
            onCancel: vi.fn(),
            onEdit: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('[5]');
      expect(output).not.toContain('[6]');
      expect(output).not.toContain('[7]');
    });
  });

  describe('MultiAgentProgressView', () => {
    const mockAgents: AgentProgressData[] = [
      {
        index: 1,
        role: 'finder',
        status: 'completed',
        elapsedTime: 45000, // 45 seconds
        cost: 0.001,
        tokens: 1200,
        currentTask: 'Find auth files',
        todoCount: 0,
      },
      {
        index: 2,
        role: 'thinker',
        status: 'reasoning',
        elapsedTime: 83000, // 1m 23s
        cost: 0.008,
        tokens: 8400,
        currentTask: 'Implement OAuth2',
        todoCount: 3,
        currentTodo: 'Create OAuth2 provider',
      },
      {
        index: 3,
        role: 'tester',
        status: 'idle',
        elapsedTime: 0,
        cost: 0,
        tokens: 0,
        todoCount: 2,
      },
    ];

    it('should render all agent progress rows', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'running',
            totalElapsedTime: 128000,
            totalCost: 0.009,
            totalTokens: 9600,
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('Multi-Agent Workflow Progress');
      expect(output).toContain('Finder');
      expect(output).toContain('Thinker');
      expect(output).toContain('Tester');
    });

    it('should display overall progress percentage', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'running',
            totalElapsedTime: 128000,
            totalCost: 0.009,
            totalTokens: 9600,
          })
        )
      );

      const output = lastFrame();

      // 1 completed out of 3 = 33%
      expect(output).toMatch(/33%/);
    });

    it('should format elapsed time correctly', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'running',
            totalElapsedTime: 128000,
            totalCost: 0.009,
            totalTokens: 9600,
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/2m.*8s/);
    });

    it('should format cost correctly', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'running',
            totalElapsedTime: 128000,
            totalCost: 0.009,
            totalTokens: 9600,
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/\$0\.009/);
    });

    it('should format token count with locale', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'running',
            totalElapsedTime: 128000,
            totalCost: 0.009,
            totalTokens: 9600,
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/9,600/);
    });

    it('should show status icon for completed workflow', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents.map((a) => ({ ...a, status: 'completed' as const })),
            theme: 'mimir',
            workflowStatus: 'completed',
            totalElapsedTime: 200000,
            totalCost: 0.015,
            totalTokens: 15000,
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/✓.*Completed/);
      expect(output).toMatch(/100%/);
    });

    it('should show status icon for failed workflow', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'failed',
            totalElapsedTime: 100000,
            totalCost: 0.005,
            totalTokens: 5000,
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/✗.*Failed/);
    });

    it('should show footer with keyboard shortcuts when running', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'running',
            totalElapsedTime: 128000,
            totalCost: 0.009,
            totalTokens: 9600,
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/view details|interrupt/i);
    });

    it('should not show interrupt option when completed', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(MultiAgentProgressView, {
            agents: mockAgents,
            theme: 'mimir',
            workflowStatus: 'completed',
            totalElapsedTime: 200000,
            totalCost: 0.015,
            totalTokens: 15000,
          })
        )
      );

      const output = lastFrame();

      expect(output).not.toMatch(/interrupt/i);
    });
  });

  describe('AgentDetailView', () => {
    const mockAgentDetail: AgentDetailData = {
      index: 2,
      role: 'thinker',
      status: 'acting',
      elapsedTime: 120000, // 2 minutes
      cost: 0.012,
      tokens: 12000,
      model: 'claude-opus-4-5-20251101',
      currentIteration: 3,
      maxIterations: 10,
      todos: [
        { content: 'Create OAuth2 provider', status: 'completed' },
        { content: 'Implement token refresh', status: 'in_progress' },
        { content: 'Add error handling', status: 'pending' },
        { content: 'Write unit tests', status: 'pending' },
      ],
      recentSteps: [
        {
          stepNumber: 1,
          timestamp: new Date(),
          thought: 'I need to create the OAuth2 provider class first',
          action: { type: 'tool', tool: 'write_file', input: {} },
          tokens: 500,
          cost: 0.002,
        },
        {
          stepNumber: 2,
          timestamp: new Date(),
          thought: 'Now implementing token refresh logic with expiry handling',
          action: { type: 'tool', tool: 'write_file', input: {} },
          tokens: 600,
          cost: 0.003,
        },
      ],
    };

    it('should render agent details with all metrics', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: mockAgentDetail,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('Agent 2: Thinker');
      expect(output).toContain('Acting');
      expect(output).toContain('claude-opus-4-5-20251101');
      expect(output).toMatch(/2m.*0s/);
      expect(output).toContain('$0.0120');
      expect(output).toContain('12,000');
    });

    it('should display iteration progress', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: mockAgentDetail,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('3/10');
    });

    it('should render todo list with status icons', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: mockAgentDetail,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('✓ Create OAuth2 provider');
      expect(output).toContain('▶ Implement token refresh');
      expect(output).toContain('○ Add error handling');
      expect(output).toContain('○ Write unit tests');
    });

    it('should limit todo list to 10 items', () => {
      const manyTodos: AgentDetailData = {
        ...mockAgentDetail,
        todos: Array.from({ length: 15 }, (_, i) => ({
          content: `Todo ${i + 1}`,
          status: 'pending' as const,
        })),
      };

      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: manyTodos,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('Todo 1');
      expect(output).toContain('Todo 10');
      expect(output).toContain('... and 5 more');
      expect(output).not.toContain('Todo 11');
    });

    it('should display recent steps with truncated thoughts', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: mockAgentDetail,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('Recent Steps:');
      expect(output).toMatch(/Step 1:.*OAuth2 provider/);
      expect(output).toMatch(/Step 2:.*token refresh/);
    });

    it('should truncate long thoughts to 60 characters', () => {
      const longThought: AgentDetailData = {
        ...mockAgentDetail,
        recentSteps: [
          {
            stepNumber: 1,
            timestamp: new Date(),
            thought:
              'This is a very long thought that should be truncated to sixty characters maximum for display purposes',
            action: { type: 'tool', tool: 'write_file', input: {} },
            tokens: 500,
            cost: 0.002,
          },
        ],
      };

      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: longThought,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toContain('...');
      expect(output).not.toContain('maximum for display purposes');
    });

    it('should show close instruction in footer', () => {
      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: mockAgentDetail,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).toMatch(/close/i);
    });

    it('should handle agent with no todos', () => {
      const noTodos: AgentDetailData = {
        ...mockAgentDetail,
        todos: [],
      };

      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: noTodos,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).not.toContain('Tasks:');
    });

    it('should handle agent with no recent steps', () => {
      const noSteps: AgentDetailData = {
        ...mockAgentDetail,
        recentSteps: [],
      };

      const { lastFrame } = render(
        withKeyboardProvider(
          React.createElement(AgentDetailView, {
            agent: noSteps,
            theme: 'mimir',
            onClose: vi.fn(),
          })
        )
      );

      const output = lastFrame();

      expect(output).not.toContain('Recent Steps:');
    });
  });
});
