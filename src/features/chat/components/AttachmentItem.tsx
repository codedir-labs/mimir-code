/**
 * AttachmentItem component
 * Displays a single attachment (text or image) with icon, label, size, tokens, and cost
 */

import React from 'react';
import { Box, Text } from 'ink';
import { type Theme } from '@/shared/config/schemas.js';
import { getTheme } from '@/shared/config/themes/index.js';
import { AttachmentManager } from '../utils/AttachmentManager.js';
import chalk from 'chalk';

export interface AttachmentItemProps {
  /** Attachment ID */
  id: string;
  /** Attachment type */
  type: 'text' | 'image';
  /** Display label */
  label: string;
  /** Size in bytes */
  size: number;
  /** Token count (for text attachments) */
  tokens?: number;
  /** Estimated cost in USD */
  cost?: number;
  /** Whether this attachment is selected */
  isSelected: boolean;
  /** Theme configuration */
  theme: Theme;
  /** Callback when attachment should be removed */
  onRemove?: (id: string) => void;
}

/**
 * Renders a single attachment item
 */
export const AttachmentItem: React.FC<AttachmentItemProps> = ({
  id: _id,
  type,
  label,
  size,
  tokens,
  cost,
  isSelected,
  theme,
  onRemove: _onRemove,
}) => {
  const themeDefinition = getTheme(theme);

  // Icon based on type
  const icon = type === 'text' ? '📝' : '🖼';

  // Format size
  const sizeStr = AttachmentManager.formatSize(size);

  // Format tokens
  const tokensStr = tokens !== undefined ? `${tokens.toLocaleString()} tok` : undefined;

  // Format cost
  const costStr = cost !== undefined ? AttachmentManager.formatCost(cost) : undefined;

  // Background color when selected (use theme accent color)
  const bgColor = isSelected ? (themeDefinition.rawColors.wizardAccent ?? '#3b82f6') : undefined;

  // Text color
  const textColor = isSelected
    ? '#000000'
    : (themeDefinition.rawColors.borderColor ?? '#ffffff');

  // Selection indicator
  const indicator = isSelected ? '▶ ' : '  ';

  // Build info string: size | tokens | cost
  const infoParts = [sizeStr];
  if (tokensStr) infoParts.push(tokensStr);
  if (costStr) infoParts.push(costStr);
  const infoStr = infoParts.join(' | ');

  // Render content
  const content = `${indicator}${icon} ${label} (${infoStr})`;

  if (bgColor) {
    // Use chalk.bgHex for background color (theme system requirement)
    const bg = chalk.bgHex(bgColor);
    const fg = chalk.hex(textColor);
    return (
      <Box paddingX={1}>
        <Text>{bg(fg(content))}</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text color={textColor}>{content}</Text>
    </Box>
  );
};
