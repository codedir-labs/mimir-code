/**
 * ITool - Interface for tool implementations
 */

import type { ToolContext, ToolDefinition, ToolResult } from '../types.js';

/**
 * Tool interface - defines contract for all tool implementations
 */
export interface ITool {
  /**
   * Tool definition (name, description, parameters)
   */
  readonly definition: ToolDefinition;

  /**
   * Execute the tool with given arguments
   * @param args - Tool arguments (validated against schema)
   * @param context - Execution context
   * @returns Tool execution result
   */
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;

  /**
   * Validate tool arguments against schema
   * @param args - Arguments to validate
   * @returns Validation result
   */
  validate(args: Record<string, unknown>): {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };

  /**
   * Get tool schema in JSON format (for LLM)
   */
  getSchema(): Record<string, unknown>;
}
