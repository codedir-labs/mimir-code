/**
 * Chat footer component
 * Displays mode, cost, keyboard shortcuts and help tips
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';
import { getTheme } from '@/shared/config/themes/index.js';
import { getRandomTip } from './tips.js';
import { formatKeyboardShortcut } from '@/shared/utils/keyboardFormatter.js';

export interface FooterProps {
  theme: Theme;
  shortcuts: KeyBindingsConfig;
  mode: 'plan' | 'act' | 'discuss';
  cost: number;
  interruptPressCount?: number;
  isAgentRunning?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  theme,
  shortcuts,
  mode,
  cost,
  interruptPressCount = 0,
  isAgentRunning = false,
}) => {
  const themeDefinition = getTheme(theme);

  // Get mode display with icon, color, and capitalization
  const getModeDisplay = (): JSX.Element => {
    switch (mode) {
      case 'plan':
        return <Text>{themeDefinition.colors.modePlan('□ PLAN   ')}</Text>;
      case 'act':
        return <Text>{themeDefinition.colors.modeAct('▶ ACT    ')}</Text>;
      case 'discuss':
        return <Text>{themeDefinition.colors.modeDiscuss('◉ DISCUSS')}</Text>;
    }
  };

  // Random tip that rotates every 10 seconds
  const [currentTip, setCurrentTip] = useState(getRandomTip(shortcuts));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip(getRandomTip(shortcuts));
    }, 10000); // Change tip every 10 seconds

    return () => clearInterval(interval);
  }, [shortcuts]);

  // Get message to display below shortcuts
  const getMessage = () => {
    if (interruptPressCount === 1) {
      const interruptKey = formatKeyboardShortcut(shortcuts.interrupt);
      if (isAgentRunning) {
        return (
          <Text>
            {themeDefinition.colors.warning(
              `Agent interrupted. Press ${interruptKey} again to exit`
            )}
          </Text>
        );
      } else {
        return <Text>{themeDefinition.colors.warning(`Press ${interruptKey} again to exit`)}</Text>;
      }
    }
    return <Text dimColor>{currentTip}</Text>;
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          Mode: {getModeDisplay()}
          {' | '}
          Cost: <Text>{themeDefinition.colors.warning(`$${cost.toFixed(4)}`)}</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          {formatKeyboardShortcut(shortcuts.interrupt)}=Cancel |{' '}
          {formatKeyboardShortcut(shortcuts.modeSwitch)}=Mode | /help=Commands
        </Text>
      </Box>
      <Box>{getMessage()}</Box>
    </Box>
  );
};
