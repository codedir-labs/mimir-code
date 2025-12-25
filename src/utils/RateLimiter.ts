/**
 * Rate limiter using in-memory time windows
 * Prevents runaway costs and excessive operations
 */

import { logger } from './logger.js';
import { RateLimitConfig } from '../config/schemas.js';

interface TimeWindow {
  count: number;
  windowStart: number;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly limitType: string,
    public readonly limit: number,
    public readonly current: number,
    public readonly resetIn: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class RateLimiter {
  private config: RateLimitConfig;
  private windows: Map<string, TimeWindow> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Clean up old windows periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Check if operation is allowed within rate limit
   */
  async check(operationType: 'command' | 'tool' | 'llm', identifier?: string): Promise<void> {
    if (!this.config.enabled) {
      return; // Rate limiting disabled
    }

    const key = identifier ? `${operationType}:${identifier}` : operationType;
    const limit = this.getLimit(operationType);
    const windowSeconds = 60; // 1 minute windows

    const now = Date.now();
    const window = this.windows.get(key);

    if (!window || now - window.windowStart >= windowSeconds * 1000) {
      // New window
      this.windows.set(key, {
        count: 1,
        windowStart: now,
      });
      return;
    }

    // Check if within limit
    if (window.count >= limit) {
      const resetIn = Math.ceil((window.windowStart + windowSeconds * 1000 - now) / 1000);

      logger.warn('Rate limit exceeded', {
        operationType,
        identifier,
        limit,
        current: window.count,
        resetIn,
      });

      throw new RateLimitError(
        `Rate limit exceeded for ${operationType}. Limit: ${limit}/min, current: ${window.count}. Resets in ${resetIn}s`,
        operationType,
        limit,
        window.count,
        resetIn
      );
    }

    // Increment counter
    window.count++;
  }

  /**
   * Get current usage for an operation type
   */
  getUsage(
    operationType: 'command' | 'tool' | 'llm',
    identifier?: string
  ): {
    count: number;
    limit: number;
    resetIn: number;
  } {
    const key = identifier ? `${operationType}:${identifier}` : operationType;
    const limit = this.getLimit(operationType);
    const window = this.windows.get(key);

    if (!window) {
      return {
        count: 0,
        limit,
        resetIn: 60,
      };
    }

    const now = Date.now();
    const windowSeconds = 60;
    const resetIn = Math.ceil((window.windowStart + windowSeconds * 1000 - now) / 1000);

    return {
      count: window.count,
      limit,
      resetIn: Math.max(0, resetIn),
    };
  }

  /**
   * Reset rate limit for specific operation
   */
  reset(operationType: 'command' | 'tool' | 'llm', identifier?: string): void {
    const key = identifier ? `${operationType}:${identifier}` : operationType;
    this.windows.delete(key);
    logger.info('Rate limit reset', { operationType, identifier });
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.windows.clear();
    logger.info('All rate limits reset');
  }

  /**
   * Get limit for operation type
   */
  private getLimit(operationType: 'command' | 'tool' | 'llm'): number {
    switch (operationType) {
      case 'command':
        return this.config.commandsPerMinute;
      case 'tool':
        return this.config.toolExecutionsPerMinute;
      case 'llm':
        return this.config.llmCallsPerMinute;
      default:
        return 60; // Default fallback
    }
  }

  /**
   * Clean up expired windows
   */
  private cleanup(): void {
    const now = Date.now();
    const windowSeconds = 60;

    for (const [key, window] of this.windows.entries()) {
      if (now - window.windowStart >= windowSeconds * 1000) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    totalWindows: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const key of this.windows.keys()) {
      const type = key.split(':')[0] || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      totalWindows: this.windows.size,
      byType,
    };
  }
}
