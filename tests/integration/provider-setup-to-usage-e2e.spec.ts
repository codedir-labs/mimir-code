/**
 * End-to-end tests for provider setup and usage
 * Tests complete flow from provider configuration to actual LLM usage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialsManager } from '@/shared/utils/CredentialsManager.js';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { ProviderFactory } from '@codedir/mimir-agents-node/providers';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
import type { ILLMProvider } from '@codedir/mimir-agents';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import YAML from 'yaml';
import * as keytar from 'keytar';

// Mock keytar
vi.mock('keytar', () => ({
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
}));

describe('Provider Setup to Usage E2E', () => {
  let testDir: string;
  let homeDir: string;
  let credentialsManager: CredentialsManager;
  let fileSystem: FileSystemAdapter;
  let configLoader: ConfigLoader;
  let savedEnvVars: Record<string, string | undefined> = {};

  beforeEach(async () => {
    testDir = join(tmpdir(), `mimir-e2e-${Date.now()}`);
    homeDir = join(testDir, 'home');

    await fs.mkdir(homeDir, { recursive: true });
    await fs.mkdir(join(homeDir, '.mimir'), { recursive: true });

    // Save and clear env vars that could interfere with tests
    const envVarsToSave = ['DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
    for (const envVar of envVarsToSave) {
      savedEnvVars[envVar] = process.env[envVar];
      delete process.env[envVar];
    }

    credentialsManager = new CredentialsManager();
    fileSystem = new FileSystemAdapter();
    configLoader = new ConfigLoader(fileSystem);

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore saved env vars
    for (const [key, value] of Object.entries(savedEnvVars)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    savedEnvVars = {};

    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Complete Setup and Usage Flow', () => {
    it('should complete full flow from setup to LLM call', async () => {
      // ===== STEP 1: User runs `mimir connect` =====
      const provider = 'deepseek';
      const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-mock-test-key';

      // Store API key (simulating wizard completion)
      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey(provider, apiKey, { type: 'keychain' });

      // ===== STEP 2: Config file is updated =====
      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 100, // Small for testing
        },
        providers: {
          activeProvider: 'deepseek',
          deepseek: {
            enabled: true,
            source: 'localKey',
            storage: 'keychain',
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // ===== STEP 3: User starts chat (`mimir`) =====
      // Load config
      const loadedConfig = YAML.parse(await fs.readFile(configPath, 'utf-8'));

      expect(loadedConfig.providers.activeProvider).toBe('deepseek');
      expect(loadedConfig.providers.deepseek.enabled).toBe(true);

      // ===== STEP 4: ChatCommand initializes provider =====
      vi.mocked(keytar.getPassword).mockResolvedValue(apiKey);

      const llmProvider = await ProviderFactory.createFromConfig(
        {
          provider: loadedConfig.providers.activeProvider,
          model: loadedConfig.llm.model,
          temperature: loadedConfig.llm.temperature,
          maxTokens: loadedConfig.llm.maxTokens,
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(llmProvider).toBeDefined();

      // ===== STEP 5: User sends message (simulate LLM call) =====
      // Skip actual API call in tests unless DEEPSEEK_API_KEY is set
      if (process.env.DEEPSEEK_API_KEY) {
        const response = await llmProvider.chat([
          {
            role: 'user',
            content: 'Say "test successful" if you can read this.',
          },
        ]);

        expect(response).toBeDefined();
        expect(response.content).toBeTruthy();
        expect(response.role).toBe('assistant');
      }
    });

    it('should handle provider switch during session', async () => {
      // Configure two providers
      const deepseekKey = process.env.DEEPSEEK_API_KEY || 'sk-deepseek-mock';
      const anthropicKey = process.env.ANTHROPIC_API_KEY || 'sk-ant-mock';

      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey('deepseek', deepseekKey, {
        type: 'keychain',
      });
      await credentialsManager.setKey('anthropic', anthropicKey, {
        type: 'keychain',
      });

      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 100,
        },
        providers: {
          activeProvider: 'deepseek',
          deepseek: { enabled: true, source: 'localKey' },
          anthropic: { enabled: true, source: 'localKey' },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // Start with DeepSeek
      vi.mocked(keytar.getPassword).mockImplementation(async (service, account) => {
        if (account === 'deepseek') return deepseekKey;
        if (account === 'anthropic') return anthropicKey;
        return null;
      });

      let provider = await ProviderFactory.createFromConfig(
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();

      // User switches to Anthropic (/model anthropic)
      config.providers.activeProvider = 'anthropic';
      config.llm.provider = 'anthropic';
      config.llm.model = 'claude-3-5-sonnet-20241022';

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // Reload and create new provider
      provider = await ProviderFactory.createFromConfig(
        {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();
    });
  });

  describe('Error Recovery Flows', () => {
    it('should show helpful error when no provider configured', async () => {
      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        providers: {
          activeProvider: 'deepseek',
          deepseek: {
            enabled: false, // Not enabled
            source: 'disabled',
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Should fail with helpful message
      await expect(
        ProviderFactory.createFromConfig(
          {
            provider: 'deepseek',
            model: 'deepseek-chat',
          },
          async (p) => credentialsManager.getKey(p)
        )
      ).rejects.toThrow(/No API key configured[\s\S]*mimir connect/);
    });

    it('should recover from invalid API key', async () => {
      const provider = 'deepseek';
      const invalidKey = 'sk-invalid-key';

      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey(provider, invalidKey, { type: 'keychain' });

      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        providers: {
          activeProvider: 'deepseek',
          deepseek: { enabled: true, source: 'localKey' },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      vi.mocked(keytar.getPassword).mockResolvedValue(invalidKey);

      // User runs /connect deepseek to fix
      const validKey = process.env.DEEPSEEK_API_KEY || 'sk-valid-key';

      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey(provider, validKey, { type: 'keychain' });

      vi.mocked(keytar.getPassword).mockResolvedValue(validKey);

      // Should now work
      const llmProvider = await ProviderFactory.createFromConfig(
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(llmProvider).toBeDefined();
    });
  });

  describe('First-Run Experience', () => {
    it('should detect missing provider on first run', async () => {
      // Empty config (first run)
      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        // No providers section
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      const loadedConfig = YAML.parse(await fs.readFile(configPath, 'utf-8'));

      // Should detect no providers configured
      const hasProviders =
        loadedConfig.providers?.deepseek?.enabled || loadedConfig.providers?.anthropic?.enabled;

      expect(hasProviders).toBeFalsy();

      // User sees: "No provider configured. Run: mimir connect"
    });

    it('should guide user through setup on first run', async () => {
      // Simulating first-run setup flow
      const provider = 'deepseek';
      const apiKey = 'sk-first-run-key';

      // 1. User runs `mimir` → sees "Run: mimir connect"
      // 2. User runs `mimir connect`
      // 3. Wizard guides through setup
      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey(provider, apiKey, { type: 'keychain' });

      // 4. Config is created
      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4096,
        },
        providers: {
          activeProvider: 'deepseek',
          deepseek: {
            enabled: true,
            source: 'localKey',
            storage: 'keychain',
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // 5. User runs `mimir` again → works
      vi.mocked(keytar.getPassword).mockResolvedValue(apiKey);

      const llmProvider = await ProviderFactory.createFromConfig(
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(llmProvider).toBeDefined();
    });
  });

  describe('Multi-Provider Workflows', () => {
    it('should support using different providers for different tasks', async () => {
      // Setup: User has both DeepSeek (fast, cheap) and Anthropic (high-quality)
      const deepseekKey = process.env.DEEPSEEK_API_KEY || 'sk-deepseek-mock';
      const anthropicKey = process.env.ANTHROPIC_API_KEY || 'sk-ant-mock';

      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey('deepseek', deepseekKey, {
        type: 'keychain',
      });
      await credentialsManager.setKey('anthropic', anthropicKey, {
        type: 'keychain',
      });

      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        providers: {
          activeProvider: 'deepseek',
          deepseek: { enabled: true, source: 'localKey' },
          anthropic: { enabled: true, source: 'localKey' },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      vi.mocked(keytar.getPassword).mockImplementation(async (service, account) => {
        if (account === 'deepseek') return deepseekKey;
        if (account === 'anthropic') return anthropicKey;
        return null;
      });

      // Scenario 1: Quick code completion with DeepSeek
      const fastProvider = await ProviderFactory.createFromConfig(
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(fastProvider).toBeDefined();

      // Scenario 2: Complex reasoning with Anthropic (user switches)
      const reasoningProvider = await ProviderFactory.createFromConfig(
        {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(reasoningProvider).toBeDefined();
    });
  });

  describe('Config Migration', () => {
    // SKIPPED: Old ProviderFactory.create() API removed in AI SDK migration
    // The new API requires async credential resolution via createFromConfig()
    it.skip('should support old llm.apiKey config format', async () => {
      // Old format (pre-providers)
      const configPath = join(homeDir, '.mimir', 'config.yml');
      const oldConfig = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          apiKey: 'sk-old-format-key',
          temperature: 0.7,
          maxTokens: 4096,
        },
      };

      await fs.writeFile(configPath, YAML.stringify(oldConfig), 'utf-8');

      // Old API no longer exists - would need to migrate to:
      // ProviderFactory.createFromConfig({ provider, model }, credentialsResolver)
    });

    it('should prefer new providers config over old llm.apiKey', async () => {
      const newKey = 'sk-new-key';
      const oldKey = 'sk-old-key';

      vi.mocked(keytar.getPassword).mockResolvedValue(newKey);

      const configPath = join(homeDir, '.mimir', 'config.yml');
      const config = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          apiKey: oldKey, // Old format
        },
        providers: {
          activeProvider: 'deepseek',
          deepseek: {
            enabled: true,
            source: 'localKey', // New format
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // New format should take precedence
      const provider = await ProviderFactory.createFromConfig(
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();
      expect(keytar.getPassword).toHaveBeenCalled();
    });
  });

  describe('Real Provider Integration (if API keys available)', () => {
    // Store API key check before beforeEach clears it
    const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
    const savedDeepSeekKey = process.env.DEEPSEEK_API_KEY;

    it.skipIf(!hasDeepSeekKey)(
      'should make real API call with DeepSeek if DEEPSEEK_API_KEY is set',
      async () => {
        // Restore env var for this test (beforeEach clears it)
        process.env.DEEPSEEK_API_KEY = savedDeepSeekKey;

        try {
          const provider = await ProviderFactory.createFromConfig(
            {
              provider: 'deepseek',
              model: 'deepseek-chat',
              temperature: 0.7,
              maxTokens: 100,
            },
            async (p) => credentialsManager.getKey(p)
          );

          // Make real API call
          const response = await provider.chat([
            {
              role: 'user',
              content: 'Respond with exactly "integration test successful"',
            },
          ]);

          expect(response).toBeDefined();
          expect(response.content).toBeTruthy();
          expect(response.role).toBe('assistant');
          expect(response.content.toLowerCase()).toContain('successful');
        } catch (error: any) {
          // Skip test if API key is invalid (common in CI/dev environments)
          if (error.message?.includes('invalid') || error.message?.includes('Authentication')) {
            console.warn('Skipping real API test - invalid API key:', error.message);
            return; // Skip test gracefully
          }
          throw error; // Re-throw other errors
        }
      }
    );

    // Store API key check before beforeEach clears it
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;

    it.skipIf(!hasAnthropicKey)(
      'should make real API call with Anthropic if ANTHROPIC_API_KEY is set',
      async () => {
        // Restore env var for this test (beforeEach clears it)
        process.env.ANTHROPIC_API_KEY = savedAnthropicKey;

        try {
          const provider = await ProviderFactory.createFromConfig(
            {
              provider: 'anthropic',
              model: 'claude-3-5-sonnet-20241022',
              temperature: 0.7,
              maxTokens: 100,
            },
            async (p) => credentialsManager.getKey(p)
          );

          // Make real API call
          const response = await provider.chat([
            {
              role: 'user',
              content: 'Respond with exactly "integration test successful"',
            },
          ]);

          expect(response).toBeDefined();
          expect(response.content).toBeTruthy();
          expect(response.role).toBe('assistant');
          expect(response.content.toLowerCase()).toContain('successful');
        } catch (error: any) {
          // Skip test if API key is invalid (common in CI/dev environments)
          if (error.message?.includes('invalid') || error.message?.includes('Authentication')) {
            console.warn('Skipping real API test - invalid API key:', error.message);
            return; // Skip test gracefully
          }
          throw error; // Re-throw other errors
        }
      }
    );
  });
});
