/**
 * ReadFileTool - Read file contents with context bomb protection
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';

const MAX_FILE_SIZE = 30000; // Max characters to read at once
const DEFAULT_LINES = 2000; // Default max lines when using offset/limit

/**
 * Read file tool with context bomb protection
 *
 * Follows Claude Code patterns:
 * - Default: reads up to 30,000 characters
 * - Supports offset/limit for reading specific line ranges
 * - Shows warnings when files are truncated
 * - Provides helpful messages for large files
 */
export class ReadFileTool extends BaseTool {
  constructor() {
    super({
      name: 'read_file',
      description: `Read file contents. For large files, use offset/limit to read specific line ranges.

IMPORTANT:
- Files >30k chars are automatically truncated
- Use grep tool to search large files instead of reading them fully
- Use offset/limit to read specific sections of large files`,
      parameters: z.object({
        path: z.string().describe('Path to the file to read'),
        offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
        limit: z.number().optional().describe('Maximum number of lines to read'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 50,
      },
    });
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { path, offset, limit } = args as {
      path: string;
      offset?: number;
      limit?: number;
    };

    if (!context.executor) {
      return this.error('Executor not available in context');
    }

    try {
      const contentStr = await context.executor.readFile(path);

      // If offset/limit specified, read specific line range
      if (offset !== undefined || limit !== undefined) {
        const lines = contentStr.split('\n');
        const startLine = Math.max(0, (offset || 1) - 1);
        const maxLines = limit || DEFAULT_LINES;
        const endLine = Math.min(lines.length, startLine + maxLines);

        const selectedLines = lines.slice(startLine, endLine);
        const result = selectedLines
          .map((line: string, idx: number) => `${startLine + idx + 1}→${line}`)
          .join('\n');

        return this.success(result, {
          path,
          totalLines: lines.length,
          startLine: startLine + 1,
          endLine,
          linesRead: selectedLines.length,
          truncated: endLine < lines.length,
        });
      }

      // Full file read - check size
      if (contentStr.length > MAX_FILE_SIZE) {
        const lines = contentStr.split('\n');
        const truncatedContent = contentStr.substring(0, MAX_FILE_SIZE);
        const truncatedLines = truncatedContent.split('\n').length;

        return this.success(
          truncatedContent + '\n\n[FILE TRUNCATED - Use offset/limit to read more]',
          {
            path,
            size: contentStr.length,
            totalLines: lines.length,
            truncated: true,
            linesRead: truncatedLines,
            message: `File is ${contentStr.length} chars (>${MAX_FILE_SIZE} limit). Use grep to search or offset/limit to read specific sections.`,
          }
        );
      }

      // Small file - return full content with line numbers
      // Handle empty files specially (no line numbers for empty content)
      if (contentStr.length === 0) {
        return this.success('', {
          path,
          size: 0,
          totalLines: 0,
        });
      }

      const lines = contentStr.split('\n');
      const numberedContent = lines
        .map((line: string, idx: number) => `${idx + 1}→${line}`)
        .join('\n');

      return this.success(numberedContent, {
        path,
        size: contentStr.length,
        totalLines: lines.length,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to read file', { path });
    }
  }
}
