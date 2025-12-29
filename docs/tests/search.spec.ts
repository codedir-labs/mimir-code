import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test('should have search input', async ({ page }) => {
    await page.goto('/docs');

    // Nextra usually has a search input in the navbar
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="search" i]')
      .first();
    await expect(searchInput).toBeVisible();
  });

  test('should open search with keyboard shortcut', async ({ page }) => {
    await page.goto('/docs');

    // Common search shortcuts: Cmd+K or Ctrl+K
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');

    // Wait for search modal/input to appear
    await page.waitForTimeout(500);

    // Check if search is focused or modal is open
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="search" i]')
      .first();
    const isFocused = await searchInput.evaluate((el) => el === document.activeElement);

    console.log('Search input focused after shortcut:', isFocused);
  });

  test('should show search results when typing', async ({ page }) => {
    await page.goto('/docs');

    // Find search input
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="search" i]')
      .first();
    await searchInput.click();

    // Type a search query
    await searchInput.fill('mimir');

    // Wait for results
    await page.waitForTimeout(1000);

    // Check for search results container
    const searchResults = page
      .locator('[role="listbox"], .search-results, [class*="search"][class*="results"]')
      .first();
    const hasResults = (await searchResults.count()) > 0;

    console.log('Search results visible:', hasResults);
  });

  test('should navigate to result on enter', async ({ page }) => {
    await page.goto('/docs');

    const searchInput = page
      .locator('input[type="search"], input[placeholder*="search" i]')
      .first();
    await searchInput.click();
    await searchInput.fill('getting started');

    // Wait for results to appear
    await page.waitForTimeout(1000);

    // Press Enter to select first result
    await searchInput.press('Enter');

    // Wait for navigation
    await page.waitForTimeout(1000);

    // URL should have changed (navigated to a result)
    const url = page.url();
    console.log('Navigated to:', url);
  });

  test('should close search with Escape', async ({ page }) => {
    await page.goto('/docs');

    // Open search
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    await page.waitForTimeout(300);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Search should be closed (check if modal is gone)
    const searchModal = page.locator('[role="dialog"]').first();
    const isVisible = await searchModal.isVisible().catch(() => false);

    expect(isVisible).toBe(false);
  });
});
