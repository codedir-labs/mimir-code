/**
 * DevContainerExecutor tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { DevContainerExecutor } from '../../../src/execution/DevContainerExecutor.js';
import type { IFileSystem } from '../../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../../src/shared/platform/IProcessExecutor.js';
import type { IDockerClient, Container } from '../../../src/shared/platform/IDockerClient.js';
import type { PermissionManager } from '../../../src/features/permissions/manager/PermissionManager.js';
import type { ExecutionConfig } from '../../../src/execution/IExecutor.js';
import { PermissionDeniedError, SecurityError } from '../../../src/execution/IExecutor.js';

describe('DevContainerExecutor', () => {
  let executor: DevContainerExecutor;
  let mockFs: IFileSystem;
  let mockProcess: IProcessExecutor;
  let mockDocker: IDockerClient;
  let mockPermissionManager: PermissionManager;
  let config: ExecutionConfig;

  const projectDir = process.platform === 'win32' ? 'C:\\workspace\\project' : '/workspace/project';
  const devcontainerConfigPath = path.join(projectDir, '.devcontainer', 'devcontainer.json');

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
      mode: 'devcontainer',
      projectDir,
      devcontainer: {
        autoDetect: true,
        workspaceFolder: '/workspace',
      },
    };

    executor = new DevContainerExecutor(
      mockFs,
      mockProcess,
      mockDocker,
      mockPermissionManager,
      config
    );
  });

  describe('initialize', () => {
    it('should auto-detect devcontainer.json and start existing container', async () => {
      // Setup: devcontainer.json exists
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({
          name: 'Test Dev Container',
          image: 'mcr.microsoft.com/devcontainers/typescript-node:20',
          workspaceFolder: '/workspace',
        })
      );

      // Setup: existing container found (stopped)
      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        {
          Id: 'container-123',
          Name: 'mimir-devcontainer-project',
          Image: 'mcr.microsoft.com/devcontainers/typescript-node:20',
          State: 'stopped',
          Status: 'Exited',
          Created: Date.now(),
        },
      ]);

      // Execute
      await executor.initialize();

      // Verify: container was started
      expect(mockDocker.start).toHaveBeenCalledWith('container-123');
      expect(mockDocker.createContainer).not.toHaveBeenCalled();
    });

    it('should create and start new container if none exists', async () => {
      // Setup: devcontainer.json exists
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({
          name: 'Test Dev Container',
          image: 'node:20-alpine',
          workspaceFolder: '/workspace',
        })
      );

      // Setup: no existing container
      vi.mocked(mockDocker.listContainers).mockResolvedValue([]);

      // Setup: pull image succeeds
      vi.mocked(mockDocker.pullImage).mockResolvedValue(undefined);

      // Setup: create container succeeds
      const mockContainer: Container = { id: 'new-container-456' };
      vi.mocked(mockDocker.createContainer).mockResolvedValue(mockContainer);

      // Execute
      await executor.initialize();

      // Verify: image pulled
      expect(mockDocker.pullImage).toHaveBeenCalledWith('node:20-alpine');

      // Verify: container created
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'mimir-devcontainer-project',
          image: 'node:20-alpine',
          workingDir: '/workspace',
        })
      );

      // Verify: container started
      expect(mockDocker.start).toHaveBeenCalledWith('new-container-456');
    });

    it('should throw SecurityError if no devcontainer.json found', async () => {
      // Setup: no devcontainer.json
      vi.mocked(mockFs.exists).mockResolvedValue(false);

      // Execute & verify
      await expect(executor.initialize()).rejects.toThrow(SecurityError);
      await expect(executor.initialize()).rejects.toThrow(
        'No .devcontainer/devcontainer.json found'
      );
    });

    it('should build image from Dockerfile if specified', async () => {
      // Setup: devcontainer.json with Dockerfile
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({
          name: 'Custom Dev Container',
          dockerFile: '.devcontainer/Dockerfile',
          workspaceFolder: '/workspace',
        })
      );

      // Setup: no existing container
      vi.mocked(mockDocker.listContainers).mockResolvedValue([]);

      // Setup: build succeeds
      vi.mocked(mockDocker.buildImage).mockResolvedValue(undefined);

      // Setup: create container succeeds
      vi.mocked(mockDocker.createContainer).mockResolvedValue({ id: 'built-container' });

      // Execute
      await executor.initialize();

      // Verify: image built
      expect(mockDocker.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: 'mimir-devcontainer-project',
        })
      );

      // Verify: container created with built image
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          image: 'mimir-devcontainer-project',
        })
      );
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      // Initialize with a running container
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({
          image: 'node:20',
          workspaceFolder: '/workspace',
        })
      );

      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        {
          Id: 'container-123',
          Name: 'mimir-devcontainer-project',
          Image: 'node:20',
          State: 'running',
          Status: 'Up 2 hours',
          Created: Date.now(),
        },
      ]);

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
        stdout: 'Hello from container',
        stderr: '',
      });

      // Execute
      const result = await executor.execute('echo "Hello from container"');

      // Verify
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello from container');

      // Verify permission check
      expect(mockPermissionManager.checkPermission).toHaveBeenCalledWith({
        type: 'bash',
        command: 'echo "Hello from container"',
        workingDir: '/workspace',
      });

      // Verify docker exec
      expect(mockDocker.exec).toHaveBeenCalledWith(
        'container-123',
        expect.objectContaining({
          cmd: ['sh', '-c', 'echo "Hello from container"'],
          workingDir: '/workspace',
        })
      );
    });

    it('should throw PermissionDeniedError when permission denied', async () => {
      // Setup mocks
      vi.mocked(mockPermissionManager.checkPermission).mockResolvedValue({
        allowed: false,
        reason: 'Command blocked by denylist',
      });

      // Execute & verify
      await expect(executor.execute('rm -rf /')).rejects.toThrow(PermissionDeniedError);

      // Verify docker exec was NOT called
      expect(mockDocker.exec).not.toHaveBeenCalled();
    });

    it('should throw SecurityError if container not initialized', async () => {
      // Create new executor without initialization
      const uninitExecutor = new DevContainerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        config
      );

      // Execute & verify
      await expect(uninitExecutor.execute('ls')).rejects.toThrow(SecurityError);
      await expect(uninitExecutor.execute('ls')).rejects.toThrow('Dev container not initialized');
    });
  });

  describe('readFile', () => {
    beforeEach(async () => {
      // Initialize container
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({ image: 'node:20', workspaceFolder: '/workspace' })
      );

      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        {
          Id: 'container-123',
          Name: 'mimir-devcontainer-project',
          Image: 'node:20',
          State: 'running',
          Status: 'Up',
          Created: Date.now(),
        },
      ]);

      await executor.initialize();
    });

    it('should read file from container', async () => {
      // Setup mocks
      vi.mocked(mockDocker.exec).mockResolvedValue({
        exitCode: 0,
        stdout: 'file content from container',
        stderr: '',
      });

      // Execute
      const content = await executor.readFile('/workspace/test.txt');

      // Verify
      expect(content).toBe('file content from container');
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
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({ image: 'node:20', workspaceFolder: '/workspace' })
      );

      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        {
          Id: 'container-123',
          Name: 'mimir-devcontainer-project',
          Image: 'node:20',
          State: 'running',
          Status: 'Up',
          Created: Date.now(),
        },
      ]);

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
    it('should not stop container by default (keep for reuse)', async () => {
      // Initialize
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({ image: 'node:20', workspaceFolder: '/workspace' })
      );

      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        {
          Id: 'container-123',
          Name: 'test',
          Image: 'node:20',
          State: 'running',
          Status: 'Up',
          Created: Date.now(),
        },
      ]);

      await executor.initialize();

      // Cleanup
      await executor.cleanup();

      // Verify container NOT stopped
      expect(mockDocker.stop).not.toHaveBeenCalled();
    });

    it('should stop container if stopOnExit configured', async () => {
      // Config with stopOnExit
      const configWithStop: ExecutionConfig = {
        ...config,
        devcontainer: {
          ...config.devcontainer,
          stopOnExit: true,
        },
      };

      const executorWithStop = new DevContainerExecutor(
        mockFs,
        mockProcess,
        mockDocker,
        mockPermissionManager,
        configWithStop
      );

      // Initialize
      vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
        return p === devcontainerConfigPath;
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(
        JSON.stringify({ image: 'node:20', workspaceFolder: '/workspace' })
      );

      vi.mocked(mockDocker.listContainers).mockResolvedValue([
        {
          Id: 'container-456',
          Name: 'test',
          Image: 'node:20',
          State: 'running',
          Status: 'Up',
          Created: Date.now(),
        },
      ]);

      await executorWithStop.initialize();

      // Cleanup
      await executorWithStop.cleanup();

      // Verify container stopped
      expect(mockDocker.stop).toHaveBeenCalledWith('container-456');
    });
  });

  describe('getMode', () => {
    it('should return "devcontainer"', () => {
      expect(executor.getMode()).toBe('devcontainer');
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
        'Cannot change working directory in dev container'
      );
    });
  });
});
