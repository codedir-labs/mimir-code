/**
 * Mimir header component with wizard ASCII art
 * Layout inspired by Claude Code with wizard head on left, info on right
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from '../../config/schemas.js';
import { getTheme } from '../../config/themes/index.js';
import { MIMIR_LOGO } from './logo.js';

export interface MimirHeaderProps {
  version: string;
  provider: string;
  model: string;
  workspace: string;
  theme: Theme;
  mode: 'plan' | 'act' | 'discuss';
}

export const MimirHeader: React.FC<MimirHeaderProps> = ({
  version,
  provider,
  model,
  workspace,
  theme,
  mode
}) => {
  const themeDefinition = getTheme(theme);

  // Logo color changes based on current mode
  const logoColor = mode === 'plan'
    ? themeDefinition.colors.modePlan
    : mode === 'act'
    ? themeDefinition.colors.modeAct
    : themeDefinition.colors.modeDiscuss;

  const versionColor = themeDefinition.colors.warning;
  const providerColor = themeDefinition.colors.success;
  const dimText = themeDefinition.colors.comment;

  const infoLines = [
    versionColor(`Mimir v${version}`),
    providerColor(`${provider} · ${model}`),
    dimText(workspace),
    themeDefinition.colors.info(`Theme: ${themeDefinition.name}`),
  ];

  // Fixed width for logo column to ensure consistent alignment
  const LOGO_WIDTH = 7;

  return (
    <Box flexDirection="column">
      {MIMIR_LOGO.map((logoLine, index) => (
        <Box key={index}>
          <Box width={LOGO_WIDTH}>
            <Text>{logoColor.bold(logoLine)}</Text>
          </Box>
          {infoLines[index] && <Text>{infoLines[index]}</Text>}
        </Box>
      ))}
    </Box>
  );
};
