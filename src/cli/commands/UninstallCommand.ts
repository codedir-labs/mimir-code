/**
 * Uninstall command handler
 * Removes Mimir installation and optionally user configuration
 */

import { IFileSystem } from '../../platform/IFileSystem.js';
import { IProcessExecutor } from '../../platform/IProcessExecutor.js';
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
  constructor(
    private fs: IFileSystem,
    private executor?: IProcessExecutor
  ) {}

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

      // 3. For npm installations, run npm uninstall
      if (installType === 'npm') {
        await this.removeNpmInstallation(result, quiet);
      }

      // 4. Remove global config if requested
      if (!keepConfig) {
        await this.removeGlobalConfig(homeDir, result, quiet);
      } else if (!quiet) {
        logger.info('Keeping global configuration at ~/.mimir');
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

      if (!scriptPath) {
        logger.debug('No script path found in process.argv[1]');
        return 'unknown';
      }

      logger.debug(`Detecting install type from script path: ${scriptPath}`);

      // Normalize path for comparison (handle Windows backslashes)
      const normalizedPath = path.normalize(scriptPath).toLowerCase();

      // npm installations are typically in node_modules
      if (normalizedPath.includes('node_modules')) {
        logger.debug('Detected npm installation (node_modules in path)');
        return 'npm';
      }

      // Binary installations are typically in ~/.mimir/bin or ~/.local/bin
      const homeDir = os.homedir();
      const mimirBinPath = path.normalize(path.join(homeDir, '.mimir', 'bin')).toLowerCase();
      const localBinPath = path.normalize(path.join(homeDir, '.local', 'bin')).toLowerCase();

      if (normalizedPath.includes(mimirBinPath)) {
        logger.debug('Detected binary installation (.mimir/bin in path)');
        return 'binary';
      }

      if (normalizedPath.includes(localBinPath)) {
        logger.debug('Detected binary installation (.local/bin in path)');
        return 'binary';
      }

      // Check if the binary files exist (fallback detection)
      const binaryPaths = [
        path.join(homeDir, '.local', 'bin', 'mimir'),
        path.join(homeDir, '.mimir', 'bin', 'mimir'),
        path.join(homeDir, '.mimir', 'bin', 'mimir.exe'),
      ];

      for (const binPath of binaryPaths) {
        if (await this.fs.exists(binPath)) {
          logger.debug(`Detected binary installation (found file at ${binPath})`);
          return 'binary';
        }
      }

      logger.debug('Could not detect installation type - defaulting to unknown');
      return 'unknown';
    } catch (error) {
      logger.debug('Error detecting installation type', { error });
      return 'unknown';
    }
  }

  private async removeNpmInstallation(result: UninstallResult, quiet = false): Promise<void> {
    if (!this.executor) {
      if (!quiet) {
        logger.warn('Cannot automatically uninstall npm package.');
        logger.info('Please run manually: npm uninstall -g @codedir/mimir-code');
      }
      return;
    }

    try {
      if (!quiet) {
        logger.info('Removing npm global package...');
      }

      const npmResult = await this.executor.execute(
        'npm',
        ['uninstall', '-g', '@codedir/mimir-code'],
        {
          cwd: process.cwd(),
        }
      );

      if (npmResult.exitCode === 0) {
        result.removed.push('npm global package (@codedir/mimir-code)');
        if (!quiet) {
          logger.info('Successfully uninstalled npm package');
        }
      } else {
        throw new Error(`npm uninstall failed: ${npmResult.stderr}`);
      }
    } catch (error) {
      if (!quiet) {
        logger.error('Failed to uninstall npm package', { error });
        logger.info('Please run manually: npm uninstall -g @codedir/mimir-code');
      }
      result.errors.push(
        `npm uninstall failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async removeBinaryInstallation(
    homeDir: string,
    result: UninstallResult,
    quiet = false
  ): Promise<void> {
    const isWindows = process.platform === 'win32';
    const localBinPath = path.join(homeDir, '.local', 'bin', 'mimir');
    const mimirBinDir = path.join(homeDir, '.mimir', 'bin');

    if (isWindows) {
      // Windows: Spawn deferred cleanup process
      await this.spawnWindowsCleanup(localBinPath, mimirBinDir, quiet);

      // Remove from PATH
      await this.removeFromWindowsPath(quiet);

      result.removed.push('Binary (scheduled for deletion after exit)');
      result.removed.push('PATH entry');

      if (!quiet) {
        logger.info('✓ Scheduled binary deletion');
        logger.info('✓ Removed from PATH');
        logger.warn('⚠  Cleanup will complete in ~3 seconds');
      }
    } else {
      // Unix: Delete directly (file can be unlinked while running)
      if (await this.fs.exists(localBinPath)) {
        await this.fs.unlink(localBinPath);
        result.removed.push('~/.local/bin/mimir');
        if (!quiet) {
          logger.info('Removed binary from ~/.local/bin');
        }
      }

      if (await this.fs.exists(mimirBinDir)) {
        await this.fs.rmdir(mimirBinDir, { recursive: true });
        result.removed.push('~/.mimir/bin/');
        if (!quiet) {
          logger.info('Removed binary directory');
        }
      }

      if (!quiet) {
        logger.info('✓ Binary uninstalled');
        logger.warn('⚠  Current terminal still has mimir cached');
        logger.info('  Run: hash -r   (to clear shell cache)');
      }
    }
  }

  private async spawnWindowsCleanup(
    binPath: string,
    binDir: string,
    quiet: boolean
  ): Promise<void> {
    if (!this.executor) {
      if (!quiet) {
        logger.warn('Cannot spawn cleanup process - no executor available');
      }
      return;
    }

    try {
      // Create cleanup batch script
      const cleanupScript = `@echo off
REM Wait for parent process to exit
timeout /t 3 /nobreak >nul 2>&1

REM Delete binary if it exists
if exist "${binPath}" (
  del /f /q "${binPath}" >nul 2>&1
)
if exist "${binPath}.exe" (
  del /f /q "${binPath}.exe" >nul 2>&1
)
if exist "${binPath}.cmd" (
  del /f /q "${binPath}.cmd" >nul 2>&1
)

REM Delete binary directory
if exist "${binDir}" (
  rmdir /s /q "${binDir}" >nul 2>&1
)

REM Delete this cleanup script
del /f /q "%~f0" >nul 2>&1
`;

      const tempDir = os.tmpdir();
      const cleanupPath = path.join(tempDir, `mimir-cleanup-${Date.now()}.bat`);

      await this.fs.writeFile(cleanupPath, cleanupScript);

      // Spawn detached background process
      const { spawn } = await import('child_process');
      const child = spawn('cmd', ['/c', cleanupPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      if (!quiet) {
        logger.info('Spawned background cleanup process');
      }
    } catch (error) {
      if (!quiet) {
        logger.error('Failed to spawn cleanup process', { error });
      }
    }
  }

  private async removeFromWindowsPath(quiet: boolean): Promise<void> {
    if (!this.executor) return;

    try {
      // Get current user PATH
      const result = await this.executor.execute(
        'powershell',
        ['-NoProfile', '-Command', '[Environment]::GetEnvironmentVariable("Path", "User")'],
        { cwd: process.cwd() }
      );

      if (result.exitCode !== 0) {
        throw new Error('Failed to read PATH');
      }

      const currentPath = result.stdout.trim();
      const pathEntries = currentPath.split(';').filter(Boolean);

      // Remove only mimir-related entries
      const filteredEntries = pathEntries.filter((entry) => {
        const normalizedEntry = path.normalize(entry.trim()).toLowerCase();
        return !normalizedEntry.includes('mimir');
      });

      // Only update if we actually removed something
      if (filteredEntries.length < pathEntries.length) {
        const newPath = filteredEntries.join(';');

        await this.executor.execute(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `[Environment]::SetEnvironmentVariable("Path", "${newPath}", "User")`,
          ],
          { cwd: process.cwd() }
        );

        const removedCount = pathEntries.length - filteredEntries.length;
        if (!quiet) {
          logger.info(`Removed ${removedCount} PATH entry/entries containing 'mimir'`);
        }
      }
    } catch (error) {
      if (!quiet) {
        logger.warn('Failed to remove from PATH', { error });
        logger.info('You may need to manually remove from PATH');
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
      // Remove the directory
      await this.fs.rmdir(mimirDir, { recursive: true });
      result.removed.push('~/.mimir/');
      if (!quiet) {
        logger.info('Removed configuration directory: ~/.mimir');
        logger.info('All Mimir data has been deleted.');
      }
    }
  }

  /* eslint-disable no-console */
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
      console.log('Configuration preserved:');
      console.log('  - ~/.mimir/ (your settings and data)');
      console.log('');
      console.log('To remove it later, run:');
      console.log('  mimir uninstall --yes --remove-config');
      console.log('  or manually: rm -rf ~/.mimir');
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
  /* eslint-enable no-console */
}
