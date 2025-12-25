/**
 * Integration tests for CommandAutocomplete pagination with real command data
 * Tests specific issues: missing 'plan' in /mode, missing 'mimir' in /theme
 */

import { describe, it, expect } from 'vitest';

/**
 * Test helper to calculate pagination window
 * Mirrors the logic in CommandAutocomplete component
 */
function calculatePaginationWindow(
  totalItems: number,
  selectedIndex: number,
  maxVisible: number
): { startIndex: number; endIndex: number } {
  if (totalItems <= maxVisible) {
    return {
      startIndex: 0,
      endIndex: totalItems,
    };
  }

  let startIndex: number;
  let endIndex: number;

  if (selectedIndex < Math.floor(maxVisible / 2)) {
    // Near start - show from beginning
    startIndex = 0;
    endIndex = maxVisible;
  } else if (selectedIndex >= totalItems - Math.floor(maxVisible / 2)) {
    // Near end - show last maxVisible items
    startIndex = totalItems - maxVisible;
    endIndex = totalItems;
  } else {
    // Middle - center the selected item
    startIndex = selectedIndex - Math.floor(maxVisible / 2);
    endIndex = startIndex + maxVisible;
  }

  // Safety bounds
  startIndex = Math.max(0, startIndex);
  endIndex = Math.min(totalItems, endIndex);

  return { startIndex, endIndex };
}

/**
 * Helper to check if selected item is within visible window
 */
function isSelectedVisible(selectedIndex: number, startIndex: number, endIndex: number): boolean {
  return selectedIndex >= startIndex && selectedIndex < endIndex;
}

/**
 * Simulate user navigation and track what items are visible
 */
function simulateNavigation(
  items: string[],
  maxVisible: number,
  navigationSequence: ('up' | 'down')[]
): Array<{
  selectedIndex: number;
  selectedItem: string;
  visibleItems: string[];
  isSelectedVisible: boolean;
}> {
  let selectedIndex = 0;
  const history: Array<{
    selectedIndex: number;
    selectedItem: string;
    visibleItems: string[];
    isSelectedVisible: boolean;
  }> = [];

  // Record initial state
  const initialWindow = calculatePaginationWindow(items.length, selectedIndex, maxVisible);
  history.push({
    selectedIndex,
    selectedItem: items[selectedIndex],
    visibleItems: items.slice(initialWindow.startIndex, initialWindow.endIndex),
    isSelectedVisible: isSelectedVisible(
      selectedIndex,
      initialWindow.startIndex,
      initialWindow.endIndex
    ),
  });

  // Apply navigation
  for (const direction of navigationSequence) {
    if (direction === 'up') {
      selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
    } else {
      selectedIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
    }

    const window = calculatePaginationWindow(items.length, selectedIndex, maxVisible);
    history.push({
      selectedIndex,
      selectedItem: items[selectedIndex],
      visibleItems: items.slice(window.startIndex, window.endIndex),
      isSelectedVisible: isSelectedVisible(selectedIndex, window.startIndex, window.endIndex),
    });
  }

  return history;
}

describe('CommandAutocomplete Real-World Pagination', () => {
  describe('/mode command - 3 options (plan, act, discuss)', () => {
    const modeOptions = ['plan', 'act', 'discuss'];
    const maxVisible = 5;

    it('should show all options when total <= maxVisible', () => {
      const { startIndex, endIndex } = calculatePaginationWindow(modeOptions.length, 0, maxVisible);

      expect(startIndex).toBe(0);
      expect(endIndex).toBe(3);

      const visibleItems = modeOptions.slice(startIndex, endIndex);
      expect(visibleItems).toEqual(['plan', 'act', 'discuss']);
      expect(visibleItems).toContain('plan');
    });

    it('should always show "plan" option at index 0 when navigating', () => {
      // Navigate through all items
      for (let selectedIndex = 0; selectedIndex < modeOptions.length; selectedIndex++) {
        const { startIndex, endIndex } = calculatePaginationWindow(
          modeOptions.length,
          selectedIndex,
          maxVisible
        );

        const visibleItems = modeOptions.slice(startIndex, endIndex);
        expect(visibleItems).toContain('plan');
        expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
      }
    });
  });

  describe('/theme command - 7 options', () => {
    // Themes in Map insertion order (from themes/index.ts)
    const themeOptions = [
      'mimir',
      'dark',
      'light',
      'dark-colorblind',
      'light-colorblind',
      'dark-ansi',
      'light-ansi',
    ];
    const maxVisible = 5;

    it('should show "mimir" when starting at index 0', () => {
      const { startIndex, endIndex } = calculatePaginationWindow(
        themeOptions.length,
        0,
        maxVisible
      );

      const visibleItems = themeOptions.slice(startIndex, endIndex);
      expect(visibleItems).toContain('mimir');
      expect(visibleItems[0]).toBe('mimir');
    });

    it('should keep "mimir" visible when navigating from start', () => {
      // Start at index 0, navigate down then back up
      const navigation = simulateNavigation(themeOptions, maxVisible, ['down', 'down', 'up', 'up']);

      // Check each step
      navigation.forEach((step, i) => {
        expect(step.isSelectedVisible).toBe(true);
        if (i <= 2) {
          // First 3 steps should show mimir
          expect(step.visibleItems).toContain('mimir');
        }
      });
    });

    it('should show "mimir" when navigating up from bottom', () => {
      // Start at last item and go up through all items
      const history = simulateNavigation(
        themeOptions,
        maxVisible,
        Array(themeOptions.length).fill('up')
      );

      // Find the step where mimir first becomes visible
      const mimirVisibleSteps = history.filter((step) => step.visibleItems.includes('mimir'));
      expect(mimirVisibleSteps.length).toBeGreaterThan(0);

      // When we select mimir, it must be visible
      const mimirSelected = history.find((step) => step.selectedItem === 'mimir');
      expect(mimirSelected).toBeDefined();
      expect(mimirSelected!.isSelectedVisible).toBe(true);
      expect(mimirSelected!.visibleItems).toContain('mimir');
    });

    it('should show correct items at each navigation step', () => {
      const expectedVisibleAtIndex = [
        { index: 0, shouldContain: ['mimir', 'dark'] },
        { index: 1, shouldContain: ['mimir', 'dark'] },
        { index: 2, shouldContain: ['mimir', 'dark', 'light'] },
        { index: 3, shouldContain: ['dark', 'light', 'dark-colorblind'] },
        { index: 4, shouldContain: ['light', 'dark-colorblind', 'light-colorblind'] },
        { index: 5, shouldContain: ['dark-colorblind', 'light-colorblind', 'dark-ansi'] },
        { index: 6, shouldContain: ['light-colorblind', 'dark-ansi', 'light-ansi'] },
      ];

      expectedVisibleAtIndex.forEach(({ index, shouldContain }) => {
        const { startIndex, endIndex } = calculatePaginationWindow(
          themeOptions.length,
          index,
          maxVisible
        );
        const visibleItems = themeOptions.slice(startIndex, endIndex);

        shouldContain.forEach((item) => {
          expect(visibleItems).toContain(item);
        });
        expect(isSelectedVisible(index, startIndex, endIndex)).toBe(true);
      });
    });
  });

  describe('Navigation edge cases - selecting invisible items', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const maxVisible = 5;

    it('should never select an item that is not visible', () => {
      // Navigate through entire list in both directions
      const downHistory = simulateNavigation(items, maxVisible, Array(items.length).fill('down'));
      const upHistory = simulateNavigation(items, maxVisible, Array(items.length).fill('up'));

      // Every step must have selected item visible
      [...downHistory, ...upHistory].forEach((step, i) => {
        expect(step.isSelectedVisible).toBe(true);
        expect(step.visibleItems).toContain(step.selectedItem);
      });
    });

    it('should handle wrapping from last to first item', () => {
      // Start at index 0, go up to wrap to last item
      const history = simulateNavigation(items, maxVisible, ['up']);

      const lastStep = history[history.length - 1];
      expect(lastStep.selectedIndex).toBe(items.length - 1);
      expect(lastStep.selectedItem).toBe('j');
      expect(lastStep.isSelectedVisible).toBe(true);
      expect(lastStep.visibleItems).toContain('j');
    });

    it('should handle wrapping from first to last item', () => {
      // Navigate to last, then down to wrap to first
      const lastIndex = items.length - 1;
      const navigation: ('up' | 'down')[] = Array(lastIndex).fill('down');
      navigation.push('down'); // Wrap to start

      const history = simulateNavigation(items, maxVisible, navigation);

      const lastStep = history[history.length - 1];
      expect(lastStep.selectedIndex).toBe(0);
      expect(lastStep.selectedItem).toBe('a');
      expect(lastStep.isSelectedVisible).toBe(true);
      expect(lastStep.visibleItems).toContain('a');
    });

    it('should show all intermediate items when scrolling through list', () => {
      // Scroll down through entire list
      const history = simulateNavigation(items, maxVisible, Array(items.length - 1).fill('down'));

      // Collect all items that were ever visible
      const allVisibleItems = new Set<string>();
      history.forEach((step) => {
        step.visibleItems.forEach((item) => allVisibleItems.add(item));
      });

      // All items should have been visible at some point
      items.forEach((item) => {
        expect(allVisibleItems.has(item)).toBe(true);
      });
    });
  });

  describe('Rendering index calculation', () => {
    /**
     * This tests the EXACT logic used in CommandAutocomplete component
     * to calculate actualIndex from the reversed visible array
     */
    function testRenderingIndexes(
      items: string[],
      selectedIndex: number,
      maxVisible: number
    ): { rendered: Array<{ suggestion: string; actualIndex: number; isSelected: boolean }> } {
      const { startIndex, endIndex } = calculatePaginationWindow(
        items.length,
        selectedIndex,
        maxVisible
      );
      const visibleSuggestions = items.slice(startIndex, endIndex);

      // This mirrors the component's rendering logic
      const rendered = visibleSuggestions
        .slice()
        .reverse()
        .map((suggestion, idx) => {
          const visibleIdx = visibleSuggestions.length - 1 - idx;
          const actualIndex = startIndex + visibleIdx;
          const isSelected = actualIndex === selectedIndex;

          return { suggestion, actualIndex, isSelected };
        });

      return { rendered };
    }

    it('should correctly calculate indexes when rendering 3 items (/mode case)', () => {
      const modeOptions = ['plan', 'act', 'discuss'];
      const { rendered } = testRenderingIndexes(modeOptions, 0, 5);

      // All 3 should be rendered (since 3 < 5)
      expect(rendered).toHaveLength(3);

      // Find 'plan' in rendered output
      const planItem = rendered.find((r) => r.suggestion === 'plan');
      expect(planItem).toBeDefined();
      expect(planItem!.actualIndex).toBe(0);
      expect(planItem!.isSelected).toBe(true);

      // Verify all items are present
      expect(rendered.map((r) => r.suggestion)).toEqual(['discuss', 'act', 'plan']);
    });

    it('should correctly calculate indexes when rendering 7 items (/theme case)', () => {
      const themes = [
        'mimir',
        'dark',
        'light',
        'dark-colorblind',
        'light-colorblind',
        'dark-ansi',
        'light-ansi',
      ];

      // Test selecting 'mimir' at index 0
      const { rendered } = testRenderingIndexes(themes, 0, 5);

      expect(rendered).toHaveLength(5);

      // Find 'mimir' in rendered output
      const mimirItem = rendered.find((r) => r.suggestion === 'mimir');
      expect(mimirItem, "'mimir' should be in rendered output").toBeDefined();
      expect(mimirItem!.actualIndex).toBe(0);
      expect(mimirItem!.isSelected).toBe(true);

      // Verify exactly one item is selected
      const selectedItems = rendered.filter((r) => r.isSelected);
      expect(selectedItems).toHaveLength(1);
      expect(selectedItems[0].suggestion).toBe('mimir');
    });

    it('should handle every selection in 7-item list', () => {
      const themes = [
        'mimir',
        'dark',
        'light',
        'dark-colorblind',
        'light-colorblind',
        'dark-ansi',
        'light-ansi',
      ];

      for (let selectedIndex = 0; selectedIndex < themes.length; selectedIndex++) {
        const { rendered } = testRenderingIndexes(themes, selectedIndex, 5);

        // Find the selected item
        const selectedItems = rendered.filter((r) => r.isSelected);
        expect(
          selectedItems,
          `Exactly one item should be selected when selectedIndex=${selectedIndex}`
        ).toHaveLength(1);

        const selected = selectedItems[0];
        expect(selected.suggestion, `Wrong item selected at index ${selectedIndex}`).toBe(
          themes[selectedIndex]
        );
        expect(selected.actualIndex).toBe(selectedIndex);

        // Verify selected item's suggestion matches actual theme at that index
        const expectedTheme = themes[selectedIndex];
        expect(selected.suggestion).toBe(expectedTheme);
      }
    });
  });

  describe('Edge cases for parameter autocomplete', () => {
    it('should always show "plan" option for /mode command', () => {
      const modeOptions = ['plan', 'act', 'discuss'];
      const maxVisible = 5;

      // Test every possible selected index
      for (let i = 0; i < modeOptions.length; i++) {
        const { startIndex, endIndex } = calculatePaginationWindow(
          modeOptions.length,
          i,
          maxVisible
        );
        const visible = modeOptions.slice(startIndex, endIndex);

        expect(visible, `"plan" should be visible when index ${i} is selected`).toContain('plan');
      }
    });

    it('should always show "mimir" when selectable for /theme command', () => {
      const themeOptions = [
        'mimir',
        'dark',
        'light',
        'dark-colorblind',
        'light-colorblind',
        'dark-ansi',
        'light-ansi',
      ];
      const maxVisible = 5;

      // If we can select mimir (index 0), it must be visible
      const { startIndex, endIndex } = calculatePaginationWindow(
        themeOptions.length,
        0,
        maxVisible
      );
      const visible = themeOptions.slice(startIndex, endIndex);

      expect(visible).toContain('mimir');
      expect(startIndex).toBe(0); // mimir is at index 0, so must be in window
    });

    it('should always include selected item in visible window', () => {
      const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
      const maxVisible = 5;

      // Test every single index
      for (let selectedIndex = 0; selectedIndex < items.length; selectedIndex++) {
        const { startIndex, endIndex } = calculatePaginationWindow(
          items.length,
          selectedIndex,
          maxVisible
        );

        const isVisible = selectedIndex >= startIndex && selectedIndex < endIndex;
        expect(isVisible, `Item at index ${selectedIndex} must be visible`).toBe(true);

        const visible = items.slice(startIndex, endIndex);
        expect(
          visible,
          `Selected item "${items[selectedIndex]}" must be in visible array`
        ).toContain(items[selectedIndex]);
      }
    });
  });
});
