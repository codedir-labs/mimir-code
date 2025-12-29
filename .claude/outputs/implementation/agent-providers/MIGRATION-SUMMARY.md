# AI SDK Migration - Summary

**Date:** 2025-12-29
**Status:** ✅ Complete (Core Functionality)

## Overview

Mimir has been migrated from manual provider implementations to Vercel AI SDK, enabling support for 50+ LLM providers through a unified interface.

## What Changed

### Before (Old System)
- **2 hardcoded providers**: DeepSeek, Anthropic only
- Manual provider implementations (AnthropicProvider, DeepSeekProvider)
- Hardcoded provider lists in commands
- Static config with `providers` field
- Manual credential storage

### After (New System)
- **10 providers ready**, 50+ providers supported via AI SDK
- Unified implementation using Vercel AI SDK
- Dynamic provider registry
- Simplified config (automatic credential resolution)
- Extensible via provider loaders

## New Providers Available

### Popular (5)
- **anthropic** - Claude models (Opus, Sonnet, Haiku)
- **openai** - GPT models
- **deepseek** - DeepSeek Chat, DeepSeek R1 (reasoning)
- **google** - Gemini models
- **groq** - Ultra-fast inference

### Cloud (2)
- **mistral** - Mistral models
- **cohere** - Command models

### Open Source (2)
- **qwen** - Alibaba Qwen models
- **together** - Together AI models

### Proxy (1)
- **openrouter** - Access to 100+ models via single API

## Configuration Changes

### Old Config Format (DEPRECATED)
```yaml
llm:
  provider: deepseek
  model: deepseek-chat
  apiKey: sk-xxx  # Stored in config (bad practice)

providers:
  activeProvider: deepseek
  deepseek:
    enabled: true
    source: localKey
    storage: keychain
```

### New Config Format (SIMPLIFIED)
```yaml
llm:
  provider: deepseek  # Any provider ID from registry
  model: deepseek-chat  # Optional, uses default if not specified
  temperature: 0.7
  maxTokens: 4096
  baseURL: https://custom.endpoint.com  # Optional, for openai-compatible

# Per-agent model overrides (optional)
agentModels:
  finder:
    provider: groq  # Fast provider for finding code
    model: llama-3.1-70b
  reviewer:
    provider: anthropic  # High quality for reviews
    model: claude-opus-4-5-20251101

# Smart model switching (optional)
autoSwitch:
  enabled: false
  promptBeforeSwitch: true
  preferQualityOverCost: true
  maxCostTier: 3  # 1=$, 2=$$, 3=$$$, 4=$$$$
```

**Note:** API keys are NOT stored in config. They are resolved automatically:
1. Environment variables (`DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
2. OS Keychain (secure storage)
3. Encrypted file (`~/.mimir/credentials.enc`)

## Commands Updated

### 1. `mimir connect` - Provider Setup
**Old Behavior:**
- Only supported 2 providers (DeepSeek, Anthropic)
- Hardcoded provider list

**New Behavior:**
- Supports all 10 providers in registry
- Dynamic provider list from registry
- Shows provider descriptions
- Tests connection using AI SDK

**Usage:**
```bash
# Interactive wizard (shows all providers)
mimir connect

# Quick setup for specific provider
mimir connect deepseek
mimir connect anthropic
mimir connect groq

# List configured providers
mimir connect --list

# Remove provider
mimir connect --remove deepseek
```

### 2. `/model` - Switch Provider/Model (Slash Command)
**Old Behavior:**
- Hardcoded provider enum (7 providers)
- Hardcoded model lists

**New Behavior:**
- Dynamic provider list from registry (10+ providers)
- Dynamic model lists per provider
- Validates provider/model against registry
- Shows helpful error messages with available options

**Usage:**
```bash
# Switch to different provider (uses default model)
/model deepseek
/model anthropic
/model groq

# Switch to specific model
/model anthropic claude-opus-4-5-20251101
/model deepseek deepseek-r1

# Autocomplete shows all available providers and models
/model <tab>  # Shows: anthropic, deepseek, google, groq, ...
/model deepseek <tab>  # Shows: deepseek-chat, deepseek-r1
```

## Architecture Changes

### Package Structure

#### `@codedir/mimir-agents` (Core Package)
**New Files:**
- `src/providers/registry.ts` - Provider/model metadata registry (700 lines)
- `src/providers/index.ts` - Exports for registry functions

**What it contains:**
- 10 provider definitions
- ~40 model definitions
- Quality ratings (1-5 stars)
- Cost tiers ($ to $$$$)
- Pricing per million tokens
- Capability flags (streaming, vision, thinking, tools, reasoning)

#### `@codedir/mimir-agents-node` (Runtime Package)
**New Files:**
- `src/providers/UnifiedProvider.ts` - Single provider implementation using AI SDK (273 lines)
- `src/providers/loaders.ts` - Provider-specific customization hooks (245 lines)
- `src/providers/DynamicProviderRegistry.ts` - Teams integration stubs (138 lines)

**Deleted Files:**
- `src/providers/AnthropicProvider.ts` (replaced by UnifiedProvider)
- `src/providers/DeepSeekProvider.ts` (replaced by UnifiedProvider)
- `src/providers/BaseLLMProvider.ts` (replaced by UnifiedProvider)

**What it contains:**
- UnifiedProvider using Vercel AI SDK
- Provider loaders for extensibility (inspired by OpenCode)
- Factory pattern for creating providers
- Teams integration ready (stubs with TODOs)

### Key Interfaces

#### ILLMProvider (Unchanged)
```typescript
interface ILLMProvider {
  chat(messages: Message[], tools?: LLMTool[]): Promise<string>;
  streamChat(messages: Message[], tools?: LLMTool[]): AsyncGenerator<string>;
  countTokens(messages: Message[]): Promise<number>;
  calculateCost(inputTokens: number, outputTokens: number): Promise<number>;
}
```

#### ProviderFactory (Updated)
```typescript
class ProviderFactory {
  static async createFromConfig(
    config: ProviderFactoryConfig,
    credentialsResolver: CredentialsResolver
  ): Promise<ILLMProvider>;

  static isSupported(provider: string): boolean;
  static listSupported(): string[];
  static listByCategory(category): string[];
  static getProviderInfo(provider: string): ProviderDefinition;
  static getAvailableModels(provider: string): ModelDefinition[];
}
```

#### CredentialsResolver (New)
```typescript
type CredentialsResolver = (provider: string) => Promise<string | null>;

// Example usage:
const provider = await ProviderFactory.createFromConfig(
  { provider: 'deepseek', model: 'deepseek-chat' },
  async (provider) => credentialsManager.getKey(provider)
);
```

## Provider Registry

### ProviderDefinition
```typescript
interface ProviderDefinition {
  id: string;                    // 'anthropic', 'openai', etc.
  name: string;                  // 'Anthropic', 'OpenAI', etc.
  description: string;           // Short description
  category: 'popular' | 'cloud' | 'open-source' | 'proxy';
  sdkPackage: string;            // '@ai-sdk/anthropic'
  sdkType: 'anthropic' | 'openai' | 'google' | 'mistral' | 'openai-compatible';
  baseURL?: string;              // For openai-compatible
  signupUrl: string;             // Where to get API key
  models: ModelDefinition[];     // Available models
}
```

### ModelDefinition
```typescript
interface ModelDefinition {
  id: string;                    // 'claude-opus-4-5-20251101'
  name: string;                  // 'Claude Opus 4.5'
  default?: boolean;             // Is default for provider
  contextWindow: number;         // Max context tokens
  maxOutput: number;             // Max output tokens
  supports: ModelCapability[];   // ['streaming', 'vision', 'tools']
  pricing: {
    input: number;               // Cost per 1M input tokens
    output: number;              // Cost per 1M output tokens
  };
  costTier: 1 | 2 | 3 | 4;      // $ to $$$$
  quality: 1 | 2 | 3 | 4 | 5;   // Star rating
  bestFor?: string[];            // Use cases
  features?: {                   // Provider-specific features
    thinking?: boolean;
    reasoning?: boolean;
  };
}
```

### Registry Helper Functions
```typescript
// Get all providers
const providers = getAllProviders();

// Get specific provider
const provider = getProvider('anthropic');

// Get model
const model = getModel('anthropic', 'claude-opus-4-5-20251101');

// Get default model for provider
const defaultModel = getDefaultModel('anthropic');

// Filter by category
const popularProviders = getProvidersByCategory('popular');

// Search by capability
const visionModels = searchModelsByCapability('vision');

// Filter by cost
const affordableModels = filterModelsByCost(2); // Max $$

// Filter by quality
const highQualityModels = filterModelsByQuality(4); // Min 4 stars
```

## Extensibility: Provider Loaders

Inspired by OpenCode's `CUSTOM_LOADERS` pattern, provider loaders allow adding provider-specific behavior without modifying core code.

### Example: Anthropic Loader
```typescript
export const PROVIDER_LOADERS: Record<string, ProviderLoader> = {
  anthropic: {
    beforeCreate: (config) => ({
      ...config,
      headers: {
        'anthropic-beta': 'prompt-caching-2024-07-31,extended-thinking-2024-12-12',
      },
    }),
  },

  openrouter: {
    beforeCreate: (config) => ({
      ...config,
      headers: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://github.com/codedir/mimir',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'Mimir',
      },
    }),
  },
};
```

### Loader Hooks
- `beforeCreate(config)` - Modify config before creating AI SDK model
- `afterCreate(model, config)` - Wrap or augment model after creation
- `validate(config)` - Custom validation logic

## Teams Integration (Ready - Not Implemented)

### DynamicProviderRegistry
```typescript
class DynamicProviderRegistry {
  // TODO (mimir-teams): Implement
  async getProviders(): Promise<ProviderDefinition[]>;
  async getProvider(providerId: string): Promise<ProviderDefinition | undefined>;
  invalidateCache(): void;
}
```

### Teams Features (Planned)
- Fetch provider registry from Teams API
- TTL-based caching (default 5 minutes)
- Organization-level policy enforcement:
  - Allowed providers
  - Blocked providers
  - Allowed models per provider
  - Blocked models per provider
- Cache invalidation via webhook

### Teams API Contract
```typescript
interface ProviderRegistryResponse {
  providers: ProviderDefinition[];
  policy?: {
    allowedProviders?: string[];
    blockedProviders?: string[];
    allowedModels?: Record<string, string[]>;
    blockedModels?: Record<string, string[]>;
  };
  ttl?: number;  // Cache TTL in seconds
}
```

## Migration Checklist for Users

There are currently **no users**, but when there are:

1. **Update config file** (`~/.mimir/config.yml`):
   - Remove `providers` section
   - Keep `llm.provider` and `llm.model`
   - Remove `apiKey` from config (move to credentials)

2. **Run `mimir connect`** to re-configure credentials:
   - Credentials will be stored securely (keychain or encrypted file)
   - Not in plaintext config file

3. **Test provider switching**:
   - `/model deepseek`
   - `/model anthropic claude-opus-4-5-20251101`

4. **Explore new providers**:
   - Try `mimir connect groq` for ultra-fast inference
   - Try `mimir connect openrouter` for access to 100+ models

## Benefits

1. **More Providers**: 10 ready, 50+ supported via AI SDK
2. **Simpler Code**: 1 provider implementation instead of N manual ones
3. **Better Security**: Credentials not in config file
4. **Easier to Extend**: Add new providers via registry, not code changes
5. **Teams Ready**: Dynamic registry with policy enforcement
6. **Better UX**: Dynamic autocomplete, helpful error messages
7. **Cost Tracking**: Built-in pricing data for all models
8. **Quality Ratings**: Easy comparison of model quality

## Performance

- **Build time**: ~5-6 seconds (same as before)
- **Startup time**: Minimal impact (registry cached)
- **Runtime**: AI SDK is optimized, should be faster than manual implementations

## Breaking Changes

- Old `providers` config field removed (automatic migration via `mimir connect`)
- `ProviderFactory.create()` removed (use `createFromConfig()`)
- Provider-specific classes removed (use UnifiedProvider via factory)

## Next Steps (Optional Enhancements)

1. **Phase 5: Smart Model Switching**
   - Task complexity analyzer
   - Automatic model recommendations
   - Configurable auto-switching

2. **Phase 6: Testing & Documentation**
   - Update unit tests
   - Write integration tests for new providers
   - Update user documentation
   - Migration guide for existing users (when needed)

3. **Future: Teams Backend Integration**
   - Implement DynamicProviderRegistry API calls
   - Add policy enforcement
   - TTL caching and webhooks

## Dependencies Added

- `ai@6.0.3` - Vercel AI SDK core
- `@ai-sdk/anthropic@3.0.1` - Anthropic integration
- `@ai-sdk/openai@3.0.1` - OpenAI integration
- `@ai-sdk/google@3.0.1` - Google Gemini integration
- `@ai-sdk/mistral@3.0.1` - Mistral integration
- `@ai-sdk/openai-compatible@2.0.1` - OpenAI-compatible providers
- `zod@^3.25.76` - Validation (peer dependency)

## Code Statistics

- **New Files**: 5
- **Modified Files**: 10
- **Deleted Files**: 3
- **Lines Added**: ~1,400
- **Lines Deleted**: ~600
- **Net Change**: +800 lines
- **Providers**: 2 → 10 (5x increase)
- **Models**: ~6 → ~40 (6.7x increase)

## Credits

- Architecture inspired by OpenCode's provider system
- Provider loaders pattern from OpenCode's CUSTOM_LOADERS
- AI SDK by Vercel
