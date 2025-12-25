/**
 * Theme registry and definitions
 */

import { Theme } from '../schemas.js';
import chalk from 'chalk';

export interface ThemeColors {
  // UI Elements
  headerBg: typeof chalk;
  headerText: typeof chalk;
  footerBg: typeof chalk;
  footerText: typeof chalk;
  inputPrompt: typeof chalk;
  inputText: typeof chalk;
  autocompleteBg: typeof chalk;

  // Autocomplete specific
  autocompleteText: typeof chalk;
  autocompleteSelectedBg: typeof chalk;
  autocompleteSelectedText: typeof chalk;
  autocompleteHeaderText: typeof chalk;
  autocompleteFooterText: typeof chalk;
  autocompleteMoreIndicator: typeof chalk;

  // Mode indicators
  modePlan: typeof chalk;
  modeAct: typeof chalk;
  modeDiscuss: typeof chalk;

  // Message roles
  userMessage: typeof chalk;
  assistantMessage: typeof chalk;
  systemMessage: typeof chalk;

  // Syntax highlighting
  keyword: typeof chalk;
  string: typeof chalk;
  number: typeof chalk;
  comment: typeof chalk;
  function: typeof chalk;
  variable: typeof chalk;

  // Status indicators
  success: typeof chalk;
  warning: typeof chalk;
  error: typeof chalk;
  info: typeof chalk;

  // Diff colors
  diffAddLine: typeof chalk;
  diffRemoveLine: typeof chalk;
}

export interface ThemeDefinition {
  name: string;
  colors: ThemeColors;
  supportsFullColor: boolean; // true for 24-bit, false for ANSI-only
  rawColors: {
    autocompleteBg?: string; // Raw hex color for components that need it
    autocompleteSelectedBg?: string; // Raw hex color for selected autocomplete item
  };
}

// Theme registry
const themes = new Map<Theme, ThemeDefinition>();

export function registerTheme(theme: Theme, definition: ThemeDefinition): void {
  themes.set(theme, definition);
}

export function getTheme(theme: Theme): ThemeDefinition {
  const definition = themes.get(theme);
  if (!definition) {
    throw new Error(`Theme ${theme} not found`);
  }
  return definition;
}

export function getAllThemes(): Theme[] {
  return Array.from(themes.keys());
}

export function getThemeMetadata(theme: Theme): { name: string } {
  const definition = getTheme(theme);
  return {
    name: definition.name,
  };
}

// Initialize all themes from JSON dynamically
import { parseThemeJSON, ThemeJSON } from './theme-schema.js';
import mimirJSON from './definitions/mimir.json' assert { type: 'json' };
import darkJSON from './definitions/dark.json' assert { type: 'json' };
import lightJSON from './definitions/light.json' assert { type: 'json' };
import darkColorblindJSON from './definitions/dark-colorblind.json' assert { type: 'json' };
import lightColorblindJSON from './definitions/light-colorblind.json' assert { type: 'json' };
import darkAnsiJSON from './definitions/dark-ansi.json' assert { type: 'json' };
import lightAnsiJSON from './definitions/light-ansi.json' assert { type: 'json' };

// Map of theme key to JSON
const themeDefinitions: Record<string, ThemeJSON> = {
  mimir: mimirJSON as ThemeJSON,
  dark: darkJSON as ThemeJSON,
  light: lightJSON as ThemeJSON,
  'dark-colorblind': darkColorblindJSON as ThemeJSON,
  'light-colorblind': lightColorblindJSON as ThemeJSON,
  'dark-ansi': darkAnsiJSON as ThemeJSON,
  'light-ansi': lightAnsiJSON as ThemeJSON,
};

// Register all themes
Object.entries(themeDefinitions).forEach(([key, json]) => {
  registerTheme(key as Theme, parseThemeJSON(json));
});
