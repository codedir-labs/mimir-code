/**
 * Slash command interface and registry
 * Provides foundation for built-in and custom slash commands in chat interface
 */

import { z } from 'zod';

/**
 * Result of executing a slash command
 */
export interface SlashCommandResult {
  success: boolean;
  // For built-in commands that manipulate state
  action?: 'new_chat' | 'switch_mode' | 'switch_model' | 'send_prompt' | 'open_theme_selector';
  data?: unknown;
  error?: string;
  // For custom commands that inject prompts
  prompt?: string;
}

/**
 * Context provided to slash commands during execution
 */
export interface SlashCommandContext {
  // Current chat state (read-only for commands)
  currentMode: 'plan' | 'act' | 'discuss';
  currentProvider: string;
  currentModel: string;
  messageCount: number;
  // Callbacks for commands to request actions
  requestModeSwitch?: (mode: 'plan' | 'act' | 'discuss') => void;
  requestModelSwitch?: (provider: string, model?: string) => void | Promise<void>;
  requestNewChat?: () => void;
  requestThemeChange?: (theme: string) => void | Promise<void>;
  // For custom commands - send prompt to agent
  sendPrompt?: (prompt: string) => void;
}

/**
 * Parameter definition for commands
 */
export interface CommandParameter {
  name: string;
  description: string;
  required: boolean;
  // For autocomplete - provide suggestions
  suggestions?: string[];
}

/**
 * Slash command interface
 */
export interface ISlashCommand {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  // Parameter definitions for help and autocomplete
  parameters?: CommandParameter[];
  // Zod schema for argument validation (optional)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argsSchema?: z.ZodSchema<any>;
  // Execute the command with parsed arguments
  execute(args: string[], context: SlashCommandContext): Promise<SlashCommandResult>;
  // Get parameter suggestions for autocomplete (optional)
  // currentArgs: already-typed arguments (e.g., for "/model deepseek ", currentArgs = ["deepseek"])
  getParameterSuggestions?: (
    paramIndex: number,
    context: SlashCommandContext,
    currentArgs?: string[]
  ) => string[];
}

/**
 * Registry for slash commands
 */
export class SlashCommandRegistry {
  private commands: Map<string, ISlashCommand> = new Map();
  private aliases: Map<string, string> = new Map();

  register(command: ISlashCommand): void {
    this.commands.set(command.name, command);

    // Register aliases
    if (command.aliases) {
      command.aliases.forEach((alias) => {
        this.aliases.set(alias, command.name);
      });
    }
  }

  unregister(commandName: string): void {
    const command = this.commands.get(commandName);
    if (command?.aliases) {
      command.aliases.forEach((alias) => this.aliases.delete(alias));
    }
    this.commands.delete(commandName);
  }

  get(nameOrAlias: string): ISlashCommand | undefined {
    // Check if it's an alias first
    const actualName = this.aliases.get(nameOrAlias) ?? nameOrAlias;
    return this.commands.get(actualName);
  }

  getAll(): ISlashCommand[] {
    return Array.from(this.commands.values());
  }

  has(nameOrAlias: string): boolean {
    return this.aliases.has(nameOrAlias) || this.commands.has(nameOrAlias);
  }

  async execute(
    nameOrAlias: string,
    args: string[],
    context: SlashCommandContext
  ): Promise<SlashCommandResult> {
    const command = this.get(nameOrAlias);

    if (!command) {
      return {
        success: false,
        error: `Command not found: /${nameOrAlias}`,
      };
    }

    try {
      // Validate args if schema provided
      if (command.argsSchema) {
        command.argsSchema.parse(args);
      }

      return await command.execute(args, context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // For autocomplete
  search(prefix: string): ISlashCommand[] {
    const results: ISlashCommand[] = [];
    const lowerPrefix = prefix.toLowerCase();

    for (const command of this.commands.values()) {
      if (command.name.toLowerCase().startsWith(lowerPrefix)) {
        results.push(command);
      } else if (command.aliases?.some((a) => a.toLowerCase().startsWith(lowerPrefix))) {
        results.push(command);
      }
    }

    // Sort results alphabetically by name for consistent, predictable ordering
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }
}
