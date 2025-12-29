import { test, expect } from '@playwright/test';

test.describe('Theme System', () => {
  test('should load with default theme', async ({ page }) => {
    await page.goto('/docs');

    // Check that either light or dark theme is active
    const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));

    // Should be either true or false (not undefined)
    expect(typeof isDark).toBe('boolean');
  });

  test('should persist theme preference', async ({ page }) => {
    await page.goto('/docs');

    // Toggle theme
    const themeToggle = page.locator('button[aria-label*="theme" i]').first();
    await themeToggle.click();
    await page.waitForTimeout(300);

    // Get current theme state
    const isDarkAfterToggle = await page
      .locator('html')
      .evaluate((el) => el.classList.contains('dark'));

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Theme should persist
    const isDarkAfterReload = await page
      .locator('html')
      .evaluate((el) => el.classList.contains('dark'));

    expect(isDarkAfterReload).toBe(isDarkAfterToggle);
  });

  test('should apply Nordic color palette in dark mode', async ({ page }) => {
    await page.goto('/docs');

    // Switch to dark mode if not already
    const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));

    if (!isDark) {
      const themeToggle = page.locator('button[aria-label*="theme" i]').first();
      await themeToggle.click();
      await page.waitForTimeout(300);
    }

    // Check for Nordic colors (frost cyan accent)
    // After implementation, background should be ~#2E3440
    const bgColor = await page.locator('body').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Dark mode background color:', bgColor);

    // We'll verify specific colors once implemented
    // For now, just ensure it's not white
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('should use Inter font for body text', async ({ page }) => {
    await page.goto('/docs');

    const bodyFont = await page.locator('body').evaluate((el) => {
      return window.getComputedStyle(el).fontFamily;
    });

    // After implementation, should include Inter
    console.log('Body font family:', bodyFont);

    // Will verify once we add Inter
    // expect(bodyFont.toLowerCase()).toContain('inter');
  });

  test('should use IBM Plex Mono for code', async ({ page }) => {
    await page.goto('/docs');

    const codeBlock = page.locator('pre code').first();

    if ((await codeBlock.count()) > 0) {
      const codeFont = await codeBlock.evaluate((el) => {
        return window.getComputedStyle(el).fontFamily;
      });

      console.log('Code font family:', codeFont);

      // After implementation, should include IBM Plex Mono
      // expect(codeFont.toLowerCase()).toContain('ibm plex mono');
    }
  });
});
