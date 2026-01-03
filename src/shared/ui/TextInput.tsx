/**
 * Custom text input component for terminal UI
 * Provides full cursor control with Home/End, word navigation, and proper Delete behavior
 *
 * Features:
 * - Arrow key cursor navigation
 * - Home/End to jump to line start/end
 * - Ctrl+Left/Right for word navigation
 * - Proper Delete key (deletes forward, not backward)
 * - Ctrl+Backspace/Delete for word deletion
 * - Ctrl+U to clear line, Ctrl+K to delete to end
 * - Paste text highlighting
 * - Password masking
 * - Placeholder text support
 *
 * Uses centralized RawKeyMapper for accurate key detection across terminals.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Text, useInput, useStdin } from 'ink';
import chalk from 'chalk';
import { getLastRawKey, clearLastRawKey, processRawKey } from '@/shared/keyboard/RawKeyMapper.js';
import { pasteLog, pasteLogContent, pasteLogSeparator, pasteLogClear } from '@/shared/utils/pasteLogger.js';
import { useTextEditingActions, createTextEditingOperations } from '@/shared/keyboard/useTextEditingActions.js';
import { getTheme } from '@/shared/config/themes/index.js';
import { logger } from '@/shared/utils/logger.js';
import type { Theme } from '@/shared/config/schemas.js';
import type { ChalkInstance } from 'chalk';

// ============================================================================
// Helper functions for control character handling
// ============================================================================

/**
 * Replace control characters (0x00-0x1f) with hex representation for logging
 * Uses character code checks instead of regex to avoid ESLint control-regex warnings
 */
function formatControlChars(str: string): string {
  let result = '';
  for (const char of str) {
    const code = char.charCodeAt(0);
    if (code >= 0x00 && code <= 0x1f) {
      result += `<${code.toString(16)}>`;
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Remove paste escape sequences from a string
 * Uses string replacement instead of regex to avoid ESLint control-regex warnings
 */
function removePasteEscapeSequences(str: string): string {
  const ESC = '\x1b';
  const START_MARKER = ESC + '[200~';
  const END_MARKER = ESC + '[201~';
  return str.split(START_MARKER).join('').split(END_MARKER).join('');
}

export interface TextInputProps {
  /** Current value of the input */
  readonly value: string;
  /** Callback when value changes */
  readonly onChange: (value: string) => void;
  /** Callback when Enter is pressed */
  readonly onSubmit?: (value: string) => void;
  /** Callback when a complete paste is received (with full accumulated content) */
  readonly onPaste?: (content: string) => void;
  /** Placeholder text when empty */
  readonly placeholder?: string;
  /** Whether this input is focused and receiving input */
  readonly focus?: boolean;
  /** Whether to show cursor and enable navigation */
  readonly showCursor?: boolean;
  /** Highlight pasted text temporarily */
  readonly highlightPastedText?: boolean;
  /** Mask character for password input */
  readonly mask?: string;
  /** Callback exposing cursor position for external use */
  readonly onCursorChange?: (offset: number) => void;
  /** Theme for styling (used for error colors on invalid refs) */
  readonly theme?: Theme;
  /** Set of valid attachment numbers (for highlighting invalid #[n] refs) */
  readonly validAttachmentNums?: Set<string>;
  /** Request cursor to move to this position (increment to trigger move to same position) */
  readonly requestCursorAt?: { position: number; token: number };
}

// ============================================================================
// Types for paste handling state
// ============================================================================

/** State refs for paste handling - passed to handler functions */
interface PasteStateRefs {
  pasteInProgressRef: React.MutableRefObject<boolean>;
  pasteBufferRef: React.MutableRefObject<string>;
  pasteTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  pasteEndTimeRef: React.MutableRefObject<number>;
  pasteEmittedRef: React.MutableRefObject<boolean>;
  onPasteRef: React.MutableRefObject<((content: string) => void) | undefined>;
  setIsPasting: (isPasting: boolean) => void;
}

/** State refs for useInput paste handling */
interface UseInputPasteRefs {
  useInputPasteBufferRef: React.MutableRefObject<string>;
  useInputPasteTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

/** Result of raw key detection */
interface RawKeyFlags {
  isRawBackspace: boolean;
  isRawDelete: boolean;
  isRawCtrlBackspace: boolean;
  isRawCtrlDelete: boolean;
  isRawHome: boolean;
  isRawEnd: boolean;
  rawKey: string | null;
}

/** Context for rendering the text value with highlighting */
interface RenderContext {
  displayValue: string;
  cursorOffset: number;
  cursorActualWidth: number;
  showCursor: boolean;
  focus: boolean;
  themeColors: { error: ChalkInstance };
  invalidRefRanges: Array<{ start: number; end: number }>;
}

// ============================================================================
// Pure helper functions (no side effects)
// ============================================================================

/**
 * Find the start of the previous word from cursor position
 */
function findWordBoundaryLeft(text: string, cursor: number): number {
  if (cursor <= 0) return 0;

  let pos = cursor - 1;

  // Skip whitespace
  while (pos > 0 && /\s/.test(text[pos]!)) {
    pos--;
  }

  // Skip word characters
  while (pos > 0 && !/\s/.test(text[pos - 1]!)) {
    pos--;
  }

  return pos;
}

/**
 * Find the end of the next word from cursor position
 */
function findWordBoundaryRight(text: string, cursor: number): number {
  if (cursor >= text.length) return text.length;

  let pos = cursor;

  // Skip current word characters
  while (pos < text.length && !/\s/.test(text[pos]!)) {
    pos++;
  }

  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos]!)) {
    pos++;
  }

  return pos;
}

/**
 * Check if a position is inside any of the invalid reference ranges
 */
function isPositionInInvalidRef(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => pos >= range.start && pos < range.end);
}

/**
 * Find all invalid reference positions in the display value
 * Returns ranges for #[x] (deleted) and #[n] where n is not valid
 */
function findInvalidRefRanges(
  displayValue: string,
  validAttachmentNums: Set<string> | undefined
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  // Match #[x] (explicitly invalid)
  const invalidXPattern = /#\[x\]/g;
  let invalidMatch;
  while ((invalidMatch = invalidXPattern.exec(displayValue)) !== null) {
    ranges.push({
      start: invalidMatch.index,
      end: invalidMatch.index + invalidMatch[0].length,
    });
  }

  // Match #[n] and check if n exists in validAttachmentNums
  if (validAttachmentNums) {
    const numRefPattern = /#\[(\d+)\]/g;
    let numMatch;
    while ((numMatch = numRefPattern.exec(displayValue)) !== null) {
      const refNum = numMatch[1];
      if (refNum && !validAttachmentNums.has(refNum)) {
        ranges.push({
          start: numMatch.index,
          end: numMatch.index + numMatch[0].length,
        });
      }
    }
  }

  return ranges;
}

/**
 * Render a single character with appropriate styling
 */
function renderChar(
  char: string,
  index: number,
  ctx: RenderContext
): string {
  const { cursorOffset, cursorActualWidth, themeColors, invalidRefRanges } = ctx;
  const isInCursorHighlight = index >= cursorOffset - cursorActualWidth && index <= cursorOffset;
  const isInvalid = isPositionInInvalidRef(index, invalidRefRanges);

  if (isInCursorHighlight) {
    return chalk.inverse(char);
  }
  if (isInvalid) {
    return themeColors.error(char);
  }
  return char;
}

/**
 * Render value without cursor (just invalid ref highlighting)
 */
function renderValueWithoutCursor(
  displayValue: string,
  themeColors: { error: ChalkInstance },
  invalidRefRanges: Array<{ start: number; end: number }>
): string {
  if (invalidRefRanges.length === 0) {
    return displayValue;
  }

  let result = '';
  let i = 0;
  for (const char of displayValue) {
    result += isPositionInInvalidRef(i, invalidRefRanges) ? themeColors.error(char) : char;
    i++;
  }
  return result;
}

/**
 * Render the value with cursor and invalid reference highlighting
 */
function renderValueWithCursor(ctx: RenderContext): string {
  const { displayValue, cursorOffset, showCursor, focus, themeColors, invalidRefRanges } = ctx;

  if (!showCursor || !focus) {
    return renderValueWithoutCursor(displayValue, themeColors, invalidRefRanges);
  }

  if (displayValue.length === 0) {
    return chalk.inverse(' ');
  }

  let result = '';
  let i = 0;
  for (const char of displayValue) {
    result += renderChar(char, i, ctx);
    i++;
  }

  // Cursor at end of text
  if (cursorOffset === displayValue.length) {
    result += chalk.inverse(' ');
  }
  return result;
}

/**
 * Render placeholder with optional cursor
 */
function renderPlaceholder(placeholder: string, showCursor: boolean, focus: boolean): string {
  if (showCursor && focus) {
    if (placeholder.length > 0) {
      return chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1));
    }
    return chalk.inverse(' ');
  }
  return chalk.grey(placeholder);
}

/**
 * Get raw key detection flags from the RawKeyMapper result
 */
function getRawKeyFlags(): RawKeyFlags {
  const rawResult = getLastRawKey();
  const rawKey = rawResult?.key ?? null;

  return {
    isRawBackspace: rawKey === 'Backspace',
    isRawDelete: rawKey === 'Delete',
    isRawCtrlBackspace: rawKey === 'Ctrl+Backspace',
    isRawCtrlDelete: rawKey === 'Ctrl+Delete',
    isRawHome: rawKey === 'Home',
    isRawEnd: rawKey === 'End',
    rawKey,
  };
}

// ============================================================================
// Paste handling helper functions
// ============================================================================

/**
 * Handle paste start marker detected in stdin data
 */
function handlePasteStart(
  dataStr: string,
  hasEndMarker: boolean,
  refs: PasteStateRefs
): void {
  pasteLogSeparator('PASTE START DETECTED');
  refs.pasteInProgressRef.current = true;
  refs.pasteEmittedRef.current = false;
  refs.pasteBufferRef.current = '';
  refs.setIsPasting(true);

  // Extract content after start marker
  const afterStart = dataStr.split('\x1b[200~')[1] ?? '';
  if (hasEndMarker) {
    const content = afterStart.split('\x1b[201~')[0] ?? '';
    refs.pasteBufferRef.current = content;
    pasteLog('STDIN', 'Single-chunk paste (has both markers)', { contentLen: content.length });
  } else {
    refs.pasteBufferRef.current = removePasteEscapeSequences(afterStart);
    pasteLog('STDIN', 'Multi-chunk paste started', { initialBufferLen: refs.pasteBufferRef.current.length });
  }

  // Set timeout to auto-clear paste state (safety mechanism)
  if (refs.pasteTimeoutRef.current) {
    clearTimeout(refs.pasteTimeoutRef.current);
  }
  refs.pasteTimeoutRef.current = setTimeout(() => {
    pasteLog('STDIN', 'Paste timeout fired (5s)');
    if (refs.pasteInProgressRef.current && refs.pasteBufferRef.current.length > 0 && !refs.pasteEmittedRef.current) {
      refs.pasteEmittedRef.current = true;
      const content = refs.pasteBufferRef.current;
      pasteLog('STDIN', 'Emitting via timeout', { contentLen: content.length });
      if (refs.onPasteRef.current) {
        refs.onPasteRef.current(content);
      }
    }
    refs.pasteInProgressRef.current = false;
    refs.pasteEndTimeRef.current = Date.now();
    refs.pasteBufferRef.current = '';
    refs.pasteTimeoutRef.current = null;
    refs.setIsPasting(false);
  }, 5000);
}

/**
 * Handle paste end marker detected in stdin data
 */
function handlePasteEnd(
  dataStr: string,
  hasStartMarker: boolean,
  refs: PasteStateRefs
): void {
  pasteLogSeparator('PASTE END DETECTED');

  if (!hasStartMarker) {
    const beforeEnd = dataStr.split('\x1b[201~')[0] ?? '';
    refs.pasteBufferRef.current += beforeEnd;
    pasteLog('STDIN', 'Added content before end marker', { addedLen: beforeEnd.length });
  }

  pasteLog('STDIN', 'Final buffer state', {
    bufferLen: refs.pasteBufferRef.current.length,
    alreadyEmitted: refs.pasteEmittedRef.current,
    hasOnPaste: !!refs.onPasteRef.current,
  });
  pasteLogContent('STDIN-BUFFER', refs.pasteBufferRef.current);

  refs.pasteInProgressRef.current = false;
  refs.pasteEndTimeRef.current = Date.now();

  if (refs.pasteTimeoutRef.current) {
    clearTimeout(refs.pasteTimeoutRef.current);
    refs.pasteTimeoutRef.current = null;
  }

  // Emit the complete accumulated paste content (only once)
  if (!refs.pasteEmittedRef.current) {
    refs.pasteEmittedRef.current = true;
    const content = refs.pasteBufferRef.current;
    pasteLog('STDIN', 'Will emit paste content', { contentLen: content.length });
    if (content.length > 0 && refs.onPasteRef.current) {
      const hidePlaceholder = () => {
        pasteLog('STDIN', 'setTimeout: hiding isPasting');
        refs.setIsPasting(false);
      };
      setImmediate(() => {
        pasteLog('STDIN', 'setImmediate: calling onPaste');
        if (refs.onPasteRef.current) {
          refs.onPasteRef.current(content);
        }
        setTimeout(hidePlaceholder, 150);
      });
    } else {
      pasteLog('STDIN', 'No content or no handler, hiding placeholder', {
        contentLen: content.length,
        hasHandler: !!refs.onPasteRef.current,
      });
      setTimeout(() => refs.setIsPasting(false), 150);
    }
  } else {
    pasteLog('STDIN', 'Already emitted, just hiding placeholder');
    setTimeout(() => refs.setIsPasting(false), 150);
  }
  refs.pasteBufferRef.current = '';
}

/**
 * Handle fallback paste detection for terminals without bracketed paste
 */
function handleFallbackPaste(
  dataStr: string,
  rapidInputBuffer: { value: string },
  rapidInputTimer: { value: NodeJS.Timeout | null },
  refs: PasteStateRefs
): boolean {
  const RAPID_INPUT_THRESHOLD = 50;
  const MIN_PASTE_CHARS = 10;

  const looksLikePaste = dataStr.length > 1 || dataStr.includes('\n') || dataStr.includes('\r');

  if (!looksLikePaste) {
    return false;
  }

  pasteLog('FALLBACK', 'Rapid input detected', {
    length: dataStr.length,
    hasNewlines: dataStr.includes('\n') || dataStr.includes('\r'),
    currentBuffer: rapidInputBuffer.value.length,
  });

  rapidInputBuffer.value += dataStr;

  if (rapidInputTimer.value) {
    clearTimeout(rapidInputTimer.value);
  }

  rapidInputTimer.value = setTimeout(() => {
    if (rapidInputBuffer.value.length >= MIN_PASTE_CHARS) {
      pasteLog('FALLBACK', 'Emitting accumulated paste', { length: rapidInputBuffer.value.length });
      pasteLogContent('FALLBACK-CONTENT', rapidInputBuffer.value);

      if (refs.onPasteRef.current) {
        refs.setIsPasting(true);
        const content = rapidInputBuffer.value;
        rapidInputBuffer.value = '';
        setImmediate(() => {
          if (refs.onPasteRef.current) {
            refs.onPasteRef.current(content);
          }
          setTimeout(() => refs.setIsPasting(false), 150);
        });
      } else {
        rapidInputBuffer.value = '';
      }
    } else {
      pasteLog('FALLBACK', 'Buffer too small, clearing', { length: rapidInputBuffer.value.length });
      rapidInputBuffer.value = '';
    }
    rapidInputTimer.value = null;
  }, RAPID_INPUT_THRESHOLD);

  return true;
}

// ============================================================================
// useInput handler helper functions
// ============================================================================

/**
 * Check if input contains paste markers and handle them
 * Returns true if the input was handled as a paste operation
 */
function handleUseInputPaste(
  input: string,
  pasteRefs: PasteStateRefs,
  useInputRefs: UseInputPasteRefs
): boolean {
  const hasStartMarker = input.includes('\x1b[200~');
  const hasEndMarker = input.includes('\x1b[201~');

  // Handle paste start
  if (hasStartMarker) {
    pasteLogSeparator('useInput: PASTE START');
    pasteRefs.pasteInProgressRef.current = true;
    pasteRefs.pasteEmittedRef.current = false;
    pasteRefs.setIsPasting(true);

    const afterStart = input.split('\x1b[200~')[1] ?? '';
    if (hasEndMarker) {
      const content = afterStart.split('\x1b[201~')[0] ?? '';
      pasteLog('useInput', 'Complete paste in one chunk', { contentLen: content.length });
      useInputRefs.useInputPasteBufferRef.current = content;
    } else {
      useInputRefs.useInputPasteBufferRef.current = afterStart;
    }
    clearLastRawKey();
  }

  // Handle paste end
  if (hasEndMarker) {
    pasteLogSeparator('useInput: PASTE END');
    if (!hasStartMarker) {
      const beforeEnd = input.split('\x1b[201~')[0] ?? '';
      useInputRefs.useInputPasteBufferRef.current += beforeEnd;
    }

    pasteRefs.pasteInProgressRef.current = false;
    pasteRefs.pasteEndTimeRef.current = Date.now();

    const content = useInputRefs.useInputPasteBufferRef.current;
    pasteLog('useInput', 'Emitting paste', { contentLen: content.length });
    pasteLogContent('useInput-PASTE', content);

    if (content.length > 0 && pasteRefs.onPasteRef.current && !pasteRefs.pasteEmittedRef.current) {
      pasteRefs.pasteEmittedRef.current = true;
      setImmediate(() => {
        if (pasteRefs.onPasteRef.current) {
          pasteRefs.onPasteRef.current(content);
        }
        setTimeout(() => pasteRefs.setIsPasting(false), 150);
      });
    } else {
      setTimeout(() => pasteRefs.setIsPasting(false), 150);
    }

    useInputRefs.useInputPasteBufferRef.current = '';
    clearLastRawKey();
    return true;
  }

  // Accumulate during paste
  if (pasteRefs.pasteInProgressRef.current) {
    useInputRefs.useInputPasteBufferRef.current += input;
    pasteLog('useInput', 'Accumulating paste', { bufferLen: useInputRefs.useInputPasteBufferRef.current.length });
    clearLastRawKey();
    return true;
  }

  return hasStartMarker;
}

/**
 * Handle heuristic paste detection (rapid multi-char input)
 * Returns true if input was handled as paste
 */
function handleHeuristicPaste(
  input: string,
  pasteRefs: PasteStateRefs,
  useInputRefs: UseInputPasteRefs
): boolean {
  const looksLikePaste = input.length > 1 || input.includes('\n') || input.includes('\r');

  if (!looksLikePaste || pasteRefs.pasteInProgressRef.current) {
    return false;
  }

  pasteLog('useInput', 'Heuristic paste detected', { inputLen: input.length });
  useInputRefs.useInputPasteBufferRef.current += input;

  if (useInputRefs.useInputPasteTimerRef.current) {
    clearTimeout(useInputRefs.useInputPasteTimerRef.current);
  }

  useInputRefs.useInputPasteTimerRef.current = setTimeout(() => {
    const buffer = useInputRefs.useInputPasteBufferRef.current;
    if (buffer.length >= 5) {
      pasteLog('useInput', 'Emitting heuristic paste', { len: buffer.length });
      pasteLogContent('useInput-HEURISTIC', buffer);

      if (pasteRefs.onPasteRef.current) {
        pasteRefs.setIsPasting(true);
        pasteRefs.pasteEmittedRef.current = true;
        const hidePlaceholder = () => pasteRefs.setIsPasting(false);
        setImmediate(() => {
          if (pasteRefs.onPasteRef.current) {
            pasteRefs.onPasteRef.current(buffer);
          }
          setTimeout(hidePlaceholder, 150);
        });
      }
    } else {
      pasteLog('useInput', 'Heuristic buffer too small, ignoring', { len: buffer.length });
    }
    useInputRefs.useInputPasteBufferRef.current = '';
    useInputRefs.useInputPasteTimerRef.current = null;
  }, 100);

  clearLastRawKey();
  return true;
}

/** Result of processing cursor movement in useInput */
interface CursorMoveResult {
  handled: boolean;
  newOffset?: number;
}

/**
 * Check if input represents Ctrl+A (move to start)
 */
function isCtrlAKey(input: string, key: { ctrl: boolean }, rawKey: string | null): boolean {
  return rawKey === 'Ctrl+A' || input === '\x01' || (key.ctrl && input.toLowerCase() === 'a');
}

/**
 * Check if input represents Ctrl+E (move to end)
 */
function isCtrlEKey(input: string, key: { ctrl: boolean }, rawKey: string | null): boolean {
  return rawKey === 'Ctrl+E' || input === '\x05' || (key.ctrl && input.toLowerCase() === 'e');
}

/**
 * Handle emacs-style cursor movement (Ctrl+A/E)
 */
function handleEmacsCursor(input: string, key: { ctrl: boolean }, rawFlags: RawKeyFlags, valueLength: number): CursorMoveResult {
  if (isCtrlAKey(input, key, rawFlags.rawKey)) {
    return { handled: true, newOffset: 0 };
  }
  if (isCtrlEKey(input, key, rawFlags.rawKey)) {
    return { handled: true, newOffset: valueLength };
  }
  return { handled: false };
}

/**
 * Handle Home/End keys
 */
function handleHomeEndKeys(rawFlags: RawKeyFlags, valueLength: number): CursorMoveResult {
  if (rawFlags.isRawHome) {
    return { handled: true, newOffset: 0 };
  }
  if (rawFlags.isRawEnd) {
    return { handled: true, newOffset: valueLength };
  }
  return { handled: false };
}

/**
 * Handle Ctrl+Arrow word navigation
 */
function handleCtrlArrowKeys(rawFlags: RawKeyFlags, value: string, cursorOffset: number): CursorMoveResult {
  if (rawFlags.rawKey === 'Ctrl+ArrowLeft' || rawFlags.rawKey === 'Ctrl+Left') {
    return { handled: true, newOffset: findWordBoundaryLeft(value, cursorOffset) };
  }
  if (rawFlags.rawKey === 'Ctrl+ArrowRight' || rawFlags.rawKey === 'Ctrl+Right') {
    return { handled: true, newOffset: findWordBoundaryRight(value, cursorOffset) };
  }
  return { handled: false };
}

/**
 * Handle arrow key navigation
 */
function handleArrowKeys(
  key: { leftArrow: boolean; rightArrow: boolean; ctrl: boolean; meta: boolean },
  value: string,
  cursorOffset: number,
  showCursor: boolean
): CursorMoveResult {
  if (key.leftArrow) {
    if (key.ctrl) {
      return { handled: true, newOffset: findWordBoundaryLeft(value, cursorOffset) };
    }
    if (showCursor && !key.meta) {
      return { handled: true, newOffset: cursorOffset - 1 };
    }
    return { handled: true };
  }

  if (key.rightArrow) {
    if (key.ctrl) {
      return { handled: true, newOffset: findWordBoundaryRight(value, cursorOffset) };
    }
    if (showCursor && !key.meta) {
      return { handled: true, newOffset: cursorOffset + 1 };
    }
    return { handled: true };
  }

  return { handled: false };
}

/**
 * Handle cursor movement keys (Ctrl+A/E, Home/End, Arrow keys)
 */
function handleCursorMovement(
  input: string,
  key: { leftArrow: boolean; rightArrow: boolean; ctrl: boolean; meta: boolean },
  rawFlags: RawKeyFlags,
  value: string,
  cursorOffset: number,
  showCursor: boolean
): CursorMoveResult {
  // Check emacs-style keys first
  const emacsResult = handleEmacsCursor(input, key, rawFlags, value.length);
  if (emacsResult.handled) return emacsResult;

  // Check Home/End
  const homeEndResult = handleHomeEndKeys(rawFlags, value.length);
  if (homeEndResult.handled) return homeEndResult;

  // Check Ctrl+Arrow
  const ctrlArrowResult = handleCtrlArrowKeys(rawFlags, value, cursorOffset);
  if (ctrlArrowResult.handled) return ctrlArrowResult;

  // Check regular arrows
  return handleArrowKeys(key, value, cursorOffset, showCursor);
}

/** Result of processing deletion in useInput */
interface DeletionResult {
  handled: boolean;
  newValue?: string;
  newCursorOffset?: number;
}

/**
 * Check if input represents Ctrl+W (delete word backward)
 */
function isCtrlWKey(input: string, key: { ctrl: boolean }, rawKey: string | null): boolean {
  return rawKey === 'Ctrl+W' || input === '\x17' || (key.ctrl && input.toLowerCase() === 'w');
}

/**
 * Check if input represents Ctrl+U (delete to line start)
 */
function isCtrlUKey(input: string, key: { ctrl: boolean }, rawKey: string | null): boolean {
  return rawKey === 'Ctrl+U' || input === '\x15' || (key.ctrl && input.toLowerCase() === 'u');
}

/**
 * Check if input represents Ctrl+K (delete to line end)
 */
function isCtrlKKey(input: string, key: { ctrl: boolean }, rawKey: string | null): boolean {
  return rawKey === 'Ctrl+K' || input === '\x0b' || (key.ctrl && input.toLowerCase() === 'k');
}

/**
 * Handle word deletion (Ctrl+Backspace/W and Ctrl+Delete)
 */
function handleWordDeletion(
  input: string,
  key: { ctrl: boolean },
  rawFlags: RawKeyFlags,
  value: string,
  cursorOffset: number
): DeletionResult {
  const isWordBackward = isCtrlWKey(input, key, rawFlags.rawKey) || rawFlags.isRawCtrlBackspace;

  if (isWordBackward) {
    const wordStart = findWordBoundaryLeft(value, cursorOffset);
    return {
      handled: true,
      newValue: value.slice(0, wordStart) + value.slice(cursorOffset),
      newCursorOffset: wordStart,
    };
  }

  if (rawFlags.isRawCtrlDelete) {
    const wordEnd = findWordBoundaryRight(value, cursorOffset);
    return {
      handled: true,
      newValue: value.slice(0, cursorOffset) + value.slice(wordEnd),
      newCursorOffset: cursorOffset,
    };
  }

  return { handled: false };
}

/**
 * Handle line deletion (Ctrl+U and Ctrl+K)
 */
function handleLineDeletion(
  input: string,
  key: { ctrl: boolean },
  rawFlags: RawKeyFlags,
  value: string,
  cursorOffset: number
): DeletionResult {
  if (isCtrlUKey(input, key, rawFlags.rawKey)) {
    return {
      handled: true,
      newValue: value.slice(cursorOffset),
      newCursorOffset: 0,
    };
  }

  if (isCtrlKKey(input, key, rawFlags.rawKey)) {
    return {
      handled: true,
      newValue: value.slice(0, cursorOffset),
      newCursorOffset: cursorOffset,
    };
  }

  return { handled: false };
}

/**
 * Handle single character deletion (Backspace and Delete)
 */
function handleCharDeletion(
  key: { backspace: boolean; delete: boolean },
  rawFlags: RawKeyFlags,
  value: string,
  cursorOffset: number
): DeletionResult {
  const shouldBackspace = (rawFlags.isRawBackspace || (key.backspace && !rawFlags.isRawDelete)) && cursorOffset > 0;
  const shouldDelete = (rawFlags.isRawDelete || (key.delete && !rawFlags.isRawBackspace)) && cursorOffset < value.length;

  if (shouldBackspace) {
    return {
      handled: true,
      newValue: value.slice(0, cursorOffset - 1) + value.slice(cursorOffset),
      newCursorOffset: cursorOffset - 1,
    };
  }

  if (shouldDelete) {
    return {
      handled: true,
      newValue: value.slice(0, cursorOffset) + value.slice(cursorOffset + 1),
      newCursorOffset: cursorOffset,
    };
  }

  return { handled: false };
}

/**
 * Handle deletion keys (Backspace, Delete, Ctrl+W/U/K, etc.)
 */
function handleDeletion(
  input: string,
  key: { backspace: boolean; delete: boolean; ctrl: boolean },
  rawFlags: RawKeyFlags,
  value: string,
  cursorOffset: number
): DeletionResult {
  // Check word deletion first
  const wordResult = handleWordDeletion(input, key, rawFlags, value, cursorOffset);
  if (wordResult.handled) return wordResult;

  // Check line deletion
  const lineResult = handleLineDeletion(input, key, rawFlags, value, cursorOffset);
  if (lineResult.handled) return lineResult;

  // Check character deletion
  return handleCharDeletion(key, rawFlags, value, cursorOffset);
}

/** Result of processing text input */
interface TextInputResult {
  handled: boolean;
  newValue?: string;
  newCursorOffset?: number;
  newCursorWidth?: number;
}

/**
 * Handle regular text input (non-control characters)
 */
function handleTextInput(
  input: string,
  key: { ctrl: boolean; meta: boolean },
  value: string,
  cursorOffset: number
): TextInputResult {
  if (key.ctrl || key.meta || input.length === 0) {
    return { handled: false };
  }

  const firstChar = input.charCodeAt(0);
  const isEscapeSequence = firstChar === 0x1b;
  const isControlChar = firstChar < 0x20 && firstChar !== 0x09;

  if (isEscapeSequence || isControlChar) {
    return { handled: false };
  }

  const newValue = value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
  const newCursorOffset = cursorOffset + input.length;
  const newCursorWidth = input.length > 1 ? input.length : 0;

  return {
    handled: true,
    newValue,
    newCursorOffset,
    newCursorWidth,
  };
}

export function TextInput({
  value: rawValue,
  onChange,
  onSubmit,
  onPaste,
  placeholder: rawPlaceholder,
  focus = true,
  showCursor = true,
  highlightPastedText = false,
  mask,
  onCursorChange,
  theme = 'mimir',
  validAttachmentNums,
  requestCursorAt,
}: TextInputProps): JSX.Element {
  // Defensive: ensure value and placeholder are always strings
  const value = rawValue ?? '';
  const placeholder = rawPlaceholder ?? '';

  // Check if raw mode is supported (for piped/non-TTY environments)
  const { isRawModeSupported, stdin } = useStdin();

  // Cursor state - must be declared before refs that use it
  const [cursorOffset, setCursorOffset] = useState(value.length);
  const [cursorWidth, setCursorWidth] = useState(0);

  // State for rendering - when true, show placeholder to hide garbage during paste
  const [isPasting, setIsPasting] = useState(false);

  // Create all paste state refs
  const pasteInProgressRef = useRef(false);
  const pasteBufferRef = useRef<string>('');
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pasteEndTimeRef = useRef(0);
  const pasteEmittedRef = useRef(false);
  const useInputPasteBufferRef = useRef<string>('');
  const useInputPasteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCursorTokenRef = useRef<number>(-1);

  // Create paste state refs object for helper functions
  const onPasteRef = useRef(onPaste);
  useEffect(() => {
    if (onPaste) {
      onPasteRef.current = (content: string) => {
        pasteLog('TextInput', 'onPaste called', { contentLen: content.length });
        pasteLogContent('TextInput-onPaste', content);
        onPaste(content);
      };
    } else {
      onPasteRef.current = undefined;
    }
  }, [onPaste]);

  const pasteStateRefs: PasteStateRefs = useMemo(() => ({
    pasteInProgressRef,
    pasteBufferRef,
    pasteTimeoutRef,
    pasteEndTimeRef,
    pasteEmittedRef,
    onPasteRef,
    setIsPasting,
  }), []);

  const useInputPasteRefs: UseInputPasteRefs = useMemo(() => ({
    useInputPasteBufferRef,
    useInputPasteTimerRef,
  }), []);

  // Handle pre-mount paste detection
  useEffect(() => {
    pasteLog('TextInput', 'Component mounted', { hasOnPaste: !!onPaste, focus, isRawModeSupported, initialValueLen: value.length });

    if (value.length > 10 && onPaste) {
      pasteLog('TextInput', 'DETECTED PRE-MOUNT PASTE', { valueLen: value.length });
      const content = value;
      setImmediate(() => {
        if (onPasteRef.current) {
          pasteLog('TextInput', 'Emitting pre-mount paste to handler');
          onPasteRef.current(content);
        }
      });
    }

    return () => {
      pasteLog('TextInput', 'Component unmounted');
    };
  }, []);

  // Handle external cursor position requests
  useEffect(() => {
    if (requestCursorAt && requestCursorAt.token !== lastCursorTokenRef.current) {
      lastCursorTokenRef.current = requestCursorAt.token;
      const clampedPos = Math.max(0, Math.min(requestCursorAt.position, value.length));
      setCursorOffset(clampedPos);
      setCursorWidth(0);
    }
  }, [requestCursorAt, value.length]);

  // Set up stdin listener using extracted helper
  useStdinPasteHandler(stdin, focus, pasteStateRefs);

  // Keep cursor within bounds when value changes externally
  useEffect(() => {
    if (!focus || !showCursor) return;
    if (cursorOffset > value.length) {
      setCursorOffset(value.length);
      setCursorWidth(0);
    }
  }, [value, focus, showCursor, cursorOffset]);

  // Notify parent of cursor changes
  useEffect(() => {
    if (onCursorChange) {
      onCursorChange(cursorOffset);
    }
  }, [cursorOffset, onCursorChange]);

  // Update cursor position helper
  const moveCursor = useCallback((newOffset: number) => {
    const clamped = Math.max(0, Math.min(newOffset, value.length));
    setCursorOffset(clamped);
    setCursorWidth(0);
  }, [value.length]);

  // Create text editing operations for KeyboardEventBus integration
  const textEditingOperations = useMemo(
    () => createTextEditingOperations(value, cursorOffset, onChange, moveCursor),
    [value, cursorOffset, onChange, moveCursor]
  );

  // Subscribe to text editing actions from KeyboardEventBus
  useTextEditingActions(textEditingOperations, { enabled: focus });

  // Compute display values
  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const displayValue = mask ? mask.repeat(value.length) : value;
  const themeColors = getTheme(theme).colors;
  const invalidRefRanges = findInvalidRefRanges(displayValue, validAttachmentNums);

  // Render placeholder
  const renderedPlaceholder = placeholder ? renderPlaceholder(placeholder, showCursor, focus) : undefined;

  // Render value with cursor
  const renderedValue = displayValue.length > 0 || (showCursor && focus)
    ? renderValueWithCursor({
        displayValue,
        cursorOffset,
        cursorActualWidth,
        showCursor,
        focus,
        themeColors,
        invalidRefRanges,
      })
    : displayValue;

  // Log useInput registration
  pasteLog('TextInput', 'RENDER - about to call useInput hook', { focus, isRawModeSupported, valueLen: value.length });

  // Handle keyboard input
  useInputHandler({
    value,
    cursorOffset,
    showCursor,
    onChange,
    onSubmit,
    moveCursor,
    setCursorOffset,
    setCursorWidth,
    pasteStateRefs,
    useInputPasteRefs,
    focus,
    isRawModeSupported,
  });

  // Render
  if (isPasting) {
    return <Text dimColor>Pasting...</Text>;
  }

  const showPlaceholderText = placeholder && value.length === 0;
  return <Text>{showPlaceholderText ? renderedPlaceholder : renderedValue}</Text>;
}

// ============================================================================
// Custom hooks extracted from TextInput
// ============================================================================

/**
 * Hook to set up stdin listener for bracketed paste handling
 */
function useStdinPasteHandler(
  stdin: NodeJS.ReadStream | undefined,
  focus: boolean,
  refs: PasteStateRefs
): void {
  useEffect(() => {
    if (!stdin || !focus) return;

    pasteLogClear();
    pasteLog('TextInput', 'stdin handler mounted');

    const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
    const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

    if (process.stdout.isTTY) {
      pasteLog('TextInput', 'Enabling bracketed paste mode');
      process.stdout.write(ENABLE_BRACKETED_PASTE);
    } else {
      pasteLog('TextInput', 'stdout is not TTY, skipping bracketed paste mode');
    }

    // Mutable objects for fallback paste tracking
    const rapidInputBuffer = { value: '' };
    const rapidInputTimer = { value: null as NodeJS.Timeout | null };

    const handleRawData = (data: Buffer | string) => {
      try {
        const dataStr = typeof data === 'string' ? data : data.toString('utf8');
        const hasStartMarker = dataStr.includes('\x1b[200~');
        const hasEndMarker = dataStr.includes('\x1b[201~');

        // Log raw data
        const hexBytes = Buffer.from(dataStr).toString('hex').substring(0, 100);
        const firstChars = formatControlChars(dataStr.substring(0, 50));
        pasteLog('STDIN', 'Raw data received', {
          length: dataStr.length, hasStartMarker, hasEndMarker,
          pasteInProgress: refs.pasteInProgressRef.current, hexBytes, firstChars,
        });

        // Process through RawKeyMapper when not pasting
        if (!refs.pasteInProgressRef.current && !hasStartMarker && !hasEndMarker) {
          processRawKey(data);
        }

        // Handle paste markers
        if (hasStartMarker) {
          handlePasteStart(dataStr, hasEndMarker, refs);
        }

        if (hasEndMarker) {
          handlePasteEnd(dataStr, hasStartMarker, refs);
          return;
        }

        // Accumulate middle chunks
        if (refs.pasteInProgressRef.current && !hasStartMarker && !hasEndMarker) {
          const cleaned = removePasteEscapeSequences(dataStr);
          refs.pasteBufferRef.current += cleaned;
          pasteLog('STDIN', 'Accumulated middle chunk', {
            chunkLen: cleaned.length,
            totalBufferLen: refs.pasteBufferRef.current.length,
          });
          return;
        }

        // Fallback paste detection
        if (!hasStartMarker && !hasEndMarker && !refs.pasteInProgressRef.current) {
          handleFallbackPaste(dataStr, rapidInputBuffer, rapidInputTimer, refs);
        }
      } catch (err) {
        pasteLog('STDIN', 'ERROR in handleRawData', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Log stdin info
    pasteLog('TextInput', 'stdin info', {
      stdinExists: !!stdin,
      isProcessStdin: stdin === process.stdin,
      isTTY: stdin?.isTTY,
      isReadable: stdin?.readable,
    });

    // Register listener
    if (typeof stdin.prependListener === 'function') {
      pasteLog('TextInput', 'Using prependListener');
      stdin.prependListener('data', handleRawData);
    } else {
      pasteLog('TextInput', 'Using stdin.on (fallback)');
      stdin.on('data', handleRawData);
    }

    if (stdin !== process.stdin && process.stdin.readable) {
      pasteLog('TextInput', 'Also listening on process.stdin');
      process.stdin.prependListener('data', handleRawData);
    }

    return () => {
      stdin.off('data', handleRawData);
      if (stdin !== process.stdin) {
        process.stdin.off('data', handleRawData);
      }
      if (refs.pasteTimeoutRef.current) {
        clearTimeout(refs.pasteTimeoutRef.current);
      }
      if (rapidInputTimer.value) {
        clearTimeout(rapidInputTimer.value);
      }
      if (process.stdout.isTTY) {
        pasteLog('TextInput', 'Disabling bracketed paste mode');
        process.stdout.write(DISABLE_BRACKETED_PASTE);
      }
    };
  }, [stdin, focus, refs]);
}

/** Props for useInputHandler hook */
interface UseInputHandlerProps {
  value: string;
  cursorOffset: number;
  showCursor: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  moveCursor: (offset: number) => void;
  setCursorOffset: (offset: number) => void;
  setCursorWidth: (width: number) => void;
  pasteStateRefs: PasteStateRefs;
  useInputPasteRefs: UseInputPasteRefs;
  focus: boolean;
  isRawModeSupported: boolean | undefined;
}

/**
 * Log input entry for debugging
 */
function logInputEntry(inputLen: number): void {
  try {
    pasteLog('useInput', '>>> ENTRY <<<', { inputLen });
  } catch {
    // Logging failures are non-critical
    logger.debug('useInput logging failed');
  }
}

/**
 * Log detailed input info for debugging
 */
function logInputDetails(
  input: string,
  key: { return: boolean; escape: boolean; ctrl: boolean },
  pasteInProgress: boolean
): void {
  const inputHex = Buffer.from(input).toString('hex').substring(0, 60);
  const inputPreview = formatControlChars(input.substring(0, 30));
  pasteLog('useInput', 'Called', {
    inputLen: input.length, inputHex, inputPreview,
    hasReturn: key.return, hasEscape: key.escape, hasCtrl: key.ctrl,
    pasteInProgress,
  });
}

/**
 * Check if input should be blocked during paste cooldown
 */
function shouldBlockForCooldown(pasteEndTime: number): boolean {
  const inPasteCooldown = Date.now() - pasteEndTime < 200;
  if (inPasteCooldown) {
    pasteLog('useInput', 'BLOCKED (cooldown)');
    clearLastRawKey();
    return true;
  }
  return false;
}

/**
 * Check if input contains escape sequences that should be blocked
 */
function shouldBlockEscapeSequence(input: string, keyEscape: boolean): boolean {
  if (input.includes('\x1b') && !keyEscape) {
    pasteLog('useInput', 'BLOCKED (escape sequence)');
    clearLastRawKey();
    return true;
  }
  return false;
}

/**
 * Check if this is a key that should be skipped (handled elsewhere)
 */
function shouldSkipKey(
  key: { upArrow: boolean; downArrow: boolean; tab: boolean; ctrl: boolean },
  input: string
): boolean {
  if (key.upArrow || key.downArrow || key.tab) return true;
  if (key.ctrl && input === '\x03') return true; // Ctrl+C
  return false;
}

/**
 * Apply deletion result to state
 */
function applyDeletionResult(
  result: DeletionResult,
  value: string,
  onChange: (value: string) => void,
  setCursorOffset: (offset: number) => void,
  setCursorWidth: (width: number) => void
): void {
  if (result.newValue !== undefined) {
    onChange(result.newValue);
  }
  if (result.newCursorOffset !== undefined) {
    const maxLen = (result.newValue ?? value).length;
    setCursorOffset(Math.max(0, Math.min(result.newCursorOffset, maxLen)));
  }
  setCursorWidth(0);
}

/**
 * Apply text input result to state
 */
function applyTextInputResult(
  result: TextInputResult,
  cursorOffset: number,
  onChange: (value: string) => void,
  setCursorOffset: (offset: number) => void,
  setCursorWidth: (width: number) => void
): void {
  if (!result.handled || result.newValue === undefined) return;
  onChange(result.newValue);
  setCursorOffset(Math.max(0, Math.min(result.newCursorOffset ?? cursorOffset, result.newValue.length)));
  setCursorWidth(result.newCursorWidth ?? 0);
}

/**
 * Hook to handle keyboard input via Ink's useInput
 */
function useInputHandler(props: UseInputHandlerProps): void {
  const {
    value, cursorOffset, showCursor, onChange, onSubmit, moveCursor,
    setCursorOffset, setCursorWidth, pasteStateRefs, useInputPasteRefs,
    focus, isRawModeSupported,
  } = props;

  useInput(
    (input, key) => {
      // Log entry and details
      logInputEntry(input.length);
      logInputDetails(input, key, pasteStateRefs.pasteInProgressRef.current);

      // Handle paste detection
      if (handleUseInputPaste(input, pasteStateRefs, useInputPasteRefs)) return;
      if (handleHeuristicPaste(input, pasteStateRefs, useInputPasteRefs)) return;

      // Check blocking conditions
      if (shouldBlockForCooldown(pasteStateRefs.pasteEndTimeRef.current)) return;
      if (shouldBlockEscapeSequence(input, key.escape)) return;

      // Get raw key flags
      const rawFlags = getRawKeyFlags();
      clearLastRawKey();

      // Skip keys handled elsewhere
      if (shouldSkipKey(key, input)) return;

      // Submit on Enter
      if (key.return) {
        if (onSubmit) onSubmit(value);
        return;
      }

      // Handle cursor movement
      const cursorResult = handleCursorMovement(input, key, rawFlags, value, cursorOffset, showCursor);
      if (cursorResult.handled) {
        if (cursorResult.newOffset !== undefined) moveCursor(cursorResult.newOffset);
        return;
      }

      // Handle deletion
      const deletionResult = handleDeletion(input, key, rawFlags, value, cursorOffset);
      if (deletionResult.handled) {
        applyDeletionResult(deletionResult, value, onChange, setCursorOffset, setCursorWidth);
        return;
      }

      // Handle text input
      const textResult = handleTextInput(input, key, value, cursorOffset);
      applyTextInputResult(textResult, cursorOffset, onChange, setCursorOffset, setCursorWidth);
    },
    { isActive: focus && isRawModeSupported === true }
  );
}

/**
 * Uncontrolled variant that manages its own state
 */
export interface UncontrolledTextInputProps
  extends Omit<TextInputProps, 'value' | 'onChange'> {
  /** Initial value */
  readonly initialValue?: string;
  /** Optional onChange callback */
  readonly onChange?: (value: string) => void;
}

export function UncontrolledTextInput({
  initialValue = '',
  onChange,
  ...props
}: UncontrolledTextInputProps): JSX.Element {
  const [value, setValue] = useState(initialValue);

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      if (onChange) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  return <TextInput {...props} value={value} onChange={handleChange} />;
}

export default TextInput;
