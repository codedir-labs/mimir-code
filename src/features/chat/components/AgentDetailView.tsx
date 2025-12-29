/**
 * Agent Detail View - Expanded view of agent execution
 *
 * Shows detailed information when user presses 1-5:
 * - Full status and progress
 * - Complete todo list
 * - Recent steps/actions
 * - Detailed metrics
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { AgentStatus, AgentRole, AgentStep } from '@codedir/mimir-agents/core';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import { buildFooterText } from '@/shared/utils/keyboardFormatter.js';
import { useKeyboardAction } from '@/shared/keyboard/index.js';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AgentDetailData {
  /** Agent index */
  index: number;

  /** Agent role */
  role: AgentRole;

  /** Current status */
  status: AgentStatus;

  /** Elapsed time in milliseconds */
  elapsedTime: number;

  /** Total cost */
  cost: number;

  /** Total tokens */
  tokens: number;

  /** Model being used */
  model: string;

  /** Current iteration */
  currentIteration?: number;

  /** Max iterations */
  maxIterations?: number;

  /** Todo list */
  todos: TodoItem[];

  /** Recent steps */
  recentSteps?: AgentStep[];
}

export interface AgentDetailViewProps {
  /** Agent detail data */
  agent: AgentDetailData;

  /** Current theme */
  theme: Theme;

  /** Callback when user closes detail view */
  onClose: () => void;
}

/**
 * Format elapsed time
 */
function formatElapsedTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format role name
 */
function formatRoleName(role: AgentRole): string {
  const roleNames: Record<AgentRole, string> = {
    finder: 'Finder',
    thinker: 'Thinker',
    librarian: 'Librarian',
    refactoring: 'Refactoring',
    reviewer: 'Reviewer',
    tester: 'Tester',
    security: 'Security',
    rush: 'Rush',
    general: 'General',
  };
  return roleNames[role] || role;
}

/**
 * Get status display name
 */
function getStatusName(status: AgentStatus): string {
  const statusNames: Record<AgentStatus, string> = {
    idle: 'Idle',
    reasoning: 'Reasoning',
    acting: 'Acting',
    observing: 'Observing',
    completed: 'Completed',
    failed: 'Failed',
    interrupted: 'Interrupted',
  };
  return statusNames[status] || status;
}

/**
 * Get todo status icon
 */
function getTodoIcon(status: TodoItem['status']): string {
  const icons: Record<TodoItem['status'], string> = {
    pending: '○',
    in_progress: '▶',
    completed: '✓',
  };
  return icons[status];
}

export const AgentDetailView: React.FC<AgentDetailViewProps> = ({ agent, theme, onClose }) => {
  const themeDefinition = getTheme(theme);

  // Close on Escape
  useKeyboardAction('interrupt', () => {
    onClose();
  });

  // Build footer text
  const footerText = useMemo(() => {
    return buildFooterText([{ shortcut: 'Escape', label: 'close' }]);
  }, []);

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor={themeDefinition.rawColors.borderColor}
        flexDirection="column"
        paddingX={1}
        width="100%"
      >
        <Box marginBottom={1}>
          <Text bold>
            {themeDefinition.colors.info(`Agent ${agent.index}: ${formatRoleName(agent.role)}`)}
          </Text>
        </Box>

        {/* Status and metrics */}
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text dimColor>Status: </Text>
            <Text bold>{getStatusName(agent.status)}</Text>
          </Box>
          <Box>
            <Text dimColor>Model: </Text>
            <Text>{agent.model}</Text>
          </Box>
          <Box>
            <Text dimColor>Elapsed: </Text>
            <Text>{formatElapsedTime(agent.elapsedTime)}</Text>
          </Box>
          <Box>
            <Text dimColor>Cost: </Text>
            <Text>${agent.cost.toFixed(4)}</Text>
          </Box>
          <Box>
            <Text dimColor>Tokens: </Text>
            <Text>{agent.tokens.toLocaleString()}</Text>
          </Box>
          {agent.currentIteration !== undefined && agent.maxIterations !== undefined && (
            <Box>
              <Text dimColor>Iteration: </Text>
              <Text>
                {agent.currentIteration}/{agent.maxIterations}
              </Text>
            </Box>
          )}
        </Box>

        {/* Todo list */}
        {agent.todos.length > 0 && (
          <Box marginBottom={1} flexDirection="column">
            <Text bold>Tasks:</Text>
            {agent.todos.slice(0, 10).map((todo, index) => {
              const icon = getTodoIcon(todo.status);
              const colorFn =
                todo.status === 'completed'
                  ? themeDefinition.colors.success
                  : todo.status === 'in_progress'
                    ? themeDefinition.colors.info
                    : themeDefinition.colors.comment;

              return (
                <Box key={index}>
                  <Text>{colorFn(`${icon} ${todo.content}`)}</Text>
                </Box>
              );
            })}
            {agent.todos.length > 10 && (
              <Text dimColor>... and {agent.todos.length - 10} more</Text>
            )}
          </Box>
        )}

        {/* Recent steps */}
        {agent.recentSteps && agent.recentSteps.length > 0 && (
          <Box marginBottom={1} flexDirection="column">
            <Text bold>Recent Steps:</Text>
            {agent.recentSteps.slice(-3).map((step, index) => (
              <Box key={index} flexDirection="column">
                <Text dimColor>
                  Step {step.stepNumber}: {step.thought.substring(0, 60)}
                  {step.thought.length > 60 ? '...' : ''}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>{footerText}</Text>
      </Box>
    </Box>
  );
};
