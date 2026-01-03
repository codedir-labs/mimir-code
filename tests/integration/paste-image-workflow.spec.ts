/**
 * Integration tests for image paste workflow
 * Tests clipboard image detection and attachment creation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import type { MessageContentPart } from '@codedir/mimir-agents';

describe('Image Paste Workflow', () => {
  let attachmentManager: AttachmentManager;

  beforeEach(() => {
    attachmentManager = new AttachmentManager();
    attachmentManager.resetCounters();
  });

  describe('Image Attachment Creation', () => {
    it('should create image attachment with PNG format', () => {
      const imageData = Buffer.from('fake-png-data');
      const attachment = attachmentManager.addImageAttachment(imageData, 'png');

      expect(attachment.id).toBeTruthy();
      expect(attachment.type).toBe('image');
      expect(attachment.label).toBe('[#1 - Image]');
      expect(attachment.content).toEqual(imageData);
      expect(attachment.metadata.format).toBe('png');
      expect(attachment.metadata.size).toBe(imageData.length);
      expect(attachment.metadata.source).toBe('clipboard');
      expect(attachment.createdAt).toBeInstanceOf(Date);
    });

    it('should create image attachment with JPEG format', () => {
      const imageData = Buffer.from('fake-jpeg-data');
      const attachment = attachmentManager.addImageAttachment(imageData, 'jpg');

      expect(attachment.metadata.format).toBe('jpg');
    });

    it('should use sequential numbering for multiple images', () => {
      const imageData = Buffer.from('fake-image-data');

      const attachment1 = attachmentManager.addImageAttachment(imageData, 'png');
      const attachment2 = attachmentManager.addImageAttachment(imageData, 'jpg');
      const attachment3 = attachmentManager.addImageAttachment(imageData, 'png');

      expect(attachment1.label).toBe('[#1 - Image]');
      expect(attachment2.label).toBe('[#2 - Image]');
      expect(attachment3.label).toBe('[#3 - Image]');
    });

    it('should calculate correct size for image buffer', () => {
      const imageData = Buffer.from('x'.repeat(1024)); // 1 KB
      const attachment = attachmentManager.addImageAttachment(imageData, 'png');

      expect(attachment.metadata.size).toBe(1024);
    });

    it('should handle large image data', () => {
      const largeImageData = Buffer.from('x'.repeat(1024 * 1024)); // 1 MB
      const attachment = attachmentManager.addImageAttachment(largeImageData, 'png');

      expect(attachment.metadata.size).toBe(1024 * 1024);
      expect(AttachmentManager.formatSize(attachment.metadata.size)).toBe('1.0 MB');
    });
  });

  describe('Mixed Text and Image Attachments', () => {
    it('should maintain separate counters for text and images', () => {
      const textMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed' as const,
        originalLength: 100,
      };
      const imageData = Buffer.from('fake-image-data');

      const textAttachment1 = attachmentManager.addTextAttachment('Text 1', textMetadata);
      const imageAttachment1 = attachmentManager.addImageAttachment(imageData, 'png');
      const textAttachment2 = attachmentManager.addTextAttachment('Text 2', textMetadata);
      const imageAttachment2 = attachmentManager.addImageAttachment(imageData, 'jpg');

      expect(textAttachment1.label).toBe('[#1 - Pasted text]');
      expect(imageAttachment1.label).toBe('[#1 - Image]');
      expect(textAttachment2.label).toBe('[#2 - Pasted text]');
      expect(imageAttachment2.label).toBe('[#2 - Image]');
    });

    it('should calculate correct statistics for mixed attachments', () => {
      const textMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed' as const,
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Text content', textMetadata);
      attachmentManager.addImageAttachment(Buffer.from('image-data-1'), 'png');
      attachmentManager.addImageAttachment(Buffer.from('image-data-2'), 'jpg');

      const stats = attachmentManager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.text).toBe(1);
      expect(stats.image).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Image Expansion for API', () => {
    it('should expand single image attachment as base64 data URL', () => {
      const imageData = Buffer.from('fake-png-data');
      attachmentManager.addImageAttachment(imageData, 'png');

      const parts = attachmentManager.expandForAPI('Check this image:');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({
        type: 'text',
        text: 'Check this image:',
      });

      const imagePart = parts[1] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.type).toBe('image_url');
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
      expect(imagePart.image_url.url).toBe(`data:image/png;base64,${imageData.toString('base64')}`);
    });

    it('should expand multiple images with correct MIME types', () => {
      const pngData = Buffer.from('png-data');
      const jpgData = Buffer.from('jpg-data');

      attachmentManager.addImageAttachment(pngData, 'png');
      attachmentManager.addImageAttachment(jpgData, 'jpg');

      const parts = attachmentManager.expandForAPI('Two images:');

      expect(parts).toHaveLength(3);

      const imagePart1 = parts[1] as Extract<MessageContentPart, { type: 'image_url' }>;
      const imagePart2 = parts[2] as Extract<MessageContentPart, { type: 'image_url' }>;

      expect(imagePart1.image_url.url).toMatch(/^data:image\/png;base64,/);
      expect(imagePart2.image_url.url).toMatch(/^data:image\/jpg;base64,/);
    });

    it('should expand mixed text and image attachments in order', () => {
      const textMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed' as const,
        originalLength: 100,
      };

      attachmentManager.addTextAttachment('Code snippet', textMetadata);
      attachmentManager.addImageAttachment(Buffer.from('diagram'), 'png');
      attachmentManager.addTextAttachment('More code', textMetadata);

      const parts = attachmentManager.expandForAPI('Analysis:');

      expect(parts).toHaveLength(4);
      expect(parts[0].type).toBe('text'); // Main message
      expect(parts[1].type).toBe('text'); // First text attachment
      expect(parts[2].type).toBe('image_url'); // Image attachment
      expect(parts[3].type).toBe('text'); // Second text attachment
    });

    it('should handle only images (no main text)', () => {
      const imageData = Buffer.from('image-only');
      attachmentManager.addImageAttachment(imageData, 'png');

      const parts = attachmentManager.expandForAPI('   '); // Whitespace only

      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('image_url');
    });

    it('should correctly encode base64 for binary data', () => {
      // Create binary data with various byte values
      const binaryData = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0xfe]);
      attachmentManager.addImageAttachment(binaryData, 'png');

      const parts = attachmentManager.expandForAPI('Binary test');

      const imagePart = parts[1] as Extract<MessageContentPart, { type: 'image_url' }>;
      const base64Part = imagePart.image_url.url.split(',')[1];

      // Decode and verify
      const decoded = Buffer.from(base64Part, 'base64');
      expect(decoded).toEqual(binaryData);
    });
  });

  describe('Image Removal', () => {
    it('should remove image attachment', () => {
      const imageData = Buffer.from('test-image');
      const attachment = attachmentManager.addImageAttachment(imageData, 'png');

      expect(attachmentManager.count()).toBe(1);

      const removed = attachmentManager.remove(attachment.id);
      expect(removed).toBe(true);
      expect(attachmentManager.count()).toBe(0);
    });

    it('should maintain text attachments when removing image', () => {
      const textMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed' as const,
        originalLength: 100,
      };

      const textAttachment = attachmentManager.addTextAttachment('Text', textMetadata);
      const imageAttachment = attachmentManager.addImageAttachment(Buffer.from('img'), 'png');

      attachmentManager.remove(imageAttachment.id);

      const remaining = attachmentManager.getAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(textAttachment.id);
      expect(remaining[0].type).toBe('text');
    });
  });

  describe('Image Format Handling', () => {
    it('should support PNG format', () => {
      attachmentManager.addImageAttachment(Buffer.from('png'), 'png');
      const parts = attachmentManager.expandForAPI('');

      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
    });

    it('should support JPEG format', () => {
      attachmentManager.addImageAttachment(Buffer.from('jpg'), 'jpg');
      const parts = attachmentManager.expandForAPI('');

      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.image_url.url).toMatch(/^data:image\/jpg;base64,/);
    });

    it('should support JPEG format', () => {
      attachmentManager.addImageAttachment(Buffer.from('jpeg'), 'jpeg');
      const parts = attachmentManager.expandForAPI('');

      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should support GIF format', () => {
      attachmentManager.addImageAttachment(Buffer.from('gif'), 'gif');
      const parts = attachmentManager.expandForAPI('');

      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.image_url.url).toMatch(/^data:image\/gif;base64,/);
    });

    it('should support WebP format', () => {
      attachmentManager.addImageAttachment(Buffer.from('webp'), 'webp');
      const parts = attachmentManager.expandForAPI('');

      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.image_url.url).toMatch(/^data:image\/webp;base64,/);
    });

    it('should default to PNG if format not specified', () => {
      const imageData = Buffer.from('test');
      // Manually create attachment without format
      attachmentManager.addImageAttachment(imageData, '');
      const parts = attachmentManager.expandForAPI('');

      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;
      // Should default to png when format is empty
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('Complete Image Workflow', () => {
    it('should handle complete clipboard-to-submit workflow', () => {
      // 1. Simulated clipboard image data
      const clipboardImageData = Buffer.from('clipboard-screenshot-data');
      const format = 'png';

      // 2. Create image attachment
      const attachment = attachmentManager.addImageAttachment(clipboardImageData, format);
      expect(attachment.label).toBe('[#1 - Image]');
      expect(attachment.type).toBe('image');

      // 3. User adds message text
      const messageText = 'What does this error mean?';

      // 4. Expand for API
      const parts = attachmentManager.expandForAPI(messageText);

      // 5. Verify expansion
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({
        type: 'text',
        text: messageText,
      });

      const imagePart = parts[1] as Extract<MessageContentPart, { type: 'image_url' }>;
      expect(imagePart.type).toBe('image_url');
      expect(imagePart.image_url.url).toBe(
        `data:image/png;base64,${clipboardImageData.toString('base64')}`
      );

      // 6. Clear after submit
      attachmentManager.clear();
      expect(attachmentManager.count()).toBe(0);
    });

    it('should handle multiple images with text', () => {
      const textMetadata = {
        isBracketedPaste: true,
        detectMethod: 'bracketed' as const,
        originalLength: 100,
      };

      // User pastes code
      attachmentManager.addTextAttachment('function example() { ... }', textMetadata);

      // User adds screenshot
      attachmentManager.addImageAttachment(Buffer.from('screenshot-1'), 'png');

      // User adds another screenshot
      attachmentManager.addImageAttachment(Buffer.from('screenshot-2'), 'png');

      // User submits
      const parts = attachmentManager.expandForAPI('Compare these:');

      expect(parts).toHaveLength(4);
      expect(parts[0].type).toBe('text'); // Main message
      expect(parts[1].type).toBe('text'); // Code attachment
      expect(parts[2].type).toBe('image_url'); // First screenshot
      expect(parts[3].type).toBe('image_url'); // Second screenshot

      // Verify order is preserved
      const stats = attachmentManager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.text).toBe(1);
      expect(stats.image).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty image buffer', () => {
      const emptyBuffer = Buffer.from('');
      const attachment = attachmentManager.addImageAttachment(emptyBuffer, 'png');

      expect(attachment.metadata.size).toBe(0);
      expect(AttachmentManager.formatSize(attachment.metadata.size)).toBe('0 B');
    });

    it('should handle very large images', () => {
      const largeImage = Buffer.from('x'.repeat(10 * 1024 * 1024)); // 10 MB
      const attachment = attachmentManager.addImageAttachment(largeImage, 'png');

      expect(attachment.metadata.size).toBe(10 * 1024 * 1024);
      expect(AttachmentManager.formatSize(attachment.metadata.size)).toBe('10.0 MB');
    });

    it('should preserve image data integrity through expansion', () => {
      const originalData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
      attachmentManager.addImageAttachment(originalData, 'png');

      const parts = attachmentManager.expandForAPI('');
      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;

      // Extract base64 and decode
      const base64Data = imagePart.image_url.url.split(',')[1];
      const decoded = Buffer.from(base64Data, 'base64');

      expect(decoded).toEqual(originalData);
    });

    it('should handle image with string content (edge case)', () => {
      // AttachmentManager stores image as Buffer, but test type compatibility
      const imageData = Buffer.from('test-string-as-buffer');
      const _attachment = attachmentManager.addImageAttachment(imageData, 'png');

      const parts = attachmentManager.expandForAPI('');
      const imagePart = parts[0] as Extract<MessageContentPart, { type: 'image_url' }>;

      expect(imagePart.type).toBe('image_url');
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
    });
  });
});
