/**
 * Model Selection View - Change model for a specific agent
 *
 * Displays available models for the selected agent role and allows
 * keyboard navigation to select a different model.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import type { AgentRole } from '@codedir/mimir-agents/core';
import { buildFooterText } from '@/shared/utils/keyboardFormatter.js';
import { useKeyboardAction } from '@/shared/keyboard/index.js';
import chalk from 'chalk';

export interface ModelSelectionViewProps {
  /** Agent role being configured */
  role: AgentRole;

  /** Currently selected model */
  currentModel: string;

  /** Available models for this role */
  availableModels: string[];

  /** Current theme */
  theme: Theme;

  /** Callback when model is selected */
  onSelect: (model: string) => void;

  /** Callback when user cancels */
  onCancel: () => void;
}

interface ModelInfo {
  id: string;
  displayName: string;
  description: string;
}

/**
 * Get model metadata for display
 */
function getModelInfo(modelId: string): ModelInfo {
  const models: Record<string, ModelInfo> = {
    'claude-3-5-haiku-20241022': {
      id: 'claude-3-5-haiku-20241022',
      displayName: 'Claude 3.5 Haiku',
      description: 'Fast, efficient, good for simple tasks',
    },
    'claude-sonnet-4-5-20250927': {
      id: 'claude-sonnet-4-5-20250927',
      displayName: 'Claude Sonnet 4.5',
      description: 'Balanced performance and capability',
    },
    'claude-opus-4-5-20251101': {
      id: 'claude-opus-4-5-20251101',
      displayName: 'Claude Opus 4.5',
      description: 'Most capable, best for complex reasoning',
    },
    'deepseek-chat': {
      id: 'deepseek-chat',
      displayName: 'DeepSeek Chat',
      description: 'Alternative model for general tasks',
    },
    'deepseek-coder': {
      id: 'deepseek-coder',
      displayName: 'DeepSeek Coder',
      description: 'Specialized for coding tasks',
    },
  };

  return (
    models[modelId] || {
      id: modelId,
      displayName: modelId,
      description: 'Model',
    }
  );
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

export const ModelSelectionView: React.FC<ModelSelectionViewProps> = ({
  role,
  currentModel,
  availableModels,
  theme,
  onSelect,
  onCancel,
}) => {
  const themeDefinition = getTheme(theme);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = availableModels.indexOf(currentModel);
    return index >= 0 ? index : 0;
  });

  // Model info list
  const models = useMemo(() => {
    return availableModels.map(getModelInfo);
  }, [availableModels]);

  // Keyboard shortcuts
  useKeyboardAction('navigateUp', () => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  });

  useKeyboardAction('navigateDown', () => {
    setSelectedIndex((prev) => Math.min(models.length - 1, prev + 1));
  });

  useKeyboardAction('accept', () => {
    const selected = models[selectedIndex];
    if (selected) {
      onSelect(selected.id);
    }
  });

  useKeyboardAction('interrupt', () => {
    onCancel();
  });

  // Build footer text
  const footerText = useMemo(() => {
    return buildFooterText([
      { shortcut: ['ArrowUp', 'ArrowDown'], label: 'navigate' },
      { shortcut: 'Enter', label: 'select' },
      { shortcut: 'Escape', label: 'cancel' },
    ]);
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
          <Text bold>{themeDefinition.colors.info(`Select Model for ${formatRoleName(role)} Agent`)}</Text>
        </Box>

        {/* Model list */}
        <Box flexDirection="column" marginBottom={1}>
          {models.map((model, index) => {
            const isSelected = selectedIndex === index;
            const isCurrent = model.id === currentModel;

            const bg = isSelected && themeDefinition.rawColors.autocompleteSelectedBg
              ? chalk.bgHex(themeDefinition.rawColors.autocompleteSelectedBg)
              : chalk;

            const prefix = isSelected ? '▶' : ' ';
            const suffix = isCurrent ? ' (current)' : '';

            return (
              <Box key={model.id} marginBottom={0}>
                <Text>
                  {bg(
                    `  ${prefix} ${model.displayName.padEnd(22)} - ${model.description}${suffix}`
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>{footerText}</Text>
      </Box>
    </Box>
  );
};
