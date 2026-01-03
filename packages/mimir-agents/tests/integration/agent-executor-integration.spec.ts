/**
 * Integration tests for Agent with different Executors
 *
 * Tests the complete integration of Agent with:
 * - NativeExecutor (instant execution)
 * - DockerExecutor (containerized execution)
 * - ExecutorFactory (auto-detection)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Agent } from '../../src/core/Agent.js';
import { ToolRegistry } from '../../src/tools/ToolRegistry.js';
import { BashTool } from '../../src/tools/built-in/BashTool.js';
import { ReadFileTool } from '../../src/tools/built-in/ReadFileTool.js';
import { WriteFileTool } from '../../src/tools/built-in/WriteFileTool.js';
import { NativeExecutor } from '../../src/execution/NativeExecutor.js';
import { DockerExecutor } from '../../src/execution/DockerExecutor.js';
import { createExecutorFactory } from '../../src/execution/ExecutorFactory.js';
import { MockLLMProvider } from '../mocks/MockLLMProvider.js';
import type { IExecutor } from '../../src/execution/IExecutor.js';
import type { IFileSystem } from '../../src/shared/platform/IFileSystem.js';
import type { IProcessExecutor } from '../../src/shared/platform/IProcessExecutor.js';
import type { IDockerClient } from '../../src/shared/platform/IDockerClient.js';
import Dockerode from 'dockerode';

// Mock platform implementations
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

  async mkdir(path: string): Promise<void> {
    // No-op for mock
  }

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

  clear() {
    this.files.clear();
  }
}

class MockProcessExecutor implements IProcessExecutor {
  async execute(
    command: string,
    options?: { cwd?: string; timeout?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Simple command mocking for native executor
    if (command === 'echo "hello"') {
      return { stdout: 'hello\n', stderr: '', exitCode: 0 };
    }
    if (command.startsWith('echo ')) {
      return { stdout: command.substring(5).replace(/"/g, '') + '\n', stderr: '', exitCode: 0 };
    }
    if (command === 'pwd') {
      return { stdout: '/workspace\n', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: 'Command not found', exitCode: 127 };
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
    // Not implemented for this test - would need tar stream
    throw new Error('Not implemented');
  }

  async copyFromContainer(
    containerId: string,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    // Not implemented for this test - would need tar stream
    throw new Error('Not implemented');
  }

  async buildImage(options: {
    context: string;
    dockerfile?: string;
    tag: string;
    onProgress?: (progress: string) => void;
  }): Promise<void> {
    // Not implemented for this test
    throw new Error('Not implemented');
  }
}

describe('Agent + Executor Integration', () => {
  let llm: MockLLMProvider;
  let toolRegistry: ToolRegistry;
  let fs: MockFileSystem;
  let processExecutor: MockProcessExecutor;

  beforeEach(() => {
    llm = new MockLLMProvider();
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new BashTool());
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());

    fs = new MockFileSystem();
    processExecutor = new MockProcessExecutor();
  });

  describe('NativeExecutor Integration', () => {
    let nativeExecutor: NativeExecutor;

    beforeEach(async () => {
      nativeExecutor = new NativeExecutor(
        fs,
        processExecutor,
        {
          autoAccept: false,
          acceptRiskLevel: 'medium',
          alwaysAcceptCommands: [],
        },
        {
          mode: 'native',
          projectDir: '/workspace',
        }
      );
      await nativeExecutor.initialize();
    });

    afterEach(async () => {
      await nativeExecutor.cleanup();
    });

    it('should execute task with bash tool using native executor', async () => {
      const agent = new Agent(
        {
          name: 'TestAgent',
          role: 'tester',
          budget: { maxIterations: 5 },
        },
        llm as any,
        toolRegistry,
        nativeExecutor
      );

      llm.queueResponses([
        {
          content: 'I will run echo command',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "hello"' } }],
        },
        {
          content: 'Task completed: Command executed successfully',
        },
      ]);

      const result = await agent.execute('Run echo command');

      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(2);
      expect(result.steps[0]!.action.type).toBe('tool');
      expect(result.steps[0]!.action.tool).toBe('bash');
      expect(result.steps[0]!.observation?.success).toBe(true);
      expect(result.steps[0]!.observation?.output).toHaveProperty('stdout', 'hello\n');
    });

    it('should write and read files using native executor', async () => {
      const agent = new Agent(
        {
          name: 'FileAgent',
          role: 'file-manager',
          budget: { maxIterations: 10 },
        },
        llm as any,
        toolRegistry,
        nativeExecutor
      );

      llm.queueResponses([
        {
          content: 'Writing file',
          toolCalls: [
            {
              name: 'write_file',
              arguments: { path: '/workspace/test.txt', content: 'Hello, World!' },
            },
          ],
        },
        {
          content: 'Reading file',
          toolCalls: [{ name: 'read_file', arguments: { path: '/workspace/test.txt' } }],
        },
        {
          content: 'Task completed: File operations successful',
        },
      ]);

      const result = await agent.execute('Write and read a test file');

      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(3);

      // Check write operation
      expect(result.steps[0]!.observation?.success).toBe(true);

      // Check read operation
      expect(result.steps[1]!.observation?.success).toBe(true);
      expect(result.steps[1]!.observation?.output).toContain('Hello, World!');
    });

    it('should get correct working directory from executor', async () => {
      const agent = new Agent(
        {
          name: 'CwdAgent',
          role: 'tester',
          budget: { maxIterations: 5 },
        },
        llm as any,
        toolRegistry,
        nativeExecutor
      );

      llm.queueResponses([
        {
          content: 'Checking directory',
          toolCalls: [{ name: 'bash', arguments: { command: 'pwd' } }],
        },
        {
          content: 'Task completed: Directory checked',
        },
      ]);

      const result = await agent.execute('Check current directory');

      expect(result.success).toBe(true);
      expect(result.steps[0]!.observation?.output).toHaveProperty('stdout', '/workspace\n');
    });
  });

  describe('DockerExecutor Integration', () => {
    let dockerExecutor: DockerExecutor;
    let dockerClient: RealDockerClient;
    let container: StartedTestContainer;

    beforeAll(async () => {
      // Start a real Docker container using testcontainers
      container = await new GenericContainer('alpine:latest')
        .withCommand(['sh', '-c', 'tail -f /dev/null'])
        .withWaitStrategy(Wait.forLogMessage(/.*/, 1))
        .start();
    }, 60000); // 60s timeout for pulling image

    afterAll(async () => {
      if (container) {
        await container.stop();
      }
    });

    beforeEach(async () => {
      dockerClient = new RealDockerClient();
      fs.clear();
    });

    it('should execute bash commands in real Docker container', async () => {
      dockerExecutor = new DockerExecutor(
        fs,
        processExecutor,
        dockerClient,
        {
          autoAccept: false,
          acceptRiskLevel: 'medium',
          alwaysAcceptCommands: [],
        },
        {
          mode: 'docker',
          projectDir: '/workspace',
          docker: {
            image: container.getImage(),
            containerId: container.getId(),
          },
        }
      );

      await dockerExecutor.initialize();

      const agent = new Agent(
        {
          name: 'DockerAgent',
          role: 'tester',
          budget: { maxIterations: 5 },
        },
        llm as any,
        toolRegistry,
        dockerExecutor
      );

      llm.queueResponses([
        {
          content: 'Running command in Docker',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "docker test"' } }],
        },
        {
          content: 'Task completed: Docker command executed',
        },
      ]);

      const result = await agent.execute('Run command in Docker');

      expect(result.success).toBe(true);
      expect(result.steps[0]!.observation?.success).toBe(true);
      expect(result.steps[0]!.observation?.output?.stdout).toContain('docker test');

      await dockerExecutor.cleanup();
    }, 30000);

    it('should verify file isolation in Docker container', async () => {
      dockerExecutor = new DockerExecutor(
        fs,
        processExecutor,
        dockerClient,
        {
          autoAccept: false,
          acceptRiskLevel: 'medium',
          alwaysAcceptCommands: [],
        },
        {
          mode: 'docker',
          projectDir: '/workspace',
          docker: {
            image: container.getImage(),
            containerId: container.getId(),
          },
        }
      );

      await dockerExecutor.initialize();

      const agent = new Agent(
        {
          name: 'IsolationAgent',
          role: 'tester',
          budget: { maxIterations: 10 },
        },
        llm as any,
        toolRegistry,
        dockerExecutor
      );

      llm.queueResponses([
        {
          content: 'Creating file in container',
          toolCalls: [
            { name: 'bash', arguments: { command: 'echo "isolated" > /tmp/isolated.txt' } },
          ],
        },
        {
          content: 'Reading file from container',
          toolCalls: [{ name: 'bash', arguments: { command: 'cat /tmp/isolated.txt' } }],
        },
        {
          content: 'Task completed: File isolation verified',
        },
      ]);

      const result = await agent.execute('Test file isolation in Docker');

      expect(result.success).toBe(true);
      expect(result.steps[1]!.observation?.output?.stdout).toContain('isolated');

      await dockerExecutor.cleanup();
    }, 30000);
  });

  describe('ExecutorFactory Integration', () => {
    it('should auto-detect and create native executor', async () => {
      const factory = createExecutorFactory({
        fs,
        process: processExecutor,
        docker: new RealDockerClient(),
        permissionConfig: {
          autoAccept: false,
          acceptRiskLevel: 'medium',
          alwaysAcceptCommands: [],
        },
      });

      const executor = await factory.createExecutor({
        mode: 'auto',
        projectDir: '/workspace',
      });

      expect(executor).toBeInstanceOf(NativeExecutor);
      expect(executor.getMode()).toBe('native');

      await executor.cleanup();
    });

    it('should use executor from factory with agent', async () => {
      const factory = createExecutorFactory({
        fs,
        process: processExecutor,
        docker: new RealDockerClient(),
        permissionConfig: {
          autoAccept: false,
          acceptRiskLevel: 'medium',
          alwaysAcceptCommands: [],
        },
      });

      const executor = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace',
      });

      const agent = new Agent(
        {
          name: 'FactoryAgent',
          role: 'tester',
          budget: { maxIterations: 5 },
        },
        llm as any,
        toolRegistry,
        executor
      );

      llm.queueResponses([
        {
          content: 'Testing with factory executor',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "factory test"' } }],
        },
        {
          content: 'Task completed: Factory executor works',
        },
      ]);

      const result = await agent.execute('Test factory executor');

      expect(result.success).toBe(true);
      expect(result.steps[0]!.observation?.success).toBe(true);

      await executor.cleanup();
    });
  });

  describe('Multi-Tool Agent Integration', () => {
    let executor: NativeExecutor;

    beforeEach(async () => {
      executor = new NativeExecutor(
        fs,
        processExecutor,
        {
          autoAccept: false,
          acceptRiskLevel: 'medium',
          alwaysAcceptCommands: [],
        },
        {
          mode: 'native',
          projectDir: '/workspace',
        }
      );
      await executor.initialize();
    });

    afterEach(async () => {
      await executor.cleanup();
    });

    it('should execute complex multi-tool workflow', async () => {
      const agent = new Agent(
        {
          name: 'ComplexAgent',
          role: 'developer',
          budget: { maxIterations: 20 },
        },
        llm as any,
        toolRegistry,
        executor
      );

      llm.queueResponses([
        {
          content: 'Step 1: Write config file',
          toolCalls: [
            {
              name: 'write_file',
              arguments: { path: '/workspace/config.json', content: '{"name":"test"}' },
            },
          ],
        },
        {
          content: 'Step 2: Read config file',
          toolCalls: [{ name: 'read_file', arguments: { path: '/workspace/config.json' } }],
        },
        {
          content: 'Step 3: Echo config name',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "Config: test"' } }],
        },
        {
          content: 'Task completed: All operations successful',
        },
      ]);

      const result = await agent.execute('Create and verify configuration');

      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(4);

      // Verify all tools were used successfully
      expect(result.steps[0]!.action.tool).toBe('write_file');
      expect(result.steps[0]!.observation?.success).toBe(true);

      expect(result.steps[1]!.action.tool).toBe('read_file');
      expect(result.steps[1]!.observation?.success).toBe(true);
      expect(result.steps[1]!.observation?.output).toContain('{"name":"test"}');

      expect(result.steps[2]!.action.tool).toBe('bash');
      expect(result.steps[2]!.observation?.success).toBe(true);
    });
  });
});
