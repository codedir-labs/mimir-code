/**
 * Parser for slash commands
 * Handles detection and parsing of slash commands from user input
 */

/**
 * Parse result from input string
 */
export interface ParseResult {
  isCommand: boolean;
  commandName?: string;
  args?: string[];
  rawArgs?: string;
}

/**
 * Parser for slash commands
 */
export class SlashCommandParser {
  // eslint-disable-next-line sonarjs/slow-regex
  private static readonly COMMAND_REGEX = /^\/(\w+)(?:\s+(.*))?$/;

  /**
   * Check if input starts with /
   */
  static isCommandPrefix(input: string): boolean {
    return input.trimStart().startsWith('/');
  }

  /**
   * Parse slash command from input
   * Examples:
   *   "/new" -> { isCommand: true, commandName: 'new', args: [] }
   *   "/model deepseek" -> { isCommand: true, commandName: 'model', args: ['deepseek'] }
   *   "/custom arg1 arg2" -> { isCommand: true, commandName: 'custom', args: ['arg1', 'arg2'], rawArgs: 'arg1 arg2' }
   */
  static parse(input: string): ParseResult {
    const trimmed = input.trim();

    if (!this.isCommandPrefix(trimmed)) {
      return { isCommand: false };
    }

    const match = this.COMMAND_REGEX.exec(trimmed);

    if (!match || !match[1]) {
      return { isCommand: false };
    }

    const commandName = match[1];
    const rawArgs = match[2] || '';
    const args = rawArgs ? rawArgs.trim().split(/\s+/) : [];

    return {
      isCommand: true,
      commandName,
      args,
      rawArgs,
    };
  }

  /**
   * Get partial command name for autocomplete
   * "/mod" -> "mod"
   * "/" -> ""
   */
  static getPartialCommandName(input: string): string | null {
    const trimmed = input.trimStart();

    if (!trimmed.startsWith('/')) {
      return null;
    }

    // Extract command name (before first space)
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) {
      return trimmed.substring(1); // Remove /
    }

    return trimmed.substring(1, spaceIndex);
  }
}
