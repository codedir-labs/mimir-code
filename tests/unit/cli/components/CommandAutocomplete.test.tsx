/**
 * Comprehensive unit tests for CommandAutocomplete component
 * Tests pagination logic, rendering behavior, and user navigation
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
  const { startIndex, endIndex } = calculatePaginationWindow(items.length, selectedIndex, maxVisible);
  const visibleSuggestions = items.slice(startIndex, endIndex);

  // Rendering logic - EXACTLY as in component (with reverse)
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

/**
 * Simulates the autocomplete component state during user interaction
 */
class AutocompleteSimulator {
  private items: string[];
  private selectedIndex: number;
  private maxVisible: number;

  constructor(items: string[], maxVisible: number = 5) {
    this.items = items;
    this.selectedIndex = 0;
    this.maxVisible = maxVisible;
  }

  /**
   * Calculate what the user sees on screen
   */
  getVisibleState(): {
    visibleItems: string[];
    selectedItem: string;
    selectedIndex: number;
    hasMoreAbove: boolean;
    hasMoreBelow: boolean;
    moreAboveCount: number;
    moreBelowCount: number;
  } {
    const { startIndex, endIndex } = this.calculateWindow();
    const visibleItems = this.items.slice(startIndex, endIndex);

    return {
      visibleItems,
      selectedItem: this.items[this.selectedIndex],
      selectedIndex: this.selectedIndex,
      hasMoreAbove: startIndex > 0,
      hasMoreBelow: endIndex < this.items.length,
      moreAboveCount: startIndex,
      moreBelowCount: this.items.length - endIndex,
    };
  }

  /**
   * User presses down arrow
   */
  navigateDown(): void {
    this.selectedIndex = this.selectedIndex < this.items.length - 1 ? this.selectedIndex + 1 : 0;
  }

  /**
   * User presses up arrow
   */
  navigateUp(): void {
    this.selectedIndex = this.selectedIndex > 0 ? this.selectedIndex - 1 : this.items.length - 1;
  }

  /**
   * Check if selected item is visible
   */
  isSelectedVisible(): boolean {
    const { visibleItems, selectedItem } = this.getVisibleState();
    return visibleItems.includes(selectedItem);
  }

  private calculateWindow(): { startIndex: number; endIndex: number } {
    return calculatePaginationWindow(this.items.length, this.selectedIndex, this.maxVisible);
  }
}

describe('CommandAutocomplete', () => {
  const maxVisible = 5;

  describe('Pagination Logic', () => {
    describe('Small lists (≤ maxVisible)', () => {
      it('should show all items when total ≤ maxVisible', () => {
        const totalItems = 3;
        const selectedIndex = 1;

        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        expect(startIndex).toBe(0);
        expect(endIndex).toBe(totalItems);
        expect(endIndex - startIndex).toBe(totalItems);
      });

      it('should show exactly maxVisible items when total === maxVisible', () => {
        const totalItems = 5;
        const selectedIndex = 2;

        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        expect(startIndex).toBe(0);
        expect(endIndex).toBe(5);
        expect(endIndex - startIndex).toBe(maxVisible);
      });
    });

    describe('Large lists (> maxVisible)', () => {
      const totalItems = 20;

      it('should show first maxVisible items when selected is at index 0', () => {
        const selectedIndex = 0;

        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        expect(startIndex).toBe(0);
        expect(endIndex).toBe(maxVisible);
        expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
      });

      it('should center selected item when in middle of list', () => {
        const selectedIndex = 10;

        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        expect(startIndex).toBe(8); // 10 - floor(5/2) = 10 - 2 = 8
        expect(endIndex).toBe(13); // 8 + 5 = 13
        expect(endIndex - startIndex).toBe(maxVisible);
        expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
      });

      it('should show last maxVisible items when selected is at last index', () => {
        const selectedIndex = totalItems - 1;

        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        expect(startIndex).toBe(totalItems - maxVisible);
        expect(endIndex).toBe(totalItems);
        expect(endIndex - startIndex).toBe(maxVisible);
        expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
      });

      it('should always keep selected item visible when scrolling down', () => {
        for (let selectedIndex = 0; selectedIndex < totalItems; selectedIndex++) {
          const { startIndex, endIndex } = calculatePaginationWindow(
            totalItems,
            selectedIndex,
            maxVisible
          );

          expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
          expect(endIndex - startIndex).toBe(maxVisible);
        }
      });

      it('should always keep selected item visible when scrolling up', () => {
        for (let selectedIndex = totalItems - 1; selectedIndex >= 0; selectedIndex--) {
          const { startIndex, endIndex } = calculatePaginationWindow(
            totalItems,
            selectedIndex,
            maxVisible
          );

          expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
          expect(endIndex - startIndex).toBe(maxVisible);
        }
      });
    });

    describe('Pagination indicators', () => {
      const totalItems = 20;

      it('should indicate more items below when not at end', () => {
        const selectedIndex = 2;
        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        const moreBelow = endIndex < totalItems;
        const moreBelowCount = totalItems - endIndex;

        expect(moreBelow).toBe(true);
        expect(moreBelowCount).toBe(15);
      });

      it('should indicate more items above when not at start', () => {
        const selectedIndex = 18;
        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVisible
        );

        const moreAbove = startIndex > 0;
        const moreAboveCount = startIndex;

        expect(moreAbove).toBe(true);
        expect(moreAboveCount).toBe(15);
      });

      it('should not indicate more above when at start', () => {
        const selectedIndex = 0;
        const { startIndex } = calculatePaginationWindow(totalItems, selectedIndex, maxVisible);

        expect(startIndex > 0).toBe(false);
      });

      it('should not indicate more below when at end', () => {
        const selectedIndex = totalItems - 1;
        const { endIndex } = calculatePaginationWindow(totalItems, selectedIndex, maxVisible);

        expect(endIndex < totalItems).toBe(false);
      });
    });
  });

  describe('Rendering Logic', () => {
    describe('Command rendering with reverse', () => {
      it('should render all 5 commands in reverse order', () => {
        const commands = ['new', 'model', 'mode', 'theme', 'help'];
        const result = simulateRendering(commands, 0, 5);

        expect(result.totalItems).toBe(5);
        expect(result.visibleCount).toBe(5);
        expect(result.renderedItems).toHaveLength(5);
        // Items are reversed for terminal rendering (bottom-up)
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
        expect(selectedItems[0].item).toBe('new');
      });

      it('should render correctly for all selection positions', () => {
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

    describe('React key uniqueness', () => {
      it('should generate unique keys for all rendered items', () => {
        const items = ['a', 'b', 'c', 'd', 'e'];
        const result = simulateRendering(items, 2, 5);

        // Simulate key generation: `${actualIndex}-${item}`
        const keys = result.renderedItems.map((r) => `${r.actualIndex}-${r.item}`);
        const uniqueKeys = new Set(keys);

        expect(uniqueKeys.size).toBe(keys.length);
      });

      it('should handle duplicate item names with unique keys', () => {
        const items = ['plan', 'plan', 'act'];
        const result = simulateRendering(items, 0, 5);

        const keys = result.renderedItems.map((r) => `${r.actualIndex}-${r.item}`);
        const uniqueKeys = new Set(keys);

        // Even with duplicate names, actualIndex makes keys unique
        expect(uniqueKeys.size).toBe(keys.length);
      });
    });

    describe('Rendering consistency', () => {
      it('should never have undefined items', () => {
        const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

        for (let selectedIndex = 0; selectedIndex < items.length; selectedIndex++) {
          const result = simulateRendering(items, selectedIndex, 5);

          result.renderedItems.forEach((rendered, idx) => {
            expect(rendered.item, `Item at render index ${idx} should be defined`).toBeDefined();
            expect(rendered.item, `Item at render index ${idx} should not be null`).not.toBeNull();
            expect(rendered.item, `Item at render index ${idx} should not be empty`).not.toBe('');
          });
        }
      });

      it('should have consistent actualIndex values', () => {
        const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const result = simulateRendering(items, 3, 5);

        const actualIndexes = result.renderedItems.map((r) => r.actualIndex);

        // Should be consecutive
        const min = Math.min(...actualIndexes);
        const max = Math.max(...actualIndexes);
        expect(max - min).toBe(result.renderedItems.length - 1);

        // Should be in valid range
        actualIndexes.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(items.length);
        });
      });
    });
  });

  describe('User Navigation Simulation', () => {
    describe('Bug Report: /mode command navigation', () => {
      it('should show "plan" when user types "/mode "', () => {
        const sim = new AutocompleteSimulator(['plan', 'act', 'discuss']);
        const state = sim.getVisibleState();

        expect(state.visibleItems).toHaveLength(3);
        expect(state.visibleItems).toContain('plan');
        expect(state.selectedItem).toBe('plan');
        expect(sim.isSelectedVisible()).toBe(true);
      });

      it('should keep "plan" visible when navigating down and wrapping back', () => {
        const sim = new AutocompleteSimulator(['plan', 'act', 'discuss']);

        // Start: plan selected
        expect(sim.getVisibleState().selectedItem).toBe('plan');

        // Down to act
        sim.navigateDown();
        expect(sim.getVisibleState().selectedItem).toBe('act');

        // Down to discuss
        sim.navigateDown();
        expect(sim.getVisibleState().selectedItem).toBe('discuss');

        // Down wraps to plan
        sim.navigateDown();
        expect(sim.getVisibleState().selectedItem).toBe('plan');
        expect(sim.isSelectedVisible()).toBe(true);
      });
    });

    describe('Bug Report: /theme command with 7 items', () => {
      const themes = [
        'mimir',
        'dark',
        'light',
        'dark-colorblind',
        'light-colorblind',
        'dark-ansi',
        'light-ansi',
      ];

      it('should show "mimir" when user types "/theme "', () => {
        const sim = new AutocompleteSimulator(themes, 5);
        const state = sim.getVisibleState();

        expect(state.visibleItems).toHaveLength(5);
        expect(state.visibleItems).toContain('mimir');
        expect(state.selectedItem).toBe('mimir');
        expect(sim.isSelectedVisible()).toBe(true);
      });

      it('should never lose track of selected item during full traversal', () => {
        const sim = new AutocompleteSimulator(themes, 5);

        // Navigate through all items twice
        for (let i = 0; i < themes.length * 2; i++) {
          const state = sim.getVisibleState();

          expect(
            sim.isSelectedVisible(),
            `Selected item "${state.selectedItem}" at index ${state.selectedIndex} should be visible`
          ).toBe(true);

          sim.navigateDown();
        }
      });
    });

    describe('Bug Report: Can select items not in view', () => {
      const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);

      it('should NEVER allow selecting invisible items', () => {
        const sim = new AutocompleteSimulator(items, 5);

        // Navigate through all items in both directions
        for (let i = 0; i < items.length * 2; i++) {
          expect(sim.isSelectedVisible()).toBe(true);
          sim.navigateDown();
        }

        for (let i = 0; i < items.length * 2; i++) {
          expect(sim.isSelectedVisible()).toBe(true);
          sim.navigateUp();
        }
      });

      it('should show correct pagination indicators', () => {
        const sim = new AutocompleteSimulator(items, 5);

        // At start
        const startState = sim.getVisibleState();
        expect(startState.hasMoreAbove).toBe(false);
        expect(startState.hasMoreBelow).toBe(true);
        expect(startState.moreBelowCount).toBe(15);

        // Navigate to middle
        for (let i = 0; i < 10; i++) {
          sim.navigateDown();
        }
        const middleState = sim.getVisibleState();
        expect(middleState.hasMoreAbove).toBe(true);
        expect(middleState.hasMoreBelow).toBe(true);

        // Navigate to end
        for (let i = 10; i < items.length - 1; i++) {
          sim.navigateDown();
        }
        const endState = sim.getVisibleState();
        expect(endState.hasMoreAbove).toBe(true);
        expect(endState.hasMoreBelow).toBe(false);
        expect(endState.moreAboveCount).toBe(15);
      });
    });

    describe('Edge cases', () => {
      it('should handle rapid up/down navigation', () => {
        const themes = ['mimir', 'dark', 'light', 'dark-colorblind', 'light-colorblind'];
        const sim = new AutocompleteSimulator(themes, 5);

        const sequence = ['down', 'down', 'down', 'up', 'up', 'down', 'down', 'up', 'down'];

        for (const direction of sequence) {
          if (direction === 'down') {
            sim.navigateDown();
          } else {
            sim.navigateUp();
          }

          expect(sim.isSelectedVisible(), `Item should be visible after ${direction}`).toBe(true);
        }
      });

      it('should handle wrapping multiple times', () => {
        const themes = ['mimir', 'dark', 'light'];
        const sim = new AutocompleteSimulator(themes, 5);

        // Wrap down 3 times
        for (let wrap = 0; wrap < 3; wrap++) {
          for (let i = 0; i < themes.length; i++) {
            expect(sim.isSelectedVisible()).toBe(true);
            sim.navigateDown();
          }
        }

        // Wrap up 3 times
        for (let wrap = 0; wrap < 3; wrap++) {
          for (let i = 0; i < themes.length; i++) {
            expect(sim.isSelectedVisible()).toBe(true);
            sim.navigateUp();
          }
        }
      });
    });
  });
});
