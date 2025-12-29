/**
 * Health check system for LLM providers and database
 */

import type { ILLMProvider } from '@codedir/mimir-agents';
import { DatabaseManager } from '@codedir/mimir-agents-node/storage';
import { logger } from './logger.js';

export interface HealthStatus {
  healthy: boolean;
  checks: HealthCheckResult[];
  timestamp: number;
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  responseTime?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export class HealthChecker {
  private llmProvider: ILLMProvider | null = null;
  private db: DatabaseManager | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastStatus: HealthStatus | null = null;

  constructor(private intervalSeconds: number = 300) {} // Default 5 minutes

  /**
   * Set LLM provider for health checks
   */
  setLLMProvider(provider: ILLMProvider): void {
    this.llmProvider = provider;
  }

  /**
   * Set database for health checks
   */
  setDatabase(db: DatabaseManager): void {
    this.db = db;
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }

    logger.info('Starting health checks', {
      intervalSeconds: this.intervalSeconds,
    });

    // Run initial check
    this.runHealthCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, this.intervalSeconds * 1000);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health checks stopped');
    }
  }

  /**
   * Run health check manually
   */
  async runHealthCheck(): Promise<HealthStatus> {
    logger.debug('Running health checks');

    const checks: HealthCheckResult[] = [];

    // Check database
    if (this.db) {
      checks.push(await this.checkDatabase());
    }

    // Check LLM provider
    if (this.llmProvider) {
      checks.push(await this.checkLLMProvider());
    }

    // Check memory usage
    checks.push(this.checkMemory());

    // Check disk space
    checks.push(await this.checkDiskSpace());

    const status: HealthStatus = {
      healthy: checks.every((c) => c.status === 'pass' || c.status === 'warn'),
      checks,
      timestamp: Date.now(),
    };

    this.lastStatus = status;

    // Log unhealthy state
    if (!status.healthy) {
      logger.error('Health check failed', {
        failedChecks: checks.filter((c) => c.status === 'fail'),
      });
    }

    return status;
  }

  /**
   * Get last health status
   */
  getLastStatus(): HealthStatus | null {
    return this.lastStatus;
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      if (!this.db) {
        return {
          name: 'database',
          status: 'warn',
          error: 'Database not configured',
        };
      }

      // Run integrity check
      const healthy = await this.db.healthCheck();

      if (!healthy) {
        return {
          name: 'database',
          status: 'fail',
          error: 'Database integrity check failed',
          responseTime: Math.round(performance.now() - startTime),
        };
      }

      // Get stats
      const stats = this.db.getStats();

      return {
        name: 'database',
        status: 'pass',
        responseTime: Math.round(performance.now() - startTime),
        details: stats,
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'fail',
        error: error instanceof Error ? error.message : String(error),
        responseTime: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Check LLM provider health
   */
  private async checkLLMProvider(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      if (!this.llmProvider) {
        return {
          name: 'llm',
          status: 'warn',
          error: 'LLM provider not configured',
        };
      }

      // Simple ping with minimal token usage
      await this.llmProvider.chat([
        {
          role: 'user',
          content: 'ping',
        },
      ]);

      return {
        name: 'llm',
        status: 'pass',
        responseTime: Math.round(performance.now() - startTime),
        details: {
          provider: this.llmProvider.getProviderName(),
          model: this.llmProvider.getModelName(),
        },
      };
    } catch (error) {
      return {
        name: 'llm',
        status: 'fail',
        error: error instanceof Error ? error.message : String(error),
        responseTime: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Check memory usage
   */
  private checkMemory(): HealthCheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const utilization = heapUsedMB / heapTotalMB;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let error: string | undefined;

    if (utilization > 0.9) {
      status = 'fail';
      error = `Memory usage critical: ${Math.round(utilization * 100)}%`;
    } else if (utilization > 0.75) {
      status = 'warn';
      error = `Memory usage high: ${Math.round(utilization * 100)}%`;
    }

    return {
      name: 'memory',
      status,
      error,
      details: {
        heapUsedMB,
        heapTotalMB,
        utilization: Math.round(utilization * 100) / 100,
        rssMB: Math.round(usage.rss / 1024 / 1024),
      },
    };
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(): Promise<HealthCheckResult> {
    try {
      // Note: This is a simplified check
      // For production, consider using a library like 'check-disk-space'
      // For now, we'll just check if we can write to .mimir directory

      const testFile = '.mimir/.health_check';
      const fs = await import('fs/promises');

      await fs.writeFile(testFile, 'health check');
      await fs.unlink(testFile);

      return {
        name: 'disk',
        status: 'pass',
        details: {
          writable: true,
        },
      };
    } catch (error) {
      return {
        name: 'disk',
        status: 'fail',
        error: 'Unable to write to disk',
      };
    }
  }

  /**
   * Get health summary as text
   */
  getSummary(status?: HealthStatus): string {
    const s = status || this.lastStatus;
    if (!s) {
      return 'No health checks run yet';
    }

    const lines = [
      `Health Status: ${s.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`,
      `Timestamp: ${new Date(s.timestamp).toISOString()}`,
      '',
      'Checks:',
    ];

    for (const check of s.checks) {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      const time = check.responseTime ? ` (${check.responseTime}ms)` : '';
      lines.push(`  ${icon} ${check.name}${time}`);

      if (check.error) {
        lines.push(`      Error: ${check.error}`);
      }

      if (check.details) {
        for (const [key, value] of Object.entries(check.details)) {
          lines.push(`      ${key}: ${value}`);
        }
      }
    }

    return lines.join('\n');
  }
}
