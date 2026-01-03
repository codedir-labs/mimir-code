/**
 * Integration tests for provider setup flow
 * Tests the full connect command workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialsManager } from '@/shared/utils/CredentialsManager.js';
import { ProviderFactory } from '@codedir/mimir-agents-node/providers';
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

describe('Provider Setup Flow Integration', () => {
  let testDir: string;
  let credentialsManager: CredentialsManager;
  let configPath: string;
  let savedEnvVars: Record<string, string | undefined> = {};

  beforeEach(async () => {
    testDir = join(tmpdir(), `mimir-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Save and clear env vars that could interfere with tests
    const envVarsToSave = ['DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
    for (const envVar of envVarsToSave) {
      savedEnvVars[envVar] = process.env[envVar];
      delete process.env[envVar];
    }

    credentialsManager = new CredentialsManager();
    configPath = join(testDir, 'config.yml');

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

  describe('End-to-End Provider Configuration', () => {
    it('should complete full provider setup flow', async () => {
      // 1. Store API key
      const provider = 'deepseek';
      const apiKey = 'sk-test-integration-123';

      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey(provider, apiKey, { type: 'keychain' });

      expect(keytar.setPassword).toHaveBeenCalledWith('com.codedir.mimir', provider, apiKey);

      // 2. Create config file
      const config = {
        providers: {
          activeProvider: provider,
          deepseek: {
            enabled: true,
            source: 'localKey',
            storage: 'keychain',
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // 3. Verify config is readable
      const configContent = await fs.readFile(configPath, 'utf-8');
      const parsedConfig = YAML.parse(configContent);

      expect(parsedConfig.providers.activeProvider).toBe(provider);
      expect(parsedConfig.providers.deepseek.enabled).toBe(true);
      expect(parsedConfig.providers.deepseek.source).toBe('localKey');

      // 4. Retrieve API key
      vi.mocked(keytar.getPassword).mockResolvedValue(apiKey);
      const retrievedKey = await credentialsManager.getKey(provider);

      expect(retrievedKey).toBe(apiKey);

      // 5. Create provider instance
      const llmProvider = await ProviderFactory.createFromConfig(
        {
          provider: provider,
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4096,
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(llmProvider).toBeDefined();
    });

    it('should handle multiple providers with different storage types', async () => {
      const providers = {
        deepseek: {
          apiKey: 'sk-deepseek-123',
          storage: 'keychain' as const,
        },
        anthropic: {
          apiKey: 'sk-ant-456',
          storage: 'file' as const,
        },
      };

      // Use default credentials path (CredentialsManager.getKey doesn't support custom paths)
      process.env.HOME = testDir; // Override home dir for this test

      // Store DeepSeek in keychain
      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey('deepseek', providers.deepseek.apiKey, {
        type: 'keychain',
      });

      // Store Anthropic in file (will use default path from HOME env)
      await credentialsManager.setKey('anthropic', providers.anthropic.apiKey, {
        type: 'file',
      });

      // Retrieve both
      vi.mocked(keytar.getPassword).mockImplementation(async (service, account) => {
        if (account === 'deepseek') return providers.deepseek.apiKey;
        return null;
      });

      const deepseekKey = await credentialsManager.getKey('deepseek');
      const anthropicKey = await credentialsManager.getKey('anthropic');

      expect(deepseekKey).toBe(providers.deepseek.apiKey);
      expect(anthropicKey).toBe(providers.anthropic.apiKey);
    });
  });

  describe('Config File Integration', () => {
    it('should update config when provider is added', async () => {
      // Initial config (no providers)
      const initialConfig = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4096,
        },
      };

      await fs.writeFile(configPath, YAML.stringify(initialConfig), 'utf-8');

      // Add provider config
      const updatedConfig = {
        ...initialConfig,
        providers: {
          activeProvider: 'deepseek',
          deepseek: {
            enabled: true,
            source: 'localKey',
            storage: 'keychain',
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(updatedConfig), 'utf-8');

      // Verify update
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.providers).toBeDefined();
      expect(parsed.providers.activeProvider).toBe('deepseek');
    });

    it('should preserve existing config when adding providers', async () => {
      const existingConfig = {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.5,
          maxTokens: 2000,
        },
        ui: {
          theme: 'dark',
        },
        permissions: {
          autoAccept: true,
        },
      };

      await fs.writeFile(configPath, YAML.stringify(existingConfig), 'utf-8');

      // Add providers
      const updatedConfig = {
        ...existingConfig,
        providers: {
          activeProvider: 'deepseek',
          deepseek: {
            enabled: true,
            source: 'localKey',
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(updatedConfig), 'utf-8');

      // Verify existing config is preserved
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.llm.temperature).toBe(0.5);
      expect(parsed.ui.theme).toBe('dark');
      expect(parsed.permissions.autoAccept).toBe(true);
      expect(parsed.providers.activeProvider).toBe('deepseek');
    });
  });

  describe('Provider Switching', () => {
    it('should allow switching active provider', async () => {
      // Configure multiple providers
      vi.mocked(keytar.setPassword).mockResolvedValue();

      await credentialsManager.setKey('deepseek', 'sk-deepseek-123', {
        type: 'keychain',
      });
      await credentialsManager.setKey('anthropic', 'sk-ant-456', {
        type: 'keychain',
      });

      // Initial config with DeepSeek active
      const config = {
        providers: {
          activeProvider: 'deepseek',
          deepseek: { enabled: true, source: 'localKey' },
          anthropic: { enabled: true, source: 'localKey' },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // Switch to Anthropic
      config.providers.activeProvider = 'anthropic';
      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // Verify switch
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.providers.activeProvider).toBe('anthropic');
    });

    it('should create provider instance for switched provider', async () => {
      const anthropicKey = 'sk-ant-integration-test';

      vi.mocked(keytar.getPassword).mockResolvedValue(anthropicKey);

      const provider = await ProviderFactory.createFromConfig(
        {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
        },
        async (p) => credentialsManager.getKey(p)
      );

      expect(provider).toBeDefined();
    });
  });

  describe('Provider Removal', () => {
    it('should clean up credentials when provider is removed', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-to-be-removed';

      // Add provider
      vi.mocked(keytar.setPassword).mockResolvedValue();
      await credentialsManager.setKey(provider, apiKey, { type: 'keychain' });

      // Verify added
      vi.mocked(keytar.getPassword).mockResolvedValue(apiKey);
      let key = await credentialsManager.getKey(provider);
      expect(key).toBe(apiKey);

      // Remove provider
      vi.mocked(keytar.deletePassword).mockResolvedValue(true);
      await credentialsManager.deleteKey(provider);

      expect(keytar.deletePassword).toHaveBeenCalledWith('com.codedir.mimir', provider);

      // Verify removed
      vi.mocked(keytar.getPassword).mockResolvedValue(null);
      key = await credentialsManager.getKey(provider);
      expect(key).toBeNull();
    });

    it('should update config when provider is removed', async () => {
      const config = {
        providers: {
          activeProvider: 'deepseek',
          deepseek: { enabled: true, source: 'localKey' },
          anthropic: { enabled: true, source: 'localKey' },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // Remove DeepSeek
      config.providers.deepseek = { enabled: false, source: 'disabled' };
      config.providers.activeProvider = 'anthropic'; // Switch active

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      // Verify
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.providers.deepseek.enabled).toBe(false);
      expect(parsed.providers.activeProvider).toBe('anthropic');
    });
  });

  describe('Error Scenarios', () => {
    it('should fail gracefully when API key is missing', async () => {
      // No key stored
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      await expect(
        ProviderFactory.createFromConfig(
          {
            provider: 'deepseek',
            model: 'deepseek-chat',
          },
          async (p) => credentialsManager.getKey(p)
        )
      ).rejects.toThrow('No API key configured');
    });

    it('should handle corrupted config file', async () => {
      // Write invalid YAML
      await fs.writeFile(configPath, 'invalid: yaml: content: [', 'utf-8');

      // Should throw when parsing
      await expect(async () => {
        const content = await fs.readFile(configPath, 'utf-8');
        YAML.parse(content);
      }).rejects.toThrow();
    });

    it('should handle keychain errors gracefully', async () => {
      const provider = 'deepseek';

      // Simulate keychain error
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('Keychain access denied'));

      await expect(
        credentialsManager.setKey(provider, 'sk-key', { type: 'keychain' })
      ).rejects.toThrow('Failed to store API key');
    });
  });

  describe('Environment Variable Fallback', () => {
    it('should use environment variable if available', async () => {
      const provider = 'deepseek';
      const envKey = 'sk-from-env-123';

      // Set env var
      process.env.DEEPSEEK_API_KEY = envKey;

      // Should return env key without checking keychain
      const key = await credentialsManager.getKey(provider);

      expect(key).toBe(envKey);
      expect(keytar.getPassword).not.toHaveBeenCalled();

      // Cleanup
      delete process.env.DEEPSEEK_API_KEY;
    });

    it('should prioritize env var over keychain', async () => {
      const provider = 'anthropic';
      const envKey = 'sk-from-env';
      const keychainKey = 'sk-from-keychain';

      process.env.ANTHROPIC_API_KEY = envKey;
      vi.mocked(keytar.getPassword).mockResolvedValue(keychainKey);

      const key = await credentialsManager.getKey(provider);

      // Should use env var
      expect(key).toBe(envKey);

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  describe('Multi-Machine Sync Simulation', () => {
    it('should work with file-based credentials across instances', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-shared-key';

      // Use default credentials path (CredentialsManager.getKey doesn't support custom paths)
      process.env.HOME = testDir; // Override home dir for this test

      // Machine 1: Store credentials
      const manager1 = new CredentialsManager();
      await manager1.setKey(provider, apiKey, { type: 'file' });

      // Machine 2: Retrieve credentials (new instance)
      const manager2 = new CredentialsManager();
      vi.mocked(keytar.getPassword).mockResolvedValue(null); // Force file read

      const retrievedKey = await manager2.getKey(provider);

      // Should retrieve same key (assuming same machine encryption)
      expect(retrievedKey).toBe(apiKey);
    });
  });

  describe('Provider Configuration Validation', () => {
    it('should validate provider config structure', async () => {
      const config = {
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

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = YAML.parse(content);

      // Validate structure
      expect(parsed.providers).toBeDefined();
      expect(parsed.providers.activeProvider).toBe('deepseek');
      expect(parsed.providers.deepseek).toBeDefined();
      expect(parsed.providers.deepseek.enabled).toBe(true);
      expect(parsed.providers.deepseek.source).toBe('localKey');
      expect(parsed.providers.deepseek.storage).toBe('keychain');
    });

    it('should handle provider with custom model', async () => {
      const config = {
        providers: {
          activeProvider: 'anthropic',
          anthropic: {
            enabled: true,
            source: 'localKey',
            model: 'claude-opus-4-5-20251101', // Custom model
          },
        },
      };

      await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.providers.anthropic.model).toBe('claude-opus-4-5-20251101');
    });
  });
});
