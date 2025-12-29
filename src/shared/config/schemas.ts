/**
 * Configuration schemas with Zod validation
 */

import { z } from 'zod';

// Theme options matching Claude Code + Mimir Nordic theme
export const ThemeSchema = z.enum([
  'mimir',
  'tokyo-night',
  'dracula',
  'catppuccin-mocha',
  'catppuccin-latte',
  'gruvbox-dark',
  'gruvbox-light',
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

/**
 * LLM Configuration
 *
 * Simplified config with dynamic provider support.
 * API keys resolved automatically: env → keychain → encrypted file
 */
export const LLMConfigSchema = z.object({
  provider: z.string().default('deepseek'), // Dynamic - any provider from registry
  model: z.string().optional(), // If not specified, use default from registry
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().optional(), // Use model's maxOutput if not specified
  baseURL: z.string().optional(), // Override for openai-compatible providers
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
// Also accepts "none" to disable a keybind
// Supports <leader> placeholder (e.g., "<leader>n", "ctrl+c", ["<leader>q", "escape"])
// Format: all lowercase (ctrl+c, shift+tab, enter, escape, arrowup)
const shortcutSchema = z.union([z.string(), z.array(z.string())]).transform((val) => {
  if (val === 'none') return [];
  if (Array.isArray(val)) return val.length === 0 ? [] : val;
  return [val];
});

export const KeyBindingsConfigSchema = z.object({
  // Leader key - prefix for all keybinds (optional)
  // When enabled, users press leader key first, then the action key
  // Example: ctrl+x (leader) followed by 'n' (new session)
  leader: z
    .union([z.string(), z.literal('none'), z.null()])
    .default('none')
    .transform((val) => (val === 'none' || val === null ? null : val)),

  // Leader key timeout in milliseconds
  // How long to wait for the action key after pressing leader
  leaderTimeout: z.number().min(100).max(5000).default(1000),

  // Enable/disable all keybinds globally
  enabled: z.boolean().default(true),

  // Core actions - ctrl+c and escape share the same 'interrupt' logic
  interrupt: shortcutSchema.default(['ctrl+c', 'escape']),
  accept: shortcutSchema.default(['enter']),

  // Mode and navigation
  modeSwitch: shortcutSchema.default(['shift+tab']),
  editCommand: shortcutSchema.default(['ctrl+e']),

  // Autocomplete/tooltips
  showTooltip: shortcutSchema.default(['tab']),
  navigateUp: shortcutSchema.default(['arrowup']),
  navigateDown: shortcutSchema.default(['arrowdown']),

  // Attachment navigation (use modifiers to avoid hijacking text editing keys)
  navigateLeft: shortcutSchema.default(['alt+arrowleft']),
  navigateRight: shortcutSchema.default(['alt+arrowright']),
  removeAttachment: shortcutSchema.default(['alt+backspace']),
  pasteFromClipboard: shortcutSchema.default(['ctrl+v']),

  // Utility
  help: shortcutSchema.default('none'), // Disabled - blocks typing '?'
  clearScreen: shortcutSchema.default(['ctrl+l']),
  undo: shortcutSchema.default(['ctrl+z']),
  redo: shortcutSchema.default(['ctrl+y']), // Auto-converted to cmd+shift+z on Mac

  // Session management - disabled by default (blocks typing n, l, r)
  // Enable leader key and use leader+n/l/r instead
  newSession: shortcutSchema.default('none'),
  listSessions: shortcutSchema.default('none'),
  resumeSession: shortcutSchema.default('none'),

  // Text editing actions - handled natively by custom TextInput component
  // Set to 'none' so KeyboardEventBus doesn't intercept these keys
  // Users can still override in config if they want custom behavior
  cursorToLineStart: shortcutSchema.default('none'), // TextInput: Home, Ctrl+A
  cursorToLineEnd: shortcutSchema.default('none'), // TextInput: End, Ctrl+E
  cursorWordLeft: shortcutSchema.default('none'), // TextInput: Ctrl+Left, Alt+Left
  cursorWordRight: shortcutSchema.default('none'), // TextInput: Ctrl+Right, Alt+Right
  deleteWordLeft: shortcutSchema.default('none'), // TextInput: Ctrl+W, Ctrl+Backspace
  deleteWordRight: shortcutSchema.default('none'), // TextInput: Ctrl+Delete
  deleteToLineEnd: shortcutSchema.default('none'), // TextInput: Ctrl+K
  deleteToLineStart: shortcutSchema.default('none'), // TextInput: Ctrl+U
  deleteEntireLine: shortcutSchema.default('none'), // Not commonly used
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

/**
 * Paste Handling Configuration
 *
 * Controls how pasted content (text and images) is handled in the chat interface.
 * Large pastes (>500 chars or >10 lines) are converted to attachments.
 */
export const PasteConfigSchema = z.object({
  // Enable paste handling
  enabled: z.boolean().default(true),

  // Enable bracketed paste mode for terminal-native paste detection
  bracketedPasteMode: z.boolean().default(true),

  // Thresholds for converting paste to attachment
  textThreshold: z.object({
    minChars: z.number().min(0).default(500),
    minLines: z.number().min(0).default(10),
  }),

  // Enable image paste from clipboard
  imageSupport: z.boolean().default(true),

  // Maximum number of attachments per message
  maxAttachments: z.number().min(1).default(10),
});

/**
 * Agent Model Overrides
 *
 * Per-agent model configuration. Each agent can use different provider/model.
 * Falls back to main LLM config if not specified.
 */
export const AgentModelOverridesSchema = z
  .object({
    finder: LLMConfigSchema.partial().optional(),
    oracle: LLMConfigSchema.partial().optional(),
    librarian: LLMConfigSchema.partial().optional(),
    refactoring: LLMConfigSchema.partial().optional(),
    reviewer: LLMConfigSchema.partial().optional(),
    tester: LLMConfigSchema.partial().optional(),
    rush: LLMConfigSchema.partial().optional(),
  })
  .optional();

/**
 * Auto-Switch Configuration
 *
 * Smart model switching based on task complexity and requirements.
 */
export const AutoSwitchConfigSchema = z.object({
  enabled: z.boolean().default(false),
  promptBeforeSwitch: z.boolean().default(true),
  preferQualityOverCost: z.boolean().default(true),
  maxCostTier: z.number().min(1).max(4).default(3), // 1=$, 2=$$, 3=$$$, 4=$$$$
});

/**
 * Main Configuration Schema
 */
export const ConfigSchema = z.object({
  llm: LLMConfigSchema,
  agentModels: AgentModelOverridesSchema,
  autoSwitch: AutoSwitchConfigSchema.default({
    enabled: false,
    promptBeforeSwitch: true,
    preferQualityOverCost: true,
    maxCostTier: 3,
  }),
  permissions: PermissionsConfigSchema,
  keyBindings: KeyBindingsConfigSchema,
  docker: DockerConfigSchema,
  ui: UIConfigSchema,
  monitoring: MonitoringConfigSchema,
  budget: BudgetConfigSchema,
  rateLimit: RateLimitConfigSchema,
  paste: PasteConfigSchema.default({
    enabled: true,
    bracketedPasteMode: true,
    textThreshold: {
      minChars: 500,
      minLines: 10,
    },
    imageSupport: true,
    maxAttachments: 10,
  }),
});

// Type exports
export type Theme = z.infer<typeof ThemeSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
export type KeyBindingsConfig = z.infer<typeof KeyBindingsConfigSchema>;
export type DockerConfig = z.infer<typeof DockerConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type PasteConfig = z.infer<typeof PasteConfigSchema>;
export type AgentModelOverrides = z.infer<typeof AgentModelOverridesSchema>;
export type AutoSwitchConfig = z.infer<typeof AutoSwitchConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
