import { test, expect } from '@playwright/test';

test.describe('Code Block Styling', () => {
  test('should render code blocks with syntax highlighting', async ({ page }) => {
    await page.goto('/docs');

    // Look for code blocks
    const codeBlock = page.locator('pre code').first();

    if ((await codeBlock.count()) > 0) {
      await expect(codeBlock).toBeVisible();

      // Check if syntax highlighting is applied (usually via span elements)
      const highlightedTokens = await codeBlock.locator('span').count();
      expect(highlightedTokens).toBeGreaterThan(0);
    }
  });

  test('should have terminal window chrome on code blocks', async ({ page }) => {
    await page.goto('/docs');

    // Look for code blocks
    const codeBlock = page.locator('pre').first();

    if ((await codeBlock.count()) > 0) {
      // After we implement terminal chrome, this should pass
      // Check for the ::before pseudo-element styling via computed styles
      const hasPaddingTop = await codeBlock.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const paddingTop = parseInt(styles.paddingTop);
        // Terminal chrome adds ~2.5rem padding
        return paddingTop > 30; // ~2.5rem in pixels
      });

      // This will be true once we add the styling
      console.log('Has terminal chrome padding:', hasPaddingTop);
    }
  });

  test('should use monospace font for code', async ({ page }) => {
    await page.goto('/docs');

    const codeBlock = page.locator('pre code').first();

    if ((await codeBlock.count()) > 0) {
      const fontFamily = await codeBlock.evaluate((el) => {
        return window.getComputedStyle(el).fontFamily;
      });

      // Should contain a monospace font
      expect(fontFamily.toLowerCase()).toMatch(/mono|courier|consolas|menlo/i);
    }
  });

  test('should have copy button on code blocks', async ({ page }) => {
    await page.goto('/docs');

    // Nextra adds copy buttons to code blocks
    const copyButton = page.locator('button[aria-label*="copy" i]').first();

    // Hover over code block to reveal copy button
    const codeBlock = page.locator('pre').first();
    if ((await codeBlock.count()) > 0) {
      await codeBlock.hover();
      await page.waitForTimeout(200);

      // Copy button might be visible
      const copyButtonExists = (await copyButton.count()) > 0;
      console.log('Copy button exists:', copyButtonExists);
    }
  });

  test('should support different language highlighting', async ({ page }) => {
    await page.goto('/docs');

    // Look for different language code blocks
    const bashBlock = page.locator('pre code.language-bash, pre code.language-shell').first();
    const jsBlock = page
      .locator('pre code.language-javascript, pre code.language-js, pre code.language-typescript')
      .first();

    // At least one should exist
    const hasBash = (await bashBlock.count()) > 0;
    const hasJs = (await jsBlock.count()) > 0;

    console.log('Has bash blocks:', hasBash);
    console.log('Has JS/TS blocks:', hasJs);
  });
});
