/**
 * Wizard layout component
 * Provides consistent layout with header for wizard steps
 */

import React from 'react';
import { Box, Text } from 'ink';
import { WizardHead } from './WizardHead.js';
import { MimirColors } from '../theme-colors.js';

export interface WizardLayoutProps {
  title: string;
  children: React.ReactNode;
}

export const WizardLayout: React.FC<WizardLayoutProps> = ({ title, children }) => {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <WizardHead />
      {title && (
        <Box marginBottom={1}>
          <Text color={MimirColors.snowStorm3}>{title}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
};
