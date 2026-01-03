/**
 * Tests for ReadFileTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadFileTool } from '../../../../src/tools/built-in/ReadFileTool.js';
import type { IExecutor } from '../../../../src/execution/IExecutor.js';

describe('ReadFileTool', () => {
  let mockExecutor: IExecutor;
  let tool: ReadFileTool;
  const fileContents = new Map<string, string>();

  beforeEach(() => {
    fileContents.clear();

    // Mock executor
    mockExecutor = {
      execute: vi.fn(),
      readFile: vi.fn((path: string) => {
        if (!fileContents.has(path)) {
          throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        return Promise.resolve(fileContents.get(path)!);
      }),
      writeFile: vi.fn((path: string, content: string) => {
        fileContents.set(path, content);
        return Promise.resolve();
      }),
      exists: vi.fn(),
      listDir: vi.fn(),
      deleteFile: vi.fn(),
      initialize: vi.fn(),
      cleanup: vi.fn(),
      getMode: vi.fn(() => 'native'),
      getCwd: vi.fn(() => '/workspace'),
      setCwd: vi.fn(),
    } as any;

    tool = new ReadFileTool();
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('read_file');
    });

    it('should have description', () => {
      expect(tool.definition.description).toBeTruthy();
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(50);
    });
  });

  describe('validate', () => {
    it('should validate correct arguments', () => {
      const result = tool.validate({ path: '/test/file.txt' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ path: '/test/file.txt' });
    });

    it('should reject missing path', () => {
      const result = tool.validate({});
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject invalid path type', () => {
      const result = tool.validate({ path: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    it('should read file successfully', async () => {
      fileContents.set('/test/file.txt', 'Hello, World!');

      const result = await tool.execute({ path: '/test/file.txt' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello, World!');
      expect(result.metadata?.path).toBe('/test/file.txt');
      expect(result.metadata?.size).toBe(13);
    });

    it('should return error if file does not exist', async () => {
      const result = await tool.execute({ path: '/nonexistent.txt' }, { executor: mockExecutor });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.metadata?.path).toBe('/nonexistent.txt');
    });

    it('should handle empty files', async () => {
      fileContents.set('/test/empty.txt', '');

      const result = await tool.execute({ path: '/test/empty.txt' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output).toBe('');
      expect(result.metadata?.size).toBe(0);
    });

    it('should add line numbers to content', async () => {
      fileContents.set('/test/numbered.txt', 'line 1\nline 2\nline 3');

      const result = await tool.execute({ path: '/test/numbered.txt' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output).toContain('1→line 1');
      expect(result.output).toContain('2→line 2');
      expect(result.output).toContain('3→line 3');
    });

    it('should truncate large files', async () => {
      const largeContent = 'x'.repeat(50000);
      fileContents.set('/test/large.txt', largeContent);

      const result = await tool.execute({ path: '/test/large.txt' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output).toContain('[FILE TRUNCATED');
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.size).toBe(50000);
    });

    it('should support offset and limit', async () => {
      fileContents.set('/test/lines.txt', 'line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await tool.execute(
        { path: '/test/lines.txt', offset: 2, limit: 2 },
        { executor: mockExecutor }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('2→line 2');
      expect(result.output).toContain('3→line 3');
      expect(result.output).not.toContain('1→line 1');
      expect(result.output).not.toContain('4→line 4');
      expect(result.metadata?.startLine).toBe(2);
      expect(result.metadata?.linesRead).toBe(2);
    });

    it('should return error if executor not provided', async () => {
      const result = await tool.execute({ path: '/test/file.txt' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Executor not available in context');
    });
  });
});
