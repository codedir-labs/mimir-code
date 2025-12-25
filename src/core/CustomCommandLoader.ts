/**
 * Custom command loader
 * Loads custom slash commands from YAML files in .mimir/commands/
 */

import { z } from 'zod';
import yaml from 'yaml';
import path from 'path';
import os from 'os';
import { IFileSystem } from '../platform/IFileSystem.js';
import { ISlashCommand, SlashCommandContext, SlashCommandResult } from './SlashCommand.js';
import { logger } from '../utils/logger.js';

/**
 * Schema for custom command YAML files
 */
const CustomCommandSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'Command name must be lowercase alphanumeric with hyphens'),
  description: z.string(),
  usage: z.string(),
  aliases: z.array(z.string()).optional(),
  prompt: z.string(),
});

type CustomCommandDefinition = z.infer<typeof CustomCommandSchema>;

/**
 * Custom command loaded from YAML file
 */
class CustomCommand implements ISlashCommand {
  constructor(private definition: CustomCommandDefinition) {}

  get name(): string {
    return this.definition.name;
  }

  get description(): string {
    return this.definition.description;
  }

  get usage(): string {
    return this.definition.usage;
  }

  get aliases(): string[] | undefined {
    return this.definition.aliases;
  }

  async execute(args: string[], context: SlashCommandContext): Promise<SlashCommandResult> {
    // Substitute placeholders in prompt
    let prompt = this.definition.prompt;

    // $1, $2, $3... for individual args
    args.forEach((arg, index) => {
      const placeholder = `$${index + 1}`;
      prompt = prompt.replace(new RegExp(`\\${placeholder}`, 'g'), arg);
    });

    // $ARGUMENTS for all args joined
    const allArgs = args.join(' ');
    prompt = prompt.replace(/\$ARGUMENTS/g, allArgs);

    // Send prompt to agent via context
    if (context.sendPrompt) {
      context.sendPrompt(prompt);
      return {
        success: true,
        action: 'send_prompt',
        prompt,
      };
    }

    return {
      success: false,
      error: 'Context does not support sending prompts',
    };
  }
}

/**
 * Loads custom commands from .yml files
 */
export class CustomCommandLoader {
  constructor(private fs: IFileSystem) {}

  /**
   * Load custom commands from both global and project directories
   */
  async loadAll(projectRoot?: string): Promise<ISlashCommand[]> {
    const commandMap = new Map<string, ISlashCommand>();

    // Load global commands first
    const globalCommands = await this.loadFromDirectory(
      path.join(os.homedir(), '.mimir', 'commands')
    );
    globalCommands.forEach((cmd) => commandMap.set(cmd.name, cmd));

    // Project commands override global
    if (projectRoot) {
      const projectCommands = await this.loadFromDirectory(
        path.join(projectRoot, '.mimir', 'commands')
      );
      projectCommands.forEach((cmd) => {
        if (commandMap.has(cmd.name)) {
          logger.info('Project command overrides global', { name: cmd.name });
        }
        commandMap.set(cmd.name, cmd);
      });
    }

    return Array.from(commandMap.values());
  }

  /**
   * Load commands from a specific directory
   */
  private async loadFromDirectory(dirPath: string): Promise<ISlashCommand[]> {
    const commands: ISlashCommand[] = [];

    try {
      if (!(await this.fs.exists(dirPath))) {
        return commands;
      }

      const files = await this.fs.glob('*.yml', { cwd: dirPath });

      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const command = await this.loadCommand(fullPath);
        if (command) {
          commands.push(command);
        }
      }

      logger.info('Loaded custom commands', {
        directory: dirPath,
        count: commands.length,
      });
    } catch (error) {
      logger.warn('Failed to load commands from directory', {
        directory: dirPath,
        error,
      });
    }

    return commands;
  }

  /**
   * Load a single command from YAML file
   */
  private async loadCommand(filePath: string): Promise<ISlashCommand | null> {
    try {
      const content = await this.fs.readFile(filePath);
      const data = yaml.parse(content) as unknown;
      const definition = CustomCommandSchema.parse(data);

      return new CustomCommand(definition);
    } catch (error) {
      logger.warn('Failed to load custom command', {
        file: filePath,
        error,
      });
      return null;
    }
  }

  /**
   * Validate custom command file without loading
   */
  async validate(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const content = await this.fs.readFile(filePath);
      const data = yaml.parse(content) as unknown;
      CustomCommandSchema.parse(data);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
