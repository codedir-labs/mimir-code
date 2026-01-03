/**
 * Integration tests for text paste workflow
 * Tests the complete flow from paste detection to API submission
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import {
  detectBracketedPaste,
  shouldCreateAttachment,
  detectPasteHeuristic,
} from '@/shared/utils/bracketedPaste.js';
import type { PasteMetadata } from '@/features/chat/types/attachment.js';

describe('Text Paste Workflow', () => {
  let attachmentManager: AttachmentManager;

  beforeEach(() => {
    attachmentManager = new AttachmentManager();
    attachmentManager.resetCounters();
  });

  describe('Bracketed Paste Detection', () => {
    it('should detect bracketed paste with escape sequences', () => {
      const input = '\x1b[200~Hello World\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe('Hello World');
      expect(result.originalInput).toBe(input);
    });

    it('should detect multi-line bracketed paste', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const input = `\x1b[200~${content}\x1b[201~`;
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe(content);
    });

    it('should not detect paste in normal input', () => {
      const input = 'Normal typing';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
      expect(result.content).toBe('');
      expect(result.originalInput).toBe(input);
    });

    it('should handle nested escape sequences', () => {
      const content = 'Text with \x1b[31mcolor\x1b[0m codes';
      const input = `\x1b[200~${content}\x1b[201~`;
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe(content);
    });
  });

  describe('Heuristic Paste Detection', () => {
    it('should detect paste with newlines', () => {
      const previousValue = 'Hello';
      const newValue = 'Hello\nWorld\nFrom\nPaste';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(true);
    });

    it('should detect large paste (>10 chars added)', () => {
      const previousValue = 'Short';
      const newValue = 'Short text with more than ten characters added';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(true);
    });

    it('should not detect normal typing', () => {
      const previousValue = 'Hello';
      const newValue = 'Hello W';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(false);
    });

    it('should not detect backspace', () => {
      const previousValue = 'Hello World';
      const newValue = 'Hello Wor';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(false);
    });
  });

  describe('Threshold Logic', () => {
    // Threshold is now >200 characters only
    it('should create attachment for text >200 chars', () => {
      const text = 'x'.repeat(201);
      expect(shouldCreateAttachment(text)).toBe(true);
    });

    it('should NOT create attachment for text <=200 chars', () => {
      const text = 'x'.repeat(200);
      expect(shouldCreateAttachment(text)).toBe(false);
    });

    it('should create attachment for long single-line content', () => {
      // Many characters in 1 line - should create attachment if over threshold
      const text = 'x'.repeat(1000);
      expect(shouldCreateAttachment(text)).toBe(true);
    });

    it('should NOT create attachment for many short lines under threshold', () => {
      // Many lines but short total length - should NOT create attachment
      const text = Array(50).fill('x').join('\n'); // 50 x's + 49 newlines = 99 chars
      expect(shouldCreateAttachment(text)).toBe(false);
    });

    it('should handle edge case: exactly 200 chars', () => {
      const text = 'x'.repeat(200);
      expect(shouldCreateAttachment(text)).toBe(false);
    });

    it('should handle edge case: exactly 201 chars', () => {
      const text = 'x'.repeat(201);
      expect(shouldCreateAttachment(text)).toBe(true);
    });
  });

  describe('Attachment Creation', () => {
    it('should create text attachment with correct metadata', () => {
      const content = 'Sample pasted text\nWith multiple lines';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.id).toBeTruthy();
      expect(attachment.type).toBe('text');
      expect(attachment.label).toBe('[#1 - Pasted text]');
      expect(attachment.content).toBe(content);
      expect(attachment.metadata.lines).toBe(2);
      expect(attachment.metadata.chars).toBe(content.length);
      expect(attachment.metadata.format).toBe('plain');
      expect(attachment.metadata.source).toBe('paste');
      expect(attachment.createdAt).toBeInstanceOf(Date);
    });

    it('should use sequential numbering for multiple attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment1 = attachmentManager.addTextAttachment('Text 1', metadata);
      const attachment2 = attachmentManager.addTextAttachment('Text 2', metadata);
      const attachment3 = attachmentManager.addTextAttachment('Text 3', metadata);

      expect(attachment1.label).toBe('[#1 - Pasted text]');
      expect(attachment2.label).toBe('[#2 - Pasted text]');
      expect(attachment3.label).toBe('[#3 - Pasted text]');
    });

    it('should generate unique UUIDs for each attachment', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment1 = attachmentManager.addTextAttachment('Text 1', metadata);
      const attachment2 = attachmentManager.addTextAttachment('Text 2', metadata);

      expect(attachment1.id).not.toBe(attachment2.id);
      expect(attachment1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should calculate correct byte size for UTF-8 content', () => {
      const content = 'Hello 世界'; // Contains multi-byte characters
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      // UTF-8: "Hello " = 6 bytes, "世界" = 6 bytes (3 bytes each)
      expect(attachment.metadata.size).toBe(12);
    });
  });

  describe('Attachment Removal', () => {
    it('should remove attachment by ID', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment = attachmentManager.addTextAttachment('Text', metadata);
      expect(attachmentManager.count()).toBe(1);

      const removed = attachmentManager.remove(attachment.id);
      expect(removed).toBe(true);
      expect(attachmentManager.count()).toBe(0);
    });

    it('should return false when removing non-existent attachment', () => {
      const removed = attachmentManager.remove('non-existent-id');
      expect(removed).toBe(false);
    });

    it('should maintain other attachments when removing one', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment1 = attachmentManager.addTextAttachment('Text 1', metadata);
      const attachment2 = attachmentManager.addTextAttachment('Text 2', metadata);
      const attachment3 = attachmentManager.addTextAttachment('Text 3', metadata);

      attachmentManager.remove(attachment2.id);

      const remaining = attachmentManager.getAll();
      expect(remaining).toHaveLength(2);
      expect(remaining.map((a) => a.id)).toEqual([attachment1.id, attachment3.id]);
    });
  });

  describe('Attachment Expansion for API', () => {
    it('should expand single text attachment', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Pasted content', metadata);

      const parts = attachmentManager.expandForAPI('Main message');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({
        type: 'text',
        text: 'Main message',
      });
      expect(parts[1]).toEqual({
        type: 'text',
        text: '\n\n--- [#1 - Pasted text] ---\nPasted content',
      });
    });

    it('should expand multiple text attachments in order', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('First paste', metadata);
      attachmentManager.addTextAttachment('Second paste', metadata);

      const parts = attachmentManager.expandForAPI('Message');

      expect(parts).toHaveLength(3);
      expect(parts[0].type).toBe('text');
      expect(parts[1].type).toBe('text');
      expect(parts[2].type).toBe('text');
    });

    it('should handle empty message text with attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Only attachment', metadata);

      const parts = attachmentManager.expandForAPI('   '); // Whitespace only

      expect(parts).toHaveLength(1); // No main text, only attachment
      expect(parts[0]).toEqual({
        type: 'text',
        text: '\n\n--- [#1 - Pasted text] ---\nOnly attachment',
      });
    });

    it('should return message text only when no attachments', () => {
      const parts = attachmentManager.expandForAPI('Just a message');

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        type: 'text',
        text: 'Just a message',
      });
    });

    it('should preserve attachment order by creation time', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('First', metadata);
      attachmentManager.addTextAttachment('Second', metadata);
      attachmentManager.addTextAttachment('Third', metadata);

      const parts = attachmentManager.expandForAPI('Message');

      // Extract attachment labels from parts
      const labels = parts
        .slice(1) // Skip main message
        .map((part) => {
          if (part.type === 'text') {
            const match = part.text.match(/\[#(\d+) - Pasted text\]/);
            return match ? parseInt(match[1], 10) : 0;
          }
          return 0;
        });

      expect(labels).toEqual([1, 2, 3]);
    });
  });

  describe('Clear Attachments', () => {
    it('should clear all attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Text 1', metadata);
      attachmentManager.addTextAttachment('Text 2', metadata);

      expect(attachmentManager.count()).toBe(2);

      attachmentManager.clear();

      expect(attachmentManager.count()).toBe(0);
      expect(attachmentManager.getAll()).toEqual([]);
    });

    it('should maintain counters after clear', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Text 1', metadata);
      attachmentManager.addTextAttachment('Text 2', metadata);
      attachmentManager.clear();

      const attachment3 = attachmentManager.addTextAttachment('Text 3', metadata);

      // Counter should continue from 3, not reset to 1
      expect(attachment3.label).toBe('[#3 - Pasted text]');
    });
  });

  describe('Attachment Statistics', () => {
    it('should calculate correct statistics', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Short', metadata);
      attachmentManager.addTextAttachment('A much longer piece of text', metadata);

      const stats = attachmentManager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.text).toBe(2);
      expect(stats.image).toBe(0);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should return zero stats for empty manager', () => {
      const stats = attachmentManager.getStats();

      expect(stats.total).toBe(0);
      expect(stats.text).toBe(0);
      expect(stats.image).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('Size Formatting', () => {
    it('should format bytes correctly', () => {
      expect(AttachmentManager.formatSize(0)).toBe('0 B');
      expect(AttachmentManager.formatSize(500)).toBe('500.0 B');
      expect(AttachmentManager.formatSize(1024)).toBe('1.0 KB');
      expect(AttachmentManager.formatSize(1536)).toBe('1.5 KB');
      expect(AttachmentManager.formatSize(1048576)).toBe('1.0 MB');
      expect(AttachmentManager.formatSize(1073741824)).toBe('1.0 GB');
    });
  });

  describe('Complete Workflow', () => {
    it('should handle complete paste-to-submit workflow', () => {
      // 1. User pastes text exceeding 200 char threshold
      const pastedContent = 'x'.repeat(250); // 250 chars exceeds 200 threshold
      const bracketedInput = `\x1b[200~${pastedContent}\x1b[201~`;

      // 2. Detect bracketed paste
      const pasteResult = detectBracketedPaste(bracketedInput);
      expect(pasteResult.isPaste).toBe(true);

      // 3. Check threshold
      const shouldAttach = shouldCreateAttachment(pasteResult.content);
      expect(shouldAttach).toBe(true);

      // 4. Create attachment
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: pasteResult.content.length,
      };
      const attachment = attachmentManager.addTextAttachment(pasteResult.content, metadata);
      expect(attachment.label).toBe('[#1 - Pasted text]');

      // 5. User submits message
      const messageText = 'Please analyze this code:';
      const expandedParts = attachmentManager.expandForAPI(messageText);

      // 6. Verify expansion
      expect(expandedParts).toHaveLength(2);
      expect(expandedParts[0]).toEqual({
        type: 'text',
        text: messageText,
      });
      expect(expandedParts[1]).toEqual({
        type: 'text',
        text: `\n\n--- [#1 - Pasted text] ---\n${pastedContent}`,
      });

      // 7. Clear after submit
      attachmentManager.clear();
      expect(attachmentManager.count()).toBe(0);
    });

    it('should handle small paste inline (no attachment)', () => {
      // 1. User pastes small text
      const pastedContent = 'Small paste';
      const bracketedInput = `\x1b[200~${pastedContent}\x1b[201~`;

      // 2. Detect bracketed paste
      const pasteResult = detectBracketedPaste(bracketedInput);
      expect(pasteResult.isPaste).toBe(true);

      // 3. Check threshold - should NOT create attachment
      const shouldAttach = shouldCreateAttachment(pasteResult.content);
      expect(shouldAttach).toBe(false);

      // 4. Text would be inserted inline (no attachment created)
      expect(attachmentManager.count()).toBe(0);
    });
  });
});
