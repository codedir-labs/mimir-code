/**
 * WriteFileTool - Write content to a file
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Write file tool
 */
export class WriteFileTool extends BaseTool {
  constructor() {
    super({
      name: 'write_file',
      description: 'Write content to a file',
      parameters: z.object({
        path: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 60,
      },
    });
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { path, content } = args as {
      path: string;
      content: string;
    };

    if (!context.executor) {
      return this.error('Executor not available in context');
    }

    try {
      await context.executor.writeFile(path, content);
      return this.success(
        { path, bytesWritten: content.length },
        {
          path,
          size: content.length,
        }
      );
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to write file', { path });
    }
  }
}
