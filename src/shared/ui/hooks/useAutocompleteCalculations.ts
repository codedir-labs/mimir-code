/**
 * Hook for calculating autocomplete dimensions and visible items
 * Extracted from CommandAutocomplete to reduce component complexity
 */

import { useMemo } from 'react';
import type { ISlashCommand } from '@/features/chat/slash-commands/SlashCommand.js';

export interface VisibleParameterData {
  visibleSuggestions: string[];
  startIndex: number;
  endIndex: number;
}

export interface VisibleCommandData {
  visibleCommands: ISlashCommand[];
  startIndex: number;
  endIndex: number;
}

/**
 * Calculate parameter mode visible data
 */
export function useParameterVisibleData(
  paramSuggestions: string[],
  selectedIndex: number,
  maxVisible: number
): VisibleParameterData {
  const safeSelectedIndex = useMemo(() => {
    if (paramSuggestions.length === 0) return 0;
    return Math.max(0, Math.min(selectedIndex, paramSuggestions.length - 1));
  }, [selectedIndex, paramSuggestions.length]);

  return useMemo(() => {
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

    if (safeSelectedIndex < Math.floor(maxVisible / 2)) {
      startIndex = 0;
      endIndex = maxVisible;
    } else if (safeSelectedIndex >= paramSuggestions.length - Math.floor(maxVisible / 2)) {
      startIndex = paramSuggestions.length - maxVisible;
      endIndex = paramSuggestions.length;
    } else {
      startIndex = safeSelectedIndex - Math.floor(maxVisible / 2);
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
  }, [paramSuggestions, safeSelectedIndex, maxVisible]);
}

/**
 * Calculate command mode visible data
 */
export function useCommandVisibleData(
  commands: ISlashCommand[],
  selectedIndex: number,
  maxVisible: number,
  showParameterInfo: boolean
): VisibleCommandData {
  const safeSelectedIndex = useMemo(() => {
    if (commands.length === 0) return 0;
    return Math.max(0, Math.min(selectedIndex, commands.length - 1));
  }, [selectedIndex, commands.length]);

  return useMemo(() => {
    if (commands.length === 0) {
      return { visibleCommands: [], startIndex: 0, endIndex: 0 };
    }

    // Helper: count lines a command takes
    const countLines = (cmd: ISlashCommand | undefined, idx: number) => {
      if (!cmd) return 1;
      let lines = 1;
      if (showParameterInfo && idx === safeSelectedIndex && cmd.parameters) {
        lines += cmd.parameters.length;
      }
      return lines;
    };

    const totalLines = commands.reduce((sum, cmd, idx) => sum + countLines(cmd, idx), 0);

    if (totalLines <= maxVisible) {
      return {
        visibleCommands: commands,
        startIndex: 0,
        endIndex: commands.length,
      };
    }

    // Need to window - calculate visible range
    let startIndex = safeSelectedIndex;
    let endIndex = safeSelectedIndex + 1;
    let lineCount = countLines(commands[safeSelectedIndex], safeSelectedIndex);

    // Expand downward first
    while (endIndex < commands.length && lineCount < maxVisible) {
      const nextLines = countLines(commands[endIndex], endIndex);
      if (lineCount + nextLines > maxVisible) break;
      lineCount += nextLines;
      endIndex++;
    }

    // Then expand upward
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
}

/**
 * Calculate parameter mode height
 */
export function useParameterHeight(
  paramSuggestions: string[],
  visibleData: VisibleParameterData
): number {
  const moreAbove = visibleData.startIndex > 0;
  const moreBelow = visibleData.endIndex < paramSuggestions.length;

  return useMemo(() => {
    if (paramSuggestions.length === 0) return 0;
    let height = 1; // header
    if (moreAbove) height += 1;
    height += visibleData.visibleSuggestions.length;
    if (moreBelow) height += 1;
    height += 1; // footer
    return height;
  }, [paramSuggestions.length, moreAbove, visibleData.visibleSuggestions.length, moreBelow]);
}

/**
 * Calculate command mode height
 */
export function useCommandHeight(
  commands: ISlashCommand[],
  visibleData: VisibleCommandData,
  paramTooltipLines: number
): number {
  const moreAbove = visibleData.startIndex > 0;
  const moreBelow = visibleData.endIndex < commands.length;

  return useMemo(() => {
    if (commands.length === 0) return 0;
    let height = 1; // header
    if (moreAbove) height += 1;
    height += visibleData.visibleCommands.length;
    height += paramTooltipLines;
    if (moreBelow) height += 1;
    height += 1; // footer
    return height;
  }, [
    commands.length,
    moreAbove,
    visibleData.visibleCommands.length,
    paramTooltipLines,
    moreBelow,
  ]);
}

/**
 * Calculate max width for parameter mode
 */
export function useParameterMaxWidth(
  paramSuggestions: string[],
  parameterName: string | undefined,
  visibleData: VisibleParameterData,
  footerText: string,
  maxAllowedWidth: number
): number {
  const moreAbove = visibleData.startIndex > 0;
  const moreBelow = visibleData.endIndex < paramSuggestions.length;
  const moreAboveCount = visibleData.startIndex;
  const moreBelowCount = paramSuggestions.length - visibleData.endIndex;

  return useMemo(() => {
    if (paramSuggestions.length === 0) return 50;
    const header = ` ${parameterName ?? 'Parameter'} (${paramSuggestions.length}) `;
    const moreText = moreAbove ? ` ▲ ${moreAboveCount} more above ` : '';
    const moreBelowText = moreBelow ? ` ▼ ${moreBelowCount} more below ` : '';
    const items = visibleData.visibleSuggestions.map((s) => `  ${s}`);

    const lengths = [
      header.length,
      footerText.length,
      moreText.length,
      moreBelowText.length,
      ...items.map((i) => i.length),
    ];
    const idealWidth = Math.max(...lengths, 50);
    return Math.min(idealWidth, maxAllowedWidth);
  }, [
    parameterName,
    paramSuggestions.length,
    visibleData.visibleSuggestions,
    moreAbove,
    moreBelow,
    moreAboveCount,
    moreBelowCount,
    footerText,
    maxAllowedWidth,
  ]);
}

/**
 * Calculate max width for command mode
 */
export function useCommandMaxWidth(
  commands: ISlashCommand[],
  visibleData: VisibleCommandData,
  showParameterInfo: boolean,
  footerText: string,
  maxAllowedWidth: number
): number {
  const moreAbove = visibleData.startIndex > 0;
  const moreBelow = visibleData.endIndex < commands.length;
  const moreAboveCount = visibleData.startIndex;
  const moreBelowCount = commands.length - visibleData.endIndex;

  return useMemo(() => {
    if (commands.length === 0) return 50;
    const header = ` Commands (${commands.length}) `;
    const moreText = moreAbove ? ` ▲ ${moreAboveCount} more above ` : '';
    const moreBelowText = moreBelow ? ` ▼ ${moreBelowCount} more below ` : '';

    const cmdLengths = visibleData.visibleCommands.map((cmd) => {
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
    const idealWidth = Math.max(...lengths, 50);
    return Math.min(idealWidth, maxAllowedWidth);
  }, [
    commands.length,
    visibleData.visibleCommands,
    showParameterInfo,
    moreAbove,
    moreBelow,
    moreAboveCount,
    moreBelowCount,
    footerText,
    maxAllowedWidth,
  ]);
}
