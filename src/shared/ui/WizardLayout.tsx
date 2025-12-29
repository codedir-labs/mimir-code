/**
 * Wizard layout component
 * Provides consistent layout with header for wizard steps
 */

import React from 'react';
import { Box, Text } from 'ink';
import { WizardHead } from '@/shared/ui/WizardHead.js';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';

export interface WizardLayoutProps {
  title: string;
  children: React.ReactNode;
  theme: Theme;
}

export const WizardLayout: React.FC<WizardLayoutProps> = ({ title, children, theme }) => {
  const themeDefinition = getTheme(theme);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <WizardHead theme={theme} />
      {title && (
        <Box marginBottom={1}>
          <Text>{themeDefinition.colors.wizardTitle(title)}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
};
