/**
 * Tool interface and registry
 */

import { z } from 'zod';
import { ToolResult } from '../types/index.js';

export interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<never>;
  execute(args: unknown): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName);
  }

  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  async execute(toolName: string, args: unknown): Promise<ToolResult> {
    const tool = this.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`,
      };
    }

    try {
      // Validate arguments with Zod schema
      const validatedArgs = tool.schema.parse(args);
      return await tool.execute(validatedArgs);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
