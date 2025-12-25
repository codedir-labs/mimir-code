/**
 * End-to-end integration tests for autocomplete with REAL implementations
 * Tests actual command registration, theme system, and parameter suggestions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlashCommandRegistry } from '../../src/core/SlashCommand.js';
import { ModeCommand } from '../../src/cli/commands/slashCommands/ModeCommand.js';
import { ThemeCommand } from '../../src/cli/commands/slashCommands/ThemeCommand.js';
import { ModelCommand } from '../../src/cli/commands/slashCommands/ModelCommand.js';
import { NewCommand } from '../../src/cli/commands/slashCommands/NewCommand.js';
import { HelpCommand } from '../../src/cli/commands/slashCommands/HelpCommand.js';
import { getAllThemes } from '../../src/config/themes/index.js';
import { SlashCommandParser } from '../../src/core/SlashCommandParser.js';

describe('Autocomplete - Real Implementation Integration', () => {
  let registry: SlashCommandRegistry;

  beforeEach(() => {
    registry = new SlashCommandRegistry();
    registry.register(new NewCommand());
    registry.register(new ModelCommand());
    registry.register(new ModeCommand());
    registry.register(new ThemeCommand());
    registry.register(new HelpCommand(registry));
  });

  describe('Command registration', () => {
    it('should register all 5 built-in commands', () => {
      const allCommands = registry.getAll();

      expect(allCommands).toHaveLength(5);

      const commandNames = allCommands.map((cmd) => cmd.name).sort();
      expect(commandNames).toEqual(['help', 'mode', 'model', 'new', 'theme']);
    });

    it('should return all 5 commands when searching with empty prefix', () => {
      const results = registry.search('');

      expect(results).toHaveLength(5);
      expect(results.map((cmd) => cmd.name).sort()).toEqual([
        'help',
        'mode',
        'model',
        'new',
        'theme',
      ]);
    });

    it('should filter commands correctly by prefix', () => {
      const mCommands = registry.search('m');
      expect(mCommands).toHaveLength(2);
      expect(mCommands.map((cmd) => cmd.name).sort()).toEqual(['mode', 'model']);

      const tCommands = registry.search('t');
      expect(tCommands).toHaveLength(1);
      expect(tCommands.map((cmd) => cmd.name)).toEqual(['theme']);

      const nCommands = registry.search('n');
      expect(nCommands).toHaveLength(1);
      expect(nCommands.map((cmd) => cmd.name)).toEqual(['new']);

      const hCommands = registry.search('h');
      expect(hCommands).toHaveLength(1);
      expect(hCommands.map((cmd) => cmd.name)).toEqual(['help']);
    });
  });

  describe('Mode command parameter autocomplete', () => {
    it('should return plan, act, and discuss suggestions', () => {
      const modeCmd = registry.get('mode');
      expect(modeCmd).toBeDefined();

      const suggestions = modeCmd!.getParameterSuggestions!(0, {});

      expect(suggestions).toHaveLength(3);
      expect(suggestions).toContain('plan');
      expect(suggestions).toContain('act');
      expect(suggestions).toContain('discuss');
      expect(suggestions).toEqual(['plan', 'act', 'discuss']);
    });

    it('should filter suggestions correctly', () => {
      const modeCmd = registry.get('mode');
      const allSuggestions = modeCmd!.getParameterSuggestions!(0, {});

      // Simulate filtering logic from InputBox
      const filterSuggestions = (partialValue: string) => {
        return partialValue
          ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue.toLowerCase()))
          : allSuggestions;
      };

      // Empty filter should return all
      expect(filterSuggestions('')).toEqual(['plan', 'act', 'discuss']);

      // Filter by 'p' should return only 'plan'
      expect(filterSuggestions('p')).toEqual(['plan']);

      // Filter by 'a' should return only 'act'
      expect(filterSuggestions('a')).toEqual(['act']);

      // Filter by 'd' should return only 'discuss'
      expect(filterSuggestions('d')).toEqual(['discuss']);

      // Filter by 'pl' should return only 'plan'
      expect(filterSuggestions('pl')).toEqual(['plan']);
    });
  });

  describe('Theme command parameter autocomplete', () => {
    it('should have mimir theme in getAllThemes()', () => {
      const themes = getAllThemes();

      console.log('All themes:', themes);

      expect(themes).toContain('mimir');
      expect(themes).toHaveLength(7); // mimir, dark, light, dark-colorblind, light-colorblind, dark-ansi, light-ansi
    });

    it('should return all themes including mimir from ThemeCommand', () => {
      const themeCmd = registry.get('theme');
      expect(themeCmd).toBeDefined();

      const suggestions = themeCmd!.getParameterSuggestions!(0, {});

      console.log('Theme suggestions:', suggestions);

      expect(suggestions).toContain('mimir');
      expect(suggestions).toHaveLength(7);
      expect(suggestions).toEqual(
        expect.arrayContaining([
          'mimir',
          'dark',
          'light',
          'dark-colorblind',
          'light-colorblind',
          'dark-ansi',
          'light-ansi',
        ])
      );
    });

    it('should filter theme suggestions correctly', () => {
      const themeCmd = registry.get('theme');
      const allSuggestions = themeCmd!.getParameterSuggestions!(0, {});

      // Simulate filtering logic from InputBox
      const filterSuggestions = (partialValue: string) => {
        return partialValue
          ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue.toLowerCase()))
          : allSuggestions;
      };

      // Empty filter should return all (including mimir)
      const emptyFilter = filterSuggestions('');
      expect(emptyFilter).toContain('mimir');
      expect(emptyFilter).toHaveLength(7);

      // Filter by 'm' should return only 'mimir'
      expect(filterSuggestions('m')).toEqual(['mimir']);

      // Filter by 'mi' should return only 'mimir'
      expect(filterSuggestions('mi')).toEqual(['mimir']);

      // Filter by 'd' should return dark themes
      const darkThemes = filterSuggestions('d');
      expect(darkThemes).toContain('dark');
      expect(darkThemes).toContain('dark-colorblind');
      expect(darkThemes).toContain('dark-ansi');
      expect(darkThemes).toHaveLength(3);

      // Filter by 'l' should return light themes
      const lightThemes = filterSuggestions('l');
      expect(lightThemes).toContain('light');
      expect(lightThemes).toContain('light-colorblind');
      expect(lightThemes).toContain('light-ansi');
      expect(lightThemes).toHaveLength(3);
    });
  });

  describe('SlashCommandParser integration', () => {
    it('should parse /mode command correctly', () => {
      const result = SlashCommandParser.parse('/mode');
      expect(result.isCommand).toBe(true);
      expect(result.commandName).toBe('mode');
      expect(result.args).toEqual([]);
    });

    it('should parse /mode with space correctly', () => {
      const result = SlashCommandParser.parse('/mode ');
      expect(result.isCommand).toBe(true);
      expect(result.commandName).toBe('mode');
      expect(result.rawArgs).toBe('');
    });

    it('should parse /mode plan correctly', () => {
      const result = SlashCommandParser.parse('/mode plan');
      expect(result.isCommand).toBe(true);
      expect(result.commandName).toBe('mode');
      expect(result.args).toEqual(['plan']);
      expect(result.rawArgs).toBe('plan');
    });

    it('should extract partial command name correctly', () => {
      expect(SlashCommandParser.getPartialCommandName('/')).toBe('');
      expect(SlashCommandParser.getPartialCommandName('/m')).toBe('m');
      expect(SlashCommandParser.getPartialCommandName('/mod')).toBe('mod');
      expect(SlashCommandParser.getPartialCommandName('/mode')).toBe('mode');
      expect(SlashCommandParser.getPartialCommandName('/mode ')).toBe('mode');
    });
  });

  describe('Simulated InputBox autocomplete flow', () => {
    it('should show all commands when user types /', () => {
      const input = '/';
      const partialName = SlashCommandParser.getPartialCommandName(input);

      expect(partialName).toBe('');

      const matches = registry.search(partialName!);

      expect(matches).toHaveLength(5);
      expect(matches.map((cmd) => cmd.name).sort()).toEqual([
        'help',
        'mode',
        'model',
        'new',
        'theme',
      ]);
    });

    it('should filter to mode/model when user types /m', () => {
      const input = '/m';
      const partialName = SlashCommandParser.getPartialCommandName(input);

      expect(partialName).toBe('m');

      const matches = registry.search(partialName!);

      expect(matches).toHaveLength(2);
      expect(matches.map((cmd) => cmd.name).sort()).toEqual(['mode', 'model']);
    });

    it('should show parameter suggestions when user types /mode ', () => {
      const input = '/mode ';
      const parsed = SlashCommandParser.parse(input);

      expect(parsed.isCommand).toBe(true);
      expect(parsed.commandName).toBe('mode');
      expect(input.includes(' ')).toBe(true);

      const command = registry.get(parsed.commandName!);
      expect(command).toBeDefined();
      expect(command!.getParameterSuggestions).toBeDefined();

      // Simulate InputBox logic for parameter mode
      const currentInput = parsed.rawArgs || '';
      const trimmedArgs = currentInput.trim();
      const endsWithSpace =
        currentInput.length > 0 && currentInput[currentInput.length - 1] === ' ';
      const parts = trimmedArgs ? trimmedArgs.split(/\s+/).filter((a) => a.length > 0) : [];

      let paramIndex: number;
      let partialValue: string;

      if (endsWithSpace || parts.length === 0) {
        paramIndex = parts.length;
        partialValue = '';
      } else {
        paramIndex = parts.length - 1;
        partialValue = parts[parts.length - 1].toLowerCase();
      }

      const allSuggestions = command!.getParameterSuggestions!(paramIndex, {});
      const filteredSuggestions = partialValue
        ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
        : allSuggestions;

      expect(filteredSuggestions).toHaveLength(3);
      expect(filteredSuggestions).toContain('plan');
      expect(filteredSuggestions).toContain('act');
      expect(filteredSuggestions).toContain('discuss');
    });

    it('should filter parameter suggestions when user types /mode p', () => {
      const input = '/mode p';
      const parsed = SlashCommandParser.parse(input);

      const command = registry.get(parsed.commandName!);
      const currentInput = parsed.rawArgs || '';
      const trimmedArgs = currentInput.trim();
      const endsWithSpace =
        currentInput.length > 0 && currentInput[currentInput.length - 1] === ' ';
      const parts = trimmedArgs ? trimmedArgs.split(/\s+/).filter((a) => a.length > 0) : [];

      let paramIndex: number;
      let partialValue: string;

      if (endsWithSpace || parts.length === 0) {
        paramIndex = parts.length;
        partialValue = '';
      } else {
        paramIndex = parts.length - 1;
        partialValue = parts[parts.length - 1].toLowerCase();
      }

      const allSuggestions = command!.getParameterSuggestions!(paramIndex, {});
      const filteredSuggestions = partialValue
        ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
        : allSuggestions;

      expect(filteredSuggestions).toHaveLength(1);
      expect(filteredSuggestions).toContain('plan');
    });

    it('should show theme suggestions when user types /theme ', () => {
      const input = '/theme ';
      const parsed = SlashCommandParser.parse(input);

      const command = registry.get(parsed.commandName!);
      const currentInput = parsed.rawArgs || '';
      const trimmedArgs = currentInput.trim();
      const endsWithSpace =
        currentInput.length > 0 && currentInput[currentInput.length - 1] === ' ';
      const parts = trimmedArgs ? trimmedArgs.split(/\s+/).filter((a) => a.length > 0) : [];

      let paramIndex: number;
      let partialValue: string;

      if (endsWithSpace || parts.length === 0) {
        paramIndex = parts.length;
        partialValue = '';
      } else {
        paramIndex = parts.length - 1;
        partialValue = parts[parts.length - 1].toLowerCase();
      }

      const allSuggestions = command!.getParameterSuggestions!(paramIndex, {});
      const filteredSuggestions = partialValue
        ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
        : allSuggestions;

      console.log('Theme suggestions for "/theme ":', filteredSuggestions);

      expect(filteredSuggestions).toHaveLength(7);
      expect(filteredSuggestions).toContain('mimir');
      expect(filteredSuggestions).toContain('dark');
      expect(filteredSuggestions).toContain('light');
    });
  });
});
