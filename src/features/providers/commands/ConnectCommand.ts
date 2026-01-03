/**
 * /connect command - Interactive provider setup wizard
 */

import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { CredentialsManager } from '@/shared/utils/CredentialsManager.js';
import type { Config } from '@/shared/config/schemas.js';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
import { logger } from '@/shared/utils/logger.js';
import type { ProviderOption, ProviderConfigResult } from '../components/ProviderSetupWizard.js';
import { ProviderSetupWizard } from '../components/ProviderSetupWizard.js';
import { ProviderFactory } from '@codedir/mimir-agents-node/providers';
import { getAllProviders, getDefaultModel, type ProviderDefinition } from '@codedir/mimir-agents';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import YAML from 'yaml';

/**
 * Get available providers from registry
 */
function getAvailableProviders(): ProviderOption[] {
  const providers = getAllProviders();

  return providers.map((p: ProviderDefinition) => ({
    label: p.name,
    value: p.id,
    description: p.description,
    enabled: true, // All providers in registry are enabled
  }));
}

/**
 * Test provider connection
 */
async function testProviderConnection(provider: string, apiKey: string): Promise<boolean> {
  try {
    logger.debug('Testing provider connection', { provider });

    // Get default model from registry
    const defaultModel = getDefaultModel(provider);
    if (!defaultModel) {
      throw new Error(`No default model found for provider: ${provider}`);
    }

    // Create provider using factory
    const testProvider = await ProviderFactory.createFromConfig(
      {
        provider,
        model: defaultModel.id,
        temperature: 0.7,
        maxTokens: 100,
      },
      async () => apiKey // Use provided API key for test
    );

    // Test with a simple completion
    const response = await testProvider.chat([
      {
        role: 'user',
        content: 'Say "test successful" if you can read this.',
      },
    ]);

    return response.content?.toLowerCase().includes('test successful') ?? false;
  } catch (error) {
    logger.error('Provider connection test failed', { provider, error });
    return false;
  }
}

/**
 * Update provider configuration in ~/.mimir/config.yml
 */
async function updateProvidersConfig(results: ProviderConfigResult[]): Promise<void> {
  if (results.length === 0) {
    logger.warn('No provider results to update config');
    return;
  }

  const firstResult = results[0]!;
  const configPath = join(homedir(), '.mimir', 'config.yml');

  // Load existing config or create new
  let config: Partial<Config> = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = YAML.parse(content) || {};
  } catch (error) {
    // File doesn't exist, will create new
    logger.debug('Config file not found, creating new', { configPath, error });
  }

  // Ensure llm section exists
  if (!config.llm) {
    config.llm = {
      provider: firstResult.provider,
      temperature: 0.7,
    };
  }

  // Set provider to first configured (primary provider)
  config.llm.provider = firstResult.provider;

  // Get default model for the provider
  const defaultModel = getDefaultModel(firstResult.provider);
  if (defaultModel) {
    config.llm.model = defaultModel.id;
  }

  // Ensure directory exists
  const configDir = join(homedir(), '.mimir');
  await fs.mkdir(configDir, { recursive: true });

  // Write updated config
  await fs.writeFile(configPath, YAML.stringify(config), 'utf-8');

  logger.info('Provider configuration updated', {
    configPath,
    provider: firstResult.provider,
    model: config.llm.model,
  });
}

/**
 * Run interactive setup wizard
 */
async function runWizard(config: Config, preselectedProvider?: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const credentialsManager = new CredentialsManager();

    const { waitUntilExit } = render(
      React.createElement(ProviderSetupWizard, {
        theme: config.ui.theme,
        availableProviders: getAvailableProviders(),
        testConnection: testProviderConnection,
        preselectedProvider,
        onComplete: async (results: ProviderConfigResult[]) => {
          try {
            // Save API keys
            for (const result of results) {
              await credentialsManager.setKey(result.provider, result.apiKey, {
                type: result.storage,
              });
            }

            // Update config
            await updateProvidersConfig(results);

            console.log('\n✓ Setup complete!');
            console.log(`\nConfigured ${results.length} provider(s):`);
            for (const result of results) {
              console.log(`  • ${result.provider} (${result.storage})`);
            }
            console.log('\nYou can now start chatting: mimir\n');

            waitUntilExit();
            resolve();
          } catch (error) {
            logger.error('Failed to save provider configuration', { error });
            waitUntilExit();
            reject(error);
          }
        },
        onCancel: () => {
          console.log('\nSetup cancelled.\n');
          waitUntilExit();
          resolve();
        },
      })
    );
  });
}

/**
 * List configured providers
 */
async function listProviders(): Promise<void> {
  const credentialsManager = new CredentialsManager();
  const providers = await credentialsManager.listProviders();

  if (providers.length === 0) {
    console.log('\nNo providers configured.');
    console.log('Run "mimir connect" to set up a provider.\n');
    return;
  }

  console.log('\nConfigured Providers:\n');
  for (const provider of providers) {
    console.log(`  • ${provider.provider}`);
    console.log(`    Storage: ${provider.storage}`);
    console.log(`    Configured: ${provider.configuredAt.toLocaleDateString()}`);
    console.log();
  }
}

/**
 * Remove provider
 */
async function removeProvider(provider: string): Promise<void> {
  const credentialsManager = new CredentialsManager();

  // Check if provider exists
  const hasKey = await credentialsManager.hasKey(provider);
  if (!hasKey) {
    console.log(`\nProvider "${provider}" is not configured.\n`);
    return;
  }

  // Delete credentials
  await credentialsManager.deleteKey(provider);

  // Note: We don't update config.llm.provider here
  // The user will need to run `mimir connect` again to set a new provider
  // or manually edit ~/.mimir/config.yml

  console.log(`\n✓ Provider "${provider}" credentials removed.`);
  console.log(`   Run "mimir connect" to configure a new provider.\n`);
}

/**
 * Quick setup for single provider
 */
async function quickSetup(provider: string, config: Config): Promise<void> {
  // Validate provider exists in registry
  const availableProviders = getAvailableProviders();
  const providerOption = availableProviders.find((p) => p.value === provider);

  if (!providerOption) {
    console.error(`\nError: Unknown provider "${provider}"`);
    console.log('\nAvailable providers:');
    availableProviders.forEach((p) => {
      console.log(`  • ${p.value} - ${p.description}`);
    });
    console.log();
    return;
  }

  // Run wizard with single provider pre-selected
  await runWizard(config, provider);
}

/**
 * Create /connect command
 */
export function createConnectCommand(): Command {
  const command = new Command('connect');

  const availableProviders = getAvailableProviders();
  const providersList = availableProviders.map((p) => p.value).join(', ');

  command
    .description('Configure LLM provider API keys')
    .option('-l, --list', 'List configured providers')
    .option('-r, --remove <provider>', 'Remove provider configuration')
    .argument('[provider]', `Provider to configure (${providersList})`)
    .action(async (provider?: string, options?: { list?: boolean; remove?: string }) => {
      try {
        // Load config
        const fs = new FileSystemAdapter();
        const configLoader = new ConfigLoader(fs);
        const { config } = await configLoader.load();

        if (options?.list) {
          await listProviders();
        } else if (options?.remove) {
          await removeProvider(options.remove);
        } else if (provider) {
          await quickSetup(provider, config);
        } else {
          await runWizard(config);
        }
      } catch (error) {
        logger.error('Connect command failed', { error });
        console.error('\nError:', (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
