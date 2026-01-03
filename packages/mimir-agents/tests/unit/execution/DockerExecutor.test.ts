/**
 * DockerExecutor tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { DockerExecutor } from '../../../src/execution/DockerExecutor.js';
import type { IFileSystem } from '../../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../../src/shared/platform/IProcessExecutor.js';
import type { IDockerClient, Container } from '../../../src/shared/platform/IDockerClient.js';
import type { PermissionManager } from '../../../src/features/permissions/manager/PermissionManager.js';
import type { ExecutionConfig } from '../../../src/execution/IExecutor.js';
import { PermissionDeniedError, SecurityError } from '../../../src/execution/IExecutor.js';

describe('DockerExecutor', () => {
  let executor: DockerExecutor;
  let mockFs: IFileSystem;
  let mockProcess: IProcessExecutor;
  let mockDocker: IDockerClient;
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
      resolve: vi.fn((...paths: string[]) => path.resolve(...paths)),
      join: vi.fn((...paths: string[]) => path.join(...paths)),
      dirname: vi.fn((p: string) => path.dirname(p)),
      basename: vi.fn((p: string) => path.basename(p)),
    } as any;

    // Mock process executor
    mockProcess = {
      execute: vi.fn(),
    } as any;

    // Mock Docker client
    mockDocker = {
      listContainers: vi.fn(),
      createContainer: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      remove: vi.fn(),
      exec: vi.fn(),
      buildImage: vi.fn(),
      pullImage: vi.fn(),
      inspect: vi.fn(),
      logs: vi.fn(),
    } as any;

    // Mock permission manager
    mockPermissionManager = {
      checkPermission: vi.fn(),
    } as any;

    // Config
    config = {
      mode: 'docker',
      projectDir,
      docker: {
        image: 'node:20-alpine',
        network: 'disabled',
        cpuLimit: 2.0,
        memoryLimit: 4 * 1024 * 1024 * 1024, // 4GB
        workspaceFolder: '/workspace',
      },
    };

    executor = new DockerExecutor(mockFs, mockProcess, mockDocker, mockPermissionManager, config);
  });

  describe('initialize', () => {
    it('should pull image and create container', async () => {
      // Setup: pull succeeds
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);

      // Setup: create container succeeds
      const mockContainer: Container = { id: 'container-123' };
      vi.mocked(mockDocker.createContainer).mockResolvedValue(mockContainer);

      // Execute
      await executor.initialize();

      // Verify: image pulled
      expect(mockDocker.pullImage).toHaveBeenCalledWith('node:20-alpine');

      // Verify: container created
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          image: 'node:20-alpine',
          workingDir: '/workspace',
          hostConfig: expect.objectContaining({
            networkMode: 'none', // disabled network
            cpus: 2.0,
            memory: 4 * 1024 * 1024 * 1024,
          }),
        })
      );

      // Verify: container started
      expect(mockDocker.start).toHaveBeenCalledWith('container-123');
    });

    it('should build image from Dockerfile and create container', async () => {
      // Config with Dockerfile
      const configWithDockerfile: ExecutionConfig = {
        ...config,
        docker: {
          dockerfile: 'Dockerfile',
          network: 'full',
          workspaceFolder: '/app',
        },
      };

      const executorWithDockerfile = new DockerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        configWithDockerfile
      );

      // Setup: build succeeds
      vi.mocked(mockDocker.buildImage).mockResolvedValue(undefined);

      // Setup: create container succeeds
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'built-container' });

      // Execute
      await executorWithDockerfile.initialize();

      // Verify: image built
      expect(mockDocker.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: 'mimir-docker-project',
          dockerfile: 'Dockerfile',
        })
      );

      // Verify: container created with built image
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          image: 'mimir-docker-project',
          workingDir: '/app',
          hostConfig: expect.objectContaining({
            networkMode: 'bridge', // full network
          }),
        })
      );
    });

    it('should throw SecurityError if no Docker config provided', async () => {
      // Config without docker
      const configWithoutDocker: ExecutionConfig = {
        mode: 'docker',
        projectDir,
      };

      const executorWithoutDocker = new DockerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        configWithoutDocker
      );

      // Execute & verify
      await expect(executorWithoutDocker.initialize()).rejects.toThrow(SecurityError);
      await expect(executorWithoutDocker.initialize()).rejects.toThrow(
        'Docker configuration not provided'
      );
    });

    it('should throw SecurityError if no dockerfile/image/composeFile specified', async () => {
      // Config with empty docker
      const configEmpty: ExecutionConfig = {
        mode: 'docker',
        projectDir,
        docker: {},
      };

      const executorEmpty = new DockerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        configEmpty
      );

      // Execute & verify
      await expect(executorEmpty.initialize()).rejects.toThrow(SecurityError);
      await expect(executorEmpty.initialize()).rejects.toThrow(
        'Docker config must specify dockerfile, image, or composeFile'
      );
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      // Initialize with a container
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'container-123' });
      vi.mocked(mockDocker.start).mockResolvedValue(undefined);

      await executor.initialize();
    });

    it('should execute command in container successfully', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
        reason: '',
      });

      vi.mocked(mockDocker.exec).mockResolvedValue({
        exitCode: 0,
        stdout: 'Hello from Docker',
        stderr: '',
      });

      // Execute
      const result = await executor.execute('echo "Hello from Docker"');

      // Verify
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello from Docker');

      // Verify permission check
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'bash',
        command: 'echo "Hello from Docker"',
        workingDir: '/workspace',
      });

      // Verify docker exec
      expect(mockDocker.exec).toHaveBeenCalledWith(
        'container-123',
        expect.objectContaining({
          cmd: ['sh', '-c', 'echo "Hello from Docker"'],
          workingDir: '/workspace',
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

      // Verify docker exec was NOT called
      expect(mockDocker.exec).not.toHaveBeenCalled();
    });

    it('should throw SecurityError if container not initialized', async () => {
      // Create new executor without initialization
      const uninitExecutor = new DockerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        config
      );

      // Execute & verify
      await expect(uninitExecutor.execute('ls')).rejects.toThrow(SecurityError);
      await expect(uninitExecutor.execute('ls')).rejects.toThrow(
        'Docker container not initialized'
      );
    });
  });

  describe('readFile', () => {
    beforeEach(async () => {
      // Initialize container
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'container-123' });
      await executor.initialize();
    });

    it('should read file from container', async () => {
      // Setup mocks
      vi.mocked(mockDocker.exec).mockResolvedValue({
        exitCode: 0,
        stdout: 'file content from docker',
        stderr: '',
      });

      // Execute
      const content = await executor.readFile('/workspace/test.txt');

      // Verify
      expect(content).toBe('file content from docker');
      expect(mockDocker.exec).toHaveBeenCalledWith(
        'container-123',
        expect.objectContaining({
          cmd: ['cat', '/workspace/test.txt'],
        })
      );
    });
  });

  describe('writeFile', () => {
    beforeEach(async () => {
      // Initialize container
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'container-123' });
      await executor.initialize();
    });

    it('should write file to container', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: true,
      });

      vi.mocked(mockDocker.exec).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      // Execute
      await executor.writeFile('/workspace/output.txt', 'test content');

      // Verify permission check
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'file_write',
        path: '/workspace/output.txt',
      });

      // Verify docker exec
      expect(mockDocker.exec).toHaveBeenCalledWith(
        'container-123',
        expect.objectContaining({
          cmd: ['sh', '-c', 'cat > /workspace/output.txt'],
          stdin: 'test content',
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

      // Verify docker exec was NOT called
      expect(mockDocker.exec).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should stop and remove container (ephemeral)', async () => {
      // Initialize
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'container-456' });
      await executor.initialize();

      // Cleanup
      await executor.cleanup();

      // Verify container stopped
      expect(mockDocker.stop).toHaveBeenCalledWith('container-456', 5);

      // Verify container removed
      expect(mockDocker.remove).toHaveBeenCalledWith('container-456', {
        force: true,
        v: true,
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      // Initialize
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'container-789' });
      await executor.initialize();

      // Setup: stop fails
      vi.mocked(mockDocker.stop).mockRejectedValue(new Error('Container already stopped'));

      // Cleanup (should not throw)
      await expect(executor.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('getMode', () => {
    it('should return "docker"', () => {
      expect(executor.getMode()).toBe('docker');
    });
  });

  describe('getCwd', () => {
    it('should return workspace folder', () => {
      expect(executor.getCwd()).toBe('/workspace');
    });
  });

  describe('setCwd', () => {
    it('should throw SecurityError (not supported for containers)', () => {
      expect(() => executor.setCwd('/tmp')).toThrow(SecurityError);
      expect(() => executor.setCwd('/tmp')).toThrow(
        'Cannot change working directory in Docker container'
      );
    });
  });

  describe('network modes', () => {
    it('should disable network when configured', async () => {
      // Config with disabled network
      const configDisabled: ExecutionConfig = {
        ...config,
        docker: {
          image: 'alpine:latest',
          network: 'disabled',
        },
      };

      const executorDisabled = new DockerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        configDisabled
      );

      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'no-network' });

      await executorDisabled.initialize();

      // Verify network disabled
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          networkDisabled: true,
          hostConfig: expect.objectContaining({
            networkMode: 'none',
          }),
        })
      );
    });

    it('should enable full network when configured', async () => {
      // Config with full network
      const configFull: ExecutionConfig = {
        ...config,
        docker: {
          image: 'alpine:latest',
          network: 'full',
        },
      };

      const executorFull = new DockerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        configFull
      );

      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'full-network' });

      await executorFull.initialize();

      // Verify bridge network (full access)
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          hostConfig: expect.objectContaining({
            networkMode: 'bridge',
          }),
        })
      );
    });
  });
});
