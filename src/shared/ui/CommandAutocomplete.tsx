/**
 * Command autocomplete dropdown
 * Shows available commands or parameter suggestions
 */

import React, { useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ISlashCommand } from '@/features/chat/slash-commands/SlashCommand.js';
import { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';
import { getTheme } from '@/shared/config/themes/index.js';
import { formatNavigationArrows, formatKeyboardShortcut } from '@/shared/utils/keyboardFormatter.js';
import { useTerminalSize } from '@/shared/ui/hooks/useTerminalSize.js';

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
    const adjusted =
      factor < 0
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

  // Determine mode: parameter suggestions take precedence
  const isParameterMode = Boolean(parameterSuggestions && parameterSuggestions.length > 0);
  const hasCommands = Boolean(commands && commands.length > 0);

  // Helper to truncate text with ellipsis if it exceeds max width
  const truncateText = (text: string, maxLen: number): string => {
    // Strip ANSI codes for accurate length calculation
    // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
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

  // ============================================================================
  // PARAMETER MODE CALCULATIONS (always computed, but only used if isParameterMode)
  // ============================================================================

  const paramSuggestions = parameterSuggestions || [];
  const paramSafeSelectedIndex = useMemo(() => {
    if (paramSuggestions.length === 0) return 0;
    return Math.max(0, Math.min(selectedIndex, paramSuggestions.length - 1));
  }, [selectedIndex, paramSuggestions.length]);

  const paramVisibleData = useMemo(() => {
    if (paramSuggestions.length === 0) {
      return { visibleSuggestions: [], startIndex: 0, endIndex: 0 };
    }

    if (paramSuggestions.length <= maxVisible) {
      return {
        visibleSuggestions: paramSuggestions,
        startIndex: 0,
        endIndex: paramSuggestions.length,
      };
    }

    // Calculate window to ensure selected item is ALWAYS visible
    let startIndex: number;
    let endIndex: number;

    if (paramSafeSelectedIndex < Math.floor(maxVisible / 2)) {
      // Near start - show from beginning
      startIndex = 0;
      endIndex = maxVisible;
    } else if (paramSafeSelectedIndex >= paramSuggestions.length - Math.floor(maxVisible / 2)) {
      // Near end - show last maxVisible items
      startIndex = paramSuggestions.length - maxVisible;
      endIndex = paramSuggestions.length;
    } else {
      // Middle - center the selected item
      startIndex = paramSafeSelectedIndex - Math.floor(maxVisible / 2);
      endIndex = startIndex + maxVisible;
    }

    // Safety bounds
    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(paramSuggestions.length, endIndex);

    return {
      visibleSuggestions: paramSuggestions.slice(startIndex, endIndex),
      startIndex,
      endIndex,
    };
  }, [paramSuggestions, paramSafeSelectedIndex, maxVisible]);

  const paramMoreAbove = paramVisibleData.startIndex > 0;
  const paramMoreBelow = paramVisibleData.endIndex < paramSuggestions.length;
  const paramMoreAboveCount = paramVisibleData.startIndex;
  const paramMoreBelowCount = paramSuggestions.length - paramVisibleData.endIndex;

  const paramActualHeight = useMemo(() => {
    if (paramSuggestions.length === 0) return 0;
    let height = 0;
    height += 1; // header
    if (paramMoreAbove) height += 1; // more above indicator
    height += paramVisibleData.visibleSuggestions.length; // all visible items
    if (paramMoreBelow) height += 1; // more below indicator
    height += 1; // footer
    return height;
  }, [paramMoreAbove, paramVisibleData.visibleSuggestions.length, paramMoreBelow, paramSuggestions.length]);

  const paramMaxWidth = useMemo(() => {
    if (paramSuggestions.length === 0) return 50;
    const header = ` ${parameterName || 'Parameter'} (${paramSuggestions.length}) `;
    const moreText = paramMoreAbove ? ` ▲ ${paramMoreAboveCount} more above ` : '';
    const moreBelowText = paramMoreBelow ? ` ▼ ${paramMoreBelowCount} more below ` : '';
    const items = paramVisibleData.visibleSuggestions.map((s) => `  ${s}`);

    const lengths = [
      header.length,
      footerText.length,
      moreText.length,
      moreBelowText.length,
      ...items.map((i) => i.length),
    ];
    const idealWidth = Math.max(...lengths, 50); // Minimum 50 chars
    return Math.min(idealWidth, maxAllowedWidth); // Clamp to terminal width
  }, [
    parameterName,
    paramSuggestions.length,
    paramVisibleData.visibleSuggestions,
    paramMoreAbove,
    paramMoreBelow,
    paramMoreAboveCount,
    paramMoreBelowCount,
    footerText,
    maxAllowedWidth,
  ]);

  // ============================================================================
  // COMMAND MODE CALCULATIONS (always computed, but only used if !isParameterMode)
  // ============================================================================

  const cmds = commands || [];
  const cmdSafeSelectedIndex = useMemo(() => {
    if (cmds.length === 0) return 0;
    return Math.max(0, Math.min(selectedIndex, cmds.length - 1));
  }, [selectedIndex, cmds.length]);

  const cmdVisibleData = useMemo(() => {
    if (cmds.length === 0) {
      return { visibleCommands: [] as ISlashCommand[], startIndex: 0, endIndex: 0 };
    }

    // Helper: count lines a command takes (1 + params if selected and showing param info)
    const countLines = (cmd: ISlashCommand | undefined, idx: number) => {
      if (!cmd) return 1; // Safety: treat undefined as 1 line
      let lines = 1; // Command itself
      if (showParameterInfo && idx === cmdSafeSelectedIndex && cmd.parameters) {
        lines += cmd.parameters.length; // Add parameter lines
      }
      return lines;
    };

    // Calculate total lines if we show all commands
    const totalLines = cmds.reduce((sum, cmd, idx) => sum + countLines(cmd, idx), 0);

    // If total lines fit in maxVisible, show all
    if (totalLines <= maxVisible) {
      return {
        visibleCommands: cmds,
        startIndex: 0,
        endIndex: cmds.length,
      };
    }

    // Need to window - calculate visible range accounting for line counts
    // Strategy: Start from selected item and expand outward until we hit maxVisible lines
    let startIndex = cmdSafeSelectedIndex;
    let endIndex = cmdSafeSelectedIndex + 1;
    let lineCount = countLines(cmds[cmdSafeSelectedIndex], cmdSafeSelectedIndex);

    // Expand downward first (items after selected)
    while (endIndex < cmds.length && lineCount < maxVisible) {
      const nextLines = countLines(cmds[endIndex], endIndex);
      if (lineCount + nextLines > maxVisible) break;
      lineCount += nextLines;
      endIndex++;
    }

    // Then expand upward (items before selected) if we have room
    while (startIndex > 0 && lineCount < maxVisible) {
      const prevLines = countLines(cmds[startIndex - 1], startIndex - 1);
      if (lineCount + prevLines > maxVisible) break;
      lineCount += prevLines;
      startIndex--;
    }

    return {
      visibleCommands: cmds.slice(startIndex, endIndex),
      startIndex,
      endIndex,
    };
  }, [cmds, cmdSafeSelectedIndex, maxVisible, showParameterInfo]);

  const cmdMoreAbove = cmdVisibleData.startIndex > 0;
  const cmdMoreBelow = cmdVisibleData.endIndex < cmds.length;
  const cmdMoreAboveCount = cmdVisibleData.startIndex;
  const cmdMoreBelowCount = cmds.length - cmdVisibleData.endIndex;

  // Calculate parameter tooltip lines for selected command
  const selectedCmd = cmds.length > 0 ? cmds[cmdSafeSelectedIndex] : undefined;
  const paramTooltipLines =
    showParameterInfo && selectedCmd?.parameters ? selectedCmd.parameters.length : 0;

  const cmdActualHeight = useMemo(() => {
    if (cmds.length === 0) return 0;
    let height = 0;
    height += 1; // header
    if (cmdMoreAbove) height += 1; // more above indicator
    height += cmdVisibleData.visibleCommands.length; // all visible command items
    height += paramTooltipLines; // parameter tooltips for selected command
    if (cmdMoreBelow) height += 1; // more below indicator
    height += 1; // footer
    return height;
  }, [cmdMoreAbove, cmdVisibleData.visibleCommands.length, paramTooltipLines, cmdMoreBelow, cmds.length]);

  const cmdMaxWidth = useMemo(() => {
    if (cmds.length === 0) return 50;
    const header = ` Commands (${cmds.length}) `;
    const moreText = cmdMoreAbove ? ` ▲ ${cmdMoreAboveCount} more above ` : '';
    const moreBelowText = cmdMoreBelow ? ` ▼ ${cmdMoreBelowCount} more below ` : '';

    const cmdLengths = cmdVisibleData.visibleCommands.map((cmd) => {
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

    const lengths = [
      header.length,
      footerText.length,
      moreText.length,
      moreBelowText.length,
      ...cmdLengths,
    ];
    const idealWidth = Math.max(...lengths, 50); // Minimum 50 chars
    return Math.min(idealWidth, maxAllowedWidth); // Clamp to terminal width
  }, [
    cmds.length,
    cmdVisibleData.visibleCommands,
    showParameterInfo,
    cmdMoreAbove,
    cmdMoreBelow,
    cmdMoreAboveCount,
    cmdMoreBelowCount,
    footerText,
    maxAllowedWidth,
  ]);

  // ============================================================================
  // REPORT HEIGHT TO PARENT (unified effect for both modes)
  // ============================================================================

  const actualHeight = isParameterMode ? paramActualHeight : cmdActualHeight;

  useEffect(() => {
    if (onHeightCalculated) {
      onHeightCalculated(actualHeight);
    }
  }, [onHeightCalculated, actualHeight]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Early return if nothing to show
  if (!isParameterMode && !hasCommands) {
    return null;
  }

  // Parameter autocomplete mode
  if (isParameterMode) {
    return (
      <Box flexDirection="column" flexShrink={0}>
        <Text>
          {bgLine(
            ` ${parameterName || 'Parameter'} (${paramSuggestions.length}) `,
            paramMaxWidth,
            autocompleteHeaderText
          )}
        </Text>
        {paramMoreAbove && (
          <Text>
            {bgLine(` ▲ ${paramMoreAboveCount} more above `, paramMaxWidth, autocompleteMoreIndicator)}
          </Text>
        )}
        {paramVisibleData.visibleSuggestions.map((suggestion, idx) => {
          // Calculate actual index in original array
          const actualIndex = paramVisibleData.startIndex + idx;
          const isSelected = actualIndex === paramSafeSelectedIndex;
          const prefix = isSelected ? '> ' : '  ';
          const content = `${prefix}${suggestion}`;

          return (
            <Text key={`${actualIndex}-${suggestion}`}>
              {isSelected
                ? autocompleteSelectedBg(
                    autocompleteSelectedText(truncateText(content, paramMaxWidth).padEnd(paramMaxWidth, ' '))
                  )
                : bgLine(content, paramMaxWidth)}
            </Text>
          );
        })}
        {paramMoreBelow && (
          <Text>
            {bgLine(` ▼ ${paramMoreBelowCount} more below `, paramMaxWidth, autocompleteMoreIndicator)}
          </Text>
        )}
        <Text>{bgLine(footerText, paramMaxWidth, autocompleteFooterText)}</Text>
      </Box>
    );
  }

  // Command autocomplete mode
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>{bgLine(` Commands (${cmds.length}) `, cmdMaxWidth, autocompleteHeaderText)}</Text>
      {cmdMoreAbove && (
        <Text>
          {bgLine(` ▲ ${cmdMoreAboveCount} more above `, cmdMaxWidth, autocompleteMoreIndicator)}
        </Text>
      )}
      {(() => {
        // Calculate consistent column width for all commands (table layout)
        // Find longest command name in the visible set
        const longestCmdName = Math.max(...cmdVisibleData.visibleCommands.map((c) => c.name.length));
        const cmdColumnWidth = longestCmdName + 2; // +2 for '/' and spacing

        // Also check parameters if showing
        let longestParamSig = 0;
        if (showParameterInfo) {
          for (const cmd of cmdVisibleData.visibleCommands) {
            if (cmd.parameters) {
              for (const p of cmd.parameters) {
                const paramSig = `/${cmd.name} <${p.name}>`.length;
                longestParamSig = Math.max(longestParamSig, paramSig);
              }
            }
          }
        }
        const signatureColumnWidth = Math.max(cmdColumnWidth, longestParamSig + 2);

        return cmdVisibleData.visibleCommands.map((command, idx) => {
          const actualIndex = cmdVisibleData.startIndex + idx;
          const isSelected = actualIndex === cmdSafeSelectedIndex;
          const prefix = isSelected ? '> ' : '  ';

          // Build table row: [prefix][/name][padding][description]
          const cmdName = `${prefix}/${command.name}`;
          const cmdPadding = ' '.repeat(Math.max(1, signatureColumnWidth - cmdName.length + 2));
          const cmdLine = cmdName + cmdPadding + command.description;
          const cmdTruncated = truncateText(cmdLine, cmdMaxWidth);

          // Split at description boundary
          const descStartIdx = cmdName.length + cmdPadding.length;
          const cmdPart = cmdTruncated.substring(0, Math.min(descStartIdx, cmdTruncated.length));
          const descPart = cmdTruncated.substring(Math.min(descStartIdx, cmdTruncated.length));
          const rowPadding = ' '.repeat(Math.max(0, cmdMaxWidth - cmdTruncated.length));

          return (
            <React.Fragment key={`${actualIndex}-${command.name}`}>
              <Text>
                {isSelected
                  ? autocompleteSelectedBg(
                      autocompleteSelectedText(cmdPart) +
                        autocompleteSelectedText(chalk.dim(descPart)) +
                        autocompleteSelectedText(rowPadding)
                    )
                  : bg(
                      autocompleteText(cmdPart) +
                        autocompleteText(chalk.dim(descPart)) +
                        autocompleteText(rowPadding)
                    )}
              </Text>
              {isSelected &&
                showParameterInfo &&
                command.parameters &&
                command.parameters.length > 0 &&
                command.parameters.map((param) => {
                  // Parameter row: [    <param>][padding][description] (indented by 2 spaces)
                  const paramSig = `    <${param.name}>`;
                  const paramPadding = ' '.repeat(
                    Math.max(1, signatureColumnWidth - paramSig.length + 2)
                  );
                  const paramLine = paramSig + paramPadding + param.description;
                  const paramTruncated = truncateText(paramLine, cmdMaxWidth);

                  const paramDescStartIdx = paramSig.length + paramPadding.length;
                  const paramSigPart = paramTruncated.substring(
                    0,
                    Math.min(paramDescStartIdx, paramTruncated.length)
                  );
                  const paramDescPart = paramTruncated.substring(
                    Math.min(paramDescStartIdx, paramTruncated.length)
                  );
                  const paramRowPadding = ' '.repeat(Math.max(0, cmdMaxWidth - paramTruncated.length));

                  return (
                    <Text key={`${actualIndex}-${command.name}-${param.name}`}>
                      {paramBg(
                        autocompleteText(chalk.dim(paramSigPart)) +
                          themeDefinition.colors.paramDescription(paramDescPart) +
                          autocompleteText(paramRowPadding)
                      )}
                    </Text>
                  );
                })}
            </React.Fragment>
          );
        });
      })()}
      {cmdMoreBelow && (
        <Text>
          {bgLine(` ▼ ${cmdMoreBelowCount} more below `, cmdMaxWidth, autocompleteMoreIndicator)}
        </Text>
      )}
      <Text>{bgLine(footerText, cmdMaxWidth, autocompleteFooterText)}</Text>
    </Box>
  );
};
