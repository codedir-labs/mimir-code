/**
 * Security warning component
 * Displays security disclosure on first run
 */

import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import figures from 'figures';
import { getTheme } from '@/shared/config/themes/index.js';
import type { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';
import { formatKeyboardShortcut } from '@/shared/utils/keyboardFormatter.js';

export interface SecurityWarningProps {
  onAccept: () => void;
  onCancel: () => void;
  keyBindings: KeyBindingsConfig;
  theme: Theme;
}

export const SecurityWarning: React.FC<SecurityWarningProps> = ({
  onAccept,
  onCancel,
  keyBindings,
  theme,
}) => {
  const themeDefinition = getTheme(theme);

  useInput((_input, key) => {
    if (key.return) {
      onAccept();
    } else if (key.escape) {
      onCancel();
    }
  });

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
        <Text bold>{themeDefinition.colors.warning(`${figures.warning} Security Warning`)}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Mimir Code can execute commands and modify files on your system.</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>You'll approve commands before execution via the permission system.</Text>
      </Box>

      <Box>
        <Text>
          Press {themeDefinition.colors.success(acceptShortcut)} to continue or{' '}
          {themeDefinition.colors.error(cancelShortcut)} to cancel
        </Text>
      </Box>
    </Box>
  );
};
