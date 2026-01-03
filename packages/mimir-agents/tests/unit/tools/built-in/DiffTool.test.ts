/**
 * Tests for DiffTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiffTool } from '../../../../src/tools/built-in/DiffTool.js';
import { MockFileSystem } from '../../../mocks/MockFileSystem.js';

describe('DiffTool', () => {
  let fs: MockFileSystem;
  let tool: DiffTool;

  beforeEach(() => {
    fs = new MockFileSystem();
    tool = new DiffTool(fs);
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('diff');
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(80);
    });
  });

  describe('execute', () => {
    it('should diff two files', async () => {
      await fs.writeFile('/old.txt', 'line1\nline2\nline3');
      await fs.writeFile('/new.txt', 'line1\nline2 modified\nline3');

      const result = await tool.execute({ oldPath: '/old.txt', newPath: '/new.txt' }, {});

      expect(result.success).toBe(true);
      expect(result.output).toContain('--- /old.txt');
      expect(result.output).toContain('+++ /new.txt');
      expect(result.output).toContain('-line2');
      expect(result.output).toContain('+line2 modified');
      expect(result.metadata?.hasChanges).toBe(true);
    });

    it('should diff string content', async () => {
      const result = await tool.execute(
        {
          oldContent: 'hello\nworld',
          newContent: 'hello\neveryone',
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('-world');
      expect(result.output).toContain('+everyone');
    });

    it('should detect no changes', async () => {
      await fs.writeFile('/file.txt', 'same content');

      const result = await tool.execute(
        {
          oldPath: '/file.txt',
          newPath: '/file.txt',
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.hasChanges).toBe(false);
    });

    it('should handle mixed file and content', async () => {
      await fs.writeFile('/old.txt', 'old content');

      const result = await tool.execute(
        {
          oldPath: '/old.txt',
          newContent: 'new content',
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('-old content');
      expect(result.output).toContain('+new content');
    });

    it('should return error if old content missing', async () => {
      const result = await tool.execute({ newContent: 'test' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('oldPath or oldContent');
    });

    it('should return error if new content missing', async () => {
      const result = await tool.execute({ oldContent: 'test' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('newPath or newContent');
    });

    it('should handle file not found', async () => {
      const result = await tool.execute(
        {
          oldPath: '/nonexistent.txt',
          newContent: 'test',
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should support simple diff format', async () => {
      const result = await tool.execute(
        {
          oldContent: 'line1\nline2',
          newContent: 'line1\nline3',
          unified: false,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('- line2');
      expect(result.output).toContain('+ line3');
    });

    it('should calculate lines added and removed', async () => {
      const result = await tool.execute(
        {
          oldContent: 'a\nb\nc',
          newContent: 'a\nd\ne\nf',
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.linesRemoved).toBeGreaterThan(0);
      expect(result.metadata?.linesAdded).toBeGreaterThan(0);
    });
  });
});
