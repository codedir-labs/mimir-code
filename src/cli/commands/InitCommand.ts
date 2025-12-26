/**
 * Init command handler
 * Initializes Mimir in the current project
 */

import { IFileSystem } from '../../platform/IFileSystem.js';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { MimirInitializer } from '../../core/MimirInitializer.js';
import { logger } from '../../utils/logger.js';

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

    if (!options.quiet) {
      logger.info('Initializing Mimir workspace', { projectRoot: root });
    }

    // Check if already initialized
    if (await this.initializer.isWorkspaceInitialized(root)) {
      if (!options.quiet) {
        logger.info('Mimir workspace is already initialized in this directory.');
        logger.info('Run "mimir" to start an interactive chat session.');
      }
      return;
    }

    // Run full initialization
    const result = await this.initializer.initializeWorkspace(root);

    // Print summary (unless quiet mode)
    if (!options.quiet) {
      this.initializer.printSummary(result, root);
    }

    // Exit with error if initialization failed
    if (!result.success) {
      process.exit(1);
    }
  }
}
