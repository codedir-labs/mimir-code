import { defineConfig } from 'tsup';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: [
      // Native modules
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
    onSuccess: async () => {
      // Copy WASM file to dist/binaries/resources/ for development/testing
      const resourcesDir = join(__dirname, 'dist', 'binaries', 'resources');
      if (!existsSync(resourcesDir)) {
        mkdirSync(resourcesDir, { recursive: true });
      }

      const wasmSource = join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
      const wasmDest = join(resourcesDir, 'sql-wasm.wasm');

      if (existsSync(wasmSource)) {
        copyFileSync(wasmSource, wasmDest);
        console.log('✅ Copied sql-wasm.wasm to dist/binaries/resources/');
      }
    },
  },
]);
