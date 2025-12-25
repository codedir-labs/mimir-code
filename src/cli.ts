#!/usr/bin/env node

/**
 * Mimir CLI entry point
 */

import { Command } from 'commander';
import { FileSystemAdapter } from './platform/FileSystemAdapter.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { FirstRunDetector } from './cli/utils/firstRunDetector.js';
import { SetupCommand } from './cli/commands/SetupCommand.js';
import { ChatCommand } from './cli/commands/ChatCommand.js';
import { InitCommand } from './cli/commands/InitCommand.js';
import { logger } from './utils/logger.js';

// Initialize dependencies
const fs = new FileSystemAdapter();
const configLoader = new ConfigLoader(fs);
const firstRunDetector = new FirstRunDetector(fs);
const setupCommand = new SetupCommand(configLoader);
const chatCommand = new ChatCommand(configLoader, firstRunDetector, setupCommand, fs);
const initCommand = new InitCommand(fs, configLoader);

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
  .action(async () => {
    await initCommand.execute();
    process.exit(0);
  });

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

program.parse();
