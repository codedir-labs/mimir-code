/**
 * Bracketed Paste Mode utilities
 * Detects and parses bracketed paste sequences in terminals
 *
 * Bracketed paste mode wraps pasted content with escape sequences:
 * - Start: ESC[200~ (\x1b[200~)
 * - End: ESC[201~ (\x1b[201~)
 *
 * This allows detection of paste events vs typed input.
 * Supported by most modern terminals.
 */

import type { BracketedPasteResult } from '@/features/chat/types/attachment.js';

// Escape sequences for bracketed paste mode
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

/**
 * Enable bracketed paste mode in the terminal
 * Causes pasted content to be wrapped with ESC[200~ and ESC[201~
 */
export function enableBracketedPaste(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(ENABLE_BRACKETED_PASTE);
  }
}

/**
 * Disable bracketed paste mode in the terminal
 * Should be called on cleanup to restore normal terminal behavior
 */
export function disableBracketedPaste(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(DISABLE_BRACKETED_PASTE);
  }
}

/**
 * Detect if input contains bracketed paste sequences
 * Parses ESC[200~ ... ESC[201~ wrappers
 *
 * @param input Input string to check
 * @returns Result with isPaste flag and extracted content
 */
export function detectBracketedPaste(input: string): BracketedPasteResult {
  const startIdx = input.indexOf(PASTE_START);
  const endIdx = input.indexOf(PASTE_END);

  // Both markers must be present and in correct order
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    const content = input.substring(startIdx + PASTE_START.length, endIdx);

    return {
      isPaste: true,
      content,
      originalInput: input,
    };
  }

  return {
    isPaste: false,
    content: '',
    originalInput: input,
  };
}

/**
 * Check if terminal supports bracketed paste mode
 * Most modern terminals support this (iTerm2, Windows Terminal, most X11/Wayland terminals)
 *
 * @returns True if likely supported (defaults to true for TTY)
 */
export function supportsBracketedPaste(): boolean {
  // If not a TTY, bracketed paste won't work
  if (!process.stdout.isTTY) {
    return false;
  }

  // Most modern terminals support bracketed paste
  // Could check TERM environment variable for more specific detection
  const term = process.env.TERM || '';

  // Known terminals without support (very rare now)
  const unsupportedTerms = ['dumb', 'unknown'];
  if (unsupportedTerms.includes(term)) {
    return false;
  }

  return true;
}

/**
 * Determine if pasted content should create an attachment
 * Threshold: >500 characters OR >10 lines
 *
 * @param content Content to check
 * @returns True if should create attachment, false if should insert inline
 */
export function shouldCreateAttachment(content: string): boolean {
  const charCount = content.length;
  const lineCount = content.split('\n').length;

  return charCount > 500 || lineCount > 10;
}

/**
 * Detect paste heuristically (fallback when bracketed paste not available)
 * Checks for:
 * - Multiple lines (contains newlines)
 * - Large input delta (>10 characters added at once)
 *
 * @param newValue New input value
 * @param oldValue Previous input value
 * @returns True if likely a paste
 */
export function detectPasteHeuristic(newValue: string, oldValue: string): boolean {
  // Check for newlines (typed input rarely has newlines)
  if (newValue.includes('\n')) {
    return true;
  }

  // Check for large input delta (more than 10 chars added at once)
  const delta = newValue.length - oldValue.length;
  if (delta > 10) {
    return true;
  }

  return false;
}

/**
 * Strip bracketed paste markers from input
 * Useful for cleaning up input that wasn't properly detected
 *
 * @param input Input string
 * @returns Input with paste markers removed
 */
export function stripBracketedPasteMarkers(input: string): string {
  return input.replace(new RegExp(`${PASTE_START}|${PASTE_END}`, 'g'), '');
}

/**
 * Get paste statistics from content
 *
 * @param content Content to analyze
 * @returns Statistics object
 */
export function getPasteStats(content: string): {
  chars: number;
  lines: number;
  words: number;
  size: number;
} {
  const chars = content.length;
  const lines = content.split('\n').length;
  const words = content.split(/\s+/).filter((w) => w.length > 0).length;
  const size = Buffer.byteLength(content, 'utf8');

  return { chars, lines, words, size };
}
