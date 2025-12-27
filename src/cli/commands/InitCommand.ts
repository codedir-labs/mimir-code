/**
 * Init command handler
 * Initializes Mimir in the current project
 */

import { IFileSystem } from '../../platform/IFileSystem.js';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { MimirInitializer } from '../../core/MimirInitializer.js';
import { logger } from '../../utils/logger.js';
import { join } from 'path';
import { homedir } from 'os';

export interface InitOptions {
  interactive?: boolean;
  quiet?: boolean;
}

export class InitCommand {
  private initializer: MimirInitializer;

  constructor(_fs: IFileSystem, _configLoader: ConfigLoader) {
    this.initializer = new MimirInitializer(_fs, _configLoader);
  }

  async execute(projectRoot?: string, options: InitOptions = {}): Promise<void> {
    const root = projectRoot || process.cwd();
    const homeDir = process.env.HOME || process.env.USERPROFILE || homedir();

    if (!options.quiet) {
      logger.info('Initializing Mimir', { projectRoot: root, homeDir });
    }

    // Initialize global directory (~/.mimir) first
    const globalResult = await this.initializer.initializeGlobalDirectory(homeDir);
    if (!globalResult.success && !options.quiet) {
      logger.warn('Global directory initialization had errors', {
        errors: globalResult.errors,
      });
    }

    // Check if workspace already initialized
    if (await this.initializer.isWorkspaceInitialized(root)) {
      if (!options.quiet) {
        logger.info('Mimir workspace is already initialized in this directory.');
        logger.info('Run "mimir" to start an interactive chat session.');
      }
      // Still show global init results if it created anything
      if (globalResult.created.length > 0 && !options.quiet) {
        this.printGlobalSummary(globalResult, homeDir);
      }
      return;
    }

    // Run local workspace initialization
    const localResult = await this.initializer.initializeWorkspace(root);

    // Merge results for summary
    const combinedResult = {
      ...localResult,
      created: [...globalResult.created, ...localResult.created],
      errors: [...globalResult.errors, ...localResult.errors],
      globalCreated: globalResult.globalCreated,
      localCreated: localResult.localCreated,
    };

    // Print summary (unless quiet mode)
    if (!options.quiet) {
      this.printCombinedSummary(combinedResult, homeDir, root);
    }

    // Exit with error if either initialization failed
    if (!globalResult.success || !localResult.success) {
      process.exit(1);
    }
  }

  private printGlobalSummary(result: any, homeDir: string): void {
    /* eslint-disable no-console */
    if (result.created.length > 0) {
      console.log('\n🌍 Global Mimir Directory:');
      result.created.forEach((item: string) => console.log(`  ✓ ${item}`));
      console.log(`\n📁 Location: ${join(homeDir, '.mimir')}`);
    }
    /* eslint-enable no-console */
  }

  private printCombinedSummary(result: any, homeDir: string, projectRoot: string): void {
    /* eslint-disable no-console */
    console.log('\n🚀 Mimir Initialized!\n');

    if (result.globalCreated) {
      console.log('🌍 Global Directory Created:');
      console.log(`  ${join(homeDir, '.mimir')}`);
      console.log('  ├── config.yml          (user preferences)');
      console.log('  ├── commands/           (global custom commands)');
      console.log('  └── themes/             (global UI themes)');
      console.log('');
    }

    if (result.localCreated) {
      console.log('📂 Project Workspace Created:');
      console.log(`  ${join(projectRoot, '.mimir')}`);
      console.log('  ├── mimir.db            (conversation history - ignored)');
      console.log('  ├── logs/               (application logs - ignored)');
      console.log('  ├── commands/           (project commands - tracked)');
      console.log('  ├── themes/             (project themes - tracked)');
      console.log('  └── checkpoints/        (undo/restore - ignored)');
      console.log('');
    }

    if (result.errors.length > 0) {
      console.log('⚠️  Warnings:');
      result.errors.forEach((error: string) => console.log(`  ! ${error}`));
      console.log('');
    }

    console.log('💡 Configuration Hierarchy:');
    console.log('  1. ~/.mimir/config.yml     (user defaults)');
    console.log('  2. ./.mimir/config.yml     (project overrides)');
    console.log('  3. .env                    (API keys)');
    console.log('  4. CLI flags               (runtime overrides)');

    console.log('\n✨ Ready to use! Run "mimir" to start an interactive chat session.\n');
    /* eslint-enable no-console */
  }
}
