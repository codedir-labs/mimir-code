/**
 * DiffTool - Show differences between file versions or strings
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';
import type { IFileSystem } from '../../memory/platform.js';

/**
 * Generate unified diff between two strings
 */
function generateUnifiedDiff(
  oldText: string,
  newText: string,
  oldPath: string = 'a/file',
  newPath: string = 'b/file'
): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple line-by-line diff
  const result: string[] = [];
  result.push(`--- ${oldPath}`);
  result.push(`+++ ${newPath}`);

  let i = 0;
  let j = 0;
  const chunks: Array<{
    type: 'same' | 'changed';
    oldStart: number;
    newStart: number;
    lines: string[];
  }> = [];
  let currentChunk: (typeof chunks)[0] | null = null;

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];

    if (oldLine === newLine) {
      if (currentChunk?.type !== 'same') {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = { type: 'same', oldStart: i, newStart: j, lines: [] };
      }
      currentChunk!.lines.push(` ${oldLine || ''}`);
      i++;
      j++;
    } else {
      if (currentChunk?.type !== 'changed') {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = { type: 'changed', oldStart: i, newStart: j, lines: [] };
      }

      // Add removed lines
      if (i < oldLines.length && oldLine !== undefined) {
        currentChunk!.lines.push(`-${oldLine}`);
        i++;
      }

      // Add added lines
      if (j < newLines.length && newLine !== undefined) {
        currentChunk!.lines.push(`+${newLine}`);
        j++;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Format chunks with context
  for (const chunk of chunks) {
    if (chunk.type === 'changed') {
      const oldCount = chunk.lines.filter((l) => l.startsWith('-')).length;
      const newCount = chunk.lines.filter((l) => l.startsWith('+')).length;
      result.push(`@@ -${chunk.oldStart + 1},${oldCount} +${chunk.newStart + 1},${newCount} @@`);
      result.push(...chunk.lines);
    }
  }

  return result.join('\n');
}

/**
 * Diff tool
 */
export class DiffTool extends BaseTool {
  constructor(private fs: IFileSystem) {
    super({
      name: 'diff',
      description: 'Show differences between two files or strings',
      parameters: z.object({
        oldPath: z
          .string()
          .optional()
          .describe('Path to old file (optional if oldContent provided)'),
        newPath: z
          .string()
          .optional()
          .describe('Path to new file (optional if newContent provided)'),
        oldContent: z
          .string()
          .optional()
          .describe('Old content as string (optional if oldPath provided)'),
        newContent: z
          .string()
          .optional()
          .describe('New content as string (optional if newPath provided)'),
        unified: z.boolean().optional().describe('Use unified diff format (default: true)'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 80,
      },
    });
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const {
      oldPath,
      newPath,
      oldContent,
      newContent,
      unified = true,
    } = args as {
      oldPath?: string;
      newPath?: string;
      oldContent?: string;
      newContent?: string;
      unified?: boolean;
    };

    try {
      // Get old content
      let oldText: string;
      if (oldContent !== undefined) {
        oldText = oldContent;
      } else if (oldPath) {
        const content = await this.fs.readFile(oldPath, 'utf-8');
        oldText = typeof content === 'string' ? content : content.toString();
      } else {
        return this.error('Either oldPath or oldContent must be provided');
      }

      // Get new content
      let newText: string;
      if (newContent !== undefined) {
        newText = newContent;
      } else if (newPath) {
        const content = await this.fs.readFile(newPath, 'utf-8');
        newText = typeof content === 'string' ? content : content.toString();
      } else {
        return this.error('Either newPath or newContent must be provided');
      }

      const diff = unified
        ? generateUnifiedDiff(oldText, newText, oldPath || 'a/content', newPath || 'b/content')
        : this.simpleDiff(oldText, newText);

      return this.success(diff, {
        oldPath: oldPath || '(content)',
        newPath: newPath || '(content)',
        hasChanges: oldText !== newText,
        linesAdded: (diff.match(/^\+[^+]/gm) || []).length,
        linesRemoved: (diff.match(/^-[^-]/gm) || []).length,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to generate diff');
    }
  }

  private simpleDiff(oldText: string, newText: string): string {
    if (oldText === newText) {
      return '(no changes)';
    }

    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: string[] = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          result.push(`- ${oldLine}`);
        }
        if (newLine !== undefined) {
          result.push(`+ ${newLine}`);
        }
      }
    }

    return result.join('\n');
  }
}
