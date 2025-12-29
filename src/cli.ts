/**
 * Mimir CLI entry point
 *
 * Note: Shebang is NOT included in source code.
 * - npm adds it automatically based on package.json bin field
 * - pkg adds it automatically when creating binaries
 */

import { Command } from 'commander';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
import { ProcessExecutorAdapter } from '@codedir/mimir-agents-node/platform';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { FirstRunDetector } from '@/features/init/components/firstRunDetector.js';
import { SetupCommand } from '@/features/init/commands/SetupCommand.js';
import { ChatCommand } from '@/features/chat/commands/ChatCommand.js';
import { InitCommand } from '@/features/init/commands/InitCommand.js';
import { UninstallCommand } from '@/features/init/commands/UninstallCommand.js';
import { createAuthCommand } from '@/features/auth/commands/auth.js';
import { createOrgsCommand } from '@/features/teams/commands/orgs.js';
import { createTeamsCommand } from '@/features/teams/commands/teams.js';
import { createConnectCommand, createProvidersCommand } from '@/features/providers/index.js';
import { logger } from '@/shared/utils/logger.js';

// Initialize dependencies
const fs = new FileSystemAdapter();
const executor = new ProcessExecutorAdapter();
const configLoader = new ConfigLoader(fs);
const firstRunDetector = new FirstRunDetector(fs);
const setupCommand = new SetupCommand(configLoader);
const chatCommand = new ChatCommand(configLoader, firstRunDetector, setupCommand, fs);
const initCommand = new InitCommand(fs, configLoader);
const uninstallCommand = new UninstallCommand(fs, executor);

const program = new Command();

program.name('mimir').description('Platform-agnostic, BYOK AI coding agent CLI').version('0.1.0');

// Setup wizard
program
  .command('setup')
  .description('Run setup wizard')
  .action(async () => {
    await setupCommand.execute();
    process.exit(0);
  });

// Main interactive chat command
program
  .command('chat', { isDefault: true })
  .description('Start interactive chat session')
  .action(async () => {
    await chatCommand.execute();
    process.exit(0);
  });

// Initialize project
program
  .command('init')
  .description('Initialize Mimir in current project')
  .option('--no-interactive', 'Run without interactive prompts (for automated setup)')
  .option('-q, --quiet', 'Suppress output')
  .action(async (options: { interactive?: boolean; quiet?: boolean }) => {
    await initCommand.execute(undefined, options);
    process.exit(0);
  });

// Uninstall
program
  .command('uninstall')
  .description('Uninstall Mimir from your system')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--keep-config', 'Keep configuration directory (~/.mimir)')
  .option('--remove-config', 'Remove configuration directory (~/.mimir)')
  .option('-q, --quiet', 'Suppress output (implies --yes)')
  .action(
    async (options: {
      yes?: boolean;
      keepConfig?: boolean;
      removeConfig?: boolean;
      quiet?: boolean;
    }) => {
      await uninstallCommand.execute(options);
      process.exit(0);
    }
  );

// History management
const history = program.command('history').description('Manage conversation history');

history
  .command('list')
  .description('List recent conversations')
  .action(() => {
    logger.warn('Listing conversations... (not implemented yet)');
  });

history
  .command('resume <id>')
  .description('Resume a conversation')
  .action((id: string) => {
    logger.warn(`Resuming conversation ${id}... (not implemented yet)`);
  });

history
  .command('export <id>')
  .description('Export conversation to file')
  .action((id: string) => {
    logger.warn(`Exporting conversation ${id}... (not implemented yet)`);
  });

history
  .command('clear')
  .description('Clear conversation history')
  .action(() => {
    logger.warn('Clearing history... (not implemented yet)');
  });

// Cost analytics
const cost = program.command('cost').description('View cost analytics');

cost
  .command('today')
  .description("Show today's spending")
  .action(() => {
    logger.warn("Fetching today's costs... (not implemented yet)");
  });

cost
  .command('week')
  .description('Show weekly spending')
  .action(() => {
    logger.warn('Fetching weekly costs... (not implemented yet)');
  });

cost
  .command('month')
  .description('Show monthly spending')
  .action(() => {
    logger.warn('Fetching monthly costs... (not implemented yet)');
  });

cost
  .command('compare')
  .description('Compare provider costs')
  .action(() => {
    logger.warn('Comparing providers... (not implemented yet)');
  });

// Diagnostics
program
  .command('doctor')
  .description('Run diagnostics')
  .action(() => {
    logger.warn('Running diagnostics... (not implemented yet)');
  });

// Permissions management
const permissions = program.command('permissions').description('Manage command permissions');

permissions
  .command('list')
  .description('List allowed commands')
  .action(() => {
    logger.warn('Listing permissions... (not implemented yet)');
  });

permissions
  .command('add <pattern>')
  .description('Add command to allowlist')
  .action((pattern: string) => {
    logger.warn(`Adding ${pattern} to allowlist... (not implemented yet)`);
  });

permissions
  .command('remove <pattern>')
  .description('Remove command from allowlist')
  .action((pattern: string) => {
    logger.warn(`Removing ${pattern} from allowlist... (not implemented yet)`);
  });

// Provider management and configuration
program.addCommand(createConnectCommand());
program.addCommand(createProvidersCommand());

// Teams integration commands
program.addCommand(createAuthCommand());
program.addCommand(createOrgsCommand());
program.addCommand(createTeamsCommand());

program.parse();
