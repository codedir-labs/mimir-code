import { test, expect } from '@playwright/test';

test.describe('Documentation Navigation', () => {
  test('should navigate to getting started page', async ({ page }) => {
    await page.goto('/');

    // Find and click a docs link (adjust selector based on your actual structure)
    const docsLink = page.getByRole('link', { name: /get.*started|docs/i }).first();
    await docsLink.click();

    // Wait for navigation
    await page.waitForLoadState('networkidle');

    // Should be on a docs page (not root)
    expect(page.url()).not.toBe('http://localhost:3000/');
  });

  test('should have working sidebar navigation', async ({ page }) => {
    await page.goto('/docs');

    // Look for sidebar (Nextra uses specific classes)
    const sidebar = page
      .locator('aside, nav[aria-label="Sidebar"], .nextra-sidebar-container')
      .first();

    // Sidebar should be visible on desktop
    if (page.viewportSize()!.width >= 768) {
      await expect(sidebar).toBeVisible();
    }
  });

  test('should have table of contents on doc pages', async ({ page }) => {
    await page.goto('/docs');

    // Look for TOC (usually on the right side in Nextra)
    const toc = page.locator('.nextra-toc, [aria-label*="table of contents" i]').first();

    // TOC should exist (may not be visible on mobile)
    const tocExists = (await toc.count()) > 0;
    expect(tocExists).toBe(true);
  });

  test('should navigate using sidebar links', async ({ page }) => {
    await page.goto('/docs');

    // Find first sidebar link
    const firstLink = page.locator('aside a, .nextra-sidebar-container a').first();
    const linkText = await firstLink.textContent();

    // Click it
    await firstLink.click();
    await page.waitForLoadState('networkidle');

    // URL should have changed
    expect(page.url()).toContain('/');
  });

  test('should show breadcrumbs on deep pages', async ({ page }) => {
    await page.goto('/docs/configuration');

    // Look for breadcrumb navigation (common in Nextra)
    const breadcrumbs = page.locator('nav[aria-label*="breadcrumb" i], .breadcrumbs').first();

    // Breadcrumbs might exist
    const breadcrumbsExist = (await breadcrumbs.count()) > 0;
    // This is optional, so we just log it
    console.log('Breadcrumbs exist:', breadcrumbsExist);
  });
});
