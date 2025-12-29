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

/**
 * Format message content for display, handling different content types
 */
function formatMessageContent(content: string | unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  // Handle multi-part content (e.g., attachments)
  if (Array.isArray(content)) {
    return content
      .map((part: { type: string; text?: string }) => {
        if (part.type === 'text' && part.text) {
          return part.text;
        }
        if (part.type === 'image') {
          return '[Image attachment]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content);
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  theme,
  syntaxHighlighting: _syntaxHighlighting,
}) => {
  const themeDefinition = getTheme(theme);
  const { userMessage, assistantMessage, systemMessage, info } = themeDefinition.colors;
  const rawColors = themeDefinition.rawColors;

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

  /**
   * Get display label for message role
   */
  const getRoleLabel = (message: Message): string => {
    // Check for special message types via metadata
    if (message.metadata?.type === 'command') {
      return 'COMMAND';
    }
    if (message.metadata?.type === 'agent') {
      return message.metadata.agentName || 'AGENT';
    }
    return message.role.toUpperCase();
  };

  /**
   * Get role color (special colors for commands and agents)
   */
  const getRoleColor = (message: Message) => {
    if (message.metadata?.type === 'command') {
      return info; // Use info color for commands (cyan-ish)
    }
    if (message.metadata?.type === 'agent') {
      return themeDefinition.colors.statusActing; // Use agent acting color
    }
    return getRoleChalk(message.role);
  };

  /**
   * Check if message should have background highlighting
   */
  const shouldHighlight = (message: Message): boolean => {
    return message.role === 'user' || message.metadata?.type === 'command';
  };

  /**
   * Get background color for highlighted messages
   */
  const getBackgroundColor = (message: Message): string | undefined => {
    if (message.role === 'user') {
      return rawColors.userMessageBg || '#2E3440'; // Default to dark background
    }
    if (message.metadata?.type === 'command') {
      return rawColors.commandBg || '#3B4252'; // Slightly different for commands
    }
    return undefined;
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

  const renderMessage = (message: Message, index: number) => {
    const roleColor = getRoleColor(message);
    const roleLabel = getRoleLabel(message);
    const highlight = shouldHighlight(message);
    const bgColor = getBackgroundColor(message);
    const content = formatMessageContent(message.content);

    // Render with or without background based on message type
    if (highlight && bgColor) {
      return (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Box paddingX={1} paddingY={0}>
            <Text backgroundColor={bgColor}>
              {roleColor.bold(`[${roleLabel}]: `)}
              {content}
            </Text>
          </Box>
          {message.role === 'assistant' && renderThinkingIndicator(message)}
        </Box>
      );
    }

    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Text>{roleColor.bold(`[${roleLabel}]:`)}</Text>
        <Text>{content}</Text>
        {message.role === 'assistant' && renderThinkingIndicator(message)}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
      {messages.length === 0 && <Text dimColor>No messages yet. Start typing below...</Text>}
      {messages.length > 0 && (
        <Static items={messages}>{(message, index) => renderMessage(message, index)}</Static>
      )}
    </Box>
  );
};
