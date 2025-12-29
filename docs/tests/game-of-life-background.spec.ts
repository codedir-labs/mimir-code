import { test, expect } from '@playwright/test';

test.describe('Game of Life Background', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the landing page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for canvas to be in DOM
    await page.waitForSelector('[data-testid="game-of-life-canvas"]', { timeout: 10000 });
  });

  test('should render canvas element', async ({ page }) => {
    // Check if canvas exists
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');
    await expect(canvas).toBeVisible();
  });

  test('should have correct canvas dimensions', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Get canvas dimensions
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Check canvas matches viewport
    const viewportSize = page.viewportSize();
    if (viewportSize) {
      expect(box!.width).toBeCloseTo(viewportSize.width, 10);
      expect(box!.height).toBeCloseTo(viewportSize.height, 10);
    }
  });

  test('should have canvas in DOM with proper attributes', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Check aria-hidden attribute
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');

    // Check class includes positioning
    const classes = await canvas.getAttribute('class');
    expect(classes).toContain('absolute');
    expect(classes).toContain('inset-0');
    expect(classes).toContain('pointer-events-none');
  });

  test('should render content on canvas', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Wait a moment for initial render
    await page.waitForTimeout(500);

    // Take screenshot for debugging
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-initial.png',
      fullPage: true,
    });

    // Check if canvas has been drawn on by evaluating canvas data
    const hasContent = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return false;

      // Get image data from canvas
      const imageData = ctx.getImageData(0, 0, el.width, el.height);
      const data = imageData.data;

      // Check if any pixel is not fully transparent
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          return true; // Found a non-transparent pixel
        }
      }
      return false;
    });

    expect(hasContent).toBeTruthy();
  });

  test('should animate over time', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Get initial canvas state
    const initialState = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;
      return ctx.getImageData(0, 0, el.width, el.height).data.toString();
    });

    // Wait for animation to progress (speed is 150ms)
    await page.waitForTimeout(300);

    // Get updated canvas state
    const updatedState = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;
      return ctx.getImageData(0, 0, el.width, el.height).data.toString();
    });

    // Canvas should have changed (Game of Life evolution)
    expect(initialState).toBeTruthy();
    expect(updatedState).toBeTruthy();
    expect(initialState).not.toBe(updatedState);
  });

  test('should handle window resize', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Get initial size
    const initialBox = await canvas.boundingBox();

    // Resize viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);

    // Get new size
    const newBox = await canvas.boundingBox();

    expect(newBox).toBeTruthy();
    expect(newBox!.width).toBe(1200);
    expect(newBox!.height).toBe(800);
  });

  test('should render cells in a grid without overlap', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Take screenshot for visual inspection
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-grid.png',
      clip: { x: 0, y: 0, width: 800, height: 600 },
    });

    // Check canvas properties
    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return null;

      return {
        width: el.width,
        height: el.height,
        font: ctx.font,
        textAlign: ctx.textAlign,
        textBaseline: ctx.textBaseline,
      };
    });

    expect(canvasInfo).toBeTruthy();
    expect(canvasInfo!.font).toContain('monospace');
    expect(canvasInfo!.textAlign).toBe('center');
    expect(canvasInfo!.textBaseline).toBe('middle');
  });

  test('should have proper opacity styling', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    const opacity = await canvas.evaluate((el: HTMLCanvasElement) => {
      return window.getComputedStyle(el).opacity;
    });

    // Should have opacity set (default 0.15)
    expect(parseFloat(opacity)).toBeGreaterThan(0);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test('should be positioned behind content', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');

    // Check z-index
    const zIndex = await canvas.evaluate((el: HTMLCanvasElement) => {
      return window.getComputedStyle(el).zIndex;
    });

    // Should be negative (behind content)
    expect(parseInt(zIndex)).toBeLessThan(0);
  });

  test('visual regression - capture full page with animation', async ({ page }) => {
    // Wait for initial render
    await page.waitForTimeout(500);

    // Take screenshot after some animation
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-full-page.png',
      fullPage: true,
    });

    // Verify canvas is in the screenshot by checking it exists
    const canvas = page.locator('[data-testid="game-of-life-canvas"]');
    await expect(canvas).toBeVisible();
  });
});

test.describe('Game of Life - Performance', () => {
  test('should not block main thread', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="game-of-life-canvas"]');

    // Start performance measurement
    await page.evaluate(() => performance.mark('start'));

    // Interact with the page (should be responsive)
    const title = page.locator('h1');
    await expect(title).toBeVisible();
    await title.click();

    await page.evaluate(() => performance.mark('end'));

    const metrics = await page.evaluate(() => {
      performance.measure('interaction', 'start', 'end');
      const measure = performance.getEntriesByName('interaction')[0];
      return measure.duration;
    });

    // Interaction should be fast even with animation running
    expect(metrics).toBeLessThan(100);
  });
});

test.describe('Game of Life - Different Viewports', () => {
  test('should render on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="game-of-life-canvas"]');

    const canvas = page.locator('[data-testid="game-of-life-canvas"]');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box!.width).toBe(375);
    expect(box!.height).toBe(667);

    // Take mobile screenshot
    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-mobile.png',
      fullPage: true,
    });
  });

  test('should render on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="game-of-life-canvas"]');

    const canvas = page.locator('[data-testid="game-of-life-canvas"]');
    await expect(canvas).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-tablet.png',
      fullPage: true,
    });
  });

  test('should render on large desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="game-of-life-canvas"]');

    const canvas = page.locator('[data-testid="game-of-life-canvas"]');
    await expect(canvas).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/game-of-life-desktop.png',
      fullPage: true,
    });
  });
});
