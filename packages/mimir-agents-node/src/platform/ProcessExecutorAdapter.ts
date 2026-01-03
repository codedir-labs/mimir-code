/**
 * ProcessExecutorAdapter - Cross-platform process execution implementation
 * Uses execa for reliable cross-platform command execution
 */

import type {
  IProcessExecutor,
  ProcessExecuteOptions,
  ProcessExecuteResult,
} from '@codedir/mimir-agents';
import { execaCommand } from 'execa';

export class ProcessExecutorAdapter implements IProcessExecutor {
  /**
   * Execute command and wait for completion
   */
  async execute(
    command: string,
    options: ProcessExecuteOptions = {}
  ): Promise<ProcessExecuteResult> {
    try {
      const result = await execaCommand(command, {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        shell: options.shell || true,
        reject: false,
      });

      return {
        exitCode: result.exitCode ?? (result.failed ? 1 : 0),
        stdout: result.stdout,
        stderr: result.stderr,
        signal: result.signal,
      };
    } catch (error: any) {
      const exitCode = error.code === 'ENOENT' ? 127 : error.exitCode || 1;

      return {
        exitCode,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || String(error),
        signal: error.signal,
      };
    }
  }
}
