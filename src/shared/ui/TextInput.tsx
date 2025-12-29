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

import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, useInput, useStdin } from 'ink';
import chalk from 'chalk';
import { getLastRawKey, clearLastRawKey, processRawKey } from '@/shared/keyboard/RawKeyMapper.js';

export interface TextInputProps {
  /** Current value of the input */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when Enter is pressed */
  onSubmit?: (value: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether this input is focused and receiving input */
  focus?: boolean;
  /** Whether to show cursor and enable navigation */
  showCursor?: boolean;
  /** Highlight pasted text temporarily */
  highlightPastedText?: boolean;
  /** Mask character for password input */
  mask?: string;
  /** Callback exposing cursor position for external use */
  onCursorChange?: (offset: number) => void;
}

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

export function TextInput({
  value: rawValue,
  onChange,
  onSubmit,
  placeholder: rawPlaceholder,
  focus = true,
  showCursor = true,
  highlightPastedText = false,
  mask,
  onCursorChange,
}: TextInputProps): JSX.Element {
  // Defensive: ensure value and placeholder are always strings
  const value = rawValue ?? '';
  const placeholder = rawPlaceholder ?? '';

  // Check if raw mode is supported (for piped/non-TTY environments)
  const { isRawModeSupported, stdin } = useStdin();

  // Track bracketed paste state - use ref for synchronous access during useInput
  // React state updates are async and won't take effect before useInput runs
  const pasteInProgressRef = useRef(false);

  // Set up raw stdin listener to feed the centralized RawKeyMapper
  // Also tracks bracketed paste start/end
  useEffect(() => {
    if (!stdin || !focus) return;

    const handleRawData = (data: Buffer | string) => {
      // Process raw input through centralized RawKeyMapper
      const result = processRawKey(data);

      // Track bracketed paste state synchronously via ref
      if (result.key === 'BracketedPasteStart') {
        pasteInProgressRef.current = true;
      } else if (result.key === 'BracketedPasteEnd') {
        pasteInProgressRef.current = false;
      }
    };

    stdin.on('data', handleRawData);
    return () => {
      stdin.off('data', handleRawData);
    };
  }, [stdin, focus]);

  const [cursorOffset, setCursorOffset] = useState(value.length);
  const [cursorWidth, setCursorWidth] = useState(0);

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

  // Render the value with cursor highlighting
  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const displayValue = mask ? mask.repeat(value.length) : value;

  let renderedValue: string;
  let renderedPlaceholder: string | undefined;

  if (placeholder) {
    renderedPlaceholder = chalk.grey(placeholder);
  }

  if (showCursor && focus) {
    // Cursor in placeholder
    if (placeholder.length > 0) {
      renderedPlaceholder =
        chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1));
    } else {
      renderedPlaceholder = chalk.inverse(' ');
    }

    // Cursor in value
    if (displayValue.length > 0) {
      renderedValue = '';
      let i = 0;

      for (const char of displayValue) {
        const isInHighlight =
          i >= cursorOffset - cursorActualWidth && i <= cursorOffset;
        renderedValue += isInHighlight ? chalk.inverse(char) : char;
        i++;
      }

      // Cursor at end of text
      if (cursorOffset === displayValue.length) {
        renderedValue += chalk.inverse(' ');
      }
    } else {
      renderedValue = chalk.inverse(' ');
    }
  } else {
    renderedValue = displayValue;
  }

  useInput(
    (input, key) => {
      // === RAW KEY DETECTION (must be first!) ===
      // Get the last raw key result from centralized RawKeyMapper
      // This provides accurate key detection across different terminals
      const rawResult = getLastRawKey();
      const rawKey = rawResult?.key ?? null;

      // Map raw key results to boolean flags for easier checking
      const isRawBackspace = rawKey === 'Backspace';
      const isRawDelete = rawKey === 'Delete';
      const isRawCtrlBackspace = rawKey === 'Ctrl+Backspace';
      const isRawCtrlDelete = rawKey === 'Ctrl+Delete';
      const isRawHome = rawKey === 'Home';
      const isRawEnd = rawKey === 'End';

      // Clear the raw result after reading
      clearLastRawKey();

      // === MANUAL KEY DETECTION ===
      // Ctrl+A/E detection - check for both control chars AND literal letters with ctrl
      // Also check raw detection
      const isCtrlA = rawKey === 'Ctrl+A' || input === '\x01' || (key.ctrl && input.toLowerCase() === 'a');
      const isCtrlE = rawKey === 'Ctrl+E' || input === '\x05' || (key.ctrl && input.toLowerCase() === 'e');

      // Ctrl+W detection (delete word backward)
      const isCtrlW = rawKey === 'Ctrl+W' || input === '\x17' || (key.ctrl && input.toLowerCase() === 'w');

      // Ctrl+U detection (delete to line start)
      const isCtrlU = rawKey === 'Ctrl+U' || input === '\x15' || (key.ctrl && input.toLowerCase() === 'u');

      // Ctrl+K detection (delete to line end)
      const isCtrlK = rawKey === 'Ctrl+K' || input === '\x0b' || (key.ctrl && input.toLowerCase() === 'k');

      // Skip keys handled elsewhere (navigation, interrupt)
      if (key.upArrow || key.downArrow) {
        return;
      }
      if (key.ctrl && input === '\x03') {
        return; // Ctrl+C
      }
      if (key.tab) {
        return;
      }

      // Check if input contains bracketed paste markers
      const hasPasteMarkers = input.includes('\x1b[200~') || input.includes('\x1b[201~');
      const inPaste = pasteInProgressRef.current || hasPasteMarkers;

      // Submit on Enter - but NOT during paste (newlines are part of pasted content)
      if (key.return && !inPaste) {
        if (onSubmit) {
          onSubmit(value);
        }
        return;
      }

      // During paste with markers, pass the full text to onChange for InputBox to handle
      // InputBox.handleChange will detect the markers and create an attachment
      if (hasPasteMarkers && input.length > 0) {
        onChange(input);
        return;
      }

      // If paste is in progress (between start/end markers) but no markers in this chunk,
      // skip processing to avoid interpreting newlines as Enter
      if (pasteInProgressRef.current) {
        return;
      }

      let nextCursorOffset = cursorOffset;
      let nextValue = value;
      let nextCursorWidth = 0;

      // === CURSOR MOVEMENT ===

      // Ctrl+A - move to start (emacs style)
      if (isCtrlA) {
        moveCursor(0);
        return;
      }

      // Ctrl+E - move to end (emacs style)
      if (isCtrlE) {
        moveCursor(value.length);
        return;
      }

      // Home - move to start of line (raw detection for Windows Terminal)
      if (isRawHome) {
        moveCursor(0);
        return;
      }

      // End - move to end of line (raw detection for Windows Terminal)
      if (isRawEnd) {
        moveCursor(value.length);
        return;
      }

      // Ctrl+Left - word navigation (raw detection)
      if (rawKey === 'Ctrl+ArrowLeft' || rawKey === 'Ctrl+Left') {
        moveCursor(findWordBoundaryLeft(value, cursorOffset));
        return;
      }

      // Ctrl+Right - word navigation (raw detection)
      if (rawKey === 'Ctrl+ArrowRight' || rawKey === 'Ctrl+Right') {
        moveCursor(findWordBoundaryRight(value, cursorOffset));
        return;
      }

      // NOTE: Alt+Arrow is reserved for attachment navigation (handled by KeyboardEventBus)
      // Word navigation uses Ctrl+Arrow instead

      // Left arrow
      if (key.leftArrow) {
        if (key.ctrl) {
          // Word left (Ctrl+Left) - fallback for Ink detection
          moveCursor(findWordBoundaryLeft(value, cursorOffset));
        } else if (showCursor && !key.meta) {
          // Character left (skip if Alt/Meta is pressed - reserved for attachment navigation)
          moveCursor(cursorOffset - 1);
        }
        return;
      }

      // Right arrow
      if (key.rightArrow) {
        if (key.ctrl) {
          // Word right (Ctrl+Right) - fallback for Ink detection
          moveCursor(findWordBoundaryRight(value, cursorOffset));
        } else if (showCursor && !key.meta) {
          // Character right (skip if Alt/Meta is pressed - reserved for attachment navigation)
          moveCursor(cursorOffset + 1);
        }
        return;
      }

      // === DELETION ===

      // Ctrl+Backspace or Ctrl+W - delete word backward
      if (isCtrlW || isRawCtrlBackspace) {
        const wordStart = findWordBoundaryLeft(value, cursorOffset);
        nextValue =
          value.slice(0, wordStart) +
          value.slice(cursorOffset);
        nextCursorOffset = wordStart;
      }
      // Ctrl+Delete - delete word forward
      else if (isRawCtrlDelete) {
        const wordEnd = findWordBoundaryRight(value, cursorOffset);
        nextValue =
          value.slice(0, cursorOffset) +
          value.slice(wordEnd);
        // Cursor stays in place
      }
      // Ctrl+U - delete to line start
      else if (isCtrlU) {
        nextValue = value.slice(cursorOffset);
        nextCursorOffset = 0;
      }
      // Ctrl+K - delete to line end
      else if (isCtrlK) {
        nextValue = value.slice(0, cursorOffset);
        // Cursor stays at current position
      }
      // Backspace - delete character before cursor
      // Use raw detection (Windows sends 0x00 for backspace)
      else if (isRawBackspace && cursorOffset > 0) {
        nextValue =
          value.slice(0, cursorOffset - 1) +
          value.slice(cursorOffset);
        nextCursorOffset = cursorOffset - 1;
      }
      // Delete - delete character after cursor (forward delete)
      // Use raw detection (Windows sends \x1b[3~ for delete)
      else if (isRawDelete && cursorOffset < value.length) {
        nextValue =
          value.slice(0, cursorOffset) +
          value.slice(cursorOffset + 1);
        // Cursor stays in place
      }
      // Fallback: key.backspace for proper terminals
      else if (key.backspace && !isRawBackspace && !isRawDelete && cursorOffset > 0) {
        nextValue =
          value.slice(0, cursorOffset - 1) +
          value.slice(cursorOffset);
        nextCursorOffset = cursorOffset - 1;
      }
      // Fallback: key.delete for proper terminals (but not if Windows already handled it)
      else if (key.delete && !isRawBackspace && !isRawDelete && cursorOffset < value.length) {
        nextValue =
          value.slice(0, cursorOffset) +
          value.slice(cursorOffset + 1);
        // Cursor stays in place
      }
      // === TEXT INPUT ===
      // Only process as text if:
      // - Not a control key combination
      // - Not an escape sequence (starts with \x1b)
      // - Not a control character (< 0x20) except for pasted text
      else if (!key.ctrl && !key.meta && input.length > 0) {
        const firstChar = input.charCodeAt(0);
        const isEscapeSequence = firstChar === 0x1b;
        const isControlChar = firstChar < 0x20 && firstChar !== 0x09; // Allow tab in pasted text

        if (!isEscapeSequence && !isControlChar) {
          // Regular character input
          nextValue =
            value.slice(0, cursorOffset) +
            input +
            value.slice(cursorOffset);
          nextCursorOffset = cursorOffset + input.length;

          // Track paste width for highlighting
          if (input.length > 1) {
            nextCursorWidth = input.length;
          }
        }
      }

      // Clamp cursor
      if (nextCursorOffset < 0) {
        nextCursorOffset = 0;
      }
      if (nextCursorOffset > nextValue.length) {
        nextCursorOffset = nextValue.length;
      }

      // Update state
      setCursorOffset(nextCursorOffset);
      setCursorWidth(nextCursorWidth);

      // Notify of value change
      if (nextValue !== value) {
        onChange(nextValue);
      }
    },
    { isActive: focus && isRawModeSupported === true }
  );

  // Render
  const showPlaceholder = placeholder && value.length === 0;

  return <Text>{showPlaceholder ? renderedPlaceholder : renderedValue}</Text>;
}

/**
 * Uncontrolled variant that manages its own state
 */
export interface UncontrolledTextInputProps
  extends Omit<TextInputProps, 'value' | 'onChange'> {
  /** Initial value */
  initialValue?: string;
  /** Optional onChange callback */
  onChange?: (value: string) => void;
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
