/**
 * CloudExecutor tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloudExecutor } from '../../../src/execution/CloudExecutor.js';
import type { IFileSystem } from '../../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../../src/shared/platform/IProcessExecutor.js';
import type { ITeamsAPIClient, CloudVM, VMStatus } from '../../../src/execution/CloudExecutor.js';
import type { PermissionManager } from '../../../src/features/permissions/manager/PermissionManager.js';
import type { ExecutionConfig } from '../../../src/execution/IExecutor.js';
import { PermissionDeniedError, SecurityError } from '../../../src/execution/IExecutor.js';

describe('CloudExecutor', () => {
  let executor: CloudExecutor;
  let mockFs: IFileSystem;
  let mockProcess: IProcessExecutor;
  let mockTeamsClient: ITeamsAPIClient;
  let mockPermissionManager: PermissionManager;
  let config: ExecutionConfig;

  const projectDir = process.platform === 'win32' ? 'C:\\workspace\\project' : '/workspace/project';

  beforeEach(() => {
    // Mock filesystem
    mockFs = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      unlink: vi.fn(),
      remove: vi.fn(),
      appendFile: vi.fn(),
      ensureDir: vi.fn(),
      resolve: vi.fn(),
      join: vi.fn(),
      dirname: vi.fn(),
      basename: vi.fn(),
    } as any;

    // Mock process executor
    mockProcess = {
      execute: vi.fn(),
    } as any;

    // Mock Teams API client
    mockTeamsClient = {
      provisionVM: vi.fn(),
      executeCommand: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      fileExists: vi.fn(),
      listDirectory: vi.fn(),
      deleteFile: vi.fn(),
      uploadProject: vi.fn(),
      downloadFiles: vi.fn(),
      destroyVM: vi.fn(),
      getVMStatus: vi.fn(),
      logAudit: vi.fn(),
    } as any;

    // Mock permission manager
    mockPermissionManager = {
      checkPermission: vi.fn(),
    } as any;

    // Config
    config = {
      mode: 'cloud',
      projectDir,
      cloud: {
        apiUrl: 'https://api.mimir.dev',
        orgId: 'org-123',
        authToken: 'token-abc',
        vmSize: 'standard',
        network: 'limited',
        allowedDomains: ['github.com', 'npmjs.com'],
        sessionTimeout: 3600,
      },
    };

    executor = new CloudExecutor(
      mockFs,
      mockProcess,
      mockTeamsClient,
      mockPermissionManager,
      config
    );
  });

  describe('initialize', () => {
    it('should provision VM and upload project files', async () => {
      // Setup mocks
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        ipAddress: '10.0.0.1',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      // Execute
      await executor.initialize();

      // Verify: provision VM
      expect(mockTeamsClient.provisionVM).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-123',
          size: 'standard',
          network: 'limited',
          allowedDomains: ['github.com', 'npmjs.com'],
          sessionTimeout: 3600,
        })
      );

      // Verify: wait for VM ready
      expect(mockTeamsClient.getVMStatus).toHaveBeenCalledWith('vm-123');

      // Verify: upload project
      expect(mockTeamsClient.uploadProject).toHaveBeenCalledWith('vm-123', projectDir);

      // Verify: audit log
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command',
          details: expect.objectContaining({
            action: 'vm_initialized',
            vmId: 'vm-123',
          }),
          result: 'success',
        })
      );
    });

    it('should wait for VM to be ready (provisioning)', async () => {
      // Setup mocks
      const mockVM: CloudVM = {
        id: 'vm-456',
        status: 'provisioning',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);

      // First call: provisioning, second call: running
      vi.mocked(mockTeamsClient.getVMStatus)
        .mockResolvedValueOnce('provisioning')
        .mockResolvedValueOnce('running');

      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      // Execute
      await executor.initialize();

      // Verify: polled status twice
      expect(mockTeamsClient.getVMStatus).toHaveBeenCalledTimes(2);
    });

    it('should throw SecurityError if no cloud config provided', async () => {
      // Config without cloud
      const configWithoutCloud: ExecutionConfig = {
        mode: 'cloud',
        projectDir,
      };

      const executorWithoutCloud = new CloudExecutor(
        mockFs,
        mockProcess,
        mockTeamsClient,
        mockPermissionManager,
        configWithoutCloud
      );

      // Execute & verify
      await expect(executorWithoutCloud.initialize()).rejects.toThrow(SecurityError);
      await expect(executorWithoutCloud.initialize()).rejects.toThrow(
        'Cloud configuration not provided'
      );
    });

    it('should throw error if VM fails to provision', async () => {
      // Setup: provision fails
      vi.mocked(mockTeamsClient.provisionVM).mockRejectedValue(new Error('Quota exceeded'));
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      // Execute & verify
      await expect(executor.initialize()).rejects.toThrow('Failed to provision cloud VM');

      // Verify: audit log failure
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            action: 'vm_initialization_failed',
          }),
          result: 'failure',
          error: 'Quota exceeded',
        })
      );
    });

    it('should throw error if VM enters error state', async () => {
      // Setup mocks
      const mockVM: CloudVM = {
        id: 'vm-error',
        status: 'provisioning',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('error');
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      // Execute & verify
      await expect(executor.initialize()).rejects.toThrow('VM failed to start: error');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      // Initialize with a VM
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();

      // Clear mock call history from initialization
      vi.mocked(mockTeamsClient.logAudit).mockClear();
    });

    it('should execute command in cloud VM successfully', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
        reason: '',
      });

      vi.mocked(mockTeamsClient.executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: 'Hello from cloud',
        stderr: '',
        duration: 100,
      });

      // Execute
      const result = await executor.execute('echo "Hello from cloud"');

      // Verify
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello from cloud');

      // Verify permission check
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'bash',
        command: 'echo "Hello from cloud"',
        workingDir: '/workspace',
      });

      // Verify API call
      expect(mockTeamsClient.executeCommand).toHaveBeenCalledWith(
        'vm-123',
        'echo "Hello from cloud"',
        {}
      );

      // Verify audit log
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command',
          details: expect.objectContaining({
            command: 'echo "Hello from cloud"',
            exitCode: 0,
          }),
          result: 'success',
        })
      );
    });

    it('should throw PermissionDeniedError when permission denied', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: false,
        reason: 'Command blocked',
      });

      // Execute & verify
      await expect(executor.execute('rm -rf /')).rejects.toThrow(PermissionDeniedError);

      // Verify audit log (permission denied)
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'permission_check',
          result: 'failure',
          error: 'Permission denied',
        })
      );

      // Verify executeCommand was NOT called
      expect(mockTeamsClient.executeCommand).not.toHaveBeenCalled();
    });

    it('should throw SecurityError if VM not initialized', async () => {
      // Create new executor without initialization
      const uninitExecutor = new CloudExecutor(
        mockFs,
        mockProcess,
        mockTeamsClient,
        mockPermissionManager,
        config
      );

      // Execute & verify
      await expect(uninitExecutor.execute('ls')).rejects.toThrow(SecurityError);
      await expect(uninitExecutor.execute('ls')).rejects.toThrow('Cloud VM not initialized');
    });

    it('should log audit event on command failure', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockTeamsClient.executeCommand).mockRejectedValue(new Error('Connection timeout'));

      // Execute & verify
      await expect(executor.execute('npm test')).rejects.toThrow('Command failed in cloud VM');

      // Verify audit log (failure)
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command',
          result: 'failure',
          error: 'Connection timeout',
        })
      );
    });
  });

  describe('readFile', () => {
    beforeEach(async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();
      vi.mocked(mockTeamsClient.logAudit).mockClear();
    });

    it('should read file from cloud VM', async () => {
      // Setup mocks
      vi.mocked(mockTeamsClient.readFile).mockResolvedValue('file content from cloud');

      // Execute
      const content = await executor.readFile('/workspace/test.txt');

      // Verify
      expect(content).toBe('file content from cloud');
      expect(mockTeamsClient.readFile).toHaveBeenCalledWith('vm-123', '/workspace/test.txt');

      // Verify audit log
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_read',
          result: 'success',
        })
      );
    });

    it('should log audit event on read failure', async () => {
      // Setup mocks
      vi.mocked(mockTeamsClient.readFile).mockRejectedValue(new Error('File not found'));

      // Execute & verify
      await expect(executor.readFile('/workspace/missing.txt')).rejects.toThrow(
        'Failed to read file from cloud VM'
      );

      // Verify audit log (failure)
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_read',
          result: 'failure',
          error: 'File not found',
        })
      );
    });
  });

  describe('writeFile', () => {
    beforeEach(async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();
      vi.mocked(mockTeamsClient.logAudit).mockClear();
    });

    it('should write file to cloud VM', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockTeamsClient.writeFile).mockResolvedValue(undefined);

      // Execute
      await executor.writeFile('/workspace/output.txt', 'test content');

      // Verify permission check
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'file_write',
        path: '/workspace/output.txt',
      });

      // Verify API call
      expect(mockTeamsClient.writeFile).toHaveBeenCalledWith(
        'vm-123',
        '/workspace/output.txt',
        'test content'
      );

      // Verify audit log
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_write',
          result: 'success',
        })
      );
    });

    it('should throw PermissionDeniedError when write denied', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: false,
        reason: 'Write denied',
      });

      // Execute & verify
      await expect(executor.writeFile('/workspace/.env', 'secrets')).rejects.toThrow(
        PermissionDeniedError
      );

      // Verify audit log (permission denied)
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'permission_check',
          result: 'failure',
          error: 'Permission denied',
        })
      );

      // Verify writeFile was NOT called
      expect(mockTeamsClient.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    beforeEach(async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();
      vi.mocked(mockTeamsClient.logAudit).mockClear();
    });

    it('should delete file in cloud VM', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockTeamsClient.deleteFile).mockResolvedValue(undefined);

      // Execute
      await executor.deleteFile('/workspace/temp.txt');

      // Verify permission check
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'file_delete',
        path: '/workspace/temp.txt',
      });

      // Verify API call
      expect(mockTeamsClient.deleteFile).toHaveBeenCalledWith('vm-123', '/workspace/temp.txt');

      // Verify audit log
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_delete',
          result: 'success',
        })
      );
    });

    it('should throw PermissionDeniedError when delete denied', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: false,
        reason: 'Delete denied',
      });

      // Execute & verify
      await expect(executor.deleteFile('/workspace/important.txt')).rejects.toThrow(
        PermissionDeniedError
      );

      // Verify deleteFile was NOT called
      expect(mockTeamsClient.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should destroy cloud VM', async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-456',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.destroyVM).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();
      vi.mocked(mockTeamsClient.logAudit).mockClear();

      // Cleanup
      await executor.cleanup();

      // Verify VM destroyed
      expect(mockTeamsClient.destroyVM).toHaveBeenCalledWith('vm-456');

      // Verify audit log
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            action: 'vm_destroyed',
            vmId: 'vm-456',
          }),
          result: 'success',
        })
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-789',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();

      // Setup: destroy fails
      vi.mocked(mockTeamsClient.destroyVM).mockRejectedValue(new Error('VM already destroyed'));

      // Cleanup (should not throw)
      await expect(executor.cleanup()).resolves.toBeUndefined();

      // Verify audit log (failure)
      expect(mockTeamsClient.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            action: 'vm_destruction_failed',
          }),
          result: 'failure',
        })
      );
    });
  });

  describe('getMode', () => {
    it('should return "cloud"', () => {
      expect(executor.getMode()).toBe('cloud');
    });
  });

  describe('getCwd', () => {
    it('should return workspace directory', async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/cloud/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();

      expect(executor.getCwd()).toBe('/cloud/workspace');
    });
  });

  describe('setCwd', () => {
    it('should throw SecurityError (not supported for cloud VMs)', () => {
      expect(() => executor.setCwd('/tmp')).toThrow(SecurityError);
      expect(() => executor.setCwd('/tmp')).toThrow('Cannot change working directory in cloud VM');
    });
  });

  describe('exists', () => {
    beforeEach(async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();
    });

    it('should check if file exists in cloud VM', async () => {
      // Setup mocks
      vi.mocked(mockTeamsClient.fileExists).mockResolvedValue(true);

      // Execute
      const exists = await executor.exists('/workspace/test.txt');

      // Verify
      expect(exists).toBe(true);
      expect(mockTeamsClient.fileExists).toHaveBeenCalledWith('vm-123', '/workspace/test.txt');
    });

    it('should return false if file does not exist', async () => {
      // Setup mocks
      vi.mocked(mockTeamsClient.fileExists).mockResolvedValue(false);

      // Execute
      const exists = await executor.exists('/workspace/missing.txt');

      // Verify
      expect(exists).toBe(false);
    });
  });

  describe('listDir', () => {
    beforeEach(async () => {
      // Initialize
      const mockVM: CloudVM = {
        id: 'vm-123',
        status: 'running',
        createdAt: new Date(),
        workspaceDir: '/workspace',
      };

      vi.mocked(mockTeamsClient.provisionVM).mockResolvedValue(mockVM);
      vi.mocked(mockTeamsClient.getVMStatus).mockResolvedValue('running');
      vi.mocked(mockTeamsClient.uploadProject).mockResolvedValue(undefined);
      vi.mocked(mockTeamsClient.logAudit).mockResolvedValue(undefined);

      await executor.initialize();
    });

    it('should list directory in cloud VM', async () => {
      // Setup mocks
      vi.mocked(mockTeamsClient.listDirectory).mockResolvedValue(['file1.txt', 'file2.txt']);

      // Execute
      const files = await executor.listDir('/workspace');

      // Verify
      expect(files).toEqual(['file1.txt', 'file2.txt']);
      expect(mockTeamsClient.listDirectory).toHaveBeenCalledWith('vm-123', '/workspace');
    });
  });
});
