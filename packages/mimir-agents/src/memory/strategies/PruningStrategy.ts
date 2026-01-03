/**
 * Pruning strategies for context management
 */

import type { Message } from '../types.js';
import type { PruningStrategy } from '../interfaces.js';

/**
 * Score a message for relevance-based pruning
 */
export function scoreMessage(message: Message, task: string, currentTime: Date): number {
  let score = 0;

  // Recency (0-100)
  const ageInHours = (currentTime.getTime() - message.timestamp.getTime()) / (1000 * 60 * 60);
  score += Math.max(0, 100 - ageInHours);

  // Role (0-100)
  if (message.role === 'user') score += 100;
  else if (message.role === 'assistant') score += 50;
  else if (message.role === 'tool') score += 25;
  else if (message.role === 'system') score += 10;

  // Tool calls (0-50)
  if (message.toolCalls && message.toolCalls.length > 0) {
    score += 50;
  }

  // Keywords (0-50)
  const taskKeywords = task.toLowerCase().split(' ');
  const messageText = message.content.toLowerCase();
  const matchingKeywords = taskKeywords.filter((k) => messageText.includes(k)).length;
  score += (matchingKeywords / taskKeywords.length) * 50;

  return score;
}

/**
 * Prune messages by relevance
 */
export function pruneByRelevance(
  messages: Message[],
  task: string,
  maxTokens: number,
  keepRecent: number = 10,
  tokenCounter: (messages: Message[]) => number
): Message[] {
  // Always keep recent messages
  const recentMessages = messages.slice(-keepRecent);
  const olderMessages = messages.slice(0, -keepRecent);

  // Score older messages
  const currentTime = new Date();
  const scoredMessages = olderMessages.map((msg) => ({
    message: msg,
    score: scoreMessage(msg, task, currentTime),
  }));

  // Sort by score (highest first)
  scoredMessages.sort((a, b) => b.score - a.score);

  // Keep messages until token limit
  const kept: Message[] = [];
  let tokenCount = tokenCounter(recentMessages);

  for (const { message } of scoredMessages) {
    const messageTokens = tokenCounter([message]);
    if (tokenCount + messageTokens <= maxTokens) {
      kept.push(message);
      tokenCount += messageTokens;
    }
  }

  // Return kept messages + recent messages (in chronological order)
  return [...kept.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()), ...recentMessages];
}

/**
 * Prune messages by age
 */
export function pruneByAge(
  messages: Message[],
  maxAgeHours: number,
  keepRecent: number = 10
): Message[] {
  const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;

  // Always keep recent messages (handle keepRecent = 0 edge case)
  const recentMessages = keepRecent > 0 ? messages.slice(-keepRecent) : [];
  const olderMessages = keepRecent > 0 ? messages.slice(0, -keepRecent) : messages;

  // Keep messages newer than cutoff
  const kept = olderMessages.filter((msg) => msg.timestamp.getTime() >= cutoffTime);

  return [...kept, ...recentMessages];
}

/**
 * Prune messages by token count
 */
export function pruneByTokens(
  messages: Message[],
  maxTokens: number,
  keepRecent: number = 10,
  tokenCounter: (messages: Message[]) => number
): Message[] {
  // Always keep recent messages
  const recentMessages = messages.slice(-keepRecent);
  const olderMessages = messages.slice(0, -keepRecent);

  let tokenCount = tokenCounter(recentMessages);
  const kept: Message[] = [];

  // Add older messages from most recent to oldest until we hit token limit
  for (let i = olderMessages.length - 1; i >= 0; i--) {
    const message = olderMessages[i]!;
    const messageTokens = tokenCounter([message]);

    if (tokenCount + messageTokens <= maxTokens) {
      kept.unshift(message); // Add to beginning to maintain order
      tokenCount += messageTokens;
    }
  }

  return [...kept, ...recentMessages];
}

/**
 * Apply pruning strategy to messages
 */
export function applyPruningStrategy(
  messages: Message[],
  strategy: PruningStrategy,
  tokenCounter: (messages: Message[]) => number
): Message[] {
  const keepRecent = strategy.keepRecent || 10;

  switch (strategy.type) {
    case 'relevance': {
      if (!strategy.task || !strategy.maxTokens) {
        throw new Error('Relevance pruning requires task and maxTokens');
      }
      return pruneByRelevance(
        messages,
        strategy.task,
        strategy.maxTokens,
        keepRecent,
        tokenCounter
      );
    }

    case 'age': {
      // Default to 24 hours if not specified
      const maxAgeHours = strategy.maxTokens ? strategy.maxTokens / 1000 : 24;
      return pruneByAge(messages, maxAgeHours, keepRecent);
    }

    case 'token-based': {
      if (!strategy.maxTokens) {
        throw new Error('Token-based pruning requires maxTokens');
      }
      return pruneByTokens(messages, strategy.maxTokens, keepRecent, tokenCounter);
    }

    default:
      throw new Error(`Unknown pruning strategy: ${strategy.type}`);
  }
}
