import { test, expect } from '@playwright/test';

/**
 * Calculate relative luminance for a color
 * Formula from WCAG 2.0: https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getLuminance(r: number, g: number, b: number): number {
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  const rLuminance = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLuminance = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLuminance = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * rLuminance + 0.7152 * gLuminance + 0.0722 * bLuminance;
}

/**
 * Calculate contrast ratio between two colors
 * Formula from WCAG 2.0: https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function getContrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number }
): number {
  const fgLuminance = getLuminance(fg.r, fg.g, fg.b);
  const bgLuminance = getLuminance(bg.r, bg.g, bg.b);

  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse RGB color string to components
 */
function parseRGB(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) {
    const rgbaMatch = rgbString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
    if (!rgbaMatch) return null;
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
    };
  }
  return {
    r: parseInt(match[1]),
    g: parseInt(match[2]),
    b: parseInt(match[3]),
  };
}

test.describe('WCAG Contrast Ratios', () => {
  test('body text should have sufficient contrast in light mode', async ({ page }) => {
    await page.goto('/docs');

    // Ensure we're in light mode
    const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    if (isDark) {
      const themeToggle = page.locator('button').filter({ hasText: /theme/i }).first();
      if ((await themeToggle.count()) > 0) {
        await themeToggle.click();
        await page.waitForTimeout(500);
      }
    }

    const bodyColors = await page.locator('body').evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
      };
    });

    const fg = parseRGB(bodyColors.color);
    const bg = parseRGB(bodyColors.backgroundColor);

    if (!fg || !bg) {
      console.log('Could not parse colors:', bodyColors);
      return;
    }

    const contrast = getContrastRatio(fg, bg);
    console.log(`Light mode body contrast: ${contrast.toFixed(2)}:1`);

    // WCAG AA requires 4.5:1 for normal text
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  test('body text should have sufficient contrast in dark mode', async ({ page }) => {
    await page.goto('/docs');

    // Switch to dark mode
    const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
    if (!isDark) {
      const themeToggle = page.locator('button').filter({ hasText: /theme/i }).first();
      if ((await themeToggle.count()) > 0) {
        await themeToggle.click();
        await page.waitForTimeout(500);
      }
    }

    const bodyColors = await page.locator('body').evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
      };
    });

    const fg = parseRGB(bodyColors.color);
    const bg = parseRGB(bodyColors.backgroundColor);

    if (!fg || !bg) {
      console.log('Could not parse colors:', bodyColors);
      return;
    }

    const contrast = getContrastRatio(fg, bg);
    console.log(`Dark mode body contrast: ${contrast.toFixed(2)}:1`);

    // WCAG AA requires 4.5:1 for normal text
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  test('code blocks should have sufficient contrast in dark mode', async ({ page }) => {
    await page.goto('/docs');

    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(300);

    const codeBlock = page.locator('pre code').first();

    if ((await codeBlock.count()) === 0) {
      console.log('No code blocks found on page');
      return;
    }

    const codeColors = await codeBlock.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const preStyles = window.getComputedStyle(el.closest('pre')!);
      return {
        color: styles.color,
        backgroundColor: preStyles.backgroundColor,
      };
    });

    const fg = parseRGB(codeColors.color);
    const bg = parseRGB(codeColors.backgroundColor);

    if (!fg || !bg) {
      console.log('Could not parse code colors:', codeColors);
      return;
    }

    const contrast = getContrastRatio(fg, bg);
    console.log(`Code block contrast (dark): ${contrast.toFixed(2)}:1`);

    // Code should have high contrast (7:1 is AAA level)
    expect(contrast).toBeGreaterThanOrEqual(7.0);
  });

  test('primary accent should have sufficient contrast in dark mode', async ({ page }) => {
    await page.goto('/docs');

    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(300);

    // Look for primary-colored elements (links, buttons)
    const link = page.locator('a').first();

    if ((await link.count()) === 0) {
      console.log('No links found');
      return;
    }

    const linkColors = await link.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      // Get background from parent
      let bgEl: Element | null = el;
      let bgColor = styles.backgroundColor;
      while (bgEl && (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent')) {
        bgEl = bgEl.parentElement;
        if (bgEl) {
          bgColor = window.getComputedStyle(bgEl).backgroundColor;
        }
      }
      return {
        color: styles.color,
        backgroundColor: bgColor,
      };
    });

    const fg = parseRGB(linkColors.color);
    const bg = parseRGB(linkColors.backgroundColor);

    if (!fg || !bg) {
      console.log('Could not parse link colors:', linkColors);
      return;
    }

    const contrast = getContrastRatio(fg, bg);
    console.log(`Link contrast (dark): ${contrast.toFixed(2)}:1`);

    // Links should meet AA standard (4.5:1)
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  test('navbar should have visible border in dark mode', async ({ page }) => {
    await page.goto('/docs');

    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(300);

    const navbar = page.locator('nav, .nextra-nav-container').first();

    if ((await navbar.count()) === 0) {
      console.log('No navbar found');
      return;
    }

    const navbarStyles = await navbar.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        borderBottom: styles.borderBottom,
        borderBottomWidth: styles.borderBottomWidth,
        borderBottomColor: styles.borderBottomColor,
      };
    });

    console.log('Navbar border:', navbarStyles);

    // Border should be at least 2px
    const borderWidth = parseInt(navbarStyles.borderBottomWidth);
    expect(borderWidth).toBeGreaterThanOrEqual(2);
  });

  test('terminal chrome border should be visible in dark mode', async ({ page }) => {
    await page.goto('/docs');

    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(300);

    const codeBlock = page.locator('pre').first();

    if ((await codeBlock.count()) === 0) {
      console.log('No code blocks found');
      return;
    }

    const preStyles = await codeBlock.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        border: styles.border,
        borderWidth: styles.borderWidth,
        borderColor: styles.borderColor,
      };
    });

    console.log('Code block border:', preStyles);

    // Border should be at least 2px
    const borderWidth = parseInt(preStyles.borderWidth);
    expect(borderWidth).toBeGreaterThanOrEqual(2);
  });

  test('landing page background pattern should be visible in dark mode', async ({ page }) => {
    await page.goto('/');

    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(300);

    // Check for background pattern element
    const bgPattern = page.locator('.bg-\\[radial-gradient').first();

    if ((await bgPattern.count()) === 0) {
      console.log('No background pattern found');
      return;
    }

    const opacity = await bgPattern.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return parseFloat(styles.opacity);
    });

    console.log('Background pattern opacity (dark):', opacity);

    // Opacity should be at least 0.3 for visibility
    expect(opacity).toBeGreaterThanOrEqual(0.3);
  });
});
