/**
 * Mock DeepSeek API responses for testing
 */

export const DEEPSEEK_CHAT_SUCCESS = {
  id: 'chatcmpl-123456',
  object: 'chat.completion',
  created: 1677652288,
  model: 'deepseek-chat',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
  },
};

export const DEEPSEEK_TOOL_CALL_RESPONSE = {
  id: 'chatcmpl-789012',
  object: 'chat.completion',
  created: 1677652288,
  model: 'deepseek-chat',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"test.txt"}',
            },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: {
    prompt_tokens: 25,
    completion_tokens: 15,
    total_tokens: 40,
  },
};

export const DEEPSEEK_STREAM_CHUNKS = [
  'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" How"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" can"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" I"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" help"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" you"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"?"}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
];

export const DEEPSEEK_ERROR_401 = {
  error: {
    message: 'Invalid API key provided',
    type: 'invalid_request_error',
    code: 'invalid_api_key',
  },
};

export const DEEPSEEK_ERROR_429 = {
  error: {
    message: 'Rate limit exceeded',
    type: 'rate_limit_error',
  },
};

export const DEEPSEEK_ERROR_500 = {
  error: {
    message: 'Internal server error',
    type: 'server_error',
  },
};
