/**
 * Base LLM Provider implementation
 * Contains common logic for retry, error handling, etc.
 */

import { ILLMProvider, LLMTool } from './ILLMProvider.js';
import { Message, ChatResponse, ChatChunk, LLMConfig } from '../types/index.js';
import { NetworkError } from '../utils/errors.js';

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

export abstract class BaseLLMProvider implements ILLMProvider {
  protected config: LLMConfig;
  protected retryConfig: RetryConfig;

  constructor(config: LLMConfig, retryConfig?: RetryConfig) {
    this.config = config;
    this.retryConfig = retryConfig ?? {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
    };
  }

  abstract chat(messages: Message[], tools?: LLMTool[]): Promise<ChatResponse>;
  abstract streamChat(messages: Message[], tools?: LLMTool[]): AsyncGenerator<ChatChunk>;
  abstract countTokens(text: string): number;
  abstract calculateCost(inputTokens: number, outputTokens: number): number;

  getProviderName(): string {
    return this.config.provider;
  }

  getModelName(): string {
    return this.config.model;
  }

  /**
   * Retry wrapper for API calls
   * Only retries on NetworkError (5xx server errors)
   * Does NOT retry on auth errors, rate limits, or client errors
   */
  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.retryConfig.retryDelay;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Only retry on NetworkError (transient server issues)
        // Don't retry on auth errors, rate limits, or client errors
        const shouldRetry = error instanceof NetworkError && attempt < this.retryConfig.maxRetries;

        if (shouldRetry) {
          await this.sleep(delay);
          delay *= this.retryConfig.backoffMultiplier;
        } else {
          // For non-retryable errors, throw immediately
          throw lastError;
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
