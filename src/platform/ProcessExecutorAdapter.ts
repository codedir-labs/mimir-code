/**
 * ProcessExecutorAdapter - Cross-platform process execution implementation
 * Uses execa for reliable cross-platform command execution
 */

import { IProcessExecutor, ExecOptions, ExecResult } from './IProcessExecutor.js';
import { execa, execaCommand } from 'execa';
import { ChildProcess } from 'child_process';

export class ProcessExecutorAdapter implements IProcessExecutor {
  /**
   * Execute command and wait for completion
   */
  async execute(
    command: string,
    args: string[] = [],
    options: ExecOptions = {}
  ): Promise<ExecResult> {
    try {
      const result = await execa(command, args, {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        shell: options.shell,
        input: options.input,
        reject: false, // Don't throw on non-zero exit codes
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        command: result.command,
        timedOut: result.timedOut ?? false,
      };
    } catch (error: any) {
      // Handle execution errors (spawn failures, etc.)
      // For ENOENT errors (command not found), use exit code 127 (standard shell convention)
      // For other errors, use exitCode from error or default to 1
      const exitCode = error.code === 'ENOENT' ? 127 : error.exitCode || 1;

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || String(error),
        exitCode,
        command: error.command || `${command} ${args.join(' ')}`,
        timedOut: error.timedOut ?? false,
      };
    }
  }

  /**
   * Spawn process (doesn't wait for completion)
   */
  spawn(command: string, args: string[] = [], options: ExecOptions = {}): ChildProcess {
    const subprocess = execa(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout,
      shell: options.shell,
      stdin: options.input ? 'pipe' : 'inherit',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Write input if provided
    if (options.input && subprocess.stdin) {
      subprocess.stdin.write(options.input);
      subprocess.stdin.end();
    }

    return subprocess as unknown as ChildProcess;
  }

  /**
   * Execute command in shell
   */
  async executeShell(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    try {
      const result = await execaCommand(command, {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        shell: true,
        input: options.input,
        reject: false, // Don't throw on non-zero exit codes
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        command: result.command,
        timedOut: result.timedOut ?? false,
      };
    } catch (error: any) {
      // Handle execution errors (spawn failures, etc.)
      // For ENOENT errors (command not found), use exit code 127 (standard shell convention)
      // For other errors, use exitCode from error or default to 1
      const exitCode = error.code === 'ENOENT' ? 127 : error.exitCode || 1;

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || String(error),
        exitCode,
        command: error.command || command,
        timedOut: error.timedOut ?? false,
      };
    }
  }
}
