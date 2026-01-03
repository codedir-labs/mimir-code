/**
 * Provider Registry - Platform-agnostic provider and model metadata
 *
 * This registry contains metadata for all supported LLM providers.
 * It's used by:
 * - CLI UI to show available providers
 * - Factory to create provider instances
 * - Teams API to apply policies and overrides
 * - Cost calculation and model recommendations
 */

export type ProviderCategory = 'popular' | 'cloud' | 'open-source' | 'proxy';

export type SDKType = 'anthropic' | 'openai' | 'google' | 'mistral' | 'openai-compatible';

export type ModelCapability = 'streaming' | 'vision' | 'thinking' | 'tools' | 'reasoning';

export type CostTier = '$' | '$$' | '$$$' | '$$$$';

/**
 * Pricing information (per million tokens)
 */
export interface PricingInfo {
  input: number; // e.g., 3.00 for $3/M tokens
  output: number; // e.g., 15.00 for $15/M tokens
  cached?: number; // e.g., 0.30 for prompt caching
}

/**
 * Model definition with capabilities and metadata
 */
export interface ModelDefinition {
  id: string;
  name: string;
  default?: boolean;

  // Capabilities
  contextWindow: number;
  maxOutput: number;
  supports: ModelCapability[];

  // Pricing
  pricing: PricingInfo;
  costTier: CostTier;

  // Quality rating (1-5 stars)
  quality: 1 | 2 | 3 | 4 | 5;

  // Recommended use cases
  bestFor?: string[];

  // Model-specific features (for variants like thinking mode)
  features?: Record<string, any>;
}

/**
 * Provider definition
 */
export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  category: ProviderCategory;

  // SDK configuration
  sdkPackage: string;
  sdkType: SDKType;
  baseURL?: string; // For openai-compatible providers

  // User resources
  signupUrl: string;
  docsUrl?: string;

  // Available models
  models: ModelDefinition[];
}

/**
 * Base provider registry
 *
 * This is the default registry used when not connected to Mimir Teams.
 * Teams API can override/extend this registry with organization-specific policies.
 */
export const PROVIDER_REGISTRY: Record<string, ProviderDefinition> = {
  // ============================================================================
  // POPULAR PROVIDERS
  // ============================================================================

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'High-quality reasoning and coding (Claude)',
    category: 'popular',
    sdkPackage: '@ai-sdk/anthropic',
    sdkType: 'anthropic',
    signupUrl: 'https://console.anthropic.com',
    docsUrl: 'https://docs.anthropic.com',
    models: [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        contextWindow: 200000,
        maxOutput: 16384,
        supports: ['streaming', 'vision', 'thinking', 'tools'],
        pricing: {
          input: 15.0,
          output: 75.0,
        },
        costTier: '$$$$',
        quality: 5,
        bestFor: ['reasoning', 'coding', 'vision', 'complex-tasks'],
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        default: true,
        contextWindow: 200000,
        maxOutput: 8192,
        supports: ['streaming', 'vision', 'tools'],
        pricing: {
          input: 3.0,
          output: 15.0,
        },
        costTier: '$$$',
        quality: 5,
        bestFor: ['coding', 'balanced', 'production'],
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.8,
          output: 4.0,
        },
        costTier: '$$',
        quality: 4,
        bestFor: ['speed', 'cost', 'simple-tasks'],
      },
      {
        id: 'claude-opus-4-5-20251101-thinking',
        name: 'Claude Opus 4.5 (Extended Thinking)',
        contextWindow: 200000,
        maxOutput: 16384,
        supports: ['streaming', 'vision', 'thinking', 'tools'],
        pricing: {
          input: 15.0,
          output: 75.0,
        },
        costTier: '$$$$',
        quality: 5,
        bestFor: ['reasoning', 'complex-problems', 'research'],
        features: {
          thinking: 'extended',
        },
      },
    ],
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'Popular GPT models',
    category: 'popular',
    sdkPackage: '@ai-sdk/openai',
    sdkType: 'openai',
    signupUrl: 'https://platform.openai.com',
    docsUrl: 'https://platform.openai.com/docs',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        default: true,
        contextWindow: 128000,
        maxOutput: 16384,
        supports: ['streaming', 'vision', 'tools'],
        pricing: {
          input: 2.5,
          output: 10.0,
        },
        costTier: '$$$',
        quality: 5,
        bestFor: ['vision', 'multimodal', 'general'],
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        maxOutput: 16384,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.15,
          output: 0.6,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['cost', 'speed', 'simple-tasks'],
      },
      {
        id: 'o1',
        name: 'O1 (Reasoning)',
        contextWindow: 200000,
        maxOutput: 100000,
        supports: ['reasoning', 'tools'],
        pricing: {
          input: 15.0,
          output: 60.0,
        },
        costTier: '$$$$',
        quality: 5,
        bestFor: ['reasoning', 'math', 'complex-logic'],
        features: {
          reasoning: true,
        },
      },
    ],
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Fast and affordable',
    category: 'popular',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'https://api.deepseek.com',
    signupUrl: 'https://platform.deepseek.com',
    docsUrl: 'https://api-docs.deepseek.com',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        default: true,
        contextWindow: 64000,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.14,
          output: 0.28,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['cost', 'coding', 'general'],
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner (R1)',
        contextWindow: 64000,
        maxOutput: 8192,
        supports: ['streaming', 'reasoning', 'tools'],
        pricing: {
          input: 0.55,
          output: 2.19,
        },
        costTier: '$$',
        quality: 5,
        bestFor: ['reasoning', 'math', 'logic', 'cost'],
        features: {
          reasoning: true,
        },
      },
    ],
  },

  google: {
    id: 'google',
    name: 'Google',
    description: 'Gemini frontier models',
    category: 'popular',
    sdkPackage: '@ai-sdk/google',
    sdkType: 'google',
    signupUrl: 'https://ai.google.dev',
    docsUrl: 'https://ai.google.dev/docs',
    models: [
      {
        id: 'gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash',
        default: true,
        contextWindow: 1000000,
        maxOutput: 8192,
        supports: ['streaming', 'vision', 'tools'],
        pricing: {
          input: 0.0, // Free during preview
          output: 0.0,
        },
        costTier: '$',
        quality: 5,
        bestFor: ['long-context', 'multimodal', 'speed'],
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        contextWindow: 2000000,
        maxOutput: 8192,
        supports: ['streaming', 'vision', 'tools'],
        pricing: {
          input: 1.25,
          output: 5.0,
        },
        costTier: '$$',
        quality: 5,
        bestFor: ['long-context', 'vision', 'reasoning'],
      },
    ],
  },

  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference',
    category: 'popular',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'https://api.groq.com/openai/v1',
    signupUrl: 'https://console.groq.com',
    docsUrl: 'https://console.groq.com/docs',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        default: true,
        contextWindow: 8192,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.59,
          output: 0.79,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['speed', 'cost', 'real-time'],
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        contextWindow: 8192,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.05,
          output: 0.08,
        },
        costTier: '$',
        quality: 3,
        bestFor: ['speed', 'cost', 'simple-tasks'],
      },
    ],
  },

  // ============================================================================
  // CLOUD PROVIDERS
  // ============================================================================

  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'European, efficient models',
    category: 'cloud',
    sdkPackage: '@ai-sdk/mistral',
    sdkType: 'mistral',
    signupUrl: 'https://console.mistral.ai',
    docsUrl: 'https://docs.mistral.ai',
    models: [
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large',
        default: true,
        contextWindow: 128000,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 2.0,
          output: 6.0,
        },
        costTier: '$$',
        quality: 5,
        bestFor: ['coding', 'reasoning', 'european'],
      },
      {
        id: 'mistral-small-latest',
        name: 'Mistral Small',
        contextWindow: 32000,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.2,
          output: 0.6,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['cost', 'speed', 'simple-tasks'],
      },
    ],
  },

  cohere: {
    id: 'cohere',
    name: 'Cohere',
    description: 'Enterprise RAG and search',
    category: 'cloud',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'https://api.cohere.com/v1',
    signupUrl: 'https://dashboard.cohere.com',
    docsUrl: 'https://docs.cohere.com',
    models: [
      {
        id: 'command-r-plus',
        name: 'Command R+',
        default: true,
        contextWindow: 128000,
        maxOutput: 4096,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 2.5,
          output: 10.0,
        },
        costTier: '$$$',
        quality: 5,
        bestFor: ['rag', 'search', 'enterprise'],
      },
    ],
  },

  // ============================================================================
  // OPEN SOURCE / INFERENCE PROVIDERS
  // ============================================================================

  qwen: {
    id: 'qwen',
    name: 'Qwen (Alibaba Cloud)',
    description: 'Chinese frontier models',
    category: 'open-source',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    signupUrl: 'https://dashscope.console.aliyun.com',
    docsUrl: 'https://help.aliyun.com/zh/dashscope',
    models: [
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        default: true,
        contextWindow: 8192,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.4,
          output: 1.2,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['chinese', 'multilingual', 'cost'],
      },
    ],
  },

  together: {
    id: 'together',
    name: 'Together AI',
    description: 'Open models at scale',
    category: 'open-source',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'https://api.together.xyz/v1',
    signupUrl: 'https://api.together.ai',
    docsUrl: 'https://docs.together.ai',
    models: [
      {
        id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        name: 'Llama 3.1 70B Turbo',
        default: true,
        contextWindow: 8192,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.88,
          output: 0.88,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['open-source', 'cost', 'self-hosted'],
      },
    ],
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run models locally on your machine',
    category: 'open-source',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'http://localhost:11434/v1',
    signupUrl: 'https://ollama.com',
    docsUrl: 'https://ollama.com/library',
    models: [
      {
        id: 'qwen2.5-coder:32b',
        name: 'Qwen 2.5 Coder 32B',
        default: true,
        contextWindow: 32768,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.0, // Local, free
          output: 0.0,
        },
        costTier: '$',
        quality: 5,
        bestFor: ['coding', 'local', 'privacy', 'offline'],
      },
      {
        id: 'llama3.2:latest',
        name: 'Llama 3.2',
        contextWindow: 128000,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.0,
          output: 0.0,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['local', 'general', 'privacy'],
      },
      {
        id: 'deepseek-r1:latest',
        name: 'DeepSeek R1 (Local)',
        contextWindow: 64000,
        maxOutput: 8192,
        supports: ['streaming', 'reasoning', 'tools'],
        pricing: {
          input: 0.0,
          output: 0.0,
        },
        costTier: '$',
        quality: 5,
        bestFor: ['reasoning', 'local', 'privacy', 'offline'],
        features: {
          reasoning: true,
        },
      },
      {
        id: 'codestral:latest',
        name: 'Codestral',
        contextWindow: 32768,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.0,
          output: 0.0,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['coding', 'local', 'privacy'],
      },
      {
        id: 'phi4:latest',
        name: 'Phi-4',
        contextWindow: 16384,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 0.0,
          output: 0.0,
        },
        costTier: '$',
        quality: 4,
        bestFor: ['fast', 'local', 'low-resource'],
      },
    ],
  },

  // ============================================================================
  // PROXY / AGGREGATORS
  // ============================================================================

  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models via unified API',
    category: 'proxy',
    sdkPackage: '@ai-sdk/openai-compatible',
    sdkType: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    signupUrl: 'https://openrouter.ai',
    docsUrl: 'https://openrouter.ai/docs',
    models: [
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet (via OpenRouter)',
        default: true,
        contextWindow: 200000,
        maxOutput: 8192,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 3.0,
          output: 15.0,
        },
        costTier: '$$$',
        quality: 5,
        bestFor: ['proxy', 'fallback', 'multiple-providers'],
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o (via OpenRouter)',
        contextWindow: 128000,
        maxOutput: 16384,
        supports: ['streaming', 'tools'],
        pricing: {
          input: 2.5,
          output: 10.0,
        },
        costTier: '$$$',
        quality: 5,
        bestFor: ['proxy', 'fallback'],
      },
    ],
  },
};

/**
 * Get all available providers
 */
export function getAllProviders(): ProviderDefinition[] {
  return Object.values(PROVIDER_REGISTRY);
}

/**
 * Get provider by ID
 */
export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY[id];
}

/**
 * Get model definition from provider
 */
export function getModel(providerId: string, modelId: string): ModelDefinition | undefined {
  const provider = getProvider(providerId);
  return provider?.models.find((m) => m.id === modelId);
}

/**
 * Get default model for provider
 */
export function getDefaultModel(providerId: string): ModelDefinition | undefined {
  const provider = getProvider(providerId);
  return provider?.models.find((m) => m.default) || provider?.models[0];
}

/**
 * Get providers by category
 */
export function getProvidersByCategory(category: ProviderCategory): ProviderDefinition[] {
  return getAllProviders().filter((p) => p.category === category);
}

/**
 * Search models by capabilities
 */
export function searchModelsByCapability(capability: ModelCapability): ModelDefinition[] {
  const results: ModelDefinition[] = [];

  getAllProviders().forEach((provider) => {
    provider.models.forEach((model) => {
      if (model.supports.includes(capability)) {
        results.push(model);
      }
    });
  });

  return results;
}

/**
 * Filter models by cost tier
 */
export function filterModelsByCost(maxTier: CostTier): ModelDefinition[] {
  const tierOrder: CostTier[] = ['$', '$$', '$$$', '$$$$'];
  const maxIndex = tierOrder.indexOf(maxTier);

  const results: ModelDefinition[] = [];

  getAllProviders().forEach((provider) => {
    provider.models.forEach((model) => {
      const modelTierIndex = tierOrder.indexOf(model.costTier);
      if (modelTierIndex <= maxIndex) {
        results.push(model);
      }
    });
  });

  return results;
}

/**
 * Filter models by minimum quality
 */
export function filterModelsByQuality(minQuality: 1 | 2 | 3 | 4 | 5): ModelDefinition[] {
  const results: ModelDefinition[] = [];

  getAllProviders().forEach((provider) => {
    provider.models.forEach((model) => {
      if (model.quality >= minQuality) {
        results.push(model);
      }
    });
  });

  return results;
}
