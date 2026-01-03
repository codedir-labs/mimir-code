/**
 * GlobTool - Find files matching patterns
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';
import type { IFileSystem } from '../../memory/platform.js';

/**
 * Simple glob pattern matcher
 */
function matchGlob(pattern: string, path: string): boolean {
  // Convert glob pattern to regex
  // ** = match any number of directories
  // * = match anything except /
  // ? = match single character

  // First, replace glob wildcards with placeholders to protect them
  let regexPattern = pattern
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '§STAR§')
    .replace(/\?/g, '§QUESTION§');

  // Now escape all special regex characters
  regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Finally, convert placeholders to their regex equivalents
  regexPattern = regexPattern
    .replace(/§DOUBLESTAR§/g, '.*') // ** matches any path (including /)
    .replace(/§STAR§/g, '[^/]*') // * matches anything except /
    .replace(/§QUESTION§/g, '.'); // ? matches single character

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Glob tool - find files matching patterns
 */
export class GlobTool extends BaseTool {
  constructor(private fs: IFileSystem) {
    super({
      name: 'glob',
      description: 'Find files matching glob patterns (e.g., **/*.ts, src/**/*.{js,jsx})',
      parameters: z.object({
        pattern: z.string().describe('Glob pattern to match files'),
        cwd: z.string().optional().describe('Working directory (default: .)'),
        maxResults: z.number().optional().describe('Maximum number of results (default: 1000)'),
        ignorePatterns: z
          .array(z.string())
          .optional()
          .describe('Patterns to ignore (e.g., node_modules, .git)'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 70,
      },
    });
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const {
      pattern,
      cwd = '.',
      maxResults = 1000,
      ignorePatterns = ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
    } = args as {
      pattern: string;
      cwd?: string;
      maxResults?: number;
      ignorePatterns?: string[];
    };

    try {
      const matches: string[] = [];
      await this.findMatches(cwd, pattern, '', ignorePatterns, matches, maxResults);

      return this.success(matches, {
        pattern,
        matchCount: matches.length,
        truncated: matches.length >= maxResults,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to find files');
    }
  }

  private async findMatches(
    basePath: string,
    pattern: string,
    relativePath: string,
    ignorePatterns: string[],
    matches: string[],
    maxResults: number
  ): Promise<void> {
    if (matches.length >= maxResults) {
      return;
    }

    const currentPath = relativePath ? this.fs.join(basePath, relativePath) : basePath;

    try {
      // Check if path should be ignored
      const pathToCheck = relativePath || '.';
      for (const ignorePattern of ignorePatterns) {
        if (matchGlob(ignorePattern, pathToCheck)) {
          return;
        }
      }

      // Try to read as file first
      try {
        await this.fs.readFile(currentPath, 'utf-8');
        // It's a file - check if it matches
        if (matchGlob(pattern, pathToCheck)) {
          matches.push(pathToCheck);
        }
        return;
      } catch {
        // Not a file, continue
      }

      // Try to read as directory
      try {
        const entries = await this.fs.readdir(currentPath);
        for (const entry of entries) {
          if (matches.length >= maxResults) {
            break;
          }

          const entryRelativePath = relativePath ? `${relativePath}/${entry}` : entry;

          await this.findMatches(
            basePath,
            pattern,
            entryRelativePath,
            ignorePatterns,
            matches,
            maxResults
          );
        }
      } catch {
        // Not a directory either
      }
    } catch {
      // Skip inaccessible paths
    }
  }
}
