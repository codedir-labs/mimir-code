/**
 * Attachment types for paste handling
 * Supports text and image attachments with metadata
 */

export type AttachmentType = 'text' | 'image';

export type AttachmentSource = 'paste' | 'clipboard' | 'manual';

export type PasteDetectMethod = 'bracketed' | 'heuristic' | 'manual';

/**
 * Metadata for attachments
 */
export interface AttachmentMetadata {
  /** Number of lines (text only) */
  lines?: number;
  /** Number of characters (text only) */
  chars?: number;
  /** File format (e.g., 'png', 'jpg', 'plain') */
  format?: string;
  /** Size in bytes */
  size: number;
  /** Source of the attachment */
  source: AttachmentSource;
}

/**
 * Attachment data structure
 */
export interface Attachment {
  /** Unique identifier (UUID) */
  id: string;
  /** Type of attachment */
  type: AttachmentType;
  /** Display label (e.g., "[Pasted text #1]" or "[Image #1]") */
  label: string;
  /** Raw content (string for text, Buffer for images) */
  content: string | Buffer;
  /** Metadata about the attachment */
  metadata: AttachmentMetadata;
  /** Timestamp when created */
  createdAt: Date;
}

/**
 * Metadata for paste events
 */
export interface PasteMetadata {
  /** Whether detected via bracketed paste mode */
  isBracketedPaste: boolean;
  /** Detection method used */
  detectMethod: PasteDetectMethod;
  /** Original content length */
  originalLength: number;
}

/**
 * Result of bracketed paste detection
 */
export interface BracketedPasteResult {
  /** Whether paste was detected */
  isPaste: boolean;
  /** Extracted content (empty if not a paste) */
  content: string;
  /** Original input string */
  originalInput: string;
}

/**
 * Clipboard content from platform adapters
 */
export interface ClipboardContent {
  /** Type of content */
  type: 'text' | 'image' | 'unknown';
  /** Content data (string or Buffer) */
  data: string | Buffer;
  /** Format (e.g., 'png', 'jpg', 'plain') */
  format?: string;
}
