/**
 * Agent Selection UI - Interactive workflow plan approval
 *
 * Features:
 * - Display workflow plan with all agents
 * - Number keys (1-5) to select agent for model change
 * - Enter to approve, Esc to cancel, e to edit
 * - Claude Code-style approval UX
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import type { WorkflowPlan, AgentRole } from '@codedir/mimir-agents/core';
import { buildFooterText } from '@/shared/utils/keyboardFormatter.js';
import { useKeyboardAction } from '@/shared/keyboard/index.js';
import chalk from 'chalk';

export interface AgentSelectionUIProps {
  /** Workflow plan to display */
  plan: WorkflowPlan;

  /** Current theme */
  theme: Theme;

  /** Callback when user approves the plan */
  onApprove: (plan: WorkflowPlan) => void;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Callback when user wants to edit task */
  onEdit: () => void;

  /** Callback when user selects an agent to change model */
  onSelectAgent?: (agentIndex: number) => void;

  /** Available models per role */
  availableModels?: Record<AgentRole, string[]>;
}

interface AgentDisplayInfo {
  index: number;
  role: AgentRole;
  model: string;
  task: string;
  complexity?: number;
}

/**
 * Format agent role name for display
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
 * Get default model for role
 */
function getDefaultModel(role: AgentRole): string {
  const defaultModels: Record<AgentRole, string> = {
    finder: 'claude-3-5-haiku-20241022',
    thinker: 'claude-opus-4-5-20251101',
    librarian: 'claude-sonnet-4-5-20250927',
    refactoring: 'claude-sonnet-4-5-20250927',
    reviewer: 'claude-sonnet-4-5-20250927',
    tester: 'claude-sonnet-4-5-20250927',
    security: 'claude-opus-4-5-20251101',
    rush: 'claude-3-5-haiku-20241022',
    general: 'claude-sonnet-4-5-20250927',
  };
  return defaultModels[role] || 'claude-sonnet-4-5-20250927';
}

/**
 * Format model name for display (shorten)
 */
function formatModelName(model: string): string {
  // Shorten common model names
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('sonnet')) return 'Sonnet 4.5';
  if (model.includes('opus-4-5')) return 'Opus 4.5';
  if (model.includes('opus')) return 'Opus';
  return model;
}

export const AgentSelectionUI: React.FC<AgentSelectionUIProps> = ({
  plan,
  theme,
  onApprove,
  onCancel,
  onEdit,
  onSelectAgent,
}) => {
  const themeDefinition = getTheme(theme);
  const [selectedIndex] = useState<number | null>(null); // TODO: Will be used for agent selection

  // Convert tasks to display info
  const agents = useMemo<AgentDisplayInfo[]>(() => {
    return plan.tasks.slice(0, 5).map((task, index) => ({
      index: index + 1,
      role: task.suggestedRole,
      model: getDefaultModel(task.suggestedRole),
      task: task.description,
      complexity: task.complexity,
    }));
  }, [plan.tasks]);

  // Keyboard shortcuts
  useKeyboardAction('accept', () => {
    onApprove(plan);
  });

  useKeyboardAction('interrupt', () => {
    onCancel();
  });

  // Number keys (1-5) to select agent
  // TODO: Implement number key handling through KeyboardEventBus
  // This will be integrated with the main keyboard system in the next iteration
  useEffect(() => {
    // Placeholder for number key selection
    // Will be implemented when integrated with ChatCommand
    return () => {
      // Cleanup
    };
  }, [agents.length, onApprove, onCancel, onEdit, onSelectAgent, plan]);

  // Build footer text
  const footerText = useMemo(() => {
    const items = [];

    if (agents.length > 0) {
      items.push({
        shortcut: agents.map((_, i) => `${i + 1}`),
        label: 'select agent',
      });
    }

    items.push(
      { shortcut: 'Enter', label: 'approve' },
      { shortcut: 'Escape', label: 'cancel' },
      { shortcut: 'e', label: 'edit' }
    );

    return buildFooterText(items);
  }, [agents.length]);

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
          <Text bold>{themeDefinition.colors.info('Multi-Agent Workflow Plan')}</Text>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor>
            Task: {plan.task}
          </Text>
        </Box>

        {plan.description && (
          <Box marginBottom={1}>
            <Text dimColor>{plan.description}</Text>
          </Box>
        )}

        <Box marginBottom={1}>
          <Text dimColor>
            The following agents will work on this task:
          </Text>
        </Box>

        {/* Agent list */}
        <Box flexDirection="column" marginBottom={1}>
          {agents.map((agent) => {
            const isSelected = selectedIndex === agent.index;
            const bg = isSelected && themeDefinition.rawColors.autocompleteSelectedBg
              ? chalk.bgHex(themeDefinition.rawColors.autocompleteSelectedBg)
              : chalk;

            return (
              <Box key={agent.index} marginBottom={0}>
                <Text>
                  {bg(
                    `  [${agent.index}] ${formatRoleName(agent.role).padEnd(12)} (${formatModelName(
                      agent.model
                    ).padEnd(12)}) ${agent.task}`
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Execution info */}
        <Box marginBottom={1}>
          <Text dimColor>
            Execution mode: {plan.executionMode} | Complexity: {(plan.complexity * 100).toFixed(0)}%
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>{footerText}</Text>
      </Box>
    </Box>
  );
};
