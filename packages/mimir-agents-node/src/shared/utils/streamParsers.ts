/**
 * Server-Sent Events (SSE) stream parsers
 * Handles different streaming formats from various providers
 */

import type { ChatChunk } from '@codedir/mimir-agents';

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

    // Split by newlines to get individual SSE messages
    const lines = buffer.split('\n');

    // Keep the last incomplete line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Check for [DONE] marker
      if (trimmed === 'data: [DONE]') {
        yield { content: '', done: true };
        return;
      }

      // Parse data: lines
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.substring(6); // Remove 'data: ' prefix
        try {
          const data = JSON.parse(jsonStr) as {
            choices?: Array<{
              delta?: {
                content?: string;
                role?: string;
              };
              finish_reason?: string | null;
            }>;
          };

          const delta = data.choices?.[0]?.delta;
          const content = delta?.content || '';
          const finishReason = data.choices?.[0]?.finish_reason;

          if (content) {
            yield { content, done: false };
          }

          if (finishReason) {
            yield { content: '', done: true };
            return;
          }
        } catch (error) {
          // Skip malformed JSON
          continue;
        }
      }
    }
  }

  // Flush any remaining buffer
  if (buffer.trim()) {
    yield { content: '', done: true };
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
  let currentEvent = '';

  for await (const chunk of stream) {
    buffer += chunk;

    // Split by double newlines to get individual SSE events
    const events = buffer.split('\n\n');

    // Keep the last incomplete event in buffer
    buffer = events.pop() || '';

    for (const event of events) {
      const lines = event.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.substring(7);
        } else if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.substring(6);

          try {
            const data = JSON.parse(jsonStr);

            // Handle content_block_delta events
            if (currentEvent === 'content_block_delta') {
              const content = data.delta?.text || '';
              if (content) {
                yield { content, done: false };
              }
            }

            // Handle content_block_start events
            if (currentEvent === 'content_block_start') {
              const content = data.content_block?.text || '';
              if (content) {
                yield { content, done: false };
              }
            }

            // Handle message_delta events (may contain usage info)
            if (currentEvent === 'message_delta') {
              // No content in message_delta, just metadata
              continue;
            }

            // Handle message_stop event
            if (currentEvent === 'message_stop') {
              yield { content: '', done: true };
              return;
            }

            // Handle error events
            if (currentEvent === 'error') {
              throw new Error(data.error?.message || 'Anthropic streaming error');
            }
          } catch (error) {
            // Skip malformed JSON or propagate errors
            if (currentEvent === 'error') {
              throw error;
            }
            continue;
          }
        }
      }
    }
  }

  // Flush any remaining buffer
  if (buffer.trim()) {
    yield { content: '', done: true };
  }
}
