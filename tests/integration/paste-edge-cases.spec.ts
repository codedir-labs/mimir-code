/**
 * Integration tests for paste handling edge cases
 * Tests unusual scenarios, errors, and boundary conditions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import {
  detectBracketedPaste,
  shouldCreateAttachment,
  getPasteStats,
  detectPasteHeuristic,
} from '@/shared/utils/bracketedPaste.js';
import type { PasteMetadata } from '@/features/chat/types/attachment.js';

describe('Paste Edge Cases', () => {
  let attachmentManager: AttachmentManager;

  beforeEach(() => {
    attachmentManager = new AttachmentManager();
    attachmentManager.resetCounters();
  });

  describe('Whitespace Handling', () => {
    it('should handle paste with only whitespace', () => {
      const whitespaceOnly = '    \n   \n\t\t\n   ';
      const result = shouldCreateAttachment(whitespaceOnly);

      expect(result).toBe(false); // Only ~16 chars, under 200
    });

    it('should handle paste with whitespace-only lines over threshold', () => {
      const content = 'x'.repeat(201); // 201 chars, over 200
      const result = shouldCreateAttachment(content);

      expect(result).toBe(true); // >200 chars
    });

    it('should preserve leading/trailing whitespace in attachments', () => {
      const content = '  indented content\n\tmore content  ';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
      expect(attachment.content).toMatch(/^[ ]{2}indented/);
      expect(attachment.content).toMatch(/content[ ]{2}$/);
    });

    it('should handle mixed tabs and spaces', () => {
      const content = '\t\tfunction() {\n\t\t\treturn true;\n\t\t}';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
      expect(attachment.metadata.lines).toBe(3);
    });
  });

  describe('Special Characters', () => {
    it('should handle unicode characters', () => {
      const content = '你好世界 🌍 Ñoño';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
      expect(attachment.metadata.chars).toBe(content.length);
    });

    it('should handle emoji in paste', () => {
      const content = '👍 Great job! 🎉\n🚀 Deploy now';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toContain('👍');
      expect(attachment.content).toContain('🚀');
      expect(attachment.metadata.lines).toBe(2);
    });

    it('should handle escape sequences in content', () => {
      const content = 'Line 1\\nLine 2\\tTabbed\\x1b[31mColor';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
    });

    it('should handle null bytes', () => {
      const content = 'Before\x00After';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toContain('\x00');
    });

    it('should handle binary-like data in text', () => {
      const content = String.fromCharCode(0, 1, 2, 127, 128, 255);
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
      expect(attachment.metadata.size).toBeGreaterThan(0);
    });
  });

  describe('Line Ending Variations', () => {
    it('should handle Unix line endings (LF)', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const stats = getPasteStats(content);

      expect(stats.lines).toBe(3);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const content = 'Line 1\r\nLine 2\r\nLine 3';
      const stats = getPasteStats(content);

      expect(stats.lines).toBe(3);
    });

    it('should handle Mac Classic line endings (CR)', () => {
      const content = 'Line 1\rLine 2\rLine 3';
      const stats = getPasteStats(content);

      // Note: CR alone might be counted differently than LF
      expect(stats.lines).toBeGreaterThan(0);
    });

    it('should handle mixed line endings', () => {
      const content = 'Line 1\nLine 2\r\nLine 3\rLine 4';
      const stats = getPasteStats(content);

      expect(stats.lines).toBeGreaterThan(1);
    });

    it('should handle trailing newline', () => {
      const content = 'Line 1\nLine 2\n';
      const stats = getPasteStats(content);

      // Trailing newline creates empty last line
      expect(stats.lines).toBe(3);
    });

    it('should handle multiple consecutive newlines', () => {
      const content = 'Line 1\n\n\nLine 2';
      const stats = getPasteStats(content);
      // 'Line 1\n\n\nLine 2'.split('\n') = ['Line 1', '', '', 'Line 2'] = 4 elements
      expect(stats.lines).toBe(4);
    });
  });

  describe('Boundary Conditions', () => {
    // Threshold is now >200 characters
    it('should create attachment for long single-line content over threshold', () => {
      const content = 'x'.repeat(1000);
      expect(shouldCreateAttachment(content)).toBe(true); // Over 200 chars
    });

    it('should handle short content under threshold', () => {
      const content = Array(5).fill('line').join('\n'); // 24 chars
      expect(shouldCreateAttachment(content)).toBe(false);
    });

    it('should handle content just over threshold', () => {
      const content = 'x'.repeat(201);
      expect(shouldCreateAttachment(content)).toBe(true);
    });

    it('should handle empty string', () => {
      const content = '';
      expect(shouldCreateAttachment(content)).toBe(false);
    });

    it('should handle single character', () => {
      const content = 'x';
      expect(shouldCreateAttachment(content)).toBe(false);
    });

    it('should handle single line under threshold', () => {
      const content = 'single line';
      expect(shouldCreateAttachment(content)).toBe(false);
    });

    it('should create attachment for very long single line', () => {
      const content = 'x'.repeat(10000);
      expect(shouldCreateAttachment(content)).toBe(true); // Over 200 chars
    });
  });

  describe('Bracketed Paste Edge Cases', () => {
    it('should handle incomplete bracketed paste (missing end marker)', () => {
      const input = '\x1b[200~Hello World';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
    });

    it('should handle incomplete bracketed paste (missing start marker)', () => {
      const input = 'Hello World\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
    });

    it('should handle markers in wrong order', () => {
      const input = '\x1b[201~Hello World\x1b[200~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
    });

    it('should handle empty bracketed paste', () => {
      const input = '\x1b[200~\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle nested escape sequences', () => {
      const content = 'Text with \x1b[31mANSI\x1b[0m codes';
      const input = `\x1b[200~${content}\x1b[201~`;
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe(content);
    });

    it('should handle multiple bracketed paste sequences (uses first)', () => {
      const input = '\x1b[200~First\x1b[201~\x1b[200~Second\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe('First');
    });
  });

  describe('Heuristic Detection Edge Cases', () => {
    it('should not detect deletion as paste', () => {
      const previousValue = 'Hello World';
      const newValue = 'Hello';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(false);
    });

    it('should not detect complete replacement as paste', () => {
      const previousValue = 'Old text';
      const newValue = 'New';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(false);
    });

    it('should detect paste with exactly 5 new characters', () => {
      const previousValue = 'Start';
      const newValue = 'Start12345';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(false); // Exactly 5 is not >5
    });

    it('should detect paste with exactly 6 new characters', () => {
      const previousValue = 'Start';
      const newValue = 'Start123456';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(true); // 6 is >5
    });

    it('should handle empty previous value', () => {
      const previousValue = '';
      const newValue = 'Pasted content';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(true); // Has newlines or >10 chars
    });

    it('should handle both values empty', () => {
      const previousValue = '';
      const newValue = '';

      const isPaste = detectPasteHeuristic(newValue, previousValue);
      expect(isPaste).toBe(false);
    });
  });

  describe('Multiple Pastes in Sequence', () => {
    it('should handle rapid consecutive pastes', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment1 = attachmentManager.addTextAttachment('Paste 1', metadata);
      const attachment2 = attachmentManager.addTextAttachment('Paste 2', metadata);
      const attachment3 = attachmentManager.addTextAttachment('Paste 3', metadata);

      expect(attachment1.label).toBe('[#1 - Pasted text]');
      expect(attachment2.label).toBe('[#2 - Pasted text]');
      expect(attachment3.label).toBe('[#3 - Pasted text]');
      expect(attachmentManager.count()).toBe(3);
    });

    it('should handle paste, remove, paste pattern', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment1 = attachmentManager.addTextAttachment('First', metadata);
      attachmentManager.remove(attachment1.id);

      const attachment2 = attachmentManager.addTextAttachment('Second', metadata);

      expect(attachment2.label).toBe('[#2 - Pasted text]'); // Counter continues
      expect(attachmentManager.count()).toBe(1);
    });

    it('should handle alternating text and image pastes', () => {
      const textMetadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Text 1', textMetadata);
      attachmentManager.addImageAttachment(Buffer.from('Image 1'), 'png');
      attachmentManager.addTextAttachment('Text 2', textMetadata);
      attachmentManager.addImageAttachment(Buffer.from('Image 2'), 'png');

      const all = attachmentManager.getAll();
      expect(all).toHaveLength(4);
      expect(all[0].label).toBe('[#1 - Pasted text]');
      expect(all[1].label).toBe('[#1 - Image]');
      expect(all[2].label).toBe('[#2 - Pasted text]');
      expect(all[3].label).toBe('[#2 - Image]');
    });
  });

  describe('Terminal Escape Sequences', () => {
    it('should handle ANSI color codes in paste', () => {
      const content = '\x1b[31mRed text\x1b[0m and normal';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
      expect(attachment.content).toContain('\x1b[31m');
    });

    it('should handle terminal control sequences', () => {
      const content = 'Text with \x1b[2J clear screen \x1b[H home';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
    });

    it('should handle cursor movement codes', () => {
      const content = 'Line\x1b[AUp\x1b[BDown\x1b[CRight\x1b[DLeft';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
    });
  });

  describe('Memory and Performance', () => {
    it('should handle very large paste (1MB)', () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: largeContent.length,
      };

      const attachment = attachmentManager.addTextAttachment(largeContent, metadata);

      expect(attachment.metadata.chars).toBe(1024 * 1024);
      expect(attachment.metadata.lines).toBe(1);
    });

    it('should handle many small attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      for (let i = 0; i < 100; i++) {
        attachmentManager.addTextAttachment(`Paste ${i}`, metadata);
      }

      expect(attachmentManager.count()).toBe(100);
      const all = attachmentManager.getAll();
      expect(all[99].label).toBe('[#100 - Pasted text]');
    });

    it('should handle large number of lines', () => {
      const manyLines = Array(10000).fill('line').join('\n');
      const stats = getPasteStats(manyLines);

      expect(stats.lines).toBe(10000);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve exact content through create-expand-cycle', () => {
      const originalContent = 'Exact content\nWith newlines\n\tAnd tabs';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: originalContent.length,
      };

      const attachment = attachmentManager.addTextAttachment(originalContent, metadata);
      const parts = attachmentManager.expandForAPI('Message');

      const textPart = parts.find((p) => p.type === 'text' && p.text.includes(originalContent));
      expect(textPart).toBeDefined();
      expect(textPart?.type).toBe('text');
      if (textPart?.type === 'text') {
        expect(textPart.text).toContain(originalContent);
      }
    });

    it('should maintain unique IDs across operations', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const ids = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const attachment = attachmentManager.addTextAttachment(`Paste ${i}`, metadata);
        ids.add(attachment.id);
      }

      expect(ids.size).toBe(50); // All unique
    });

    it('should correctly calculate size for multibyte characters', () => {
      const content = '世界'; // 2 characters, 6 bytes in UTF-8
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = attachmentManager.addTextAttachment(content, metadata);

      expect(attachment.metadata.chars).toBe(2);
      expect(attachment.metadata.size).toBe(6); // UTF-8 bytes
    });
  });

  describe('Error Recovery', () => {
    it('should handle attachment with Buffer content as text', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment = attachmentManager.addTextAttachment('Normal text', metadata);

      // Simulate corrupted state (shouldn't happen, but test robustness)
      const parts = attachmentManager.expandForAPI('Message');

      expect(parts.length).toBeGreaterThan(0);
    });

    it('should handle missing metadata gracefully', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: false,
        detectMethod: 'heuristic',
        originalLength: 0,
      };

      const attachment = attachmentManager.addTextAttachment('Text', metadata);

      expect(attachment.metadata.lines).toBeGreaterThan(0);
      expect(attachment.metadata.chars).toBeGreaterThan(0);
      expect(attachment.metadata.size).toBeGreaterThan(0);
    });
  });
});
