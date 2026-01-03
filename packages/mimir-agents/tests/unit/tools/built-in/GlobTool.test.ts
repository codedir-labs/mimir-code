/**
 * Tests for GlobTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GlobTool } from '../../../../src/tools/built-in/GlobTool.js';
import { MockFileSystem } from '../../../mocks/MockFileSystem.js';

describe('GlobTool', () => {
  let fs: MockFileSystem;
  let tool: GlobTool;

  beforeEach(() => {
    fs = new MockFileSystem();
    tool = new GlobTool(fs);
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('glob');
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(70);
    });
  });

  describe('execute', () => {
    it('should find files matching pattern', async () => {
      await fs.writeFile('/src/file1.ts', 'content');
      await fs.writeFile('/src/file2.ts', 'content');
      await fs.writeFile('/src/file3.js', 'content');

      const result = await tool.execute(
        {
          pattern: '*.ts',
          cwd: '/src',
        },
        {}
      );

      expect(result.success).toBe(true);
      const matches = result.output as string[];
      expect(matches).toContain('file1.ts');
      expect(matches).toContain('file2.ts');
      expect(matches).not.toContain('file3.js');
    });

    it('should support wildcard patterns', async () => {
      await fs.writeFile('/src/app/main.ts', 'content');
      await fs.writeFile('/src/app/util.ts', 'content');
      await fs.writeFile('/src/test/test.ts', 'content');

      const result = await tool.execute(
        {
          pattern: '**/*.ts',
          cwd: '/src',
        },
        {}
      );

      expect(result.success).toBe(true);
      const matches = result.output as string[];
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should ignore default patterns', async () => {
      await fs.writeFile('/node_modules/pkg/index.js', 'content');
      await fs.writeFile('/src/app.js', 'content');

      const result = await tool.execute(
        {
          pattern: '**/*.js',
          cwd: '/',
        },
        {}
      );

      expect(result.success).toBe(true);
      const matches = result.output as string[];
      expect(matches).not.toContain('node_modules/pkg/index.js');
    });

    it('should respect max results', async () => {
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(`/file${i}.txt`, 'content');
      }

      const result = await tool.execute(
        {
          pattern: '*.txt',
          cwd: '/',
          maxResults: 5,
        },
        {}
      );

      expect(result.success).toBe(true);
      const matches = result.output as string[];
      expect(matches.length).toBe(5);
      expect(result.metadata?.truncated).toBe(true);
    });

    it('should handle no matches', async () => {
      const result = await tool.execute(
        {
          pattern: '*.nonexistent',
          cwd: '/',
        },
        {}
      );

      expect(result.success).toBe(true);
      const matches = result.output as string[];
      expect(matches.length).toBe(0);
    });
  });
});
