/**
 * Tool system types
 */

import type { z } from 'zod';
import type { IExecutor } from '../execution/IExecutor.js';

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: {
    executionTime?: number;
    tokens?: number;
    cost?: number;
    [key: string]: unknown;
  };
}

/**
 * Tool execution context
 */
export interface ToolContext {
  conversationId?: string;
  agentId?: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  executor?: IExecutor;
  metadata?: Record<string, unknown>;
}

/**
 * Tool source type
 */
export type ToolSource = 'built-in' | 'custom' | 'mcp' | 'teams';

/**
 * Tool metadata
 */
export interface ToolMetadata {
  source: ToolSource;
  version?: string;
  author?: string;
  tags?: string[];
  enabled: boolean;
  tokenCost: number; // Estimated tokens added to system prompt
}

/**
 * Tool parameter schema (Zod schema)
 */
export type ToolParameterSchema = z.ZodObject<any>;

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  metadata: ToolMetadata;
}

/**
 * Tool execution function
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

/**
 * Tool configuration
 */
export interface ToolConfig {
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}
