/**
 * Raw Terminal Key Mapper
 *
 * Handles mapping of raw stdin bytes to normalized key strings.
 * Supports multiple terminal types: Windows Terminal, xterm, VT100, iTerm2, etc.
 *
 * Terminal escape sequences vary significantly between terminals.
 * This module provides a unified interface for key detection.
 *
 * References:
 * - XTerm Control Sequences: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 * - Windows Console: https://learn.microsoft.com/en-us/windows/console/console-virtual-terminal-sequences
 * - Kitty Keyboard Protocol: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 * - VT100 Reference: http://vt100.net
 */

import { logger } from '@/shared/utils/logger.js';

/**
 * Confidence level for key detection
 */
type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Normalized key result from raw input detection
 */
export interface RawKeyResult {
  /** Normalized key string (e.g., "Backspace", "Home", "Ctrl+Delete") */
  key: string | null;
  /** Whether this was detected via raw bytes (vs Ink's useInput) */
  detectedRaw: boolean;
  /** Confidence level: 'high' = exact match, 'medium' = likely match, 'low' = ambiguous */
  confidence: ConfidenceLevel;
  /** Raw bytes that were matched */
  matchedBytes?: number[];
}

/**
 * Terminal escape sequence patterns
 *
 * Format: ESC (0x1B) followed by specific byte sequences
 * CSI = ESC [ (0x1B 0x5B) - Control Sequence Introducer
 * SS3 = ESC O (0x1B 0x4F) - Single Shift 3 (used in Application mode)
 */
interface EscapeSequence {
  /** Byte pattern to match (after ESC byte) */
  pattern: number[];
  /** Normalized key name */
  key: string;
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Optional description */
  description?: string;
}

/**
 * Single byte key mappings (non-escape sequences)
 */
interface SingleByteKey {
  /** Byte value */
  byte: number;
  /** Normalized key name */
  key: string;
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Description */
  description?: string;
}

// =============================================================================
// ESCAPE SEQUENCE DEFINITIONS
// =============================================================================

/**
 * CSI sequences (ESC [)
 * Most common format for special keys in xterm-compatible terminals
 */
const CSI_SEQUENCES: EscapeSequence[] = [
  // Arrow keys (Normal mode)
  { pattern: [0x5b, 0x41], key: 'ArrowUp', confidence: 'high', description: 'CSI A' },
  { pattern: [0x5b, 0x42], key: 'ArrowDown', confidence: 'high', description: 'CSI B' },
  { pattern: [0x5b, 0x43], key: 'ArrowRight', confidence: 'high', description: 'CSI C' },
  { pattern: [0x5b, 0x44], key: 'ArrowLeft', confidence: 'high', description: 'CSI D' },

  // Home/End (xterm style)
  { pattern: [0x5b, 0x48], key: 'Home', confidence: 'high', description: 'CSI H' },
  { pattern: [0x5b, 0x46], key: 'End', confidence: 'high', description: 'CSI F' },

  // Home/End (VT style - CSI n ~)
  { pattern: [0x5b, 0x31, 0x7e], key: 'Home', confidence: 'high', description: 'CSI 1 ~' },
  { pattern: [0x5b, 0x34, 0x7e], key: 'End', confidence: 'high', description: 'CSI 4 ~' },

  // Insert/Delete/PageUp/PageDown (CSI n ~)
  { pattern: [0x5b, 0x32, 0x7e], key: 'Insert', confidence: 'high', description: 'CSI 2 ~' },
  { pattern: [0x5b, 0x33, 0x7e], key: 'Delete', confidence: 'high', description: 'CSI 3 ~' },
  { pattern: [0x5b, 0x35, 0x7e], key: 'PageUp', confidence: 'high', description: 'CSI 5 ~' },
  { pattern: [0x5b, 0x36, 0x7e], key: 'PageDown', confidence: 'high', description: 'CSI 6 ~' },

  // Ctrl+Arrow keys (CSI 1 ; 5 X)
  {
    pattern: [0x5b, 0x31, 0x3b, 0x35, 0x41],
    key: 'Ctrl+ArrowUp',
    confidence: 'high',
    description: 'CSI 1;5 A',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x35, 0x42],
    key: 'Ctrl+ArrowDown',
    confidence: 'high',
    description: 'CSI 1;5 B',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x35, 0x43],
    key: 'Ctrl+ArrowRight',
    confidence: 'high',
    description: 'CSI 1;5 C',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x35, 0x44],
    key: 'Ctrl+ArrowLeft',
    confidence: 'high',
    description: 'CSI 1;5 D',
  },

  // Shift+Arrow keys (CSI 1 ; 2 X)
  {
    pattern: [0x5b, 0x31, 0x3b, 0x32, 0x41],
    key: 'Shift+ArrowUp',
    confidence: 'high',
    description: 'CSI 1;2 A',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x32, 0x42],
    key: 'Shift+ArrowDown',
    confidence: 'high',
    description: 'CSI 1;2 B',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x32, 0x43],
    key: 'Shift+ArrowRight',
    confidence: 'high',
    description: 'CSI 1;2 C',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x32, 0x44],
    key: 'Shift+ArrowLeft',
    confidence: 'high',
    description: 'CSI 1;2 D',
  },

  // Alt+Arrow keys (CSI 1 ; 3 X)
  {
    pattern: [0x5b, 0x31, 0x3b, 0x33, 0x41],
    key: 'Alt+ArrowUp',
    confidence: 'high',
    description: 'CSI 1;3 A',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x33, 0x42],
    key: 'Alt+ArrowDown',
    confidence: 'high',
    description: 'CSI 1;3 B',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x33, 0x43],
    key: 'Alt+ArrowRight',
    confidence: 'high',
    description: 'CSI 1;3 C',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x33, 0x44],
    key: 'Alt+ArrowLeft',
    confidence: 'high',
    description: 'CSI 1;3 D',
  },

  // Ctrl+Shift+Arrow keys (CSI 1 ; 6 X)
  {
    pattern: [0x5b, 0x31, 0x3b, 0x36, 0x41],
    key: 'Ctrl+Shift+ArrowUp',
    confidence: 'high',
    description: 'CSI 1;6 A',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x36, 0x42],
    key: 'Ctrl+Shift+ArrowDown',
    confidence: 'high',
    description: 'CSI 1;6 B',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x36, 0x43],
    key: 'Ctrl+Shift+ArrowRight',
    confidence: 'high',
    description: 'CSI 1;6 C',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x36, 0x44],
    key: 'Ctrl+Shift+ArrowLeft',
    confidence: 'high',
    description: 'CSI 1;6 D',
  },

  // Ctrl+Alt+Arrow keys (CSI 1 ; 7 X)
  {
    pattern: [0x5b, 0x31, 0x3b, 0x37, 0x41],
    key: 'Ctrl+Alt+ArrowUp',
    confidence: 'high',
    description: 'CSI 1;7 A',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x37, 0x42],
    key: 'Ctrl+Alt+ArrowDown',
    confidence: 'high',
    description: 'CSI 1;7 B',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x37, 0x43],
    key: 'Ctrl+Alt+ArrowRight',
    confidence: 'high',
    description: 'CSI 1;7 C',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x37, 0x44],
    key: 'Ctrl+Alt+ArrowLeft',
    confidence: 'high',
    description: 'CSI 1;7 D',
  },

  // Ctrl+Home/End (CSI 1 ; 5 H/F)
  {
    pattern: [0x5b, 0x31, 0x3b, 0x35, 0x48],
    key: 'Ctrl+Home',
    confidence: 'high',
    description: 'CSI 1;5 H',
  },
  {
    pattern: [0x5b, 0x31, 0x3b, 0x35, 0x46],
    key: 'Ctrl+End',
    confidence: 'high',
    description: 'CSI 1;5 F',
  },

  // Ctrl+Delete (CSI 3 ; 5 ~)
  {
    pattern: [0x5b, 0x33, 0x3b, 0x35, 0x7e],
    key: 'Ctrl+Delete',
    confidence: 'high',
    description: 'CSI 3;5 ~',
  },

  // Ctrl+Insert (CSI 2 ; 5 ~)
  {
    pattern: [0x5b, 0x32, 0x3b, 0x35, 0x7e],
    key: 'Ctrl+Insert',
    confidence: 'high',
    description: 'CSI 2;5 ~',
  },

  // Shift+Insert (CSI 2 ; 2 ~) - often paste
  {
    pattern: [0x5b, 0x32, 0x3b, 0x32, 0x7e],
    key: 'Shift+Insert',
    confidence: 'high',
    description: 'CSI 2;2 ~',
  },

  // Shift+Delete (CSI 3 ; 2 ~) - often cut
  {
    pattern: [0x5b, 0x33, 0x3b, 0x32, 0x7e],
    key: 'Shift+Delete',
    confidence: 'high',
    description: 'CSI 3;2 ~',
  },

  // Ctrl+PageUp/PageDown (CSI 5/6 ; 5 ~)
  {
    pattern: [0x5b, 0x35, 0x3b, 0x35, 0x7e],
    key: 'Ctrl+PageUp',
    confidence: 'high',
    description: 'CSI 5;5 ~',
  },
  {
    pattern: [0x5b, 0x36, 0x3b, 0x35, 0x7e],
    key: 'Ctrl+PageDown',
    confidence: 'high',
    description: 'CSI 6;5 ~',
  },

  // Function keys F1-F4 (xterm normal mode - CSI 11-14 ~)
  { pattern: [0x5b, 0x31, 0x31, 0x7e], key: 'F1', confidence: 'medium', description: 'CSI 11 ~' },
  { pattern: [0x5b, 0x31, 0x32, 0x7e], key: 'F2', confidence: 'medium', description: 'CSI 12 ~' },
  { pattern: [0x5b, 0x31, 0x33, 0x7e], key: 'F3', confidence: 'medium', description: 'CSI 13 ~' },
  { pattern: [0x5b, 0x31, 0x34, 0x7e], key: 'F4', confidence: 'medium', description: 'CSI 14 ~' },

  // Function keys F5-F12 (CSI 15-24 ~)
  { pattern: [0x5b, 0x31, 0x35, 0x7e], key: 'F5', confidence: 'high', description: 'CSI 15 ~' },
  { pattern: [0x5b, 0x31, 0x37, 0x7e], key: 'F6', confidence: 'high', description: 'CSI 17 ~' },
  { pattern: [0x5b, 0x31, 0x38, 0x7e], key: 'F7', confidence: 'high', description: 'CSI 18 ~' },
  { pattern: [0x5b, 0x31, 0x39, 0x7e], key: 'F8', confidence: 'high', description: 'CSI 19 ~' },
  { pattern: [0x5b, 0x32, 0x30, 0x7e], key: 'F9', confidence: 'high', description: 'CSI 20 ~' },
  { pattern: [0x5b, 0x32, 0x31, 0x7e], key: 'F10', confidence: 'high', description: 'CSI 21 ~' },
  { pattern: [0x5b, 0x32, 0x33, 0x7e], key: 'F11', confidence: 'high', description: 'CSI 23 ~' },
  { pattern: [0x5b, 0x32, 0x34, 0x7e], key: 'F12', confidence: 'high', description: 'CSI 24 ~' },

  // Bracketed paste mode markers
  {
    pattern: [0x5b, 0x32, 0x30, 0x30, 0x7e],
    key: 'BracketedPasteStart',
    confidence: 'high',
    description: 'CSI 200 ~',
  },
  {
    pattern: [0x5b, 0x32, 0x30, 0x31, 0x7e],
    key: 'BracketedPasteEnd',
    confidence: 'high',
    description: 'CSI 201 ~',
  },
];

/**
 * SS3 sequences (ESC O)
 * Used in Application mode for cursor keys and F1-F4
 */
const SS3_SEQUENCES: EscapeSequence[] = [
  // Arrow keys (Application mode)
  { pattern: [0x4f, 0x41], key: 'ArrowUp', confidence: 'high', description: 'SS3 A' },
  { pattern: [0x4f, 0x42], key: 'ArrowDown', confidence: 'high', description: 'SS3 B' },
  { pattern: [0x4f, 0x43], key: 'ArrowRight', confidence: 'high', description: 'SS3 C' },
  { pattern: [0x4f, 0x44], key: 'ArrowLeft', confidence: 'high', description: 'SS3 D' },

  // Home/End (Application mode)
  { pattern: [0x4f, 0x48], key: 'Home', confidence: 'high', description: 'SS3 H' },
  { pattern: [0x4f, 0x46], key: 'End', confidence: 'high', description: 'SS3 F' },

  // Function keys F1-F4 (SS3 P/Q/R/S)
  { pattern: [0x4f, 0x50], key: 'F1', confidence: 'high', description: 'SS3 P' },
  { pattern: [0x4f, 0x51], key: 'F2', confidence: 'high', description: 'SS3 Q' },
  { pattern: [0x4f, 0x52], key: 'F3', confidence: 'high', description: 'SS3 R' },
  { pattern: [0x4f, 0x53], key: 'F4', confidence: 'high', description: 'SS3 S' },

  // Keypad keys (Application mode)
  { pattern: [0x4f, 0x6a], key: 'Keypad*', confidence: 'medium', description: 'SS3 j' },
  { pattern: [0x4f, 0x6b], key: 'Keypad+', confidence: 'medium', description: 'SS3 k' },
  { pattern: [0x4f, 0x6d], key: 'Keypad-', confidence: 'medium', description: 'SS3 m' },
  { pattern: [0x4f, 0x6e], key: 'Keypad.', confidence: 'medium', description: 'SS3 n' },
  { pattern: [0x4f, 0x6f], key: 'Keypad/', confidence: 'medium', description: 'SS3 o' },
  { pattern: [0x4f, 0x4d], key: 'KeypadEnter', confidence: 'medium', description: 'SS3 M' },
];

/**
 * All escape sequences combined
 */
const ALL_ESCAPE_SEQUENCES: EscapeSequence[] = [...CSI_SEQUENCES, ...SS3_SEQUENCES];

/**
 * Single byte key mappings
 * These are keys that send a single byte without escape sequence
 */
const SINGLE_BYTE_KEYS: SingleByteKey[] = [
  // Backspace variations
  { byte: 0x7f, key: 'Backspace', confidence: 'high', description: 'DEL (127) - most terminals' },
  {
    byte: 0x08,
    key: 'Ctrl+Backspace',
    confidence: 'high',
    description: 'BS (8) - Ctrl+Backspace on Windows Terminal',
  },

  // Enter/Return
  { byte: 0x0d, key: 'Enter', confidence: 'high', description: 'CR (13)' },
  { byte: 0x0a, key: 'Enter', confidence: 'medium', description: 'LF (10) - some Unix terminals' },

  // Tab
  { byte: 0x09, key: 'Tab', confidence: 'high', description: 'HT (9)' },

  // Escape
  {
    byte: 0x1b,
    key: 'Escape',
    confidence: 'low',
    description: 'ESC (27) - also starts escape sequences',
  },

  // Ctrl+letter combinations (C0 control characters)
  { byte: 0x00, key: 'Ctrl+Space', confidence: 'high', description: 'NUL' },
  { byte: 0x01, key: 'Ctrl+A', confidence: 'high', description: 'SOH' },
  { byte: 0x02, key: 'Ctrl+B', confidence: 'high', description: 'STX' },
  { byte: 0x03, key: 'Ctrl+C', confidence: 'high', description: 'ETX - interrupt' },
  { byte: 0x04, key: 'Ctrl+D', confidence: 'high', description: 'EOT - EOF' },
  { byte: 0x05, key: 'Ctrl+E', confidence: 'high', description: 'ENQ' },
  { byte: 0x06, key: 'Ctrl+F', confidence: 'high', description: 'ACK' },
  { byte: 0x07, key: 'Ctrl+G', confidence: 'high', description: 'BEL' },
  // 0x08 = Ctrl+H = Backspace on some terminals, but we use it for Ctrl+Backspace
  // 0x09 = Tab
  // 0x0a = Ctrl+J = newline
  { byte: 0x0b, key: 'Ctrl+K', confidence: 'high', description: 'VT' },
  { byte: 0x0c, key: 'Ctrl+L', confidence: 'high', description: 'FF - clear screen' },
  // 0x0d = Enter
  { byte: 0x0e, key: 'Ctrl+N', confidence: 'high', description: 'SO' },
  { byte: 0x0f, key: 'Ctrl+O', confidence: 'high', description: 'SI' },
  { byte: 0x10, key: 'Ctrl+P', confidence: 'high', description: 'DLE' },
  { byte: 0x11, key: 'Ctrl+Q', confidence: 'high', description: 'DC1 - XON' },
  { byte: 0x12, key: 'Ctrl+R', confidence: 'high', description: 'DC2' },
  { byte: 0x13, key: 'Ctrl+S', confidence: 'high', description: 'DC3 - XOFF' },
  { byte: 0x14, key: 'Ctrl+T', confidence: 'high', description: 'DC4' },
  { byte: 0x15, key: 'Ctrl+U', confidence: 'high', description: 'NAK - kill line' },
  { byte: 0x16, key: 'Ctrl+V', confidence: 'high', description: 'SYN - literal next' },
  { byte: 0x17, key: 'Ctrl+W', confidence: 'high', description: 'ETB - delete word' },
  { byte: 0x18, key: 'Ctrl+X', confidence: 'high', description: 'CAN' },
  { byte: 0x19, key: 'Ctrl+Y', confidence: 'high', description: 'EM - yank' },
  { byte: 0x1a, key: 'Ctrl+Z', confidence: 'high', description: 'SUB - suspend' },
  // 0x1b = Escape
  { byte: 0x1c, key: 'Ctrl+\\', confidence: 'high', description: 'FS - quit' },
  { byte: 0x1d, key: 'Ctrl+]', confidence: 'high', description: 'GS' },
  { byte: 0x1e, key: 'Ctrl+^', confidence: 'high', description: 'RS' },
  {
    byte: 0x1f,
    key: 'Ctrl+_',
    confidence: 'high',
    description: 'US - also Ctrl+Backspace on some terminals',
  },
];

/**
 * Create a lookup map for single byte keys
 */
const SINGLE_BYTE_MAP = new Map<number, SingleByteKey>();
for (const key of SINGLE_BYTE_KEYS) {
  SINGLE_BYTE_MAP.set(key.byte, key);
}

/**
 * Raw Key Mapper class
 * Converts raw stdin bytes to normalized key strings
 */
export class RawKeyMapper {
  private lastResult: RawKeyResult | null = null;
  private lastTimestamp: number = 0;
  private static readonly RESULT_VALIDITY_MS = 100; // Results valid for 100ms

  /**
   * Process raw stdin data and return normalized key
   * @param data - Raw data from stdin (Buffer or string)
   * @returns Normalized key result
   */
  processRawInput(data: Buffer | string): RawKeyResult {
    // Convert to numeric byte array
    const bytes: number[] =
      typeof data === 'string' ? data.split('').map((c) => c.charCodeAt(0)) : Array.from(data);

    const result = this.classifyInput(bytes, data);

    // Store result with timestamp
    this.lastResult = result;
    this.lastTimestamp = Date.now();

    logger.debug('[RawKeyMapper] Processed input', {
      bytes: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
      result: result.key,
      confidence: result.confidence,
    });

    return result;
  }

  /**
   * Classify input bytes and return appropriate key result
   */
  private classifyInput(bytes: number[], data: Buffer | string): RawKeyResult {
    if (bytes.length === 0) {
      return { key: null, detectedRaw: false, confidence: 'low' };
    }

    if (bytes.length === 1) {
      return this.processSingleByte(bytes);
    }

    if (bytes[0] === 0x1b) {
      return this.matchEscapeSequence(bytes);
    }

    return this.processMultiByteNonEscape(bytes, data);
  }

  /**
   * Process single byte input
   */
  private processSingleByte(bytes: number[]): RawKeyResult {
    const firstByte = bytes[0];
    if (firstByte === undefined) {
      return { key: null, detectedRaw: false, confidence: 'low', matchedBytes: bytes };
    }

    const singleKey = SINGLE_BYTE_MAP.get(firstByte);
    if (singleKey) {
      return {
        key: singleKey.key,
        detectedRaw: true,
        confidence: singleKey.confidence,
        matchedBytes: bytes,
      };
    }

    // Printable ASCII character
    if (firstByte >= 0x20 && firstByte < 0x7f) {
      return {
        key: String.fromCharCode(firstByte),
        detectedRaw: true,
        confidence: 'high',
        matchedBytes: bytes,
      };
    }

    return { key: null, detectedRaw: false, confidence: 'low', matchedBytes: bytes };
  }

  /**
   * Process multi-byte non-escape input (likely pasted text or UTF-8)
   */
  private processMultiByteNonEscape(bytes: number[], data: Buffer | string): RawKeyResult {
    try {
      const text = typeof data === 'string' ? data : Buffer.from(bytes).toString('utf-8');
      return {
        key: text,
        detectedRaw: true,
        confidence: 'medium',
        matchedBytes: bytes,
      };
    } catch (error) {
      logger.debug('[RawKeyMapper] Failed to decode UTF-8', {
        error: error instanceof Error ? error.message : String(error),
        bytes: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
      });
      return { key: null, detectedRaw: false, confidence: 'low', matchedBytes: bytes };
    }
  }

  /**
   * Get the last detected key if still valid
   * @returns Last result or null if expired
   */
  getLastResult(): RawKeyResult | null {
    if (!this.lastResult) return null;

    const elapsed = Date.now() - this.lastTimestamp;
    if (elapsed > RawKeyMapper.RESULT_VALIDITY_MS) {
      this.lastResult = null;
      return null;
    }

    return this.lastResult;
  }

  /**
   * Clear the last result
   */
  clearLastResult(): void {
    this.lastResult = null;
  }

  /**
   * Match an escape sequence against known patterns
   */
  private matchEscapeSequence(bytes: number[]): RawKeyResult {
    // Try to match against all known sequences
    // Start from index 1 (skip ESC byte)
    const sequenceBytes = bytes.slice(1);

    for (const seq of ALL_ESCAPE_SEQUENCES) {
      if (this.bytesMatch(sequenceBytes, seq.pattern)) {
        return {
          key: seq.key,
          detectedRaw: true,
          confidence: seq.confidence,
          matchedBytes: bytes,
        };
      }
    }

    // Check for Alt+letter (ESC followed by letter)
    const secondByte = bytes[1];
    if (bytes.length === 2 && secondByte !== undefined && secondByte >= 0x20 && secondByte < 0x7f) {
      const char = String.fromCharCode(secondByte);
      return {
        key: `Alt+${char.toUpperCase()}`,
        detectedRaw: true,
        confidence: 'high',
        matchedBytes: bytes,
      };
    }

    // Check for Alt+Backspace (ESC followed by DEL 0x7F or BS 0x08)
    if (
      bytes.length === 2 &&
      secondByte !== undefined &&
      (secondByte === 0x7f || secondByte === 0x08)
    ) {
      return {
        key: 'Alt+Backspace',
        detectedRaw: true,
        confidence: 'high',
        matchedBytes: bytes,
      };
    }

    // Unknown escape sequence - return as raw escape
    // This could be a standalone Escape key or incomplete sequence
    if (bytes.length === 1) {
      return {
        key: 'Escape',
        detectedRaw: true,
        confidence: 'low', // Low confidence - could be start of sequence
        matchedBytes: bytes,
      };
    }

    // Unknown multi-byte escape sequence
    logger.debug('[RawKeyMapper] Unknown escape sequence', {
      bytes: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
    });

    return {
      key: null,
      detectedRaw: false,
      confidence: 'low',
      matchedBytes: bytes,
    };
  }

  /**
   * Check if byte arrays match
   */
  private bytesMatch(actual: number[], expected: number[]): boolean {
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }
}

/**
 * Singleton instance for global use
 */
let globalMapper: RawKeyMapper | null = null;

/**
 * Get the global RawKeyMapper instance
 */
export function getRawKeyMapper(): RawKeyMapper {
  if (!globalMapper) {
    globalMapper = new RawKeyMapper();
  }
  return globalMapper;
}

/**
 * Process raw input using global mapper
 * Convenience function for use in stdin listeners
 */
export function processRawKey(data: Buffer | string): RawKeyResult {
  return getRawKeyMapper().processRawInput(data);
}

/**
 * Get last detected key from global mapper
 */
export function getLastRawKey(): RawKeyResult | null {
  return getRawKeyMapper().getLastResult();
}

/**
 * Clear last result from global mapper
 */
export function clearLastRawKey(): void {
  getRawKeyMapper().clearLastResult();
}
