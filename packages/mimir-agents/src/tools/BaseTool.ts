/**
 * BaseTool - Abstract base class for tool implementations
 */

import type { ITool } from './interfaces/ITool.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

/**
 * Base tool class providing common functionality
 */
export abstract class BaseTool implements ITool {
  constructor(public readonly definition: ToolDefinition) {}

  /**
   * Execute the tool - must be implemented by subclasses
   */
  abstract execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;

  /**
   * Validate arguments against schema
   */
  validate(args: Record<string, unknown>): {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  } {
    try {
      const parsed = this.definition.parameters.parse(args);
      return { success: true, data: parsed };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Get JSON schema for LLM
   */
  getSchema(): Record<string, unknown> {
    return {
      name: this.definition.name,
      description: this.definition.description,
      parameters: this.zodToJsonSchema(this.definition.parameters),
    };
  }

  /**
   * Convert Zod schema to JSON Schema (simplified)
   */
  private zodToJsonSchema(schema: any): Record<string, unknown> {
    // This is a simplified conversion
    // In production, use a library like zod-to-json-schema
    const shape = schema._def?.shape?.() || {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const field = value as any;
      properties[key] = {
        type: this.getJsonType(field),
        description: field._def?.description || '',
      };

      if (!field.isOptional?.()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  /**
   * Get JSON type from Zod type
   */
  private getJsonType(field: any): string {
    const typeName = field._def?.typeName;
    if (typeName?.includes('String')) return 'string';
    if (typeName?.includes('Number')) return 'number';
    if (typeName?.includes('Boolean')) return 'boolean';
    if (typeName?.includes('Array')) return 'array';
    if (typeName?.includes('Object')) return 'object';
    return 'string'; // default
  }

  /**
   * Helper to create success result
   */
  protected success(output: unknown, metadata?: Record<string, unknown>): ToolResult {
    return {
      success: true,
      output,
      metadata,
    };
  }

  /**
   * Helper to create error result
   */
  protected error(error: string, metadata?: Record<string, unknown>): ToolResult {
    return {
      success: false,
      error,
      metadata,
    };
  }
}
