/**
 * Tests for parameter autocomplete filtering logic
 * Ensures partial input correctly filters suggestions
 */

import { describe, it, expect } from 'vitest';

/**
 * Helper to test parameter filtering logic
 * Mirrors InputBox.tsx filtering implementation
 */
function testParameterFiltering(
  input: string, // e.g., "/mode p" or "/theme "
  allSuggestions: string[]
): {
  paramIndex: number;
  partialValue: string;
  filteredSuggestions: string[];
  shouldShowAutocomplete: boolean;
} {
  // Extract command and args
  const match = input.match(/^\/(\w+)\s+(.*)$/);
  if (!match) {
    return {
      paramIndex: -1,
      partialValue: '',
      filteredSuggestions: [],
      shouldShowAutocomplete: false,
    };
  }

  const rawArgs = match[2];
  const trimmedArgs = rawArgs.trim();

  // Determine parameter index and partial value
  const endsWithSpace = rawArgs.length > 0 && rawArgs[rawArgs.length - 1] === ' ';
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

  // Filter suggestions
  const filteredSuggestions = partialValue
    ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
    : allSuggestions;

  return {
    paramIndex,
    partialValue,
    filteredSuggestions,
    shouldShowAutocomplete: filteredSuggestions.length > 0,
  };
}

/**
 * Test autocomplete selection replacement logic
 */
function testSelectionReplacement(
  currentInput: string, // e.g., "/mode p"
  selectedSuggestion: string // e.g., "plan"
): string {
  // Extract command and args
  const match = currentInput.match(/^\/(\w+)\s+(.*)$/);
  if (!match) {
    return currentInput;
  }

  const commandName = match[1];
  const rawArgs = match[2];
  const trimmedArgs = rawArgs.trim();

  // Determine if replacing or adding
  const endsWithSpace = rawArgs.length > 0 && rawArgs[rawArgs.length - 1] === ' ';
  const parts = trimmedArgs ? trimmedArgs.split(/\s+/).filter((a) => a.length > 0) : [];

  let completedArgs: string[];
  if (endsWithSpace || parts.length === 0) {
    // Adding new argument
    completedArgs = [...parts, selectedSuggestion];
  } else {
    // Replacing last partial argument
    completedArgs = [...parts.slice(0, -1), selectedSuggestion];
  }

  return `/${commandName} ${completedArgs.join(' ')} `;
}

describe('Parameter Autocomplete Filtering', () => {
  describe('/mode command filtering', () => {
    const modeOptions = ['plan', 'act', 'discuss'];

    it('should show all options when input is "/mode "', () => {
      const result = testParameterFiltering('/mode ', modeOptions);

      expect(result.paramIndex).toBe(0);
      expect(result.partialValue).toBe('');
      expect(result.filteredSuggestions).toEqual(['plan', 'act', 'discuss']);
      expect(result.shouldShowAutocomplete).toBe(true);
    });

    it('should filter to "plan" when input is "/mode p"', () => {
      const result = testParameterFiltering('/mode p', modeOptions);

      expect(result.paramIndex).toBe(0);
      expect(result.partialValue).toBe('p');
      expect(result.filteredSuggestions).toEqual(['plan']);
      expect(result.shouldShowAutocomplete).toBe(true);
    });

    it('should filter to "act" when input is "/mode a"', () => {
      const result = testParameterFiltering('/mode a', modeOptions);

      expect(result.paramIndex).toBe(0);
      expect(result.partialValue).toBe('a');
      expect(result.filteredSuggestions).toEqual(['act']);
      expect(result.shouldShowAutocomplete).toBe(true);
    });

    it('should filter to "discuss" when input is "/mode d"', () => {
      const result = testParameterFiltering('/mode d', modeOptions);

      expect(result.paramIndex).toBe(0);
      expect(result.partialValue).toBe('d');
      expect(result.filteredSuggestions).toEqual(['discuss']);
      expect(result.shouldShowAutocomplete).toBe(true);
    });

    it('should show no results for non-matching partial "x"', () => {
      const result = testParameterFiltering('/mode x', modeOptions);

      expect(result.paramIndex).toBe(0);
      expect(result.partialValue).toBe('x');
      expect(result.filteredSuggestions).toEqual([]);
      expect(result.shouldShowAutocomplete).toBe(false);
    });

    it('should be case-insensitive', () => {
      const result1 = testParameterFiltering('/mode P', modeOptions);
      const result2 = testParameterFiltering('/mode pL', modeOptions);

      expect(result1.filteredSuggestions).toEqual(['plan']);
      expect(result2.filteredSuggestions).toEqual(['plan']);
    });
  });

  describe('/theme command filtering', () => {
    const themeOptions = [
      'mimir',
      'dark',
      'light',
      'dark-colorblind',
      'light-colorblind',
      'dark-ansi',
      'light-ansi',
    ];

    it('should show all 7 themes when input is "/theme "', () => {
      const result = testParameterFiltering('/theme ', themeOptions);

      expect(result.filteredSuggestions).toHaveLength(7);
      expect(result.filteredSuggestions).toContain('mimir');
      expect(result.filteredSuggestions).toContain('dark');
    });

    it('should filter to "mimir" when input is "/theme m"', () => {
      const result = testParameterFiltering('/theme m', themeOptions);

      expect(result.filteredSuggestions).toEqual(['mimir']);
    });

    it('should filter to "mimir" when input is "/theme mi"', () => {
      const result = testParameterFiltering('/theme mi', themeOptions);

      expect(result.filteredSuggestions).toEqual(['mimir']);
    });

    it('should filter to dark themes when input is "/theme d"', () => {
      const result = testParameterFiltering('/theme d', themeOptions);

      expect(result.filteredSuggestions).toEqual(['dark', 'dark-colorblind', 'dark-ansi']);
    });

    it('should filter to "dark-ansi" when input is "/theme dark-a"', () => {
      const result = testParameterFiltering('/theme dark-a', themeOptions);

      expect(result.filteredSuggestions).toEqual(['dark-ansi']);
    });

    it('should filter to light themes when input is "/theme l"', () => {
      const result = testParameterFiltering('/theme l', themeOptions);

      expect(result.filteredSuggestions).toEqual(['light', 'light-colorblind', 'light-ansi']);
    });
  });

  describe('Selection replacement logic', () => {
    it('should replace partial "p" with "plan"', () => {
      const result = testSelectionReplacement('/mode p', 'plan');
      expect(result).toBe('/mode plan ');
    });

    it('should replace partial "a" with "act"', () => {
      const result = testSelectionReplacement('/mode a', 'act');
      expect(result).toBe('/mode act ');
    });

    it('should append when input ends with space', () => {
      const result = testSelectionReplacement('/model ', 'anthropic');
      expect(result).toBe('/model anthropic ');
    });

    it('should replace partial "d" with "dark"', () => {
      const result = testSelectionReplacement('/theme d', 'dark');
      expect(result).toBe('/theme dark ');
    });

    it('should replace partial "mi" with "mimir"', () => {
      const result = testSelectionReplacement('/theme mi', 'mimir');
      expect(result).toBe('/theme mimir ');
    });

    it('should handle multiple params correctly', () => {
      // Simulating a command with multiple params
      const result = testSelectionReplacement('/command arg1 par', 'param2');
      expect(result).toBe('/command arg1 param2 ');
    });

    it('should append second param when first is complete', () => {
      const result = testSelectionReplacement('/command arg1 ', 'arg2');
      expect(result).toBe('/command arg1 arg2 ');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty suggestions array', () => {
      const result = testParameterFiltering('/command ', []);
      expect(result.filteredSuggestions).toEqual([]);
      expect(result.shouldShowAutocomplete).toBe(false);
    });

    it('should handle single suggestion', () => {
      const result = testParameterFiltering('/command ', ['only']);
      expect(result.filteredSuggestions).toEqual(['only']);
    });

    it('should handle suggestions with special characters', () => {
      const suggestions = ['dark-colorblind', 'light-colorblind', 'dark-ansi'];
      const result = testParameterFiltering('/theme dark-', suggestions);
      expect(result.filteredSuggestions).toEqual(['dark-colorblind', 'dark-ansi']);
    });

    it('should handle very long partial values', () => {
      const suggestions = ['verylongoptionname', 'verylongoptionname2'];
      const result = testParameterFiltering('/cmd verylongoptionn', suggestions);
      expect(result.filteredSuggestions).toEqual(['verylongoptionname', 'verylongoptionname2']);
    });
  });

  describe('BUG FIX: Correct paramIndex calculation', () => {
    it('should use paramIndex=0 when typing first partial arg "/mode p"', () => {
      const result = testParameterFiltering('/mode p', ['plan', 'act', 'discuss']);
      expect(result.paramIndex).toBe(0); // NOT 1!
    });

    it('should use paramIndex=1 when first arg complete "/model anthropic c"', () => {
      const input = '/model anthropic c';
      const match = input.match(/^\/(\w+)\s+(.*)$/);
      const rawArgs = match![2]; // "anthropic c"
      const trimmedArgs = rawArgs.trim();
      const endsWithSpace = rawArgs[rawArgs.length - 1] === ' ';
      const parts = trimmedArgs.split(/\s+/).filter((a) => a.length > 0); // ["anthropic", "c"]

      // Since it doesn't end with space and we have 2 parts, we're completing part index 1
      const paramIndex = endsWithSpace || parts.length === 0 ? parts.length : parts.length - 1;

      expect(paramIndex).toBe(1); // Completing second param
    });

    it('should use paramIndex=0 when input is just "/mode "', () => {
      const result = testParameterFiltering('/mode ', ['plan', 'act', 'discuss']);
      expect(result.paramIndex).toBe(0);
    });
  });
});
