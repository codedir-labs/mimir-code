/**
 * Agent Progress Row - Individual agent status in multi-agent workflow
 *
 * Shows compact agent status with:
 * - Status icon and name
 * - Elapsed time
 * - Cost and tokens
 * - Current task/todo
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { AgentStatus, AgentRole } from '@codedir/mimir-agents/core';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import chalk from 'chalk';

export interface AgentProgressData {
  /** Agent index (1-5) */
  index: number;

  /** Agent role */
  role: AgentRole;

  /** Current status */
  status: AgentStatus;

  /** Elapsed time in milliseconds */
  elapsedTime: number;

  /** Total cost so far */
  cost: number;

  /** Total tokens used */
  tokens: number;

  /** Current task/action being performed */
  currentTask?: string;

  /** Todo list (compact - just count or first item) */
  todoCount?: number;
  currentTodo?: string;

  /** Whether this agent is selected for detail view */
  isSelected?: boolean;
}

export interface AgentProgressRowProps {
  /** Agent progress data */
  agent: AgentProgressData;

  /** Current theme */
  theme: Theme;
}

/**
 * Format elapsed time as human-readable string
 */
function formatElapsedTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format cost as human-readable string
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 1000).toFixed(2)}m`; // millidollars
  }
  return `$${cost.toFixed(3)}`;
}

/**
 * Format tokens with K/M suffix
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return `${tokens}`;
}

/**
 * Get status icon for agent status
 */
function getStatusIcon(status: AgentStatus): string {
  const iconMap: Record<AgentStatus, string> = {
    idle: '○',
    reasoning: '⚙',
    acting: '▶',
    observing: '👁',
    completed: '✓',
    failed: '✗',
    interrupted: '⏸',
  };
  return iconMap[status] || '?';
}

/**
 * Format role name for display
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

export const AgentProgressRow: React.FC<AgentProgressRowProps> = ({ agent, theme }) => {
  const themeDefinition = getTheme(theme);
  const statusIcon = getStatusIcon(agent.status);

  // Get status color from theme
  const statusColor = useMemo(() => {
    switch (agent.status) {
      case 'idle':
        return themeDefinition.colors.statusIdle;
      case 'reasoning':
        return themeDefinition.colors.statusReasoning;
      case 'acting':
        return themeDefinition.colors.statusActing;
      case 'observing':
        return themeDefinition.colors.statusObserving;
      case 'completed':
        return themeDefinition.colors.success;
      case 'failed':
        return themeDefinition.colors.error;
      case 'interrupted':
        return themeDefinition.colors.statusInterrupted;
      default:
        return themeDefinition.colors.statusIdle;
    }
  }, [agent.status, themeDefinition.colors]);

  // Build the row content
  const rowContent = useMemo(() => {
    const roleName = formatRoleName(agent.role).padEnd(12);
    const time = formatElapsedTime(agent.elapsedTime).padStart(7);
    const cost = formatCost(agent.cost).padStart(8);
    const tokens = formatTokens(agent.tokens).padStart(6);

    // Current task (truncated if too long)
    const maxTaskLength = 30;
    let task: string;
    if (!agent.currentTask) {
      task = ''.padEnd(maxTaskLength);
    } else if (agent.currentTask.length > maxTaskLength) {
      task = `${agent.currentTask.substring(0, maxTaskLength - 3)}...`;
    } else {
      task = agent.currentTask.padEnd(maxTaskLength);
    }

    const todoInfo =
      agent.todoCount && agent.todoCount > 0 ? ` (${agent.todoCount} todos)` : '';

    return `[${agent.index}] ${statusIcon} ${roleName} ${time} ${cost} ${tokens}  ${task}${todoInfo}`;
  }, [agent, statusIcon]);

  // Apply theme colors
  const displayContent = useMemo(() => {
    let content = statusColor(rowContent);

    // Apply background if selected
    if (agent.isSelected && themeDefinition.rawColors.autocompleteSelectedBg) {
      content = chalk.bgHex(themeDefinition.rawColors.autocompleteSelectedBg)(rowContent);
    }

    return content;
  }, [rowContent, statusColor, agent.isSelected, themeDefinition.rawColors.autocompleteSelectedBg]);

  return (
    <Box>
      <Text>{displayContent}</Text>
    </Box>
  );
};
