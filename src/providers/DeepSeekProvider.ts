/**
 * DeepSeek LLM Provider
 * OpenAI-compatible API with cost-effective pricing
 */

import { encode } from 'gpt-tokenizer';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { ILLMProvider, LLMTool } from './ILLMProvider.js';
import { Message, ChatResponse, ChatChunk, LLMConfig } from '../types/index.js';
import { APIClient } from './utils/apiClient.js';
import { getStaticPricing } from './pricing/pricingData.js';
import {
  toOpenAITools,
  parseOpenAIToolCalls,
  mapOpenAIFinishReason,
} from './utils/toolFormatters.js';
import { parseOpenAIStream } from './utils/streamParsers.js';
import { ConfigurationError } from '../utils/errors.js';

export class DeepSeekProvider extends BaseLLMProvider implements ILLMProvider {
  private apiClient: APIClient;

  constructor(config: LLMConfig) {
    super(config);

    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError(
        'DEEPSEEK_API_KEY not found in config or environment variables. ' +
          'Please set DEEPSEEK_API_KEY in your .env file or pass it via config.'
      );
    }

    const baseURL = config.baseURL || 'https://api.deepseek.com';

    this.apiClient = new APIClient({
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async chat(messages: Message[], tools?: LLMTool[]): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const requestBody = {
        model: this.config.model,
        messages: this.formatMessages(messages),
        tools: tools ? toOpenAITools(tools) : undefined,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      };

      const response = await this.apiClient.post<DeepSeekChatResponse>(
        '/chat/completions',
        requestBody
      );

      return this.parseResponse(response);
    });
  }

  async *streamChat(messages: Message[], tools?: LLMTool[]): AsyncGenerator<ChatChunk> {
    const requestBody = {
      model: this.config.model,
      messages: this.formatMessages(messages),
      tools: tools ? toOpenAITools(tools) : undefined,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: true,
    };

    const stream = this.apiClient.stream('/chat/completions', requestBody);

    for await (const chunk of parseOpenAIStream(stream)) {
      yield chunk;
    }
  }

  countTokens(text: string): number {
    return encode(text).length;
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing = getStaticPricing('deepseek', this.config.model);
    if (!pricing) {
      return 0; // Unknown model, return 0 cost
    }

    return (
      (inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
      (outputTokens / 1_000_000) * pricing.outputPerMillionTokens
    );
  }

  /**
   * Format messages for OpenAI-compatible API
   */
  private formatMessages(
    messages: Message[]
  ): Array<{ role: string; content: string; name?: string }> {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      name: msg.name,
    }));
  }

  /**
   * Parse DeepSeek API response
   */
  private parseResponse(response: DeepSeekChatResponse): ChatResponse {
    const choice = response.choices[0];
    const message = choice?.message;
    const usage = response.usage;

    if (!choice || !message) {
      throw new Error('Invalid response from DeepSeek API: missing choice or message');
    }

    return {
      content: message.content || '',
      toolCalls: parseOpenAIToolCalls(response),
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    };
  }
}

/**
 * DeepSeek API response type
 */
interface DeepSeekChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}
