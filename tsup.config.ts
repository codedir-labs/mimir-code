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
  // CommonJS build for CLI (required for pkg)
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    target: 'node18',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: false,
    splitting: false,
    shims: true,
    minify: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
