/**
 * /model command
 * Switch LLM provider/model
 */

import { z } from 'zod';
import {
  ISlashCommand,
  SlashCommandContext,
  SlashCommandResult,
  CommandParameter,
} from '../../../core/SlashCommand.js';

export class ModelCommand implements ISlashCommand {
  name = 'model';
  description = 'Switch LLM provider/model';
  usage = '/model <provider> [model]';
  aliases = ['provider', 'm'];

  parameters: CommandParameter[] = [
    {
      name: 'provider',
      description: 'The LLM provider to use',
      required: true,
      suggestions: ['deepseek', 'anthropic', 'openai', 'google', 'gemini', 'qwen', 'ollama'],
    },
    {
      name: 'model',
      description: 'Optional specific model name',
      required: false,
    },
  ];

  argsSchema = z.tuple([
    z.enum(['deepseek', 'anthropic', 'openai', 'google', 'gemini', 'qwen', 'ollama']),
    z.string().optional(),
  ]);

  getParameterSuggestions(
    paramIndex: number,
    context: SlashCommandContext,
    currentArgs?: string[]
  ): string[] {
    if (paramIndex === 0) {
      return ['deepseek', 'anthropic', 'openai', 'google', 'gemini', 'qwen', 'ollama'];
    }

    // Model suggestions based on provider
    // Use the provider the user is currently typing (currentArgs[0]), not the configured provider
    if (paramIndex === 1) {
      const provider = currentArgs?.[0]?.toLowerCase() || context.currentProvider.toLowerCase();
      switch (provider) {
        case 'deepseek':
          return ['deepseek-chat', 'deepseek-reasoner'];
        case 'anthropic':
          return ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-haiku-4-5'];
        case 'openai':
          return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        case 'google':
        case 'gemini':
          return ['gemini-pro', 'gemini-ultra'];
        default:
          return [];
      }
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

    const provider = args[0];
    const model = args[1] ?? undefined;

    if (context.requestModelSwitch && provider) {
      void context.requestModelSwitch(provider, model);
      return {
        success: true,
        action: 'switch_model',
        data: { provider, model },
      };
    }

    return {
      success: false,
      error: 'Model switching not supported in this context',
    };
  }
}
