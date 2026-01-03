/**
 * Dynamic Provider Registry - Teams Integration
 *
 * TODO (mimir-teams): Implement this when Mimir Teams backend is ready.
 *
 * This module will fetch provider/model registry from Teams API and merge with base registry.
 * Teams can enforce allowed/blocked providers and models at organization level.
 *
 * Features to implement:
 * - Fetch registry from Teams API endpoint
 * - TTL-based caching (default 5 minutes)
 * - Merge with base PROVIDER_REGISTRY
 * - Filter providers/models by Teams policy (allow/block lists)
 * - Cache invalidation on Teams policy updates
 */

import {
  getAllProviders,
  getProvider,
  type ProviderDefinition,
  // type ModelDefinition, // TODO (mimir-teams): Will be used for policy filtering
} from '@codedir/mimir-agents';

/**
 * Teams registry response (future API contract)
 *
 * TODO (mimir-teams): Define actual API contract with backend team
 */
export interface TeamsRegistryResponse {
  providers: ProviderDefinition[];
  policy?: {
    allowedProviders?: string[];
    blockedProviders?: string[];
    allowedModels?: Record<string, string[]>; // provider -> model IDs
    blockedModels?: Record<string, string[]>;
  };
  ttl?: number; // Cache TTL in seconds
}

/**
 * Dynamic registry cache entry
 * TODO (mimir-teams): Enable when caching is implemented
 */
// interface CacheEntry {
//   data: TeamsRegistryResponse;
//   expiresAt: number;
// }

/**
 * Dynamic Provider Registry with Teams integration
 *
 * Currently a no-op that returns the base registry.
 * Will be implemented when Mimir Teams is ready.
 */
export class DynamicProviderRegistry {
  // TODO (mimir-teams): Enable caching when Teams integration is implemented
  // private cache: CacheEntry | null = null;
  // private defaultTTL = 300; // 5 minutes in seconds
  // private teamsApiUrl?: string;

  // TODO (mimir-teams): Accept teamsApiUrl parameter when Teams integration is implemented
  constructor(_teamsApiUrl?: string) {
    // Store for future use
    // this.teamsApiUrl = _teamsApiUrl;
    void _teamsApiUrl; // Suppress unused parameter warning
  }

  /**
   * Get providers with Teams policy applied
   *
   * TODO (mimir-teams): Implement Teams API integration
   * - Fetch from teamsApiUrl/registry endpoint
   * - Apply TTL caching
   * - Merge with base registry
   * - Filter by policy
   */
  async getProviders(): Promise<ProviderDefinition[]> {
    // TODO (mimir-teams): Check cache first
    // if (this.cache && this.cache.expiresAt > Date.now()) {
    //   return this.applyPolicy(this.cache.data);
    // }

    // TODO (mimir-teams): Fetch from Teams API if URL configured
    // if (this.teamsApiUrl) {
    //   const response = await this.fetchFromTeams();
    //   this.cache = {
    //     data: response,
    //     expiresAt: Date.now() + (response.ttl || this.defaultTTL) * 1000,
    //   };
    //   return this.applyPolicy(response);
    // }

    // For now, return base registry
    return getAllProviders();
  }

  /**
   * Get single provider with Teams policy applied
   *
   * TODO (mimir-teams): Check if provider is allowed by Teams
   */
  async getProvider(providerId: string): Promise<ProviderDefinition | undefined> {
    // TODO (mimir-teams): Check Teams policy
    // const providers = await this.getProviders();
    // return providers.find(p => p.id === providerId);

    // For now, return from base registry
    return getProvider(providerId);
  }

  /**
   * Invalidate cache (force refresh on next request)
   *
   * TODO (mimir-teams): Implement cache invalidation
   * - Clear local cache
   * - Optionally trigger webhook from Teams API on policy updates
   */
  invalidateCache(): void {
    // TODO (mimir-teams): Implement when caching is enabled
    // this.cache = null;
  }

  // TODO (mimir-teams): Uncomment when implementing Teams integration
  /**
   * Fetch registry from Teams API
   *
   * TODO (mimir-teams): Implement HTTP client
   * @private
   */
  // private async _fetchFromTeams(): Promise<TeamsRegistryResponse> {
  //   const response = await fetch(`${this._teamsApiUrl}/api/registry`, {
  //     headers: {
  //       Authorization: `Bearer ${this._getTeamsToken()}`,
  //     },
  //   });
  //   return response.json();
  // }

  /**
   * Apply Teams policy to filter providers/models
   *
   * TODO (mimir-teams): Implement policy filtering
   * @private
   */
  // private _applyPolicy(response: TeamsRegistryResponse): ProviderDefinition[] {
  //   // Filter out blocked providers
  //   // Filter out blocked models from allowed providers
  //   // Return only allowed providers if allowlist exists
  //   return response.providers;
  // }

  /**
   * Get Teams authentication token
   *
   * TODO (mimir-teams): Implement token management
   * @private
   */
  // private _getTeamsToken(): string {
  //   // Get token from credentials manager or Teams auth flow
  //   throw new Error('Teams authentication not implemented');
  // }
}
