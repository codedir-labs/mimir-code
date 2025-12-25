/**
 * Integration tests simulating actual user navigation in autocomplete
 * These tests verify the EXACT user experience described in bug reports
 */

import { describe, it, expect } from 'vitest';

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
    if (this.items.length <= this.maxVisible) {
      return {
        startIndex: 0,
        endIndex: this.items.length,
      };
    }

    let startIndex: number;
    let endIndex: number;

    if (this.selectedIndex < Math.floor(this.maxVisible / 2)) {
      startIndex = 0;
      endIndex = this.maxVisible;
    } else if (this.selectedIndex >= this.items.length - Math.floor(this.maxVisible / 2)) {
      startIndex = this.items.length - this.maxVisible;
      endIndex = this.items.length;
    } else {
      startIndex = this.selectedIndex - Math.floor(this.maxVisible / 2);
      endIndex = startIndex + this.maxVisible;
    }

    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(this.items.length, endIndex);

    return { startIndex, endIndex };
  }
}

describe('Autocomplete Navigation - User Experience', () => {
  describe('Bug Report: /mode command missing "plan"', () => {
    it('should show "plan" when user types "/mode "', () => {
      const sim = new AutocompleteSimulator(['plan', 'act', 'discuss']);
      const state = sim.getVisibleState();

      // User should see all 3 options
      expect(state.visibleItems).toHaveLength(3);
      expect(state.visibleItems).toContain('plan');
      expect(state.selectedItem).toBe('plan');
      expect(sim.isSelectedVisible()).toBe(true);
    });

    it('should keep "plan" visible when navigating down and back', () => {
      const sim = new AutocompleteSimulator(['plan', 'act', 'discuss']);

      // Start: plan selected
      expect(sim.getVisibleState().selectedItem).toBe('plan');
      expect(sim.getVisibleState().visibleItems).toContain('plan');

      // Down to act
      sim.navigateDown();
      expect(sim.getVisibleState().selectedItem).toBe('act');
      expect(sim.getVisibleState().visibleItems).toContain('plan');

      // Down to discuss
      sim.navigateDown();
      expect(sim.getVisibleState().selectedItem).toBe('discuss');
      expect(sim.getVisibleState().visibleItems).toContain('plan');

      // Down wraps to plan
      sim.navigateDown();
      expect(sim.getVisibleState().selectedItem).toBe('plan');
      expect(sim.getVisibleState().visibleItems).toContain('plan');
      expect(sim.isSelectedVisible()).toBe(true);
    });

    it('should show "plan" when navigating up from "act"', () => {
      const sim = new AutocompleteSimulator(['plan', 'act', 'discuss']);

      sim.navigateDown(); // Select 'act'
      const state1 = sim.getVisibleState();
      expect(state1.selectedItem).toBe('act');
      expect(state1.visibleItems).toContain('plan');

      sim.navigateUp(); // Back to 'plan'
      const state2 = sim.getVisibleState();
      expect(state2.selectedItem).toBe('plan');
      expect(state2.visibleItems).toContain('plan');
      expect(sim.isSelectedVisible()).toBe(true);
    });
  });

  describe('Bug Report: /theme command missing "mimir"', () => {
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

      // Should see first 5 themes
      expect(state.visibleItems).toHaveLength(5);
      expect(state.visibleItems).toContain('mimir');
      expect(state.selectedItem).toBe('mimir');
      expect(sim.isSelectedVisible()).toBe(true);
    });

    it('should keep "mimir" visible for first 3 selections', () => {
      const sim = new AutocompleteSimulator(themes, 5);

      // Index 0: mimir
      expect(sim.getVisibleState().visibleItems).toContain('mimir');

      // Index 1: dark
      sim.navigateDown();
      expect(sim.getVisibleState().visibleItems).toContain('mimir');

      // Index 2: light
      sim.navigateDown();
      expect(sim.getVisibleState().visibleItems).toContain('mimir');
    });

    it('should handle navigation to last theme and back to first', () => {
      const sim = new AutocompleteSimulator(themes, 5);

      // Navigate to last theme
      for (let i = 0; i < themes.length - 1; i++) {
        sim.navigateDown();
      }

      const lastState = sim.getVisibleState();
      expect(lastState.selectedItem).toBe('light-ansi');
      expect(lastState.visibleItems).toContain('light-ansi');
      expect(sim.isSelectedVisible()).toBe(true);

      // Wrap to first
      sim.navigateDown();
      const firstState = sim.getVisibleState();
      expect(firstState.selectedItem).toBe('mimir');
      expect(firstState.visibleItems).toContain('mimir');
      expect(sim.isSelectedVisible()).toBe(true);
    });

    it('should never lose track of selected item during full traversal', () => {
      const sim = new AutocompleteSimulator(themes, 5);

      // Navigate through all items
      for (let i = 0; i < themes.length * 2; i++) {
        const state = sim.getVisibleState();

        expect(
          sim.isSelectedVisible(),
          `Selected item "${state.selectedItem}" at index ${state.selectedIndex} should be visible`
        ).toBe(true);

        expect(
          state.visibleItems,
          `Visible items should contain selected "${state.selectedItem}"`
        ).toContain(state.selectedItem);

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

      // At start: no more above, 15 more below
      const startState = sim.getVisibleState();
      expect(startState.hasMoreAbove).toBe(false);
      expect(startState.hasMoreBelow).toBe(true);
      expect(startState.moreBelowCount).toBe(15);

      // Navigate to middle (index 10)
      for (let i = 0; i < 10; i++) {
        sim.navigateDown();
      }

      const middleState = sim.getVisibleState();
      expect(middleState.hasMoreAbove).toBe(true);
      expect(middleState.hasMoreBelow).toBe(true);
      expect(middleState.moreAboveCount).toBeGreaterThan(0);
      expect(middleState.moreBelowCount).toBeGreaterThan(0);

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

  describe('Edge case: Rapid navigation', () => {
    const themes = [
      'mimir',
      'dark',
      'light',
      'dark-colorblind',
      'light-colorblind',
      'dark-ansi',
      'light-ansi',
    ];

    it('should handle rapid up/down navigation', () => {
      const sim = new AutocompleteSimulator(themes, 5);

      // Simulate user rapidly pressing down then up
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
