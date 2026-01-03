/**
 * Drizzle ORM schema definition for Mimir
 * Replaces schema.sql with type-safe migrations and queries
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Migrations table to track schema versions
export const migrations = sqliteTable('migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  version: text('version').notNull().unique(),
  appliedAt: integer('applied_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
});

// Conversations table
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    totalTokens: integer('total_tokens').default(0),
    totalCost: real('total_cost').default(0.0),
    provider: text('provider'),
    model: text('model'),
    status: text('status', { enum: ['active', 'archived', 'deleted'] }).default('active'),
  },
  (table) => ({
    createdAtIdx: index('idx_conversations_created_at').on(table.createdAt),
    statusIdx: index('idx_conversations_status').on(table.status),
  })
);

// Messages table
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['system', 'user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    cost: real('cost').default(0.0),
    metadata: text('metadata'), // JSON string
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
    timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
  })
);

// Tool calls table
export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
    toolName: text('tool_name').notNull(),
    arguments: text('arguments').notNull(), // JSON string
    result: text('result'), // JSON string
    status: text('status', { enum: ['pending', 'running', 'success', 'failed'] }).default(
      'pending'
    ),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    durationMs: integer('duration_ms'),
  },
  (table) => ({
    conversationIdIdx: index('idx_tool_calls_conversation_id').on(table.conversationId),
    statusIdx: index('idx_tool_calls_status').on(table.status),
    startedAtIdx: index('idx_tool_calls_started_at').on(table.startedAt),
  })
);

// Permissions audit trail table
export const permissions = sqliteTable(
  'permissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    command: text('command').notNull(),
    riskLevel: text('risk_level', { enum: ['low', 'medium', 'high', 'critical'] }).notNull(),
    decision: text('decision', { enum: ['allow', 'deny', 'always', 'never'] }).notNull(),
    userConfirmed: integer('user_confirmed', { mode: 'boolean' }).default(false),
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    context: text('context'), // JSON string
  },
  (table) => ({
    conversationIdIdx: index('idx_permissions_conversation_id').on(table.conversationId),
    timestampIdx: index('idx_permissions_timestamp').on(table.timestamp),
    decisionIdx: index('idx_permissions_decision').on(table.decision),
  })
);

// Checkpoints table (for undo/restore functionality)
export const checkpoints = sqliteTable(
  'checkpoints',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    description: text('description'),
    filesSnapshot: text('files_snapshot').notNull(), // JSON string
    gitDiff: text('git_diff'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    conversationIdIdx: index('idx_checkpoints_conversation_id').on(table.conversationId),
    createdAtIdx: index('idx_checkpoints_created_at').on(table.createdAt),
  })
);

// Cost tracking summary table (for analytics)
export const costSummary = sqliteTable(
  'cost_summary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD format
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    totalTokens: integer('total_tokens').default(0),
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    totalCost: real('total_cost').default(0.0),
    requestCount: integer('request_count').default(0),
  },
  (table) => ({
    dateIdx: index('idx_cost_summary_date').on(table.date),
    providerIdx: index('idx_cost_summary_provider').on(table.provider),
    uniqueIdx: uniqueIndex('unique_date_provider_model').on(
      table.date,
      table.provider,
      table.model
    ),
  })
);

// Session state table (for resuming interrupted sessions)
export const sessionState = sqliteTable(
  'session_state',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    agentState: text('agent_state').notNull(), // JSON string
    iteration: integer('iteration').default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    conversationIdIdx: index('idx_session_state_conversation_id').on(table.conversationId),
  })
);

// Metrics table for performance monitoring and analytics
export const metrics = sqliteTable(
  'metrics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    operation: text('operation').notNull(), // 'llm.chat', 'tool.execute', 'db.query'
    durationMs: integer('duration_ms').notNull(),

    // Context
    conversationId: text('conversation_id'),
    sessionId: text('session_id'),

    // LLM specific
    provider: text('provider'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    cost: real('cost'),

    // Tool specific
    toolName: text('tool_name'),
    toolArgs: text('tool_args'), // JSON
    toolResultSize: integer('tool_result_size'), // bytes

    // DB specific
    queryType: text('query_type'), // 'SELECT', 'INSERT', etc.
    tableName: text('table_name'),
    rowsAffected: integer('rows_affected'),

    // Result
    success: integer('success', { mode: 'boolean' }).default(true),
    error: text('error'),

    // Resource usage
    memoryMb: real('memory_mb'),
    cpuPercent: real('cpu_percent'),

    // Additional metadata
    metadata: text('metadata'), // JSON for extensibility
  },
  (table) => ({
    timestampIdx: index('idx_metrics_timestamp').on(table.timestamp),
    operationIdx: index('idx_metrics_operation').on(table.operation),
    conversationIdIdx: index('idx_metrics_conversation_id').on(table.conversationId),
    providerIdx: index('idx_metrics_provider').on(table.provider),
    successIdx: index('idx_metrics_success').on(table.success),
  })
);

// Pricing table for dynamic LLM cost calculation
export const pricing = sqliteTable(
  'pricing',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputPricePer1M: real('input_price_per_1m').notNull(), // USD per 1M input tokens
    outputPricePer1M: real('output_price_per_1m').notNull(), // USD per 1M output tokens
    effectiveFrom: integer('effective_from', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    effectiveUntil: integer('effective_until', { mode: 'timestamp' }), // NULL = current price
    currency: text('currency').default('USD'),
    notes: text('notes'),
  },
  (table) => ({
    providerModelIdx: index('idx_pricing_provider_model').on(table.provider, table.model),
    effectiveIdx: index('idx_pricing_effective').on(table.effectiveFrom),
    uniqueIdx: uniqueIndex('unique_provider_model_effective').on(
      table.provider,
      table.model,
      table.effectiveFrom
    ),
  })
);

// Type exports for use in the application
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type Checkpoint = typeof checkpoints.$inferSelect;
export type NewCheckpoint = typeof checkpoints.$inferInsert;
export type CostSummary = typeof costSummary.$inferSelect;
export type NewCostSummary = typeof costSummary.$inferInsert;
export type SessionState = typeof sessionState.$inferSelect;
export type NewSessionState = typeof sessionState.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type Pricing = typeof pricing.$inferSelect;
export type NewPricing = typeof pricing.$inferInsert;
