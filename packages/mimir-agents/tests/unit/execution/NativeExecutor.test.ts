/**
 * NativeExecutor tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { NativeExecutor } from '../../../src/execution/NativeExecutor.js';
import type { IFileSystem } from '../../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../../src/shared/platform/IProcessExecutor.js';
import type { PermissionManager } from '../../../src/features/permissions/manager/PermissionManager.js';
import type { ExecutionConfig } from '../../../src/execution/IExecutor.js';
import { PermissionDeniedError, SecurityError } from '../../../src/execution/IExecutor.js';

// Cross-platform path helpers
const normalizePath = (p: string): string => path.normalize(p);
const resolvePath = (...paths: string[]): string => path.resolve(...paths);

describe('NativeExecutor', () => {
  let executor: NativeExecutor;
  let mockFs: IFileSystem;
  let mockProcess: IProcessExecutor;
  let mockPermissionManager: PermissionManager;
  let config: ExecutionConfig;

  beforeEach(() => {
    // Mock filesystem
    mockFs = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      unlink: vi.fn(),
      resolve: vi.fn((...paths: string[]) => path.resolve(...paths)),
    } as any;

    // Mock process executor
    mockProcess = {
      execute: vi.fn(),
    } as any;

    // Mock permission manager
    mockPermissionManager = {
      checkPermission: vi.fn(),
    } as any;

    // Config (use cross-platform path)
    const projectDir =
      process.platform === 'win32' ? 'C:\\workspace\\project' : '/workspace/project';

    config = {
      mode: 'native',
      projectDir,
      filesystem: {
        readAccess: 'anywhere',
        writeAccess: ['${PROJECT_DIR}/**'],
        deniedPaths: ['**/.env', '**/.git/**'],
      },
    };

    executor = new NativeExecutor(mockFs, mockProcess, mockPermissionManager, config);
  });

  describe('initialize', () => {
    it('should not require initialization (no-op)', async () => {
      await expect(executor.initialize()).resolves.toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should execute command successfully', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
        reason: '',
      });

      vi.mocked(mockProcess.execute).mockResolvedValue({
        exitCode: 0,
        stdout: 'Hello World',
        stderr: '',
      });

      // Execute
      const result = await executor.execute('echo "Hello World"');

      // Verify
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello World');
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Check permission was verified
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'bash',
        command: 'echo "Hello World"',
        workingDir: config.projectDir,
      });

      // Check command was executed
      expect(mockProcess.execute).toHaveBeenCalledWith(
        'echo "Hello World"',
        expect.objectContaining({
          cwd: config.projectDir,
        })
      );
    });

    it('should throw PermissionDeniedError when permission denied', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: false,
        reason: 'Command blocked by denylist',
      });

      // Execute and expect error
      await expect(executor.execute('curl https://evil.com')).rejects.toThrow(
        PermissionDeniedError
      );

      // Verify command was NOT executed
      expect(mockProcess.execute).not.toHaveBeenCalled();
    });

    it('should throw SecurityError when cwd outside project', async () => {
      // Execute with cwd outside project
      await expect(executor.execute('ls', { cwd: '/etc' })).rejects.toThrow(SecurityError);

      // Verify command was NOT executed
      expect(mockProcess.execute).not.toHaveBeenCalled();
    });

    it('should audit successful execution', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockProcess.execute).mockResolvedValue({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      });

      // Execute
      await executor.execute('echo "ok"');

      // Check audit log
      const auditLog = executor.getAuditLog();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]).toMatchObject({
        type: 'bash',
        operation: 'echo "ok"',
        result: 'success',
        exitCode: 0,
      });
    });
  });

  describe('readFile', () => {
    it('should read file anywhere (no restriction)', async () => {
      // Setup mocks
      vi.mocked(mockFs.readFile).mockResolvedValue('file content');

      const testPath =
        process.platform === 'win32' ? 'C:\\anywhere\\file.txt' : '/anywhere/file.txt';

      // Read file
      const content = await executor.readFile(testPath);

      // Verify
      expect(content).toBe('file content');
      expect(mockFs.readFile).toHaveBeenCalledWith(normalizePath(testPath), 'utf-8');

      // No permission check for reads
      expect(mockPermissionManager.checkPermission).not.toHaveBeenCalled();
    });
  });

  describe('writeFile', () => {
    it('should write file within project', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockFs.writeFile).mockResolvedValue(undefined);

      const testPath = path.join(config.projectDir, 'src', 'test.ts');

      // Write file
      await executor.writeFile(testPath, 'content');

      // Verify
      expect(mockFs.writeFile).toHaveBeenCalledWith(normalizePath(testPath), 'content', 'utf-8');

      // Check permission was verified
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'file_write',
        path: normalizePath(testPath),
      });
    });

    it('should throw PermissionDeniedError when writing outside project', async () => {
      // Write outside project
      await expect(executor.writeFile('/etc/passwd', 'malicious')).rejects.toThrow(
        PermissionDeniedError
      );

      // Verify file was NOT written
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should throw PermissionDeniedError when writing to denied path', async () => {
      // Write to .env (denied)
      await expect(executor.writeFile('/workspace/project/.env', 'secrets')).rejects.toThrow(
        PermissionDeniedError
      );

      // Verify file was NOT written
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should create parent directories if requested', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockFs.mkdir).mockResolvedValue(undefined);
      vi.mocked(mockFs.writeFile).mockResolvedValue(undefined);

      const testPath = path.join(config.projectDir, 'new', 'dir', 'file.txt');
      const testDir = path.dirname(testPath);

      // Write file with createDirs option
      await executor.writeFile(testPath, 'content', { createDirs: true });

      // Verify directory was created
      expect(mockFs.mkdir).toHaveBeenCalledWith(normalizePath(testDir), { recursive: true });

      // Verify file was written
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file within project', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockFs.unlink).mockResolvedValue(undefined);

      const testPath = path.join(config.projectDir, 'temp.txt');

      // Delete file
      await executor.deleteFile(testPath);

      // Verify
      expect(mockFs.unlink).toHaveBeenCalledWith(normalizePath(testPath));
    });

    it('should throw PermissionDeniedError when deleting outside project', async () => {
      // Delete outside project
      await expect(executor.deleteFile('/etc/important-file')).rejects.toThrow(
        PermissionDeniedError
      );

      // Verify file was NOT deleted
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should not require cleanup (no-op)', async () => {
      await expect(executor.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('getMode', () => {
    it('should return "native"', () => {
      expect(executor.getMode()).toBe('native');
    });
  });

  describe('getCwd', () => {
    it('should return current working directory', () => {
      expect(executor.getCwd()).toBe(config.projectDir);
    });
  });

  describe('setCwd', () => {
    it('should update cwd within project', () => {
      const subdir = path.join(config.projectDir, 'subdir');
      executor.setCwd(subdir);
      expect(executor.getCwd()).toBe(subdir);
    });

    it('should throw SecurityError when cwd outside project', () => {
      expect(() => executor.setCwd('/tmp')).toThrow(SecurityError);
    });
  });

  describe('audit log', () => {
    it('should track all operations', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockProcess.execute).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      vi.mocked(mockFs.readFile).mockResolvedValue('content');
      vi.mocked(mockFs.writeFile).mockResolvedValue(undefined);

      const readPath = path.join(config.projectDir, 'file.txt');
      const writePath = path.join(config.projectDir, 'output.txt');

      // Perform operations
      await executor.execute('echo "test"');
      await executor.readFile(readPath);
      await executor.writeFile(writePath, 'content');

      // Check audit log
      const auditLog = executor.getAuditLog();
      expect(auditLog).toHaveLength(3);

      expect(auditLog[0]?.type).toBe('bash');
      expect(auditLog[1]?.type).toBe('file_read');
      expect(auditLog[2]?.type).toBe('file_write');
    });

    it('should clear audit log', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockProcess.execute).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      // Execute command
      await executor.execute('echo "test"');

      // Verify audit log has entry
      expect(executor.getAuditLog()).toHaveLength(1);

      // Clear audit log
      executor.clearAuditLog();

      // Verify audit log is empty
      expect(executor.getAuditLog()).toHaveLength(0);
    });
  });
});
