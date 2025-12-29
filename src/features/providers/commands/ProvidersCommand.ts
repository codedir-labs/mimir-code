/**
 * /providers command - Provider management and health checks
 */

import { Command } from 'commander';
import { CredentialsManager } from '@/shared/utils/CredentialsManager.js';
import { ProviderFactory } from '@codedir/mimir-agents-node/providers';
import { getAllProviders, getProvider, getDefaultModel } from '@codedir/mimir-agents';
import { logger } from '@/shared/utils/logger.js';
import chalk from 'chalk';

/**
 * Test provider health
 */
async function testProviderHealth(
  provider: string,
  apiKey: string
): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const startTime = Date.now();

  try {
    logger.debug('Testing provider health', { provider });

    // Get default model from registry
    const defaultModel = getDefaultModel(provider);
    if (!defaultModel) {
      return {
        healthy: false,
        error: `No default model found for provider: ${provider}`,
      };
    }

    // Create provider using factory
    const testProvider = await ProviderFactory.createFromConfig(
      {
        provider,
        model: defaultModel.id,
        temperature: 0.7,
        maxTokens: 50,
      },
      async () => apiKey
    );

    // Test with a simple completion
    const response = await testProvider.chat([
      {
        role: 'user',
        content: 'Reply with just "OK"',
      },
    ]);

    const latency = Date.now() - startTime;

    // Check if response is valid
    if (response.content && response.content.trim().length > 0) {
      return { healthy: true, latency };
    }

    return { healthy: false, error: 'Empty response from provider' };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    logger.error('Provider health check failed', { provider, error });
    return {
      healthy: false,
      latency,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * List all available providers with status
 */
async function listProviders(showAll: boolean): Promise<void> {
  const credentialsManager = new CredentialsManager();
  const allProviders = getAllProviders();

  // Get configured providers
  const configuredProviders = await credentialsManager.listProviders();
  const configuredSet = new Set(configuredProviders.map((p) => p.provider));

  console.log('\n' + chalk.bold('Available LLM Providers:') + '\n');

  // Group by category
  const categories = {
    popular: allProviders.filter((p) => p.category === 'popular'),
    cloud: allProviders.filter((p) => p.category === 'cloud'),
    'open-source': allProviders.filter((p) => p.category === 'open-source'),
    proxy: allProviders.filter((p) => p.category === 'proxy'),
  };

  for (const [category, providers] of Object.entries(categories)) {
    if (providers.length === 0) continue;

    console.log(chalk.cyan.bold(`${category.toUpperCase()}:`));

    for (const provider of providers) {
      const isConfigured = configuredSet.has(provider.id);
      const status = isConfigured ? chalk.green('✓') : chalk.gray('○');
      const defaultModel = getDefaultModel(provider.id);

      console.log(`  ${status} ${chalk.bold(provider.name)} (${provider.id})`);
      console.log(`    ${chalk.gray(provider.description)}`);

      if (showAll || isConfigured) {
        console.log(`    ${chalk.gray('Default model:')} ${defaultModel?.name || 'N/A'}`);
        console.log(`    ${chalk.gray('Models:')} ${provider.models.length}`);
        console.log(`    ${chalk.gray('Docs:')} ${provider.docsUrl || provider.signupUrl}`);
      }

      console.log();
    }
  }

  console.log(
    chalk.gray(`Legend: ${chalk.green('✓')} Configured | ${chalk.gray('○')} Not configured`)
  );
  console.log(chalk.gray(`\nRun "mimir connect <provider>" to configure a provider.`));
  console.log();
}

/**
 * Check health of configured providers
 */
async function checkHealth(provider?: string): Promise<void> {
  const credentialsManager = new CredentialsManager();

  if (provider) {
    // Check specific provider
    console.log(`\nChecking health of ${chalk.bold(provider)}...\n`);

    const apiKey = await credentialsManager.getKey(provider);
    if (!apiKey) {
      console.log(chalk.red('✗') + ` Provider "${provider}" is not configured.`);
      console.log(chalk.gray(`  Run "mimir connect ${provider}" to configure.\n`));
      return;
    }

    const result = await testProviderHealth(provider, apiKey);

    if (result.healthy) {
      console.log(chalk.green('✓') + ` ${provider} is ${chalk.green('healthy')}`);
      console.log(chalk.gray(`  Latency: ${result.latency}ms\n`));
    } else {
      console.log(chalk.red('✗') + ` ${provider} is ${chalk.red('unhealthy')}`);
      console.log(chalk.gray(`  Error: ${result.error}`));
      console.log(chalk.gray(`  Latency: ${result.latency}ms\n`));
    }
  } else {
    // Check all configured providers
    const providers = await credentialsManager.listProviders();

    if (providers.length === 0) {
      console.log('\nNo providers configured.');
      console.log(chalk.gray('Run "mimir connect" to set up a provider.\n'));
      return;
    }

    console.log('\n' + chalk.bold('Provider Health Status:') + '\n');

    for (const providerMeta of providers) {
      const apiKey = await credentialsManager.getKey(providerMeta.provider);
      if (!apiKey) continue;

      process.stdout.write(`  Checking ${providerMeta.provider}... `);

      const result = await testProviderHealth(providerMeta.provider, apiKey);

      if (result.healthy) {
        console.log(chalk.green('✓ healthy') + chalk.gray(` (${result.latency}ms)`));
      } else {
        console.log(chalk.red('✗ unhealthy'));
        console.log(chalk.gray(`    Error: ${result.error}`));
      }
    }

    console.log();
  }
}

/**
 * Show provider information
 */
async function showProviderInfo(providerId: string): Promise<void> {
  const provider = getProvider(providerId);

  if (!provider) {
    console.log(chalk.red(`\nError: Unknown provider "${providerId}"\n`));
    console.log(chalk.gray('Run "mimir providers list" to see available providers.\n'));
    return;
  }

  const credentialsManager = new CredentialsManager();
  const isConfigured = await credentialsManager.hasKey(providerId);

  console.log('\n' + chalk.bold(provider.name) + chalk.gray(` (${provider.id})`));
  console.log(chalk.gray('━'.repeat(60)));
  console.log();

  console.log(chalk.bold('Description:'));
  console.log(`  ${provider.description}`);
  console.log();

  console.log(chalk.bold('Status:'));
  console.log(`  ${isConfigured ? chalk.green('✓ Configured') : chalk.gray('○ Not configured')}`);
  console.log();

  console.log(chalk.bold('Category:'));
  console.log(`  ${provider.category}`);
  console.log();

  console.log(chalk.bold('Resources:'));
  console.log(`  Signup: ${provider.signupUrl}`);
  if (provider.docsUrl) {
    console.log(`  Docs:   ${provider.docsUrl}`);
  }
  console.log();

  console.log(chalk.bold('Available Models:'));
  for (const model of provider.models) {
    const isDefault = model.default ? chalk.yellow(' (default)') : '';
    console.log(`  • ${chalk.bold(model.name)}${isDefault}`);
    console.log(`    ID: ${model.id}`);
    console.log(
      `    Context: ${(model.contextWindow / 1000).toFixed(0)}K | Output: ${(model.maxOutput / 1000).toFixed(0)}K`
    );
    console.log(
      `    Cost: ${model.costTier} | Quality: ${'★'.repeat(model.quality)}${'☆'.repeat(5 - model.quality)}`
    );
    if (model.bestFor && model.bestFor.length > 0) {
      console.log(`    Best for: ${model.bestFor.join(', ')}`);
    }
    console.log();
  }

  if (!isConfigured) {
    console.log(chalk.gray(`Run "mimir connect ${providerId}" to configure this provider.`));
  }
  console.log();
}

/**
 * Create providers command
 */
export function createProvidersCommand(): Command {
  const command = new Command('providers');

  command
    .description('Manage LLM providers')
    .option('-l, --list', 'List all available providers')
    .option('-a, --all', 'Show details for all providers')
    .option('-c, --check [provider]', 'Check provider health status')
    .option('-i, --info <provider>', 'Show detailed provider information')
    .action(
      async (options: {
        list?: boolean;
        all?: boolean;
        check?: string | boolean;
        info?: string;
      }) => {
        try {
          if (options.list) {
            await listProviders(!!options.all);
          } else if (options.check !== undefined) {
            const provider = typeof options.check === 'string' ? options.check : undefined;
            await checkHealth(provider);
          } else if (options.info) {
            await showProviderInfo(options.info);
          } else {
            // Default: list providers
            await listProviders(false);
          }
        } catch (error: any) {
          logger.error('Providers command failed', { error });
          console.error(chalk.red('\nError:'), error.message);
          process.exit(1);
        }
      }
    );

  return command;
}
