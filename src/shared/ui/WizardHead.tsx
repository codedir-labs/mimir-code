/**
 * Wizard head ASCII art component
 * Simple wizard icon for use in setup wizard
 */

import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';
import { MIMIR_LOGO } from '@/shared/ui/logo.js';

export interface WizardHeadProps {
  theme: Theme;
}

export const WizardHead: React.FC<WizardHeadProps> = ({ theme }) => {
  const themeDefinition = getTheme(theme);
  const accentColor = themeDefinition.colors.wizardAccent;

  return (
    <Box flexDirection="column" marginBottom={1} alignItems="center">
      {MIMIR_LOGO.map((line, index) => (
        <Text key={index} bold>
          {accentColor(line)}
        </Text>
      ))}
    </Box>
  );
};
