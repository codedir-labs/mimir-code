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
    bundle: true, // Bundle for faster startup
    minify: false,
    external: [
      // Native modules must be external (they use dynamic requires)
      'better-sqlite3',
      'fsevents', // macOS file watcher (optional)
    ],
    noExternal: [
      // Bundle everything else
      /.*/,
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
