/**
 * Configuration source interface for mimir-agents package
 *
 * This is a simplified version focusing on enforcement fields
 * needed by the permission and security systems.
 */

/**
 * Enforcement configuration from Teams/Enterprise backend
 */
export interface EnforcementConfig {
  /** Allowed LLM models (e.g., ['claude-sonnet-4.5', 'gpt-4']) */
  allowedModels?: string[];

  /** Blocked LLM models */
  blockedModels?: string[];

  /** Allowed LLM providers (e.g., ['anthropic', 'openai']) */
  allowedProviders?: string[];

  /** Global command allowlist patterns (e.g., ['git status', 'npm install']) */
  globalAllowlist?: string[];

  /** Global command blocklist patterns (e.g., ['rm -rf /', 'format *']) */
  globalBlocklist?: string[];

  /** Allowed tools (e.g., ['read_file', 'write_file', 'grep']) */
  allowedTools?: string[];

  /** Blocked tools */
  blockedTools?: string[];
}

/**
 * Permissions configuration
 */
export interface PermissionsConfig {
  /** Automatically accept commands up to this risk level */
  autoAccept?: boolean;

  /** Accept commands up to this risk level ('low' | 'medium' | 'high' | 'critical') */
  acceptRiskLevel?: 'low' | 'medium' | 'high' | 'critical';

  /** Always accept these specific commands (user's local allowlist) */
  alwaysAcceptCommands?: string[];
}

/**
 * Agent configuration (subset needed by mimir-agents)
 */
export interface AgentConfig {
  /** Enforcement configuration (from Teams/Enterprise) */
  enforcement?: EnforcementConfig;

  /** Permissions configuration (local + Teams) */
  permissions?: PermissionsConfig;
}

/**
 * Configuration source interface
 *
 * Implementations:
 * - DefaultConfigSource (mimir-agents built-in defaults)
 * - ConfigSourceAdapter (wraps Mimir CLI config)
 */
export interface IConfigSource {
  /**
   * Human-readable name for debugging
   */
  name: string;

  /**
   * Get current configuration
   */
  getConfig(): Promise<AgentConfig>;

  /**
   * Check if a specific model is allowed
   */
  isModelAllowed(model: string): Promise<boolean>;

  /**
   * Check if a specific provider is allowed
   */
  isProviderAllowed(provider: string): Promise<boolean>;

  /**
   * Check if a specific tool is allowed
   */
  isToolAllowed(toolName: string): Promise<boolean>;

  /**
   * Get global allowlist patterns
   */
  getAllowlist(): Promise<string[]>;

  /**
   * Get global blocklist patterns
   */
  getBlocklist(): Promise<string[]>;
}
