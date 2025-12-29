/**
 * Unit tests for AttachmentManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import type { PasteMetadata } from '@/features/chat/types/attachment.js';

describe('AttachmentManager', () => {
  let manager: AttachmentManager;

  beforeEach(() => {
    manager = new AttachmentManager();
  });

  describe('addTextAttachment', () => {
    it('should add text attachment with sequential numbering', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 100,
      };

      const attachment1 = manager.addTextAttachment('First paste', metadata);
      const attachment2 = manager.addTextAttachment('Second paste', metadata);

      expect(attachment1.label).toBe('[Pasted text #1]');
      expect(attachment2.label).toBe('[Pasted text #2]');
    });

    it('should store text content correctly', () => {
      const content = 'Hello\nWorld';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = manager.addTextAttachment(content, metadata);

      expect(attachment.content).toBe(content);
      expect(attachment.type).toBe('text');
    });

    it('should calculate metadata correctly', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: content.length,
      };

      const attachment = manager.addTextAttachment(content, metadata);

      expect(attachment.metadata.lines).toBe(3);
      expect(attachment.metadata.chars).toBe(content.length);
      expect(attachment.metadata.format).toBe('plain');
      expect(attachment.metadata.source).toBe('paste');
      expect(attachment.metadata.size).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      const attachment1 = manager.addTextAttachment('Test 1', metadata);
      const attachment2 = manager.addTextAttachment('Test 2', metadata);

      expect(attachment1.id).not.toBe(attachment2.id);
      expect(attachment1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should set createdAt timestamp', () => {
      const before = new Date();
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      const attachment = manager.addTextAttachment('Test', metadata);
      const after = new Date();

      expect(attachment.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(attachment.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('addImageAttachment', () => {
    it('should add image attachment with sequential numbering', () => {
      const buffer1 = Buffer.from('fake-png-data-1');
      const buffer2 = Buffer.from('fake-png-data-2');

      const attachment1 = manager.addImageAttachment(buffer1, 'png');
      const attachment2 = manager.addImageAttachment(buffer2, 'png');

      expect(attachment1.label).toBe('[Image #1]');
      expect(attachment2.label).toBe('[Image #2]');
    });

    it('should store image data correctly', () => {
      const buffer = Buffer.from('fake-image-data');
      const attachment = manager.addImageAttachment(buffer, 'png');

      expect(attachment.content).toEqual(buffer);
      expect(attachment.type).toBe('image');
      expect(attachment.metadata.format).toBe('png');
      expect(attachment.metadata.source).toBe('clipboard');
    });

    it('should calculate size correctly', () => {
      const buffer = Buffer.from('fake-image-data');
      const attachment = manager.addImageAttachment(buffer, 'jpg');

      expect(attachment.metadata.size).toBe(buffer.length);
    });

    it('should support different image formats', () => {
      const formats = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

      formats.forEach((format) => {
        manager.resetCounters(); // Reset for consistent numbering
        const attachment = manager.addImageAttachment(Buffer.from('data'), format);
        expect(attachment.metadata.format).toBe(format);
      });
    });
  });

  describe('remove', () => {
    it('should remove attachment by ID', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      const attachment = manager.addTextAttachment('Test', metadata);
      expect(manager.count()).toBe(1);

      const removed = manager.remove(attachment.id);
      expect(removed).toBe(true);
      expect(manager.count()).toBe(0);
    });

    it('should return false for non-existent ID', () => {
      const removed = manager.remove('non-existent-id');
      expect(removed).toBe(false);
    });

    it('should not affect other attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      const attachment1 = manager.addTextAttachment('Test 1', metadata);
      const attachment2 = manager.addTextAttachment('Test 2', metadata);
      const attachment3 = manager.addTextAttachment('Test 3', metadata);

      manager.remove(attachment2.id);

      expect(manager.count()).toBe(2);
      expect(manager.get(attachment1.id)).toBeDefined();
      expect(manager.get(attachment2.id)).toBeUndefined();
      expect(manager.get(attachment3.id)).toBeDefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no attachments', () => {
      expect(manager.getAll()).toEqual([]);
    });

    it('should return all attachments sorted by creation time', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      const attachment1 = manager.addTextAttachment('First', metadata);
      const attachment2 = manager.addTextAttachment('Second', metadata);
      const attachment3 = manager.addTextAttachment('Third', metadata);

      const all = manager.getAll();

      expect(all).toHaveLength(3);
      expect(all[0].id).toBe(attachment1.id);
      expect(all[1].id).toBe(attachment2.id);
      expect(all[2].id).toBe(attachment3.id);
    });

    it('should return mix of text and image attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Text', metadata);
      manager.addImageAttachment(Buffer.from('image'), 'png');
      manager.addTextAttachment('More text', metadata);

      const all = manager.getAll();

      expect(all).toHaveLength(3);
      expect(all[0].type).toBe('text');
      expect(all[1].type).toBe('image');
      expect(all[2].type).toBe('text');
    });
  });

  describe('get', () => {
    it('should retrieve attachment by ID', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      const attachment = manager.addTextAttachment('Test', metadata);
      const retrieved = manager.get(attachment.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(attachment.id);
      expect(retrieved?.content).toBe('Test');
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = manager.get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('count', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.count()).toBe(0);
    });

    it('should return correct count', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Test 1', metadata);
      expect(manager.count()).toBe(1);

      manager.addTextAttachment('Test 2', metadata);
      expect(manager.count()).toBe(2);

      manager.addImageAttachment(Buffer.from('image'), 'png');
      expect(manager.count()).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Test 1', metadata);
      manager.addTextAttachment('Test 2', metadata);
      manager.addImageAttachment(Buffer.from('image'), 'png');

      expect(manager.count()).toBe(3);

      manager.clear();

      expect(manager.count()).toBe(0);
      expect(manager.getAll()).toEqual([]);
    });

    it('should not affect counters', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Test 1', metadata);
      manager.addTextAttachment('Test 2', metadata);
      manager.clear();

      const newAttachment = manager.addTextAttachment('Test 3', metadata);
      // Counter continues from where it left off
      expect(newAttachment.label).toBe('[Pasted text #3]');
    });
  });

  describe('resetCounters', () => {
    it('should reset text and image counters', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Test 1', metadata);
      manager.addImageAttachment(Buffer.from('image'), 'png');
      manager.resetCounters();

      const textAttachment = manager.addTextAttachment('Test 2', metadata);
      const imageAttachment = manager.addImageAttachment(Buffer.from('image2'), 'png');

      expect(textAttachment.label).toBe('[Pasted text #1]');
      expect(imageAttachment.label).toBe('[Image #1]');
    });
  });

  describe('expandForAPI', () => {
    it('should handle empty message and no attachments', () => {
      const result = manager.expandForAPI('');
      expect(result).toEqual([]);
    });

    it('should include message text only', () => {
      const result = manager.expandForAPI('Hello, world!');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'text',
        text: 'Hello, world!',
      });
    });

    it('should expand text attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Pasted content', metadata);
      const result = manager.expandForAPI('Main message');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as { type: 'text'; text: string }).text).toBe('Main message');
      expect(result[1].type).toBe('text');
      expect((result[1] as { type: 'text'; text: string }).text).toContain('[Pasted text #1]');
      expect((result[1] as { type: 'text'; text: string }).text).toContain('Pasted content');
    });

    it('should expand image attachments as base64', () => {
      const imageData = Buffer.from('fake-png-data');
      manager.addImageAttachment(imageData, 'png');

      const result = manager.expandForAPI('Check this image');

      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('image_url');
      expect((result[1] as { type: 'image_url'; image_url: { url: string } }).image_url.url).toBe(
        `data:image/png;base64,${imageData.toString('base64')}`
      );
    });

    it('should handle mixed text and image attachments', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Text paste', metadata);
      manager.addImageAttachment(Buffer.from('image1'), 'png');
      manager.addTextAttachment('More text', metadata);
      manager.addImageAttachment(Buffer.from('image2'), 'jpg');

      const result = manager.expandForAPI('Message');

      expect(result).toHaveLength(5); // 1 message + 4 attachments
      expect(result[0].type).toBe('text'); // Main message
      expect(result[1].type).toBe('text'); // Text paste
      expect(result[2].type).toBe('image_url'); // Image 1
      expect(result[3].type).toBe('text'); // More text
      expect(result[4].type).toBe('image_url'); // Image 2
    });

    it('should preserve attachment order by creation time', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('First', metadata);
      manager.addTextAttachment('Second', metadata);
      manager.addTextAttachment('Third', metadata);

      const result = manager.expandForAPI('');

      expect(result).toHaveLength(3);
      expect((result[0] as { type: 'text'; text: string }).text).toContain('First');
      expect((result[1] as { type: 'text'; text: string }).text).toContain('Second');
      expect((result[2] as { type: 'text'; text: string }).text).toContain('Third');
    });
  });

  describe('formatSize', () => {
    it('should format bytes correctly', () => {
      expect(AttachmentManager.formatSize(0)).toBe('0 B');
      expect(AttachmentManager.formatSize(500)).toBe('500.0 B');
      expect(AttachmentManager.formatSize(1024)).toBe('1.0 KB');
      expect(AttachmentManager.formatSize(1536)).toBe('1.5 KB');
      expect(AttachmentManager.formatSize(1048576)).toBe('1.0 MB');
      expect(AttachmentManager.formatSize(1572864)).toBe('1.5 MB');
    });
  });

  describe('getStats', () => {
    it('should return zeros for empty manager', () => {
      const stats = manager.getStats();

      expect(stats).toEqual({
        total: 0,
        text: 0,
        image: 0,
        totalSize: 0,
      });
    });

    it('should calculate correct statistics', () => {
      const metadata: PasteMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed',
        originalLength: 10,
      };

      manager.addTextAttachment('Short', metadata);
      manager.addTextAttachment('A longer text paste', metadata);
      manager.addImageAttachment(Buffer.from('fake-image-data-1234'), 'png');
      manager.addImageAttachment(Buffer.from('fake'), 'jpg');

      const stats = manager.getStats();

      expect(stats.total).toBe(4);
      expect(stats.text).toBe(2);
      expect(stats.image).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });
});
