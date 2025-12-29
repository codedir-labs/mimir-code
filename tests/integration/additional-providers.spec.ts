/**
 * Integration tests for additional providers (OpenAI, Google, Ollama)
 * Tests provider registry, factory creation, and basic functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialsManager } from '@/shared/utils/CredentialsManager.js';
import { ProviderFactory } from '@codedir/mimir-agents-node/providers';
import { getProvider, getDefaultModel, getAllProviders } from '@codedir/mimir-agents';
import * as keytar from 'keytar';

// Mock keytar
vi.mock('keytar', () => ({
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
}));

describe('Additional Providers', () => {
  let savedEnvVars: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear env vars
    const envVarsToSave = [
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'OLLAMA_API_KEY',
      'QWEN_API_KEY',
      'GROQ_API_KEY',
      'MISTRAL_API_KEY',
      'COHERE_API_KEY',
      'TOGETHER_API_KEY',
      'OPENROUTER_API_KEY',
    ];

    for (const envVar of envVarsToSave) {
      savedEnvVars[envVar] = process.env[envVar];
      delete process.env[envVar];
    }

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore saved env vars
    for (const [key, value] of Object.entries(savedEnvVars)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    savedEnvVars = {};
  });

  describe('Provider Registry', () => {
    it('should have OpenAI provider in registry', () => {
      const provider = getProvider('openai');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('openai');
      expect(provider?.name).toBe('OpenAI');
      expect(provider?.sdkType).toBe('openai');
      expect(provider?.models.length).toBeGreaterThan(0);
    });

    it('should have Google provider in registry', () => {
      const provider = getProvider('google');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('google');
      expect(provider?.name).toBe('Google');
      expect(provider?.sdkType).toBe('google');
      expect(provider?.models.length).toBeGreaterThan(0);
    });

    it('should have Ollama provider in registry', () => {
      const provider = getProvider('ollama');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('ollama');
      expect(provider?.name).toBe('Ollama');
      expect(provider?.sdkType).toBe('openai-compatible');
      expect(provider?.baseURL).toBe('http://localhost:11434/v1');
      expect(provider?.models.length).toBeGreaterThan(0);
    });

    it('should have Qwen provider in registry', () => {
      const provider = getProvider('qwen');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('qwen');
      expect(provider?.name).toContain('Qwen');
      expect(provider?.sdkType).toBe('openai-compatible');
    });

    it('should have Groq provider in registry', () => {
      const provider = getProvider('groq');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('groq');
      expect(provider?.sdkType).toBe('openai-compatible');
    });

    it('should have Mistral provider in registry', () => {
      const provider = getProvider('mistral');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('mistral');
      expect(provider?.sdkType).toBe('mistral');
    });

    it('should have Cohere provider in registry', () => {
      const provider = getProvider('cohere');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('cohere');
      expect(provider?.sdkType).toBe('openai-compatible');
    });

    it('should have Together AI provider in registry', () => {
      const provider = getProvider('together');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('together');
      expect(provider?.sdkType).toBe('openai-compatible');
    });

    it('should have OpenRouter provider in registry', () => {
      const provider = getProvider('openrouter');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('openrouter');
      expect(provider?.sdkType).toBe('openai-compatible');
    });

    it('should list all providers including new ones', () => {
      const allProviders = getAllProviders();

      const providerIds = allProviders.map((p) => p.id);
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('google');
      expect(providerIds).toContain('ollama');
      expect(providerIds).toContain('qwen');
      expect(providerIds).toContain('groq');
      expect(providerIds).toContain('mistral');
      expect(providerIds).toContain('cohere');
      expect(providerIds).toContain('together');
      expect(providerIds).toContain('openrouter');
    });
  });

  describe('Default Models', () => {
    it('should have default model for OpenAI', () => {
      const defaultModel = getDefaultModel('openai');

      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe('gpt-4o');
      expect(defaultModel?.default).toBe(true);
    });

    it('should have default model for Google', () => {
      const defaultModel = getDefaultModel('google');

      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe('gemini-2.0-flash-exp');
      expect(defaultModel?.default).toBe(true);
    });

    it('should have default model for Ollama', () => {
      const defaultModel = getDefaultModel('ollama');

      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe('qwen2.5-coder:32b');
      expect(defaultModel?.default).toBe(true);
    });

    it('should have default model for Qwen', () => {
      const defaultModel = getDefaultModel('qwen');

      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe('qwen-max');
    });

    it('should have default model for Groq', () => {
      const defaultModel = getDefaultModel('groq');

      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe('llama-3.3-70b-versatile');
    });

    it('should have default model for Mistral', () => {
      const defaultModel = getDefaultModel('mistral');

      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe('mistral-large-latest');
    });
  });

  describe('Provider Categories', () => {
    it('should categorize providers correctly', () => {
      const openai = getProvider('openai');
      const google = getProvider('google');
      const ollama = getProvider('ollama');
      const qwen = getProvider('qwen');
      const openrouter = getProvider('openrouter');
      const mistral = getProvider('mistral');

      expect(openai?.category).toBe('popular');
      expect(google?.category).toBe('popular');
      expect(ollama?.category).toBe('open-source');
      expect(qwen?.category).toBe('open-source');
      expect(openrouter?.category).toBe('proxy');
      expect(mistral?.category).toBe('cloud');
    });
  });

  describe('Model Capabilities', () => {
    it('should define capabilities for OpenAI models', () => {
      const gpt4o = getProvider('openai')?.models.find((m) => m.id === 'gpt-4o');

      expect(gpt4o?.supports).toContain('streaming');
      expect(gpt4o?.supports).toContain('vision');
      expect(gpt4o?.supports).toContain('tools');
    });

    it('should define capabilities for Google models', () => {
      const gemini = getProvider('google')?.models.find((m) => m.id === 'gemini-2.0-flash-exp');

      expect(gemini?.supports).toContain('streaming');
      expect(gemini?.supports).toContain('vision');
      expect(gemini?.supports).toContain('tools');
    });

    it('should define capabilities for Ollama models', () => {
      const qwen = getProvider('ollama')?.models.find((m) => m.id === 'qwen2.5-coder:32b');

      expect(qwen?.supports).toContain('streaming');
      expect(qwen?.supports).toContain('tools');
    });

    it('should mark reasoning models correctly', () => {
      const o1 = getProvider('openai')?.models.find((m) => m.id === 'o1');
      const deepseekR1 = getProvider('ollama')?.models.find((m) => m.id === 'deepseek-r1:latest');

      expect(o1?.supports).toContain('reasoning');
      expect(o1?.features?.reasoning).toBe(true);

      expect(deepseekR1?.supports).toContain('reasoning');
      expect(deepseekR1?.features?.reasoning).toBe(true);
    });
  });

  describe('Provider Factory', () => {
    it('should create OpenAI provider instance', async () => {
      const mockApiKey = 'sk-mock-openai-key';
      vi.mocked(keytar.getPassword).mockResolvedValue(mockApiKey);

      const credentialsManager = new CredentialsManager();

      // This should not throw
      const provider = await ProviderFactory.createFromConfig(
        {
          provider: 'openai',
          model: 'gpt-4o',
          temperature: 0.7,
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe('openai');
      expect(provider.getModelName()).toBe('gpt-4o');
    });

    it('should create Google provider instance', async () => {
      const mockApiKey = 'mock-google-key';
      vi.mocked(keytar.getPassword).mockResolvedValue(mockApiKey);

      const credentialsManager = new CredentialsManager();

      const provider = await ProviderFactory.createFromConfig(
        {
          provider: 'google',
          model: 'gemini-2.0-flash-exp',
          temperature: 0.7,
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe('google');
      expect(provider.getModelName()).toBe('gemini-2.0-flash-exp');
    });

    it('should create Ollama provider instance without API key', async () => {
      // Ollama doesn't require an API key
      vi.mocked(keytar.getPassword).mockResolvedValue('ollama-local');

      const credentialsManager = new CredentialsManager();

      const provider = await ProviderFactory.createFromConfig(
        {
          provider: 'ollama',
          model: 'qwen2.5-coder:32b',
          temperature: 0.7,
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe('ollama');
      expect(provider.getModelName()).toBe('qwen2.5-coder:32b');
    });

    it('should use default model when not specified', async () => {
      const mockApiKey = 'sk-mock-key';
      vi.mocked(keytar.getPassword).mockResolvedValue(mockApiKey);

      const credentialsManager = new CredentialsManager();

      const provider = await ProviderFactory.createFromConfig(
        {
          provider: 'openai',
          temperature: 0.7,
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider.getModelName()).toBe('gpt-4o'); // Default model
    });

    it('should fail with helpful error for unknown provider', async () => {
      const credentialsManager = new CredentialsManager();

      await expect(
        ProviderFactory.createFromConfig(
          {
            provider: 'unknown-provider',
            temperature: 0.7,
          },
          async (p) => credentialsManager.getKey(p)
        )
      ).rejects.toThrow('Provider "unknown-provider" not found in registry');
    });

    it('should fail with helpful error when API key missing', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const credentialsManager = new CredentialsManager();

      await expect(
        ProviderFactory.createFromConfig(
          {
            provider: 'openai',
            model: 'gpt-4o',
          },
          async (p) => credentialsManager.getKey(p)
        )
      ).rejects.toThrow('No API key configured for "openai"');
    });
  });

  describe('Provider Pricing', () => {
    it('should have pricing information for all models', () => {
      const allProviders = getAllProviders();

      for (const provider of allProviders) {
        for (const model of provider.models) {
          expect(model.pricing).toBeDefined();
          expect(model.pricing.input).toBeDefined();
          expect(model.pricing.output).toBeDefined();
          expect(typeof model.pricing.input).toBe('number');
          expect(typeof model.pricing.output).toBe('number');
          expect(model.pricing.input).toBeGreaterThanOrEqual(0);
          expect(model.pricing.output).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should have Ollama models marked as free', () => {
      const ollama = getProvider('ollama');

      for (const model of ollama!.models) {
        expect(model.pricing.input).toBe(0);
        expect(model.pricing.output).toBe(0);
        expect(model.costTier).toBe('$');
      }
    });
  });

  describe('ProviderFactory List Methods', () => {
    it('should list all supported providers', () => {
      const supported = ProviderFactory.listSupported();

      expect(supported).toContain('openai');
      expect(supported).toContain('google');
      expect(supported).toContain('ollama');
      expect(supported).toContain('anthropic');
      expect(supported).toContain('deepseek');
    });

    it('should check if provider is supported', () => {
      expect(ProviderFactory.isSupported('openai')).toBe(true);
      expect(ProviderFactory.isSupported('google')).toBe(true);
      expect(ProviderFactory.isSupported('ollama')).toBe(true);
      expect(ProviderFactory.isSupported('unknown')).toBe(false);
    });

    it('should get available models for provider', () => {
      const openaiModels = ProviderFactory.getAvailableModels('openai');
      const googleModels = ProviderFactory.getAvailableModels('google');
      const ollamaModels = ProviderFactory.getAvailableModels('ollama');

      expect(openaiModels.length).toBeGreaterThan(0);
      expect(googleModels.length).toBeGreaterThan(0);
      expect(ollamaModels.length).toBeGreaterThan(0);

      expect(openaiModels.some((m) => m.id === 'gpt-4o')).toBe(true);
      expect(googleModels.some((m) => m.id === 'gemini-2.0-flash-exp')).toBe(true);
      expect(ollamaModels.some((m) => m.id === 'qwen2.5-coder:32b')).toBe(true);
    });
  });
});
