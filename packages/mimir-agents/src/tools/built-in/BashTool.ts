/**
 * BashTool - Execute bash commands
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Bash command execution tool
 */
export class BashTool extends BaseTool {
  constructor() {
    super({
      name: 'bash',
      description:
        'Execute bash commands. IMPORTANT: Use grep/glob tools for searching instead of grep/find in bash.',
      parameters: z.object({
        command: z.string().describe('Bash command to execute'),
        cwd: z.string().optional().describe('Working directory (default: current directory)'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 90,
      },
    });
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const {
      command,
      cwd,
      timeout = 30000,
    } = args as {
      command: string;
      cwd?: string;
      timeout?: number;
    };

    if (!context.executor) {
      return this.error('Executor not available in context');
    }

    try {
      const result = await context.executor.execute(command, { cwd, timeout });

      return this.success(
        {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        {
          command,
          exitCode: result.exitCode,
          success: result.exitCode === 0,
        }
      );
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to execute command', {
        command,
      });
    }
  }
}
