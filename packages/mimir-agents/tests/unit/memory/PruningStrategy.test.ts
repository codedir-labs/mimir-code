/**
 * Tests for PruningStrategy
 */

import { describe, it, expect } from 'vitest';
import {
  scoreMessage,
  pruneByRelevance,
  pruneByAge,
  pruneByTokens,
  applyPruningStrategy,
} from '../../../src/memory/strategies/PruningStrategy.js';
import type { Message } from '../../../src/memory/types.js';

describe('PruningStrategy', () => {
  const createMessage = (role: Message['role'], content: string, hoursAgo = 0): Message => ({
    id: `msg-${Math.random()}`,
    role,
    content,
    timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
  });

  const simpleTokenCounter = (messages: Message[]) =>
    messages.reduce((sum, msg) => sum + msg.content.length, 0);

  describe('scoreMessage', () => {
    it('should score user messages higher than assistant messages', () => {
      const userMsg = createMessage('user', 'test');
      const assistantMsg = createMessage('assistant', 'test');
      const currentTime = new Date();

      const userScore = scoreMessage(userMsg, '', currentTime);
      const assistantScore = scoreMessage(assistantMsg, '', currentTime);

      expect(userScore).toBeGreaterThan(assistantScore);
    });

    it('should score recent messages higher than old messages', () => {
      const recentMsg = createMessage('user', 'test', 1);
      const oldMsg = createMessage('user', 'test', 10);
      const currentTime = new Date();

      const recentScore = scoreMessage(recentMsg, '', currentTime);
      const oldScore = scoreMessage(oldMsg, '', currentTime);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should score messages with tool calls higher', () => {
      const withTools = createMessage('assistant', 'test');
      withTools.toolCalls = [{ id: '1', name: 'readFile', arguments: {} }];

      const withoutTools = createMessage('assistant', 'test');
      const currentTime = new Date();

      const withToolsScore = scoreMessage(withTools, '', currentTime);
      const withoutToolsScore = scoreMessage(withoutTools, '', currentTime);

      expect(withToolsScore).toBeGreaterThan(withoutToolsScore);
    });

    it('should score messages with matching keywords higher', () => {
      const matching = createMessage('user', 'implement authentication feature');
      const nonMatching = createMessage('user', 'hello world');
      const currentTime = new Date();

      const matchingScore = scoreMessage(matching, 'implement authentication', currentTime);
      const nonMatchingScore = scoreMessage(nonMatching, 'implement authentication', currentTime);

      expect(matchingScore).toBeGreaterThan(nonMatchingScore);
    });

    it('should handle empty task gracefully', () => {
      const msg = createMessage('user', 'test');
      const currentTime = new Date();

      expect(() => scoreMessage(msg, '', currentTime)).not.toThrow();
    });
  });

  describe('pruneByRelevance', () => {
    it('should keep recent messages regardless of relevance', () => {
      const messages: Message[] = [];

      // Add 20 low-relevance messages
      for (let i = 0; i < 20; i++) {
        messages.push(createMessage('system', 'low relevance', i));
      }

      // Keep recent 5
      const pruned = pruneByRelevance(messages, 'test task', 1000, 5, simpleTokenCounter);

      // Should keep at least 5 recent messages
      expect(pruned.length).toBeGreaterThanOrEqual(5);

      // Last 5 messages should be in the result
      const lastFive = messages.slice(-5);
      for (const msg of lastFive) {
        expect(pruned).toContainEqual(msg);
      }
    });

    it('should keep high-relevance messages', () => {
      const messages: Message[] = [
        createMessage('user', 'implement authentication', 10),
        createMessage('assistant', 'low relevance', 9),
        createMessage('user', 'add authentication logic', 8),
        createMessage('assistant', 'low relevance', 7),
        createMessage('user', 'recent message 1', 1),
        createMessage('user', 'recent message 2', 0.5),
      ];

      const pruned = pruneByRelevance(
        messages,
        'implement authentication',
        10000,
        2,
        simpleTokenCounter
      );

      // Should keep messages with 'authentication' keyword
      const authMessages = pruned.filter((m) => m.content.includes('authentication'));
      expect(authMessages.length).toBeGreaterThan(0);
    });

    it('should respect maxTokens limit', () => {
      const messages: Message[] = [];

      // Create messages with predictable token counts
      for (let i = 0; i < 20; i++) {
        messages.push(createMessage('user', 'a'.repeat(100), i));
      }

      const maxTokens = 500; // Should fit ~5 messages of 100 chars each
      const pruned = pruneByRelevance(messages, 'test', maxTokens, 2, simpleTokenCounter);

      const totalTokens = simpleTokenCounter(pruned);
      expect(totalTokens).toBeLessThanOrEqual(maxTokens);
    });

    it('should maintain chronological order', () => {
      const messages: Message[] = [
        createMessage('user', 'first', 10),
        createMessage('user', 'second', 9),
        createMessage('user', 'third', 8),
        createMessage('user', 'fourth', 1),
        createMessage('user', 'fifth', 0),
      ];

      const pruned = pruneByRelevance(messages, 'test', 10000, 2, simpleTokenCounter);

      // Verify chronological order
      for (let i = 1; i < pruned.length; i++) {
        expect(pruned[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          pruned[i - 1]!.timestamp.getTime()
        );
      }
    });
  });

  describe('pruneByAge', () => {
    it('should remove messages older than maxAgeHours', () => {
      const messages: Message[] = [
        createMessage('user', 'very old', 48),
        createMessage('user', 'old', 25),
        createMessage('user', 'recent', 2),
        createMessage('user', 'very recent', 0.5),
      ];

      const pruned = pruneByAge(messages, 24, 0);

      // Should only keep messages less than 24 hours old
      expect(pruned).toHaveLength(2);
      expect(pruned[0]?.content).toBe('recent');
      expect(pruned[1]?.content).toBe('very recent');
    });

    it('should keep recent messages regardless of age', () => {
      const messages: Message[] = [
        createMessage('user', 'old 1', 48),
        createMessage('user', 'old 2', 36),
        createMessage('user', 'old 3', 30),
      ];

      const pruned = pruneByAge(messages, 24, 2);

      // Should keep 2 recent messages even though they're older than 24h
      expect(pruned).toHaveLength(2);
    });
  });

  describe('pruneByTokens', () => {
    it('should keep messages within token limit', () => {
      const messages: Message[] = [];

      // Create 10 messages of 100 tokens each
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage('user', 'a'.repeat(100), 10 - i));
      }

      const maxTokens = 350; // Should fit 3-4 messages
      const pruned = pruneByTokens(messages, maxTokens, 2, simpleTokenCounter);

      const totalTokens = simpleTokenCounter(pruned);
      expect(totalTokens).toBeLessThanOrEqual(maxTokens);
    });

    it('should prioritize recent messages', () => {
      const messages: Message[] = [
        createMessage('user', 'a'.repeat(100), 10),
        createMessage('user', 'b'.repeat(100), 9),
        createMessage('user', 'c'.repeat(100), 1),
        createMessage('user', 'd'.repeat(100), 0.5),
      ];

      const maxTokens = 250; // Should fit 2-3 messages
      const pruned = pruneByTokens(messages, maxTokens, 2, simpleTokenCounter);

      // Should include the 2 most recent messages
      expect(pruned.some((m) => m.content.includes('c'))).toBe(true);
      expect(pruned.some((m) => m.content.includes('d'))).toBe(true);
    });

    it('should always keep keepRecent messages', () => {
      const messages: Message[] = [];

      // Create messages that exceed token limit
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage('user', 'a'.repeat(100), 10 - i));
      }

      const keepRecent = 5;
      const maxTokens = 200; // Very small limit
      const pruned = pruneByTokens(messages, maxTokens, keepRecent, simpleTokenCounter);

      // Should keep at least keepRecent messages
      expect(pruned.length).toBeGreaterThanOrEqual(keepRecent);
    });
  });

  describe('applyPruningStrategy', () => {
    it('should apply relevance strategy', () => {
      const messages: Message[] = [
        createMessage('user', 'implement feature', 10),
        createMessage('assistant', 'response', 9),
        createMessage('user', 'recent', 1),
      ];

      const pruned = applyPruningStrategy(
        messages,
        {
          type: 'relevance',
          task: 'implement',
          maxTokens: 10000,
          keepRecent: 1,
        },
        simpleTokenCounter
      );

      expect(pruned.length).toBeGreaterThan(0);
    });

    it('should apply age strategy', () => {
      const messages: Message[] = [
        createMessage('user', 'old', 48),
        createMessage('user', 'recent', 1),
      ];

      const pruned = applyPruningStrategy(
        messages,
        {
          type: 'age',
          keepRecent: 1,
        },
        simpleTokenCounter
      );

      expect(pruned).toHaveLength(1);
      expect(pruned[0]?.content).toBe('recent');
    });

    it('should apply token-based strategy', () => {
      const messages: Message[] = [];

      for (let i = 0; i < 10; i++) {
        messages.push(createMessage('user', 'a'.repeat(100), 10 - i));
      }

      const pruned = applyPruningStrategy(
        messages,
        {
          type: 'token-based',
          maxTokens: 300,
          keepRecent: 2,
        },
        simpleTokenCounter
      );

      const totalTokens = simpleTokenCounter(pruned);
      expect(totalTokens).toBeLessThanOrEqual(300);
    });

    it('should throw error for relevance without task', () => {
      const messages: Message[] = [createMessage('user', 'test')];

      expect(() =>
        applyPruningStrategy(
          messages,
          {
            type: 'relevance',
            maxTokens: 1000,
          },
          simpleTokenCounter
        )
      ).toThrow('Relevance pruning requires task and maxTokens');
    });

    it('should throw error for token-based without maxTokens', () => {
      const messages: Message[] = [createMessage('user', 'test')];

      expect(() =>
        applyPruningStrategy(
          messages,
          {
            type: 'token-based',
          },
          simpleTokenCounter
        )
      ).toThrow('Token-based pruning requires maxTokens');
    });

    it('should throw error for unknown strategy', () => {
      const messages: Message[] = [createMessage('user', 'test')];

      expect(() =>
        applyPruningStrategy(
          messages,
          {
            type: 'unknown' as any,
          },
          simpleTokenCounter
        )
      ).toThrow('Unknown pruning strategy');
    });
  });
});
