# AI SDK Migration - Implementation Roadmap

**Date:** 2025-12-29
**Status:** 🚧 In Progress
**Goal:** Migrate from manual provider implementations to Vercel AI SDK with dynamic registry supporting 50+ providers

---

## Overview

Replace custom `AnthropicProvider` and `DeepSeekProvider` with unified AI SDK-based implementation. Enable dynamic provider/model selection with Teams API integration for policy enforcement.

**Key Changes:**
- ✅ **No backwards compatibility** - clean break
- ✅ Unified `UnifiedProvider` using AI SDK
- ✅ Dynamic provider registry (base + Teams override)
- ✅ Enhanced `/model` command with quality/cost indicators
- ✅ Agent-specific model templating
- ✅ Smart model switching with configurable prompts

---

## Architecture

```
packages/mimir-agents/src/providers/
├── registry.ts              # Provider/model metadata (platform-agnostic)
├── interfaces.ts            # ILLMProvider, ModelDefinition types
└── index.ts

packages/mimir-agents-runtime/src/providers/
├── UnifiedProvider.ts       # AI SDK implementation
├── ProviderFactory.ts       # Creates UnifiedProvider instances
├── DynamicRegistry.ts       # Teams API integration, TTL caching
└── index.ts

src/features/providers/
├── commands/
│   └── ConnectCommand.ts    # Updated for dynamic providers
├── components/
│   ├── ProviderSetupWizard.tsx   # Categorized provider list
│   └── ModelPicker.tsx           # /model command UI
└── index.ts

src/features/chat/
├── slash-commands/
│   ├── ModelCommand.ts      # /model [provider] [model]
│   └── AgentsCommand.ts     # /agents <template>
└── agent/
    └── AgentTemplates.ts    # Presets (speed, balanced, quality, cost)
```

---

## Phase 1: Core Infrastructure (Day 1)

### 1.1 Provider Registry (mimir-agents)
**Location:** `packages/mimir-agents/src/providers/registry.ts`

**Tasks:**
- [x] Define `ProviderDefinition` interface
- [x] Define `ModelDefinition` interface (quality, price, capabilities)
- [ ] Create base registry with 10 providers:
  - anthropic, openai, deepseek, google, groq, qwen, mistral, cohere, openrouter, together
- [ ] Add ~50 models total across providers
- [ ] Include quality (1-5 stars) and cost tier ($-$$$$)

**Deliverable:** Static registry with metadata

---

### 1.2 AI SDK Dependencies
**Location:** `packages/mimir-agents-runtime/package.json`

**Tasks:**
- [ ] Install AI SDK packages:
  ```bash
  yarn workspace @codedir/mimir-agents-node add ai \
    @ai-sdk/anthropic \
    @ai-sdk/openai \
    @ai-sdk/google \
    @ai-sdk/mistral \
    @ai-sdk/openai-compatible
  ```
- [ ] Remove old SDKs:
  - `@anthropic-ai/sdk`
  - Manual axios calls for DeepSeek

**Deliverable:** Updated dependencies

---

### 1.3 Unified Provider Implementation
**Location:** `packages/mimir-agents-runtime/src/providers/UnifiedProvider.ts`

**Tasks:**
- [ ] Create `UnifiedProvider` class implementing `ILLMProvider`
- [ ] Implement `createModel()` method for all SDK types:
  - `anthropic`
  - `openai`
  - `google`
  - `openai-compatible` (DeepSeek, Groq, Together, etc.)
- [ ] Implement `chat()` method using AI SDK `generateText()`
- [ ] Implement `streamChat()` method using AI SDK `streamText()`
- [ ] Handle model-specific features (thinking mode, reasoning)
- [ ] Token counting via AI SDK
- [ ] Cost calculation from registry metadata

**Deliverable:** Working UnifiedProvider

---

### 1.4 Update ProviderFactory
**Location:** `packages/mimir-agents-runtime/src/providers/ProviderFactory.ts`

**Tasks:**
- [ ] Remove old `create()` method
- [ ] Update `createFromConfig()` to use UnifiedProvider
- [ ] Add registry lookup for provider/model metadata
- [ ] Handle credential resolution (existing CredentialsManager)

**Deliverable:** Factory creates UnifiedProvider instances

---

### 1.5 Delete Old Providers
**Files to delete:**
- [x] `packages/mimir-agents-runtime/src/providers/AnthropicProvider.ts`
- [x] `packages/mimir-agents-runtime/src/providers/DeepSeekProvider.ts`
- [x] `packages/mimir-agents-runtime/src/providers/BaseLLMProvider.ts`

**Deliverable:** Cleaned up codebase

---

## Phase 2: Configuration & Schema (Day 1-2)

### 2.1 Update Config Schema
**Location:** `src/shared/config/schemas.ts`

**Old:**
```yaml
providers:
  activeProvider: deepseek
  deepseek: { enabled, source, storage }
  anthropic: { enabled, source, storage }
```

**New:**
```yaml
providers:
  main:
    provider: deepseek
    model: deepseek-chat

  agents:  # Optional per-agent overrides
    oracle:
      provider: anthropic
      model: claude-opus-4-5-20251101

  templates:  # Agent preset configs
    speed: {...}
    quality: {...}

  autoSwitchModels: false  # Prompt before switching
```

**Tasks:**
- [ ] Define new `ProvidersConfigSchema`
- [ ] Remove old provider-specific schemas
- [ ] Add `AgentModelOverridesSchema`
- [ ] Add `AgentTemplatesSchema`
- [ ] Add `autoSwitchModels` boolean

**Deliverable:** New config schema

---

### 2.2 Update ConfigLoader
**Location:** `src/shared/config/ConfigLoader.ts`

**Tasks:**
- [ ] Update defaults to new schema
- [ ] Remove old provider defaults
- [ ] Add default templates (speed, balanced, quality, cost)

**Deliverable:** Config loader with new schema

---

### 2.3 Update ChatCommand
**Location:** `src/features/chat/commands/ChatCommand.ts`

**Tasks:**
- [ ] Use `config.providers.main` instead of `activeProvider`
- [ ] Remove old provider init logic
- [ ] Use ProviderFactory with new config structure

**Deliverable:** ChatCommand uses new config

---

## Phase 3: Teams Integration (Day 2)

### 3.1 Dynamic Registry
**Location:** `packages/mimir-agents-runtime/src/providers/DynamicRegistry.ts`

**Tasks:**
- [ ] Create `DynamicProviderRegistry` class
- [ ] Implement TTL-based caching
- [ ] Fetch registry from Teams API
- [ ] Merge base registry + Teams policy:
  - Filter allowed/blocked providers
  - Filter allowed/blocked models
  - Apply pricing overrides
  - Add custom org models
- [ ] Implement `refresh()` method
- [ ] Implement cache invalidation

**Deliverable:** Teams-aware dynamic registry

---

### 3.2 Teams API Client Extension
**Location:** `src/features/teams/api/ITeamsAPIClient.ts`

**Tasks:**
- [ ] Add `getProviderRegistry()` method:
  ```typescript
  interface TeamsProviderData {
    policy: {
      allowedProviders?: string[];
      blockedProviders?: string[];
      allowedModels?: string[];
      blockedModels?: string[];
      enforcedProvider?: string;
      enforcedModel?: string;
    };
    customModels?: ModelDefinition[];
    pricingOverrides?: Record<string, PricingInfo>;
    ttl: number;  // Cache duration in ms
  }
  ```

**Deliverable:** Teams API interface updated

---

## Phase 4: CLI Commands & UI (Day 2-3)

### 4.1 Update /connect Command
**Location:** `src/features/providers/commands/ConnectCommand.ts`

**Tasks:**
- [ ] Use dynamic registry instead of hardcoded providers
- [ ] Categorize providers (Popular, Cloud, Open Source, Proxy)
- [ ] Show all available providers
- [ ] Update wizard to use registry metadata
- [ ] Remove storage field (automatic resolution)

**Deliverable:** Dynamic /connect wizard

---

### 4.2 Implement /model Command
**Location:** `src/features/chat/slash-commands/ModelCommand.ts`

**Tasks:**
- [ ] Create new ModelCommand class
- [ ] Parse syntax: `/model [provider] [model]`
- [ ] Build ModelPicker UI component (Ink)
- [ ] Show providers with:
  - Quality stars (⭐ 1-5)
  - Cost tier ($ to $$$$)
  - Context window
  - Capabilities
  - Pricing per M tokens
- [ ] Update config on selection
- [ ] Show confirmation message

**Deliverable:** Working /model command with rich UI

---

### 4.3 Model Picker UI Component
**Location:** `src/features/providers/components/ModelPicker.tsx`

**UI Design:**
```
┌─ Select Model ─────────────────────────────────────────┐
│ Current: DeepSeek Chat (deepseek/deepseek-chat)        │
│                                                         │
│ 📁 Anthropic                                            │
│   ○ Claude Opus 4.5          ⭐⭐⭐⭐⭐ $$$$             │
│     200K ctx • $15/$75 per M tokens                     │
│                                                         │
│   ○ Claude 3.5 Sonnet        ⭐⭐⭐⭐⭐ $$$              │
│     200K ctx • $3/$15 per M tokens                      │
│                                                         │
│ 📁 DeepSeek                                             │
│   ● DeepSeek Chat            ⭐⭐⭐⭐   $                │
│     64K ctx • $0.14/$0.28 per M tokens                  │
│                                                         │
│ [Filter: All | $-$$ | Quality 4+]                      │
└─────────────────────────────────────────────────────────┘
```

**Tasks:**
- [ ] Group by provider
- [ ] Show quality stars
- [ ] Show cost tier
- [ ] Show pricing
- [ ] Add filtering options
- [ ] Highlight current model

**Deliverable:** Interactive model picker

---

### 4.4 Implement /agents Command
**Location:** `src/features/chat/slash-commands/AgentsCommand.ts`

**Syntax:**
```bash
/agents                 # Show current template
/agents speed           # Apply "speed" template
/agents quality         # Apply "quality" template
/agents balanced        # Apply "balanced" template
/agents cost            # Apply "cost" template
/agents custom          # Configure per-agent
```

**Templates:**
```typescript
const TEMPLATES = {
  speed: {
    main: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    agents: {
      finder: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      oracle: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      rush: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    },
  },
  quality: {
    main: { provider: 'anthropic', model: 'claude-opus-4-5-20251101' },
    agents: {
      finder: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      oracle: { provider: 'anthropic', model: 'claude-opus-4-5-20251101' },
      rush: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    },
  },
  // ... more
};
```

**Tasks:**
- [ ] Define built-in templates
- [ ] Allow custom templates in config
- [ ] Allow Teams to override templates
- [ ] Show current assignments
- [ ] Update config on template change

**Deliverable:** /agents template system

---

## Phase 5: Smart Model Switching (Day 3)

### 5.1 Task Analysis
**Location:** `src/features/chat/agent/TaskAnalyzer.ts`

**Tasks:**
- [ ] Analyze incoming task for:
  - Estimated token count
  - Complexity level
  - Required capabilities (vision, reasoning, etc.)
- [ ] Compare with current model capabilities
- [ ] Suggest better models if mismatch

**Deliverable:** Task analyzer

---

### 5.2 Model Switch Prompt
**Location:** `src/features/chat/components/ModelSwitchPrompt.tsx`

**UI:**
```
⚠️ Model Recommendation

Your current model (DeepSeek Chat) may not be optimal:
• Task requires advanced reasoning
• Estimated 50K+ tokens (close to context limit)

Suggested models:
  1. Claude Opus 4.5        ⭐⭐⭐⭐⭐ $$$$
  2. Claude 3.5 Sonnet      ⭐⭐⭐⭐⭐ $$$
  3. DeepSeek Reasoner (R1) ⭐⭐⭐⭐⭐ $$

Switch? [1/2/3/Keep current]
```

**Tasks:**
- [ ] Show recommendation when mismatch detected
- [ ] Respect `autoSwitchModels` config
- [ ] Allow selection from suggestions
- [ ] Update config on switch

**Deliverable:** Model switch UI

---

## Phase 6: Testing & Documentation (Day 4)

### 6.1 Update Tests

**Unit Tests:**
- [ ] `UnifiedProvider.test.ts` - All SDK types
- [ ] `DynamicRegistry.test.ts` - Teams merging
- [ ] `ProviderFactory.test.ts` - Updated factory
- [ ] `ModelCommand.test.ts` - Command parsing
- [ ] `AgentsCommand.test.ts` - Template system

**Integration Tests:**
- [ ] Provider switching flow
- [ ] Teams policy enforcement
- [ ] Model auto-suggestion
- [ ] Agent template application

**E2E Tests:**
- [ ] Full connect → chat → model switch flow
- [ ] Multi-agent with different providers

**Deliverable:** 80%+ test coverage

---

### 6.2 Update Documentation

**Files to update:**
- [ ] `docs/pages/configuration/providers.mdx` - New config format
- [ ] `docs/pages/contributing/provider-architecture.md` - AI SDK approach
- [ ] `CLAUDE.md` - Update provider section
- [ ] `README.md` - Update features

**New files:**
- [ ] `docs/pages/commands/model.mdx` - /model usage
- [ ] `docs/pages/commands/agents.mdx` - /agents templates
- [ ] `docs/pages/teams/provider-policies.mdx` - Teams enforcement

**Deliverable:** Complete documentation

---

## Phase 7: Migration Tooling (Day 4)

### 7.1 Config Migration Helper

**Tasks:**
- [ ] Detect old config format
- [ ] Show helpful error with migration steps
- [ ] Optional: Auto-migrate command `mimir migrate-config`

**Deliverable:** Easy migration path

---

### 7.2 Provider Refresh Command

**Command:** `/providers refresh`

**Tasks:**
- [ ] Force refresh Teams registry
- [ ] Clear cache
- [ ] Show updated providers/models

**Deliverable:** Manual refresh capability

---

## Success Criteria

✅ **Phase 1 Complete:**
- UnifiedProvider works with all major providers
- Old providers deleted
- Tests passing

✅ **Phase 2 Complete:**
- New config schema implemented
- ChatCommand uses new structure

✅ **Phase 3 Complete:**
- Teams API integration working
- Dynamic registry with TTL caching

✅ **Phase 4 Complete:**
- /model command with rich UI
- /agents template system
- Dynamic /connect wizard

✅ **Phase 5 Complete:**
- Smart model switching
- Configurable prompts

✅ **Phase 6 Complete:**
- All tests passing
- Documentation updated

✅ **Phase 7 Complete:**
- Migration tools ready
- User-friendly error messages

---

## Timeline

- **Day 1:** Phases 1-2 (Core infrastructure + config)
- **Day 2:** Phases 3-4 (Teams + CLI)
- **Day 3:** Phase 5 (Smart switching)
- **Day 4:** Phases 6-7 (Testing + docs)

**Total:** 4 days for complete migration

---

## Rollout Plan

1. **Internal testing** with DeepSeek + Anthropic only
2. **Add remaining providers** incrementally
3. **Teams beta** with select organizations
4. **Public release** v2.0.0

---

## Risk Mitigation

**Risk:** AI SDK breaking changes
**Mitigation:** Pin versions, monitor releases

**Risk:** Teams API downtime
**Mitigation:** Graceful fallback to base registry

**Risk:** Provider API changes
**Mitigation:** Registry updates, version compatibility checks

**Risk:** User confusion with new config
**Mitigation:** Clear error messages, migration guide

---

## Next Steps

1. ✅ Write roadmap
2. ⏳ Implement Phase 1 (Provider registry + UnifiedProvider)
3. ⏳ Update config schema
4. ⏳ Implement /model command
5. ⏳ Add Teams integration

**Status:** Ready to begin implementation 🚀
