# Playwright Tests for Mimir Docs

## Overview

This directory contains end-to-end tests using Playwright for the Mimir documentation site.

## Test Structure

```
tests/
├── game-of-life-background.spec.ts  # Tests for animated background
└── README.md                         # This file
```

## Running Tests

```bash
# Run all tests
yarn playwright test

# Run specific test file
yarn playwright test game-of-life-background.spec.ts

# Run in headed mode (see browser)
yarn playwright test --headed

# Run specific browser
yarn playwright test --project=chromium

# Debug mode
yarn playwright test --debug

# Update snapshots
yarn playwright test --update-snapshots
```

## Test Artifacts

### Screenshots
- Location: `test-results/screenshots/`
- **Gitignored**: Yes
- Purpose: Visual debugging and regression testing
- Auto-cleanup: Screenshots in `test-results/` are automatically cleaned between test runs

### Reports
- Location: `playwright-report/`
- **Gitignored**: Yes
- View report: `yarn playwright show-report`

### Test Results
- Location: `test-results/`
- **Gitignored**: Yes
- Contains test output, screenshots, and traces

## Best Practices

### 1. Screenshots for Debugging

```typescript
// Take screenshot for debugging
await page.screenshot({
  path: 'test-results/screenshots/my-debug-screenshot.png',
  fullPage: true,
});
```

- ✅ Store in `test-results/screenshots/`
- ✅ Use descriptive names
- ✅ Automatically gitignored
- ❌ Don't commit screenshots to git

### 2. Test Data Attributes

```typescript
// Use data-testid for reliable selectors
const canvas = page.locator('[data-testid="game-of-life-canvas"]');
```

- ✅ Stable across styling changes
- ✅ Clear intent
- ✅ Easy to find in tests

### 3. Wait Strategies

```typescript
// Prefer specific waits over networkidle for dev servers
await page.goto('/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="my-element"]');
```

- ✅ Faster tests
- ✅ More reliable with Hot Reload
- ❌ Avoid `networkidle` with dev servers

### 4. Test Organization

- Group related tests with `test.describe()`
- Use descriptive test names
- One assertion per test when possible
- Clean up resources in `afterEach` if needed

### 5. Visual Regression Testing

```typescript
// Compare screenshots
await expect(page).toHaveScreenshot('my-component.png');
```

- Store baseline screenshots in git (separate from debug screenshots)
- Use `--update-snapshots` to update baselines
- Run on consistent environment (CI)

## Gitignore Configuration

The following are automatically excluded from git:

```
/test-results/       # Test output, screenshots, traces
/playwright-report/  # HTML reports
/playwright/.cache/  # Playwright cache
```

## Debugging Failed Tests

1. Check the HTML report: `yarn playwright show-report`
2. Look at screenshots in `test-results/screenshots/`
3. Review traces in `test-results/`
4. Run in headed mode: `yarn playwright test --headed`
5. Use debug mode: `yarn playwright test --debug`

## CI/CD Integration

Tests can run in CI with:

```yaml
- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run tests
  run: yarn playwright test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Performance Testing

The test suite includes performance checks:
- Main thread responsiveness
- Animation frame rates
- Interaction latency

## Cross-Browser Testing

Tests run on:
- Chromium (Chrome, Edge)
- Firefox
- WebKit (Safari)
- Mobile viewports (iOS, Android)

## Common Issues

### Test Timeout

```
Error: page.waitForLoadState: Test timeout
```

**Solution**: Use `domcontentloaded` instead of `networkidle` for dev servers

### Canvas Not Rendering

Check:
1. Canvas element exists in DOM
2. Canvas has non-zero dimensions
3. 2D context is available
4. Animation loop is running

### Fast Refresh Loop

If tests cause infinite reloads:
1. Check for state updates in useEffect
2. Ensure dependencies array is correct
3. Verify cleanup functions are called
4. Use debouncing for resize handlers
