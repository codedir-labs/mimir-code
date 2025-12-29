/**
 * Multi-Agent Progress View - Real-time progress tracking for all agents
 *
 * Features:
 * - Vertical stack showing all agents
 * - Real-time status updates (500ms refresh)
 * - Keyboard shortcuts (1-5) to view agent details
 * - Overall progress summary
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import { AgentProgressRow, type AgentProgressData } from './AgentProgressRow.js';
import { AgentDetailView, type AgentDetailData } from './AgentDetailView.js';
import { buildFooterText } from '@/shared/utils/keyboardFormatter.js';
import { useKeyboardAction } from '@/shared/keyboard/index.js';

export interface MultiAgentProgressViewProps {
  /** Array of agent progress data */
  agents: AgentProgressData[];

  /** Current theme */
  theme: Theme;

  /** Overall workflow status */
  workflowStatus: 'running' | 'completed' | 'failed' | 'interrupted';

  /** Total elapsed time for workflow */
  totalElapsedTime: number;

  /** Total cost across all agents */
  totalCost: number;

  /** Total tokens across all agents */
  totalTokens: number;

  /** Callback to get detailed data for an agent */
  onGetAgentDetails?: (agentIndex: number) => AgentDetailData | null;

  /** Callback when workflow is interrupted */
  onInterrupt?: () => void;
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
 * Get workflow status display
 */
function getWorkflowStatusDisplay(
  status: MultiAgentProgressViewProps['workflowStatus'],
  themeDefinition: ReturnType<typeof getTheme>
): {
  icon: string;
  text: string;
  colorFn: (text: string) => string;
} {
  const statusMap: Record<
    MultiAgentProgressViewProps['workflowStatus'],
    { icon: string; text: string; colorFn: (text: string) => string }
  > = {
    running: { icon: '▶', text: 'Running', colorFn: themeDefinition.colors.info },
    completed: { icon: '✓', text: 'Completed', colorFn: themeDefinition.colors.success },
    failed: { icon: '✗', text: 'Failed', colorFn: themeDefinition.colors.error },
    interrupted: { icon: '⏸', text: 'Interrupted', colorFn: themeDefinition.colors.warning },
  };
  return statusMap[status];
}

export const MultiAgentProgressView: React.FC<MultiAgentProgressViewProps> = ({
  agents,
  theme,
  workflowStatus,
  totalElapsedTime,
  totalCost,
  totalTokens,
  onGetAgentDetails,
  onInterrupt,
}) => {
  const themeDefinition = getTheme(theme);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<AgentDetailData | null>(null);

  // Get workflow status display
  const statusDisplay = getWorkflowStatusDisplay(workflowStatus, themeDefinition);

  // Calculate progress
  const completedCount = agents.filter((a) => a.status === 'completed').length;
  const totalCount = agents.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Keyboard shortcuts - number keys (1-5) to select agent
  useEffect(() => {
    // TODO: Implement number key handling through KeyboardEventBus
    // This will be integrated when wired up with ChatCommand
    return () => {
      // Cleanup
    };
  }, [agents.length, onGetAgentDetails]);

  // Close detail view on Esc
  useKeyboardAction('interrupt', () => {
    if (selectedAgentIndex !== null) {
      // Close detail view
      setSelectedAgentIndex(null);
      setDetailData(null);
    } else if (onInterrupt) {
      // Interrupt workflow
      onInterrupt();
    }
  });

  // Build footer text
  const footerText = useMemo(() => {
    const items = [];

    if (agents.length > 0 && workflowStatus === 'running') {
      items.push({
        shortcut: agents.map((_, i) => `${i + 1}`),
        label: 'view details',
      });
    }

    if (workflowStatus === 'running') {
      items.push({ shortcut: ['Ctrl+C', 'Escape'], label: 'interrupt' });
    }

    return items.length > 0 ? buildFooterText(items) : '';
  }, [agents.length, workflowStatus]);

  // If detail view is open, show it
  if (selectedAgentIndex !== null && detailData) {
    return (
      <AgentDetailView
        agent={detailData}
        theme={theme}
        onClose={() => {
          setSelectedAgentIndex(null);
          setDetailData(null);
        }}
      />
    );
  }

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
          <Text bold>{themeDefinition.colors.info('Multi-Agent Workflow Progress')}</Text>
        </Box>

        {/* Overall status */}
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text dimColor>Status: </Text>
            <Text bold>
              {statusDisplay.colorFn(`${statusDisplay.icon} ${statusDisplay.text}`)}
            </Text>
            <Text dimColor> ({progressPercent}% complete)</Text>
          </Box>
          <Box>
            <Text dimColor>Elapsed: </Text>
            <Text>{formatElapsedTime(totalElapsedTime)}</Text>
          </Box>
          <Box>
            <Text dimColor>Total Cost: </Text>
            <Text>${totalCost.toFixed(4)}</Text>
          </Box>
          <Box>
            <Text dimColor>Total Tokens: </Text>
            <Text>{totalTokens.toLocaleString()}</Text>
          </Box>
        </Box>

        {/* Agent list header */}
        <Box marginBottom={0}>
          <Text dimColor># Status Role Time Cost Tokens Current Task</Text>
        </Box>

        {/* Agent rows */}
        <Box flexDirection="column" marginBottom={1}>
          {agents.map((agent) => (
            <AgentProgressRow key={agent.index} agent={agent} theme={theme} />
          ))}
        </Box>
      </Box>

      {/* Footer */}
      {footerText && (
        <Box marginTop={1}>
          <Text dimColor>{footerText}</Text>
        </Box>
      )}
    </Box>
  );
};
