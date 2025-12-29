/**
 * Chat header component
 * Displays current mode, model, and cost
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from '@/shared/config/schemas.js';
import { getTheme } from '@/shared/config/themes/index.js';

export interface HeaderProps {
  mode: 'plan' | 'act' | 'discuss';
  model: string;
  provider: string;
  cost: number;
  theme: Theme;
}

export const Header: React.FC<HeaderProps> = ({ mode, model, provider, cost, theme }) => {
  const themeDefinition = getTheme(theme);

  // Get mode display with icon, color, and capitalization
  const getModeDisplay = () => {
    switch (mode) {
      case 'plan':
        return <Text>{themeDefinition.colors.modePlan('□ PLAN')}</Text>;
      case 'act':
        return <Text>{themeDefinition.colors.modeAct('▶ ACT')}</Text>;
      case 'discuss':
        return <Text>{themeDefinition.colors.modeDiscuss('◉ DISCUSS')}</Text>;
      default:
        return <Text>{themeDefinition.colors.info(mode)}</Text>;
    }
  };

  return (
    <Box paddingX={1} paddingY={0}>
      <Text>
        Mode: {getModeDisplay()}
        {' | '}
        Model: <Text>{themeDefinition.colors.success(`${provider}/${model}`)}</Text>
        {' | '}
        Cost: <Text>{themeDefinition.colors.warning(`$${cost.toFixed(4)}`)}</Text>
      </Text>
    </Box>
  );
};
