/**
 * Tests for BashTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BashTool } from '../../../../src/tools/built-in/BashTool.js';
import type { IExecutor } from '../../../../src/execution/IExecutor.js';

describe('BashTool', () => {
  let mockExecutor: IExecutor;
  let tool: BashTool;

  beforeEach(() => {
    // Mock executor
    mockExecutor = {
      execute: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      exists: vi.fn(),
      listDir: vi.fn(),
      deleteFile: vi.fn(),
      initialize: vi.fn(),
      cleanup: vi.fn(),
      getMode: vi.fn(() => 'native'),
      getCwd: vi.fn(() => '/workspace'),
      setCwd: vi.fn(),
    } as any;

    tool = new BashTool();
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('bash');
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(90);
    });

    it('should have description warning about grep/glob', () => {
      expect(tool.definition.description).toContain('grep/glob tools');
    });
  });

  describe('execute', () => {
    it('should execute command successfully', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: 'hello\n',
        stderr: '',
        exitCode: 0,
        duration: 100,
      });

      const result = await tool.execute({ command: 'echo "hello"' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        stdout: 'hello\n',
        stderr: '',
        exitCode: 0,
      });
      expect(result.metadata?.success).toBe(true);
      expect(result.metadata?.exitCode).toBe(0);
    });

    it('should handle command failure', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 1,
        duration: 50,
      });

      const result = await tool.execute({ command: 'false' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        stdout: '',
        stderr: '',
        exitCode: 1,
      });
      expect(result.metadata?.success).toBe(false);
      expect(result.metadata?.exitCode).toBe(1);
    });

    it('should handle stderr output', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: '',
        stderr: 'ls: cannot access /nonexistent: No such file or directory',
        exitCode: 2,
        duration: 100,
      });

      const result = await tool.execute({ command: 'ls /nonexistent' }, { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.output?.stderr).toContain('No such file or directory');
      expect(result.metadata?.exitCode).toBe(2);
    });

    it('should pass cwd to executor', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 10,
      });

      await tool.execute({ command: 'pwd', cwd: '/tmp' }, { executor: mockExecutor });

      expect(mockExecutor.execute).toHaveBeenCalledWith('pwd', { cwd: '/tmp', timeout: 30000 });
    });

    it('should pass timeout to executor', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 10,
      });

      await tool.execute({ command: 'sleep 5', timeout: 5000 }, { executor: mockExecutor });

      expect(mockExecutor.execute).toHaveBeenCalledWith('sleep 5', {
        cwd: undefined,
        timeout: 5000,
      });
    });

    it('should use default timeout', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 10,
      });

      await tool.execute({ command: 'echo test' }, { executor: mockExecutor });

      expect(mockExecutor.execute).toHaveBeenCalledWith('echo test', {
        cwd: undefined,
        timeout: 30000,
      });
    });

    it('should handle executor errors', async () => {
      vi.mocked(mockExecutor.execute).mockRejectedValue(new Error('Process execution failed'));

      const result = await tool.execute({ command: 'test' }, { executor: mockExecutor });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Process execution failed');
      expect(result.metadata?.command).toBe('test');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockExecutor.execute).mockRejectedValue('String error');

      const result = await tool.execute({ command: 'test' }, { executor: mockExecutor });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to execute command');
    });

    it('should include command in metadata', async () => {
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        stdout: 'total 0',
        stderr: '',
        exitCode: 0,
        duration: 10,
      });

      const result = await tool.execute({ command: 'ls -la' }, { executor: mockExecutor });

      expect(result.metadata?.command).toBe('ls -la');
    });

    it('should return error if executor not provided', async () => {
      const result = await tool.execute({ command: 'test' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Executor not available in context');
    });
  });
});
