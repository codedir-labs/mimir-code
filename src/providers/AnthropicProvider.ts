/**
 * Anthropic Claude LLM Provider
 * Uses Claude's Messages API with Anthropic-specific format
 */

import { encoding_for_model, type Tiktoken } from 'tiktoken';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { ILLMProvider, LLMTool } from './ILLMProvider.js';
import { Message, ChatResponse, ChatChunk, LLMConfig } from '../types/index.js';
import { APIClient } from './utils/apiClient.js';
import { getStaticPricing } from './pricing/pricingData.js';
import {
  toAnthropicTools,
  parseAnthropicToolCalls,
  mapAnthropicFinishReason,
} from './utils/toolFormatters.js';
import { parseAnthropicStream } from './utils/streamParsers.js';
import { ConfigurationError } from '../utils/errors.js';

export class AnthropicProvider extends BaseLLMProvider implements ILLMProvider {
  private apiClient: APIClient;
  private encoder: Tiktoken;

  constructor(config: LLMConfig) {
    super(config);

    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError(
        'ANTHROPIC_API_KEY not found in config or environment variables. ' +
          'Please set ANTHROPIC_API_KEY in your .env file or pass it via config.'
      );
    }
    const baseURL = config.baseURL || 'https://api.anthropic.com';

    this.apiClient = new APIClient({
      baseURL,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    // Use GPT-4 tokenizer as approximation (within 5% accuracy for Claude)
    this.encoder = encoding_for_model('gpt-4');
  }

  async chat(messages: Message[], tools?: LLMTool[]): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const { system, messages: userMessages } = this.formatAnthropicMessages(messages);

      const requestBody: AnthropicChatRequest = {
        model: this.config.model,
        messages: userMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      };

      // Add system message if present
      if (system) {
        requestBody.system = system;
      }

      // Add tools if present
      if (tools && tools.length > 0) {
        requestBody.tools = toAnthropicTools(tools);
      }

      const response = await this.apiClient.post<AnthropicChatResponse>(
        '/v1/messages',
        requestBody
      );

      return this.parseResponse(response);
    });
  }

  async *streamChat(messages: Message[], tools?: LLMTool[]): AsyncGenerator<ChatChunk> {
    const { system, messages: userMessages } = this.formatAnthropicMessages(messages);

    const requestBody: AnthropicChatRequest = {
      model: this.config.model,
      messages: userMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    };

    if (system) {
      requestBody.system = system;
    }

    if (tools && tools.length > 0) {
      requestBody.tools = toAnthropicTools(tools);
    }

    const stream = this.apiClient.stream('/v1/messages', requestBody);

    for await (const chunk of parseAnthropicStream(stream)) {
      yield chunk;
    }
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing = getStaticPricing('anthropic', this.config.model);
    if (!pricing) {
      return 0; // Unknown model, return 0 cost
    }

    return (
      (inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
      (outputTokens / 1_000_000) * pricing.outputPerMillionTokens
    );
  }

  /**
   * Format messages for Anthropic API
   * Extracts system messages into separate parameter
   */
  private formatAnthropicMessages(messages: Message[]): {
    system?: string;
    messages: Array<{ role: string; content: string }>;
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const system =
      systemMessages.length > 0 ? systemMessages.map((m) => m.content).join('\n\n') : undefined;

    return {
      system,
      messages: userMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
    };
  }

  /**
   * Parse Anthropic API response
   */
  private parseResponse(response: AnthropicChatResponse): ChatResponse {
    const content = response.content || [];
    const usage = response.usage;

    // Extract text content from content blocks
    const textContent = content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    return {
      content: textContent,
      toolCalls: parseAnthropicToolCalls(response),
      finishReason: mapAnthropicFinishReason(response.stop_reason),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      },
    };
  }
}

/**
 * Anthropic API request type
 */
interface AnthropicChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  max_tokens: number;
  temperature?: number;
  system?: string;
  tools?: unknown[];
  stream?: boolean;
}

/**
 * Anthropic API response type
 */
interface AnthropicChatResponse {
  id: string;
  type: string;
  role: string;
  content: Array<
    | { type: 'text'; text: string }
    | {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      }
  >;
  model: string;
  stop_reason: string;
  stop_sequence?: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
