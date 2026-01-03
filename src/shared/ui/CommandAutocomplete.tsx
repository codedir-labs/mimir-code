/**
 * Command autocomplete dropdown
 * Shows available commands or parameter suggestions
 */

import React, { useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ISlashCommand } from '@/features/chat/slash-commands/SlashCommand.js';
import { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';
import { getTheme, ThemeDefinition } from '@/shared/config/themes/index.js';
import { formatNavigationArrows, formatKeyboardShortcut } from '@/shared/utils/keyboardFormatter.js';
import { useTerminalSize } from '@/shared/ui/hooks/useTerminalSize.js';

/** Adjust hex color brightness by a factor */
function adjustHexBrightness(hex: string, factor: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const adjust = (v: number) => Math.max(0, Math.min(255, Math.round(factor < 0 ? v * (1 + factor) : v + (255 - v) * factor)));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

/** Pattern to match ANSI escape sequences */
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Truncate text with ellipsis if it exceeds max width */
function truncateText(text: string, maxLen: number): string {
  const stripped = text.replace(ANSI_ESCAPE_PATTERN, '');
  return stripped.length <= maxLen ? stripped : stripped.slice(0, maxLen - 3) + '...';
}

/** Build footer text from keyboard shortcuts */
function buildFooterText(keyBindings: KeyBindingsConfig): string {
  const navigateKeys = formatNavigationArrows(keyBindings.navigateUp, keyBindings.navigateDown);
  const acceptKeys = formatKeyboardShortcut(keyBindings.showTooltip.concat(keyBindings.accept));
  const cancelKeys = formatKeyboardShortcut(keyBindings.interrupt);
  return ` ${navigateKeys} navigate | ${acceptKeys} select | ${cancelKeys} cancel `;
}

/** Theme colors interface */
interface ThemeColors {
  bg: (s: string) => string;
  paramBg: (s: string) => string;
  autocompleteText: (s: string) => string;
  autocompleteSelectedBg: (s: string) => string;
  autocompleteSelectedText: (s: string) => string;
  autocompleteHeaderText: (s: string) => string;
  autocompleteFooterText: (s: string) => string;
  autocompleteMoreIndicator: (s: string) => string;
  paramDescription: (s: string) => string;
}

/** Get theme colors helper */
function getThemeColors(themeDefinition: ThemeDefinition): ThemeColors {
  const bgColorHex = themeDefinition.rawColors.autocompleteBg || '#2e3440';
  const autocompleteSelectedBgHex = themeDefinition.rawColors.autocompleteSelectedBg || '#88c0d0';
  const paramBgHex = adjustHexBrightness(bgColorHex, -0.05);
  return {
    bg: chalk.bgHex(bgColorHex),
    paramBg: chalk.bgHex(paramBgHex),
    autocompleteText: themeDefinition.colors.autocompleteText,
    autocompleteSelectedBg: chalk.bgHex(autocompleteSelectedBgHex),
    autocompleteSelectedText: themeDefinition.colors.autocompleteSelectedText,
    autocompleteHeaderText: themeDefinition.colors.autocompleteHeaderText,
    autocompleteFooterText: themeDefinition.colors.autocompleteFooterText,
    autocompleteMoreIndicator: themeDefinition.colors.autocompleteMoreIndicator,
    paramDescription: themeDefinition.colors.paramDescription,
  };
}

/** Create full-width background line */
function bgLine(content: string, width: number, bg: (s: string) => string, colorFn: (s: string) => string): string {
  const truncated = truncateText(content, width);
  const padding = Math.max(0, width - truncated.length);
  return bg(colorFn(truncated + ' '.repeat(padding)));
}

/** Calculate visible window for list */
function calcVisibleWindow<T>(items: T[], selectedIndex: number, maxVisible: number): { items: T[]; start: number; end: number } {
  if (items.length <= maxVisible) return { items, start: 0, end: items.length };
  const safeIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));
  let start: number, end: number;
  const half = Math.floor(maxVisible / 2);
  if (safeIndex < half) { start = 0; end = maxVisible; }
  else if (safeIndex >= items.length - half) { start = items.length - maxVisible; end = items.length; }
  else { start = safeIndex - half; end = start + maxVisible; }
  return { items: items.slice(start, end), start, end };
}

/** Parameter autocomplete renderer */
const ParameterAutocomplete: React.FC<{
  suggestions: string[]; parameterName: string; selectedIndex: number; maxVisible: number;
  colors: ThemeColors; footerText: string; maxWidth: number;
}> = ({ suggestions, parameterName, selectedIndex, maxVisible, colors, footerText, maxWidth }) => {
  const safeIndex = Math.max(0, Math.min(selectedIndex, suggestions.length - 1));
  const vd = useMemo(() => calcVisibleWindow(suggestions, selectedIndex, maxVisible), [suggestions, selectedIndex, maxVisible]);
  const moreAbove = vd.start > 0, moreBelow = vd.end < suggestions.length;
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>{bgLine(` ${parameterName} (${suggestions.length}) `, maxWidth, colors.bg, colors.autocompleteHeaderText)}</Text>
      {moreAbove && <Text>{bgLine(` ${vd.start} more above `, maxWidth, colors.bg, colors.autocompleteMoreIndicator)}</Text>}
      {vd.items.map((s, idx) => {
        const actualIdx = vd.start + idx;
        const isSelected = actualIdx === safeIndex;
        const content = (isSelected ? '> ' : '  ') + s;
        return <Text key={`${actualIdx}-${s}`}>{isSelected ? colors.autocompleteSelectedBg(colors.autocompleteSelectedText(truncateText(content, maxWidth).padEnd(maxWidth, ' '))) : bgLine(content, maxWidth, colors.bg, colors.autocompleteText)}</Text>;
      })}
      {moreBelow && <Text>{bgLine(` ${suggestions.length - vd.end} more below `, maxWidth, colors.bg, colors.autocompleteMoreIndicator)}</Text>}
      <Text>{bgLine(footerText, maxWidth, colors.bg, colors.autocompleteFooterText)}</Text>
    </Box>
  );
};

/** Count lines a command takes (1 + params if selected and showing param info) */
function countCommandLines(cmd: ISlashCommand | undefined, idx: number, safeIndex: number, showParameterInfo: boolean): number {
  if (!cmd) return 1;
  const paramCount = showParameterInfo && idx === safeIndex && cmd.parameters ? cmd.parameters.length : 0;
  return 1 + paramCount;
}

/** Command autocomplete renderer */
const CommandListAutocomplete: React.FC<{
  commands: ISlashCommand[]; selectedIndex: number; maxVisible: number; showParameterInfo: boolean;
  colors: ThemeColors; footerText: string; maxWidth: number;
}> = ({ commands, selectedIndex, maxVisible, showParameterInfo, colors, footerText, maxWidth }) => {
  const safeIndex = Math.max(0, Math.min(selectedIndex, commands.length - 1));
  const vd = useMemo(() => {
    const countLines = (cmd: ISlashCommand | undefined, idx: number) => countCommandLines(cmd, idx, safeIndex, showParameterInfo);
    const totalLines = commands.reduce((sum, cmd, idx) => sum + countLines(cmd, idx), 0);
    if (totalLines <= maxVisible) return { cmds: commands, start: 0, end: commands.length };
    let start = safeIndex, end = safeIndex + 1, lines = countLines(commands[safeIndex], safeIndex);
    while (end < commands.length && lines < maxVisible) {
      const n = countLines(commands[end], end);
      if (lines + n > maxVisible) break;
      lines += n;
      end++;
    }
    while (start > 0 && lines < maxVisible) {
      const p = countLines(commands[start - 1], start - 1);
      if (lines + p > maxVisible) break;
      lines += p;
      start--;
    }
    return { cmds: commands.slice(start, end), start, end };
  }, [commands, safeIndex, maxVisible, showParameterInfo]);
  const moreAbove = vd.start > 0, moreBelow = vd.end < commands.length;
  const longestName = Math.max(...vd.cmds.map((c) => c.name.length));
  const sigWidth = longestName + 2;
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>{bgLine(` Commands (${commands.length}) `, maxWidth, colors.bg, colors.autocompleteHeaderText)}</Text>
      {moreAbove && <Text>{bgLine(` ${vd.start} more above `, maxWidth, colors.bg, colors.autocompleteMoreIndicator)}</Text>}
      {vd.cmds.map((cmd, idx) => {
        const actualIdx = vd.start + idx;
        const isSelected = actualIdx === safeIndex;
        const prefix = isSelected ? '> ' : '  ';
        const cmdLine = `${prefix}/${cmd.name}${' '.repeat(Math.max(1, sigWidth - cmd.name.length))}${cmd.description}`;
        const truncated = truncateText(cmdLine, maxWidth);
        return (
          <React.Fragment key={`${actualIdx}-${cmd.name}`}>
            <Text>{isSelected ? colors.autocompleteSelectedBg(colors.autocompleteSelectedText(truncated.padEnd(maxWidth, ' '))) : bgLine(cmdLine, maxWidth, colors.bg, colors.autocompleteText)}</Text>
            {isSelected && showParameterInfo && cmd.parameters?.map((p) => {
              const paramLine = `    <${p.name}>${' '.repeat(Math.max(1, sigWidth - p.name.length - 2))}${p.description}`;
              return <Text key={p.name}>{colors.paramBg(colors.paramDescription(truncateText(paramLine, maxWidth).padEnd(maxWidth, ' ')))}</Text>;
            })}
          </React.Fragment>
        );
      })}
      {moreBelow && <Text>{bgLine(` ${commands.length - vd.end} more below `, maxWidth, colors.bg, colors.autocompleteMoreIndicator)}</Text>}
      <Text>{bgLine(footerText, maxWidth, colors.bg, colors.autocompleteFooterText)}</Text>
    </Box>
  );
};

export interface CommandAutocompleteProps {
  commands?: ISlashCommand[];
  parameterSuggestions?: string[];
  parameterName?: string;
  selectedIndex: number;
  maxVisible?: number;
  showParameterInfo?: boolean;
  selectedCommand?: ISlashCommand;
  theme: Theme;
  keyBindings: KeyBindingsConfig;
  onHeightCalculated?: (height: number) => void;
}

export const CommandAutocomplete: React.FC<CommandAutocompleteProps> = ({
  commands, parameterSuggestions, parameterName, selectedIndex, maxVisible = 5,
  showParameterInfo = false, selectedCommand: _selectedCommand, theme, keyBindings, onHeightCalculated,
}) => {
  const themeDefinition = getTheme(theme);
  const colors = useMemo(() => getThemeColors(themeDefinition), [themeDefinition]);
  const { width: terminalWidth } = useTerminalSize();
  const maxAllowedWidth = Math.max(30, terminalWidth - 4);
  const footerText = useMemo(() => buildFooterText(keyBindings), [keyBindings]);

  const isParameterMode = Boolean(parameterSuggestions?.length);
  const hasCommands = Boolean(commands?.length);

  const paramMaxWidth = useMemo(() => {
    if (!parameterSuggestions?.length) return 50;
    const lengths = [` ${parameterName || 'Parameter'} (${parameterSuggestions.length}) `.length, footerText.length, ...parameterSuggestions.map((s) => s.length + 4)];
    return Math.min(Math.max(...lengths, 50), maxAllowedWidth);
  }, [parameterSuggestions, parameterName, footerText, maxAllowedWidth]);

  const cmdMaxWidth = useMemo(() => {
    if (!commands?.length) return 50;
    const longestCmd = Math.max(...commands.map((c) => `  /${c.name} - ${c.description}`.length));
    return Math.min(Math.max(longestCmd, footerText.length, 50), maxAllowedWidth);
  }, [commands, footerText, maxAllowedWidth]);

  const height = useMemo(() => {
    if (isParameterMode && parameterSuggestions) {
      const visibleCount = Math.min(parameterSuggestions.length, maxVisible);
      return 2 + visibleCount + (parameterSuggestions.length > maxVisible ? 2 : 0);
    }
    if (hasCommands && commands) {
      const visibleCount = Math.min(commands.length, maxVisible);
      return 2 + visibleCount + (commands.length > maxVisible ? 2 : 0);
    }
    return 0;
  }, [isParameterMode, hasCommands, parameterSuggestions, commands, maxVisible]);

  useEffect(() => { onHeightCalculated?.(height); }, [onHeightCalculated, height]);

  if (!isParameterMode && !hasCommands) return null;

  if (isParameterMode && parameterSuggestions) {
    return <ParameterAutocomplete suggestions={parameterSuggestions} parameterName={parameterName || 'Parameter'} selectedIndex={selectedIndex} maxVisible={maxVisible} colors={colors} footerText={footerText} maxWidth={paramMaxWidth} />;
  }

  if (hasCommands && commands) {
    return <CommandListAutocomplete commands={commands} selectedIndex={selectedIndex} maxVisible={maxVisible} showParameterInfo={showParameterInfo} colors={colors} footerText={footerText} maxWidth={cmdMaxWidth} />;
  }

  return null;
};
