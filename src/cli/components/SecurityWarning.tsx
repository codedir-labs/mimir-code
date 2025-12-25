/**
 * Security warning component
 * Displays security disclosure on first run
 */

import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import figures from 'figures';
import chalk from 'chalk';
import { MimirColors } from '../theme-colors.js';
import { KeyBindingsConfig } from '../../config/schemas.js';
import { formatKeyboardShortcut } from '../../utils/keyboardFormatter.js';

export interface SecurityWarningProps {
  onAccept: () => void;
  onCancel: () => void;
  keyBindings: KeyBindingsConfig;
}

export const SecurityWarning: React.FC<SecurityWarningProps> = ({ onAccept, onCancel, keyBindings }) => {
  useInput((_input, key) => {
    if (key.return) {
      onAccept();
    } else if (key.escape) {
      onCancel();
    }
  });

  const nordRed = chalk.hex(MimirColors.auroraRed);
  const nordGreen = chalk.hex(MimirColors.auroraGreen);

  // Format shortcuts for display
  const acceptShortcut = useMemo(
    () => formatKeyboardShortcut(keyBindings.accept),
    [keyBindings.accept]
  );
  const cancelShortcut = useMemo(
    () => formatKeyboardShortcut(keyBindings.interrupt),
    [keyBindings.interrupt]
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="yellow" bold>
          {figures.warning} Security Warning
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Mimir can execute commands and modify files on your system.
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          You'll approve commands before execution via the permission system.
        </Text>
      </Box>

      <Box>
        <Text>
          Press {nordGreen(acceptShortcut)} to continue or {nordRed(cancelShortcut)} to cancel
        </Text>
      </Box>
    </Box>
  );
};
