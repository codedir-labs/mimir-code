/**
 * Unit tests for ProcessExecutorAdapter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessExecutorAdapter } from '../../../src/platform/ProcessExecutorAdapter.js';
import { platform } from 'os';

describe('ProcessExecutorAdapter', () => {
  let executor: ProcessExecutorAdapter;

  beforeEach(() => {
    executor = new ProcessExecutorAdapter();
  });

  describe('execute', () => {
    it('should execute simple command', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'hello'] : ['hello'];

      const result = await executor.execute(command, args);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });

    it('should capture stderr', async () => {
      const isWindows = platform() === 'win32';

      // Write to stderr using different commands based on OS
      const result = isWindows
        ? await executor.executeShell('echo error >&2')
        : await executor.execute('sh', ['-c', 'echo error >&2']);

      expect(result.stderr).toContain('error');
    });

    it('should handle command failure', async () => {
      const result = await executor.execute('nonexistentcommand123456');

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });

    it.skipIf(platform() === 'win32')(
      'should respect timeout',
      async () => {
        // Note: Windows 'timeout' command doesn't respond well to SIGTERM, so we skip this test on Windows
        const sleepCmd = 'sleep 5';

        const result = await executor.executeShell(sleepCmd, { timeout: 100 });

        expect(result.timedOut).toBe(true);
      },
      10000
    );

    it('should pass environment variables', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd' : 'sh';
      const args = isWindows ? ['/c', 'echo', '%TEST_VAR%'] : ['-c', 'echo $TEST_VAR'];

      const result = await executor.execute(command, args, {
        env: { ...process.env, TEST_VAR: 'test_value' },
      });

      expect(result.stdout).toContain('test_value');
    });

    it('should set working directory', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd' : 'pwd';
      const args = isWindows ? ['/c', 'cd'] : [];

      const result = await executor.execute(command, args, {
        cwd: process.cwd(),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('executeShell', () => {
    it('should execute shell command', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'echo hello world' : 'echo "hello world"';

      const result = await executor.executeShell(command);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello world');
    });

    it('should handle pipes and redirects', async () => {
      const isWindows = platform() === 'win32';

      if (!isWindows) {
        const result = await executor.executeShell('echo "test" | grep "test"');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('test');
      }
    });

    it('should handle command chaining', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'echo hello && echo world' : 'echo hello && echo world';

      const result = await executor.executeShell(command);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
      expect(result.stdout).toContain('world');
    });
  });

  describe('spawn', () => {
    it('should spawn process without waiting', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'spawned'] : ['spawned'];

      const child = executor.spawn(command, args);

      expect(child).toBeDefined();
      expect(child.pid).toBeGreaterThan(0);

      // Wait for process to complete
      await new Promise((resolve) => {
        child.on('exit', resolve);
      });
    });

    it('should allow reading output from spawned process', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cmd' : 'echo';
      const args = isWindows ? ['/c', 'echo', 'output'] : ['output'];

      const child = executor.spawn(command, args);

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      await new Promise((resolve) => {
        child.on('exit', resolve);
      });

      expect(output).toContain('output');
    });
  });
});
