/**
 * Process executor interface (platform abstraction)
 * Handles command execution across different platforms
 */

/**
 * Process execution options
 */
export interface ProcessExecuteOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean | string;
}

/**
 * Process execution result
 */
export interface ProcessExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string;
}

/**
 * Process executor interface
 */
export interface IProcessExecutor {
  /**
   * Execute command
   */
  execute(command: string, options?: ProcessExecuteOptions): Promise<ProcessExecuteResult>;
}
