/**
 * ExecutorFactory tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import {
  ExecutorFactory,
  createExecutorFactory,
  createExecutor,
} from '../../../src/execution/ExecutorFactory.js';
import type { IFileSystem } from '../../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../../src/shared/platform/IProcessExecutor.js';
import type { IDockerClient } from '../../../src/shared/platform/IDockerClient.js';
import type { ITeamsAPIClient } from '../../../src/execution/CloudExecutor.js';
import type { PermissionManager } from '../../../src/features/permissions/manager/PermissionManager.js';
import type { ExecutionConfig } from '../../../src/execution/IExecutor.js';
import { NativeExecutor } from '../../../src/execution/NativeExecutor.js';
import { DevContainerExecutor } from '../../../src/execution/DevContainerExecutor.js';
import { DockerExecutor } from '../../../src/execution/DockerExecutor.js';
import { CloudExecutor } from '../../../src/execution/CloudExecutor.js';
import { SecurityError } from '../../../src/execution/IExecutor.js';

describe('ExecutorFactory', () => {
  let factory: ExecutorFactory;
  let mockFs: IFileSystem;
  let mockProcess: IProcessExecutor;
  let mockDocker: IDockerClient;
  let mockTeamsClient: ITeamsAPIClient;
  let mockPermissionManager: PermissionManager;

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

    factory = new ExecutorFactory({
      fs: mockFs,
      process: mockProcess,
      docker: mockDocker,
      teamsClient: mockTeamsClient,
      permissionManager: mockPermissionManager,
    });
  });

  describe('create', () => {
    it('should create NativeExecutor when mode is "native"', async () => {
      const config: ExecutionConfig = {
        mode: 'native',
        projectDir,
      };

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(NativeExecutor);
      expect(executor.getMode()).toBe('native');
    });

    it('should create DevContainerExecutor when mode is "devcontainer"', async () => {
      const config: ExecutionConfig = {
        mode: 'devcontainer',
        projectDir,
        devcontainer: {
          autoDetect: true,
        },
      };

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(DevContainerExecutor);
      expect(executor.getMode()).toBe('devcontainer');
    });

    it('should create DockerExecutor when mode is "docker"', async () => {
      const config: ExecutionConfig = {
        mode: 'docker',
        projectDir,
        docker: {
          image: 'node:20-alpine',
        },
      };

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(DockerExecutor);
      expect(executor.getMode()).toBe('docker');
    });

    it('should create CloudExecutor when mode is "cloud"', async () => {
      const config: ExecutionConfig = {
        mode: 'cloud',
        projectDir,
        cloud: {
          apiUrl: 'https://api.mimir.dev',
          orgId: 'org-123',
          authToken: 'token-abc',
        },
      };

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(CloudExecutor);
      expect(executor.getMode()).toBe('cloud');
    });

    it('should throw SecurityError for unknown mode', async () => {
      const config: ExecutionConfig = {
        mode: 'unknown' as any,
        projectDir,
      };

      await expect(factory.create(config)).rejects.toThrow(SecurityError);
      await expect(factory.create(config)).rejects.toThrow('Unknown execution mode: unknown');
    });

    it('should throw SecurityError when Docker client missing for devcontainer mode', async () => {
      // Factory without Docker client
      const factoryNoDocker = new ExecutorFactory({
        fs: mockFs,
        process: mockProcess,
        permissionManager: mockPermissionManager,
      });

      const config: ExecutionConfig = {
        mode: 'devcontainer',
        projectDir,
      };

      await expect(factoryNoDocker.create(config)).rejects.toThrow(SecurityError);
      await expect(factoryNoDocker.create(config)).rejects.toThrow(
        'Docker client required for DevContainer mode'
      );
    });

    it('should throw SecurityError when Docker client missing for docker mode', async () => {
      // Factory without Docker client
      const factoryNoDocker = new ExecutorFactory({
        fs: mockFs,
        process: mockProcess,
        permissionManager: mockPermissionManager,
      });

      const config: ExecutionConfig = {
        mode: 'docker',
        projectDir,
        docker: {
          image: 'node:20-alpine',
        },
      };

      await expect(factoryNoDocker.create(config)).rejects.toThrow(SecurityError);
      await expect(factoryNoDocker.create(config)).rejects.toThrow(
        'Docker client required for Docker mode'
      );
    });

    it('should throw SecurityError when Teams client missing for cloud mode', async () => {
      // Factory without Teams client
      const factoryNoTeams = new ExecutorFactory({
        fs: mockFs,
        process: mockProcess,
        permissionManager: mockPermissionManager,
      });

      const config: ExecutionConfig = {
        mode: 'cloud',
        projectDir,
        cloud: {
          apiUrl: 'https://api.mimir.dev',
          orgId: 'org-123',
          authToken: 'token-abc',
        },
      };

      await expect(factoryNoTeams.create(config)).rejects.toThrow(SecurityError);
      await expect(factoryNoTeams.create(config)).rejects.toThrow(
        'Teams API client required for Cloud mode'
      );
    });
  });

  describe('detectAvailableModes', () => {
    it('should detect cloud mode when cloud.yml exists', async () => {
      // Setup: cloud.yml exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('cloud.yml');
      });

      const modes = await factory.detectAvailableModes(projectDir);

      expect(modes.length).toBeGreaterThan(0);
      const cloudMode = modes.find((m) => m.mode === 'cloud');
      expect(cloudMode).toBeDefined();
      expect(cloudMode?.confidence).toBe(1.0);
      expect(cloudMode?.reason).toBe('Cloud configuration file found');
    });

    it('should detect cloud mode when config.yml has cloud config', async () => {
      // Setup: config.yml exists with cloud config
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('config.yml');
      });

      vi.mocked(mockFs.readFile).mockResolvedValue(`
        execution:
          mode: cloud
          cloud:
            apiUrl: https://api.mimir.dev
      `);

      const modes = await factory.detectAvailableModes(projectDir);

      const cloudMode = modes.find((m) => m.mode === 'cloud');
      expect(cloudMode).toBeDefined();
      expect(cloudMode?.confidence).toBe(0.9);
    });

    it('should detect devcontainer mode when devcontainer.json exists', async () => {
      // Setup: devcontainer.json exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('devcontainer.json');
      });

      const modes = await factory.detectAvailableModes(projectDir);

      const devContainerMode = modes.find((m) => m.mode === 'devcontainer');
      expect(devContainerMode).toBeDefined();
      expect(devContainerMode?.confidence).toBe(1.0);
      expect(devContainerMode?.reason).toBe('Dev container configuration found');
    });

    it('should detect docker mode when Dockerfile exists', async () => {
      // Setup: Dockerfile exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.endsWith('Dockerfile');
      });

      const modes = await factory.detectAvailableModes(projectDir);

      const dockerMode = modes.find((m) => m.mode === 'docker');
      expect(dockerMode).toBeDefined();
      expect(dockerMode?.confidence).toBe(1.0);
      expect(dockerMode?.reason).toBe('Dockerfile found');
    });

    it('should detect docker mode when docker-compose.yml exists', async () => {
      // Setup: docker-compose.yml exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('docker-compose.yml');
      });

      const modes = await factory.detectAvailableModes(projectDir);

      const dockerMode = modes.find((m) => m.mode === 'docker');
      expect(dockerMode).toBeDefined();
      expect(dockerMode?.confidence).toBe(1.0);
      expect(dockerMode?.reason).toBe('docker-compose.yml found');
    });

    it('should detect docker mode when docker-compose.yaml exists', async () => {
      // Setup: docker-compose.yaml exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('docker-compose.yaml');
      });

      const modes = await factory.detectAvailableModes(projectDir);

      const dockerMode = modes.find((m) => m.mode === 'docker');
      expect(dockerMode).toBeDefined();
      expect(dockerMode?.confidence).toBe(1.0);
      expect(dockerMode?.reason).toBe('docker-compose.yaml found');
    });

    it('should always detect native mode', async () => {
      // Setup: no special files exist
      vi.mocked(mockFs.exists).mockResolvedValue(false);

      const modes = await factory.detectAvailableModes(projectDir);

      expect(modes.length).toBe(1);
      expect(modes[0].mode).toBe('native');
      expect(modes[0].confidence).toBe(1.0);
      expect(modes[0].reason).toBe('Native execution always available');
    });

    it('should detect all available modes', async () => {
      // Setup: all config files exist
      vi.mocked(mockFs.exists).mockResolvedValue(true);
      vi.mocked(mockFs.readFile).mockResolvedValue('execution:\n  mode: cloud');

      const modes = await factory.detectAvailableModes(projectDir);

      // Should have: cloud, devcontainer, docker, native
      expect(modes.length).toBe(4);
      expect(modes.map((m) => m.mode)).toContain('cloud');
      expect(modes.map((m) => m.mode)).toContain('devcontainer');
      expect(modes.map((m) => m.mode)).toContain('docker');
      expect(modes.map((m) => m.mode)).toContain('native');
    });
  });

  describe('recommendMode', () => {
    it('should recommend explicitly configured mode', async () => {
      const config: ExecutionConfig = {
        mode: 'docker',
        projectDir,
        docker: {
          image: 'node:20-alpine',
        },
      };

      const recommendation = await factory.recommendMode(config);

      expect(recommendation.mode).toBe('docker');
      expect(recommendation.confidence).toBe(1.0);
      expect(recommendation.reason).toBe('Explicitly configured');
    });

    it('should auto-detect and recommend cloud mode (highest priority)', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
      };

      // Setup: cloud config exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('cloud.yml');
      });

      const recommendation = await factory.recommendMode(config);

      expect(recommendation.mode).toBe('cloud');
    });

    it('should auto-detect and recommend devcontainer (2nd priority)', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
      };

      // Setup: devcontainer.json exists (no cloud)
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('devcontainer.json');
      });

      const recommendation = await factory.recommendMode(config);

      expect(recommendation.mode).toBe('devcontainer');
    });

    it('should auto-detect and recommend docker (3rd priority)', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
      };

      // Setup: Dockerfile exists (no cloud, no devcontainer)
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.endsWith('Dockerfile');
      });

      const recommendation = await factory.recommendMode(config);

      expect(recommendation.mode).toBe('docker');
    });

    it('should fallback to native (lowest priority)', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
      };

      // Setup: no special files exist
      vi.mocked(mockFs.exists).mockResolvedValue(false);

      const recommendation = await factory.recommendMode(config);

      expect(recommendation.mode).toBe('native');
      expect(recommendation.reason).toBe('Native execution always available');
    });
  });

  describe('create with auto mode', () => {
    it('should auto-detect and create CloudExecutor', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
        cloud: {
          apiUrl: 'https://api.mimir.dev',
          orgId: 'org-123',
          authToken: 'token-abc',
        },
      };

      // Setup: cloud config exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('cloud.yml');
      });

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(CloudExecutor);
      expect(executor.getMode()).toBe('cloud');
    });

    it('should auto-detect and create DevContainerExecutor', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
        devcontainer: {
          autoDetect: true,
        },
      };

      // Setup: devcontainer.json exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.includes('devcontainer.json');
      });

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(DevContainerExecutor);
      expect(executor.getMode()).toBe('devcontainer');
    });

    it('should auto-detect and create DockerExecutor', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
        docker: {
          dockerfile: 'Dockerfile',
        },
      };

      // Setup: Dockerfile exists
      vi.mocked(mockFs.exists).mockImplementation(async (path: string) => {
        return path.endsWith('Dockerfile');
      });

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(DockerExecutor);
      expect(executor.getMode()).toBe('docker');
    });

    it('should auto-detect and create NativeExecutor (fallback)', async () => {
      const config: ExecutionConfig = {
        mode: 'auto',
        projectDir,
      };

      // Setup: no special files exist
      vi.mocked(mockFs.exists).mockResolvedValue(false);

      const executor = await factory.create(config);

      expect(executor).toBeInstanceOf(NativeExecutor);
      expect(executor.getMode()).toBe('native');
    });
  });

  describe('createExecutorFactory', () => {
    it('should create ExecutorFactory instance', () => {
      const factory = createExecutorFactory({
        fs: mockFs,
        process: mockProcess,
        permissionManager: mockPermissionManager,
      });

      expect(factory).toBeInstanceOf(ExecutorFactory);
    });
  });

  describe('createExecutor', () => {
    it('should create executor using convenience function', async () => {
      const config: ExecutionConfig = {
        mode: 'native',
        projectDir,
      };

      const executor = await createExecutor(config, {
        fs: mockFs,
        process: mockProcess,
        permissionManager: mockPermissionManager,
      });

      expect(executor).toBeInstanceOf(NativeExecutor);
      expect(executor.getMode()).toBe('native');
    });
  });
});
