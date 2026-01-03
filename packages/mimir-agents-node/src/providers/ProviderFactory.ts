/**
 * Factory for creating LLM provider instances
 *
 * Uses UnifiedProvider with Vercel AI SDK for all providers.
 */

import type { ILLMProvider } from '@codedir/mimir-agents';
import {
  getProvider,
  getDefaultModel,
  getAllProviders,
  getProvidersByCategory,
} from '@codedir/mimir-agents';
import { UnifiedProvider, type UnifiedProviderConfig } from './UnifiedProvider.js';

/**
 * Provider configuration from config file
 */
export interface ProviderFactoryConfig {
  provider: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string; // Optional override for OpenAI-compatible providers
}

/**
 * Credentials resolver function type
 *
 * Returns API key for the given provider, or null if not found.
 * Typically resolves from: environment variables → OS keychain → encrypted file
 */
export type CredentialsResolver = (provider: string) => Promise<string | null>;

/**
 * Factory for creating LLM provider instances
 */
export class ProviderFactory {
  /**
   * Create provider instance with credentials from resolver
   *
   * This is the primary way to create providers in the new architecture.
   *
   * @example
   * ```typescript
   * const provider = await ProviderFactory.createFromConfig(
   *   {
   *     provider: 'deepseek',
   *     model: 'deepseek-chat',
   *     temperature: 0.7,
   *   },
   *   async (provider) => credentialsManager.getKey(provider)
   * );
   * ```
   */
  static async createFromConfig(
    config: ProviderFactoryConfig,
    credentialsResolver: CredentialsResolver
  ): Promise<ILLMProvider> {
    const providerId = config.provider.toLowerCase();

    // Check if provider exists in registry
    const providerDef = getProvider(providerId);
    if (!providerDef) {
      throw new Error(
        `Provider "${providerId}" not found in registry.\n\n` +
          `Available providers: ${this.listSupported().join(', ')}\n\n` +
          `Run: mimir connect ${providerId}`
      );
    }

    // Resolve API key
    const apiKey = await credentialsResolver(providerId);
    if (!apiKey) {
      throw new Error(
        `No API key configured for "${providerId}".\n\n` +
          `To configure, run: mimir connect ${providerId}\n\n` +
          `Or set environment variable: ${providerId.toUpperCase()}_API_KEY`
      );
    }

    // Get model (use provided or default from registry)
    const modelId = config.model || getDefaultModel(providerId)?.id;
    if (!modelId) {
      throw new Error(`No model specified and no default model found for provider "${providerId}"`);
    }

    // Build unified provider config
    const unifiedConfig: UnifiedProviderConfig = {
      provider: providerId,
      model: modelId,
      apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      baseURL: config.baseURL,
    };

    // Create unified provider instance with loaders applied
    return await UnifiedProvider.create(unifiedConfig);
  }

  /**
   * Check if provider is supported
   *
   * Checks if provider exists in the registry.
   */
  static isSupported(provider: string): boolean {
    return getProvider(provider.toLowerCase()) !== undefined;
  }

  /**
   * List all supported providers
   *
   * Returns provider IDs from the registry.
   */
  static listSupported(): string[] {
    return getAllProviders().map((p) => p.id);
  }

  /**
   * List supported providers by category
   */
  static listByCategory(category: 'popular' | 'cloud' | 'open-source' | 'proxy'): string[] {
    return getProvidersByCategory(category).map((p) => p.id);
  }

  /**
   * Get provider metadata
   */
  static getProviderInfo(provider: string) {
    return getProvider(provider.toLowerCase());
  }

  /**
   * Get available models for a provider
   */
  static getAvailableModels(provider: string) {
    const providerDef = getProvider(provider.toLowerCase());
    return providerDef?.models || [];
  }
}
