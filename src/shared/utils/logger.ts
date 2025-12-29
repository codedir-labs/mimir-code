/**
 * Logging utility using winston
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class Logger {
  private logger: winston.Logger;
  private fileLoggingEnabled = false;
  private consoleTransport: winston.transport;

  constructor(logDir = '.mimir/logs') {
    // Resolve to absolute path for clarity
    const absoluteLogDir = path.resolve(process.cwd(), logDir);

    // Attempt to create log directory (synchronous to work in constructor)
    // Gracefully degrade to console-only logging if this fails
    try {
      if (!fs.existsSync(absoluteLogDir)) {
        fs.mkdirSync(absoluteLogDir, { recursive: true });
      }
      this.fileLoggingEnabled = true;
    } catch (error) {
      // Degrade gracefully - warn but don't crash
      console.warn(
        `[Logger] Warning: Failed to create log directory at ${absoluteLogDir}. File logging disabled. Error: ${error}`
      );
      this.fileLoggingEnabled = false;
    }

    // Build transports array conditionally
    // Create console transport (can be disabled later for Ink UI)
    this.consoleTransport = new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    });

    const transports: winston.transport[] = [this.consoleTransport];

    // Only add file transports if directory creation succeeded
    if (this.fileLoggingEnabled) {
      transports.push(
        // Error logs with daily rotation
        new DailyRotateFile({
          dirname: absoluteLogDir,
          filename: '%DATE%-error.log',
          datePattern: 'YYYYMMDD',
          level: 'error',
          maxSize: '10m', // Rotate when file reaches 10MB
          maxFiles: '30d', // Keep logs for 30 days
          zippedArchive: true, // Compress old logs
        }),
        // Combined logs with daily rotation
        new DailyRotateFile({
          dirname: absoluteLogDir,
          filename: '%DATE%.log',
          datePattern: 'YYYYMMDD',
          maxSize: '10m', // Rotate when file reaches 10MB
          maxFiles: '30d', // Keep logs for 30 days
          zippedArchive: true, // Compress old logs
        })
      );
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
    });
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  /**
   * Disable console logging (useful when Ink UI is active)
   */
  disableConsole(): void {
    this.logger.remove(this.consoleTransport);
  }

  /**
   * Enable console logging
   */
  enableConsole(): void {
    if (!this.logger.transports.includes(this.consoleTransport)) {
      this.logger.add(this.consoleTransport);
    }
  }
}

// Singleton instance
export const logger = new Logger();
