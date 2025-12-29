/**
 * /mode command
 * Switch chat mode (plan/act/discuss)
 */

import { z } from 'zod';
import {
  ISlashCommand,
  SlashCommandContext,
  SlashCommandResult,
  CommandParameter,
} from '@/features/chat/slash-commands/SlashCommand.js';

export class ModeCommand implements ISlashCommand {
  name = 'mode';
  description = 'Switch chat mode (plan/act/discuss)';
  usage = '/mode <plan|act|discuss>';

  parameters: CommandParameter[] = [
    {
      name: 'mode',
      description: 'The mode to switch to',
      required: true,
      suggestions: ['plan', 'act', 'discuss'],
    },
  ];

  argsSchema = z.tuple([z.enum(['plan', 'act', 'discuss'])]);

  getParameterSuggestions(
    paramIndex: number,
    _context: SlashCommandContext,
    _currentArgs?: string[]
  ): string[] {
    if (paramIndex === 0) {
      return ['plan', 'act', 'discuss'];
    }
    return [];
  }

  async execute(args: string[], context: SlashCommandContext): Promise<SlashCommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Usage: /mode <plan|act|discuss>',
      };
    }

    const mode = args[0] as 'plan' | 'act' | 'discuss';

    if (context.requestModeSwitch) {
      context.requestModeSwitch(mode);
      return {
        success: true,
        action: 'switch_mode',
        data: { mode },
      };
    }

    return {
      success: false,
      error: 'Mode switching not supported in this context',
    };
  }
}
