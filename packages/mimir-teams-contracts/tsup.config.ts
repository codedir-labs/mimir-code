import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'generated/index': 'src/generated/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false, // Skip DTS generation for generated code
  splitting: false,
  shims: true,
  minify: false,
});
