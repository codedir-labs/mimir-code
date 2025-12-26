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
  // Bundled CommonJS build for CLI (npm and pkg)
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    target: 'node18',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: false,
    splitting: false,
    bundle: true,
    minify: false,
    external: [
      // Native modules (use dynamic requires)
      'better-sqlite3',
      'fsevents',
      // UI libraries (use ESM features like top-level await)
      'ink',
      'react',
      'react-dom',
      'yoga-layout',
      'ink-spinner',
      'ink-select-input',
      'ink-text-input',
      'ink-table',
      // Optional dev tools
      'react-devtools-core',
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
