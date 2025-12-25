/**
 * /help command
 * Show available slash commands
 */

import {
  ISlashCommand,
  SlashCommandContext,
  SlashCommandResult,
} from '../../../core/SlashCommand.js';
import { SlashCommandRegistry } from '../../../core/SlashCommand.js';

export class HelpCommand implements ISlashCommand {
  name = 'help';
  description = 'Show available slash commands';
  usage = '/help [command]';
  aliases = ['?', 'h'];

  constructor(private registry: SlashCommandRegistry) {}

  async execute(args: string[], context: SlashCommandContext): Promise<SlashCommandResult> {
    // Show help for specific command
    if (args.length > 0) {
      const commandName = args[0];
      if (!commandName) {
        return {
          success: false,
          error: 'Command name is required',
        };
      }
      const command = this.registry.get(commandName);

      if (!command) {
        return {
          success: false,
          error: `Command not found: /${commandName}`,
        };
      }

      const helpText = [
        `Command: /${command.name}`,
        `Description: ${command.description}`,
        `Usage: ${command.usage}`,
        command.aliases?.length ? `Aliases: ${command.aliases.map((a) => `/${a}`).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      if (context.sendPrompt) {
        context.sendPrompt(helpText);
      }

      return {
        success: true,
        data: { helpText },
      };
    }

    // Show all commands
    const allCommands = this.registry.getAll();
    const helpText = [
      'Available Commands:',
      '',
      ...allCommands.map((cmd) => `  /${cmd.name.padEnd(15)} - ${cmd.description}`),
      '',
      'Type /help <command> for more details',
    ].join('\n');

    if (context.sendPrompt) {
      context.sendPrompt(helpText);
    }

    return {
      success: true,
      data: { helpText },
    };
  }
}
