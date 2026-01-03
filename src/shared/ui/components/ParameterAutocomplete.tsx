/**
 * Parameter autocomplete component
 * Shows parameter value suggestions with windowing
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ThemeDefinition } from '@/shared/config/themes/index.js';
import { KeyBindingsConfig } from '@/shared/config/schemas.js';
import { formatNavigationArrows, formatKeyboardShortcut } from '@/shared/utils/keyboardFormatter.js';

/** Strip ANSI escape codes from text using character code checks */
function stripAnsiCodes(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    // Skip ESC (27) or CSI (155) sequences
    if (code === 27 || code === 155) {
      i++;
      // Skip until we hit a letter (end of escape sequence)
      while (i < text.length) {
        const char = text.charAt(i);
        if (/[A-Za-z]/.test(char)) break;
        i++;
      }
      i++; // Skip the final letter
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

/** Truncate text with ellipsis if it exceeds max width */
function truncateText(text: string, maxLen: number): string {
  const stripped = stripAnsiCodes(text);
  return stripped.length <= maxLen ? stripped : stripped.slice(0, maxLen - 3) + '...';
}

export interface ParameterAutocompleteProps {
  suggestions: string[];
  parameterName?: string;
  selectedIndex: number;
  maxVisible: number;
  themeDefinition: ThemeDefinition;
  keyBindings: KeyBindingsConfig;
  maxAllowedWidth: number;
  onHeightCalculated?: (height: number) => void;
}

export const ParameterAutocomplete: React.FC<ParameterAutocompleteProps> = ({
  suggestions,
  parameterName,
  selectedIndex,
  maxVisible,
  themeDefinition,
  keyBindings,
  maxAllowedWidth,
  onHeightCalculated,
}) => {
  const bgColorHex = themeDefinition.rawColors.autocompleteBg || '#2e3440';
  const bg = chalk.bgHex(bgColorHex);
  const autocompleteText = themeDefinition.colors.autocompleteText;
  const autocompleteSelectedBgHex = themeDefinition.rawColors.autocompleteSelectedBg || '#88c0d0';
  const autocompleteSelectedBg = chalk.bgHex(autocompleteSelectedBgHex);
  const autocompleteSelectedText = themeDefinition.colors.autocompleteSelectedText;
  const autocompleteHeaderText = themeDefinition.colors.autocompleteHeaderText;
  const autocompleteFooterText = themeDefinition.colors.autocompleteFooterText;
  const autocompleteMoreIndicator = themeDefinition.colors.autocompleteMoreIndicator;

  const bgLine = (content: string, width: number, colorFn = autocompleteText) => {
    const truncated = truncateText(content, width);
    const padding = Math.max(0, width - truncated.length);
    return bg(colorFn(truncated + ' '.repeat(padding)));
  };

  const footerText = useMemo(() => {
    const navigateKeys = formatNavigationArrows(keyBindings.navigateUp, keyBindings.navigateDown);
    const acceptKeys = formatKeyboardShortcut(keyBindings.showTooltip.concat(keyBindings.accept));
    const cancelKeys = formatKeyboardShortcut(keyBindings.interrupt);
    return ` ${navigateKeys} navigate | ${acceptKeys} select | ${cancelKeys} cancel `;
  }, [keyBindings]);

  const safeSelectedIndex = useMemo(() => {
    if (suggestions.length === 0) return 0;
    return Math.max(0, Math.min(selectedIndex, suggestions.length - 1));
  }, [selectedIndex, suggestions.length]);

  const visibleData = useMemo(() => {
    if (suggestions.length === 0) {
      return { visibleSuggestions: [], startIndex: 0, endIndex: 0 };
    }

    if (suggestions.length <= maxVisible) {
      return { visibleSuggestions: suggestions, startIndex: 0, endIndex: suggestions.length };
    }

    let startIndex: number;
    let endIndex: number;

    if (safeSelectedIndex < Math.floor(maxVisible / 2)) {
      startIndex = 0;
      endIndex = maxVisible;
    } else if (safeSelectedIndex >= suggestions.length - Math.floor(maxVisible / 2)) {
      startIndex = suggestions.length - maxVisible;
      endIndex = suggestions.length;
    } else {
      startIndex = safeSelectedIndex - Math.floor(maxVisible / 2);
      endIndex = startIndex + maxVisible;
    }

    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(suggestions.length, endIndex);

    return { visibleSuggestions: suggestions.slice(startIndex, endIndex), startIndex, endIndex };
  }, [suggestions, safeSelectedIndex, maxVisible]);

  const moreAbove = visibleData.startIndex > 0;
  const moreBelow = visibleData.endIndex < suggestions.length;
  const moreAboveCount = visibleData.startIndex;
  const moreBelowCount = suggestions.length - visibleData.endIndex;

  const maxWidth = useMemo(() => {
    if (suggestions.length === 0) return 50;
    const header = ` ${parameterName ?? 'Parameter'} (${suggestions.length}) `;
    const moreText = moreAbove ? ` ▲ ${moreAboveCount} more above ` : '';
    const moreBelowText = moreBelow ? ` ▼ ${moreBelowCount} more below ` : '';
    const items = visibleData.visibleSuggestions.map((s) => `  ${s}`);

    const lengths = [header.length, footerText.length, moreText.length, moreBelowText.length, ...items.map((i) => i.length)];
    const idealWidth = Math.max(...lengths, 50);
    return Math.min(idealWidth, maxAllowedWidth);
  }, [parameterName, suggestions.length, visibleData.visibleSuggestions, moreAbove, moreBelow, moreAboveCount, moreBelowCount, footerText, maxAllowedWidth]);

  const actualHeight = useMemo(() => {
    if (suggestions.length === 0) return 0;
    let height = 2; // header + footer
    if (moreAbove) height += 1;
    height += visibleData.visibleSuggestions.length;
    if (moreBelow) height += 1;
    return height;
  }, [moreAbove, visibleData.visibleSuggestions.length, moreBelow, suggestions.length]);

  // Report height to parent
  React.useEffect(() => {
    if (onHeightCalculated) onHeightCalculated(actualHeight);
  }, [onHeightCalculated, actualHeight]);

  if (suggestions.length === 0) return null;

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>{bgLine(` ${parameterName ?? 'Parameter'} (${suggestions.length}) `, maxWidth, autocompleteHeaderText)}</Text>
      {moreAbove && <Text>{bgLine(` ▲ ${moreAboveCount} more above `, maxWidth, autocompleteMoreIndicator)}</Text>}
      {visibleData.visibleSuggestions.map((suggestion, idx) => {
        const actualIndex = visibleData.startIndex + idx;
        const isSelected = actualIndex === safeSelectedIndex;
        const prefix = isSelected ? '> ' : '  ';
        const content = `${prefix}${suggestion}`;
        return (
          <Text key={`${actualIndex}-${suggestion}`}>
            {isSelected
              ? autocompleteSelectedBg(autocompleteSelectedText(truncateText(content, maxWidth).padEnd(maxWidth, ' ')))
              : bgLine(content, maxWidth)}
          </Text>
        );
      })}
      {moreBelow && <Text>{bgLine(` ▼ ${moreBelowCount} more below `, maxWidth, autocompleteMoreIndicator)}</Text>}
      <Text>{bgLine(footerText, maxWidth, autocompleteFooterText)}</Text>
    </Box>
  );
};
