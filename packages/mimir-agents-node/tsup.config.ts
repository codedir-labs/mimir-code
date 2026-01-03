import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'platform/index': 'src/platform/index.ts',
    'providers/index': 'src/providers/index.ts',
    'storage/index': 'src/storage/index.ts',
    'execution/index': 'src/execution/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  shims: true,
  minify: false,
});
