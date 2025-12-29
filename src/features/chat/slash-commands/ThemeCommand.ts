/**
 * /theme command
 * Lists available themes or changes to specified theme
 */

import {
  ISlashCommand,
  SlashCommandContext,
  SlashCommandResult,
  CommandParameter,
} from '@/features/chat/slash-commands/SlashCommand.js';
import { getAllThemes, getThemeMetadata } from '@/shared/config/themes/index.js';

export class ThemeCommand implements ISlashCommand {
  name = 'theme';
  description = 'Show available themes or change to specified theme';
  usage = '/theme [theme-name]';
  aliases = ['t'];

  parameters: CommandParameter[] = [
    {
      name: 'theme',
      description: 'Theme to switch to (leave empty to list all)',
      required: false,
      suggestions: getAllThemes(),
    },
  ];

  getParameterSuggestions(
    paramIndex: number,
    _context: SlashCommandContext,
    _currentArgs?: string[]
  ): string[] {
    if (paramIndex === 0) {
      return getAllThemes();
    }
    return [];
  }

  async execute(args: string[], context: SlashCommandContext): Promise<SlashCommandResult> {
    // If no arguments, list available themes
    if (args.length === 0) {
      const themes = getAllThemes();
      const themeList = themes
        .map((t, i) => {
          const meta = getThemeMetadata(t);
          return `  ${i + 1}. ${t} - ${meta.name}`;
        })
        .join('\n');

      const message = `Available themes:\n${themeList}\n\nUse /theme <name> to switch (e.g., /theme dark)`;

      return {
        success: true,
        action: 'send_prompt',
        prompt: message,
      };
    }

    // Change to specified theme
    const themeName = args[0]?.toLowerCase();
    if (!themeName) {
      return {
        success: false,
        error: 'Theme name is required',
      };
    }

    const themes = getAllThemes();
    type ThemeName =
      | 'mimir'
      | 'dark'
      | 'light'
      | 'dark-colorblind'
      | 'light-colorblind'
      | 'dark-ansi'
      | 'light-ansi';

    if (!themes.includes(themeName as ThemeName)) {
      return {
        success: false,
        error: `Theme '${themeName}' not found. Available: ${themes.join(', ')}`,
      };
    }

    // Request theme change
    if (context.requestThemeChange) {
      await context.requestThemeChange(themeName as ThemeName);
      return {
        success: true,
        action: 'send_prompt',
        prompt: `Theme changed to '${themeName}'`,
      };
    }

    return {
      success: false,
      error: 'Theme change not available in this context',
    };
  }
}
