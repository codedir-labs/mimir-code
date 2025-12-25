/**
 * Platform-agnostic process execution interface
 * Implementation will use execa
 */

import { ChildProcess } from 'child_process';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean;
  input?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  timedOut: boolean;
}

export interface IProcessExecutor {
  /**
   * Execute command and wait for completion
   */
  execute(command: string, args?: string[], options?: ExecOptions): Promise<ExecResult>;

  /**
   * Spawn process (doesn't wait for completion)
   */
  spawn(command: string, args?: string[], options?: ExecOptions): ChildProcess;

  /**
   * Execute command in shell
   */
  executeShell(command: string, options?: ExecOptions): Promise<ExecResult>;
}
