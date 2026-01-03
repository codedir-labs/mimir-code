/**
 * Tests for WriteFileTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WriteFileTool } from '../../../../src/tools/built-in/WriteFileTool.js';
import type { IExecutor } from '../../../../src/execution/IExecutor.js';

describe('WriteFileTool', () => {
  let mockExecutor: IExecutor;
  let tool: WriteFileTool;
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

    tool = new WriteFileTool();
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('write_file');
    });

    it('should have description', () => {
      expect(tool.definition.description).toBeTruthy();
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(60);
    });
  });

  describe('validate', () => {
    it('should validate correct arguments', () => {
      const result = tool.validate({ path: '/test/file.txt', content: 'Hello' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ path: '/test/file.txt', content: 'Hello' });
    });

    it('should reject missing path', () => {
      const result = tool.validate({ content: 'Hello' });
      expect(result.success).toBe(false);
    });

    it('should reject missing content', () => {
      const result = tool.validate({ path: '/test/file.txt' });
      expect(result.success).toBe(false);
    });
  });

  describe('execute', () => {
    it('should write file successfully', async () => {
      const result = await tool.execute(
        { path: '/test/file.txt', content: 'Hello, World!' },
        { executor: mockExecutor }
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ path: '/test/file.txt', bytesWritten: 13 });
      expect(result.metadata?.path).toBe('/test/file.txt');
      expect(result.metadata?.size).toBe(13);

      // Verify file was actually written
      const content = await mockExecutor.readFile('/test/file.txt');
      expect(content).toBe('Hello, World!');
    });

    it('should overwrite existing file', async () => {
      fileContents.set('/test/file.txt', 'Old content');

      const result = await tool.execute(
        { path: '/test/file.txt', content: 'New content' },
        { executor: mockExecutor }
      );

      expect(result.success).toBe(true);

      const content = await mockExecutor.readFile('/test/file.txt');
      expect(content).toBe('New content');
    });

    it('should create parent directories', async () => {
      const result = await tool.execute(
        { path: '/deep/nested/dir/file.txt', content: 'Content' },
        { executor: mockExecutor }
      );

      expect(result.success).toBe(true);

      const content = await mockExecutor.readFile('/deep/nested/dir/file.txt');
      expect(content).toBe('Content');
    });

    it('should handle empty content', async () => {
      const result = await tool.execute(
        { path: '/test/empty.txt', content: '' },
        { executor: mockExecutor }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.size).toBe(0);

      const content = await mockExecutor.readFile('/test/empty.txt');
      expect(content).toBe('');
    });

    it('should return error if executor not provided', async () => {
      const result = await tool.execute({ path: '/test/file.txt', content: 'test' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Executor not available in context');
    });
  });

  describe('getSchema', () => {
    it('should return JSON schema', () => {
      const schema = tool.getSchema();

      expect(schema.name).toBe('write_file');
      expect(schema.description).toBeTruthy();
      expect(schema.parameters).toBeDefined();
    });

    it('should include parameter descriptions', () => {
      const schema = tool.getSchema() as any;

      expect(schema.parameters.properties.path).toBeDefined();
      expect(schema.parameters.properties.content).toBeDefined();
      expect(schema.parameters.properties.path.type).toBe('string');
      expect(schema.parameters.properties.content.type).toBe('string');
    });
  });
});
