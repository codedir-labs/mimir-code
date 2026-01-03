/**
 * Cross-Executor Scenario Integration Tests
 *
 * Tests complex scenarios involving multiple executors:
 * - Switching between execution modes
 * - File isolation verification
 * - Performance characteristics
 * - Resource cleanup and lifecycle
 * - State management across modes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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

// Minimal mock implementations
class MockFileSystem implements IFileSystem {
  private files = new Map<string, string>();

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) throw new Error(`ENOENT: ${path}`);
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
    return [];
  }
  async unlink(path: string): Promise<void> {
    this.files.delete(path);
  }
  async stat(path: string): Promise<any> {
    return { isDirectory: () => false, isFile: () => this.files.has(path) };
  }
  async glob(pattern: string): Promise<string[]> {
    return Array.from(this.files.keys());
  }

  clear() {
    this.files.clear();
  }
}

class MockProcessExecutor implements IProcessExecutor {
  async execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (command.startsWith('echo ')) {
      return { stdout: command.substring(5) + '\n', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }
}

class RealDockerClient implements IDockerClient {
  private docker = new Dockerode();

  async pullImage(image: string, onProgress?: (progress: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve()));
      });
    });
  }

  async createContainer(options: any): Promise<string> {
    const container = await this.docker.createContainer({
      Image: options.image,
      Cmd: options.cmd,
      WorkingDir: options.workingDir,
      HostConfig: { NetworkMode: options.networkMode || 'bridge' },
      Tty: true,
      OpenStdin: true,
    });
    return container.id;
  }

  async startContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).start();
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      await this.docker.getContainer(containerId).stop({ t: 5 });
    } catch (err: any) {
      if (!err.message?.includes('already stopped')) throw err;
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).remove({ force: true });
  }

  async executeCommand(
    containerId: string,
    command: string,
    options?: any
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
        if (err) return reject(err);

        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk: Buffer) => {
          const header = chunk.readUInt8(0);
          const data = chunk.slice(8).toString();
          if (header === 1) stdout += data;
          else if (header === 2) stderr += data;
        });

        stream.on('end', async () => {
          const inspectData = await exec.inspect();
          resolve({ stdout, stderr, exitCode: inspectData.ExitCode || 0 });
        });

        stream.on('error', reject);
      });
    });
  }

  async getContainerStatus(containerId: string): Promise<'running' | 'stopped' | 'error'> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.State.Running ? 'running' : 'stopped';
    } catch {
      return 'error';
    }
  }

  async copyToContainer(): Promise<void> {
    throw new Error('Not implemented');
  }
  async copyFromContainer(): Promise<void> {
    throw new Error('Not implemented');
  }
  async buildImage(): Promise<void> {
    throw new Error('Not implemented');
  }
}

describe('Cross-Executor Scenarios', () => {
  let fs: MockFileSystem;
  let processExecutor: MockProcessExecutor;
  let dockerClient: RealDockerClient;
  let container: StartedTestContainer;

  beforeAll(async () => {
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

  beforeEach(() => {
    fs = new MockFileSystem();
    processExecutor = new MockProcessExecutor();
    dockerClient = new RealDockerClient();
  });

  describe('File Isolation Between Executors', () => {
    it('should isolate files between native and Docker executors', async () => {
      const nativeExecutor = new NativeExecutor(fs, processExecutor, '/workspace');
      await nativeExecutor.initialize();

      const dockerExecutor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: container.getImage(),
        containerId: container.getId(),
      });
      await dockerExecutor.initialize();

      // Write file in native executor
      await nativeExecutor.writeFile('/workspace/native.txt', 'Native content');

      // Verify it exists in native
      const nativeExists = await nativeExecutor.exists('/workspace/native.txt');
      expect(nativeExists).toBe(true);

      // Write different file in Docker executor
      await dockerExecutor.writeFile('/tmp/docker.txt', 'Docker content');

      // Read from Docker
      const dockerContent = await dockerExecutor.readFile('/tmp/docker.txt');
      expect(dockerContent).toBe('Docker content');

      // Files should be isolated (native file not in Docker)
      const dockerHasNativeFile = await dockerExecutor.exists('/workspace/native.txt');
      expect(dockerHasNativeFile).toBe(false);

      await nativeExecutor.cleanup();
      await dockerExecutor.cleanup();
    }, 30000);

    it('should maintain isolation with multiple agents using different executors', async () => {
      const llm1 = new MockLLMProvider();
      const llm2 = new MockLLMProvider();
      const toolRegistry1 = new ToolRegistry();
      const toolRegistry2 = new ToolRegistry();

      toolRegistry1.register(new WriteFileTool());
      toolRegistry1.register(new ReadFileTool());
      toolRegistry2.register(new WriteFileTool());
      toolRegistry2.register(new ReadFileTool());

      const nativeExecutor = new NativeExecutor(fs, processExecutor, '/workspace');
      await nativeExecutor.initialize();

      const dockerExecutor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: container.getImage(),
        containerId: container.getId(),
      });
      await dockerExecutor.initialize();

      const agent1 = new Agent(
        { name: 'NativeAgent', role: 'native-worker', budget: { maxIterations: 10 } },
        llm1 as any,
        toolRegistry1,
        nativeExecutor
      );

      const agent2 = new Agent(
        { name: 'DockerAgent', role: 'docker-worker', budget: { maxIterations: 10 } },
        llm2 as any,
        toolRegistry2,
        dockerExecutor
      );

      // Agent 1 writes to native
      llm1.queueResponses([
        {
          content: 'Writing to native',
          toolCalls: [
            {
              name: 'write_file',
              arguments: { path: '/workspace/agent1.txt', content: 'Agent 1' },
            },
          ],
        },
        { content: 'Task completed: File written' },
      ]);

      // Agent 2 writes to Docker
      llm2.queueResponses([
        {
          content: 'Writing to docker',
          toolCalls: [
            { name: 'write_file', arguments: { path: '/tmp/agent2.txt', content: 'Agent 2' } },
          ],
        },
        { content: 'Task completed: File written' },
      ]);

      const result1 = await agent1.execute('Write file as agent 1');
      const result2 = await agent2.execute('Write file as agent 2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify isolation
      const native = await nativeExecutor.readFile('/workspace/agent1.txt');
      expect(native).toBe('Agent 1');

      const docker = await dockerExecutor.readFile('/tmp/agent2.txt');
      expect(docker).toBe('Agent 2');

      await nativeExecutor.cleanup();
      await dockerExecutor.cleanup();
    }, 30000);
  });

  describe('Executor Switching', () => {
    it('should switch from native to Docker executor mid-workflow', async () => {
      const llm = new MockLLMProvider();
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(new BashTool());
      toolRegistry.register(new WriteFileTool());

      // Start with native executor
      const nativeExecutor = new NativeExecutor(fs, processExecutor, '/workspace');
      await nativeExecutor.initialize();

      const agent = new Agent(
        { name: 'SwitchAgent', role: 'switcher', budget: { maxIterations: 10 } },
        llm as any,
        toolRegistry,
        nativeExecutor
      );

      llm.queueResponses([
        {
          content: 'Running native command',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "native"' } }],
        },
        { content: 'Task completed: Native execution done' },
      ]);

      const result1 = await agent.execute('Run native command');
      expect(result1.success).toBe(true);

      await nativeExecutor.cleanup();

      // Switch to Docker executor (in real scenario, would update agent's executor)
      const dockerExecutor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: container.getImage(),
        containerId: container.getId(),
      });
      await dockerExecutor.initialize();

      const dockerAgent = new Agent(
        { name: 'SwitchAgent2', role: 'switcher', budget: { maxIterations: 10 } },
        llm as any,
        toolRegistry,
        dockerExecutor
      );

      llm.queueResponses([
        {
          content: 'Running docker command',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "docker"' } }],
        },
        { content: 'Task completed: Docker execution done' },
      ]);

      const result2 = await dockerAgent.execute('Run docker command');
      expect(result2.success).toBe(true);
      expect(result2.steps[0]!.observation?.output?.stdout).toContain('docker');

      await dockerExecutor.cleanup();
    }, 30000);
  });

  describe('Performance Characteristics', () => {
    it('should measure native vs Docker execution overhead', async () => {
      const nativeExecutor = new NativeExecutor(fs, processExecutor, '/workspace');
      await nativeExecutor.initialize();

      const dockerExecutor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: container.getImage(),
        containerId: container.getId(),
      });
      await dockerExecutor.initialize();

      // Measure native execution
      const nativeStart = Date.now();
      for (let i = 0; i < 10; i++) {
        await nativeExecutor.execute('echo "test"');
      }
      const nativeDuration = Date.now() - nativeStart;

      // Measure Docker execution
      const dockerStart = Date.now();
      for (let i = 0; i < 10; i++) {
        await dockerExecutor.execute('echo "test"');
      }
      const dockerDuration = Date.now() - dockerStart;

      // Docker should be slower due to container overhead
      expect(dockerDuration).toBeGreaterThan(nativeDuration);

      // But both should complete reasonably quickly (< 5s for 10 commands)
      expect(nativeDuration).toBeLessThan(5000);
      expect(dockerDuration).toBeLessThan(5000);

      console.log(`Native: ${nativeDuration}ms, Docker: ${dockerDuration}ms`);

      await nativeExecutor.cleanup();
      await dockerExecutor.cleanup();
    }, 30000);
  });

  describe('Resource Cleanup', () => {
    it('should properly cleanup multiple executors', async () => {
      const executors: IExecutor[] = [];

      // Create multiple executors
      for (let i = 0; i < 3; i++) {
        const executor = new NativeExecutor(fs, processExecutor, `/workspace${i}`);
        await executor.initialize();
        executors.push(executor);
      }

      // Create Docker executor
      const dockerExecutor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: container.getImage(),
        containerId: container.getId(),
      });
      await dockerExecutor.initialize();
      executors.push(dockerExecutor);

      // Cleanup all
      for (const executor of executors) {
        await executor.cleanup();
      }

      // All should cleanup without errors
      expect(executors.length).toBe(4);
    }, 30000);

    it('should handle cleanup even if executor failed', async () => {
      const executor = new DockerExecutor(dockerClient, fs, '/workspace', {
        image: container.getImage(),
        containerId: container.getId(),
      });

      await executor.initialize();

      // Force an error (execute invalid command)
      await expect(executor.execute('invalid-command-xyz')).rejects.toThrow();

      // Cleanup should still work
      await expect(executor.cleanup()).resolves.not.toThrow();
    }, 30000);
  });

  describe('ExecutorFactory Cross-Mode', () => {
    it('should create different executors from same factory', async () => {
      const factory = createExecutorFactory({
        fs,
        processExecutor,
        dockerClient,
      });

      const nativeExecutor = await factory.createExecutor({
        mode: 'native',
        projectDir: '/workspace',
      });

      const dockerExecutor = await factory.createExecutor({
        mode: 'docker',
        projectDir: '/workspace',
        docker: {
          image: container.getImage(),
          containerId: container.getId(),
        },
      });

      expect(nativeExecutor.getMode()).toBe('native');
      expect(dockerExecutor.getMode()).toBe('docker');

      // Both should work independently
      const nativeResult = await nativeExecutor.execute('echo "native"');
      const dockerResult = await dockerExecutor.execute('echo "docker"');

      expect(nativeResult.exitCode).toBe(0);
      expect(dockerResult.exitCode).toBe(0);
      expect(dockerResult.stdout).toContain('docker');

      await nativeExecutor.cleanup();
      await dockerExecutor.cleanup();
    }, 30000);
  });

  describe('State Management Across Modes', () => {
    it('should maintain agent state when switching executors', async () => {
      const llm = new MockLLMProvider();
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(new BashTool());

      const nativeExecutor = new NativeExecutor(fs, processExecutor, '/workspace');
      await nativeExecutor.initialize();

      const agent = new Agent(
        { name: 'StatefulAgent', role: 'stateful', budget: { maxIterations: 20 } },
        llm as any,
        toolRegistry,
        nativeExecutor
      );

      llm.queueResponses([
        {
          content: 'Step 1 with native',
          toolCalls: [{ name: 'bash', arguments: { command: 'echo "step1"' } }],
        },
        { content: 'Task completed: Step 1 done' },
      ]);

      const result1 = await agent.execute('Execute step 1');
      expect(result1.success).toBe(true);

      const stateAfterNative = agent.getStatus();
      expect(stateAfterNative.steps.length).toBe(2);
      expect(stateAfterNative.totalTokens).toBeGreaterThan(0);

      // Agent retains its state regardless of executor
      // (In real scenario, you'd create new agent with new executor but could resume state)

      await nativeExecutor.cleanup();
    });
  });
});
