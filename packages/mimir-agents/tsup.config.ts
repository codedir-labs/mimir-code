import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'execution/index': 'src/execution/index.ts',
    'memory/index': 'src/memory/index.ts',
    'modes/index': 'src/modes/index.ts',
    'orchestration/index': 'src/orchestration/index.ts',
    'tools/index': 'src/tools/index.ts',
    'mcp/index': 'src/mcp/index.ts',
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
