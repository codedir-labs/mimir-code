/**
 * /model command
 * Switch LLM provider/model
 *
 * Updated to use dynamic provider registry from mimir-agents
 */

import { z } from 'zod';
import {
  ISlashCommand,
  SlashCommandContext,
  SlashCommandResult,
  CommandParameter,
} from '@/features/chat/slash-commands/SlashCommand.js';
import { getAllProviders, getProvider } from '@codedir/mimir-agents';

export class ModelCommand implements ISlashCommand {
  name = 'model';
  description = 'Switch LLM provider/model';
  usage = '/model <provider> [model]';
  aliases = ['provider', 'm'];

  // Cache provider list for suggestions
  private static providerIds: string[] | null = null;

  private static getProviderIds(): string[] {
    if (!ModelCommand.providerIds) {
      ModelCommand.providerIds = getAllProviders().map((p) => p.id);
    }
    return ModelCommand.providerIds;
  }

  parameters: CommandParameter[] = [
    {
      name: 'provider',
      description: 'The LLM provider to use',
      required: true,
      suggestions: ModelCommand.getProviderIds(),
    },
    {
      name: 'model',
      description: 'Optional specific model name',
      required: false,
    },
  ];

  // Dynamic schema using provider registry
  argsSchema = z.tuple([
    z.string(), // Accept any string, validate against registry in execute()
    z.string().optional(),
  ]);

  getParameterSuggestions(
    paramIndex: number,
    context: SlashCommandContext,
    currentArgs?: string[]
  ): string[] {
    if (paramIndex === 0) {
      // Provider suggestions from registry
      return ModelCommand.getProviderIds();
    }

    // Model suggestions based on provider from registry
    if (paramIndex === 1) {
      const providerId = currentArgs?.[0]?.toLowerCase() || context.currentProvider.toLowerCase();
      const providerDef = getProvider(providerId);

      if (providerDef) {
        // Return all model IDs for this provider
        return providerDef.models.map((m) => m.id);
      }

      return [];
    }

    return [];
  }

  async execute(args: string[], context: SlashCommandContext): Promise<SlashCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Usage: /model <provider> [model]',
      };
    }

    const providerId = args[0]!.toLowerCase();
    const modelId = args[1]?.toLowerCase();

    // Validate provider exists in registry
    const providerDef = getProvider(providerId);
    if (!providerDef) {
      const availableProviders = ModelCommand.getProviderIds();
      return {
        success: false,
        error: `Unknown provider "${providerId}".\n\nAvailable providers: ${availableProviders.join(', ')}\n\nRun "mimir connect ${providerId}" to configure.`,
      };
    }

    // If model specified, validate it exists for this provider
    if (modelId) {
      const modelExists = providerDef.models.some((m) => m.id === modelId);
      if (!modelExists) {
        const availableModels = providerDef.models.map((m) => m.id);
        return {
          success: false,
          error: `Unknown model "${modelId}" for provider "${providerId}".\n\nAvailable models: ${availableModels.join(', ')}`,
        };
      }
    }

    // Request model switch
    if (context.requestModelSwitch) {
      await context.requestModelSwitch(providerId, modelId);
      return {
        success: true,
        action: 'switch_model',
        data: { provider: providerId, model: modelId },
      };
    }

    return {
      success: false,
      error: 'Model switching not supported in this context',
    };
  }
}
