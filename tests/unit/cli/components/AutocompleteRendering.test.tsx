/**
 * Tests for autocomplete UI rendering logic
 * Simulates EXACT rendering behavior including reverse() and index calculation
 */

import { describe, it, expect } from 'vitest';

/**
 * Simulates the exact rendering logic from CommandAutocomplete component
 */
function simulateRendering(
  items: string[],
  selectedIndex: number,
  maxVisible: number = 5
): {
  renderedItems: Array<{
    item: string;
    actualIndex: number;
    isSelected: boolean;
    visibleIdx: number;
  }>;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  visibleCount: number;
} {
  // Pagination calculation
  let startIndex: number;
  let endIndex: number;

  if (items.length <= maxVisible) {
    startIndex = 0;
    endIndex = items.length;
  } else {
    if (selectedIndex < Math.floor(maxVisible / 2)) {
      startIndex = 0;
      endIndex = maxVisible;
    } else if (selectedIndex >= items.length - Math.floor(maxVisible / 2)) {
      startIndex = items.length - maxVisible;
      endIndex = items.length;
    } else {
      startIndex = selectedIndex - Math.floor(maxVisible / 2);
      endIndex = startIndex + maxVisible;
    }

    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(items.length, endIndex);
  }

  const visibleSuggestions = items.slice(startIndex, endIndex);

  // Rendering logic - EXACTLY as in component
  const renderedItems = visibleSuggestions
    .slice()
    .reverse()
    .map((suggestion, idx) => {
      const visibleIdx = visibleSuggestions.length - 1 - idx;
      const actualIndex = startIndex + visibleIdx;
      const isSelected = actualIndex === selectedIndex;

      return {
        item: suggestion,
        actualIndex,
        isSelected,
        visibleIdx,
      };
    });

  return {
    renderedItems,
    startIndex,
    endIndex,
    totalItems: items.length,
    visibleCount: visibleSuggestions.length,
  };
}

describe('Autocomplete UI Rendering', () => {
  describe('Command rendering with maxVisible limit', () => {
    it('should render all 5 commands when maxVisible=5', () => {
      const commands = ['new', 'model', 'mode', 'theme', 'help'];
      const result = simulateRendering(commands, 0, 5);

      console.log('Commands rendering:', {
        totalItems: result.totalItems,
        visibleCount: result.visibleCount,
        startIndex: result.startIndex,
        endIndex: result.endIndex,
        renderedCount: result.renderedItems.length,
        renderedItems: result.renderedItems.map((r) => r.item),
      });

      expect(result.totalItems).toBe(5);
      expect(result.visibleCount).toBe(5);
      expect(result.renderedItems).toHaveLength(5);
      expect(result.renderedItems.map((r) => r.item)).toEqual([
        'help',
        'theme',
        'mode',
        'model',
        'new',
      ]);
    });

    it('should have exactly one selected item', () => {
      const commands = ['new', 'model', 'mode', 'theme', 'help'];
      const result = simulateRendering(commands, 0, 5);

      const selectedItems = result.renderedItems.filter((r) => r.isSelected);
      expect(selectedItems).toHaveLength(1);
      expect(selectedItems[0].actualIndex).toBe(0);
      expect(selectedItems[0].item).toBe('new'); // first item in original array
    });

    it('should render all items when selected index changes', () => {
      const commands = ['new', 'model', 'mode', 'theme', 'help'];

      for (let i = 0; i < commands.length; i++) {
        const result = simulateRendering(commands, i, 5);

        expect(result.renderedItems).toHaveLength(5);
        const selectedItems = result.renderedItems.filter((r) => r.isSelected);
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0].item).toBe(commands[i]);
      }
    });
  });

  describe('Filtered command rendering', () => {
    it('should render filtered result correctly', () => {
      // After filtering: ['plan']
      const filtered = ['plan'];
      const result = simulateRendering(filtered, 0, 5);

      console.log('Filtered rendering:', {
        totalItems: result.totalItems,
        visibleCount: result.visibleCount,
        renderedCount: result.renderedItems.length,
        renderedItems: result.renderedItems,
      });

      expect(result.totalItems).toBe(1);
      expect(result.visibleCount).toBe(1);
      expect(result.renderedItems).toHaveLength(1);
      expect(result.renderedItems[0].item).toBe('plan');
      expect(result.renderedItems[0].isSelected).toBe(true);
      expect(result.renderedItems[0].actualIndex).toBe(0);
    });

    it('should render all filtered items', () => {
      // /theme d -> filters to dark themes
      const filtered = ['dark', 'dark-colorblind', 'dark-ansi'];
      const result = simulateRendering(filtered, 0, 5);

      expect(result.renderedItems).toHaveLength(3);
      expect(result.renderedItems.map((r) => r.item)).toEqual([
        'dark-ansi',
        'dark-colorblind',
        'dark',
      ]);

      const selected = result.renderedItems.find((r) => r.isSelected);
      expect(selected).toBeDefined();
      expect(selected!.item).toBe('dark');
    });

    it('should handle filtering to 2 items', () => {
      const filtered = ['act', 'another'];
      const result = simulateRendering(filtered, 1, 5);

      expect(result.renderedItems).toHaveLength(2);
      expect(result.renderedItems.map((r) => r.item)).toEqual(['another', 'act']);

      const selected = result.renderedItems.find((r) => r.isSelected);
      expect(selected!.item).toBe('another');
      expect(selected!.actualIndex).toBe(1);
    });
  });

  describe('Navigation rendering consistency', () => {
    it('should never have undefined items', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

      for (let selectedIndex = 0; selectedIndex < items.length; selectedIndex++) {
        const result = simulateRendering(items, selectedIndex, 5);

        result.renderedItems.forEach((rendered, idx) => {
          expect(
            rendered.item,
            `Item at render index ${idx} should not be undefined`
          ).toBeDefined();
          expect(rendered.item, `Item at render index ${idx} should not be null`).not.toBeNull();
          expect(rendered.item, `Item at render index ${idx} should not be empty`).not.toBe('');
        });
      }
    });

    it('should have consistent actualIndex values', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const result = simulateRendering(items, 3, 5);

      // Collect all actualIndex values
      const actualIndexes = result.renderedItems.map((r) => r.actualIndex);

      // Should be consecutive
      const min = Math.min(...actualIndexes);
      const max = Math.max(...actualIndexes);
      expect(max - min).toBe(result.renderedItems.length - 1);

      // Should be in range [0, items.length)
      actualIndexes.forEach((idx) => {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(items.length);
      });
    });

    it('should map actualIndex to correct items', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const result = simulateRendering(items, 3, 5);

      result.renderedItems.forEach((rendered) => {
        // Verify that the rendered item matches the item at actualIndex in original array
        expect(rendered.item).toBe(items[rendered.actualIndex]);
      });
    });
  });

  describe('Edge cases causing rendering issues', () => {
    it('should handle single item', () => {
      const result = simulateRendering(['only'], 0, 5);

      expect(result.renderedItems).toHaveLength(1);
      expect(result.renderedItems[0].item).toBe('only');
      expect(result.renderedItems[0].isSelected).toBe(true);
    });

    it('should handle empty array', () => {
      const result = simulateRendering([], 0, 5);

      expect(result.renderedItems).toHaveLength(0);
    });

    it('should handle maxVisible=1', () => {
      const items = ['a', 'b', 'c'];
      const result = simulateRendering(items, 1, 1);

      expect(result.renderedItems).toHaveLength(1);
      expect(result.renderedItems[0].item).toBe('b');
      expect(result.renderedItems[0].isSelected).toBe(true);
    });

    it('should handle selecting last item', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = simulateRendering(items, 4, 5);

      expect(result.renderedItems).toHaveLength(5);
      const selected = result.renderedItems.find((r) => r.isSelected);
      expect(selected!.item).toBe('e');
    });
  });

  describe('Verify React key uniqueness', () => {
    it('should generate unique keys for all rendered items', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const result = simulateRendering(items, 2, 5);

      // Simulate key generation: `${actualIndex}-${item}`
      const keys = result.renderedItems.map((r) => `${r.actualIndex}-${r.item}`);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(keys.length); // All keys should be unique
    });

    it('should handle duplicate item names with unique keys', () => {
      // This shouldn't happen in real usage, but let's test it
      const items = ['plan', 'plan', 'act'];
      const result = simulateRendering(items, 0, 5);

      const keys = result.renderedItems.map((r) => `${r.actualIndex}-${r.item}`);
      const uniqueKeys = new Set(keys);

      // Even with duplicate names, actualIndex makes keys unique
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('Full navigation simulation', () => {
    it('should render correctly at every step of navigation', () => {
      const items = ['new', 'model', 'mode', 'theme', 'help'];
      const navigationLog: Array<{
        selectedIndex: number;
        selectedItem: string;
        renderedCount: number;
        allItemsPresent: boolean;
      }> = [];

      // Simulate navigating down through all items
      for (let i = 0; i < items.length; i++) {
        const result = simulateRendering(items, i, 5);

        const selectedItem = result.renderedItems.find((r) => r.isSelected);

        navigationLog.push({
          selectedIndex: i,
          selectedItem: selectedItem?.item || 'NONE',
          renderedCount: result.renderedItems.length,
          allItemsPresent: result.renderedItems.every((r) => r.item !== undefined),
        });

        // Assertions at each step
        expect(result.renderedItems).toHaveLength(5);
        expect(selectedItem).toBeDefined();
        expect(selectedItem!.item).toBe(items[i]);
        expect(result.renderedItems.every((r) => r.item !== undefined)).toBe(true);
      }

      console.log('Navigation log:', navigationLog);

      // Verify all steps rendered correctly
      expect(navigationLog.every((log) => log.renderedCount === 5)).toBe(true);
      expect(navigationLog.every((log) => log.allItemsPresent)).toBe(true);
    });
  });
});
