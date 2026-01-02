/**
 * AttachmentManager
 * Manages text and image attachments for paste handling
 */

import { v4 as uuidv4 } from 'uuid';
import { encode } from 'gpt-tokenizer';
import type { MessageContentPart } from '@codedir/mimir-agents';
import type { Attachment, AttachmentType, PasteMetadata } from '../types/attachment.js';
import { getStaticPricing } from '@/shared/utils/pricing/pricingData.js';

/**
 * Manages attachments with sequential numbering and API expansion
 */
export class AttachmentManager {
  private attachments: Map<string, Attachment> = new Map();
  private counters: Record<AttachmentType, number> = {
    text: 0,
    image: 0,
  };

  /**
   * Add a text attachment
   * @param content Text content to attach
   * @param metadata Paste metadata
   * @returns Created attachment
   */
  addTextAttachment(content: string, _metadata: PasteMetadata): Attachment {
    this.counters.text++;

    const lines = content.split('\n').length;
    const chars = content.length;
    const size = Buffer.byteLength(content, 'utf8');

    const attachment: Attachment = {
      id: uuidv4(),
      type: 'text',
      label: `[#${this.counters.text} - Pasted text]`,
      content,
      metadata: {
        lines,
        chars,
        format: 'plain',
        size,
        source: 'paste',
      },
      createdAt: new Date(),
    };

    this.attachments.set(attachment.id, attachment);
    return attachment;
  }

  /**
   * Add an image attachment
   * @param data Image data buffer
   * @param format Image format (e.g., 'png', 'jpg')
   * @returns Created attachment
   */
  addImageAttachment(data: Buffer, format: string): Attachment {
    this.counters.image++;

    const attachment: Attachment = {
      id: uuidv4(),
      type: 'image',
      label: `[#${this.counters.image} - Image]`,
      content: data,
      metadata: {
        format,
        size: data.length,
        source: 'clipboard',
      },
      createdAt: new Date(),
    };

    this.attachments.set(attachment.id, attachment);
    return attachment;
  }

  /**
   * Remove an attachment by ID
   * @param id Attachment ID
   * @returns True if removed, false if not found
   */
  remove(id: string): boolean {
    return this.attachments.delete(id);
  }

  /**
   * Get all attachments sorted by creation time
   * @returns Array of attachments
   */
  getAll(): Attachment[] {
    return Array.from(this.attachments.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  /**
   * Get attachment by ID
   * @param id Attachment ID
   * @returns Attachment or undefined if not found
   */
  get(id: string): Attachment | undefined {
    return this.attachments.get(id);
  }

  /**
   * Get count of attachments
   * @returns Number of attachments
   */
  count(): number {
    return this.attachments.size;
  }

  /**
   * Clear all attachments
   */
  clear(): void {
    this.attachments.clear();
  }

  /**
   * Reset counters (for testing or after clear)
   */
  resetCounters(): void {
    this.counters.text = 0;
    this.counters.image = 0;
  }

  /**
   * Clear all attachments AND reset counters
   * Use this when user clears input (Ctrl+C/Esc)
   */
  clearAll(): void {
    this.attachments.clear();
    this.counters.text = 0;
    this.counters.image = 0;
  }

  /**
   * Get attachment number from label
   * @param label Attachment label (e.g., "[#1 - Pasted text]")
   * @returns Number string or null
   */
  static getAttachmentNumber(label: string): string | null {
    const match = label.match(/#(\d+)/);
    return match ? match[1]! : null;
  }

  /**
   * Expand attachments for API call
   * Combines message text with referenced attachments into multi-part message format
   * @param messageText Main message text
   * @param referencedNums Optional set of referenced attachment numbers (e.g., {"1", "2"})
   *                       If not provided, all attachments are included
   * @returns Array of message content parts (text + images)
   */
  expandForAPI(messageText: string, referencedNums?: Set<string>): MessageContentPart[] {
    const parts: MessageContentPart[] = [];

    // Add main text if not empty
    if (messageText.trim()) {
      parts.push({
        type: 'text',
        text: messageText.trim(),
      });
    }

    // Add attachments in creation order (only referenced ones if filter provided)
    for (const attachment of this.getAll()) {
      // Check if this attachment is referenced
      if (referencedNums) {
        const attachNum = AttachmentManager.getAttachmentNumber(attachment.label);
        if (!attachNum || !referencedNums.has(attachNum)) {
          continue; // Skip unreferenced attachments
        }
      }

      if (attachment.type === 'text') {
        // Add text attachment with label
        const textContent = typeof attachment.content === 'string' ? attachment.content : '';
        parts.push({
          type: 'text',
          text: `\n\n--- ${attachment.label} ---\n${textContent}`,
        });
      } else if (attachment.type === 'image') {
        // Add image attachment as base64 data URL
        const buffer =
          attachment.content instanceof Buffer
            ? attachment.content
            : Buffer.from(attachment.content as string, 'utf8');

        const format = attachment.metadata.format || 'png';
        const mediaType = `image/${format}`;
        const base64Data = buffer.toString('base64');

        parts.push({
          type: 'image_url',
          image_url: {
            url: `data:${mediaType};base64,${base64Data}`,
          },
        });
      }
    }

    return parts;
  }

  /**
   * Get human-readable size string
   * @param bytes Size in bytes
   * @returns Formatted size string (e.g., "1.5 KB")
   */
  static formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Get attachment statistics
   * @returns Object with counts and sizes
   */
  getStats(): {
    total: number;
    text: number;
    image: number;
    totalSize: number;
  } {
    let textCount = 0;
    let imageCount = 0;
    let totalSize = 0;

    for (const attachment of this.attachments.values()) {
      if (attachment.type === 'text') {
        textCount++;
      } else {
        imageCount++;
      }
      totalSize += attachment.metadata.size;
    }

    return {
      total: this.attachments.size,
      text: textCount,
      image: imageCount,
      totalSize,
    };
  }

  /**
   * Count tokens in text content using GPT tokenizer
   * Note: This is an approximation - actual token count may vary by model
   * @param text Text to count tokens for
   * @returns Token count
   */
  static countTokens(text: string): number {
    try {
      return encode(text).length;
    } catch {
      // Fallback: rough estimate of ~4 chars per token
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Calculate estimated cost for tokens
   * @param tokens Token count
   * @param provider Provider name
   * @param model Model name
   * @returns Estimated cost in USD (input cost only)
   */
  static calculateCost(tokens: number, provider: string, model: string): number {
    const pricing = getStaticPricing(provider, model);
    if (!pricing) {
      return 0;
    }
    // Calculate input cost (attachments are input tokens)
    return (tokens / 1_000_000) * pricing.inputPerMillionTokens;
  }

  /**
   * Format cost as string
   * @param cost Cost in USD
   * @returns Formatted cost string (e.g., "$0.0012")
   */
  static formatCost(cost: number): string {
    if (cost === 0) return '$0';
    if (cost < 0.0001) return '<$0.0001';
    return `$${cost.toFixed(4)}`;
  }
}
