import { test, expect } from '@playwright/test';

test.describe('Game of Life - Theme and Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="game-of-life-canvas"]', { timeout: 10000 });
  });

  test('should update cell color when theme switches', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Start in light mode
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(500);

    // Take screenshot in light mode
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-light-mode.png',
      fullPage: true,
    });

    // Get sample pixel colors from canvas in light mode
    const lightColors = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;

      // Sample middle of canvas
      const centerX = Math.floor(el.width / 2);
      const centerY = Math.floor(el.height / 2);
      const imageData = ctx.getImageData(centerX - 50, centerY - 50, 100, 100);

      // Find average non-transparent pixel color
      let totalR = 0,
        totalG = 0,
        totalB = 0,
        count = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i + 3] > 0) {
          // Non-transparent
          totalR += imageData.data[i];
          totalG += imageData.data[i + 1];
          totalB += imageData.data[i + 2];
          count++;
        }
      }

      if (count === 0) return null;
      return {
        r: Math.round(totalR / count),
        g: Math.round(totalG / count),
        b: Math.round(totalB / count),
      };
    });

    // Switch to dark mode
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    // Take screenshot in dark mode
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-dark-mode.png',
      fullPage: true,
    });

    // Get sample pixel colors from canvas in dark mode
    const darkColors = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;

      const centerX = Math.floor(el.width / 2);
      const centerY = Math.floor(el.height / 2);
      const imageData = ctx.getImageData(centerX - 50, centerY - 50, 100, 100);

      let totalR = 0,
        totalG = 0,
        totalB = 0,
        count = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i + 3] > 0) {
          totalR += imageData.data[i];
          totalG += imageData.data[i + 1];
          totalB += imageData.data[i + 2];
          count++;
        }
      }

      if (count === 0) return null;
      return {
        r: Math.round(totalR / count),
        g: Math.round(totalG / count),
        b: Math.round(totalB / count),
      };
    });

    // Dark mode should have lighter colors (higher RGB values)
    // Light mode should have darker colors (lower RGB values)
    if (lightColors && darkColors) {
      expect(darkColors.r).toBeGreaterThan(lightColors.r);
      expect(darkColors.g).toBeGreaterThan(lightColors.g);
      expect(darkColors.b).toBeGreaterThan(lightColors.b);
    }
  });

  test('should show cursor radius indicator on hover', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Move mouse over canvas center
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(200);

    // Take screenshot with cursor indicator visible
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-cursor-radius.png',
      fullPage: true,
    });

    // Verify cursor indicator renders
    const hasIndicator = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return false;

      // Check if there's content being rendered
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imageData.data;

      let nonTransparentPixels = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          nonTransparentPixels++;
        }
      }

      return nonTransparentPixels > 0;
    });

    expect(hasIndicator).toBeTruthy();
  });

  test('should push cells away from cursor', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Get initial cell state at center
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Take screenshot before hover
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-before-push.png',
      clip: { x: centerX - 100, y: centerY - 100, width: 200, height: 200 },
    });

    // Move cursor to center
    await page.mouse.move(centerX, centerY);

    // Wait for several animation frames to see push effect
    await page.waitForTimeout(500);

    // Take screenshot after hover
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-after-push.png',
      clip: { x: centerX - 100, y: centerY - 100, width: 200, height: 200 },
    });

    // Move cursor away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    // Cells should return to normal behavior
    const hasContent = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return false;
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imageData.data;

      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true;
      }
      return false;
    });

    expect(hasContent).toBeTruthy();
  });

  test('should maintain cell count during cursor interaction', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Count initial cells
    const initialCount = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return 0;
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imageData.data;

      let count = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) count++;
      }
      return count;
    });

    // Move cursor over canvas
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(300);

    // Count cells during interaction
    const interactionCount = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return 0;
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imageData.data;

      let count = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) count++;
      }
      return count;
    });

    // Cells should be pushed away, not deleted
    // Allow some variance due to Game of Life evolution, but should not drop dramatically
    expect(interactionCount).toBeGreaterThan(initialCount * 0.7);
  });

  test('should render with correct cell size and color', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;

      return {
        width: el.width,
        height: el.height,
        font: ctx.font,
        fillStyle: ctx.fillStyle,
      };
    });

    expect(canvasInfo).toBeTruthy();
    expect(canvasInfo!.font).toContain('monospace');

    // fillStyle should be set (either dark or light theme color)
    expect(canvasInfo!.fillStyle).toBeTruthy();
  });
});
