/**
 * Server-Sent Events (SSE) stream parsers
 * Handles different streaming formats from various providers
 */

import { ChatChunk } from '@/types/index.js';

/**
 * OpenAI-format SSE stream data structure
 * Used by: DeepSeek, OpenAI, Qwen
 */
interface OpenAIStreamData {
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
}

/**
 * Anthropic-format SSE stream data structure
 * Used by: Anthropic Claude API
 */
interface AnthropicStreamData {
  delta?: { text?: string };
  content_block?: { text?: string };
  error?: { message?: string };
}

/**
 * Result type for processing an SSE data line
 */
interface SSEParseResult {
  chunk?: ChatChunk;
  done: boolean;
  error?: Error;
}

/**
 * Process a single OpenAI-format data line
 */
function processOpenAIDataLine(jsonStr: string): SSEParseResult {
  try {
    const data = JSON.parse(jsonStr) as OpenAIStreamData;
    const delta = data.choices?.[0]?.delta;
    const content = delta?.content || '';
    const finishReason = data.choices?.[0]?.finish_reason;

    if (finishReason) {
      return { chunk: { content: '', done: true }, done: true };
    }

    if (content) {
      return { chunk: { content, done: false }, done: false };
    }

    return { done: false };
  } catch {
    // Skip malformed JSON - streaming can have partial messages
    return { done: false };
  }
}

/**
 * Process OpenAI-format SSE lines from buffer
 */
function* processOpenAILines(lines: string[]): Generator<ChatChunk | null> {
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed === 'data: [DONE]') {
      yield { content: '', done: true };
      return;
    }

    if (!trimmed.startsWith('data: ')) continue;

    const jsonStr = trimmed.substring(6);
    const result = processOpenAIDataLine(jsonStr);

    if (result.chunk) {
      yield result.chunk;
    }

    if (result.done) {
      return;
    }
  }

  yield null; // Signal to continue processing
}

/**
 * Parse OpenAI-format SSE stream
 * Used by: DeepSeek, OpenAI, Qwen
 *
 * Format:
 * data: {"choices":[{"delta":{"content":"hello"}}]}
 * data: [DONE]
 */
export async function* parseOpenAIStream(stream: AsyncIterable<string>): AsyncGenerator<ChatChunk> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk;

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const result of processOpenAILines(lines)) {
      if (result === null) continue;

      yield result;

      if (result.done) return;
    }
  }

  if (buffer.trim()) {
    yield { content: '', done: true };
  }
}

/**
 * Context for Anthropic event processing
 */
interface AnthropicEventContext {
  currentEvent: string;
}

/**
 * Process content from content_block_delta event
 */
function extractDeltaContent(data: AnthropicStreamData): string {
  return data.delta?.text || '';
}

/**
 * Process content from content_block_start event
 */
function extractBlockContent(data: AnthropicStreamData): string {
  return data.content_block?.text || '';
}

/**
 * Process a single Anthropic event and return appropriate result
 */
function processAnthropicEvent(data: AnthropicStreamData, currentEvent: string): SSEParseResult {
  if (currentEvent === 'content_block_delta') {
    const content = extractDeltaContent(data);
    if (content) {
      return { chunk: { content, done: false }, done: false };
    }
    return { done: false };
  }

  if (currentEvent === 'content_block_start') {
    const content = extractBlockContent(data);
    if (content) {
      return { chunk: { content, done: false }, done: false };
    }
    return { done: false };
  }

  if (currentEvent === 'message_delta') {
    return { done: false };
  }

  if (currentEvent === 'message_stop') {
    return { chunk: { content: '', done: true }, done: true };
  }

  if (currentEvent === 'error') {
    const message = data.error?.message || 'Anthropic streaming error';
    return { done: true, error: new Error(message) };
  }

  return { done: false };
}

/**
 * Parse a single SSE line and update context
 */
function parseAnthropicLine(line: string, context: AnthropicEventContext): SSEParseResult | null {
  const trimmed = line.trim();

  if (trimmed.startsWith('event: ')) {
    context.currentEvent = trimmed.substring(7);
    return null;
  }

  if (!trimmed.startsWith('data: ')) {
    return null;
  }

  const jsonStr = trimmed.substring(6);

  try {
    const data = JSON.parse(jsonStr) as AnthropicStreamData;
    return processAnthropicEvent(data, context.currentEvent);
  } catch (error) {
    if (context.currentEvent === 'error') {
      return { done: true, error: error as Error };
    }
    return null;
  }
}

/**
 * Process all lines within an Anthropic SSE event block
 */
function* processAnthropicEventLines(
  lines: string[],
  context: AnthropicEventContext
): Generator<SSEParseResult> {
  for (const line of lines) {
    const result = parseAnthropicLine(line, context);
    if (result) {
      yield result;
    }
  }
}

/**
 * Process Anthropic SSE events from buffer
 */
function* processAnthropicEvents(
  events: string[],
  context: AnthropicEventContext
): Generator<SSEParseResult> {
  for (const event of events) {
    const lines = event.split('\n');
    yield* processAnthropicEventLines(lines, context);
  }
}

/**
 * Parse Anthropic-format SSE stream
 * Used by: Anthropic Claude API
 *
 * Format:
 * event: message_start
 * data: {"type":"message_start"}
 *
 * event: content_block_delta
 * data: {"delta":{"text":"hello"}}
 *
 * event: message_stop
 * data: {}
 */
export async function* parseAnthropicStream(
  stream: AsyncIterable<string>
): AsyncGenerator<ChatChunk> {
  let buffer = '';
  const context: AnthropicEventContext = { currentEvent: '' };

  for await (const chunk of stream) {
    buffer += chunk;

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const result of processAnthropicEvents(events, context)) {
      if (result.error) {
        throw result.error;
      }

      if (result.chunk) {
        yield result.chunk;
      }

      if (result.done) {
        return;
      }
    }
  }

  if (buffer.trim()) {
    yield { content: '', done: true };
  }
}
