/**
 * Theme selector component with code preview
 * Allows user to choose from available themes with live preview
 */

import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import chalk from 'chalk';
import { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';
import { getTheme, getAllThemes, getThemeMetadata } from '@/shared/config/themes/index.js';
import { getPreviewWithDiff } from '@/shared/utils/syntaxHighlight.js';
import { buildFooterText } from '@/shared/utils/keyboardFormatter.js';

export interface ThemeSelectorProps {
  onSelect: (theme: Theme) => void;
  onCancel: () => void;
  keyBindings: KeyBindingsConfig;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  onSelect,
  onCancel: _onCancel,
  keyBindings,
}) => {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Get all available themes dynamically
  const availableThemes = getAllThemes();
  const items = availableThemes.map((themeKey) => {
    const metadata = getThemeMetadata(themeKey);
    return {
      label: metadata.name,
      value: themeKey,
    };
  });

  const currentThemeKey = availableThemes[highlightedIndex];
  if (!currentThemeKey) return null;
  const themeColors = getTheme(currentThemeKey);
  const preview = getPreviewWithDiff();

  const bg = chalk.bgHex('#1e1e1e');
  const fg = chalk.hex('#eceff4');

  // Build footer text from keyboard shortcuts
  const footerText = useMemo(() => {
    const navUp = keyBindings.navigateUp[0] ?? 'ArrowUp';
    const navDown = keyBindings.navigateDown[0] ?? 'ArrowDown';
    return buildFooterText([
      { shortcut: [navUp, navDown], label: 'navigate' },
      { shortcut: keyBindings.accept ?? 'Enter', label: 'select' },
      { shortcut: keyBindings.interrupt ?? 'Escape', label: 'cancel' },
    ]);
  }, [keyBindings]);

  return (
    <Box flexDirection="column">
      <Text>{bg(fg.bold(' Select your theme: '))}</Text>
      <Text>{bg(' ')}</Text>

      <Box flexDirection="column">
        <SelectInput
          items={items}
          onSelect={(item) => onSelect(item.value)}
          onHighlight={(item) => {
            const index = availableThemes.findIndex((t) => t === item.value);
            if (index !== -1) setHighlightedIndex(index);
          }}
        />
      </Box>

      <Text>{bg(' ')}</Text>
      <Text>{bg(fg(' Preview: '))}</Text>
      {preview.map((item, idx) => (
        <Text key={idx}>
          {item.type === 'remove' && bg(themeColors.colors.diffRemoveLine(`- ${item.line}`))}
          {item.type === 'add' && bg(themeColors.colors.diffAddLine(`+ ${item.line}`))}
          {item.type === 'normal' &&
            bg(
              fg(
                `  ${themeColors.colors.keyword(item.line.match(/return/)?.[0] || '')}${item.line.replace(/return/, '')}`
              )
            )}
        </Text>
      ))}
      <Text>{bg(' ')}</Text>

      <Text>{bg(chalk.dim(` ${footerText} `))}</Text>
    </Box>
  );
};
