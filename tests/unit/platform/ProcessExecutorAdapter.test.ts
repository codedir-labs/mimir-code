/**
 * Unit tests for ProcessExecutorAdapter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProcessExecutorAdapter } from '@codedir/mimir-agents-node/platform';
import { platform } from 'os';

describe('ProcessExecutorAdapter', () => {
  let executor: ProcessExecutorAdapter;

  beforeEach(() => {
    executor = new ProcessExecutorAdapter();
  });

  describe('execute', () => {
    it('should execute simple command', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'echo hello' : 'echo hello';

      const result = await executor.execute(command);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });

    it('should capture stderr', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'echo error >&2' : 'echo error >&2';

      const result = await executor.execute(command);

      expect(result.stderr).toContain('error');
    });

    it('should handle command failure', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'echo error >&2 && exit 1' : 'echo error >&2; exit 1';

      const result = await executor.execute(command);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('error');
    });

    it('should handle non-existent command', async () => {
      const result = await executor.execute('nonexistentcommand123456');

      // Should return non-zero exit code (typically 127 for command not found)
      expect(result.exitCode).not.toBe(0);
      // Note: stderr may or may not contain content depending on platform
      // The important thing is that the command failed with a non-zero exit code
    });

    it.skipIf(platform() === 'win32')(
      'should respect timeout',
      async () => {
        // Note: Windows 'timeout' command doesn't respond well to SIGTERM, so we skip this test on Windows
        const result = await executor.execute('sleep 5', { timeout: 100 });

        // execa doesn't return timedOut property, but timeout causes exitCode to be non-zero
        expect(result.exitCode).not.toBe(0);
        // Signal should be set when killed due to timeout
        expect(result.signal).toBeTruthy();
      },
      10000
    );

    it('should pass environment variables', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'echo %TEST_VAR%' : 'echo $TEST_VAR';

      const result = await executor.execute(command, {
        env: { ...process.env, TEST_VAR: 'test_value' },
      });

      expect(result.stdout).toContain('test_value');
    });

    it('should set working directory', async () => {
      const isWindows = platform() === 'win32';
      const command = isWindows ? 'cd' : 'pwd';

      const result = await executor.execute(command, {
        cwd: process.cwd(),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should handle command chaining', async () => {
      const command = 'echo hello && echo world';

      const result = await executor.execute(command);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
      expect(result.stdout).toContain('world');
    });

    it.skipIf(platform() === 'win32')('should handle pipes and redirects', async () => {
      const result = await executor.execute('echo "test" | grep "test"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test');
    });
  });
});
