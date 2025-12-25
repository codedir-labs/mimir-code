/**
 * Tests for DeepSeekProvider
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { DeepSeekProvider } from '../../../src/providers/DeepSeekProvider.js';
import {
  DEEPSEEK_CHAT_SUCCESS,
  DEEPSEEK_TOOL_CALL_RESPONSE,
  DEEPSEEK_STREAM_CHUNKS,
  DEEPSEEK_ERROR_401,
  DEEPSEEK_ERROR_429,
  DEEPSEEK_ERROR_500,
} from './fixtures/deepseek-responses.js';
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

describe('DeepSeekProvider', () => {
  describe('constructor', () => {
    it('should throw ConfigurationError when API key is missing', () => {
      // Clear environment variable for this test
      const originalEnv = process.env.DEEPSEEK_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;

      expect(() => {
        new DeepSeekProvider({
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4096,
        });
      }).toThrow(ConfigurationError);

      // Restore environment variable
      if (originalEnv) process.env.DEEPSEEK_API_KEY = originalEnv;
    });

    it('should create provider with API key from config', () => {
      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe('deepseek');
      expect(provider.getModelName()).toBe('deepseek-chat');
    });

    it('should accept custom base URL', () => {
      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        baseURL: 'https://custom.deepseek.com',
        temperature: 0.7,
        maxTokens: 4096,
      });

      expect(provider).toBeDefined();
    });
  });

  describe('chat()', () => {
    it('should complete chat successfully', async () => {
      server.use(
        http.post('https://api.deepseek.com/chat/completions', () => {
          return HttpResponse.json(DEEPSEEK_CHAT_SUCCESS);
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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

    it('should handle tool calls', async () => {
      server.use(
        http.post('https://api.deepseek.com/chat/completions', () => {
          return HttpResponse.json(DEEPSEEK_TOOL_CALL_RESPONSE);
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      const tools = [
        {
          name: 'read_file',
          description: 'Read a file',
          schema: {
            type: 'object',
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
        http.post('https://api.deepseek.com/chat/completions', () => {
          return HttpResponse.json(DEEPSEEK_ERROR_401, { status: 401 });
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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
        http.post('https://api.deepseek.com/chat/completions', () => {
          return HttpResponse.json(DEEPSEEK_ERROR_429, {
            status: 429,
            headers: { 'retry-after': '60' },
          });
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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
        http.post('https://api.deepseek.com/chat/completions', () => {
          return HttpResponse.json(DEEPSEEK_ERROR_500, { status: 500 });
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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
        http.post('https://api.deepseek.com/chat/completions', () => {
          attempts++;
          // Fail first 3 times, succeed on 4th
          if (attempts <= 3) {
            return HttpResponse.json(DEEPSEEK_ERROR_500, { status: 500 });
          }
          return HttpResponse.json(DEEPSEEK_CHAT_SUCCESS);
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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
        http.post('https://api.deepseek.com/chat/completions', () => {
          const stream = new ReadableStream({
            start(controller) {
              for (const chunk of DEEPSEEK_STREAM_CHUNKS) {
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

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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
      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
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
    it('should calculate cost for deepseek-chat', () => {
      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      // 1000 input tokens, 500 output tokens
      // (1000 * 0.14 + 500 * 0.28) / 1,000,000 = 0.00028
      const cost = provider.calculateCost(1000, 500);
      expect(cost).toBeCloseTo(0.00028, 6);
    });

    it('should calculate cost for deepseek-reasoner', () => {
      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      // 1000 input tokens, 500 output tokens
      // (1000 * 0.55 + 500 * 2.19) / 1,000,000 = 0.001645
      const cost = provider.calculateCost(1000, 500);
      expect(cost).toBeCloseTo(0.001645, 6);
    });

    it('should return 0 for unknown models', () => {
      const provider = new DeepSeekProvider({
        provider: 'deepseek',
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
        http.post('https://api.deepseek.com/chat/completions', async ({ request }) => {
          capturedRequest = await request.json();
          return HttpResponse.json(DEEPSEEK_CHAT_SUCCESS);
        })
      );

      const provider = new DeepSeekProvider({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 4096,
      });

      await provider.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(capturedRequest.messages).toHaveLength(4);
      expect(capturedRequest.messages[0].role).toBe('system');
      expect(capturedRequest.messages[0].content).toBe('You are helpful');
      expect(capturedRequest.model).toBe('deepseek-chat');
      expect(capturedRequest.temperature).toBe(0.7);
      expect(capturedRequest.max_tokens).toBe(4096);
    });
  });
});
