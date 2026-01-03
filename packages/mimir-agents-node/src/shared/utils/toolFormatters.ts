/**
 * Tool format converters
 * Handles conversion between LLMTool interface and provider-specific formats
 */

import type { LLMTool, ToolCall } from '@codedir/mimir-agents';

/**
 * Convert LLMTool to OpenAI function calling format
 * Used by: DeepSeek, OpenAI, Qwen (OpenAI-compatible providers)
 */
export function toOpenAITools(tools: LLMTool[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema, // Already JSON Schema
    },
  }));
}

/**
 * Convert LLMTool to Anthropic tool format
 * Used by: Anthropic Claude API
 */
export function toAnthropicTools(tools: LLMTool[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      ...tool.schema, // Merge with existing schema
    },
  }));
}

/**
 * Parse tool calls from OpenAI response
 */
export function parseOpenAIToolCalls(response: {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}): ToolCall[] {
  const toolCalls = response.choices?.[0]?.message?.tool_calls || [];

  return toolCalls.map((tc) => {
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(tc.function.arguments);
    } catch {
      parsedArgs = {};
    }

    return {
      id: tc.id,
      name: tc.function.name,
      arguments: parsedArgs,
    };
  });
}

/**
 * Parse tool calls from Anthropic response
 */
export function parseAnthropicToolCalls(response: {
  content?: Array<
    | { type: 'text'; text: string }
    | {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      }
  >;
}): ToolCall[] {
  const content = response.content || [];

  return content
    .filter(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use'
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.input,
    }));
}

/**
 * Map OpenAI finish reason to standard format
 */
export function mapOpenAIFinishReason(reason: string): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'tool_calls':
      return 'tool_calls';
    case 'length':
      return 'length';
    case 'content_filter':
    case 'insufficient_system_resource':
      return 'error';
    default:
      return 'error';
  }
}

/**
 * Map Anthropic stop reason to standard format
 */
export function mapAnthropicFinishReason(
  reason: string
): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (reason) {
    case 'end_turn':
      return 'stop';
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'stop_sequence':
      return 'stop';
    default:
      return 'error';
  }
}
