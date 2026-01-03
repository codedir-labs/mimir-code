/**
 * ContextManager - Intelligent context management for multi-agent workflows
 *
 * Inspired by Claude Code's context management practices:
 * - Auto-compaction at threshold (default 95%)
 * - Relevance-based message scoring
 * - Multi-scale context management (agent, loop, workflow)
 * - Model-specific token limits
 */

import type { WorkflowContext } from '../core/roles/types.js';

/**
 * Model context limits (tokens)
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4.5': 200_000,
  'claude-sonnet-4.5': 200_000,
  'claude-haiku-4.5': 200_000,
  o3: 128_000,
  'o3-mini': 128_000,
  'gpt-4.5': 128_000,
  'gpt-4.5-turbo': 128_000,
  'deepseek-chat': 64_000,
  'deepseek-coder': 64_000,
  'qwen-2.5-coder': 32_000,
  default: 128_000,
};

/**
 * Context threshold levels
 */
export enum ThresholdLevel {
  Normal = 'normal', // < 75% - no action needed
  Approaching = 'approaching', // 75-90% - proactive background compaction
  Warning = 'warning', // 90-95% - immediate compaction before continuing
  Critical = 'critical', // >= 95% - stop adding to context, force compaction
}

/**
 * Context threshold configuration
 */
export interface ThresholdConfig {
  /**
   * Approaching threshold (default 0.75)
   */
  approaching?: number;

  /**
   * Warning threshold (default 0.90)
   */
  warning?: number;

  /**
   * Critical threshold (default 0.95)
   */
  critical?: number;
}

/**
 * Context compaction options
 */
export interface CompactionOptions {
  /**
   * Threshold for auto-compaction (0-1, default 0.95)
   * @deprecated Use thresholds config instead
   */
  threshold?: number;

  /**
   * Threshold configuration
   */
  thresholds?: ThresholdConfig;

  /**
   * Enable background compaction
   */
  enableBackgroundCompaction?: boolean;

  /**
   * Custom focus instructions for compaction
   */
  focus?: string;

  /**
   * Whether to preserve tool results
   */
  preserveToolResults?: boolean;

  /**
   * Whether to preserve recent messages
   */
  preserveRecent?: number; // Number of recent messages to keep

  /**
   * Summarization strategy
   */
  strategy?: 'relevance' | 'recency' | 'hybrid';
}

/**
 * Message with relevance scoring
 */
export interface ScoredMessage {
  message: any; // Will be replaced with actual message type
  score: number; // 0-1 relevance score
  factors: {
    recency: number; // Time-based relevance
    toolUse: number; // Contains tool calls/results
    userInteraction: number; // User messages scored higher
    contextual: number; // Semantic relevance
  };
}

/**
 * Context statistics
 */
export interface ContextStats {
  totalTokens: number;
  maxTokens: number;
  utilization: number; // 0-1
  messageCount: number;
  toolCallCount: number;
  estimatedCost: number;
}

/**
 * Context scope
 */
export type ContextScope = 'agent' | 'loop' | 'workflow' | 'global';

/**
 * Context snapshot for a specific scope
 */
export interface ContextSnapshot {
  scope: ContextScope;
  scopeId: string;
  messages: any[];
  toolCalls: any[];
  tokens: number;
  timestamp: Date;
  summary?: string;
}

/**
 * Context monitoring event
 */
export interface ContextEvent {
  type: 'approaching' | 'warning' | 'critical' | 'compacted';
  level: ThresholdLevel;
  utilization: number;
  stats: ContextStats;
  timestamp: Date;
}

/**
 * Context event listener
 */
export type ContextEventListener = (event: ContextEvent) => void;

/**
 * Background compaction task
 */
interface BackgroundCompactionTask {
  scope: ContextScope;
  scopeId: string;
  messages: any[];
  priority: number; // Higher = more urgent
  queuedAt: Date;
}

/**
 * Intelligent context manager
 */
export class ContextManager {
  private snapshots: Map<string, ContextSnapshot> = new Map();
  private compactionHistory: Array<{
    timestamp: Date;
    scope: ContextScope;
    tokensBefor: number;
    tokensAfter: number;
    strategy: string;
  }> = [];
  private eventListeners: ContextEventListener[] = [];
  private backgroundQueue: BackgroundCompactionTask[] = [];
  private isCompacting = false;
  private thresholds: Required<ThresholdConfig>;

  constructor(
    private model: string,
    private options: CompactionOptions = {}
  ) {
    this.options = {
      threshold: 0.95, // Deprecated, use thresholds
      thresholds: {
        approaching: 0.75,
        warning: 0.9,
        critical: 0.95,
      },
      enableBackgroundCompaction: true,
      strategy: 'hybrid',
      preserveRecent: 5,
      preserveToolResults: true,
      ...options,
    };

    // Merge thresholds
    this.thresholds = {
      approaching: this.options.thresholds?.approaching || 0.75,
      warning: this.options.thresholds?.warning || 0.9,
      critical: this.options.thresholds?.critical || 0.95,
    };

    // Start background compaction worker if enabled
    if (this.options.enableBackgroundCompaction) {
      this.startBackgroundWorker();
    }
  }

  /**
   * Get model-specific context limit
   */
  getModelContextLimit(): number {
    return MODEL_CONTEXT_LIMITS[this.model] || MODEL_CONTEXT_LIMITS['default'] || 128_000;
  }

  /**
   * Calculate context statistics
   */
  calculateStats(messages: any[], systemPromptTokens: number = 0): ContextStats {
    const maxTokens = this.getModelContextLimit();
    const totalTokens = this.estimateTokens(messages) + systemPromptTokens;
    const utilization = totalTokens / maxTokens;

    const toolCallCount = messages.filter((m: any) => m.toolCalls || m.toolResults).length;

    // Rough cost estimation (will be model-specific)
    const estimatedCost = this.estimateCost(totalTokens);

    return {
      totalTokens,
      maxTokens,
      utilization,
      messageCount: messages.length,
      toolCallCount,
      estimatedCost,
    };
  }

  /**
   * Check if auto-compaction should trigger
   * @deprecated Use detectThreshold() instead
   */
  shouldCompact(stats: ContextStats): boolean {
    return stats.utilization >= this.options.threshold!;
  }

  /**
   * Detect threshold level for current utilization
   */
  detectThreshold(stats: ContextStats): ThresholdLevel {
    if (stats.utilization >= this.thresholds.critical) {
      return ThresholdLevel.Critical;
    }
    if (stats.utilization >= this.thresholds.warning) {
      return ThresholdLevel.Warning;
    }
    if (stats.utilization >= this.thresholds.approaching) {
      return ThresholdLevel.Approaching;
    }
    return ThresholdLevel.Normal;
  }

  /**
   * Check if agent should be blocked (critical threshold)
   */
  shouldBlockAgent(stats: ContextStats): boolean {
    return stats.utilization >= this.thresholds.critical;
  }

  /**
   * Monitor context and take action based on threshold
   * Call this before each agent action
   */
  async monitorAndAct(
    messages: any[],
    systemPromptTokens: number = 0
  ): Promise<{
    level: ThresholdLevel;
    blocked: boolean;
    compacted: boolean;
    stats: ContextStats;
  }> {
    const stats = this.calculateStats(messages, systemPromptTokens);
    const level = this.detectThreshold(stats);

    // Emit event
    this.emitEvent({
      type: level === ThresholdLevel.Normal ? 'approaching' : (level.toLowerCase() as any),
      level,
      utilization: stats.utilization,
      stats,
      timestamp: new Date(),
    });

    let blocked = false;
    let compacted = false;

    switch (level) {
      case ThresholdLevel.Critical:
        // BLOCK: Stop adding to context, force immediate compaction
        blocked = true;
        console.warn(
          `❌ CRITICAL threshold reached (${(stats.utilization * 100).toFixed(1)}%). Blocking agents until compaction completes.`
        );
        await this.forceCompaction(messages);
        compacted = true;
        break;

      case ThresholdLevel.Warning:
        // WARNING: Immediate compaction before continuing
        console.warn(
          `⚠️  WARNING threshold reached (${(stats.utilization * 100).toFixed(1)}%). Compacting immediately...`
        );
        await this.forceCompaction(messages);
        compacted = true;
        break;

      case ThresholdLevel.Approaching:
        // PROACTIVE: Queue background compaction (non-blocking)
        console.log(
          `ℹ️  Approaching threshold (${(stats.utilization * 100).toFixed(1)}%). Queueing background compaction...`
        );
        this.queueBackgroundCompaction('workflow', 'main', messages, 1);
        break;

      case ThresholdLevel.Normal:
        // Normal - no action needed
        break;
    }

    return { level, blocked, compacted, stats };
  }

  /**
   * Force immediate compaction (blocking)
   */
  async forceCompaction(messages: any[]): Promise<any[]> {
    if (this.isCompacting) {
      // Wait for current compaction to finish
      await this.waitForCompaction();
      return messages;
    }

    this.isCompacting = true;
    try {
      const result = await this.compact(messages, {
        focus: 'Critical: Preserve only essential context for current task',
        strategy: 'hybrid',
      });

      this.emitEvent({
        type: 'compacted',
        level: ThresholdLevel.Critical,
        utilization: this.calculateStats(result.compacted).utilization,
        stats: this.calculateStats(result.compacted),
        timestamp: new Date(),
      });

      console.log(`✅ Compaction complete. Saved ${result.tokensSaved} tokens.`);

      return result.compacted;
    } finally {
      this.isCompacting = false;
    }
  }

  /**
   * Queue background compaction (non-blocking)
   */
  queueBackgroundCompaction(
    scope: ContextScope,
    scopeId: string,
    messages: any[],
    priority: number = 1
  ): void {
    // Check if already queued
    const existing = this.backgroundQueue.find(
      (task) => task.scope === scope && task.scopeId === scopeId
    );

    if (existing) {
      // Update priority if higher
      if (priority > existing.priority) {
        existing.priority = priority;
        existing.messages = messages;
      }
      return;
    }

    // Add to queue
    this.backgroundQueue.push({
      scope,
      scopeId,
      messages,
      priority,
      queuedAt: new Date(),
    });

    // Sort by priority (higher first)
    this.backgroundQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Start background compaction worker
   */
  private startBackgroundWorker(): void {
    const processQueue = async () => {
      if (this.isCompacting || this.backgroundQueue.length === 0) {
        return;
      }

      // Get highest priority task
      const task = this.backgroundQueue.shift();
      if (!task) return;

      this.isCompacting = true;
      try {
        console.log(
          `[Background] Compacting ${task.scope}:${task.scopeId} (priority: ${task.priority})...`
        );

        const result = await this.compact(task.messages, {
          focus: `Background compaction for ${task.scope}`,
          strategy: 'hybrid',
        });

        console.log(`[Background] Compaction complete. Saved ${result.tokensSaved} tokens.`);

        // Update snapshot
        this.snapshots.set(this.getSnapshotKey(task.scope, task.scopeId), {
          scope: task.scope,
          scopeId: task.scopeId,
          messages: result.compacted,
          toolCalls: [],
          tokens: this.estimateTokens(result.compacted),
          timestamp: new Date(),
          summary: result.summary,
        });
      } catch (error) {
        console.error(`[Background] Compaction failed:`, error);
      } finally {
        this.isCompacting = false;
      }
    };

    // Process queue every 5 seconds
    setInterval(processQueue, 5000);
  }

  /**
   * Wait for current compaction to finish
   */
  private async waitForCompaction(): Promise<void> {
    while (this.isCompacting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Add event listener
   */
  on(listener: ContextEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  off(listener: ContextEventListener): void {
    this.eventListeners = this.eventListeners.filter((l) => l !== listener);
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: ContextEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Context event listener error:', error);
      }
    }
  }

  /**
   * Score messages by relevance
   */
  scoreMessages(
    messages: any[],
    currentTask?: string,
    workflowContext?: WorkflowContext
  ): ScoredMessage[] {
    const now = Date.now();
    const scoredMessages: ScoredMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const timestamp = message.timestamp ? new Date(message.timestamp).getTime() : now;

      // Recency factor (more recent = higher score)
      const ageMs = now - timestamp;
      const recency = Math.exp(-ageMs / (1000 * 60 * 60)); // Decay over 1 hour

      // Tool use factor
      const toolUse = message.toolCalls || message.toolResults ? 1.0 : 0.0;

      // User interaction factor
      const userInteraction = message.role === 'user' ? 1.0 : 0.0;

      // Contextual relevance (simplified - would use LLM in production)
      const contextual = this.calculateContextualRelevance(message, currentTask, workflowContext);

      // Weighted average
      const score = recency * 0.2 + toolUse * 0.3 + userInteraction * 0.2 + contextual * 0.3;

      scoredMessages.push({
        message,
        score,
        factors: {
          recency,
          toolUse,
          userInteraction,
          contextual,
        },
      });
    }

    return scoredMessages;
  }

  /**
   * Compact context (summarize old messages)
   */
  async compact(
    messages: any[],
    options: CompactionOptions = {}
  ): Promise<{ compacted: any[]; summary: string; tokensSaved: number }> {
    const opts = { ...this.options, ...options };
    const tokensBefore = this.estimateTokens(messages);

    // Preserve recent messages
    const preserveCount = opts.preserveRecent ?? 5;
    const recentMessages = messages.slice(-preserveCount);
    const oldMessages = messages.slice(0, -preserveCount);

    if (oldMessages.length === 0) {
      return {
        compacted: messages,
        summary: '',
        tokensSaved: 0,
      };
    }

    // Score old messages
    const scoredMessages = this.scoreMessages(oldMessages);

    // Determine which messages to keep vs. summarize
    const { keep, summarize } = this.partitionMessages(scoredMessages, opts.strategy!);

    // Generate summary of low-relevance messages
    const summary = await this.generateSummary(
      summarize.map((sm) => sm.message),
      opts.focus
    );

    // Build compacted message list
    const compacted = [
      ...keep.map((sm) => sm.message),
      {
        role: 'system',
        content: `[Context Summary]\n${summary}`,
        timestamp: new Date(),
        type: 'summary',
      },
      ...recentMessages,
    ];

    const tokensAfter = this.estimateTokens(compacted);
    const tokensSaved = tokensBefore - tokensAfter;

    // Record compaction
    this.compactionHistory.push({
      timestamp: new Date(),
      scope: 'workflow', // Will be parameterized
      tokensBefor: tokensBefore,
      tokensAfter,
      strategy: opts.strategy!,
    });

    return {
      compacted,
      summary,
      tokensSaved,
    };
  }

  /**
   * Partition messages into keep vs. summarize
   */
  private partitionMessages(
    scored: ScoredMessage[],
    strategy: 'relevance' | 'recency' | 'hybrid'
  ): { keep: ScoredMessage[]; summarize: ScoredMessage[] } {
    // Sort by score (descending)
    const sorted = [...scored].sort((a, b) => b.score - a.score);

    // Keep top 30% by relevance, summarize rest
    const keepThreshold = strategy === 'recency' ? 0.5 : 0.6;
    const splitIndex = Math.floor(sorted.length * keepThreshold);

    return {
      keep: sorted.slice(0, splitIndex),
      summarize: sorted.slice(splitIndex),
    };
  }

  /**
   * Generate summary of messages (uses LLM)
   */
  private async generateSummary(messages: any[], focus?: string): Promise<string> {
    // TODO: Call LLM to generate summary
    // For now, return a simple summary

    const messageTypes = new Map<string, number>();
    let toolCallCount = 0;

    for (const msg of messages) {
      const type = msg.type || msg.role || 'unknown';
      messageTypes.set(type, (messageTypes.get(type) || 0) + 1);

      if (msg.toolCalls || msg.toolResults) {
        toolCallCount++;
      }
    }

    const parts: string[] = [];
    parts.push(`Summarized ${messages.length} messages:`);

    for (const [type, count] of messageTypes.entries()) {
      parts.push(`- ${count} ${type} messages`);
    }

    if (toolCallCount > 0) {
      parts.push(`- ${toolCallCount} tool calls/results`);
    }

    if (focus) {
      parts.push(`\nFocus: ${focus}`);
    }

    return parts.join('\n');
  }

  /**
   * Calculate contextual relevance (simplified)
   */
  private calculateContextualRelevance(
    message: any,
    currentTask?: string,
    workflowContext?: WorkflowContext
  ): number {
    if (!currentTask && !workflowContext) {
      return 0.5; // Neutral
    }

    let relevance = 0.5;

    // Check if message content relates to current task
    if (currentTask && message.content) {
      const content = message.content.toLowerCase();
      const taskLower = currentTask.toLowerCase();

      // Simple keyword matching (would use embeddings in production)
      const keywords = taskLower.split(/\s+/).filter((w) => w.length > 3);
      const matches = keywords.filter((k) => content.includes(k)).length;
      relevance += (matches / keywords.length) * 0.3;
    }

    // Check if message relates to workflow context
    if (workflowContext) {
      // Check if mentions modified files
      if (message.content && workflowContext.sharedState.filesModified) {
        for (const file of workflowContext.sharedState.filesModified) {
          if (message.content.includes(file)) {
            relevance += 0.2;
            break;
          }
        }
      }

      // Check if relates to quality gates
      if (message.content) {
        const content = message.content.toLowerCase();
        if (content.includes('test') && !workflowContext.qualityGates.testsPass) {
          relevance += 0.2;
        }
        if (content.includes('security') && !workflowContext.qualityGates.securityApproved) {
          relevance += 0.2;
        }
      }
    }

    return Math.min(1.0, relevance);
  }

  /**
   * Create context snapshot for a scope
   */
  createSnapshot(
    scope: ContextScope,
    scopeId: string,
    messages: any[],
    toolCalls: any[] = []
  ): ContextSnapshot {
    const snapshot: ContextSnapshot = {
      scope,
      scopeId,
      messages: [...messages],
      toolCalls: [...toolCalls],
      tokens: this.estimateTokens(messages),
      timestamp: new Date(),
    };

    this.snapshots.set(this.getSnapshotKey(scope, scopeId), snapshot);

    return snapshot;
  }

  /**
   * Get context snapshot
   */
  getSnapshot(scope: ContextScope, scopeId: string): ContextSnapshot | undefined {
    return this.snapshots.get(this.getSnapshotKey(scope, scopeId));
  }

  /**
   * Restore from snapshot
   */
  restoreSnapshot(scope: ContextScope, scopeId: string): any[] | null {
    const snapshot = this.getSnapshot(scope, scopeId);
    return snapshot ? [...snapshot.messages] : null;
  }

  /**
   * Compact context for a specific agent/loop
   */
  async compactScope(
    scope: ContextScope,
    scopeId: string,
    messages: any[],
    options?: CompactionOptions
  ): Promise<any[]> {
    const result = await this.compact(messages, options);

    // Update snapshot
    this.snapshots.set(this.getSnapshotKey(scope, scopeId), {
      scope,
      scopeId,
      messages: result.compacted,
      toolCalls: [],
      tokens: this.estimateTokens(result.compacted),
      timestamp: new Date(),
      summary: result.summary,
    });

    return result.compacted;
  }

  /**
   * Multi-scale context management
   *
   * Handles context at different scales:
   * - Agent: Individual agent's conversation
   * - Loop: Iterative loop context
   * - Workflow: Overall workflow context
   * - Global: Cross-workflow context
   */
  async manageMultiScale(
    agentMessages: Map<string, any[]>,
    loopMessages: Map<string, any[]>,
    workflowMessages: any[],
    _workflowContext: WorkflowContext
  ): Promise<{
    agentMessages: Map<string, any[]>;
    loopMessages: Map<string, any[]>;
    workflowMessages: any[];
    compactionsPerformed: number;
  }> {
    let compactionsPerformed = 0;

    // 1. Compact individual agent contexts if needed
    for (const [agentId, messages] of agentMessages.entries()) {
      const stats = this.calculateStats(messages);
      if (this.shouldCompact(stats)) {
        const compacted = await this.compactScope('agent', agentId, messages);
        agentMessages.set(agentId, compacted);
        compactionsPerformed++;
      }
    }

    // 2. Compact loop contexts if needed
    for (const [loopId, messages] of loopMessages.entries()) {
      const stats = this.calculateStats(messages);
      if (this.shouldCompact(stats)) {
        const compacted = await this.compactScope('loop', loopId, messages);
        loopMessages.set(loopId, compacted);
        compactionsPerformed++;
      }
    }

    // 3. Compact workflow context if needed
    const workflowStats = this.calculateStats(workflowMessages);
    if (this.shouldCompact(workflowStats)) {
      const result = await this.compact(workflowMessages, {
        focus: 'Workflow progress, quality gates, and key decisions',
      });
      workflowMessages = result.compacted;
      compactionsPerformed++;
    }

    return {
      agentMessages,
      loopMessages,
      workflowMessages,
      compactionsPerformed,
    };
  }

  /**
   * Estimate token count (simplified)
   */
  private estimateTokens(messages: any[]): number {
    // Rough estimation: 1 token ≈ 4 characters
    let total = 0;
    for (const msg of messages) {
      if (msg.content) {
        total += Math.ceil(msg.content.length / 4);
      }
      if (msg.toolCalls) {
        total += JSON.stringify(msg.toolCalls).length / 4;
      }
    }
    return Math.ceil(total);
  }

  /**
   * Estimate cost (simplified)
   */
  private estimateCost(tokens: number): number {
    // Rough estimation: $15/1M tokens (average)
    return (tokens / 1_000_000) * 15;
  }

  /**
   * Get snapshot key
   */
  private getSnapshotKey(scope: ContextScope, scopeId: string): string {
    return `${scope}:${scopeId}`;
  }

  /**
   * Get compaction history
   */
  getCompactionHistory(): typeof this.compactionHistory {
    return [...this.compactionHistory];
  }

  /**
   * Clear snapshots
   */
  clearSnapshots(scope?: ContextScope): void {
    if (scope) {
      for (const key of this.snapshots.keys()) {
        if (key.startsWith(`${scope}:`)) {
          this.snapshots.delete(key);
        }
      }
    } else {
      this.snapshots.clear();
    }
  }

  /**
   * Get statistics summary
   */
  getStatsSummary(): {
    totalSnapshots: number;
    compactionsPerformed: number;
    totalTokensSaved: number;
  } {
    const totalTokensSaved = this.compactionHistory.reduce(
      (sum, c) => sum + (c.tokensBefor - c.tokensAfter),
      0
    );

    return {
      totalSnapshots: this.snapshots.size,
      compactionsPerformed: this.compactionHistory.length,
      totalTokensSaved,
    };
  }
}
