/**
 * Wizard head ASCII art component
 * Simple wizard icon for use in setup wizard
 */

import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { MimirColors } from '../theme-colors.js';
import { MIMIR_LOGO } from './logo.js';

export const WizardHead: React.FC = () => {
  const nordFrost = chalk.hex(MimirColors.frost3);

  return (
    <Box flexDirection="column" marginBottom={1} alignItems="center">
      {MIMIR_LOGO.map((line, index) => (
        <Text key={index}>{nordFrost.bold(line)}</Text>
      ))}
    </Box>
  );
};
