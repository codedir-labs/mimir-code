/**
 * Integration tests for attachment keyboard navigation
 * Tests arrow key navigation and delete functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import type { Attachment, PasteMetadata } from '@/features/chat/types/attachment.js';

describe('Attachment Keyboard Navigation', () => {
  let attachmentManager: AttachmentManager;
  let attachments: Map<string, Attachment>;
  let selectedAttachmentId: string | null;

  beforeEach(() => {
    attachmentManager = new AttachmentManager();
    attachmentManager.resetCounters();
    attachments = new Map();
    selectedAttachmentId = null;
  });

  /**
   * Helper to simulate attachment state
   */
  function addAttachment(content: string, type: 'text' | 'image' = 'text'): Attachment {
    const metadata: PasteMetadata = {
      isBracketedPaste: true,
      detectMethod: 'bracketed',
      originalLength: content.length,
    };
    const attachment =
      type === 'text'
        ? attachmentManager.addTextAttachment(content, metadata)
        : attachmentManager.addImageAttachment(Buffer.from(content), 'png');

    attachments.set(attachment.id, attachment);
    return attachment;
  }

  /**
   * Helper to simulate navigateLeft action
   */
  function navigateLeft(): void {
    if (attachments.size === 0) return;

    const list = Array.from(attachments.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const currentIdx = selectedAttachmentId
      ? list.findIndex((a) => a.id === selectedAttachmentId)
      : 0;

    const newIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
    selectedAttachmentId = list[newIdx]?.id || null;
  }

  /**
   * Helper to simulate navigateRight action
   */
  function navigateRight(): void {
    if (attachments.size === 0) return;

    const list = Array.from(attachments.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const currentIdx = selectedAttachmentId
      ? list.findIndex((a) => a.id === selectedAttachmentId)
      : 0;

    const newIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
    selectedAttachmentId = list[newIdx]?.id || null;
  }

  /**
   * Helper to simulate removeAttachment action
   */
  function removeAttachment(): void {
    if (!selectedAttachmentId) return;

    attachmentManager.remove(selectedAttachmentId);
    attachments.delete(selectedAttachmentId);
    selectedAttachmentId = null;
  }

  describe('Navigate Left (←)', () => {
    it('should move selection from second to first attachment', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');

      selectedAttachmentId = attachment2.id;
      navigateLeft();

      expect(selectedAttachmentId).toBe(attachment1.id);
    });

    it('should wrap from first to last attachment', () => {
      const attachment1 = addAttachment('First');
      addAttachment('Second');
      const attachment3 = addAttachment('Third');

      selectedAttachmentId = attachment1.id;
      navigateLeft();

      expect(selectedAttachmentId).toBe(attachment3.id);
    });

    it('should do nothing with no attachments', () => {
      selectedAttachmentId = null;
      navigateLeft();

      expect(selectedAttachmentId).toBeNull();
    });

    it('should stay on same attachment if only one exists', () => {
      const attachment1 = addAttachment('Only');

      selectedAttachmentId = attachment1.id;
      navigateLeft();

      // Wraps to itself (last = first when size is 1)
      expect(selectedAttachmentId).toBe(attachment1.id);
    });

    it('should select last attachment if none selected', () => {
      addAttachment('First');
      addAttachment('Second');
      const attachment3 = addAttachment('Third');

      selectedAttachmentId = null;
      navigateLeft();

      // When currentIdx is 0 (default when null), left goes to last
      expect(selectedAttachmentId).toBe(attachment3.id);
    });

    it('should navigate through multiple attachments', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');
      const attachment4 = addAttachment('Fourth');

      selectedAttachmentId = attachment4.id;

      navigateLeft(); // → Third
      expect(selectedAttachmentId).toBe(attachment3.id);

      navigateLeft(); // → Second
      expect(selectedAttachmentId).toBe(attachment2.id);

      navigateLeft(); // → First
      expect(selectedAttachmentId).toBe(attachment1.id);

      navigateLeft(); // → Fourth (wrap)
      expect(selectedAttachmentId).toBe(attachment4.id);
    });
  });

  describe('Navigate Right (→)', () => {
    it('should move selection from first to second attachment', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');

      selectedAttachmentId = attachment1.id;
      navigateRight();

      expect(selectedAttachmentId).toBe(attachment2.id);
    });

    it('should wrap from last to first attachment', () => {
      const attachment1 = addAttachment('First');
      const _attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');

      selectedAttachmentId = attachment3.id;
      navigateRight();

      expect(selectedAttachmentId).toBe(attachment1.id);
    });

    it('should do nothing with no attachments', () => {
      selectedAttachmentId = null;
      navigateRight();

      expect(selectedAttachmentId).toBeNull();
    });

    it('should stay on same attachment if only one exists', () => {
      const attachment1 = addAttachment('Only');

      selectedAttachmentId = attachment1.id;
      navigateRight();

      // Wraps to itself (first = last when size is 1)
      expect(selectedAttachmentId).toBe(attachment1.id);
    });

    it('should select first attachment if none selected', () => {
      const _attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');

      selectedAttachmentId = null;
      navigateRight();

      // When currentIdx is 0 (default when null), right goes to next (index 1)
      expect(selectedAttachmentId).toBe(attachment2.id);
    });

    it('should navigate through multiple attachments', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');
      const attachment4 = addAttachment('Fourth');

      selectedAttachmentId = attachment1.id;

      navigateRight(); // → Second
      expect(selectedAttachmentId).toBe(attachment2.id);

      navigateRight(); // → Third
      expect(selectedAttachmentId).toBe(attachment3.id);

      navigateRight(); // → Fourth
      expect(selectedAttachmentId).toBe(attachment4.id);

      navigateRight(); // → First (wrap)
      expect(selectedAttachmentId).toBe(attachment1.id);
    });
  });

  describe('Remove Attachment (Delete/Backspace)', () => {
    it('should remove selected attachment', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');

      selectedAttachmentId = attachment1.id;
      removeAttachment();

      expect(attachments.has(attachment1.id)).toBe(false);
      expect(attachments.has(attachment2.id)).toBe(true);
      expect(attachments.size).toBe(1);
      expect(selectedAttachmentId).toBeNull();
    });

    it('should do nothing if no attachment selected', () => {
      addAttachment('First');
      addAttachment('Second');

      selectedAttachmentId = null;
      const initialSize = attachments.size;

      removeAttachment();

      expect(attachments.size).toBe(initialSize);
    });

    it('should remove all attachments sequentially', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');

      selectedAttachmentId = attachment1.id;
      removeAttachment();
      expect(attachments.size).toBe(2);

      selectedAttachmentId = attachment2.id;
      removeAttachment();
      expect(attachments.size).toBe(1);

      selectedAttachmentId = attachment3.id;
      removeAttachment();
      expect(attachments.size).toBe(0);
    });

    it('should clear selection after removal', () => {
      const attachment1 = addAttachment('First');

      selectedAttachmentId = attachment1.id;
      removeAttachment();

      expect(selectedAttachmentId).toBeNull();
    });

    it('should remove image attachments', () => {
      const imageAttachment = addAttachment('image-data', 'image');

      selectedAttachmentId = imageAttachment.id;
      removeAttachment();

      expect(attachments.size).toBe(0);
      expect(selectedAttachmentId).toBeNull();
    });
  });

  describe('Mixed Navigation and Removal', () => {
    it('should navigate and remove in sequence', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');

      // Select first
      selectedAttachmentId = attachment1.id;

      // Navigate right to second
      navigateRight();
      expect(selectedAttachmentId).toBe(attachment2.id);

      // Remove second
      removeAttachment();
      expect(attachments.size).toBe(2);
      expect(attachments.has(attachment2.id)).toBe(false);
      expect(selectedAttachmentId).toBeNull();

      // Select third
      selectedAttachmentId = attachment3.id;

      // Navigate left to first
      navigateLeft();
      expect(selectedAttachmentId).toBe(attachment1.id);

      // Remove first
      removeAttachment();
      expect(attachments.size).toBe(1);
      expect(attachments.has(attachment1.id)).toBe(false);
    });

    it('should handle removal of middle attachment during navigation', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');

      selectedAttachmentId = attachment2.id;
      removeAttachment();

      // After removal, can still navigate remaining attachments
      selectedAttachmentId = attachment1.id;
      navigateRight();
      expect(selectedAttachmentId).toBe(attachment3.id);

      navigateLeft();
      expect(selectedAttachmentId).toBe(attachment1.id);
    });
  });

  describe('Sorting and Order', () => {
    it('should navigate attachments in creation order', () => {
      // Add attachments with slight time delays
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');

      selectedAttachmentId = attachment1.id;

      navigateRight();
      expect(selectedAttachmentId).toBe(attachment2.id);

      navigateRight();
      expect(selectedAttachmentId).toBe(attachment3.id);
    });

    it('should maintain order after removal', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');
      const attachment3 = addAttachment('Third');
      const attachment4 = addAttachment('Fourth');

      // Remove second attachment
      selectedAttachmentId = attachment2.id;
      removeAttachment();

      // Navigate should skip removed item
      selectedAttachmentId = attachment1.id;
      navigateRight();
      expect(selectedAttachmentId).toBe(attachment3.id); // Skips deleted attachment2

      navigateRight();
      expect(selectedAttachmentId).toBe(attachment4.id);
    });

    it('should handle mixed text and image attachments in order', () => {
      const textAttachment1 = addAttachment('Text 1', 'text');
      const imageAttachment1 = addAttachment('Image 1', 'image');
      const textAttachment2 = addAttachment('Text 2', 'text');
      const imageAttachment2 = addAttachment('Image 2', 'image');

      selectedAttachmentId = textAttachment1.id;

      navigateRight();
      expect(selectedAttachmentId).toBe(imageAttachment1.id);

      navigateRight();
      expect(selectedAttachmentId).toBe(textAttachment2.id);

      navigateRight();
      expect(selectedAttachmentId).toBe(imageAttachment2.id);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid navigation changes', () => {
      addAttachment('First');
      const attachment2 = addAttachment('Second');
      addAttachment('Third');

      selectedAttachmentId = attachment2.id;

      // Rapid left-right
      navigateLeft();
      navigateRight();
      navigateLeft();
      navigateRight();

      expect(selectedAttachmentId).toBe(attachment2.id);
    });

    it('should handle navigation after clear', () => {
      const attachment1 = addAttachment('First');
      selectedAttachmentId = attachment1.id;

      // Clear all
      attachmentManager.clear();
      attachments.clear();
      selectedAttachmentId = null;

      // Navigation should do nothing
      navigateLeft();
      expect(selectedAttachmentId).toBeNull();

      navigateRight();
      expect(selectedAttachmentId).toBeNull();
    });

    it('should handle invalid selection ID gracefully', () => {
      addAttachment('First');
      addAttachment('Second');

      selectedAttachmentId = 'invalid-id-does-not-exist';

      // Navigation should still work (findIndex returns -1, then defaults)
      navigateRight();
      expect(selectedAttachmentId).not.toBe('invalid-id-does-not-exist');
    });

    it('should handle removal with invalid selection ID', () => {
      addAttachment('First');
      addAttachment('Second');

      selectedAttachmentId = 'invalid-id';
      const initialSize = attachments.size;

      removeAttachment();

      // Should do nothing (manager returns false)
      expect(attachments.size).toBe(initialSize);
    });

    it('should handle wrapping correctly with two attachments', () => {
      const attachment1 = addAttachment('First');
      const attachment2 = addAttachment('Second');

      selectedAttachmentId = attachment1.id;

      navigateRight(); // → Second
      expect(selectedAttachmentId).toBe(attachment2.id);

      navigateRight(); // → First (wrap)
      expect(selectedAttachmentId).toBe(attachment1.id);

      navigateLeft(); // → Second (wrap back)
      expect(selectedAttachmentId).toBe(attachment2.id);

      navigateLeft(); // → First
      expect(selectedAttachmentId).toBe(attachment1.id);
    });
  });

  describe('Complete Navigation Workflow', () => {
    it('should handle realistic user navigation scenario', () => {
      // User pastes 3 items
      const attachment1 = addAttachment('Code snippet 1');
      const attachment2 = addAttachment('Code snippet 2');
      const attachment3 = addAttachment('Error log');

      // Auto-select first
      selectedAttachmentId = attachment1.id;

      // User navigates right twice to review all
      navigateRight(); // → attachment2
      expect(selectedAttachmentId).toBe(attachment2.id);

      navigateRight(); // → attachment3
      expect(selectedAttachmentId).toBe(attachment3.id);

      // User decides to remove middle one
      navigateLeft(); // → attachment2
      expect(selectedAttachmentId).toBe(attachment2.id);

      removeAttachment();
      expect(attachments.size).toBe(2);

      // User navigates remaining attachments
      selectedAttachmentId = attachment1.id;
      navigateRight(); // → attachment3 (skips deleted)
      expect(selectedAttachmentId).toBe(attachment3.id);

      navigateRight(); // → attachment1 (wrap)
      expect(selectedAttachmentId).toBe(attachment1.id);
    });

    it('should handle cleanup workflow', () => {
      // User has multiple attachments
      const attachment1 = addAttachment('Text 1');
      const attachment2 = addAttachment('Text 2');
      const attachment3 = addAttachment('Text 3');
      const attachment4 = addAttachment('Text 4');

      // Remove all one by one
      selectedAttachmentId = attachment1.id;
      removeAttachment();

      selectedAttachmentId = attachment3.id;
      removeAttachment();

      selectedAttachmentId = attachment2.id;
      removeAttachment();

      selectedAttachmentId = attachment4.id;
      removeAttachment();

      expect(attachments.size).toBe(0);
      expect(selectedAttachmentId).toBeNull();
    });
  });
});
