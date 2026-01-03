/**
 * Provider Loaders - Extensibility for provider-specific customization
 *
 * Inspired by OpenCode's CUSTOM_LOADERS pattern.
 * Allows provider-specific behavior without modifying core UnifiedProvider.
 */

import type { UnifiedProviderConfig } from './UnifiedProvider.js';

/**
 * Provider loader hooks
 */
export interface ProviderLoader {
  /**
   * Hook called before creating the AI SDK model instance
   * Allows modifying config, adding headers, custom auth, etc.
   */
  beforeCreate?: (
    config: UnifiedProviderConfig
  ) => UnifiedProviderConfig | Promise<UnifiedProviderConfig>;

  /**
   * Hook called after creating the model instance
   * Allows wrapping or augmenting the model
   */
  afterCreate?: (model: any, config: UnifiedProviderConfig) => any | Promise<any>;

  /**
   * Custom validation logic
   */
  validate?: (config: UnifiedProviderConfig) => void | Promise<void>;
}

/**
 * Registry of provider-specific loaders
 *
 * Add custom behavior for specific providers here.
 */
export const PROVIDER_LOADERS: Record<string, ProviderLoader> = {
  /**
   * Anthropic - Add beta headers for prompt caching and extended thinking
   */
  anthropic: {
    beforeCreate: (config) => {
      // Add Anthropic beta headers for advanced features
      return {
        ...config,
        headers: {
          'anthropic-beta': 'prompt-caching-2024-07-31,extended-thinking-2024-12-12',
        },
      };
    },
  },

  /**
   * OpenAI - Add organization header if configured
   */
  openai: {
    beforeCreate: (config) => {
      const orgId = process.env.OPENAI_ORG_ID;
      if (orgId) {
        return {
          ...config,
          headers: {
            'OpenAI-Organization': orgId,
          },
        };
      }
      return config;
    },
  },

  /**
   * Google - Handle API key format and project ID
   */
  google: {
    beforeCreate: (config) => {
      // Google Gemini can use project ID from env
      const projectId = process.env.GOOGLE_PROJECT_ID;
      if (projectId) {
        return {
          ...config,
          projectId,
        };
      }
      return config;
    },
  },

  /**
   * DeepSeek - Validate baseURL and add custom headers
   */
  deepseek: {
    validate: (config) => {
      if (!config.baseURL && config.baseURL !== 'https://api.deepseek.com') {
        // Ensure correct baseURL
        config.baseURL = 'https://api.deepseek.com';
      }
    },
  },

  /**
   * Groq - Ultra-fast inference optimizations
   */
  groq: {
    validate: (config) => {
      if (!config.baseURL) {
        config.baseURL = 'https://api.groq.com/openai/v1';
      }
    },
  },

  /**
   * OpenRouter - Add custom headers and site info
   */
  openrouter: {
    beforeCreate: (config) => {
      const headers: Record<string, string> = {};

      // OpenRouter allows tracking via HTTP-Referer
      const siteName = process.env.OPENROUTER_SITE_NAME || 'Mimir';
      const siteUrl = process.env.OPENROUTER_SITE_URL || 'https://github.com/codedir/mimir';

      headers['HTTP-Referer'] = siteUrl;
      headers['X-Title'] = siteName;

      return {
        ...config,
        headers,
      };
    },
  },

  /**
   * Together AI - Validate endpoint
   */
  together: {
    validate: (config) => {
      if (!config.baseURL) {
        config.baseURL = 'https://api.together.xyz/v1';
      }
    },
  },

  /**
   * Qwen - Alibaba Cloud specific configuration
   */
  qwen: {
    validate: (config) => {
      if (!config.baseURL) {
        config.baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      }
    },
    beforeCreate: (config) => {
      // Qwen uses workspace ID for authentication
      const workspaceId = process.env.QWEN_WORKSPACE_ID;
      if (workspaceId) {
        return {
          ...config,
          headers: {
            'X-DashScope-WorkSpace': workspaceId,
          },
        };
      }
      return config;
    },
  },

  /**
   * Cohere - Enterprise configuration
   */
  cohere: {
    validate: (config) => {
      if (!config.baseURL) {
        config.baseURL = 'https://api.cohere.com/v1';
      }
    },
  },

  /**
   * Mistral - European provider configuration
   */
  mistral: {
    beforeCreate: (config) => {
      // Mistral allows custom endpoint for enterprise deployments
      const customEndpoint = process.env.MISTRAL_ENDPOINT;
      if (customEndpoint) {
        return {
          ...config,
          baseURL: customEndpoint,
        };
      }
      return config;
    },
  },

  /**
   * Ollama - Local model server
   */
  ollama: {
    validate: (config) => {
      // Default to localhost if no baseURL specified
      if (!config.baseURL) {
        config.baseURL = 'http://localhost:11434/v1';
      }
    },
    beforeCreate: (config) => {
      // Ollama doesn't require an API key for local usage
      // If no key is provided, use a dummy key to satisfy SDK requirements
      if (!config.apiKey || config.apiKey === 'ollama' || config.apiKey === 'local') {
        return {
          ...config,
          apiKey: 'ollama-local',
        };
      }
      return config;
    },
  },
};

/**
 * Get loader for a provider
 */
export function getProviderLoader(providerId: string): ProviderLoader | undefined {
  return PROVIDER_LOADERS[providerId.toLowerCase()];
}

/**
 * Apply provider loader hooks to config
 */
export async function applyProviderLoader(
  providerId: string,
  config: UnifiedProviderConfig
): Promise<UnifiedProviderConfig> {
  const loader = getProviderLoader(providerId);
  if (!loader) {
    return config;
  }

  let modifiedConfig = config;

  // Run validation
  if (loader.validate) {
    await loader.validate(modifiedConfig);
  }

  // Run beforeCreate hook
  if (loader.beforeCreate) {
    modifiedConfig = await loader.beforeCreate(modifiedConfig);
  }

  return modifiedConfig;
}

/**
 * Apply afterCreate hook if available
 */
export async function applyAfterCreate(
  providerId: string,
  model: any,
  config: UnifiedProviderConfig
): Promise<any> {
  const loader = getProviderLoader(providerId);
  if (!loader?.afterCreate) {
    return model;
  }

  return await loader.afterCreate(model, config);
}
