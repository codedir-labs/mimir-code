/**
 * Integration tests for ExecutorFactory with real environment detection
 *
 * Tests auto-detection and executor creation in real scenarios:
 * - Detecting devcontainer.json files
 * - Detecting Docker availability
 * - Fallback priorities (cloud → devcontainer → docker → native)
 * - Real container management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { createExecutorFactory, ExecutorFactory } from '../../src/execution/ExecutorFactory.js';
import { NativeExecutor } from '../../src/execution/NativeExecutor.js';
import { DockerExecutor } from '../../src/execution/DockerExecutor.js';
import type { IFileSystem } from '../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../src/shared/platform/IProcessExecutor.js';
import type { IDockerClient } from '../../src/shared/platform/IDockerClient.js';
import type { IExecutor } from '../../src/execution/IExecutor.js';
import Dockerode from 'dockerode';

class MockFileSystem implements IFileSystem {
  private files = new Map<string, string>();

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async mkdir(path: string): Promise<void> {}

  async readdir(path: string): Promise<string[]> {
    const prefix = path.endsWith('/') ? path : path + '/';
    return Array.from(this.files.keys())
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.substring(prefix.length).split('/')[0])
      .filter((p, i, arr) => arr.indexOf(p) === i);
  }

  async unlink(path: string): Promise<void> {
    this.files.delete(path);
  }

  async stat(path: string): Promise<{ isDirectory: () => boolean; isFile: () => boolean }> {
    const exists = this.files.has(path);
    return {
      isDirectory: () => !exists,
      isFile: () => exists,
    };
  }

  async glob(pattern: string): Promise<string[]> {
    return Array.from(this.files.keys());
  }

  // Test helpers
  setFile(path: string, content: string) {
    this.files.set(path, content);
  }

  clear() {
    this.files.clear();
  }

  getFiles() {
    return Array.from(this.files.keys());
  }
}

class MockProcessExecutor implements IProcessExecutor {
  private dockerAvailable = true;

  async execute(
    command: string,
    options?: { cwd?: string; timeout?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (command === 'docker --version') {
      if (this.dockerAvailable) {
        return { stdout: 'Docker version 24.0.0, build abc123', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: 'command not found', exitCode: 127 };
    }

    if (command === 'docker ps') {
      if (this.dockerAvailable) {
        return { stdout: 'CONTAINER ID   IMAGE\n', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: 'Cannot connect to Docker daemon', exitCode: 1 };
    }

    return { stdout: '', stderr: 'Unknown command', exitCode: 127 };
  }

  setDockerAvailable(available: boolean) {
    this.dockerAvailable = available;
  }
}

class RealDockerClient implements IDockerClient {
  private docker: Dockerode;

  constructor() {
    this.docker = new Dockerode();
  }

  async pullImage(image: string, onProgress?: (progress: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          },
          (event: any) => {
            if (onProgress && event.status) {
              onProgress(event.status);
            }
          }
        );
      });
    });
  }

  async createContainer(options: {
    image: string;
    name?: string;
    cmd?: string[];
    env?: string[];
    volumes?: Record<string, string>;
    workingDir?: string;
    networkMode?: string;
    cpuLimit?: number;
    memoryLimit?: number;
  }): Promise<string> {
    const container = await this.docker.createContainer({
      Image: options.image,
      name: options.name,
      Cmd: options.cmd,
      Env: options.env,
      WorkingDir: options.workingDir,
      HostConfig: {
        NetworkMode: options.networkMode || 'bridge',
        NanoCpus: options.cpuLimit ? options.cpuLimit * 1e9 : undefined,
        Memory: options.memoryLimit,
        Binds: options.volumes
          ? Object.entries(options.volumes).map(([host, container]) => `${host}:${container}`)
          : undefined,
      },
      Tty: true,
      OpenStdin: true,
    });

    return container.id;
  }

  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: 5 });
    } catch (error: any) {
      if (!error.message?.includes('already stopped')) {
        throw error;
      }
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true });
  }

  async executeCommand(
    containerId: string,
    command: string,
    options?: { cwd?: string; timeout?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['/bin/sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.cwd,
    });

    return new Promise((resolve, reject) => {
      exec.start({}, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk: Buffer) => {
          const header = chunk.readUInt8(0);
          const data = chunk.slice(8).toString();

          if (header === 1) {
            stdout += data;
          } else if (header === 2) {
            stderr += data;
          }
        });

        stream.on('end', async () => {
          const inspectData = await exec.inspect();
          resolve({
            stdout,
            stderr,
            exitCode: inspectData.ExitCode || 0,
          });
        });

        stream.on('error', reject);
      });
    });
  }

  async getContainerStatus(containerId: string): Promise<'running' | 'stopped' | 'error'> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return info.State.Running ? 'running' : 'stopped';
    } catch (error) {
      return 'error';
    }
  }

  async copyToContainer(containerId: string, sourcePath: string, destPath: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async copyFromContainer(
    containerId: string,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    throw new Error('Not implemented');
  }

  async buildImage(options: {
    context: string;
    dockerfile?: string;
    tag: string;
    onProgress?: (progress: string) => void;
  }): Promise<void> {
    throw new Error('Not implemented');
  }
}

describe('ExecutorFactory Integration', () => {
  let fs: MockFileSystem;
  let processExecutor: MockProcessExecutor;
  let dockerClient: RealDockerClient;
  let factory: ExecutorFactory;

  beforeEach(() => {
    fs = new MockFileSystem();
    processExecutor = new MockProcessExecutor();
    dockerClient = new RealDockerClient();

    factory = createExecutorFactory({
      fs,
      process: processExecutor,
      docker: dockerClient,
      permissionConfig: {
        autoAccept: false,
        acceptRiskLevel: 'medium',
        alwaysAcceptCommands: [],
      },
    });
  });

  describe('Auto-detection', () => {
    it('should detect and create native executor when no Docker', async () => {
      processExecutor.setDockerAvailable(false);

      const result = await factory.detect('/workspace');

      expect(result.mode).toBe('native');
      expect(result.available).toBe(true);
      expect(result.reason).toContain('Docker not available');
    });

    it('should detect Docker when available', async () => {
      processExecutor.setDockerAvailable(true);

      const result = await factory.detect('/workspace');

      expect(result.mode).toBe('docker');
      expect(result.available).toBe(true);
    });

    it('should detect devcontainer.json when present', async () => {
      processExecutor.setDockerAvailable(true);
      fs.setFile(
        '/workspace/.devcontainer/devcontainer.json',
        JSON.stringify({
          name: 'Test Container',
          image: 'node:20-alpine',
        })
      );

      const result = await factory.detect('/workspace');

      expect(result.mode).toBe('devcontainer');
      expect(result.available).toBe(true);
      expect(result.devcontainerConfig).toBeDefined();
    });

    it('should respect priority order: devcontainer > docker > native', async () => {
      processExecutor.setDockerAvailable(true);

      // No devcontainer -> should prefer docker
      let result = await factory.detect('/workspace');
      expect(result.mode).toBe('docker');

      // Add devcontainer -> should prefer devcontainer
      fs.setFile(
        '/workspace/.devcontainer/devcontainer.json',
        JSON.stringify({
          name: 'Dev',
          image: 'alpine',
        })
      );
      result = await factory.detect('/workspace');
      expect(result.mode).toBe('devcontainer');

      // Disable Docker -> should fall back to native
      processExecutor.setDockerAvailable(false);
      result = await factory.detect('/workspace');
      expect(result.mode).toBe('native');
    });
  });

  describe('Executor Creation', () => {
    it('should create native executor successfully', async () => {
      const executor = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace',
      });

      expect(executor).toBeInstanceOf(NativeExecutor);
      expect(executor.getMode()).toBe('native');
      expect(executor.getCwd()).toBe('/workspace');

      await executor.cleanup();
    });

    it('should create executor with auto mode (detects native)', async () => {
      processExecutor.setDockerAvailable(false);

      const executor = await factory.createExecutor({
        mode: 'auto',
        projectDir: '/workspace',
      });

      expect(executor).toBeInstanceOf(NativeExecutor);
      expect(executor.getMode()).toBe('native');

      await executor.cleanup();
    });

    it('should initialize created executor', async () => {
      const executor = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace',
      });

      // Executor should be initialized and ready
      const result = await executor.execute('echo "test"');
      expect(result.exitCode).toBe(0);

      await executor.cleanup();
    });
  });

  describe('Docker Integration', () => {
    let container: StartedTestContainer;
    let createdExecutors: IExecutor[] = [];

    beforeAll(async () => {
      // Start a real container for testing
      container = await new GenericContainer('alpine:latest')
        .withCommand(['sh', '-c', 'tail -f /dev/null'])
        .withWaitStrategy(Wait.forLogMessage(/.*/, 1))
        .start();
    }, 60000);

    afterAll(async () => {
      if (container) {
        await container.stop();
      }
    });

    afterEach(async () => {
      // Clean up all created executors
      for (const executor of createdExecutors) {
        await executor.cleanup();
      }
      createdExecutors = [];
    });

    it('should create Docker executor and execute commands', async () => {
      processExecutor.setDockerAvailable(true);

      const executor = await factory.createExecutor({
        mode: 'docker',
        projectDir: '/workspace',
        docker: {
          image: container.getImage(),
          containerId: container.getId(),
        },
      });

      createdExecutors.push(executor);

      expect(executor).toBeInstanceOf(DockerExecutor);
      expect(executor.getMode()).toBe('docker');

      // Execute command in container
      const result = await executor.execute('echo "hello from docker"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello from docker');
    }, 30000);

    it('should handle file operations in Docker executor', async () => {
      const executor = await factory.createExecutor({
        mode: 'docker',
        projectDir: '/workspace',
        docker: {
          image: container.getImage(),
          containerId: container.getId(),
        },
      });

      createdExecutors.push(executor);

      // Write file
      await executor.writeFile('/tmp/test.txt', 'Docker file content');

      // Read file back
      const content = await executor.readFile('/tmp/test.txt');
      expect(content).toBe('Docker file content');
    }, 30000);

    it('should respect Docker configuration options', async () => {
      const executor = await factory.createExecutor({
        mode: 'docker',
        projectDir: '/workspace',
        docker: {
          image: container.getImage(),
          containerId: container.getId(),
          networkMode: 'none', // Disable network
        },
      });

      createdExecutors.push(executor);

      // Verify executor is configured correctly
      expect(executor.getMode()).toBe('docker');

      // Network should be disabled
      const result = await executor.execute('ping -c 1 8.8.8.8 2>&1 || echo "network disabled"');
      expect(result.stdout).toMatch(/network disabled|not found/);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should throw error for invalid mode', async () => {
      await expect(
        factory.createExecutor({
          mode: 'invalid-mode' as any,
          projectDir: '/workspace',
        })
      ).rejects.toThrow();
    });

    it('should throw error when Docker not available but requested', async () => {
      processExecutor.setDockerAvailable(false);

      await expect(
        factory.createExecutor({
          mode: 'docker',
          projectDir: '/workspace',
        })
      ).rejects.toThrow();
    });

    it('should handle devcontainer without Docker gracefully', async () => {
      processExecutor.setDockerAvailable(false);
      fs.setFile(
        '/workspace/.devcontainer/devcontainer.json',
        JSON.stringify({
          name: 'Test',
          image: 'alpine',
        })
      );

      await expect(
        factory.createExecutor({
          mode: 'devcontainer',
          projectDir: '/workspace',
        })
      ).rejects.toThrow();
    });
  });

  describe('Multiple Executor Management', () => {
    let executors: IExecutor[] = [];

    afterEach(async () => {
      for (const executor of executors) {
        await executor.cleanup();
      }
      executors = [];
    });

    it('should create multiple native executors independently', async () => {
      const executor1 = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace1',
      });

      const executor2 = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace2',
      });

      executors.push(executor1, executor2);

      expect(executor1.getCwd()).toBe('/workspace1');
      expect(executor2.getCwd()).toBe('/workspace2');

      // Should operate independently
      await executor1.execute('echo "test1"');
      await executor2.execute('echo "test2"');
    });

    it('should allow switching between executor modes', async () => {
      // Start with native
      const nativeExecutor = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace',
      });

      expect(nativeExecutor.getMode()).toBe('native');
      await nativeExecutor.cleanup();

      // Switch to auto (will detect native since Docker disabled)
      processExecutor.setDockerAvailable(false);
      const autoExecutor = await factory.createExecutor({
        mode: 'auto',
        projectDir: '/workspace',
      });

      expect(autoExecutor.getMode()).toBe('native');
      executors.push(autoExecutor);
    });
  });
});
