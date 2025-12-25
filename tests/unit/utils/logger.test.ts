/**
 * Unit tests for Logger graceful degradation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../../../src/utils/logger.js';
import { mkdtemp, rm, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Logger', () => {
  let testDir: string;
  const originalConsoleWarn = console.warn;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mimir-logger-test-'));
  });

  afterEach(async () => {
    if (testDir) {
      try {
        // Restore permissions before cleanup
        await chmod(testDir, 0o755);
      } catch {
        // Ignore errors
      }
      await rm(testDir, { recursive: true, force: true });
    }
    console.warn = originalConsoleWarn;
  });

  describe('Successful initialization', () => {
    it('should create logger with file logging enabled', async () => {
      const logDir = join(testDir, '.mimir/logs');
      const logger = new Logger(logDir);

      // Verify logger was created
      expect(logger).toBeDefined();
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);

      // Check that logger has fileLoggingEnabled (via introspection)
      expect((logger as any).fileLoggingEnabled).toBe(true);
    });

    it('should log messages without errors', () => {
      const logDir = join(testDir, '.mimir/logs');
      const logger = new Logger(logDir);

      // Should not throw
      expect(() => logger.info('Test info message')).not.toThrow();
      expect(() => logger.warn('Test warn message')).not.toThrow();
      expect(() => logger.error('Test error message')).not.toThrow();
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });
  });

  describe('Graceful degradation', () => {
    it('should gracefully degrade to console logging when directory creation fails', async () => {
      // Use an impossible path to force mkdir failure
      // On Windows, use invalid characters; on Unix, use /root/forbidden
      const isWindows = process.platform === 'win32';
      const invalidPath = isWindows
        ? 'Z:\\nonexistent\\forbidden\\logs' // Non-existent drive or inaccessible path
        : '/root/forbidden/directory/logs';

      const consoleWarnings: string[] = [];

      // Mock console.warn to capture degradation warning
      console.warn = vi.fn((message: string) => {
        consoleWarnings.push(message);
      });

      // Logger should not throw, but should warn
      let logger: Logger;
      expect(() => {
        logger = new Logger(invalidPath);
      }).not.toThrow();

      // Verify console.warn was called about degradation
      expect(consoleWarnings.length).toBeGreaterThan(0);
      expect(consoleWarnings[0]).toContain('Failed to create log directory');
      expect(consoleWarnings[0]).toContain('File logging disabled');

      // Verify logger is still functional (using console transport)
      expect(logger!).toBeDefined();
      expect(() => logger!.info('Test message')).not.toThrow();

      // Check that fileLoggingEnabled is false
      expect((logger! as any).fileLoggingEnabled).toBe(false);
    });

    it('should still log to console when file logging is disabled', () => {
      const invalidDir = '/root/forbidden/directory/that/does/not/exist';
      console.warn = vi.fn();

      const logger = new Logger(invalidDir);

      // Logger should still work for console output
      expect(() => logger.info('Console message')).not.toThrow();
      expect(() => logger.error('Console error')).not.toThrow();
    });
  });

  describe('Logging with metadata', () => {
    it('should accept metadata objects', () => {
      const logDir = join(testDir, '.mimir/logs');
      const logger = new Logger(logDir);

      const metadata = {
        userId: '123',
        action: 'test',
        timestamp: Date.now(),
      };

      expect(() => logger.info('Message with metadata', metadata)).not.toThrow();
      expect(() => logger.error('Error with metadata', metadata)).not.toThrow();
    });
  });
});
