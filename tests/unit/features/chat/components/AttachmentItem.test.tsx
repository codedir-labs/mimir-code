/**
 * Render tests for AttachmentItem component
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { AttachmentItem } from '@/features/chat/components/AttachmentItem.js';
import type { Theme } from '@/shared/config/schemas.js';

describe('AttachmentItem', () => {
  const defaultProps = {
    id: 'test-id-1',
    type: 'text' as const,
    label: '[Pasted text #1]',
    size: 1024,
    isSelected: false,
    theme: 'mimir' as Theme,
  };

  describe('rendering', () => {
    it('should render text attachment with label', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} />);

      expect(lastFrame()).toContain('[Pasted text #1]');
      expect(lastFrame()).toContain('1.0 KB');
      expect(lastFrame()).toContain('📝'); // Text icon
    });

    it('should render image attachment with icon', () => {
      const { lastFrame } = render(
        <AttachmentItem {...defaultProps} type="image" label="[Image #1]" />
      );

      expect(lastFrame()).toContain('[Image #1]');
      expect(lastFrame()).toContain('🖼'); // Image icon
    });

    it('should show selection indicator when selected', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} isSelected={true} />);

      expect(lastFrame()).toContain('▶'); // Selection indicator
    });

    it('should not show selection indicator when not selected', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} isSelected={false} />);

      expect(lastFrame()).not.toContain('▶');
    });

    it('should format file size correctly', () => {
      const { lastFrame: frame1 } = render(<AttachmentItem {...defaultProps} size={500} />);
      expect(frame1()).toContain('500.0 B');

      const { lastFrame: frame2 } = render(<AttachmentItem {...defaultProps} size={1536} />);
      expect(frame2()).toContain('1.5 KB');

      const { lastFrame: frame3 } = render(
        <AttachmentItem {...defaultProps} size={1048576} />
      );
      expect(frame3()).toContain('1.0 MB');
    });
  });

  describe('themes', () => {
    it('should render with mimir theme', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} theme="mimir" />);
      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toContain('[Pasted text #1]');
    });

    it('should render with dark theme', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} theme="dark" />);
      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toContain('[Pasted text #1]');
    });

    it('should render with light theme', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} theme="light" />);
      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toContain('[Pasted text #1]');
    });

    it('should render with tokyo-night theme', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} theme="tokyo-night" />);
      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toContain('[Pasted text #1]');
    });
  });

  describe('different sizes', () => {
    it('should handle zero size', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} size={0} />);
      expect(lastFrame()).toContain('0 B');
    });

    it('should handle large sizes', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} size={10485760} />);
      expect(lastFrame()).toContain('10.0 MB');
    });

    it('should handle very small sizes', () => {
      const { lastFrame } = render(<AttachmentItem {...defaultProps} size={1} />);
      expect(lastFrame()).toContain('1.0 B');
    });
  });

  describe('labels', () => {
    it('should display custom labels', () => {
      const { lastFrame } = render(
        <AttachmentItem {...defaultProps} label="[Custom Label #99]" />
      );
      expect(lastFrame()).toContain('[Custom Label #99]');
    });

    it('should display long labels', () => {
      const longLabel = '[This is a very long pasted text attachment label #123]';
      const { lastFrame } = render(<AttachmentItem {...defaultProps} label={longLabel} />);
      expect(lastFrame()).toContain(longLabel);
    });
  });

  describe('component updates', () => {
    it('should update when selection changes', () => {
      const { lastFrame, rerender } = render(
        <AttachmentItem {...defaultProps} isSelected={false} />
      );

      expect(lastFrame()).not.toContain('▶');

      rerender(<AttachmentItem {...defaultProps} isSelected={true} />);

      expect(lastFrame()).toContain('▶');
    });

    it('should update when size changes', () => {
      const { lastFrame, rerender } = render(<AttachmentItem {...defaultProps} size={1024} />);

      expect(lastFrame()).toContain('1.0 KB');

      rerender(<AttachmentItem {...defaultProps} size={2048} />);

      expect(lastFrame()).toContain('2.0 KB');
    });
  });
});
