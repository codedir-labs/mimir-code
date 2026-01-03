/**
 * Pricing data for LLM providers
 * Hybrid approach: Fetch from API first, fallback to static table
 */

export interface ModelPricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
}

// Static fallback pricing (updated as of 2025-12-25)
const STATIC_PRICING_TABLE: Record<string, Record<string, ModelPricing>> = {
  deepseek: {
    'deepseek-chat': {
      inputPerMillionTokens: 0.14,
      outputPerMillionTokens: 0.28,
    },
    'deepseek-reasoner': {
      inputPerMillionTokens: 0.55,
      outputPerMillionTokens: 2.19,
    },
  },
  anthropic: {
    'claude-opus-4-5-20251101': {
      inputPerMillionTokens: 15,
      outputPerMillionTokens: 75,
    },
    'claude-opus-4-5': {
      inputPerMillionTokens: 15,
      outputPerMillionTokens: 75,
    },
    'claude-sonnet-4-5-20250929': {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
    'claude-sonnet-4-5': {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
    'claude-haiku-4-5': {
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 5,
    },
    'claude-3-7-sonnet-latest': {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
    'claude-3-5-haiku-latest': {
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 5,
    },
  },
};

// In-memory cache for dynamic pricing (TTL: 24 hours)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PricingCacheEntry {
  pricing: ModelPricing;
  timestamp: number;
}

const pricingCache = new Map<string, PricingCacheEntry>();

/**
 * Get static pricing for a provider/model
 */
export function getStaticPricing(provider: string, model: string): ModelPricing | null {
  const providerPricing = STATIC_PRICING_TABLE[provider.toLowerCase()];
  if (!providerPricing) {
    return null;
  }

  return providerPricing[model] || null;
}

/** Parse DeepSeek pricing from HTML for a specific model */
function parseDeepSeekPricing(html: string, model: string): ModelPricing | null {
  const modelLower = model.toLowerCase();

  if (modelLower.includes('chat')) {
    const chatRegex = /chat.*?\$?0\.14.*?\$?0\.28/i;
    if (chatRegex.test(html)) {
      return { inputPerMillionTokens: 0.14, outputPerMillionTokens: 0.28 };
    }
  }

  if (modelLower.includes('reasoner')) {
    const reasonerRegex = /reasoner.*?\$?0\.55.*?\$?2\.19/i;
    if (reasonerRegex.test(html)) {
      return { inputPerMillionTokens: 0.55, outputPerMillionTokens: 2.19 };
    }
  }

  return null;
}

/** Fetch DeepSeek pricing from documentation */
async function fetchDeepSeekPricing(model: string): Promise<ModelPricing | null> {
  try {
    const response = await fetch('https://api-docs.deepseek.com/quick_start/pricing');
    if (!response.ok) return null;
    const html = await response.text();
    return parseDeepSeekPricing(html, model);
  } catch {
    return null;
  }
}

/** Fetch Anthropic pricing from Models API */
async function fetchAnthropicPricing(model: string, apiKey: string): Promise<ModelPricing | null> {
  try {
    const response = await fetch(`https://api.anthropic.com/v1/models/${model}`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      pricing?: {
        input_price_per_million_tokens?: number;
        output_price_per_million_tokens?: number;
      };
    };

    const inputPrice = data.pricing?.input_price_per_million_tokens;
    const outputPrice = data.pricing?.output_price_per_million_tokens;
    if (inputPrice != null && outputPrice != null) {
      return { inputPerMillionTokens: inputPrice, outputPerMillionTokens: outputPrice };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch dynamic pricing from provider API or documentation
 */
export async function fetchDynamicPricing(
  provider: string,
  model: string,
  apiKey?: string
): Promise<ModelPricing | null> {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider === 'deepseek') {
    return fetchDeepSeekPricing(model);
  }

  if (normalizedProvider === 'anthropic' && apiKey) {
    return fetchAnthropicPricing(model, apiKey);
  }

  return null;
}

/**
 * Get pricing for a model (hybrid: API first, fallback to static)
 * Caches dynamic pricing for 24 hours
 */
export async function getModelPricing(
  provider: string,
  model: string,
  apiKey?: string
): Promise<ModelPricing | null> {
  const cacheKey = `${provider}:${model}`;

  // Check cache first
  const cached = pricingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.pricing;
  }

  // Try to fetch dynamic pricing
  const dynamicPricing = await fetchDynamicPricing(provider, model, apiKey);
  if (dynamicPricing) {
    // Cache the result
    pricingCache.set(cacheKey, {
      pricing: dynamicPricing,
      timestamp: Date.now(),
    });
    return dynamicPricing;
  }

  // Fallback to static pricing
  const staticPricing = getStaticPricing(provider, model);
  if (staticPricing) {
    // Cache static pricing too (to avoid repeated lookups)
    pricingCache.set(cacheKey, {
      pricing: staticPricing,
      timestamp: Date.now(),
    });
  }

  return staticPricing;
}

/**
 * Clear pricing cache (useful for testing or forcing refresh)
 */
export function clearPricingCache(): void {
  pricingCache.clear();
}
