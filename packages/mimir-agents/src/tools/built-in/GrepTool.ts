/**
 * GrepTool - Search for patterns in files
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';
import type { IFileSystem } from '../../memory/platform.js';

interface GrepMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  match: string;
}

/**
 * Grep tool - search files for patterns
 */
export class GrepTool extends BaseTool {
  constructor(private fs: IFileSystem) {
    super({
      name: 'grep',
      description:
        'Search for patterns in files using regex. Use this instead of grep in bash commands.',
      parameters: z.object({
        pattern: z.string().describe('Regular expression pattern to search for'),
        paths: z.array(z.string()).optional().describe('Paths to search (files or directories)'),
        recursive: z
          .boolean()
          .optional()
          .describe('Search directories recursively (default: false)'),
        ignoreCase: z.boolean().optional().describe('Case-insensitive search (default: false)'),
        invertMatch: z
          .boolean()
          .optional()
          .describe('Invert match - show non-matching lines (default: false)'),
        maxResults: z
          .number()
          .optional()
          .describe('Maximum number of results to return (default: 100)'),
        contextLines: z
          .number()
          .optional()
          .describe('Number of context lines before/after match (default: 0)'),
        headLimit: z
          .number()
          .optional()
          .describe('Limit output lines to first N (like head -N, default: unlimited)'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 100,
      },
    });
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const {
      pattern,
      paths = ['.'],
      recursive = false,
      ignoreCase = false,
      invertMatch = false,
      maxResults = 100,
      contextLines = 0,
      headLimit,
    } = args as {
      pattern: string;
      paths?: string[];
      recursive?: boolean;
      ignoreCase?: boolean;
      invertMatch?: boolean;
      maxResults?: number;
      contextLines?: number;
      headLimit?: number;
    };

    try {
      const flags = ignoreCase ? 'gi' : 'g';
      const regex = new RegExp(pattern, flags);
      const matches: GrepMatch[] = [];

      for (const path of paths) {
        await this.searchPath(
          path,
          regex,
          invertMatch,
          recursive,
          matches,
          maxResults,
          contextLines
        );
        if (matches.length >= maxResults) {
          break;
        }
      }

      const output = this.formatMatches(matches, contextLines, headLimit);

      // Calculate actual match count after head limit
      const actualMatchCount =
        headLimit !== undefined ? Math.min(headLimit, matches.length) : matches.length;

      // Determine if truncated by maxResults OR headLimit
      const wasTruncated =
        matches.length >= maxResults || (headLimit !== undefined && matches.length > headLimit);

      return this.success(output, {
        matchCount: actualMatchCount,
        truncated: wasTruncated || undefined,
        pattern,
        paths,
        headLimitApplied: headLimit !== undefined,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to search files');
    }
  }

  private async searchPath(
    path: string,
    regex: RegExp,
    invertMatch: boolean,
    recursive: boolean,
    matches: GrepMatch[],
    maxResults: number,
    contextLines: number
  ): Promise<void> {
    try {
      const stats = await this.fs.exists(path);
      if (!stats) {
        return;
      }

      // Check if it's a file by trying to read it
      try {
        const content = await this.fs.readFile(path, 'utf-8');
        const contentStr = typeof content === 'string' ? content : content.toString();
        this.searchFile(path, contentStr, regex, invertMatch, matches, maxResults, contextLines);
      } catch (fileError) {
        // Might be a directory, try to read dir
        if (recursive) {
          try {
            const files = await this.fs.readdir(path);
            for (const file of files) {
              if (matches.length >= maxResults) {
                break;
              }
              const filePath = this.fs.join(path, file);
              await this.searchPath(
                filePath,
                regex,
                invertMatch,
                recursive,
                matches,
                maxResults,
                contextLines
              );
            }
          } catch {
            // Not a directory either, skip
          }
        }
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  private searchFile(
    path: string,
    content: string,
    regex: RegExp,
    invertMatch: boolean,
    matches: GrepMatch[],
    maxResults: number,
    _contextLines: number
  ): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxResults) {
        break;
      }

      const line = lines[i]!;
      const hasMatch = regex.test(line);

      if ((hasMatch && !invertMatch) || (!hasMatch && invertMatch)) {
        // Find the match position
        const match = regex.exec(line);
        const matchText = match ? match[0] : '';
        const column = match ? match.index : 0;

        matches.push({
          file: path,
          line: i + 1,
          column,
          text: line,
          match: matchText,
        });
      }
    }
  }

  private formatMatches(matches: GrepMatch[], _contextLines: number, headLimit?: number): string {
    if (matches.length === 0 || headLimit === 0) {
      return '(no matches found)';
    }

    const lines: string[] = [];
    const limit = headLimit !== undefined ? Math.min(headLimit, matches.length) : matches.length;

    for (let i = 0; i < limit; i++) {
      const match = matches[i]!;
      lines.push(`${match.file}:${match.line}:${match.column}: ${match.text}`);
    }

    if (headLimit !== undefined && headLimit > 0 && matches.length > headLimit) {
      lines.push(
        `\n[Output limited to ${headLimit} lines. ${matches.length - headLimit} more matches omitted]`
      );
    }

    return lines.join('\n');
  }
}
