/**
 * Uninstall command handler
 * Removes Mimir installation and optionally user configuration
 */

import { IFileSystem } from '../../platform/IFileSystem.js';
import { logger } from '../../utils/logger.js';
import path from 'path';
import os from 'os';
import React from 'react';
import { render, Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';

interface UninstallResult {
  success: boolean;
  removed: string[];
  errors: string[];
  keepConfig: boolean;
}

export interface UninstallOptions {
  yes?: boolean; // Auto-confirm without prompting
  keepConfig?: boolean; // Keep configuration (overrides prompt)
  removeConfig?: boolean; // Remove configuration (overrides prompt)
  quiet?: boolean; // Suppress output (implies yes)
}

export class UninstallCommand {
  constructor(private fs: IFileSystem) {}

  async execute(options: UninstallOptions = {}): Promise<void> {
    try {
      // If quiet mode, auto-confirm and suppress prompts
      const autoConfirm = options.yes || options.quiet;

      // 1. Show warning and get confirmation
      let confirmed = autoConfirm;
      if (!autoConfirm) {
        confirmed = await this.promptConfirmation();
      }

      if (!confirmed) {
        if (!options.quiet) {
          logger.info('Uninstall cancelled.');
        }
        return;
      }

      // 2. Determine whether to keep config
      let keepConfig: boolean;
      if (options.removeConfig !== undefined) {
        keepConfig = !options.removeConfig;
      } else if (options.keepConfig !== undefined) {
        keepConfig = options.keepConfig;
      } else if (autoConfirm) {
        // Default to keeping config in auto-confirm mode (safer)
        keepConfig = true;
      } else {
        keepConfig = await this.promptKeepConfig();
      }

      // 3. Detect installation type and uninstall
      const result = await this.uninstall(keepConfig, options.quiet);

      // 4. Show results
      if (!options.quiet) {
        this.printSummary(result);
      }

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      if (!options.quiet) {
        logger.error('Uninstall failed', { error });
      }
      process.exit(1);
    }
  }

  private async promptConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      const ConfirmPrompt = () => {
        const [input, setInput] = React.useState('');
        const [submitted, setSubmitted] = React.useState(false);

        React.useEffect(() => {
          if (submitted) {
            const answer = input.toLowerCase();
            resolve(answer === 'y' || answer === 'yes');
          }
        }, [submitted, input]);

        if (submitted) {
          return null;
        }

        return React.createElement(
          Box,
          { flexDirection: 'column', marginY: 1 },
          React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(
              Text,
              { bold: true, color: 'yellow' },
              '⚠️  WARNING: This will uninstall Mimir from your system.'
            )
          ),
          React.createElement(
            Box,
            null,
            React.createElement(Text, null, 'Are you sure you want to continue? (y/N): '),
            React.createElement(TextInput, {
              value: input,
              onChange: setInput,
              onSubmit: () => setSubmitted(true),
            })
          )
        );
      };

      render(React.createElement(ConfirmPrompt));
    });
  }

  private async promptKeepConfig(): Promise<boolean> {
    return new Promise((resolve) => {
      const ConfigPrompt = () => {
        const [input, setInput] = React.useState('');
        const [submitted, setSubmitted] = React.useState(false);

        React.useEffect(() => {
          if (submitted) {
            const answer = input.toLowerCase();
            // Default to keeping config (safer)
            resolve(answer !== 'n' && answer !== 'no');
          }
        }, [submitted, input]);

        if (submitted) {
          return null;
        }

        return React.createElement(
          Box,
          { flexDirection: 'column', marginY: 1 },
          React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(
              Text,
              null,
              'Do you want to keep your Mimir configuration and data in ~/.mimir?'
            )
          ),
          React.createElement(
            Box,
            null,
            React.createElement(Text, null, 'Keep configuration? (Y/n): '),
            React.createElement(TextInput, {
              value: input,
              onChange: setInput,
              onSubmit: () => setSubmitted(true),
            })
          )
        );
      };

      render(React.createElement(ConfigPrompt));
    });
  }

  private async uninstall(keepConfig: boolean, quiet = false): Promise<UninstallResult> {
    const result: UninstallResult = {
      success: true,
      removed: [],
      errors: [],
      keepConfig,
    };

    let clear: (() => void) | undefined;

    if (!quiet) {
      const UninstallProgress = () =>
        React.createElement(
          Box,
          null,
          React.createElement(
            Text,
            { color: 'cyan' },
            React.createElement(Spinner, { type: 'dots' }),
            ' Uninstalling Mimir...'
          )
        );

      const rendered = render(React.createElement(UninstallProgress));
      clear = rendered.clear;
    }

    try {
      const homeDir = os.homedir();

      // 1. Detect installation type
      const installType = await this.detectInstallType();
      if (!quiet) {
        logger.info(`Detected installation type: ${installType}`);
      }

      // 2. Remove binary installation (if applicable)
      if (installType === 'binary') {
        await this.removeBinaryInstallation(homeDir, result, quiet);
      }

      // 3. Remove global config if requested
      if (!keepConfig) {
        await this.removeGlobalConfig(homeDir, result, quiet);
      } else if (!quiet) {
        logger.info('Keeping global configuration at ~/.mimir');
      }

      // 4. For npm installations, provide instructions
      if (installType === 'npm' && !quiet) {
        logger.info('');
        logger.info('Note: Mimir was installed via npm.');
        logger.info('To complete uninstallation, run:');
        logger.info('  npm uninstall -g @codedir/mimir-code');
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Uninstall failed: ${error instanceof Error ? error.message : String(error)}`
      );
      if (!quiet) {
        logger.error('Uninstall error', { error });
      }
    } finally {
      if (clear) {
        clear();
      }
    }

    return result;
  }

  private async detectInstallType(): Promise<'npm' | 'binary' | 'unknown'> {
    try {
      // Check if this script is running from npm global modules
      const scriptPath = process.argv[1];

      // npm installations are typically in node_modules
      if (scriptPath.includes('node_modules')) {
        return 'npm';
      }

      // Binary installations are typically in ~/.mimir or ~/.local/bin
      const homeDir = os.homedir();
      if (
        scriptPath.includes(path.join(homeDir, '.mimir')) ||
        scriptPath.includes(path.join(homeDir, '.local', 'bin'))
      ) {
        return 'binary';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async removeBinaryInstallation(
    homeDir: string,
    result: UninstallResult,
    quiet = false
  ): Promise<void> {
    // Remove from ~/.local/bin (Unix)
    const unixBinPath = path.join(homeDir, '.local', 'bin', 'mimir');
    if (await this.fs.exists(unixBinPath)) {
      await this.fs.unlink(unixBinPath);
      result.removed.push('~/.local/bin/mimir');
      if (!quiet) {
        logger.info('Removed binary symlink from ~/.local/bin');
      }
    }

    // Remove from ~/.mimir/bin
    const mimirBinDir = path.join(homeDir, '.mimir', 'bin');
    if (await this.fs.exists(mimirBinDir)) {
      await this.fs.rmdir(mimirBinDir, { recursive: true });
      result.removed.push('~/.mimir/bin/');
      if (!quiet) {
        logger.info('Removed binary directory');
      }
    }
  }

  private async removeGlobalConfig(
    homeDir: string,
    result: UninstallResult,
    quiet = false
  ): Promise<void> {
    const mimirDir = path.join(homeDir, '.mimir');

    if (await this.fs.exists(mimirDir)) {
      // Create a backup before removing
      const backupDir = path.join(homeDir, `.mimir.backup.${Date.now()}`);
      try {
        await this.fs.rename(mimirDir, backupDir);
        result.removed.push('~/.mimir/ (backed up)');
        if (!quiet) {
          logger.info(`Backed up configuration to ${backupDir}`);
          logger.info('You can safely delete this backup if you no longer need it.');
        }
      } catch (error) {
        // If rename fails, try direct removal
        if (!quiet) {
          logger.warn('Failed to backup configuration, removing directly...');
        }
        await this.fs.rmdir(mimirDir, { recursive: true });
        result.removed.push('~/.mimir/');
      }
    }
  }

  printSummary(result: UninstallResult): void {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');

    if (result.success) {
      console.log('✅ Mimir has been uninstalled');
    } else {
      console.log('❌ Uninstall completed with errors');
    }

    console.log('═══════════════════════════════════════════════════════');

    if (result.removed.length > 0) {
      console.log('');
      console.log('Removed:');
      result.removed.forEach((item) => console.log(`  - ${item}`));
    }

    if (result.keepConfig) {
      console.log('');
      console.log('Kept configuration:');
      console.log('  - ~/.mimir/ (your settings and data)');
      console.log('');
      console.log('To remove configuration manually, run:');
      console.log('  rm -rf ~/.mimir');
    }

    if (result.errors.length > 0) {
      console.log('');
      console.log('Errors:');
      result.errors.forEach((error) => console.log(`  - ${error}`));
    }

    console.log('');
    console.log('Thank you for using Mimir! 👋');
    console.log('');
  }
}
