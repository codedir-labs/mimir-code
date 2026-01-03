/**
 * LLM Provider abstraction interface
 * All providers (DeepSeek, Anthropic, OpenAI, etc.) implement this interface
 */

import { Message, ChatResponse, ChatChunk } from '../types/index.js';

export interface LLMTool {
  name: string;
  description: string;
  schema: Record<string, unknown>; // JSON Schema
}

export interface ILLMProvider {
  /**
   * Send chat completion request
   */
  chat(messages: Message[], tools?: LLMTool[]): Promise<ChatResponse>;

  /**
   * Stream chat completion response
   */
  streamChat(messages: Message[], tools?: LLMTool[]): AsyncGenerator<ChatChunk>;

  /**
   * Count tokens in text
   */
  countTokens(text: string): number;

  /**
   * Calculate cost based on token usage
   */
  calculateCost(inputTokens: number, outputTokens: number): number;

  /**
   * Get provider name
   */
  getProviderName(): string;

  /**
   * Get model name
   */
  getModelName(): string;
}
