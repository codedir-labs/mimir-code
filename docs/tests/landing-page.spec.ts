import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should render landing page with logo', async ({ page }) => {
    await page.goto('/');

    // Check for logo/header
    const logo = page.locator('.logo-container, .landing-logo').first();
    await expect(logo).toBeVisible();
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/');

    // Check for docs link
    const docsLink = page.getByRole('link', { name: /docs|documentation/i });
    await expect(docsLink).toBeVisible();
  });

  test('should have GitHub link', async ({ page }) => {
    await page.goto('/');

    // Look for GitHub link
    const githubLink = page.locator('a[href*="github.com"]').first();
    await expect(githubLink).toBeVisible();
  });

  test('should have theme toggle', async ({ page }) => {
    await page.goto('/');

    // Look for theme toggle button
    const themeToggle = page
      .locator('button[aria-label*="theme" i], .landing-theme-toggle')
      .first();
    await expect(themeToggle).toBeVisible();
  });

  test('should toggle dark mode', async ({ page }) => {
    await page.goto('/');

    // Get initial theme (check for dark class on html or body)
    const initialIsDark = await page
      .locator('html')
      .evaluate((el) => el.classList.contains('dark'));

    // Click theme toggle
    const themeToggle = page
      .locator('button[aria-label*="theme" i], .landing-theme-toggle')
      .first();
    await themeToggle.click();

    // Wait a bit for theme to change
    await page.waitForTimeout(500);

    // Check that theme changed
    const newIsDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));

    expect(newIsDark).not.toBe(initialIsDark);
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check that logo is still visible
    const logo = page.locator('.logo-container, .landing-logo').first();
    await expect(logo).toBeVisible();
  });
});
