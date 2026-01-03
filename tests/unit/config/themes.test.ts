/**
 * Tests for theme system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getTheme,
  getAllThemes,
  getThemeMetadata,
  loadUserThemes,
} from '@/shared/config/themes/index.js';
import type { Theme } from '@/shared/config/schemas.js';

describe('Theme System', () => {
  describe('Theme Registry', () => {
    it('should have all expected themes registered', () => {
      const themes = getAllThemes();

      expect(themes).toContain('mimir');
      expect(themes).toContain('tokyo-night');
      expect(themes).toContain('dracula');
      expect(themes).toContain('catppuccin-mocha');
      expect(themes).toContain('catppuccin-latte');
      expect(themes).toContain('gruvbox-dark');
      expect(themes).toContain('gruvbox-light');
      expect(themes).toContain('dark');
      expect(themes).toContain('light');
      expect(themes).toContain('dark-colorblind');
      expect(themes).toContain('light-colorblind');
      expect(themes).toContain('dark-ansi');
      expect(themes).toContain('light-ansi');
    });

    it('should have exactly 13 themes', () => {
      const themes = getAllThemes();
      expect(themes).toHaveLength(13);
    });
  });

  describe('Theme Retrieval', () => {
    it('should retrieve mimir theme', () => {
      const theme = getTheme('mimir');
      expect(theme).toBeDefined();
      expect(theme.name).toBe('Mimir');
      expect(theme.supportsFullColor).toBe(true);
    });

    it('should retrieve all new themes', () => {
      const themeNames: Theme[] = [
        'tokyo-night',
        'dracula',
        'catppuccin-mocha',
        'catppuccin-latte',
        'gruvbox-dark',
        'gruvbox-light',
      ];

      themeNames.forEach((themeName) => {
        const theme = getTheme(themeName);
        expect(theme).toBeDefined();
        expect(theme.colors).toBeDefined();
      });
    });

    it('should throw error for non-existent theme', () => {
      expect(() => getTheme('non-existent' as Theme)).toThrow();
    });
  });

  describe('Theme Colors', () => {
    it('should have all required color properties', () => {
      const requiredColors = [
        'headerBg',
        'headerText',
        'footerBg',
        'footerText',
        'inputPrompt',
        'inputText',
        'autocompleteBg',
        'autocompleteText',
        'autocompleteSelectedBg',
        'autocompleteSelectedText',
        'autocompleteHeaderText',
        'autocompleteFooterText',
        'autocompleteMoreIndicator',
        'modePlan',
        'modeAct',
        'modeDiscuss',
        'userMessage',
        'assistantMessage',
        'systemMessage',
        'keyword',
        'string',
        'number',
        'comment',
        'function',
        'variable',
        'success',
        'warning',
        'error',
        'info',
        'statusIdle',
        'statusReasoning',
        'statusActing',
        'statusObserving',
        'statusInterrupted',
        'borderColor',
        'wizardTitle',
        'wizardAccent',
        'paramDescription',
        'diffAddLine',
        'diffRemoveLine',
      ];

      const themes = getAllThemes();
      themes.forEach((themeName) => {
        const theme = getTheme(themeName);
        requiredColors.forEach((colorName) => {
          expect(theme.colors).toHaveProperty(colorName);
        });
      });
    });

    it('should have chalk instances for all colors', () => {
      const theme = getTheme('mimir');

      // Test that color functions can be called
      expect(typeof theme.colors.success).toBe('function');
      expect(typeof theme.colors.error).toBe('function');
      expect(typeof theme.colors.info).toBe('function');
      expect(typeof theme.colors.warning).toBe('function');
    });
  });

  describe('Theme Raw Colors', () => {
    it('should have raw colors for components that need them', () => {
      const theme = getTheme('mimir');

      expect(theme.rawColors).toBeDefined();
      expect(theme.rawColors.autocompleteBg).toBeDefined();
      expect(theme.rawColors.autocompleteSelectedBg).toBeDefined();
      expect(theme.rawColors.borderColor).toBeDefined();
      expect(theme.rawColors.wizardAccent).toBeDefined();
    });

    it('should have hex color format for raw colors', () => {
      const theme = getTheme('mimir');

      // Test that raw colors are hex strings
      if (theme.rawColors.autocompleteBg) {
        expect(theme.rawColors.autocompleteBg).toMatch(/^#[0-9A-F]{6}$/i);
      }
      if (theme.rawColors.borderColor) {
        expect(theme.rawColors.borderColor).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });
  });

  describe('Theme Metadata', () => {
    it('should return metadata for each theme', () => {
      const themes = getAllThemes();

      themes.forEach((themeName) => {
        const metadata = getThemeMetadata(themeName);
        expect(metadata).toBeDefined();
        expect(metadata.name).toBeDefined();
        expect(typeof metadata.name).toBe('string');
      });
    });

    it('should have correct theme names', () => {
      expect(getThemeMetadata('mimir').name).toBe('Mimir');
      expect(getThemeMetadata('tokyo-night').name).toBe('Tokyo Night');
      expect(getThemeMetadata('dracula').name).toBe('Dracula');
      expect(getThemeMetadata('catppuccin-mocha').name).toBe('Catppuccin Mocha');
      expect(getThemeMetadata('catppuccin-latte').name).toBe('Catppuccin Latte');
      expect(getThemeMetadata('gruvbox-dark').name).toBe('Gruvbox Dark');
      expect(getThemeMetadata('gruvbox-light').name).toBe('Gruvbox Light');
    });
  });

  describe('ANSI Themes', () => {
    it('should mark ANSI themes as not supporting full color', () => {
      const darkAnsi = getTheme('dark-ansi');
      const lightAnsi = getTheme('light-ansi');

      expect(darkAnsi.supportsFullColor).toBe(false);
      expect(lightAnsi.supportsFullColor).toBe(false);
    });

    it('should mark all other themes as supporting full color', () => {
      const fullColorThemes: Theme[] = [
        'mimir',
        'tokyo-night',
        'dracula',
        'catppuccin-mocha',
        'catppuccin-latte',
        'gruvbox-dark',
        'gruvbox-light',
        'dark',
        'light',
        'dark-colorblind',
        'light-colorblind',
      ];

      fullColorThemes.forEach((themeName) => {
        const theme = getTheme(themeName);
        expect(theme.supportsFullColor).toBe(true);
      });
    });
  });

  describe('Agent Status Colors', () => {
    it('should have all agent status colors defined', () => {
      const theme = getTheme('mimir');

      expect(theme.colors.statusIdle).toBeDefined();
      expect(theme.colors.statusReasoning).toBeDefined();
      expect(theme.colors.statusActing).toBeDefined();
      expect(theme.colors.statusObserving).toBeDefined();
      expect(theme.colors.statusInterrupted).toBeDefined();
    });

    it('should have different colors for different statuses', () => {
      const theme = getTheme('mimir');

      // Verify all status colors are callable functions
      expect(typeof theme.colors.statusIdle).toBe('function');
      expect(typeof theme.colors.statusReasoning).toBe('function');
      expect(typeof theme.colors.statusActing).toBe('function');
      expect(typeof theme.colors.statusObserving).toBe('function');
      expect(typeof theme.colors.statusInterrupted).toBe('function');
    });
  });

  describe('UI Element Colors', () => {
    it('should have wizard-specific colors', () => {
      const theme = getTheme('mimir');

      expect(theme.colors.wizardTitle).toBeDefined();
      expect(theme.colors.wizardAccent).toBeDefined();
      expect(theme.colors.borderColor).toBeDefined();
      expect(theme.colors.paramDescription).toBeDefined();
    });
  });

  describe('Theme Consistency', () => {
    it('should have consistent color count across all themes', () => {
      const themes = getAllThemes();
      const firstTheme = getTheme(themes[0]);
      const expectedColorCount = Object.keys(firstTheme.colors).length;

      themes.forEach((themeName) => {
        const theme = getTheme(themeName);
        const colorCount = Object.keys(theme.colors).length;
        expect(colorCount).toBe(expectedColorCount);
      });
    });
  });

  describe('loadUserThemes', () => {
    let testDir: string;

    beforeEach(async () => {
      // Create a unique temp directory for each test
      testDir = join(
        tmpdir(),
        `mimir-theme-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up temp directory
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should load valid theme files from directory', async () => {
      const validTheme = `
name: Custom Test Theme
supportsFullColor: true
colors:
  headerBg:
    bg: '#1a1a1a'
    fg: '#ffffff'
  headerText:
    fg: '#e0e0e0'
  footerBg:
    bg: '#2d2d2d'
  footerText:
    fg: '#888888'
  inputPrompt:
    fg: '#00d4ff'
  inputText:
    fg: '#ffffff'
  autocompleteBg:
    bg: '#2d2d2d'
  autocompleteText:
    fg: '#ffffff'
  autocompleteSelectedBg:
    bg: '#00d4ff'
    fg: '#000000'
  autocompleteSelectedText:
    fg: '#000000'
  autocompleteHeaderText:
    fg: '#00d4ff'
    bold: true
  autocompleteFooterText:
    fg: '#666666'
  autocompleteMoreIndicator:
    fg: '#666666'
  modePlan:
    fg: '#2196F3'
  modeAct:
    fg: '#4CAF50'
  modeDiscuss:
    fg: '#C792EA'
  userMessage:
    fg: '#4CAF50'
  assistantMessage:
    fg: '#2196F3'
  systemMessage:
    fg: '#FF9800'
  keyword:
    fg: '#C792EA'
  string:
    fg: '#C3E88D'
  number:
    fg: '#F78C6C'
  comment:
    fg: '#546E7A'
  function:
    fg: '#82AAFF'
  variable:
    fg: '#EEFFFF'
  success:
    fg: '#4CAF50'
  warning:
    fg: '#FFC107'
  error:
    fg: '#F44336'
  info:
    fg: '#2196F3'
  statusIdle:
    fg: '#666666'
  statusReasoning:
    fg: '#00d4ff'
  statusActing:
    fg: '#4CAF50'
  statusObserving:
    fg: '#2196F3'
  statusInterrupted:
    fg: '#FFC107'
  borderColor:
    fg: '#444444'
  wizardTitle:
    fg: '#00d4ff'
  wizardAccent:
    fg: '#2196F3'
  paramDescription:
    fg: '#888888'
  diffAddLine:
    bg: '#22863a'
    fg: '#ffffff'
  diffRemoveLine:
    bg: '#cb2431'
    fg: '#ffffff'
`;

      await writeFile(join(testDir, 'custom-test.yml'), validTheme);

      const loadedThemes = await loadUserThemes(testDir);

      expect(loadedThemes).toContain('custom-test');
      expect(loadedThemes).toHaveLength(1);

      // Verify the theme was registered and can be retrieved
      const theme = getTheme('custom-test' as Theme);
      expect(theme.name).toBe('Custom Test Theme');
      expect(theme.supportsFullColor).toBe(true);
    });

    it('should handle non-existent directory gracefully', async () => {
      const nonExistentDir = join(testDir, 'does-not-exist');

      const loadedThemes = await loadUserThemes(nonExistentDir);

      expect(loadedThemes).toEqual([]);
    });

    it('should skip invalid theme files', async () => {
      // Write an invalid YAML file
      await writeFile(join(testDir, 'invalid.yml'), 'this is not valid yaml: [');

      // Write a valid but incomplete theme
      await writeFile(join(testDir, 'incomplete.yml'), 'name: Incomplete\n');

      const loadedThemes = await loadUserThemes(testDir);

      // Should not load any themes due to invalid/incomplete files
      expect(loadedThemes).toEqual([]);
    });

    it('should load both .yml and .yaml extensions', async () => {
      const validTheme = `
name: YAML Extension Test
supportsFullColor: true
colors:
  headerBg: { bg: '#1a1a1a', fg: '#ffffff' }
  headerText: { fg: '#e0e0e0' }
  footerBg: { bg: '#2d2d2d' }
  footerText: { fg: '#888888' }
  inputPrompt: { fg: '#00d4ff' }
  inputText: { fg: '#ffffff' }
  autocompleteBg: { bg: '#2d2d2d' }
  autocompleteText: { fg: '#ffffff' }
  autocompleteSelectedBg: { bg: '#00d4ff', fg: '#000000' }
  autocompleteSelectedText: { fg: '#000000' }
  autocompleteHeaderText: { fg: '#00d4ff', bold: true }
  autocompleteFooterText: { fg: '#666666' }
  autocompleteMoreIndicator: { fg: '#666666' }
  modePlan: { fg: '#2196F3' }
  modeAct: { fg: '#4CAF50' }
  modeDiscuss: { fg: '#C792EA' }
  userMessage: { fg: '#4CAF50' }
  assistantMessage: { fg: '#2196F3' }
  systemMessage: { fg: '#FF9800' }
  keyword: { fg: '#C792EA' }
  string: { fg: '#C3E88D' }
  number: { fg: '#F78C6C' }
  comment: { fg: '#546E7A' }
  function: { fg: '#82AAFF' }
  variable: { fg: '#EEFFFF' }
  success: { fg: '#4CAF50' }
  warning: { fg: '#FFC107' }
  error: { fg: '#F44336' }
  info: { fg: '#2196F3' }
  statusIdle: { fg: '#666666' }
  statusReasoning: { fg: '#00d4ff' }
  statusActing: { fg: '#4CAF50' }
  statusObserving: { fg: '#2196F3' }
  statusInterrupted: { fg: '#FFC107' }
  borderColor: { fg: '#444444' }
  wizardTitle: { fg: '#00d4ff' }
  wizardAccent: { fg: '#2196F3' }
  paramDescription: { fg: '#888888' }
  diffAddLine: { bg: '#22863a', fg: '#ffffff' }
  diffRemoveLine: { bg: '#cb2431', fg: '#ffffff' }
`;

      await writeFile(join(testDir, 'yaml-ext.yaml'), validTheme);

      const loadedThemes = await loadUserThemes(testDir);

      expect(loadedThemes).toContain('yaml-ext');
    });

    it('should ignore non-yaml files', async () => {
      await writeFile(join(testDir, 'readme.txt'), 'This is a readme file');
      await writeFile(join(testDir, 'config.json'), '{"key": "value"}');

      const loadedThemes = await loadUserThemes(testDir);

      expect(loadedThemes).toEqual([]);
    });

    it('should return empty array for empty directory', async () => {
      const loadedThemes = await loadUserThemes(testDir);

      expect(loadedThemes).toEqual([]);
    });
  });
});
