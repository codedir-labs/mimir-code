/**
 * Configuration schemas with Zod validation
 */

import { z } from 'zod';

// Theme options matching Claude Code + Mimir Nordic theme
export const ThemeSchema = z.enum([
  'mimir',
  'dark',
  'light',
  'dark-colorblind',
  'light-colorblind',
  'dark-ansi',
  'light-ansi',
]);

export const UIConfigSchema = z.object({
  theme: ThemeSchema.default('mimir'),
  syntaxHighlighting: z.boolean().default(true),
  showLineNumbers: z.boolean().default(true),
  compactMode: z.boolean().default(false),
  // Autocomplete behavior
  autocompleteAutoShow: z.boolean().default(true), // Automatically show autocomplete when suggestions available
  autocompleteExecuteOnSelect: z.boolean().default(true), // Execute command immediately if no more parameters needed
});

export const LLMConfigSchema = z.object({
  provider: z.enum(['deepseek', 'anthropic', 'openai', 'google', 'gemini', 'qwen', 'ollama']),
  model: z.string(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().default(4096),
});

export const PermissionsConfigSchema = z.object({
  autoAccept: z.boolean().default(false),
  acceptRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  alwaysAcceptCommands: z
    .array(z.string())
    .nullable()
    .default([])
    .transform((val) => val ?? []),
});

// Helper to accept string or array of strings for shortcuts
const shortcutSchema = z
  .union([z.string(), z.array(z.string()).min(1)])
  .transform((val) => (Array.isArray(val) ? val : [val]));

export const KeyBindingsConfigSchema = z.object({
  // Core actions - Ctrl+C and Escape share the same 'interrupt' logic
  interrupt: shortcutSchema.default(['Ctrl+C', 'Escape']),
  accept: shortcutSchema.default(['Enter']),

  // Mode and navigation
  modeSwitch: shortcutSchema.default(['Shift+Tab']),
  editCommand: shortcutSchema.default(['Ctrl+E']),

  // Autocomplete/tooltips
  showTooltip: shortcutSchema.default(['Ctrl+Space', 'Tab']),
  navigateUp: shortcutSchema.default(['ArrowUp']),
  navigateDown: shortcutSchema.default(['ArrowDown']),

  // Utility
  help: shortcutSchema.default(['?']),
  clearScreen: shortcutSchema.default(['Ctrl+L']),
  undo: shortcutSchema.default(['Ctrl+Z']),
  redo: shortcutSchema.default(['Ctrl+Y']), // Auto-converted to Cmd+Shift+Z on Mac

  // Legacy/deprecated - kept for backwards compatibility
  reject: shortcutSchema.default([]).optional(),
});

export const DockerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  baseImage: z.string().default('alpine:latest'),
  cpuLimit: z.number().optional(),
  memoryLimit: z.string().optional(),
});

export const MonitoringConfigSchema = z.object({
  metricsRetentionDays: z.number().min(1).max(365).default(90),
  enableHealthChecks: z.boolean().default(true),
  healthCheckIntervalSeconds: z.number().min(10).max(3600).default(300),
  slowOperationThresholdMs: z.number().min(100).default(5000),
  batchWriteIntervalSeconds: z.number().min(1).max(60).default(10),
});

export const BudgetConfigSchema = z.object({
  enabled: z.boolean().default(false),
  dailyLimit: z.number().min(0).optional(), // USD
  weeklyLimit: z.number().min(0).optional(),
  monthlyLimit: z.number().min(0).optional(),
  warningThreshold: z.number().min(0).max(1).default(0.8), // 80%
});

export const RateLimitConfigSchema = z.object({
  enabled: z.boolean().default(true),
  commandsPerMinute: z.number().min(1).default(60),
  toolExecutionsPerMinute: z.number().min(1).default(30),
  llmCallsPerMinute: z.number().min(1).default(20),
  maxFileSizeMB: z.number().min(1).default(100),
});

export const ConfigSchema = z.object({
  llm: LLMConfigSchema,
  permissions: PermissionsConfigSchema,
  keyBindings: KeyBindingsConfigSchema,
  docker: DockerConfigSchema,
  ui: UIConfigSchema,
  monitoring: MonitoringConfigSchema,
  budget: BudgetConfigSchema,
  rateLimit: RateLimitConfigSchema,
});

export type Theme = z.infer<typeof ThemeSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
export type KeyBindingsConfig = z.infer<typeof KeyBindingsConfigSchema>;
export type DockerConfig = z.infer<typeof DockerConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
