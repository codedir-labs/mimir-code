/**
 * ToolRegistry - Manages available tools
 */

import type { ITool } from './interfaces/ITool.js';
import type { ToolContext, ToolResult } from './types.js';

/**
 * Registry for managing tools
 */
export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();

  /**
   * Register a tool
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool '${tool.definition.name}' is already registered`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   */
  list(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * List enabled tools
   */
  listEnabled(): ITool[] {
    return this.list().filter((tool) => tool.definition.metadata.enabled);
  }

  /**
   * Get tool schemas for LLM (only enabled tools)
   */
  getSchemas(toolNames?: string[]): Record<string, unknown>[] {
    const tools = toolNames
      ? toolNames.map((name) => this.get(name)).filter((t): t is ITool => t !== undefined)
      : this.listEnabled();

    return tools.map((tool) => tool.getSchema());
  }

  /**
   * Execute a tool by name
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found`,
      };
    }

    if (!tool.definition.metadata.enabled) {
      return {
        success: false,
        error: `Tool '${toolName}' is disabled`,
      };
    }

    // Validate arguments
    const validation = tool.validate(args);
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid arguments: ${validation.error}`,
      };
    }

    // Execute tool
    try {
      const startTime = Date.now();
      const result = await tool.execute(validation.data || args, context);
      const executionTime = Date.now() - startTime;

      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate total token cost of enabled tools
   */
  getTotalTokenCost(toolNames?: string[]): number {
    const tools = toolNames
      ? toolNames.map((name) => this.get(name)).filter((t): t is ITool => t !== undefined)
      : this.listEnabled();

    return tools.reduce((total, tool) => total + tool.definition.metadata.tokenCost, 0);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}
