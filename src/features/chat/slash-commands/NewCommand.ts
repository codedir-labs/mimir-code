/**
 * /new command
 * Starts a new chat conversation
 */

import {
  ISlashCommand,
  SlashCommandContext,
  SlashCommandResult,
} from '@/features/chat/slash-commands/SlashCommand.js';

export class NewCommand implements ISlashCommand {
  name = 'new';
  description = 'Start a new chat conversation';
  usage = '/new';
  aliases = ['n', 'clear'];

  async execute(_args: string[], context: SlashCommandContext): Promise<SlashCommandResult> {
    if (context.requestNewChat) {
      context.requestNewChat();
      return {
        success: true,
        action: 'new_chat',
      };
    }

    return {
      success: false,
      error: 'New chat not supported in this context',
    };
  }
}
