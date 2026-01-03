/**
 * HTTP API client wrapper around axios
 * Handles request/response, error mapping, and streaming
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { ProviderError, NetworkError, RateLimitError } from '@/shared/utils/errors.js';

export interface APIClientConfig {
  baseURL: string;
  headers: Record<string, string>;
  timeout?: number;
}

export class APIClient {
  private axiosInstance: AxiosInstance;
  private providerName: string;

  constructor(config: APIClientConfig) {
    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      headers: config.headers,
      timeout: config.timeout || 60000, // 60 seconds default
    });

    // Extract provider name from base URL for error messages
    this.providerName = this.extractProviderName(config.baseURL);
  }

  /**
   * POST request with JSON payload
   */
  async post<T>(endpoint: string, data: unknown): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.post(endpoint, data);
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.get(endpoint);
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Stream request for Server-Sent Events (SSE)
   * Returns async iterable of string chunks
   */
  async *stream(endpoint: string, data: unknown): AsyncGenerator<string, void, unknown> {
    try {
      const response = await this.axiosInstance.post(endpoint, data, {
        responseType: 'stream',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      const stream = response.data as AsyncIterable<Buffer>;

      // Read stream chunks
      for await (const chunk of stream) {
        const chunkStr = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
        yield chunkStr;
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Map axios errors to custom error types
   */
  private mapError(error: unknown): Error {
    if (!axios.isAxiosError(error)) {
      return error as Error;
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data as {
      error?: { message?: string };
      message?: string;
    };
    const message = errorData?.error?.message || errorData?.message || axiosError.message;

    // Rate limit error (429)
    if (status === 429) {
      const retryAfter = parseInt((axiosError.response?.headers['retry-after'] as string) || '60');
      return new RateLimitError(`${this.providerName} rate limit exceeded: ${message}`, retryAfter);
    }

    // Auth errors (401, 403)
    if (status === 401 || status === 403) {
      return new ProviderError(
        `${this.providerName} authentication failed: ${message}`,
        this.providerName
      );
    }

    // Server errors (5xx)
    if (status && status >= 500) {
      return new NetworkError(`${this.providerName} server error: ${message}`, status);
    }

    // Client errors (4xx)
    if (status && status >= 400) {
      return new ProviderError(`${this.providerName} request error: ${message}`, this.providerName);
    }

    // Network/timeout errors
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new NetworkError(`${this.providerName} request timeout: ${message}`);
    }

    // Generic provider error
    return new ProviderError(`${this.providerName} error: ${message}`, this.providerName);
  }

  /**
   * Extract provider name from base URL
   */
  private extractProviderName(baseURL: string): string {
    try {
      const url = new URL(baseURL);
      const hostname = url.hostname;

      if (hostname.includes('deepseek')) return 'DeepSeek';
      if (hostname.includes('anthropic')) return 'Anthropic';
      if (hostname.includes('openai')) return 'OpenAI';
      if (hostname.includes('google')) return 'Google';

      return hostname;
    } catch {
      return 'Unknown Provider';
    }
  }
}
