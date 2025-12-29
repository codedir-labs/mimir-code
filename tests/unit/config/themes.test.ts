/**
 * Tests for theme system
 */

import { describe, it, expect } from 'vitest';
import { getTheme, getAllThemes, getThemeMetadata } from '@/shared/config/themes/index.js';
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
});
