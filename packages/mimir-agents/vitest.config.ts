import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types.ts',
      ],
      // ========================================================================
      // COVERAGE THRESHOLDS - PROTOTYPING PHASE
      // ========================================================================
      // During prototyping, we use advisory thresholds (not enforced in CI).
      // Coverage is reported but won't fail builds. Focus on test quality over
      // quantity - meaningful assertions matter more than hitting percentages.
      //
      // This is the core package - target higher thresholds for v1.0:
      //   - Security (src/security/**): 80% lines, 70% branches
      //   - Core orchestration: 70% lines, 60% branches
      //   - Global: 60% lines, 50% branches
      // ========================================================================
      // thresholds: {
      //   lines: 60,
      //   functions: 60,
      //   branches: 50,
      //   statements: 60,
      // },
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
