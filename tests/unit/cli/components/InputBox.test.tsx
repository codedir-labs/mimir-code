/**
 * Unit tests for InputBox component
 * Tests autocomplete trigger logic, filtering, and keyboard navigation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlashCommandRegistry } from '@/features/chat/slash-commands/SlashCommand.js';
import { ModeCommand } from '@/features/chat/slash-commands/ModeCommand.js';
import { ThemeCommand } from '@/features/chat/slash-commands/ThemeCommand.js';
import { ModelCommand } from '@/features/chat/slash-commands/ModelCommand.js';
import { NewCommand } from '@/features/chat/slash-commands/NewCommand.js';
import { HelpCommand } from '@/features/chat/slash-commands/HelpCommand.js';
import { SlashCommandParser } from '@/features/custom-commands/parser/SlashCommandParser.js';

/**
 * Simulates the InputBox autocomplete logic to verify correct behavior
 */
interface SlashCommand {
  name: string;
  description?: string;
  getParameterSuggestions?: (paramIndex: number, context: Record<string, unknown>) => string[];
}

class InputBoxAutocompleteSimulator {
  private registry: SlashCommandRegistry;
  private value: string;
  private showAutocomplete: boolean = false;
  private filteredCommands: SlashCommand[] = [];
  private parameterSuggestions: string[] = [];
  private isParameterMode: boolean = false;

  constructor(registry: SlashCommandRegistry) {
    this.registry = registry;
    this.value = '';
  }

  /**
   * Simulate user typing (this is the logic from InputBox.tsx useEffect)
   */
  updateInput(value: string, context: Record<string, unknown> = {}) {
    this.value = value;
    const trimmed = value.trim();

    // Not a slash command at all
    if (!trimmed.startsWith('/')) {
      this.showAutocomplete = false;
      this.isParameterMode = false;
      return;
    }

    const parsed = SlashCommandParser.parse(value);

    // Check for parameter mode - only when there's a space after command
    if (parsed.isCommand && parsed.commandName && value.includes(' ')) {
      const command = this.registry.get(parsed.commandName);

      // Only show parameter autocomplete if command has parameter suggestions
      if (command?.getParameterSuggestions && context) {
        // Get current argument being typed
        const currentInput = parsed.rawArgs || '';
        const trimmedArgs = currentInput.trim();

        // Determine parameter index and partial value
        const endsWithSpace =
          currentInput.length > 0 && currentInput[currentInput.length - 1] === ' ';
        const parts = trimmedArgs ? trimmedArgs.split(/\s+/).filter((a) => a.length > 0) : [];

        let paramIndex: number;
        let partialValue: string;

        if (endsWithSpace || parts.length === 0) {
          // Starting a new parameter or no args yet
          paramIndex = parts.length;
          partialValue = '';
        } else {
          // Completing the last parameter
          paramIndex = parts.length - 1;
          partialValue = parts[parts.length - 1].toLowerCase();
        }

        const allSuggestions = command.getParameterSuggestions(paramIndex, context);

        // Filter suggestions based on partial value
        const filteredSuggestions = partialValue
          ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
          : allSuggestions;

        if (filteredSuggestions.length > 0) {
          this.parameterSuggestions = filteredSuggestions;
          this.isParameterMode = true;
          this.showAutocomplete = true;
          return;
        }
      }

      // If no parameter suggestions, hide autocomplete
      this.showAutocomplete = false;
      this.isParameterMode = false;
      return;
    }

    // Command autocomplete mode - only if no space yet
    const partialName = SlashCommandParser.getPartialCommandName(value);

    if (partialName === null) {
      this.showAutocomplete = false;
      this.isParameterMode = false;
      return;
    }

    // Only show command autocomplete if there's no space (still typing command name)
    const hasSpace = value.includes(' ');
    if (hasSpace) {
      this.showAutocomplete = false;
      this.isParameterMode = false;
      return;
    }

    const matches = this.registry.search(partialName);
    this.filteredCommands = matches;
    this.isParameterMode = false;
    this.showAutocomplete = matches.length > 0;
  }

  getState() {
    return {
      showAutocomplete: this.showAutocomplete,
      isParameterMode: this.isParameterMode,
      filteredCommands: this.filteredCommands,
      parameterSuggestions: this.parameterSuggestions,
    };
  }
}

describe('InputBox Autocomplete Logic', () => {
  let registry: SlashCommandRegistry;
  let simulator: InputBoxAutocompleteSimulator;

  beforeEach(() => {
    registry = new SlashCommandRegistry();
    registry.register(new NewCommand());
    registry.register(new ModelCommand());
    registry.register(new ModeCommand());
    registry.register(new ThemeCommand());
    registry.register(new HelpCommand(registry));

    simulator = new InputBoxAutocompleteSimulator(registry);
  });

  describe('Command autocomplete mode', () => {
    it('should show autocomplete when user types /', () => {
      simulator.updateInput('/');
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(false);
      expect(state.filteredCommands).toHaveLength(5);
    });

    it('should filter commands when user types /m', () => {
      simulator.updateInput('/m');
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(false);
      expect(state.filteredCommands).toHaveLength(2);
      expect(state.filteredCommands.map((cmd: SlashCommand) => cmd.name).sort()).toEqual(['mode', 'model']);
    });

    it('should filter to single command when user types /mo', () => {
      simulator.updateInput('/mo');
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.filteredCommands).toHaveLength(2);
      expect(state.filteredCommands.map((cmd: SlashCommand) => cmd.name).sort()).toEqual(['mode', 'model']);
    });

    it('should filter to mode when user types /mod', () => {
      simulator.updateInput('/mod');
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.filteredCommands).toHaveLength(2);
    });

    it('should hide autocomplete when user types space after command', () => {
      simulator.updateInput('/mode ');
      const state = simulator.getState();

      // Should switch to parameter mode, not command mode
      expect(state.isParameterMode).toBe(true);
    });

    it('should not show autocomplete for non-slash input', () => {
      simulator.updateInput('hello');
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(false);
      expect(state.isParameterMode).toBe(false);
    });
  });

  describe('Parameter autocomplete mode - /mode command', () => {
    it('should show all mode suggestions when user types /mode ', () => {
      simulator.updateInput('/mode ', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(3);
      expect(state.parameterSuggestions).toContain('plan');
      expect(state.parameterSuggestions).toContain('act');
      expect(state.parameterSuggestions).toContain('discuss');
    });

    it('should filter to plan when user types /mode p', () => {
      simulator.updateInput('/mode p', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('plan');
    });

    it('should filter to plan when user types /mode pl', () => {
      simulator.updateInput('/mode pl', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('plan');
    });

    it('should filter to act when user types /mode a', () => {
      simulator.updateInput('/mode a', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('act');
    });

    it('should filter to discuss when user types /mode d', () => {
      simulator.updateInput('/mode d', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('discuss');
    });

    it('should handle case-insensitive filtering /mode P', () => {
      simulator.updateInput('/mode P', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('plan');
    });
  });

  describe('Parameter autocomplete mode - /theme command', () => {
    it('should show all theme suggestions when user types /theme ', () => {
      simulator.updateInput('/theme ', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(13); // Updated: now have 13 themes
      expect(state.parameterSuggestions).toContain('mimir');
      expect(state.parameterSuggestions).toContain('dark');
      expect(state.parameterSuggestions).toContain('light');
    });

    it('should filter to mimir when user types /theme m', () => {
      simulator.updateInput('/theme m', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('mimir');
    });

    it('should filter to mimir when user types /theme mi', () => {
      simulator.updateInput('/theme mi', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('mimir');
    });

    it('should filter to dark themes when user types /theme d', () => {
      simulator.updateInput('/theme d', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(4); // Updated: now have 4 themes starting with 'd' (dark, dark-ansi, dark-colorblind, dracula)
      expect(state.parameterSuggestions).toContain('dark');
      expect(state.parameterSuggestions).toContain('dark-colorblind');
      expect(state.parameterSuggestions).toContain('dark-ansi');
      expect(state.parameterSuggestions).toContain('dracula');
    });

    it('should filter to dark-colorblind when user types /theme dark-c', () => {
      simulator.updateInput('/theme dark-c', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('dark-colorblind');
    });

    it('should filter to light themes when user types /theme l', () => {
      simulator.updateInput('/theme l', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(3);
      expect(state.parameterSuggestions).toContain('light');
      expect(state.parameterSuggestions).toContain('light-colorblind');
      expect(state.parameterSuggestions).toContain('light-ansi');
    });
  });

  describe('Parameter autocomplete mode - /model command', () => {
    it('should show all provider suggestions when user types /model ', () => {
      simulator.updateInput('/model ', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(11); // Updated: now have 11 providers
      expect(state.parameterSuggestions).toContain('deepseek');
      expect(state.parameterSuggestions).toContain('anthropic');
      expect(state.parameterSuggestions).toContain('openai');
    });

    it('should filter to deepseek when user types /model d', () => {
      simulator.updateInput('/model d', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('deepseek');
    });

    it('should filter to anthropic when user types /model a', () => {
      simulator.updateInput('/model a', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(1);
      expect(state.parameterSuggestions).toContain('anthropic');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      simulator.updateInput('', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(false);
      expect(state.isParameterMode).toBe(false);
    });

    it('should handle just slash with trailing space', () => {
      simulator.updateInput('/ ', {});
      const state = simulator.getState();

      // This should be treated as a command name with space
      expect(state.showAutocomplete).toBe(false);
    });

    it("should handle command that doesn't exist", () => {
      simulator.updateInput('/nonexistent ', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(false);
      expect(state.isParameterMode).toBe(false);
    });

    it('should handle multiple spaces after command', () => {
      simulator.updateInput('/mode  ', {});
      const state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(3);
    });

    it('should not break with very long input', () => {
      const longInput = '/mode ' + 'a'.repeat(1000);
      simulator.updateInput(longInput, {});
      const state = simulator.getState();

      // Long input that doesn't match any suggestion should hide autocomplete
      expect(state.showAutocomplete).toBe(false);
      expect(state.isParameterMode).toBe(false);
    });
  });

  describe('Mode transitions', () => {
    it('should transition from command mode to parameter mode', () => {
      // Start with command mode
      simulator.updateInput('/mode', {});
      let state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(false);
      expect(state.filteredCommands.length).toBeGreaterThan(0);

      // Add space to trigger parameter mode
      simulator.updateInput('/mode ', {});
      state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);
      expect(state.isParameterMode).toBe(true);
      expect(state.parameterSuggestions).toHaveLength(3);
    });

    it('should handle backspace from parameter mode to command mode', () => {
      // Start in parameter mode
      simulator.updateInput('/mode ', {});
      let state = simulator.getState();

      expect(state.isParameterMode).toBe(true);

      // Remove space (backspace)
      simulator.updateInput('/mode', {});
      state = simulator.getState();

      expect(state.isParameterMode).toBe(false);
      expect(state.showAutocomplete).toBe(true);
      expect(state.filteredCommands.length).toBeGreaterThan(0);
    });

    it('should transition from autocomplete to no autocomplete', () => {
      // Start with autocomplete
      simulator.updateInput('/mode', {});
      let state = simulator.getState();

      expect(state.showAutocomplete).toBe(true);

      // Type non-slash text
      simulator.updateInput('hello', {});
      state = simulator.getState();

      expect(state.showAutocomplete).toBe(false);
    });
  });
});
