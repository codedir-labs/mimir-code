/**
 * Theme JSON schema and parser
 * Converts JSON theme definitions to chalk-based themes
 */

import chalk from 'chalk';
import type { ThemeDefinition, ThemeColors } from './index.js';

export interface ThemeColorJSON {
  fg?: string; // Foreground color (hex)
  bg?: string; // Background color (hex)
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface ThemeJSON {
  name: string;
  supportsFullColor: boolean;
  colors: {
    // UI Elements
    headerBg: ThemeColorJSON;
    headerText: ThemeColorJSON;
    footerBg: ThemeColorJSON;
    footerText: ThemeColorJSON;
    inputPrompt: ThemeColorJSON;
    inputText: ThemeColorJSON;
    autocompleteBg: ThemeColorJSON;

    // Autocomplete specific
    autocompleteText: ThemeColorJSON;
    autocompleteSelectedBg: ThemeColorJSON;
    autocompleteSelectedText: ThemeColorJSON;
    autocompleteHeaderText: ThemeColorJSON;
    autocompleteFooterText: ThemeColorJSON;
    autocompleteMoreIndicator: ThemeColorJSON;

    // Mode indicators
    modePlan: ThemeColorJSON;
    modeAct: ThemeColorJSON;
    modeDiscuss: ThemeColorJSON;

    // Message roles
    userMessage: ThemeColorJSON;
    assistantMessage: ThemeColorJSON;
    systemMessage: ThemeColorJSON;

    // Syntax highlighting
    keyword: ThemeColorJSON;
    string: ThemeColorJSON;
    number: ThemeColorJSON;
    comment: ThemeColorJSON;
    function: ThemeColorJSON;
    variable: ThemeColorJSON;

    // Status indicators
    success: ThemeColorJSON;
    warning: ThemeColorJSON;
    error: ThemeColorJSON;
    info: ThemeColorJSON;

    // Diff colors
    diffAddLine: ThemeColorJSON;
    diffRemoveLine: ThemeColorJSON;
  };
}

/**
 * Parse a JSON theme color definition into a chalk instance
 */
function parseColor(color: ThemeColorJSON): typeof chalk {
  let result = chalk;

  if (color.bg) {
    result = result.bgHex(color.bg);
  }
  if (color.fg) {
    result = result.hex(color.fg);
  }
  if (color.bold) {
    result = result.bold;
  }
  if (color.dim) {
    result = result.dim;
  }
  if (color.italic) {
    result = result.italic;
  }
  if (color.underline) {
    result = result.underline;
  }

  return result;
}

/**
 * Convert a JSON theme definition to a ThemeDefinition
 */
export function parseThemeJSON(json: ThemeJSON): ThemeDefinition {
  const colors: ThemeColors = {
    headerBg: parseColor(json.colors.headerBg),
    headerText: parseColor(json.colors.headerText),
    footerBg: parseColor(json.colors.footerBg),
    footerText: parseColor(json.colors.footerText),
    inputPrompt: parseColor(json.colors.inputPrompt),
    inputText: parseColor(json.colors.inputText),
    autocompleteBg: parseColor(json.colors.autocompleteBg),

    autocompleteText: parseColor(json.colors.autocompleteText),
    autocompleteSelectedBg: parseColor(json.colors.autocompleteSelectedBg),
    autocompleteSelectedText: parseColor(json.colors.autocompleteSelectedText),
    autocompleteHeaderText: parseColor(json.colors.autocompleteHeaderText),
    autocompleteFooterText: parseColor(json.colors.autocompleteFooterText),
    autocompleteMoreIndicator: parseColor(json.colors.autocompleteMoreIndicator),

    modePlan: parseColor(json.colors.modePlan),
    modeAct: parseColor(json.colors.modeAct),
    modeDiscuss: parseColor(json.colors.modeDiscuss),

    userMessage: parseColor(json.colors.userMessage),
    assistantMessage: parseColor(json.colors.assistantMessage),
    systemMessage: parseColor(json.colors.systemMessage),

    keyword: parseColor(json.colors.keyword),
    string: parseColor(json.colors.string),
    number: parseColor(json.colors.number),
    comment: parseColor(json.colors.comment),
    function: parseColor(json.colors.function),
    variable: parseColor(json.colors.variable),

    success: parseColor(json.colors.success),
    warning: parseColor(json.colors.warning),
    error: parseColor(json.colors.error),
    info: parseColor(json.colors.info),

    diffAddLine: parseColor(json.colors.diffAddLine),
    diffRemoveLine: parseColor(json.colors.diffRemoveLine),
  };

  return {
    name: json.name,
    colors,
    supportsFullColor: json.supportsFullColor,
    rawColors: {
      autocompleteBg: json.colors.autocompleteBg.bg,
      autocompleteSelectedBg: json.colors.autocompleteSelectedBg.bg,
    },
  };
}
