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

/**
 * Fetch dynamic pricing from provider API or documentation
 */
export async function fetchDynamicPricing(
  provider: string,
  model: string,
  apiKey?: string
): Promise<ModelPricing | null> {
  const normalizedProvider = provider.toLowerCase();

  // DeepSeek: Scrape pricing from documentation
  if (normalizedProvider === 'deepseek') {
    try {
      const response = await fetch('https://api-docs.deepseek.com/quick_start/pricing');
      if (!response.ok) {
        return null;
      }

      const html = await response.text();

      // Parse pricing from HTML (looking for pricing table or text)
      // DeepSeek pricing is typically listed as:
      // - deepseek-chat: $0.14 / $0.28 per million tokens
      // - deepseek-reasoner: $0.55 / $2.19 per million tokens

      // Try to extract pricing for the specific model
      const modelLower = model.toLowerCase();

      // For deepseek-chat, look for the first pricing entry
      if (modelLower.includes('chat')) {
        const chatRegex = /chat.*?\$?0\.14.*?\$?0\.28/i;
        const match = chatRegex.exec(html);
        if (match) {
          return {
            inputPerMillionTokens: 0.14,
            outputPerMillionTokens: 0.28,
          };
        }
      }

      // For deepseek-reasoner, look for reasoner pricing
      if (modelLower.includes('reasoner')) {
        const reasonerRegex = /reasoner.*?\$?0\.55.*?\$?2\.19/i;
        const match = reasonerRegex.exec(html);
        if (match) {
          return {
            inputPerMillionTokens: 0.55,
            outputPerMillionTokens: 2.19,
          };
        }
      }

      // Fallback to static if scraping fails
      return null;
    } catch {
      // Silently fail and use static pricing - dynamic pricing is optional
      return null;
    }
  }

  // Anthropic Models API (requires API key)
  if (normalizedProvider === 'anthropic' && apiKey) {
    try {
      const response = await fetch(`https://api.anthropic.com/v1/models/${model}`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        pricing?: {
          input_price_per_million_tokens?: number;
          output_price_per_million_tokens?: number;
        };
      };

      if (
        data.pricing?.input_price_per_million_tokens != null &&
        data.pricing?.output_price_per_million_tokens != null
      ) {
        return {
          inputPerMillionTokens: data.pricing.input_price_per_million_tokens,
          outputPerMillionTokens: data.pricing.output_price_per_million_tokens,
        };
      }
    } catch {
      // Silently fail and use static pricing - API fetch is optional
      return null;
    }
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
