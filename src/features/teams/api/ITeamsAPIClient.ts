/**
 * Teams API client interface.
 *
 * Local mode: Not used (null)
 * Teams mode: Initialized with auth manager
 *
 * This is a subset of the full Teams API contract needed by the CLI.
 * The actual implementation will use the generated client from @codedir/mimir-teams-contracts.
 */

import type { ConfigResponse } from '@codedir/mimir-teams-contracts';

/**
 * Provider registry response from Teams API
 *
 * TODO (mimir-teams): Define in @codedir/mimir-teams-contracts
 */
export interface ProviderRegistryResponse {
  providers: unknown[]; // TODO (mimir-teams): Use ProviderDefinition[] from mimir-agents
  policy?: {
    allowedProviders?: string[];
    blockedProviders?: string[];
    allowedModels?: Record<string, string[]>;
    blockedModels?: Record<string, string[]>;
  };
  ttl?: number; // Cache TTL in seconds
}

/**
 * Teams API client interface.
 * Minimal subset needed by ConfigManager and other core components.
 */
export interface ITeamsAPIClient {
  config: {
    get(orgSlug: string, teamId?: string): Promise<ConfigResponse>;
  };

  /**
   * Provider registry endpoint
   *
   * TODO (mimir-teams): Implement in backend API
   * TODO (mimir-teams): Add to @codedir/mimir-teams-contracts
   */
  registry?: {
    getProviders(orgSlug: string, teamId?: string): Promise<ProviderRegistryResponse>;
  };

  // Additional endpoints will be added as needed in future phases
}
