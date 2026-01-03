/**
 * Performance monitoring and metrics collection
 * Tracks LLM calls, tool executions, DB queries with batch writes
 */

import { DatabaseManager } from '@codedir/mimir-agents-node/storage';
import { logger } from './logger.js';
import { MonitoringConfig } from '@/shared/config/schemas.js';

export interface MetricData {
  operation: string;
  duration_ms: number;

  // Context
  conversation_id?: string;
  session_id?: string;

  // LLM specific
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;

  // Tool specific
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result_size?: number;

  // DB specific
  query_type?: string;
  table_name?: string;
  rows_affected?: number;

  // Result
  success?: boolean;
  error?: string;

  // Resource usage
  memory_mb?: number;
  cpu_percent?: number;

  // Additional
  metadata?: Record<string, unknown>;
}

export class PerformanceMonitor {
  private db: DatabaseManager | null = null;
  private config: MonitoringConfig;
  private metricsBuffer: MetricData[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  /**
   * Set database instance for persistence
   */
  setDatabase(db: DatabaseManager): void {
    this.db = db;
  }

  /**
   * Start automatic flushing
   */
  startBatchWrites(): void {
    if (this.flushTimer) {
      return; // Already started
    }

    const intervalMs = this.config.batchWriteIntervalSeconds * 1000;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, intervalMs);
  }

  /**
   * Stop automatic flushing
   */
  stopBatchWrites(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Track an async operation with automatic timing
   */
  async track<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Partial<MetricData>
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    try {
      const result = await fn();
      const duration = Math.round(performance.now() - startTime);

      // Record metric
      await this.record({
        operation,
        duration_ms: duration,
        memory_mb: this.getMemoryUsage() - startMemory,
        success: true,
        ...context,
      });

      // Log if slow
      if (duration > this.config.slowOperationThresholdMs) {
        logger.warn(`Slow operation detected: ${operation}`, {
          duration,
          threshold: this.config.slowOperationThresholdMs,
          ...context,
        });
      }

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);

      await this.record({
        operation,
        duration_ms: duration,
        memory_mb: this.getMemoryUsage() - startMemory,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ...context,
      });

      throw error;
    }
  }

  /**
   * Record a metric (buffered, flushed periodically)
   */
  async record(metric: MetricData): Promise<void> {
    // Add to buffer
    this.metricsBuffer.push({
      ...metric,
      cpu_percent: metric.cpu_percent ?? this.getCPUPercent(),
    });

    // If buffer is large, flush immediately
    if (this.metricsBuffer.length >= 100) {
      await this.flush();
    }
  }

  /**
   * Convert metric to database row values
   */
  private metricToRow(metric: MetricData): (string | number | null)[] {
    return [
      Math.floor(Date.now() / 1000),
      metric.operation,
      metric.duration_ms,
      metric.conversation_id ?? null,
      metric.session_id ?? null,
      metric.provider ?? null,
      metric.model ?? null,
      metric.input_tokens ?? null,
      metric.output_tokens ?? null,
      metric.total_tokens ?? null,
      metric.cost ?? null,
      metric.tool_name ?? null,
      metric.tool_args ? JSON.stringify(metric.tool_args) : null,
      metric.tool_result_size ?? null,
      metric.query_type ?? null,
      metric.table_name ?? null,
      metric.rows_affected ?? null,
      metric.success ? 1 : 0,
      metric.error ?? null,
      metric.memory_mb ?? null,
      metric.cpu_percent ?? null,
      metric.metadata ? JSON.stringify(metric.metadata) : null,
    ];
  }

  /**
   * Flush metrics buffer to database
   */
  async flush(): Promise<void> {
    if (this.metricsBuffer.length === 0 || !this.db) {
      return;
    }

    try {
      const metrics = [...this.metricsBuffer];
      this.metricsBuffer = [];

      const insertSql = `INSERT INTO metrics (
        timestamp, operation, duration_ms,
        conversation_id, session_id,
        provider, model, input_tokens, output_tokens, total_tokens, cost,
        tool_name, tool_args, tool_result_size,
        query_type, table_name, rows_affected,
        success, error,
        memory_mb, cpu_percent,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      // Batch insert
      this.db.transaction(() => {
        for (const metric of metrics) {
          this.db!.execute(insertSql, this.metricToRow(metric));
        }
      });

      logger.debug(`Flushed ${metrics.length} metrics to database`);
    } catch (error) {
      logger.error('Failed to flush metrics', { error });
      // Re-add failed metrics to buffer
      this.metricsBuffer.unshift(...this.metricsBuffer);
    }
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
  }

  /**
   * Get CPU usage percentage (simple approximation)
   */
  private getCPUPercent(): number {
    // This is a simplified approach
    // For production, consider using 'pidusage' package for accurate CPU tracking
    const cpuUsage = process.cpuUsage();
    return Math.round((cpuUsage.user + cpuUsage.system) / 10000) / 100;
  }

  /**
   * Clean up old metrics based on retention policy
   */
  async cleanupOldMetrics(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    try {
      const cutoffTimestamp = Math.floor(
        Date.now() / 1000 - this.config.metricsRetentionDays * 24 * 60 * 60
      );

      const result = this.db.execute('DELETE FROM metrics WHERE timestamp < ?', [cutoffTimestamp]);

      if (result.changes > 0) {
        logger.info(`Cleaned up ${result.changes} old metrics`, {
          retentionDays: this.config.metricsRetentionDays,
        });
      }

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup old metrics', { error });
      return 0;
    }
  }

  /**
   * Get metrics statistics
   */
  async getStats(since?: Date): Promise<{
    totalOperations: number;
    avgDuration: number;
    totalCost: number;
    successRate: number;
  }> {
    if (!this.db) {
      return {
        totalOperations: 0,
        avgDuration: 0,
        totalCost: 0,
        successRate: 0,
      };
    }

    const sinceTimestamp = since ? Math.floor(since.getTime() / 1000) : 0;

    const stats = this.db.queryOne<{
      total: number;
      avg_duration: number;
      total_cost: number;
      success_count: number;
    }>(
      `SELECT
        COUNT(*) as total,
        AVG(duration_ms) as avg_duration,
        SUM(COALESCE(cost, 0)) as total_cost,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
      FROM metrics
      WHERE timestamp >= ?`,
      [sinceTimestamp]
    );

    if (!stats) {
      return {
        totalOperations: 0,
        avgDuration: 0,
        totalCost: 0,
        successRate: 0,
      };
    }

    return {
      totalOperations: stats.total,
      avgDuration: Math.round(stats.avg_duration),
      totalCost: Math.round(stats.total_cost * 100) / 100,
      successRate:
        stats.total > 0 ? Math.round((stats.success_count / stats.total) * 100) / 100 : 0,
    };
  }
}

// Singleton instance
let monitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(config: MonitoringConfig): PerformanceMonitor {
  if (!monitor) {
    monitor = new PerformanceMonitor(config);
  }
  return monitor;
}
