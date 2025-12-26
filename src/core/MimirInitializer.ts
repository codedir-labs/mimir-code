/**
 * Centralized initialization service for Mimir
 * Handles workspace setup, database creation, and configuration
 */

import { IFileSystem } from '../platform/IFileSystem.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { getDatabaseManagerAsync, closeDatabaseManager } from '../storage/Database.js';
import { logger } from '../utils/logger.js';
import path, { dirname } from 'path';

export interface InitializationResult {
  success: boolean;
  created: string[];
  errors: string[];
  dbInitialized: boolean;
  configCreated: boolean;
}

export class MimirInitializer {
  constructor(
    private fs: IFileSystem,
    private configLoader: ConfigLoader
  ) {}

  /**
   * Initialize workspace with full Mimir setup
   * Creates directories, database, config, and gitignore
   */
  async initializeWorkspace(workspaceRoot: string): Promise<InitializationResult> {
    const result: InitializationResult = {
      success: true,
      created: [],
      errors: [],
      dbInitialized: false,
      configCreated: false,
    };

    try {
      const mimirDir = path.join(workspaceRoot, '.mimir');

      // 1. Create .mimir directory
      if (!(await this.fs.exists(mimirDir))) {
        await this.fs.mkdir(mimirDir, { recursive: true });
        result.created.push('.mimir/');
        logger.info('Created .mimir directory', { path: mimirDir });
      }

      // 2. Create subdirectories
      const subdirs = [
        { name: 'logs', purpose: 'Application logs' },
        { name: 'commands', purpose: 'Custom slash commands' },
        { name: 'checkpoints', purpose: 'Undo/restore checkpoints' },
        { name: 'themes', purpose: 'UI theme definitions' },
      ];

      for (const { name, purpose } of subdirs) {
        const subdir = path.join(mimirDir, name);
        if (!(await this.fs.exists(subdir))) {
          await this.fs.mkdir(subdir, { recursive: true });
          result.created.push(`.mimir/${name}/`);
          logger.info(`Created ${name} directory`, { path: subdir, purpose });
        }
      }

      // 3. Create .gitignore for .mimir directory
      await this.createMimirGitignore(mimirDir, result);

      // 4. Copy default themes
      await this.copyDefaultThemes(mimirDir, result);

      // 5. Copy example commands
      await this.copyExampleCommands(mimirDir, result);

      // 6. Initialize SQLite database
      await this.initializeDatabase(mimirDir, result);

      // 7. Create config.yml if it doesn't exist
      await this.createConfigIfNeeded(mimirDir, result);

      // 8. Create README in .mimir folder
      await this.createReadme(mimirDir, result);
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error('Workspace initialization failed', { error });
    }

    return result;
  }

  /**
   * Check if workspace is initialized
   */
  async isWorkspaceInitialized(workspaceRoot: string): Promise<boolean> {
    const mimirDir = path.join(workspaceRoot, '.mimir');
    const dbPath = path.join(mimirDir, 'mimir.db');

    // Check if both .mimir directory and database exist
    return (await this.fs.exists(mimirDir)) && (await this.fs.exists(dbPath));
  }

  /**
   * Create .gitignore inside .mimir directory
   */
  private async createMimirGitignore(
    mimirDir: string,
    result: InitializationResult
  ): Promise<void> {
    const gitignorePath = path.join(mimirDir, '.gitignore');

    if (await this.fs.exists(gitignorePath)) {
      return; // Already exists
    }

    const gitignoreContent = `# Mimir workspace-specific ignores
# Ignore sensitive data and logs

# Databases and backups
*.db
*.db-shm
*.db-wal
*.db.backup

# Logs
logs/
*.log

# Checkpoints (may contain code snapshots)
checkpoints/

# Temporary files
*.tmp
*.temp

# Keep config.yml tracked (share with team)
!config.yml
!config.example.yml

# Keep custom commands tracked
!commands/
`;

    try {
      await this.fs.writeFile(gitignorePath, gitignoreContent);
      result.created.push('.mimir/.gitignore');
      logger.info('Created .mimir/.gitignore');
    } catch (error) {
      result.errors.push(
        `Failed to create .gitignore: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Copy default theme files to .mimir/themes/ directory
   */
  private async copyDefaultThemes(mimirDir: string, result: InitializationResult): Promise<void> {
    const themesDir = path.join(mimirDir, 'themes');

    // Default themes to copy
    const defaultThemes = [
      'mimir.json',
      'dark.json',
      'light.json',
      'dark-colorblind.json',
      'light-colorblind.json',
    ];

    try {
      // Get the source themes directory (from installed package)
      // For Bun compiled binaries: use process.argv[0] to get binary location
      // Resources are in: ~/.local/bin/resources/themes/
      const executablePath = process.argv[0] || process.execPath;
      const binaryDir = dirname(executablePath);

      // Try multiple locations for theme files
      const possibleSourceDirs = [
        path.join(binaryDir, 'resources', 'themes'), // Compiled binary: ~/.local/bin/resources/themes/
        path.join(binaryDir, '../cli/themes'), // Development: dist/core/../cli/themes
        path.join(binaryDir, '../../src/cli/themes'), // Development: dist/core/../../src/cli/themes
      ];

      for (const themeFile of defaultThemes) {
        const destPath = path.join(themesDir, themeFile);

        // Skip if theme already exists (idempotency)
        if (await this.fs.exists(destPath)) {
          continue;
        }

        // Try each possible source directory
        let copied = false;
        for (const sourceDir of possibleSourceDirs) {
          try {
            const sourcePath = path.join(sourceDir, themeFile);
            const themeContent = await this.fs.readFile(sourcePath, 'utf-8');

            // Write to workspace themes directory
            await this.fs.writeFile(destPath, themeContent);
            result.created.push(`.mimir/themes/${themeFile}`);
            logger.info('Copied default theme', { theme: themeFile, from: sourceDir });
            copied = true;
            break;
          } catch (error) {
            // Try next location
            continue;
          }
        }

        if (!copied) {
          logger.warn(`Failed to copy theme ${themeFile}, will use built-in fallback`, {
            triedLocations: possibleSourceDirs,
          });
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to copy default themes: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error('Failed to copy themes', { error });
    }
  }

  /**
   * Copy example command files to .mimir/commands/ directory
   */
  private async copyExampleCommands(mimirDir: string, result: InitializationResult): Promise<void> {
    const commandsDir = path.join(mimirDir, 'commands');

    // Example command to copy
    const exampleCommands = ['update-docs.yml'];

    try {
      // Get the source commands directory (from installed package)
      // For Bun compiled binaries: use process.argv[0] to get binary location
      // Resources are in: ~/.local/bin/resources/commands/
      const executablePath = process.argv[0] || process.execPath;
      const binaryDir = dirname(executablePath);

      // Try multiple locations for command files
      const possibleSourceDirs = [
        path.join(binaryDir, 'resources', 'commands'), // Compiled binary: ~/.local/bin/resources/commands/
        path.join(binaryDir, '../../scripts/templates/commands'), // Development: dist/core/../../scripts/templates/commands
        path.join(binaryDir, '../../../scripts/templates/commands'), // Alternative dev path
      ];

      for (const commandFile of exampleCommands) {
        const destPath = path.join(commandsDir, commandFile);

        // Skip if command already exists (idempotency)
        if (await this.fs.exists(destPath)) {
          continue;
        }

        // Try each possible source directory
        let copied = false;
        for (const sourceDir of possibleSourceDirs) {
          try {
            const sourcePath = path.join(sourceDir, commandFile);
            const commandContent = await this.fs.readFile(sourcePath, 'utf-8');

            // Write to workspace commands directory
            await this.fs.writeFile(destPath, commandContent);
            result.created.push(`.mimir/commands/${commandFile}`);
            logger.info('Copied example command', { command: commandFile, from: sourceDir });
            copied = true;
            break;
          } catch (error) {
            // Try next location
            continue;
          }
        }

        if (!copied) {
          logger.warn(`Failed to copy command ${commandFile}, continuing`, {
            triedLocations: possibleSourceDirs,
          });
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to copy example commands: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error('Failed to copy commands', { error });
    }
  }

  /**
   * Initialize SQLite database with Drizzle ORM
   */
  private async initializeDatabase(mimirDir: string, result: InitializationResult): Promise<void> {
    const dbPath = path.join(mimirDir, 'mimir.db');

    // Check if database already exists (idempotency)
    if (await this.fs.exists(dbPath)) {
      logger.info('Database already exists, skipping initialization', { path: dbPath });
      return;
    }

    try {
      // DatabaseManager auto-creates tables and seeds pricing
      // Use async factory with IFileSystem abstraction
      const db = await getDatabaseManagerAsync({
        path: dbPath,
        verbose: false,
        fileSystem: this.fs,
      });

      // Perform a write operation to ensure database file is created
      // better-sqlite3 may delay file creation until first write
      db.execute('SELECT 1');

      // Close database connection and clear singleton (flushes to disk)
      closeDatabaseManager();

      // Now verify database was created (after close flushes it)
      if (await this.fs.exists(dbPath)) {
        result.created.push('.mimir/mimir.db');
        result.dbInitialized = true;
        logger.info('Database initialized', { path: dbPath });
      } else {
        result.errors.push('Database file was not created on disk');
      }
    } catch (error) {
      result.errors.push(
        `Database initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error('Failed to initialize database', { error });
    }
  }

  /**
   * Format array for YAML - creates inline array syntax [item1, item2]
   */
  private formatYamlArray(arr: string[]): string {
    if (!arr || arr.length === 0) return '[]';
    if (arr.length === 1) {
      // Quote special YAML characters: ?, *, &, !, |, >, @, `
      const val = arr[0];
      if (!val) return '[]';
      if (/^[?*&!|>@`]/.test(val) || val === '?' || val === '*') {
        return `"${val}"`;
      }
      return val;
    }
    // For arrays, quote each item if needed
    const quoted = arr.map((item) => {
      if (/^[?*&!|>@`]/.test(item) || item === '?' || item === '*') {
        return `"${item}"`;
      }
      return item;
    });
    return `[${quoted.join(', ')}]`;
  }

  /**
   * Create config.yml if it doesn't exist
   */
  private async createConfigIfNeeded(
    mimirDir: string,
    result: InitializationResult
  ): Promise<void> {
    const configPath = path.join(mimirDir, 'config.yml');

    if (await this.fs.exists(configPath)) {
      return; // Config already exists
    }

    try {
      // Get default config from ConfigLoader (platform-specific)
      const { config: defaults } = await this.configLoader.load();

      // Create user-friendly config with comments
      const configContent = `# Mimir Configuration
# This file can be committed to version control for team sharing
# Store API keys in .env or environment variables instead

# LLM Provider Configuration
llm:
  provider: ${defaults.llm.provider}  # deepseek | anthropic | openai | google | gemini | qwen | ollama
  model: ${defaults.llm.model}
  # apiKey: \${DEEPSEEK_API_KEY}  # Use environment variable (recommended)
  # baseURL: https://api.deepseek.com  # Optional: override API endpoint
  temperature: ${defaults.llm.temperature}
  maxTokens: ${defaults.llm.maxTokens}

# Permission System
permissions:
  autoAccept: ${defaults.permissions.autoAccept}  # DANGEROUS: Auto-approve all commands
  acceptRiskLevel: ${defaults.permissions.acceptRiskLevel}  # low | medium | high | critical
  alwaysAcceptCommands: ${this.formatYamlArray(defaults.permissions.alwaysAcceptCommands)}

# Keyboard Shortcuts (supports both single string and array)
# Examples:
#   accept: Enter                    (single shortcut)
#   interrupt: [Ctrl+C, Escape]      (multiple shortcuts)
#
# Note: On Windows, Ctrl+Space is intercepted by the terminal and won't work.
#       Tab is the recommended shortcut for autocomplete on all platforms.
keyBindings:
  interrupt: ${this.formatYamlArray(defaults.keyBindings.interrupt)}
  accept: ${this.formatYamlArray(defaults.keyBindings.accept)}
  modeSwitch: ${this.formatYamlArray(defaults.keyBindings.modeSwitch)}
  editCommand: ${this.formatYamlArray(defaults.keyBindings.editCommand)}
  showTooltip: ${this.formatYamlArray(defaults.keyBindings.showTooltip)}  # Tab recommended (Ctrl+Space doesn't work on Windows)
  navigateUp: ${this.formatYamlArray(defaults.keyBindings.navigateUp)}
  navigateDown: ${this.formatYamlArray(defaults.keyBindings.navigateDown)}
  help: ${this.formatYamlArray(defaults.keyBindings.help)}
  clearScreen: ${this.formatYamlArray(defaults.keyBindings.clearScreen)}
  undo: ${this.formatYamlArray(defaults.keyBindings.undo)}
  redo: ${this.formatYamlArray(defaults.keyBindings.redo)}

# Docker Sandbox (for running untrusted code)
docker:
  enabled: ${defaults.docker.enabled}
  baseImage: ${defaults.docker.baseImage}

# User Interface
ui:
  theme: ${defaults.ui.theme}  # mimir | dark | light | dark-colorblind | light-colorblind
  syntaxHighlighting: ${defaults.ui.syntaxHighlighting}
  showLineNumbers: ${defaults.ui.showLineNumbers}
  compactMode: ${defaults.ui.compactMode}
  autocompleteAutoShow: ${defaults.ui.autocompleteAutoShow}  # Auto-show autocomplete when suggestions available
  autocompleteExecuteOnSelect: ${defaults.ui.autocompleteExecuteOnSelect}  # Execute command if no more params needed

# Monitoring & Metrics
monitoring:
  metricsRetentionDays: ${defaults.monitoring.metricsRetentionDays}  # Keep metrics for N days
  enableHealthChecks: ${defaults.monitoring.enableHealthChecks}
  healthCheckIntervalSeconds: ${defaults.monitoring.healthCheckIntervalSeconds}
  slowOperationThresholdMs: ${defaults.monitoring.slowOperationThresholdMs}
  batchWriteIntervalSeconds: ${defaults.monitoring.batchWriteIntervalSeconds}

# Budget Limits (prevents runaway costs)
budget:
  enabled: ${defaults.budget.enabled}
  # dailyLimit: 10.00  # USD per day (optional)
  # weeklyLimit: 50.00  # USD per week (optional)
  # monthlyLimit: 100.00  # USD per month (optional)
  warningThreshold: ${defaults.budget.warningThreshold}  # Warn at 80% of limit

# Rate Limiting (prevents excessive operations)
rateLimit:
  enabled: ${defaults.rateLimit.enabled}
  commandsPerMinute: ${defaults.rateLimit.commandsPerMinute}
  toolExecutionsPerMinute: ${defaults.rateLimit.toolExecutionsPerMinute}
  llmCallsPerMinute: ${defaults.rateLimit.llmCallsPerMinute}
  maxFileSizeMB: ${defaults.rateLimit.maxFileSizeMB}
`;

      await this.fs.writeFile(configPath, configContent);
      result.created.push('.mimir/config.yml');
      result.configCreated = true;
      logger.info('Created config.yml', { path: configPath });
    } catch (error) {
      result.errors.push(
        `Failed to create config.yml: ${error instanceof Error ? error.message : String(error)}`
      );
      logger.error('Failed to create config', { error });
    }
  }

  /**
   * Create README in .mimir directory
   */
  private async createReadme(mimirDir: string, result: InitializationResult): Promise<void> {
    const readmePath = path.join(mimirDir, 'README.md');

    if (await this.fs.exists(readmePath)) {
      return; // README already exists
    }

    const readmeContent = `# Mimir Workspace

This directory contains Mimir's workspace-specific data and configuration.

## Directory Structure

\`\`\`
.mimir/
├── config.yml          # Workspace configuration (tracked in git)
├── mimir.db            # Conversation history and metrics (ignored)
├── logs/               # Application logs (ignored)
├── commands/           # Custom slash commands (tracked)
├── themes/             # UI theme definitions (tracked)
├── checkpoints/        # Undo/restore checkpoints (ignored)
├── .gitignore          # Ignores sensitive data
└── README.md           # This file
\`\`\`

## Files You Should Track in Git

✅ **config.yml** - Team configuration (shared settings, allowlists)
✅ **commands/** - Custom slash commands for your team
✅ **themes/** - Custom UI themes for your team
❌ **mimir.db** - Local conversation history (private)
❌ **logs/** - Application logs (private)
❌ **checkpoints/** - Code snapshots (private)

## Configuration

Edit \`config.yml\` to customize Mimir's behavior for this workspace:
- LLM provider and model settings
- Permission system (command allowlists)
- Rate limiting and budget controls
- UI preferences (including themes)

**API Keys:** Store in \`.env\` file in project root, not in config.yml!

## Database

\`mimir.db\` is a SQLite database containing:
- Conversation history
- Message tokens and costs
- Tool execution records
- Performance metrics
- Permission audit trail

Use \`mimir history\` commands to manage conversations.

## Custom Commands

Custom slash commands extend Mimir's capabilities with team-specific workflows.

### Example Commands Provided

Six example commands are pre-installed in \`commands/\`:
- **\`/security\`** - Analyze git diffs for security vulnerabilities
- **\`/refactor\`** - Suggest code refactoring improvements
- **\`/test\`** - Generate comprehensive test cases
- **\`/docs\`** - Generate or improve documentation
- **\`/review\`** - Perform comprehensive code review
- **\`/perf\`** - Analyze performance issues and optimizations

### Creating Custom Commands

Commands are defined in YAML files in \`commands/\` directory:

\`\`\`yaml
# .mimir/commands/deploy.yml
name: deploy
description: Deploy application to specified environment
usage: /deploy [environment]
aliases: [d]
prompt: |
  Deploy the application to $1 environment.

  Steps:
  1. Run tests to ensure code quality
  2. Build production bundle
  3. Deploy to $1 environment
  4. Run smoke tests
  5. Monitor for errors

  Environment: $1 (or production if not specified)
\`\`\`

**Placeholders:**
- \`$1\`, \`$2\`, \`$3\` - Individual arguments
- \`$ARGUMENTS\` - All arguments joined together

**Usage:**
\`\`\`bash
/deploy staging          # Deploys to staging
/security src/auth.ts    # Security analysis of auth file
/test src/utils.ts       # Generate tests for utils
\`\`\`

### Command Customization

Modify the example commands to match your workflow:
- Add team-specific context to prompts
- Customize analysis criteria
- Add project-specific checks
- Create domain-specific commands (e.g., \`/api-design\`, \`/schema-migration\`)

Commands in this directory are tracked in git and shared with your team.

## Custom Themes

Customize Mimir's appearance by creating theme files in \`themes/\` directory:
\`\`\`bash
.mimir/themes/mimir.json        # Default theme (provided)
.mimir/themes/dark.json          # Dark theme (provided)
.mimir/themes/company-theme.json # Your custom theme
\`\`\`

Select theme in \`config.yml\`:
\`\`\`yaml
ui:
  theme: company-theme  # Loads from themes/company-theme.json
\`\`\`

See the theme documentation for creating custom themes.

---

**Generated by Mimir v0.1.0**
`;

    try {
      await this.fs.writeFile(readmePath, readmeContent);
      result.created.push('.mimir/README.md');
      logger.info('Created README.md');
    } catch (error) {
      result.errors.push(
        `Failed to create README: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Print initialization summary
   */
  printSummary(result: InitializationResult, workspaceRoot: string): void {
    /* eslint-disable no-console */
    console.log('\n🚀 Mimir Workspace Initialized!\n');

    if (result.created.length > 0) {
      console.log('Created:');
      result.created.forEach((item) => console.log(`  ✓ ${item}`));
    }

    if (result.dbInitialized) {
      console.log('\n📊 Database:');
      console.log('  ✓ SQLite database created and seeded with pricing data');
    }

    if (result.configCreated) {
      console.log('\n⚙️  Configuration:');
      console.log('  ✓ config.yml created with default settings');
      console.log('  💡 Edit .mimir/config.yml to customize settings');
      console.log('  💡 Store API keys in .env file, not in config.yml');
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.errors.forEach((error) => console.log(`  ! ${error}`));
    }

    console.log('\n📁 Workspace structure:');
    console.log(`  ${path.join(workspaceRoot, '.mimir')}`);
    console.log('  ├── config.yml          (tracked in git)');
    console.log('  ├── mimir.db            (ignored)');
    console.log('  ├── logs/               (ignored)');
    console.log('  ├── commands/           (tracked - 6 example commands provided)');
    console.log('  ├── themes/             (tracked - custom UI themes)');
    console.log('  └── checkpoints/        (ignored)');

    console.log('\n💡 Custom Commands:');
    console.log('  Six example slash commands are ready to use:');
    console.log('  • /security - Analyze git diffs for security vulnerabilities');
    console.log('  • /refactor - Suggest code refactoring improvements');
    console.log('  • /test     - Generate comprehensive test cases');
    console.log('  • /docs     - Generate or improve documentation');
    console.log('  • /review   - Perform comprehensive code review');
    console.log('  • /perf     - Analyze performance issues');
    console.log('\n  Edit .mimir/commands/*.yml to customize or create your own!');

    console.log('\n✨ Ready to use! Run "mimir" to start an interactive chat session.\n');
    /* eslint-enable no-console */
  }
}
