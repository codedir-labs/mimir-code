/**
 * ContextFileLoader - Load context files like MIMIR.md, AGENTS.md
 *
 * Similar to Claude Code's CLAUDE.md pattern but configurable.
 * Searches multiple locations and merges context files.
 */

import type { IFileSystem } from './platform.js';

/**
 * Context file configuration
 */
export interface ContextFileConfig {
  /**
   * Base filename to look for (e.g., 'MIMIR', 'AGENTS')
   * Will search for <name>.md and <name>.local.md
   */
  baseName?: string;

  /**
   * Additional search paths (beyond default)
   */
  additionalPaths?: string[];

  /**
   * Whether to load .local.md files (default: true)
   */
  loadLocal?: boolean;
}

/**
 * Loaded context file information
 */
export interface LoadedContext {
  /**
   * Merged content from all found context files
   */
  content: string;

  /**
   * List of files that were loaded
   */
  loadedFiles: string[];

  /**
   * Warnings encountered during loading
   */
  warnings: string[];
}

/**
 * Context file loader
 *
 * Search order:
 * 1. ~/.mimir/<BASE>.md
 * 2. ~/.mimir/<BASE>.local.md (if loadLocal)
 * 3. <PROJECT_ROOT>/<BASE>.md
 * 4. <PROJECT_ROOT>/<BASE>.local.md (if loadLocal)
 * 5. <PROJECT_ROOT>/.mimir/<BASE>.md
 * 6. <PROJECT_ROOT>/.mimir/<BASE>.local.md (if loadLocal)
 * 7. Additional paths from config
 */
export class ContextFileLoader {
  constructor(
    private fs: IFileSystem,
    private homeDir: string,
    private projectRoot: string
  ) {}

  /**
   * Load context files based on configuration
   */
  async loadContext(config: ContextFileConfig = {}): Promise<LoadedContext> {
    const baseName = config.baseName || 'MIMIR';
    const loadLocal = config.loadLocal !== false;
    const loadedFiles: string[] = [];
    const warnings: string[] = [];
    const contents: string[] = [];

    // Build search paths
    const searchPaths: string[] = [];

    // 1. Home directory
    searchPaths.push(this.fs.join(this.homeDir, '.mimir', `${baseName}.md`));
    if (loadLocal) {
      searchPaths.push(this.fs.join(this.homeDir, '.mimir', `${baseName}.local.md`));
    }

    // 2. Project root
    searchPaths.push(this.fs.join(this.projectRoot, `${baseName}.md`));
    if (loadLocal) {
      searchPaths.push(this.fs.join(this.projectRoot, `${baseName}.local.md`));
    }

    // 3. Project .mimir directory
    searchPaths.push(this.fs.join(this.projectRoot, '.mimir', `${baseName}.md`));
    if (loadLocal) {
      searchPaths.push(this.fs.join(this.projectRoot, '.mimir', `${baseName}.local.md`));
    }

    // 4. Additional paths
    if (config.additionalPaths) {
      searchPaths.push(...config.additionalPaths);
    }

    // Load all files
    for (const path of searchPaths) {
      try {
        const exists = await this.fs.exists(path);
        if (exists) {
          const content = await this.fs.readFile(path, 'utf-8');
          const contentStr = typeof content === 'string' ? content : content.toString();

          contents.push(contentStr);
          loadedFiles.push(path);
        }
      } catch (error) {
        warnings.push(
          `Failed to load ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Merge contents
    const mergedContent = this.mergeContextFiles(contents, loadedFiles);

    return {
      content: mergedContent,
      loadedFiles,
      warnings,
    };
  }

  /**
   * Merge multiple context files
   *
   * Later files override earlier files where there are conflicts.
   * Uses markdown comment markers to track sources.
   */
  private mergeContextFiles(contents: string[], sources: string[]): string {
    if (contents.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i]!;
      const source = sources[i]!;

      parts.push(`<!-- Source: ${source} -->`);
      parts.push(content);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Check if any context files exist
   */
  async hasContextFiles(config: ContextFileConfig = {}): Promise<boolean> {
    const baseName = config.baseName || 'MIMIR';
    const loadLocal = config.loadLocal !== false;

    const checkPaths = [
      this.fs.join(this.homeDir, '.mimir', `${baseName}.md`),
      this.fs.join(this.projectRoot, `${baseName}.md`),
      this.fs.join(this.projectRoot, '.mimir', `${baseName}.md`),
    ];

    if (loadLocal) {
      checkPaths.push(
        this.fs.join(this.homeDir, '.mimir', `${baseName}.local.md`),
        this.fs.join(this.projectRoot, `${baseName}.local.md`),
        this.fs.join(this.projectRoot, '.mimir', `${baseName}.local.md`)
      );
    }

    for (const path of checkPaths) {
      try {
        const exists = await this.fs.exists(path);
        if (exists) {
          return true;
        }
      } catch {
        // Ignore errors
      }
    }

    return false;
  }

  /**
   * Get expected file paths for documentation
   */
  getExpectedPaths(baseName = 'MIMIR'): string[] {
    return [
      this.fs.join(this.homeDir, '.mimir', `${baseName}.md`),
      this.fs.join(this.homeDir, '.mimir', `${baseName}.local.md`),
      this.fs.join(this.projectRoot, `${baseName}.md`),
      this.fs.join(this.projectRoot, `${baseName}.local.md`),
      this.fs.join(this.projectRoot, '.mimir', `${baseName}.md`),
      this.fs.join(this.projectRoot, '.mimir', `${baseName}.local.md`),
    ];
  }
}
