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

  // Agent status (for multi-agent views)
  statusIdle: typeof chalk;
  statusReasoning: typeof chalk;
  statusActing: typeof chalk;
  statusObserving: typeof chalk;
  statusInterrupted: typeof chalk;

  // UI Elements (additional)
  borderColor: typeof chalk;
  wizardTitle: typeof chalk;
  wizardAccent: typeof chalk;
  paramDescription: typeof chalk;

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
    borderColor?: string; // Raw hex color for borders
    wizardAccent?: string; // Raw hex color for wizard accents
    userMessageBg?: string; // Raw hex color for user message background
    commandBg?: string; // Raw hex color for command message background
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

// Initialize all themes from YAML dynamically
import { readFileSync } from 'fs';
import { parse as parseYAML } from 'yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseThemeJSON, ThemeJSON } from './theme-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load YAML theme files
const themeFiles = [
  'mimir.yml',
  'tokyo-night.yml',
  'dracula.yml',
  'catppuccin-mocha.yml',
  'catppuccin-latte.yml',
  'gruvbox-dark.yml',
  'gruvbox-light.yml',
  'dark.yml',
  'light.yml',
  'dark-colorblind.yml',
  'light-colorblind.yml',
  'dark-ansi.yml',
  'light-ansi.yml',
];

const themeDefinitions: Record<string, ThemeJSON> = {};

themeFiles.forEach((file) => {
  const filePath = join(__dirname, 'definitions', file);
  const yamlContent = readFileSync(filePath, 'utf-8');
  const themeData = parseYAML(yamlContent) as ThemeJSON;
  const themeName = file.replace('.yml', '');
  themeDefinitions[themeName] = themeData;
});

// Register all themes
Object.entries(themeDefinitions).forEach(([key, json]) => {
  registerTheme(key as Theme, parseThemeJSON(json));
});
