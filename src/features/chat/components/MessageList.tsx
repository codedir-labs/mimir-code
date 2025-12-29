/**
 * Message list component
 * Displays conversation messages with role-based colors and thinking indicators
 * Uses Static component to prevent re-rendering of existing messages
 */

import React from 'react';
import { Box, Text, Static } from 'ink';
import { Message } from '@/types/index.js';
import { Theme } from '@/shared/config/schemas.js';
import { getTheme } from '@/shared/config/themes/index.js';

export interface MessageListProps {
  messages: Message[];
  theme: Theme;
  syntaxHighlighting: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  theme,
  syntaxHighlighting: _syntaxHighlighting,
}) => {
  const themeDefinition = getTheme(theme);
  const { userMessage, assistantMessage, systemMessage } = themeDefinition.colors;

  const getRoleChalk = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return userMessage;
      case 'assistant':
        return assistantMessage;
      case 'system':
        return systemMessage;
      default:
        return assistantMessage;
    }
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatCost = (cost: number): string => {
    if (cost === 0) return '$0.00';
    if (cost < 0.0001) return `$${cost.toExponential(2)}`;
    return `$${cost.toFixed(4)}`;
  };

  const renderThinkingIndicator = (message: Message) => {
    if (!message.metadata) return null;

    const { duration, usage, cost, model, provider } = message.metadata;

    const parts: string[] = [];

    // Model/Provider
    if (provider && model) {
      parts.push(`${provider}/${model}`);
    } else if (model) {
      parts.push(model);
    }

    // Duration
    if (duration != null) {
      parts.push(formatDuration(duration));
    }

    // Tokens
    if (usage) {
      parts.push(`${usage.inputTokens}→${usage.outputTokens} tokens`);
    }

    // Cost
    if (cost != null) {
      parts.push(formatCost(cost));
    }

    if (parts.length === 0) return null;

    return (
      <Box marginTop={0}>
        <Text dimColor italic>
          ({parts.join(' • ')})
        </Text>
      </Box>
    );
  };

  const renderMessage = (message: Message, index: number) => (
    <Box key={index} flexDirection="column" marginBottom={1}>
      <Text>{getRoleChalk(message.role).bold(`[${message.role.toUpperCase()}]:`)}</Text>
      <Text>{message.content}</Text>
      {message.role === 'assistant' && renderThinkingIndicator(message)}
    </Box>
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
      {messages.length === 0 && <Text dimColor>No messages yet. Start typing below...</Text>}
      {messages.length > 0 && (
        <Static items={messages}>{(message, index) => renderMessage(message, index)}</Static>
      )}
    </Box>
  );
};
