/**
 * Render tests for AttachmentsArea component
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { AttachmentsArea } from '@/features/chat/components/AttachmentsArea.js';
import type { Attachment } from '@/features/chat/types/attachment.js';
import type { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';

describe('AttachmentsArea', () => {
  const defaultKeyBindings: KeyBindingsConfig = {
    enabled: true,
    leader: null,
    leaderTimeout: 1000,
    interrupt: ['ctrl+c', 'escape'],
    accept: ['enter'],
    modeSwitch: ['shift+tab'],
    editCommand: ['ctrl+e'],
    showTooltip: ['ctrl+space', 'tab'],
    navigateUp: ['arrowup'],
    navigateDown: ['arrowdown'],
    navigateLeft: ['ctrl+p'],
    navigateRight: ['ctrl+n'],
    removeAttachment: ['ctrl+d'],
    insertAttachmentRef: ['ctrl+r'],
    openAttachment: ['ctrl+o'],
    pasteFromClipboard: ['ctrl+v'],
    help: [],
    clearScreen: ['ctrl+l'],
    undo: ['ctrl+z'],
    redo: ['ctrl+y'],
    newSession: [],
    listSessions: [],
    resumeSession: [],
    cursorToLineStart: [],
    cursorToLineEnd: [],
    cursorWordLeft: [],
    cursorWordRight: [],
    deleteWordLeft: [],
    deleteWordRight: [],
    deleteToLineEnd: [],
    deleteToLineStart: [],
    deleteEntireLine: [],
  };

  const createAttachment = (
    id: string,
    type: 'text' | 'image',
    label: string,
    size: number
  ): Attachment => ({
    id,
    type,
    label,
    content: type === 'text' ? 'Test content' : Buffer.from('fake-image'),
    metadata: {
      size,
      format: type === 'text' ? 'plain' : 'png',
      source: type === 'text' ? 'paste' : 'clipboard',
      ...(type === 'text' && { lines: 10, chars: 500 }),
    },
    createdAt: new Date(),
  });

  const defaultProps = {
    attachments: new Map<string, Attachment>(),
    selectedAttachmentId: null,
    theme: 'mimir' as Theme,
    keyBindings: defaultKeyBindings,
    onRemove: () => {},
  };

  describe('rendering', () => {
    it('should render nothing when no attachments', () => {
      const { lastFrame } = render(<AttachmentsArea {...defaultProps} />);
      expect(lastFrame()).toBe('');
    });

    it('should render header with attachment count', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));
      attachments.set('2', createAttachment('2', 'text', '[#2 - Pasted text]', 2048));

      const { lastFrame } = render(<AttachmentsArea {...defaultProps} attachments={attachments} />);

      expect(lastFrame()).toContain('Attachments (2)');
    });

    it('should render multiple attachments', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));
      attachments.set('2', createAttachment('2', 'image', '[#1 - Image]', 2048));

      const { lastFrame } = render(<AttachmentsArea {...defaultProps} attachments={attachments} />);

      expect(lastFrame()).toContain('[#1 - Pasted text]');
      expect(lastFrame()).toContain('[#1 - Image]');
    });

    it('should show keyboard shortcuts in footer', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));

      const { lastFrame } = render(<AttachmentsArea {...defaultProps} attachments={attachments} />);

      // Should contain navigation and remove shortcuts
      expect(lastFrame()).toMatch(/prev|next|remove/i);
    });

    it('should highlight selected attachment', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));
      attachments.set('2', createAttachment('2', 'text', '[#2 - Pasted text]', 2048));

      const { lastFrame } = render(
        <AttachmentsArea {...defaultProps} attachments={attachments} selectedAttachmentId="1" />
      );

      expect(lastFrame()).toContain('▶'); // Selection indicator
    });
  });

  describe('scrolling behavior', () => {
    it('should show scroll indicators when more than 3 attachments', () => {
      const attachments = new Map<string, Attachment>();
      for (let i = 1; i <= 5; i++) {
        attachments.set(
          `${i}`,
          createAttachment(`${i}`, 'text', `[#${i} - Pasted text]`, 1024)
        );
      }

      const { lastFrame } = render(<AttachmentsArea {...defaultProps} attachments={attachments} />);

      // Should show "more below" indicator
      expect(lastFrame()).toMatch(/more below|↓/);
    });

    it('should not show scroll indicators with 3 or fewer attachments', () => {
      const attachments = new Map<string, Attachment>();
      for (let i = 1; i <= 3; i++) {
        attachments.set(
          `${i}`,
          createAttachment(`${i}`, 'text', `[#${i} - Pasted text]`, 1024)
        );
      }

      const { lastFrame } = render(<AttachmentsArea {...defaultProps} attachments={attachments} />);

      // Should NOT show scroll indicators
      expect(lastFrame()).not.toMatch(/more above|more below|↑|↓/);
    });

    it('should show "more above" when scrolled down', () => {
      const attachments = new Map<string, Attachment>();
      for (let i = 1; i <= 5; i++) {
        attachments.set(
          `${i}`,
          createAttachment(`${i}`, 'text', `[#${i} - Pasted text]`, 1024)
        );
      }

      // Select last item to scroll to bottom
      const { lastFrame } = render(
        <AttachmentsArea {...defaultProps} attachments={attachments} selectedAttachmentId="5" />
      );

      expect(lastFrame()).toMatch(/more above|↑/);
    });
  });

  describe('attachment ordering', () => {
    it('should render attachments in creation order', () => {
      const attachments = new Map<string, Attachment>();

      const attachment1 = createAttachment('1', 'text', '[#1 - Pasted text]', 1024);
      attachment1.createdAt = new Date('2025-01-01T10:00:00');

      const attachment2 = createAttachment('2', 'text', '[#2 - Pasted text]', 2048);
      attachment2.createdAt = new Date('2025-01-01T10:01:00');

      const attachment3 = createAttachment('3', 'text', '[#3 - Pasted text]', 3072);
      attachment3.createdAt = new Date('2025-01-01T10:02:00');

      // Add in random order
      attachments.set('2', attachment2);
      attachments.set('1', attachment1);
      attachments.set('3', attachment3);

      const { lastFrame } = render(<AttachmentsArea {...defaultProps} attachments={attachments} />);

      const frame = lastFrame();
      const idx1 = frame.indexOf('#1');
      const idx2 = frame.indexOf('#2');
      const idx3 = frame.indexOf('#3');

      // Should be in creation order (1, 2, 3)
      expect(idx1).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx3);
    });
  });

  describe('themes', () => {
    it('should render with different themes', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));

      const themes: Theme[] = ['mimir', 'dark', 'light', 'tokyo-night', 'dracula'];

      themes.forEach((theme) => {
        const { lastFrame } = render(
          <AttachmentsArea {...defaultProps} attachments={attachments} theme={theme} />
        );
        expect(lastFrame()).toContain('[#1 - Pasted text]');
        expect(lastFrame()).toContain('Attachments (1)');
      });
    });
  });

  describe('component updates', () => {
    it('should update when attachments added', () => {
      const attachments1 = new Map<string, Attachment>();
      attachments1.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));

      const { lastFrame, rerender } = render(
        <AttachmentsArea {...defaultProps} attachments={attachments1} />
      );

      expect(lastFrame()).toContain('Attachments (1)');

      const attachments2 = new Map(attachments1);
      attachments2.set('2', createAttachment('2', 'text', '[#2 - Pasted text]', 2048));

      rerender(<AttachmentsArea {...defaultProps} attachments={attachments2} />);

      expect(lastFrame()).toContain('Attachments (2)');
      expect(lastFrame()).toContain('[#2 - Pasted text]');
    });

    it('should update when selection changes', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));
      attachments.set('2', createAttachment('2', 'text', '[#2 - Pasted text]', 2048));

      const { lastFrame, rerender } = render(
        <AttachmentsArea {...defaultProps} attachments={attachments} selectedAttachmentId="1" />
      );

      const frame1 = lastFrame();
      expect(frame1).toContain('▶');

      rerender(
        <AttachmentsArea {...defaultProps} attachments={attachments} selectedAttachmentId="2" />
      );

      const frame2 = lastFrame();
      expect(frame2).toContain('▶');
    });

    it('should update when attachments removed', () => {
      const attachments1 = new Map<string, Attachment>();
      attachments1.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));
      attachments1.set('2', createAttachment('2', 'text', '[#2 - Pasted text]', 2048));

      const { lastFrame, rerender } = render(
        <AttachmentsArea {...defaultProps} attachments={attachments1} />
      );

      expect(lastFrame()).toContain('Attachments (2)');

      const attachments2 = new Map<string, Attachment>();
      attachments2.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));

      rerender(<AttachmentsArea {...defaultProps} attachments={attachments2} />);

      expect(lastFrame()).toContain('Attachments (1)');
      expect(lastFrame()).not.toContain('[#2 - Pasted text]');
    });
  });

  describe('empty state', () => {
    it('should render nothing when attachments map is empty', () => {
      const { lastFrame } = render(
        <AttachmentsArea {...defaultProps} attachments={new Map()} />
      );
      expect(lastFrame()).toBe('');
    });

    it('should transition from content to empty', () => {
      const attachments = new Map<string, Attachment>();
      attachments.set('1', createAttachment('1', 'text', '[#1 - Pasted text]', 1024));

      const { lastFrame, rerender } = render(
        <AttachmentsArea {...defaultProps} attachments={attachments} />
      );

      expect(lastFrame()).toContain('Attachments (1)');

      rerender(<AttachmentsArea {...defaultProps} attachments={new Map()} />);

      expect(lastFrame()).toBe('');
    });
  });
});
