/**
 * Setup command handler
 * Runs setup wizard and saves configuration
 */

import React from 'react';
import { render } from 'ink';
import { SetupWizard } from '../components/SetupWizard.js';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { Theme } from '@/shared/config/schemas.js';
import { logger } from '@/shared/utils/logger.js';
import { detectTerminal, getWindowsTerminalSetupMessage } from '@/shared/utils/terminalDetector.js';

export class SetupCommand {
  constructor(private configLoader: ConfigLoader) {}

  async execute(): Promise<void> {
    // Enter alternate screen buffer for wizard
    process.stdout.write('\x1b[?1049h');

    // Load current configuration to get keyboard bindings
    const { config } = await this.configLoader.load();

    return new Promise((resolve, reject) => {
      const { waitUntilExit, clear } = render(
        React.createElement(SetupWizard, {
          keyBindings: config.keyBindings,
          onComplete: async (theme: Theme): Promise<void> => {
            try {
              // Save configuration to global config
              await this.configLoader.save(
                {
                  ui: {
                    theme,
                    syntaxHighlighting: true,
                    showLineNumbers: true,
                    compactMode: false,
                    autocompleteAutoShow: true,
                    autocompleteExecuteOnSelect: true,
                  },
                },
                'global'
              );

              logger.info('Setup completed successfully');
              // Exit alternate screen buffer
              process.stdout.write('\x1b[?1049l');

              // Show Windows Terminal setup notification if needed
              const terminalInfo = detectTerminal();
              if (terminalInfo.needsShiftEnterSetup) {
                console.log('\n' + getWindowsTerminalSetupMessage() + '\n');
              }

              setTimeout(() => resolve(), 500); // Brief delay to show completion message
            } catch (error) {
              logger.error('Setup failed', { error });
              // Exit alternate screen buffer on error
              process.stdout.write('\x1b[?1049l');
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          },
          onCancel: (): void => {
            logger.info('Setup cancelled by user');
            // Exit alternate screen buffer on cancel
            process.stdout.write('\x1b[?1049l');
            resolve();
          },
        }),
        {
          // Prevent console patching to avoid layout shifts
          patchConsole: false,
        }
      );

      // Handle process interruption (Ctrl+C)
      const cleanup = (): void => {
        process.stdout.write('\x1b[?1049l');
        clear();
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      void waitUntilExit().then(() => {
        // Remove cleanup handlers
        process.off('SIGINT', cleanup);
        process.off('SIGTERM', cleanup);
      });
    });
  }
}
