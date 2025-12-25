/**
 * Allowlist loader for team-shared command permissions
 * Loads from .mimir/allowlist.yml
 */

import { IFileSystem } from '../platform/IFileSystem.js';
import { logger } from '../utils/logger.js';
import yaml from 'yaml';
import path from 'path';
import { z } from 'zod';

/**
 * Allowlist schema
 */
export const AllowlistSchema = z.object({
  // Command patterns that are always allowed
  commands: z.array(z.string()).default([]),

  // File patterns that can be modified without confirmation
  files: z.array(z.string()).default([]),

  // Network destinations that are allowed
  urls: z.array(z.string()).default([]),

  // Environment variables that can be accessed
  envVars: z.array(z.string()).default([]),

  // Specific bash commands that are safe
  bashCommands: z.array(z.string()).default([]),
});

export type Allowlist = z.infer<typeof AllowlistSchema>;

export class AllowlistLoader {
  constructor(private fs: IFileSystem) {}

  /**
   * Load allowlist from project .mimir/allowlist.yml
   */
  async loadProjectAllowlist(projectRoot: string): Promise<Allowlist | null> {
    const allowlistPath = path.join(projectRoot, '.mimir', 'allowlist.yml');
    return await this.loadAllowlistFile(allowlistPath, 'project');
  }

  /**
   * Load allowlist from global ~/.mimir/allowlist.yml
   */
  async loadGlobalAllowlist(): Promise<Allowlist | null> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    const allowlistPath = path.join(homeDir, '.mimir', 'allowlist.yml');
    return await this.loadAllowlistFile(allowlistPath, 'global');
  }

  /**
   * Load and parse allowlist file
   */
  private async loadAllowlistFile(
    filePath: string,
    scope: 'global' | 'project'
  ): Promise<Allowlist | null> {
    try {
      if (!(await this.fs.exists(filePath))) {
        logger.debug(`No ${scope} allowlist found`, { path: filePath });
        return null;
      }

      const content = await this.fs.readFile(filePath);
      const parsed = yaml.parse(content) as unknown;

      // Validate schema
      const allowlist = AllowlistSchema.parse(parsed);

      logger.info(`Loaded ${scope} allowlist`, {
        path: filePath,
        commands: allowlist.commands.length,
        files: allowlist.files.length,
        urls: allowlist.urls.length,
      });

      return allowlist;
    } catch (error) {
      logger.error(`Failed to load ${scope} allowlist`, {
        path: filePath,
        error,
      });
      return null;
    }
  }

  /**
   * Merge multiple allowlists (global + project)
   * Project allowlist takes precedence
   */
  merge(global: Allowlist | null, project: Allowlist | null): Allowlist {
    const merged: Allowlist = {
      commands: [],
      files: [],
      urls: [],
      envVars: [],
      bashCommands: [],
    };

    // Merge global
    if (global) {
      merged.commands.push(...global.commands);
      merged.files.push(...global.files);
      merged.urls.push(...global.urls);
      merged.envVars.push(...global.envVars);
      merged.bashCommands.push(...global.bashCommands);
    }

    // Merge project (deduplicates)
    if (project) {
      // Use Set to deduplicate
      merged.commands = [...new Set([...merged.commands, ...project.commands])];
      merged.files = [...new Set([...merged.files, ...project.files])];
      merged.urls = [...new Set([...merged.urls, ...project.urls])];
      merged.envVars = [...new Set([...merged.envVars, ...project.envVars])];
      merged.bashCommands = [...new Set([...merged.bashCommands, ...project.bashCommands])];
    }

    return merged;
  }

  /**
   * Create example allowlist file
   */
  async createExample(filePath: string, scope: 'global' | 'project'): Promise<void> {
    const exampleContent = scope === 'global' ? this.getGlobalExample() : this.getProjectExample();

    try {
      const dir = path.dirname(filePath);
      if (!(await this.fs.exists(dir))) {
        await this.fs.mkdir(dir, { recursive: true });
      }

      await this.fs.writeFile(filePath, exampleContent);
      logger.info(`Created example ${scope} allowlist`, { path: filePath });
    } catch (error) {
      logger.error(`Failed to create example allowlist`, {
        path: filePath,
        error,
      });
      throw error;
    }
  }

  /**
   * Get example global allowlist
   */
  private getGlobalExample(): string {
    return `# Global Allowlist
# Commands, files, and operations that are safe across all projects

# Commands that don't require permission prompt
commands:
  - '/status'      # Git status
  - '/diff'        # Git diff
  - '/help'        # Show help
  - '/version'     # Show version
  - '/doctor'      # System diagnostics

# Safe bash commands
bashCommands:
  - 'git status'
  - 'git diff'
  - 'git log'
  - 'ls'
  - 'pwd'
  - 'echo *'
  - 'cat *.md'

# Files that can be modified without confirmation (use globs)
files:
  - '**/*.md'      # Documentation files
  - '**/*.txt'     # Text files
  - '**/README.*'  # README files

# URLs that can be accessed without confirmation
urls:
  - 'https://api.github.com/**'
  - 'https://registry.npmjs.org/**'

# Environment variables that can be read
envVars:
  - 'NODE_ENV'
  - 'PATH'
  - 'USER'
  - 'HOME'
`;
  }

  /**
   * Get example project allowlist
   */
  private getProjectExample(): string {
    return `# Project Allowlist
# Team-shared permissions for this project
# Commit this file to version control for consistent team experience

# Custom slash commands that are safe to run
commands:
  - '/test'           # Run test suite
  - '/lint'           # Run linter
  - '/build'          # Build project
  - '/test-coverage'  # Run tests with coverage

# Safe bash commands specific to this project
bashCommands:
  - 'yarn test'
  - 'yarn lint'
  - 'yarn build'
  - 'npm run test'
  - 'npm run lint'

# Files that can be auto-formatted or modified
files:
  - 'src/**/*.ts'     # TypeScript source files
  - 'src/**/*.tsx'    # React TypeScript files
  - 'tests/**/*.ts'   # Test files
  - '*.json'          # JSON config files
  - '.prettierrc.*'   # Prettier config
  - '.eslintrc.*'     # ESLint config

# API endpoints used by this project
urls:
  - 'https://api.example.com/**'
  - 'https://staging.example.com/**'

# Environment variables specific to this project
envVars:
  - 'API_KEY'
  - 'DATABASE_URL'
  - 'REDIS_URL'
`;
  }
}
