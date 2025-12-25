/**
 * Unit tests for CommandAutocomplete pagination logic
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

describe('CommandAutocomplete Pagination', () => {
  const maxVisible = 5;

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

    it('should show first maxVisible items when selected is at index 1', () => {
      const selectedIndex = 1;

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

      expect(startIndex).toBe(totalItems - maxVisible); // 20 - 5 = 15
      expect(endIndex).toBe(totalItems); // 20
      expect(endIndex - startIndex).toBe(maxVisible);
      expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
    });

    it('should show last maxVisible items when selected is near end', () => {
      const selectedIndex = 18; // totalItems - 2

      const { startIndex, endIndex } = calculatePaginationWindow(
        totalItems,
        selectedIndex,
        maxVisible
      );

      expect(startIndex).toBe(totalItems - maxVisible); // 15
      expect(endIndex).toBe(totalItems); // 20
      expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
    });

    it('should always keep selected item visible when scrolling down', () => {
      // Simulate scrolling down from 0 to last item
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
      // Simulate scrolling up from last to first item
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

  describe('Edge cases', () => {
    it('should handle maxVisible = 1', () => {
      const totalItems = 10;
      const maxVis = 1;

      for (let selectedIndex = 0; selectedIndex < totalItems; selectedIndex++) {
        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVis
        );

        expect(endIndex - startIndex).toBe(1);
        expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
      }
    });

    it('should handle maxVisible = 2 (even number)', () => {
      const totalItems = 10;
      const maxVis = 2;

      for (let selectedIndex = 0; selectedIndex < totalItems; selectedIndex++) {
        const { startIndex, endIndex } = calculatePaginationWindow(
          totalItems,
          selectedIndex,
          maxVis
        );

        expect(endIndex - startIndex).toBe(2);
        expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
      }
    });

    it('should handle totalItems = maxVisible + 1', () => {
      const totalItems = 6;
      const selectedIndex = 3;

      const { startIndex, endIndex } = calculatePaginationWindow(
        totalItems,
        selectedIndex,
        maxVisible
      );

      expect(endIndex - startIndex).toBe(maxVisible);
      expect(isSelectedVisible(selectedIndex, startIndex, endIndex)).toBe(true);
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
      expect(moreBelowCount).toBe(15); // 20 - 5 = 15
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
      expect(moreAboveCount).toBe(15); // 20 - 5 = 15
    });

    it('should not indicate more above when at start', () => {
      const selectedIndex = 0;
      const { startIndex } = calculatePaginationWindow(totalItems, selectedIndex, maxVisible);

      const moreAbove = startIndex > 0;
      expect(moreAbove).toBe(false);
    });

    it('should not indicate more below when at end', () => {
      const selectedIndex = totalItems - 1;
      const { endIndex } = calculatePaginationWindow(totalItems, selectedIndex, maxVisible);

      const moreBelow = endIndex < totalItems;
      expect(moreBelow).toBe(false);
    });
  });
});
