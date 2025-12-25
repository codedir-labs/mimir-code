/**
 * Command autocomplete dropdown
 * Shows available commands or parameter suggestions
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ISlashCommand } from '../../core/SlashCommand.js';
import { Theme, KeyBindingsConfig } from '../../config/schemas.js';
import { getTheme } from '../../config/themes/index.js';
import { formatNavigationArrows, formatKeyboardShortcut } from '../../utils/keyboardFormatter.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

/**
 * Adjust hex color brightness by a factor
 * @param hex - Hex color string (e.g., '#3B4252')
 * @param factor - Adjustment factor (-1 to 1, negative for darker, positive for lighter)
 * @returns Adjusted hex color
 */
function adjustHexBrightness(hex: string, factor: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');

  // Parse RGB components
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Adjust brightness
  const adjust = (value: number) => {
    const adjusted = factor < 0
      ? value * (1 + factor) // Darken
      : value + (255 - value) * factor; // Lighten
    return Math.max(0, Math.min(255, Math.round(adjusted)));
  };

  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

export interface CommandAutocompleteProps {
  // For command autocomplete
  commands?: ISlashCommand[];
  // For parameter autocomplete
  parameterSuggestions?: string[];
  parameterName?: string;
  selectedIndex: number;
  maxVisible?: number;
  // Show parameter info for selected command
  showParameterInfo?: boolean;
  selectedCommand?: ISlashCommand;
  // Theme for styling
  theme: Theme;
  // Keyboard shortcuts for footer
  keyBindings: KeyBindingsConfig;
  // Callback to report actual rendered height
  onHeightCalculated?: (height: number) => void;
}

export const CommandAutocomplete: React.FC<CommandAutocompleteProps> = ({
  commands,
  parameterSuggestions,
  parameterName,
  selectedIndex,
  maxVisible = 5,
  showParameterInfo = false,
  selectedCommand: _selectedCommand,
  theme,
  keyBindings,
  onHeightCalculated,
}) => {
  const themeDefinition = getTheme(theme);
  const bgColorHex = themeDefinition.rawColors.autocompleteBg || '#2e3440';
  const bg = chalk.bgHex(bgColorHex);
  const autocompleteText = themeDefinition.colors.autocompleteText;
  const autocompleteSelectedBgHex = themeDefinition.rawColors.autocompleteSelectedBg || '#88c0d0';
  const autocompleteSelectedBg = chalk.bgHex(autocompleteSelectedBgHex);
  const autocompleteSelectedText = themeDefinition.colors.autocompleteSelectedText;
  const autocompleteHeaderText = themeDefinition.colors.autocompleteHeaderText;
  const autocompleteFooterText = themeDefinition.colors.autocompleteFooterText;
  const autocompleteMoreIndicator = themeDefinition.colors.autocompleteMoreIndicator;

  // Subtle background for parameter rows (slightly darker)
  const paramBgHex = adjustHexBrightness(bgColorHex, -0.05); // 5% darker
  const paramBg = chalk.bgHex(paramBgHex);

  // Get terminal width to constrain autocomplete
  const { width: terminalWidth } = useTerminalSize();
  const maxAllowedWidth = Math.max(30, terminalWidth - 4); // Leave 4 chars margin, minimum 30

  // Helper to truncate text with ellipsis if it exceeds max width
  const truncateText = (text: string, maxLen: number): string => {
    // Strip ANSI codes for accurate length calculation
    // eslint-disable-next-line no-control-regex
    const stripped = text.replace(/\x1B\[[0-9;]*m/g, '');
    if (stripped.length <= maxLen) {
      return stripped; // Always return stripped version for consistent formatting
    }
    // Truncate stripped text and add ellipsis
    return stripped.slice(0, maxLen - 3) + '...';
  };

  // Helper to create full-width background line
  const bgLine = (content: string, width: number, chalkFn = autocompleteText) => {
    const truncated = truncateText(content, width);
    // truncateText already strips ANSI codes, so we can use length directly
    const padding = Math.max(0, width - truncated.length);
    return bg(chalkFn(truncated + ' '.repeat(padding)));
  };

  // Build footer text from keyboard shortcuts with icons
  const footerText = useMemo(() => {
    const navigateKeys = formatNavigationArrows(keyBindings.navigateUp, keyBindings.navigateDown);
    // Show all accept keys (Tab, Enter, etc.)
    const acceptKeys = formatKeyboardShortcut(keyBindings.showTooltip.concat(keyBindings.accept));
    const cancelKeys = formatKeyboardShortcut(keyBindings.interrupt);
    return ` ${navigateKeys} navigate | ${acceptKeys} select | ${cancelKeys} cancel `;
  }, [keyBindings]);

  // Parameter autocomplete mode
  if (parameterSuggestions && parameterSuggestions.length > 0) {
    // Guard: Ensure selectedIndex is within bounds
    const safeSelectedIndex = Math.max(0, Math.min(selectedIndex, parameterSuggestions.length - 1));

    const { visibleSuggestions, startIndex, endIndex } = useMemo(() => {
      if (parameterSuggestions.length <= maxVisible) {
        return {
          visibleSuggestions: parameterSuggestions,
          startIndex: 0,
          endIndex: parameterSuggestions.length,
        };
      }

      // Calculate window to ensure selected item is ALWAYS visible
      let startIndex: number;
      let endIndex: number;

      if (safeSelectedIndex < Math.floor(maxVisible / 2)) {
        // Near start - show from beginning
        startIndex = 0;
        endIndex = maxVisible;
      } else if (safeSelectedIndex >= parameterSuggestions.length - Math.floor(maxVisible / 2)) {
        // Near end - show last maxVisible items
        startIndex = parameterSuggestions.length - maxVisible;
        endIndex = parameterSuggestions.length;
      } else {
        // Middle - center the selected item
        startIndex = safeSelectedIndex - Math.floor(maxVisible / 2);
        endIndex = startIndex + maxVisible;
      }

      // Safety bounds
      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(parameterSuggestions.length, endIndex);

      return {
        visibleSuggestions: parameterSuggestions.slice(startIndex, endIndex),
        startIndex,
        endIndex,
      };
    }, [parameterSuggestions, safeSelectedIndex, maxVisible]);

    const moreAbove = startIndex > 0;
    const moreBelow = endIndex < parameterSuggestions.length;
    const moreAboveCount = startIndex;
    const moreBelowCount = parameterSuggestions.length - endIndex;

    // Calculate exact rendered height by counting lines we're about to render:
    // 1. Header line
    // 2. More above indicator (conditional)
    // 3. Each visible suggestion (1 line each)
    // 4. More below indicator (conditional)
    // 5. Footer line
    const actualHeight = useMemo(() => {
      let height = 0;
      height += 1; // header
      if (moreAbove) height += 1; // more above indicator
      height += visibleSuggestions.length; // all visible items
      if (moreBelow) height += 1; // more below indicator
      height += 1; // footer
      return height;
    }, [moreAbove, visibleSuggestions.length, moreBelow]);

    // Report height to parent
    React.useEffect(() => {
      if (onHeightCalculated) {
        onHeightCalculated(actualHeight);
      }
    }, [onHeightCalculated, actualHeight]);

    // Calculate max width for consistent backgrounds, clamped to terminal width
    const maxWidth = useMemo(() => {
      const header = ` ${parameterName || 'Parameter'} (${parameterSuggestions.length}) `;
      const moreText = moreAbove ? ` ▲ ${moreAboveCount} more above ` : '';
      const moreBelowText = moreBelow ? ` ▼ ${moreBelowCount} more below ` : '';
      const items = visibleSuggestions.map(s => `  ${s}`);

      const lengths = [header.length, footerText.length, moreText.length, moreBelowText.length, ...items.map(i => i.length)];
      const idealWidth = Math.max(...lengths, 50); // Minimum 50 chars
      return Math.min(idealWidth, maxAllowedWidth); // Clamp to terminal width
    }, [parameterName, parameterSuggestions.length, visibleSuggestions, moreAbove, moreBelow, moreAboveCount, moreBelowCount, footerText, maxAllowedWidth]);

    return (
      <Box flexDirection="column" flexShrink={0}>
        <Text>{bgLine(` ${parameterName || 'Parameter'} (${parameterSuggestions.length}) `, maxWidth, autocompleteHeaderText)}</Text>
        {moreAbove && (
          <Text>{bgLine(` ▲ ${moreAboveCount} more above `, maxWidth, autocompleteMoreIndicator)}</Text>
        )}
        {visibleSuggestions.map((suggestion, idx) => {
          // Calculate actual index in original array
          const actualIndex = startIndex + idx;
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
        {moreBelow && (
          <Text>{bgLine(` ▼ ${moreBelowCount} more below `, maxWidth, autocompleteMoreIndicator)}</Text>
        )}
        <Text>{bgLine(footerText, maxWidth, autocompleteFooterText)}</Text>
      </Box>
    );
  }

  // Command autocomplete mode
  if (!commands || commands.length === 0) {
    return null;
  }

  // Guard: Ensure selectedIndex is within bounds
  const safeSelectedIndex = Math.max(0, Math.min(selectedIndex, commands.length - 1));

  const { visibleCommands, startIndex, endIndex } = useMemo(() => {
    // Helper: count lines a command takes (1 + params if selected and showing param info)
    const countLines = (cmd: ISlashCommand | undefined, idx: number) => {
      if (!cmd) return 1; // Safety: treat undefined as 1 line
      let lines = 1; // Command itself
      if (showParameterInfo && idx === safeSelectedIndex && cmd.parameters) {
        lines += cmd.parameters.length; // Add parameter lines
      }
      return lines;
    };

    // Calculate total lines if we show all commands
    const totalLines = commands.reduce((sum, cmd, idx) => sum + countLines(cmd, idx), 0);

    // If total lines fit in maxVisible, show all
    if (totalLines <= maxVisible) {
      return {
        visibleCommands: commands,
        startIndex: 0,
        endIndex: commands.length,
      };
    }

    // Need to window - calculate visible range accounting for line counts
    // Strategy: Start from selected item and expand outward until we hit maxVisible lines
    let startIndex = safeSelectedIndex;
    let endIndex = safeSelectedIndex + 1;
    let lineCount = countLines(commands[safeSelectedIndex], safeSelectedIndex);

    // Expand downward first (items after selected)
    while (endIndex < commands.length && lineCount < maxVisible) {
      const nextLines = countLines(commands[endIndex], endIndex);
      if (lineCount + nextLines > maxVisible) break;
      lineCount += nextLines;
      endIndex++;
    }

    // Then expand upward (items before selected) if we have room
    while (startIndex > 0 && lineCount < maxVisible) {
      const prevLines = countLines(commands[startIndex - 1], startIndex - 1);
      if (lineCount + prevLines > maxVisible) break;
      lineCount += prevLines;
      startIndex--;
    }

    return {
      visibleCommands: commands.slice(startIndex, endIndex),
      startIndex,
      endIndex,
    };
  }, [commands, safeSelectedIndex, maxVisible, showParameterInfo]);

  const moreAbove = startIndex > 0;
  const moreBelow = endIndex < commands.length;
  const moreAboveCount = startIndex;
  const moreBelowCount = commands.length - endIndex;

  // Calculate parameter tooltip lines for selected command
  const safeIndex = Math.max(0, Math.min(selectedIndex, commands.length - 1));
  const selectedCmd = commands[safeIndex];
  const paramTooltipLines = (showParameterInfo && selectedCmd?.parameters) ? selectedCmd.parameters.length : 0;

  // Calculate exact rendered height by counting lines we're about to render:
  // 1. Header line
  // 2. More above indicator (conditional)
  // 3. Each visible command (1 line each)
  // 4. Parameter tooltips for selected command (conditional, N lines)
  // 5. More below indicator (conditional)
  // 6. Footer line
  const actualHeight = useMemo(() => {
    let height = 0;
    height += 1; // header
    if (moreAbove) height += 1; // more above indicator
    height += visibleCommands.length; // all visible command items
    height += paramTooltipLines; // parameter tooltips for selected command
    if (moreBelow) height += 1; // more below indicator
    height += 1; // footer
    return height;
  }, [moreAbove, visibleCommands.length, paramTooltipLines, moreBelow]);

  // Report height to parent
  React.useEffect(() => {
    if (onHeightCalculated) {
      onHeightCalculated(actualHeight);
    }
  }, [onHeightCalculated, actualHeight]);

  // Calculate max width for consistent backgrounds, clamped to terminal width
  const maxWidth = useMemo(() => {
    const header = ` Commands (${commands.length}) `;
    const moreText = moreAbove ? ` ▲ ${moreAboveCount} more above ` : '';
    const moreBelowText = moreBelow ? ` ▼ ${moreBelowCount} more below ` : '';

    const cmdLengths = visibleCommands.map((cmd) => {
      const cmdLine = `  /${cmd.name} - ${cmd.description}`;
      let maxLen = cmdLine.length;
      if (showParameterInfo && cmd.parameters) {
        cmd.parameters.forEach((param) => {
          const paramLine = `    <${param.name}>: ${param.description}`;
          maxLen = Math.max(maxLen, paramLine.length);
        });
      }
      return maxLen;
    });

    const lengths = [header.length, footerText.length, moreText.length, moreBelowText.length, ...cmdLengths];
    const idealWidth = Math.max(...lengths, 50); // Minimum 50 chars
    return Math.min(idealWidth, maxAllowedWidth); // Clamp to terminal width
  }, [commands.length, visibleCommands, showParameterInfo, moreAbove, moreBelow, moreAboveCount, moreBelowCount, footerText, maxAllowedWidth]);

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>{bgLine(` Commands (${commands.length}) `, maxWidth, autocompleteHeaderText)}</Text>
      {moreAbove && (
        <Text>{bgLine(` ▲ ${moreAboveCount} more above `, maxWidth, autocompleteMoreIndicator)}</Text>
      )}
      {(() => {
        // Calculate consistent column width for all commands (table layout)
        // Find longest command name in the visible set
        const longestCmdName = Math.max(...visibleCommands.map(c => c.name.length));
        const cmdColumnWidth = longestCmdName + 2; // +2 for '/' and spacing

        // Also check parameters if showing
        let longestParamSig = 0;
        if (showParameterInfo) {
          for (const cmd of visibleCommands) {
            if (cmd.parameters) {
              for (const p of cmd.parameters) {
                const paramSig = `/${cmd.name} <${p.name}>`.length;
                longestParamSig = Math.max(longestParamSig, paramSig);
              }
            }
          }
        }
        const signatureColumnWidth = Math.max(cmdColumnWidth, longestParamSig + 2);

        return visibleCommands.map((command, idx) => {
          const actualIndex = startIndex + idx;
          const isSelected = actualIndex === safeSelectedIndex;
          const prefix = isSelected ? '> ' : '  ';

          // Build table row: [prefix][/name][padding][description]
          const cmdName = `${prefix}/${command.name}`;
          const cmdPadding = ' '.repeat(Math.max(1, signatureColumnWidth - cmdName.length + 2));
          const cmdLine = cmdName + cmdPadding + command.description;
          const cmdTruncated = truncateText(cmdLine, maxWidth);

          // Split at description boundary
          const descStartIdx = cmdName.length + cmdPadding.length;
          const cmdPart = cmdTruncated.substring(0, Math.min(descStartIdx, cmdTruncated.length));
          const descPart = cmdTruncated.substring(Math.min(descStartIdx, cmdTruncated.length));
          const rowPadding = ' '.repeat(Math.max(0, maxWidth - cmdTruncated.length));

          return (
            <React.Fragment key={`${actualIndex}-${command.name}`}>
              <Text>
                {isSelected
                  ? autocompleteSelectedBg(autocompleteSelectedText(cmdPart) + autocompleteSelectedText(chalk.dim(descPart)) + autocompleteSelectedText(rowPadding))
                  : bg(autocompleteText(cmdPart) + autocompleteText(chalk.dim(descPart)) + autocompleteText(rowPadding))}
              </Text>
              {isSelected && showParameterInfo && command.parameters && command.parameters.length > 0 &&
                command.parameters.map((param) => {
                  // Parameter row: [    <param>][padding][description] (indented by 2 spaces)
                  const paramSig = `    <${param.name}>`;
                  const paramPadding = ' '.repeat(Math.max(1, signatureColumnWidth - paramSig.length + 2));
                  const paramLine = paramSig + paramPadding + param.description;
                  const paramTruncated = truncateText(paramLine, maxWidth);

                  const paramDescStartIdx = paramSig.length + paramPadding.length;
                  const paramSigPart = paramTruncated.substring(0, Math.min(paramDescStartIdx, paramTruncated.length));
                  const paramDescPart = paramTruncated.substring(Math.min(paramDescStartIdx, paramTruncated.length));
                  const paramRowPadding = ' '.repeat(Math.max(0, maxWidth - paramTruncated.length));

                  return (
                    <Text key={`${actualIndex}-${command.name}-${param.name}`}>
                      {paramBg(
                        autocompleteText(chalk.dim(paramSigPart)) +
                        autocompleteText(chalk.hex('#8b95a8')(paramDescPart)) +
                        autocompleteText(paramRowPadding)
                      )}
                    </Text>
                  );
                })
              }
            </React.Fragment>
          );
        });
      })()}
      {moreBelow && (
        <Text>{bgLine(` ▼ ${moreBelowCount} more below `, maxWidth, autocompleteMoreIndicator)}</Text>
      )}
      <Text>{bgLine(footerText, maxWidth, autocompleteFooterText)}</Text>
    </Box>
  );
};
