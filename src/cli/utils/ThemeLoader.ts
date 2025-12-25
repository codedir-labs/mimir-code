/**
 * ThemeLoader - Load themes from .mimir/themes/ directory
 * Supports both default themes and user-created custom themes
 */

import { IFileSystem } from '../../platform/IFileSystem.js';
import { logger } from '../../utils/logger.js';
import path from 'path';

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  text: string;
  textDim: string;
  textMuted: string;
  background: string;
  backgroundLight: string;
  border: string;
  accent: string;
}

export interface Theme {
  name: string;
  displayName: string;
  description: string;
  colors: ThemeColors;
}

export class ThemeLoader {
  constructor(private fs: IFileSystem) {}

  /**
   * Load theme by name from .mimir/themes/ directory
   * Falls back to default Mimir theme if not found
   */
  async loadTheme(themeName: string, workspaceRoot?: string): Promise<Theme> {
    // Try workspace themes first
    if (workspaceRoot) {
      const workspaceTheme = await this.loadThemeFromDirectory(
        themeName,
        path.join(workspaceRoot, '.mimir', 'themes')
      );
      if (workspaceTheme) {
        return workspaceTheme;
      }
    }

    // Try global themes (~/.mimir/themes/)
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const globalTheme = await this.loadThemeFromDirectory(
        themeName,
        path.join(homeDir, '.mimir', 'themes')
      );
      if (globalTheme) {
        return globalTheme;
      }
    }

    // Fallback to default Mimir theme
    logger.warn(`Theme "${themeName}" not found, using default Mimir theme`);
    return this.getDefaultTheme();
  }

  /**
   * Load theme from a specific directory
   */
  private async loadThemeFromDirectory(
    themeName: string,
    directory: string
  ): Promise<Theme | null> {
    try {
      const themePath = path.join(directory, `${themeName}.json`);

      if (!(await this.fs.exists(themePath))) {
        return null;
      }

      const content = await this.fs.readFile(themePath);
      const theme = JSON.parse(content) as Theme;

      // Validate theme structure
      if (!this.isValidTheme(theme)) {
        logger.error('Invalid theme structure', { themePath });
        return null;
      }

      logger.info('Theme loaded', { name: theme.name, path: themePath });
      return theme;
    } catch (error) {
      logger.error('Failed to load theme', { themeName, directory, error });
      return null;
    }
  }

  /**
   * List all available themes from workspace and global directories
   */
  async listAvailableThemes(workspaceRoot?: string): Promise<Theme[]> {
    const themes: Theme[] = [];
    const seenNames = new Set<string>();

    // Load workspace themes (higher priority)
    if (workspaceRoot) {
      const workspaceThemes = await this.loadThemesFromDirectory(
        path.join(workspaceRoot, '.mimir', 'themes')
      );
      for (const theme of workspaceThemes) {
        themes.push(theme);
        seenNames.add(theme.name);
      }
    }

    // Load global themes (lower priority, skip duplicates)
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const globalThemes = await this.loadThemesFromDirectory(
        path.join(homeDir, '.mimir', 'themes')
      );
      for (const theme of globalThemes) {
        if (!seenNames.has(theme.name)) {
          themes.push(theme);
          seenNames.add(theme.name);
        }
      }
    }

    return themes;
  }

  /**
   * Load all themes from a directory
   */
  private async loadThemesFromDirectory(directory: string): Promise<Theme[]> {
    const themes: Theme[] = [];

    try {
      if (!(await this.fs.exists(directory))) {
        return themes;
      }

      const files = await this.fs.readdir(directory);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const themeName = file.replace('.json', '');
        const theme = await this.loadThemeFromDirectory(themeName, directory);

        if (theme) {
          themes.push(theme);
        }
      }
    } catch (error) {
      logger.error('Failed to load themes from directory', { directory, error });
    }

    return themes;
  }

  /**
   * Validate theme structure
   */
  private isValidTheme(theme: unknown): theme is Theme {
    if (typeof theme !== 'object' || theme === null) {
      return false;
    }

    const t = theme as Partial<Theme>;

    // Check required fields
    if (!t.name || !t.displayName || !t.colors) {
      return false;
    }

    // Check all required color fields
    const requiredColors: (keyof ThemeColors)[] = [
      'primary',
      'secondary',
      'success',
      'warning',
      'error',
      'info',
      'text',
      'textDim',
      'textMuted',
      'background',
      'backgroundLight',
      'border',
      'accent',
    ];

    for (const color of requiredColors) {
      if (!t.colors[color] || typeof t.colors[color] !== 'string') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get default Mimir theme (fallback)
   */
  private getDefaultTheme(): Theme {
    return {
      name: 'mimir',
      displayName: 'Mimir (Default)',
      description: 'Nordic-inspired theme with cold blue palette',
      colors: {
        primary: '#88C0D0',
        secondary: '#81A1C1',
        success: '#A3BE8C',
        warning: '#EBCB8B',
        error: '#BF616A',
        info: '#8FBCBB',
        text: '#ECEFF4',
        textDim: '#D8DEE9',
        textMuted: '#4C566A',
        background: '#2E3440',
        backgroundLight: '#3B4252',
        border: '#434C5E',
        accent: '#B48EAD',
      },
    };
  }

  /**
   * Get built-in theme names (for reference)
   */
  getBuiltInThemes(): string[] {
    return ['mimir', 'dark', 'light', 'dark-colorblind', 'light-colorblind'];
  }
}
