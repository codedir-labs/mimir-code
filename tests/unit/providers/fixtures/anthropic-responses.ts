/**
 * Mock Anthropic API responses for testing
 */

export const ANTHROPIC_CHAT_SUCCESS = {
  id: 'msg_01XYZ123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'Hello! How can I help you today?',
    },
  ],
  model: 'claude-sonnet-4-5-20250929',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 12,
    output_tokens: 8,
  },
};

export const ANTHROPIC_TOOL_CALL_RESPONSE = {
  id: 'msg_01ABC456',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_01DEF789',
      name: 'read_file',
      input: {
        path: 'test.txt',
      },
    },
  ],
  model: 'claude-sonnet-4-5-20250929',
  stop_reason: 'tool_use',
  usage: {
    input_tokens: 25,
    output_tokens: 15,
  },
};

export const ANTHROPIC_STREAM_CHUNKS = [
  'event: message_start\n',
  'data: {"type":"message_start","message":{"id":"msg_01XYZ","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"usage":{"input_tokens":12,"output_tokens":0}}}\n\n',
  'event: content_block_start\n',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" How"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" can"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" I"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" help"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" you"}}\n\n',
  'event: content_block_delta\n',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"?"}}\n\n',
  'event: content_block_stop\n',
  'data: {"type":"content_block_stop","index":0}\n\n',
  'event: message_delta\n',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":8}}\n\n',
  'event: message_stop\n',
  'data: {"type":"message_stop"}\n\n',
];

export const ANTHROPIC_ERROR_401 = {
  type: 'error',
  error: {
    type: 'authentication_error',
    message: 'Invalid API key',
  },
};

export const ANTHROPIC_ERROR_429 = {
  type: 'error',
  error: {
    type: 'rate_limit_error',
    message: 'Rate limit exceeded',
  },
};

export const ANTHROPIC_ERROR_500 = {
  type: 'error',
  error: {
    type: 'api_error',
    message: 'Internal server error',
  },
};
