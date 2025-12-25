/**
 * Tests for AnthropicProvider
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AnthropicProvider } from '../../../src/providers/AnthropicProvider.js';
import {
  ANTHROPIC_CHAT_SUCCESS,
  ANTHROPIC_TOOL_CALL_RESPONSE,
  ANTHROPIC_STREAM_CHUNKS,
  ANTHROPIC_ERROR_401,
  ANTHROPIC_ERROR_429,
  ANTHROPIC_ERROR_500,
} from './fixtures/anthropic-responses.js';
import {
  ConfigurationError,
  RateLimitError,
  ProviderError,
  NetworkError,
} from '../../../src/utils/errors.js';

// MSW server setup
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AnthropicProvider', () => {
  describe('constructor', () => {
    it('should throw ConfigurationError when API key is missing', () => {
      // Clear environment variable for this test
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => {
        new AnthropicProvider({
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          temperature: 0.7,
          maxTokens: 4096,
        });
      }).toThrow(ConfigurationError);

      // Restore environment variable
      if (originalEnv) process.env.ANTHROPIC_API_KEY = originalEnv;
    });

    it('should create provider with API key from config', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe('anthropic');
      expect(provider.getModelName()).toBe('claude-sonnet-4-5-20250929');
    });

    it('should accept custom base URL', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        baseURL: 'https://custom.anthropic.com',
        temperature: 0.7,
        maxTokens: 4096,
      });

      expect(provider).toBeDefined();
    });
  });

  describe('chat()', () => {
    it('should complete chat successfully', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json(ANTHROPIC_CHAT_SUCCESS);
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const response = await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(response.content).toBe('Hello! How can I help you today?');
      expect(response.finishReason).toBe('stop');
      expect(response.usage.inputTokens).toBe(12);
      expect(response.usage.outputTokens).toBe(8);
      expect(response.usage.totalTokens).toBe(20);
      expect(response.toolCalls).toEqual([]);
    });

    it('should extract system messages correctly', async () => {
      let capturedRequest: any;
      server.use(
        http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
          capturedRequest = await request.json();
          return HttpResponse.json(ANTHROPIC_CHAT_SUCCESS);
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await provider.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'system', content: 'Be concise' },
        { role: 'user', content: 'Hello' },
      ]);

      expect(capturedRequest.system).toBe('You are helpful\n\nBe concise');
      expect(capturedRequest.messages).toHaveLength(1);
      expect(capturedRequest.messages[0].role).toBe('user');
    });

    it('should handle tool calls', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json(ANTHROPIC_TOOL_CALL_RESPONSE);
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const tools = [
        {
          name: 'read_file',
          description: 'Read a file',
          schema: {
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      ];

      const response = await provider.chat([{ role: 'user', content: 'Read test.txt' }], tools);

      expect(response.content).toBe('');
      expect(response.finishReason).toBe('tool_calls');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('read_file');
      expect(response.toolCalls![0].arguments).toEqual({ path: 'test.txt' });
    });

    it('should handle 401 authentication errors', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json(ANTHROPIC_ERROR_401, { status: 401 });
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'invalid-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await expect(provider.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        ProviderError
      );
    });

    it('should handle 429 rate limit errors', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json(ANTHROPIC_ERROR_429, {
            status: 429,
            headers: { 'retry-after': '60' },
          });
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await expect(provider.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        RateLimitError
      );
    });

    it('should handle 500 server errors', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json(ANTHROPIC_ERROR_500, { status: 500 });
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await expect(provider.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        NetworkError
      );
    }, 10000); // 10 second timeout to allow for all retry attempts

    it('should retry on transient errors', async () => {
      let attempts = 0;
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          attempts++;
          // Fail first 3 times, succeed on 4th
          if (attempts <= 3) {
            return HttpResponse.json(ANTHROPIC_ERROR_500, { status: 500 });
          }
          return HttpResponse.json(ANTHROPIC_CHAT_SUCCESS);
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const response = await provider.chat([{ role: 'user', content: 'Hello' }]);

      // Should succeed on 4th attempt (1 initial + 3 retries)
      expect(attempts).toBe(4);
      expect(response.content).toBe('Hello! How can I help you today?');
    }, 10000); // 10 second timeout to allow for retry delays
  });

  describe('streamChat()', () => {
    it('should stream chat responses', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          const stream = new ReadableStream({
            start(controller) {
              for (const chunk of ANTHROPIC_STREAM_CHUNKS) {
                controller.enqueue(new TextEncoder().encode(chunk));
              }
              controller.close();
            },
          });

          return new HttpResponse(stream, {
            headers: { 'content-type': 'text/event-stream' },
          });
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const chunks: string[] = [];
      for await (const chunk of provider.streamChat([{ role: 'user', content: 'Hello' }])) {
        chunks.push(chunk.content);
        if (chunk.done) break;
      }

      const fullResponse = chunks.join('');
      expect(fullResponse).toContain('Hello');
      expect(fullResponse).toContain('How can I help you');
    });
  });

  describe('countTokens()', () => {
    it('should count tokens accurately', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      expect(provider.countTokens('Hello world')).toBeGreaterThan(0);
      expect(provider.countTokens('The quick brown fox')).toBeGreaterThan(2);
      expect(provider.countTokens('')).toBe(0);
    });
  });

  describe('calculateCost()', () => {
    it('should calculate cost for claude-sonnet-4-5', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      // 1000 input tokens, 500 output tokens
      // (1000 * 3 + 500 * 15) / 1,000,000 = 0.0105
      const cost = provider.calculateCost(1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should calculate cost for claude-haiku-4-5', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      // 1000 input tokens, 500 output tokens
      // (1000 * 1 + 500 * 5) / 1,000,000 = 0.0035
      const cost = provider.calculateCost(1000, 500);
      expect(cost).toBeCloseTo(0.0035, 6);
    });

    it('should calculate cost for claude-opus-4-5', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-opus-4-5-20251101',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      // 1000 input tokens, 500 output tokens
      // (1000 * 15 + 500 * 75) / 1,000,000 = 0.0525
      const cost = provider.calculateCost(1000, 500);
      expect(cost).toBeCloseTo(0.0525, 6);
    });

    it('should return 0 for unknown models', () => {
      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'unknown-model',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const cost = provider.calculateCost(1000, 500);
      expect(cost).toBe(0);
    });
  });

  describe('message formatting', () => {
    it('should format messages correctly', async () => {
      let capturedRequest: any;
      server.use(
        http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
          capturedRequest = await request.json();
          return HttpResponse.json(ANTHROPIC_CHAT_SUCCESS);
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await provider.chat([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(capturedRequest.messages).toHaveLength(3);
      expect(capturedRequest.messages[0].role).toBe('user');
      expect(capturedRequest.messages[0].content).toBe('Hello');
      expect(capturedRequest.model).toBe('claude-sonnet-4-5-20250929');
      expect(capturedRequest.temperature).toBe(0.7);
      expect(capturedRequest.max_tokens).toBe(4096);
    });

    it('should send headers correctly', async () => {
      let capturedHeaders: any;
      server.use(
        http.post('https://api.anthropic.com/v1/messages', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries());
          return HttpResponse.json(ANTHROPIC_CHAT_SUCCESS);
        })
      );

      const provider = new AnthropicProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key-123',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(capturedHeaders['x-api-key']).toBe('test-key-123');
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
      expect(capturedHeaders['content-type']).toContain('application/json');
    });
  });
});
