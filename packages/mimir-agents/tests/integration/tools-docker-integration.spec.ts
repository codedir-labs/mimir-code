/**
 * Integration tests for Tools with real Docker containers
 *
 * Uses testcontainers to verify tools work correctly with:
 * - Real Docker containers (Alpine, Node)
 * - File operations in isolated environments
 * - Command execution across different images
 * - Network isolation and security
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { BashTool } from '../../src/tools/built-in/BashTool.js';
import { ReadFileTool } from '../../src/tools/built-in/ReadFileTool.js';
import { WriteFileTool } from '../../src/tools/built-in/WriteFileTool.js';
import { DockerExecutor } from '../../src/execution/DockerExecutor.js';
import type { IFileSystem } from '../../src/shared/platform/IFileSystem.js';
import type { IDockerClient } from '../../src/shared/platform/IDockerClient.js';
import Dockerode from 'dockerode';

// Minimal mock filesystem (container operations bypass this)
class MockFileSystem implements IFileSystem {
  async readFile(path: string): Promise<string> {
    throw new Error('Should use container fs');
  }
  async writeFile(path: string, content: string): Promise<void> {
    throw new Error('Should use container fs');
  }
  async exists(path: string): Promise<boolean> {
    return false;
  }
  async mkdir(path: string): Promise<void> {}
  async readdir(path: string): Promise<string[]> {
    return [];
  }
  async unlink(path: string): Promise<void> {}
  async stat(path: string): Promise<{ isDirectory: () => boolean; isFile: () => boolean }> {
    return { isDirectory: () => false, isFile: () => false };
  }
  async glob(pattern: string): Promise<string[]> {
    return [];
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
          // Docker multiplexes stdout/stderr - first 8 bytes are header
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

describe('Tools + Docker Integration', () => {
  let alpineContainer: StartedTestContainer;
  let nodeContainer: StartedTestContainer;
  let dockerClient: RealDockerClient;
  let fs: MockFileSystem;

  beforeAll(async () => {
    // Start real Docker containers using testcontainers
    alpineContainer = await new GenericContainer('alpine:latest')
      .withCommand(['sh', '-c', 'tail -f /dev/null'])
      .withWaitStrategy(Wait.forLogMessage(/.*/, 1))
      .start();

    nodeContainer = await new GenericContainer('node:20-alpine')
      .withCommand(['sh', '-c', 'tail -f /dev/null'])
      .withWaitStrategy(Wait.forLogMessage(/.*/, 1))
      .start();
  }, 120000); // 2 minute timeout for pulling images

  afterAll(async () => {
    if (alpineContainer) {
      await alpineContainer.stop();
    }
    if (nodeContainer) {
      await nodeContainer.stop();
    }
  });

  beforeEach(() => {
    dockerClient = new RealDockerClient();
    fs = new MockFileSystem();
  });

  describe('BashTool with Docker', () => {
    it('should execute bash commands in Alpine container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();
      const result = await bashTool.execute({ command: 'echo "Hello from Alpine"' }, { executor });

      expect(result.success).toBe(true);
      expect(result.output?.stdout).toContain('Hello from Alpine');
      expect(result.output?.exitCode).toBe(0);

      await executor.cleanup();
    }, 30000);

    it('should execute bash commands in Node container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: nodeContainer.getImage(),
        containerId: nodeContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();
      const result = await bashTool.execute({ command: 'node --version' }, { executor });

      expect(result.success).toBe(true);
      expect(result.output?.stdout).toMatch(/v20\.\d+\.\d+/);
      expect(result.output?.exitCode).toBe(0);

      await executor.cleanup();
    }, 30000);

    it('should handle command failures in container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();
      const result = await bashTool.execute({ command: 'nonexistent-command' }, { executor });

      expect(result.success).toBe(true); // Tool succeeds, command fails
      expect(result.output?.exitCode).not.toBe(0);
      expect(result.output?.stderr).toContain('not found');

      await executor.cleanup();
    }, 30000);

    it('should respect working directory in container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();

      // Create directory and file
      await bashTool.execute({ command: 'mkdir -p /tmp/test' }, { executor });
      await bashTool.execute({ command: 'touch /tmp/test/file.txt' }, { executor });

      // Run command from specific directory
      const result = await bashTool.execute({ command: 'ls', cwd: '/tmp/test' }, { executor });

      expect(result.success).toBe(true);
      expect(result.output?.stdout).toContain('file.txt');

      await executor.cleanup();
    }, 30000);

    it('should handle timeout in container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();
      const result = await bashTool.execute({ command: 'sleep 10', timeout: 1000 }, { executor });

      // Should fail due to timeout
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();

      await executor.cleanup();
    }, 30000);
  });

  describe('WriteFileTool + ReadFileTool with Docker', () => {
    it('should write and read files in Alpine container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const writeTool = new WriteFileTool();
      const readTool = new ReadFileTool();

      // Write file
      const writeResult = await writeTool.execute(
        {
          path: '/tmp/test-file.txt',
          content: 'Hello from WriteFileTool!',
        },
        { executor }
      );

      expect(writeResult.success).toBe(true);
      expect(writeResult.output?.bytesWritten).toBe(25);

      // Read file back
      const readResult = await readTool.execute({ path: '/tmp/test-file.txt' }, { executor });

      expect(readResult.success).toBe(true);
      expect(readResult.output).toContain('Hello from WriteFileTool!');

      await executor.cleanup();
    }, 30000);

    it('should handle large files in container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const writeTool = new WriteFileTool();
      const readTool = new ReadFileTool();

      // Write large file (10KB)
      const largeContent = 'x'.repeat(10000);
      const writeResult = await writeTool.execute(
        {
          path: '/tmp/large-file.txt',
          content: largeContent,
        },
        { executor }
      );

      expect(writeResult.success).toBe(true);
      expect(writeResult.output?.bytesWritten).toBe(10000);

      // Read it back
      const readResult = await readTool.execute({ path: '/tmp/large-file.txt' }, { executor });

      expect(readResult.success).toBe(true);
      expect(readResult.output).toContain('x'.repeat(100)); // Check partial content

      await executor.cleanup();
    }, 30000);

    it('should verify file isolation between operations', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const writeTool = new WriteFileTool();
      const readTool = new ReadFileTool();

      // Write first file
      await writeTool.execute({ path: '/tmp/file1.txt', content: 'Content 1' }, { executor });

      // Write second file
      await writeTool.execute({ path: '/tmp/file2.txt', content: 'Content 2' }, { executor });

      // Verify they're isolated
      const read1 = await readTool.execute({ path: '/tmp/file1.txt' }, { executor });
      const read2 = await readTool.execute({ path: '/tmp/file2.txt' }, { executor });

      expect(read1.output).toContain('Content 1');
      expect(read1.output).not.toContain('Content 2');
      expect(read2.output).toContain('Content 2');
      expect(read2.output).not.toContain('Content 1');

      await executor.cleanup();
    }, 30000);

    it('should handle read of non-existent file', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const readTool = new ReadFileTool();
      const result = await readTool.execute({ path: '/tmp/nonexistent.txt' }, { executor });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();

      await executor.cleanup();
    }, 30000);

    it('should support offset and limit when reading files', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const writeTool = new WriteFileTool();
      const readTool = new ReadFileTool();

      // Write multi-line file
      await writeTool.execute(
        {
          path: '/tmp/multiline.txt',
          content: 'line 1\nline 2\nline 3\nline 4\nline 5',
        },
        { executor }
      );

      // Read with offset and limit
      const result = await readTool.execute(
        { path: '/tmp/multiline.txt', offset: 2, limit: 2 },
        { executor }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('line 2');
      expect(result.output).toContain('line 3');
      expect(result.output).not.toContain('line 1');
      expect(result.output).not.toContain('line 4');

      await executor.cleanup();
    }, 30000);
  });

  describe('Multi-Tool Workflows with Docker', () => {
    it('should execute complete workflow: bash + write + read', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();
      const writeTool = new WriteFileTool();
      const readTool = new ReadFileTool();

      // Step 1: Create directory with bash
      const mkdirResult = await bashTool.execute(
        { command: 'mkdir -p /workspace/project' },
        { executor }
      );
      expect(mkdirResult.success).toBe(true);

      // Step 2: Write file with WriteTool
      const writeResult = await writeTool.execute(
        {
          path: '/workspace/project/README.md',
          content: '# My Project\n\nThis is a test project.',
        },
        { executor }
      );
      expect(writeResult.success).toBe(true);

      // Step 3: Verify with bash
      const catResult = await bashTool.execute(
        { command: 'cat /workspace/project/README.md' },
        { executor }
      );
      expect(catResult.success).toBe(true);
      expect(catResult.output?.stdout).toContain('# My Project');

      // Step 4: Read with ReadTool
      const readResult = await readTool.execute(
        { path: '/workspace/project/README.md' },
        { executor }
      );
      expect(readResult.success).toBe(true);
      expect(readResult.output).toContain('This is a test project');

      await executor.cleanup();
    }, 30000);

    it('should handle Node.js workflow in Node container', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: nodeContainer.getImage(),
        containerId: nodeContainer.getId(),
      });

      await executor.initialize();

      const bashTool = new BashTool();
      const writeTool = new WriteFileTool();

      // Write simple Node.js script
      await writeTool.execute(
        {
          path: '/tmp/hello.js',
          content: 'console.log("Hello from Node.js");',
        },
        { executor }
      );

      // Execute with Node
      const result = await bashTool.execute({ command: 'node /tmp/hello.js' }, { executor });

      expect(result.success).toBe(true);
      expect(result.output?.stdout).toContain('Hello from Node.js');

      await executor.cleanup();
    }, 30000);
  });

  describe('Security and Isolation', () => {
    it('should prevent access to host filesystem', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
        networkMode: 'none', // Disable network
      });

      await executor.initialize();

      const bashTool = new BashTool();

      // Try to access typical host paths (should fail or be empty)
      const result = await bashTool.execute(
        { command: 'ls /host 2>&1 || echo "no host access"' },
        { executor }
      );

      expect(result.success).toBe(true);
      expect(result.output?.stdout).toContain('no host access');

      await executor.cleanup();
    }, 30000);

    it('should enforce network isolation when configured', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: alpineContainer.getImage(),
        containerId: alpineContainer.getId(),
        networkMode: 'none',
      });

      await executor.initialize();

      const bashTool = new BashTool();

      // Try to ping external host (should fail with network disabled)
      const result = await bashTool.execute(
        { command: 'ping -c 1 8.8.8.8 2>&1 || echo "network blocked"' },
        { executor }
      );

      expect(result.success).toBe(true);
      // Should fail to ping or not have ping command
      expect(result.output?.stdout).toMatch(/network blocked|not found/);

      await executor.cleanup();
    }, 30000);
  });
});
