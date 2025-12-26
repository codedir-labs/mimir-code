import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build for library usage
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    dts: true,
    splitting: false,
    shims: true,
    minify: false,
    external: ['react', 'ink'],
  },
  // ESM build for CLI (npm package - can run directly)
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node18',
    outDir: 'dist',
    outExtension: () => ({ js: '.mjs' }),
    clean: false,
    sourcemap: true,
    dts: false,
    splitting: false,
    bundle: true,
    minify: false,
    external: [
      // Native modules
      'better-sqlite3',
      'fsevents',
      // UI libraries
      'ink',
      'react',
      'react-dom',
      'yoga-layout',
      'ink-spinner',
      'ink-select-input',
      'ink-text-input',
      'ink-table',
      'react-devtools-core',
    ],
  },
]);
