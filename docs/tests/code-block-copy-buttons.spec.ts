import { test, expect } from '@playwright/test';

test.describe('Code Block Copy Buttons', () => {
  const pages = [
    { name: 'Keybinds', path: '/configuration/keybinds' },
    { name: 'Themes', path: '/configuration/themes' },
  ];

  for (const { name, path } of pages) {
    test(`should have visible and functional copy buttons on ${name} page`, async ({ page }) => {
      await page.goto(path);

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Find all Nextra code blocks (DIV wrapper, not CODE element) on the page
      const nextraCodeBlocks = page.locator('div.nextra-code');
      const count = await nextraCodeBlocks.count();

      console.log(`Found ${count} Nextra code blocks on ${name} page`);
      expect(count).toBeGreaterThan(0);

      // Check first 3 Nextra code blocks for a copy button (sample test)
      const blocksToTest = Math.min(count, 3);
      for (let i = 0; i < blocksToTest; i++) {
        const codeBlock = nextraCodeBlocks.nth(i);

        // Hover over the code block to reveal the copy button
        await codeBlock.hover();
        await page.waitForTimeout(300);

        // Look for copy button within this specific code block
        const copyButton = codeBlock.locator(`button[title*="Copy" i]`).first();

        // Check if copy button exists
        const buttonExists = (await copyButton.count()) > 0;
        console.log(`Code block ${i + 1} on ${name}: Copy button exists = ${buttonExists}`);

        if (buttonExists) {
          // Verify button is visible
          await expect(copyButton).toBeVisible();

          // Verify button has proper accessibility
          const title = await copyButton.getAttribute('title');
          console.log(`Code block ${i + 1} on ${name}: Button title = "${title}"`);
          expect(title?.toLowerCase()).toContain('copy');

          // Test clicking the copy button
          await copyButton.click();

          // Wait a moment for copy animation
          await page.waitForTimeout(200);

          // The button might change state or show a checkmark
          // We can't directly test clipboard content in Playwright without permissions
          // but we can verify the button is clickable and visible
          console.log(`Code block ${i + 1} on ${name}: Copy button is visible and clickable ✓`);
        } else {
          // If no copy button found in a Nextra code block, fail the test
          throw new Error(`No copy button found for Nextra code block ${i + 1} on ${name} page`);
        }
      }
    });
  }

  test('should have consistent copy button behavior across pages', async ({ page }) => {
    const keybindsButtons: any[] = [];
    const themesButtons: any[] = [];

    // Check keybinds page
    await page.goto('/configuration/keybinds');
    await page.waitForLoadState('networkidle');

    let nextraCodeBlocks = page.locator('div.nextra-code');
    let count = await nextraCodeBlocks.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const codeBlock = nextraCodeBlocks.nth(i);
      await codeBlock.hover();
      await page.waitForTimeout(200);

      const copyButton = codeBlock.locator(`button[title*="Copy" i]`).first();

      if ((await copyButton.count()) > 0) {
        const styles = await copyButton.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            opacity: computed.opacity,
            display: computed.display,
            visibility: computed.visibility,
            position: computed.position,
            zIndex: computed.zIndex,
          };
        });
        keybindsButtons.push(styles);
      }
    }

    // Check themes page
    await page.goto('/configuration/themes');
    await page.waitForLoadState('networkidle');

    nextraCodeBlocks = page.locator('div.nextra-code');
    count = await nextraCodeBlocks.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const codeBlock = nextraCodeBlocks.nth(i);
      await codeBlock.hover();
      await page.waitForTimeout(200);

      const copyButton = codeBlock.locator(`button[title*="Copy" i]`).first();

      if ((await copyButton.count()) > 0) {
        const styles = await copyButton.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            opacity: computed.opacity,
            display: computed.display,
            visibility: computed.visibility,
            position: computed.position,
            zIndex: computed.zIndex,
          };
        });
        themesButtons.push(styles);
      }
    }

    console.log('Keybinds copy button styles:', keybindsButtons);
    console.log('Themes copy button styles:', themesButtons);

    // Both pages should have copy buttons
    expect(keybindsButtons.length).toBeGreaterThan(0);
    expect(themesButtons.length).toBeGreaterThan(0);

    // Styles should be consistent
    if (keybindsButtons.length > 0 && themesButtons.length > 0) {
      expect(keybindsButtons[0].position).toBe(themesButtons[0].position);
      expect(keybindsButtons[0].display).toBe(themesButtons[0].display);
    }
  });
});
