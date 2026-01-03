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
      // Target thresholds for v1.0:
      //   - Global: 60% lines, 50% branches
      //   - Security (src/security/**): 80% lines, 70% branches
      //   - Core agent logic: 70% lines, 60% branches
      //
      // Current state: ~13% lines, ~28% functions, ~62% branches
      // See: https://github.com/codedir-labs/mimir-code/issues/XXX for tracking
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
      '@/features': path.resolve(__dirname, './src/features'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@': path.resolve(__dirname, './src'),
      // Package aliases for tests
      '@codedir/mimir-agents': path.resolve(__dirname, './packages/mimir-agents/src'),
      '@codedir/mimir-agents-node': path.resolve(__dirname, './packages/mimir-agents-node/src'),
    },
  },
});
