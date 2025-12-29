/**
 * AttachmentsArea component
 * Container for all attachments with header and keyboard shortcuts footer
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { type Theme, type KeyBindingsConfig } from '@/shared/config/schemas.js';
import { AttachmentItem } from './AttachmentItem.js';
import { AttachmentManager } from '../utils/AttachmentManager.js';
import type { Attachment } from '../types/attachment.js';
import { buildFooterText } from '@/shared/utils/keyboardFormatter.js';

export interface AttachmentsAreaProps {
  /** Map of attachments by ID */
  attachments: Map<string, Attachment>;
  /** Currently selected attachment ID (null if none selected) */
  selectedAttachmentId: string | null;
  /** Theme configuration */
  theme: Theme;
  /** Keyboard bindings configuration */
  keyBindings: KeyBindingsConfig;
  /** LLM provider name for cost calculation */
  provider?: string;
  /** LLM model name for cost calculation */
  model?: string;
  /** Callback when attachment should be removed */
  onRemove: (id: string) => void;
}

/**
 * Renders the attachments area with header, items, and footer
 * Max height: 5 lines with scroll indicators if more
 */
export const AttachmentsArea: React.FC<AttachmentsAreaProps> = ({
  attachments,
  selectedAttachmentId,
  theme,
  keyBindings,
  provider,
  model,
  onRemove,
}) => {
  // Theme available for future styling
  void theme;

  // Convert attachments map to sorted array with token/cost info
  const attachmentList = useMemo(() => {
    return Array.from(attachments.values())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((attachment) => {
        // Calculate tokens for text attachments
        let tokens: number | undefined;
        let cost: number | undefined;

        if (attachment.type === 'text' && typeof attachment.content === 'string') {
          tokens = AttachmentManager.countTokens(attachment.content);
          if (provider && model) {
            cost = AttachmentManager.calculateCost(tokens, provider, model);
          }
        }

        return { ...attachment, tokens, cost };
      });
  }, [attachments, provider, model]);

  // Don't render if no attachments
  if (attachmentList.length === 0) {
    return null;
  }

  // Build footer text with keyboard shortcuts
  const footerText = useMemo(() => {
    return buildFooterText([
      { shortcut: keyBindings.navigateLeft, label: 'prev' },
      { shortcut: keyBindings.navigateRight, label: 'next' },
      { shortcut: keyBindings.removeAttachment, label: 'remove' },
    ]);
  }, [keyBindings]);

  // Determine if we need scroll indicators
  const maxVisibleItems = 3; // Max items to show before scrolling
  const needsScrolling = attachmentList.length > maxVisibleItems;

  // Calculate visible range based on selection
  let visibleStart = 0;
  let visibleEnd = attachmentList.length;

  if (needsScrolling && selectedAttachmentId) {
    const selectedIndex = attachmentList.findIndex((a) => a.id === selectedAttachmentId);
    if (selectedIndex !== -1) {
      // Center selection in visible range
      visibleStart = Math.max(0, selectedIndex - 1);
      visibleEnd = Math.min(attachmentList.length, visibleStart + maxVisibleItems);
      visibleStart = Math.max(0, visibleEnd - maxVisibleItems);
    }
  } else if (needsScrolling) {
    visibleEnd = maxVisibleItems;
  }

  const visibleAttachments = attachmentList.slice(visibleStart, visibleEnd);
  const hasMoreAbove = visibleStart > 0;
  const hasMoreBelow = visibleEnd < attachmentList.length;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {/* Header */}
      <Box paddingX={1}>
        <Text bold>
          Attachments ({attachmentList.length})
        </Text>
      </Box>

      {/* Scroll indicator - above */}
      {hasMoreAbove && (
        <Box paddingX={1}>
          <Text dimColor>
            ↑ {visibleStart} more above...
          </Text>
        </Box>
      )}

      {/* Attachment items */}
      {visibleAttachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          id={attachment.id}
          type={attachment.type}
          label={attachment.label}
          size={attachment.metadata.size}
          tokens={attachment.tokens}
          cost={attachment.cost}
          isSelected={attachment.id === selectedAttachmentId}
          theme={theme}
          onRemove={onRemove}
        />
      ))}

      {/* Scroll indicator - below */}
      {hasMoreBelow && (
        <Box paddingX={1}>
          <Text dimColor>
            ↓ {attachmentList.length - visibleEnd} more below...
          </Text>
        </Box>
      )}

      {/* Footer with keyboard shortcuts */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          {footerText}
        </Text>
      </Box>
    </Box>
  );
};
