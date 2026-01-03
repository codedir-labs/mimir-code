/**
 * Render components for CommandAutocomplete
 * Extracted to reduce component complexity
 */

import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import type { ISlashCommand } from '@/features/chat/slash-commands/SlashCommand.js';

/** Chalk instance that can be called as a function */
type ChalkCallable = (s: string) => string;

export interface AutocompleteTheme {
  bg: ChalkCallable;
  autocompleteText: (s: string) => string;
  autocompleteSelectedBg: ChalkCallable;
  autocompleteSelectedText: (s: string) => string;
  autocompleteHeaderText: (s: string) => string;
  autocompleteFooterText: (s: string) => string;
  autocompleteMoreIndicator: (s: string) => string;
  paramBg: ChalkCallable;
  paramDescription: (s: string) => string;
}

/**
 * Strip ANSI codes and truncate text with ellipsis
 */
export function truncateText(text: string, maxLen: number): string {
  // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
  const stripped = text.replace(/\x1B\[[0-9;]*m/g, '');
  if (stripped.length <= maxLen) return stripped;
  return stripped.slice(0, maxLen - 3) + '...';
}

/**
 * Create full-width background line
 */
export function bgLine(
  content: string,
  width: number,
  bg: ChalkCallable,
  colorFn: (s: string) => string
): string {
  const truncated = truncateText(content, width);
  const padding = Math.max(0, width - truncated.length);
  return bg(colorFn(truncated + ' '.repeat(padding)));
}

/**
 * Render parameter autocomplete mode
 */
export const ParameterAutocomplete: React.FC<{
  parameterName: string | undefined;
  paramSuggestions: string[];
  visibleSuggestions: string[];
  startIndex: number;
  selectedIndex: number;
  moreAbove: boolean;
  moreBelow: boolean;
  moreAboveCount: number;
  moreBelowCount: number;
  maxWidth: number;
  footerText: string;
  theme: AutocompleteTheme;
}> = ({
  parameterName,
  paramSuggestions,
  visibleSuggestions,
  startIndex,
  selectedIndex,
  moreAbove,
  moreBelow,
  moreAboveCount,
  moreBelowCount,
  maxWidth,
  footerText,
  theme,
}) => {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>
        {bgLine(
          ` ${parameterName ?? 'Parameter'} (${paramSuggestions.length}) `,
          maxWidth,
          theme.bg,
          theme.autocompleteHeaderText
        )}
      </Text>
      {moreAbove && (
        <Text>
          {bgLine(` ▲ ${moreAboveCount} more above `, maxWidth, theme.bg, theme.autocompleteMoreIndicator)}
        </Text>
      )}
      {visibleSuggestions.map((suggestion, idx) => {
        const actualIndex = startIndex + idx;
        const isSelected = actualIndex === selectedIndex;
        const prefix = isSelected ? '> ' : '  ';
        const content = `${prefix}${suggestion}`;

        return (
          <Text key={`${actualIndex}-${suggestion}`}>
            {isSelected
              ? theme.autocompleteSelectedBg(
                  theme.autocompleteSelectedText(truncateText(content, maxWidth).padEnd(maxWidth, ' '))
                )
              : bgLine(content, maxWidth, theme.bg, theme.autocompleteText)}
          </Text>
        );
      })}
      {moreBelow && (
        <Text>
          {bgLine(` ▼ ${moreBelowCount} more below `, maxWidth, theme.bg, theme.autocompleteMoreIndicator)}
        </Text>
      )}
      <Text>{bgLine(footerText, maxWidth, theme.bg, theme.autocompleteFooterText)}</Text>
    </Box>
  );
};

/**
 * Render command autocomplete mode
 */
export const CommandAutocompleteRender: React.FC<{
  commands: ISlashCommand[];
  visibleCommands: ISlashCommand[];
  startIndex: number;
  selectedIndex: number;
  moreAbove: boolean;
  moreBelow: boolean;
  moreAboveCount: number;
  moreBelowCount: number;
  maxWidth: number;
  footerText: string;
  showParameterInfo: boolean;
  theme: AutocompleteTheme;
}> = ({
  commands,
  visibleCommands,
  startIndex,
  selectedIndex,
  moreAbove,
  moreBelow,
  moreAboveCount,
  moreBelowCount,
  maxWidth,
  footerText,
  showParameterInfo,
  theme,
}) => {
  // Calculate consistent column width for all commands (table layout)
  const longestCmdName = Math.max(...visibleCommands.map((c) => c.name.length));
  const cmdColumnWidth = longestCmdName + 2;

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

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text>{bgLine(` Commands (${commands.length}) `, maxWidth, theme.bg, theme.autocompleteHeaderText)}</Text>
      {moreAbove && (
        <Text>
          {bgLine(` ▲ ${moreAboveCount} more above `, maxWidth, theme.bg, theme.autocompleteMoreIndicator)}
        </Text>
      )}
      {visibleCommands.map((command, idx) => {
        const actualIndex = startIndex + idx;
        const isSelected = actualIndex === selectedIndex;
        const prefix = isSelected ? '> ' : '  ';

        const cmdName = `${prefix}/${command.name}`;
        const cmdPadding = ' '.repeat(Math.max(1, signatureColumnWidth - cmdName.length + 2));
        const cmdLine = cmdName + cmdPadding + command.description;
        const cmdTruncated = truncateText(cmdLine, maxWidth);

        const descStartIdx = cmdName.length + cmdPadding.length;
        const cmdPart = cmdTruncated.substring(0, Math.min(descStartIdx, cmdTruncated.length));
        const descPart = cmdTruncated.substring(Math.min(descStartIdx, cmdTruncated.length));
        const rowPadding = ' '.repeat(Math.max(0, maxWidth - cmdTruncated.length));

        return (
          <React.Fragment key={`${actualIndex}-${command.name}`}>
            <Text>
              {isSelected
                ? theme.autocompleteSelectedBg(
                    theme.autocompleteSelectedText(cmdPart) +
                      theme.autocompleteSelectedText(chalk.dim(descPart)) +
                      theme.autocompleteSelectedText(rowPadding)
                  )
                : theme.bg(
                    theme.autocompleteText(cmdPart) +
                      theme.autocompleteText(chalk.dim(descPart)) +
                      theme.autocompleteText(rowPadding)
                  )}
            </Text>
            {isSelected &&
              showParameterInfo &&
              command.parameters &&
              command.parameters.length > 0 &&
              command.parameters.map((param) => {
                const paramSig = `    <${param.name}>`;
                const paramPadding = ' '.repeat(Math.max(1, signatureColumnWidth - paramSig.length + 2));
                const paramLine = paramSig + paramPadding + param.description;
                const paramTruncated = truncateText(paramLine, maxWidth);

                const paramDescStartIdx = paramSig.length + paramPadding.length;
                const paramSigPart = paramTruncated.substring(
                  0,
                  Math.min(paramDescStartIdx, paramTruncated.length)
                );
                const paramDescPart = paramTruncated.substring(
                  Math.min(paramDescStartIdx, paramTruncated.length)
                );
                const paramRowPadding = ' '.repeat(Math.max(0, maxWidth - paramTruncated.length));

                return (
                  <Text key={`${actualIndex}-${command.name}-${param.name}`}>
                    {theme.paramBg(
                      theme.autocompleteText(chalk.dim(paramSigPart)) +
                        theme.paramDescription(paramDescPart) +
                        theme.autocompleteText(paramRowPadding)
                    )}
                  </Text>
                );
              })}
          </React.Fragment>
        );
      })}
      {moreBelow && (
        <Text>
          {bgLine(` ▼ ${moreBelowCount} more below `, maxWidth, theme.bg, theme.autocompleteMoreIndicator)}
        </Text>
      )}
      <Text>{bgLine(footerText, maxWidth, theme.bg, theme.autocompleteFooterText)}</Text>
    </Box>
  );
};
