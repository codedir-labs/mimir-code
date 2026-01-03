/**
 * Tests for GrepTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GrepTool } from '../../../../src/tools/built-in/GrepTool.js';
import { MockFileSystem } from '../../../mocks/MockFileSystem.js';

describe('GrepTool', () => {
  let fs: MockFileSystem;
  let tool: GrepTool;

  beforeEach(() => {
    fs = new MockFileSystem();
    tool = new GrepTool(fs);
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('grep');
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(100);
    });
  });

  describe('execute', () => {
    it('should find pattern in file', async () => {
      await fs.writeFile('/test.txt', 'hello world\nfoo bar\nhello again');

      const result = await tool.execute(
        {
          pattern: 'hello',
          paths: ['/test.txt'],
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('/test.txt:1');
      expect(result.output).toContain('hello world');
      expect(result.output).toContain('/test.txt:3');
      expect(result.output).toContain('hello again');
      expect(result.metadata?.matchCount).toBe(2);
    });

    it('should support case-insensitive search', async () => {
      await fs.writeFile('/test.txt', 'Hello World\nhELLO world');

      const result = await tool.execute(
        {
          pattern: 'hello',
          paths: ['/test.txt'],
          ignoreCase: true,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(2);
    });

    it('should support regex patterns', async () => {
      await fs.writeFile('/test.txt', 'function foo()\nconst bar = 123\nfunction baz()');

      const result = await tool.execute(
        {
          pattern: 'function\\s+\\w+',
          paths: ['/test.txt'],
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(2);
    });

    it('should respect max results', async () => {
      await fs.writeFile('/test.txt', 'a\na\na\na\na\na\na\na\na\na');

      const result = await tool.execute(
        {
          pattern: 'a',
          paths: ['/test.txt'],
          maxResults: 5,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(5);
      expect(result.metadata?.truncated).toBe(true);
    });

    it('should handle no matches', async () => {
      await fs.writeFile('/test.txt', 'hello world');

      const result = await tool.execute(
        {
          pattern: 'nonexistent',
          paths: ['/test.txt'],
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('(no matches found)');
      expect(result.metadata?.matchCount).toBe(0);
    });

    it('should search recursively', async () => {
      await fs.writeFile('/dir/file1.txt', 'match here');
      await fs.writeFile('/dir/file2.txt', 'no match');
      await fs.writeFile('/dir/sub/file3.txt', 'another match');

      const result = await tool.execute(
        {
          pattern: 'match',
          paths: ['/dir'],
          recursive: true,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBeGreaterThan(0);
    });

    it('should limit output lines with headLimit', async () => {
      // Create file with many matches
      const lines = Array.from({ length: 100 }, (_, i) => `match ${i}`).join('\n');
      await fs.writeFile('/test.txt', lines);

      const result = await tool.execute(
        {
          pattern: 'match',
          paths: ['/test.txt'],
          headLimit: 10,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(10);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.output).toContain('[Output limited to 10 lines');
      expect(result.output).toContain('90 more matches omitted');
    });

    it('should not truncate when headLimit is greater than matches', async () => {
      await fs.writeFile('/test.txt', 'match 1\nmatch 2\nmatch 3');

      const result = await tool.execute(
        {
          pattern: 'match',
          paths: ['/test.txt'],
          headLimit: 100,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(3);
      expect(result.metadata?.truncated).toBeUndefined();
      expect(result.output).not.toContain('[Output limited to');
    });

    it('should work with headLimit=0', async () => {
      await fs.writeFile('/test.txt', 'match 1\nmatch 2\nmatch 3');

      const result = await tool.execute(
        {
          pattern: 'match',
          paths: ['/test.txt'],
          headLimit: 0,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(0);
      expect(result.output).toContain('(no matches found)');
    });

    it('should combine maxResults and headLimit correctly', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `match ${i}`).join('\n');
      await fs.writeFile('/test.txt', lines);

      // maxResults limits collection, headLimit limits output
      const result = await tool.execute(
        {
          pattern: 'match',
          paths: ['/test.txt'],
          maxResults: 50,
          headLimit: 10,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.matchCount).toBe(10); // headLimit wins
      expect(result.output).toContain('[Output limited to 10 lines');
    });
  });
});
