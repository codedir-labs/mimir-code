/**
 * Graceful signal handling (SIGINT, SIGTERM)
 * Handles Ctrl+C and termination signals at the application level
 */

import { logger } from '../../utils/logger.js';
import { KeyBindingsConfig } from '../../config/schemas.js';
import { formatKeyboardShortcut } from '../../utils/keyboardFormatter.js';

export interface SignalHandlerOptions {
  /**
   * Callback to run before exit
   * For cleanup: close DB, stop containers, etc.
   */
  onCleanup?: () => Promise<void> | void;

  /**
   * Number of Ctrl+C presses before emergency exit
   * Default: 3
   */
  emergencyExitCount?: number;

  /**
   * Timeout in ms for cleanup
   * If cleanup takes longer, force exit
   * Default: 5000 (5 seconds)
   */
  cleanupTimeout?: number;

  /**
   * Time window in ms for counting rapid presses
   * Default: 2000 (2 seconds)
   */
  rapidPressWindow?: number;

  /**
   * Keyboard bindings configuration for displaying interrupt key
   * Optional - if not provided, defaults to "Ctrl+C"
   */
  keyBindings?: KeyBindingsConfig;
}

export class SignalHandler {
  private sigintCount = 0;
  private cleanupTimeout: NodeJS.Timeout | null = null;
  private rapidPressTimeout: NodeJS.Timeout | null = null;
  private isCleaningUp = false;
  private cleanupPromise: Promise<void> | null = null;

  private readonly emergencyExitCount: number;
  private readonly cleanupTimeoutMs: number;
  private readonly rapidPressWindowMs: number;
  private readonly onCleanup?: () => Promise<void> | void;
  private readonly interruptKeyDisplay: string;

  constructor(options: SignalHandlerOptions = {}) {
    this.emergencyExitCount = options.emergencyExitCount ?? 3;
    this.cleanupTimeoutMs = options.cleanupTimeout ?? 5000;
    this.rapidPressWindowMs = options.rapidPressWindow ?? 2000;
    this.onCleanup = options.onCleanup;

    // Format interrupt key for display (defaults to Ctrl+C if no bindings provided)
    this.interruptKeyDisplay = options.keyBindings
      ? formatKeyboardShortcut(options.keyBindings.interrupt, { showFirstOnly: true })
      : 'Ctrl+C';
  }

  /**
   * Install signal handlers
   * Call this once at app startup
   */
  install(): void {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => void this.handleSigint());

    // Handle SIGTERM (kill command)
    process.on('SIGTERM', () => void this.handleSigterm());

    // Handle SIGBREAK (Ctrl+Break on Windows)
    // On Windows, this is sometimes triggered instead of SIGINT
    if (process.platform === 'win32') {
      process.on('SIGBREAK', () => void this.handleSigint());
    }

    logger.debug('Signal handlers installed', {
      platform: process.platform,
      emergencyExitCount: this.emergencyExitCount,
      cleanupTimeout: this.cleanupTimeoutMs,
    });
  }

  /**
   * Handle SIGINT (Ctrl+C)
   * Allows multiple presses for emergency exit
   */
  private async handleSigint(): Promise<void> {
    this.sigintCount++;

    // Reset counter after rapid press window
    if (this.rapidPressTimeout) {
      clearTimeout(this.rapidPressTimeout);
    }
    this.rapidPressTimeout = setTimeout(() => {
      this.sigintCount = 0;
    }, this.rapidPressWindowMs);

    logger.debug(`SIGINT received (${this.sigintCount}/${this.emergencyExitCount})`);

    // Emergency exit on Nth press
    if (this.sigintCount >= this.emergencyExitCount) {
      logger.warn('Emergency exit triggered');
      this.emergencyExit();
      return;
    }

    // First press: start graceful cleanup
    if (this.sigintCount === 1) {
      await this.gracefulExit('SIGINT');
    } else {
      // Subsequent presses: warn user
      console.error(
        `\nPress ${this.interruptKeyDisplay} ${this.emergencyExitCount - this.sigintCount} more time(s) to force exit`
      );
    }
  }

  /**
   * Handle SIGTERM (kill command)
   * Always does graceful cleanup
   */
  private async handleSigterm(): Promise<void> {
    logger.debug('SIGTERM received');
    await this.gracefulExit('SIGTERM');
  }

  /**
   * Perform graceful exit with cleanup
   */
  private async gracefulExit(signal: string): Promise<void> {
    if (this.isCleaningUp) {
      logger.debug('Cleanup already in progress');
      // Wait for existing cleanup to finish
      if (this.cleanupPromise) {
        await this.cleanupPromise;
      }
      return;
    }

    this.isCleaningUp = true;

    logger.info(`Graceful shutdown initiated (${signal})`);

    // Set cleanup timeout
    this.cleanupTimeout = setTimeout(() => {
      logger.warn('Cleanup timeout exceeded, forcing exit');
      this.forceExit(1);
    }, this.cleanupTimeoutMs);

    // Run cleanup
    this.cleanupPromise = this.runCleanup();

    try {
      await this.cleanupPromise;
      logger.info('Cleanup completed successfully');
      this.exit(0);
    } catch (error) {
      logger.error('Error during cleanup', { error });
      this.exit(1);
    } finally {
      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
      }
    }
  }

  /**
   * Run user-provided cleanup function
   */
  private async runCleanup(): Promise<void> {
    if (!this.onCleanup) {
      return;
    }

    try {
      await this.onCleanup();
    } catch (error) {
      logger.error('Cleanup function threw error', { error });
      throw error;
    }
  }

  /**
   * Emergency exit without cleanup
   */
  private emergencyExit(): void {
    console.error('\n\nEmergency exit - no cleanup performed');
    this.forceExit(130); // Standard exit code for Ctrl+C
  }

  /**
   * Normal exit after cleanup
   */
  private exit(code: number): void {
    // Clear alternate screen buffer if in use
    process.stdout.write('\x1b[?1049l');

    process.exit(code);
  }

  /**
   * Force exit immediately
   */
  private forceExit(code: number): void {
    process.stdout.write('\x1b[?1049l');
    process.exit(code);
  }

  /**
   * Remove signal handlers
   * For testing or if you need to uninstall
   */
  uninstall(): void {
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

    // Remove SIGBREAK listener on Windows
    if (process.platform === 'win32') {
      process.removeAllListeners('SIGBREAK');
    }

    if (this.rapidPressTimeout) {
      clearTimeout(this.rapidPressTimeout);
    }
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
    }

    logger.debug('Signal handlers removed');
  }
}

/**
 * Install signal handlers with cleanup callback
 * Returns SignalHandler instance for manual control if needed
 */
export function installSignalHandlers(options: SignalHandlerOptions = {}): SignalHandler {
  const handler = new SignalHandler(options);
  handler.install();
  return handler;
}
