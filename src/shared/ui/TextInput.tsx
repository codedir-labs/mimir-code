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
import type { Theme } from '@/shared/config/schemas.js';

export interface TextInputProps {
  /** Current value of the input */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when Enter is pressed */
  onSubmit?: (value: string) => void;
  /** Callback when a complete paste is received (with full accumulated content) */
  onPaste?: (content: string) => void;
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
  /** Theme for styling (used for error colors on invalid refs) */
  theme?: Theme;
  /** Set of valid attachment numbers (for highlighting invalid #[n] refs) */
  validAttachmentNums?: Set<string>;
  /** Request cursor to move to this position (increment to trigger move to same position) */
  requestCursorAt?: { position: number; token: number };
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

  // Track if component has finished initial mount (to detect pre-mount paste)
  const hasInitializedRef = useRef(false);

  // Log component mount/render for debugging
  useEffect(() => {
    pasteLog('TextInput', 'Component mounted', {
      hasOnPaste: !!onPaste,
      focus,
      isRawModeSupported,
      initialValueLen: value.length,
    });

    // CRITICAL: If value already has content at mount time, it's likely buffered paste
    // that arrived before handlers were ready. Detect and handle it.
    if (value.length > 10 && onPaste) {
      pasteLog('TextInput', 'DETECTED PRE-MOUNT PASTE', { valueLen: value.length });
      // Emit this as a paste so it gets handled properly
      const content = value;
      setImmediate(() => {
        if (onPasteRef.current) {
          pasteLog('TextInput', 'Emitting pre-mount paste to handler');
          onPasteRef.current(content);
        }
      });
    }

    // Mark as initialized after a short delay
    setTimeout(() => {
      hasInitializedRef.current = true;
      pasteLog('TextInput', 'Initialization complete');
    }, 100);

    return () => {
      pasteLog('TextInput', 'Component unmounted');
    };
  }, []);

  // Cursor state - must be declared before refs that use it
  const [cursorOffset, setCursorOffset] = useState(value.length);
  const [cursorWidth, setCursorWidth] = useState(0);

  // Handle external cursor position requests
  const lastCursorTokenRef = useRef<number>(-1);
  useEffect(() => {
    if (requestCursorAt && requestCursorAt.token !== lastCursorTokenRef.current) {
      lastCursorTokenRef.current = requestCursorAt.token;
      const clampedPos = Math.max(0, Math.min(requestCursorAt.position, value.length));
      setCursorOffset(clampedPos);
      setCursorWidth(0);
    }
  }, [requestCursorAt, value.length]);

  // Track bracketed paste state - use ref for synchronous access during useInput
  // React state updates are async and won't take effect before useInput runs
  const pasteInProgressRef = useRef(false);
  const pasteBufferRef = useRef<string>('');
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track when paste ended to add cool-down period (prevents race conditions with useInput)
  const pasteEndTimeRef = useRef(0);
  // Track if paste was already emitted (prevents double-emission)
  const pasteEmittedRef = useRef(false);

  // Track paste accumulation in useInput (since stdin events aren't working)
  const useInputPasteBufferRef = useRef<string>('');
  const useInputPasteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State for rendering - when true, show placeholder to hide garbage during paste
  const [isPasting, setIsPasting] = useState(false);

  // Store onPaste callback in ref so stdin handler can access it
  // Wrap to add logging
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

  // Store onChange callback in ref for fallback paste handling
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Store current value in ref for paste insertion
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Store cursor position in ref for paste insertion
  const cursorRef = useRef(cursorOffset);
  useEffect(() => {
    cursorRef.current = cursorOffset;
  }, [cursorOffset]);

  // Set up raw stdin listener to feed the centralized RawKeyMapper
  // Also tracks bracketed paste start/end and accumulates paste content
  useEffect(() => {
    if (!stdin || !focus) return;

    // Clear log on mount
    pasteLogClear();
    pasteLog('TextInput', 'stdin handler mounted');

    // Enable bracketed paste mode - this tells the terminal to wrap paste content
    // with escape sequences \x1b[200~ (start) and \x1b[201~ (end)
    // Without this, the terminal sends paste content as raw keystrokes
    const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
    const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

    // Check if stdout is a TTY before sending escape sequences
    if (process.stdout.isTTY) {
      pasteLog('TextInput', 'Enabling bracketed paste mode');
      process.stdout.write(ENABLE_BRACKETED_PASTE);
    } else {
      pasteLog('TextInput', 'stdout is not TTY, skipping bracketed paste mode');
    }

    // Track multi-char input for fallback paste detection (terminals without bracketed paste)
    let rapidInputBuffer = '';
    let rapidInputTimer: NodeJS.Timeout | null = null;
    const RAPID_INPUT_THRESHOLD = 50; // ms - if multiple chars arrive within this window, likely paste
    const MIN_PASTE_CHARS = 10; // minimum chars to consider as paste

    const handleRawData = (data: Buffer | string) => {
      try {
        const dataStr = typeof data === 'string' ? data : data.toString('utf8');

        // Check for paste markers in this chunk
        const hasStartMarker = dataStr.includes('\x1b[200~');
        const hasEndMarker = dataStr.includes('\x1b[201~');

        // Log raw bytes for debugging - ALWAYS log to ensure handler is called
        const hexBytes = Buffer.from(dataStr).toString('hex').substring(0, 100);
        const firstChars = dataStr.substring(0, 50).replace(/[\x00-\x1f]/g, (c) => `<${c.charCodeAt(0).toString(16)}>`);
        pasteLog('STDIN', 'Raw data received', {
          length: dataStr.length,
          hasStartMarker,
          hasEndMarker,
          pasteInProgress: pasteInProgressRef.current,
          hexBytes,
          firstChars,
        });

      // Only process through RawKeyMapper when NOT pasting (avoid interference)
      if (!pasteInProgressRef.current && !hasStartMarker && !hasEndMarker) {
        processRawKey(data);
      }

      // Handle paste start
      if (hasStartMarker) {
        pasteLogSeparator('PASTE START DETECTED');
        pasteInProgressRef.current = true;
        pasteEmittedRef.current = false; // Reset emission flag
        pasteBufferRef.current = ''; // Reset buffer
        setIsPasting(true); // Show placeholder during paste

        // Extract content after start marker
        const afterStart = dataStr.split('\x1b[200~')[1] ?? '';
        // If end marker is also in this chunk, extract content between markers
        if (hasEndMarker) {
          const content = afterStart.split('\x1b[201~')[0] ?? '';
          pasteBufferRef.current = content;
          pasteLog('STDIN', 'Single-chunk paste (has both markers)', { contentLen: content.length });
        } else {
          pasteBufferRef.current = afterStart.replace(/\x1b\[201~/g, '');
          pasteLog('STDIN', 'Multi-chunk paste started', { initialBufferLen: pasteBufferRef.current.length });
        }

        // Set timeout to auto-clear paste state (safety mechanism for broken terminals)
        if (pasteTimeoutRef.current) {
          clearTimeout(pasteTimeoutRef.current);
        }
        pasteTimeoutRef.current = setTimeout(() => {
          pasteLog('STDIN', 'Paste timeout fired (5s)');
          // If we have accumulated content when timeout fires, emit it
          if (pasteInProgressRef.current && pasteBufferRef.current.length > 0 && !pasteEmittedRef.current) {
            pasteEmittedRef.current = true;
            const content = pasteBufferRef.current;
            pasteLog('STDIN', 'Emitting via timeout', { contentLen: content.length });
            if (onPasteRef.current) {
              onPasteRef.current(content);
            }
          }
          pasteInProgressRef.current = false;
          pasteEndTimeRef.current = Date.now();
          pasteBufferRef.current = '';
          pasteTimeoutRef.current = null;
          setIsPasting(false); // Hide placeholder after timeout
        }, 5000);
      }

      // Handle paste end
      if (hasEndMarker) {
        pasteLogSeparator('PASTE END DETECTED');
        // Extract any content before end marker if not yet captured
        if (!hasStartMarker) {
          const beforeEnd = dataStr.split('\x1b[201~')[0] ?? '';
          pasteBufferRef.current += beforeEnd;
          pasteLog('STDIN', 'Added content before end marker', { addedLen: beforeEnd.length });
        }

        pasteLog('STDIN', 'Final buffer state', {
          bufferLen: pasteBufferRef.current.length,
          alreadyEmitted: pasteEmittedRef.current,
          hasOnPaste: !!onPasteRef.current,
        });
        pasteLogContent('STDIN-BUFFER', pasteBufferRef.current);

        pasteInProgressRef.current = false;
        pasteEndTimeRef.current = Date.now(); // Set cool-down timestamp

        if (pasteTimeoutRef.current) {
          clearTimeout(pasteTimeoutRef.current);
          pasteTimeoutRef.current = null;
        }

        // Emit the complete accumulated paste content (only once)
        // Use setImmediate to defer emission AFTER useInput finishes processing
        // This ensures our clean content overwrites any garbage from fragmented useInput calls
        if (!pasteEmittedRef.current) {
          pasteEmittedRef.current = true;
          const content = pasteBufferRef.current;
          pasteLog('STDIN', 'Will emit paste content', { contentLen: content.length });
          if (content.length > 0 && onPasteRef.current) {
            // Defer to next tick to ensure we run after all useInput calls complete
            setImmediate(() => {
              pasteLog('STDIN', 'setImmediate: calling onPaste');
              if (onPasteRef.current) {
                onPasteRef.current(content);
              }
              // Give parent time to process paste and update value before hiding placeholder
              // This ensures the clean value has propagated back down
              setTimeout(() => {
                pasteLog('STDIN', 'setTimeout: hiding isPasting');
                setIsPasting(false);
              }, 150);
            });
          } else {
            pasteLog('STDIN', 'No content or no handler, hiding placeholder', {
              contentLen: content.length,
              hasHandler: !!onPasteRef.current,
            });
            // No content or no handler - just hide placeholder
            setTimeout(() => setIsPasting(false), 150);
          }
        } else {
          pasteLog('STDIN', 'Already emitted, just hiding placeholder');
          setTimeout(() => setIsPasting(false), 150);
        }
        pasteBufferRef.current = '';
        return; // Don't process this chunk further
      }

      // Accumulate content while paste is in progress (middle chunks)
      if (pasteInProgressRef.current && !hasStartMarker && !hasEndMarker) {
        // Strip any markers that might be in this chunk (shouldn't happen but be safe)
        const cleaned = dataStr
          .replace(/\x1b\[200~/g, '')
          .replace(/\x1b\[201~/g, '');
        pasteBufferRef.current += cleaned;
        pasteLog('STDIN', 'Accumulated middle chunk', {
          chunkLen: cleaned.length,
          totalBufferLen: pasteBufferRef.current.length,
        });
        return; // Don't process through fallback
      }

      // === FALLBACK PASTE DETECTION ===
      // For terminals that don't support bracketed paste mode, detect rapid multi-char input
      // This catches paste content that arrives as rapid keystrokes
      if (!hasStartMarker && !hasEndMarker && !pasteInProgressRef.current) {
        // Check if this looks like paste content (multi-char or has newlines)
        const looksLikePaste = dataStr.length > 1 || dataStr.includes('\n') || dataStr.includes('\r');

        if (looksLikePaste) {
          pasteLog('FALLBACK', 'Rapid input detected', {
            length: dataStr.length,
            hasNewlines: dataStr.includes('\n') || dataStr.includes('\r'),
            currentBuffer: rapidInputBuffer.length,
          });

          // Accumulate rapid input
          rapidInputBuffer += dataStr;

          // Clear previous timer
          if (rapidInputTimer) {
            clearTimeout(rapidInputTimer);
          }

          // Start/restart debounce timer - when input stops arriving, process accumulated content
          rapidInputTimer = setTimeout(() => {
            if (rapidInputBuffer.length >= MIN_PASTE_CHARS) {
              pasteLog('FALLBACK', 'Emitting accumulated paste', {
                length: rapidInputBuffer.length,
              });
              pasteLogContent('FALLBACK-CONTENT', rapidInputBuffer);

              // Emit as paste
              if (onPasteRef.current) {
                setIsPasting(true);
                const content = rapidInputBuffer;
                rapidInputBuffer = '';

                setImmediate(() => {
                  if (onPasteRef.current) {
                    onPasteRef.current(content);
                  }
                  setTimeout(() => {
                    setIsPasting(false);
                  }, 150);
                });
              } else {
                // No paste handler, clear buffer
                rapidInputBuffer = '';
              }
            } else {
              pasteLog('FALLBACK', 'Buffer too small, clearing', {
                length: rapidInputBuffer.length,
              });
              rapidInputBuffer = '';
            }
            rapidInputTimer = null;
          }, RAPID_INPUT_THRESHOLD);

          return; // Don't process through RawKeyMapper
        }
      }
      } catch (err) {
        pasteLog('STDIN', 'ERROR in handleRawData', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Log stdin object info for debugging
    pasteLog('TextInput', 'stdin info', {
      stdinExists: !!stdin,
      isProcessStdin: stdin === process.stdin,
      isTTY: stdin?.isTTY,
      isReadable: stdin?.readable,
    });

    // Use prependListener to ensure our handler runs BEFORE Ink's handler
    // This is critical - Ink registers its handler first, so we need to prepend
    // to set pasteInProgressRef BEFORE Ink calls useInput
    if (typeof stdin.prependListener === 'function') {
      pasteLog('TextInput', 'Using prependListener');
      stdin.prependListener('data', handleRawData);
    } else {
      // Fallback for environments without prependListener
      pasteLog('TextInput', 'Using stdin.on (fallback)');
      stdin.on('data', handleRawData);
    }

    // Also listen to process.stdin directly as backup
    // Ink might be using a different stream
    if (stdin !== process.stdin && process.stdin.readable) {
      pasteLog('TextInput', 'Also listening on process.stdin');
      process.stdin.prependListener('data', handleRawData);
    }

    return () => {
      stdin.off('data', handleRawData);
      // Also remove from process.stdin if we added it
      if (stdin !== process.stdin) {
        process.stdin.off('data', handleRawData);
      }
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
      }
      if (rapidInputTimer) {
        clearTimeout(rapidInputTimer);
      }
      // Disable bracketed paste mode when unmounting
      if (process.stdout.isTTY) {
        pasteLog('TextInput', 'Disabling bracketed paste mode');
        process.stdout.write(DISABLE_BRACKETED_PASTE);
      }
    };
  }, [stdin, focus]);

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
  // This allows users to configure custom keybindings for text editing actions
  const textEditingOperations = useMemo(
    () => createTextEditingOperations(value, cursorOffset, onChange, moveCursor),
    [value, cursorOffset, onChange, moveCursor]
  );

  // Subscribe to text editing actions from KeyboardEventBus
  // When users configure custom keybindings (e.g., cursorToLineStart: ['Home']),
  // the KeyboardEventBus will dispatch those actions and we handle them here
  useTextEditingActions(textEditingOperations, { enabled: focus });

  // Render the value with cursor highlighting and invalid reference highlighting
  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const displayValue = mask ? mask.repeat(value.length) : value;

  // Get theme colors for error styling
  const themeColors = getTheme(theme).colors;

  // Find all invalid reference positions for error highlighting:
  // 1. #[x] - explicitly marked as invalid (deleted attachment)
  // 2. #[n] - where n is not in validAttachmentNums (non-existent attachment)
  const invalidRefRanges: Array<{ start: number; end: number }> = [];

  // Match #[x] (explicitly invalid)
  const invalidXPattern = /#\[x\]/g;
  let invalidMatch;
  while ((invalidMatch = invalidXPattern.exec(displayValue)) !== null) {
    invalidRefRanges.push({
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
        // This reference points to a non-existent attachment
        invalidRefRanges.push({
          start: numMatch.index,
          end: numMatch.index + numMatch[0].length,
        });
      }
    }
  }

  // Check if a position is inside an invalid reference
  const isInInvalidRef = (pos: number): boolean => {
    return invalidRefRanges.some((range) => pos >= range.start && pos < range.end);
  };

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

    // Cursor in value - apply cursor and invalid ref highlighting
    if (displayValue.length > 0) {
      renderedValue = '';
      let i = 0;

      for (const char of displayValue) {
        const isInCursorHighlight =
          i >= cursorOffset - cursorActualWidth && i <= cursorOffset;
        const isInvalid = isInInvalidRef(i);

        if (isInCursorHighlight) {
          // Cursor takes precedence - show inverse
          renderedValue += chalk.inverse(char);
        } else if (isInvalid) {
          // Invalid reference - use theme error color
          renderedValue += themeColors.error(char);
        } else {
          renderedValue += char;
        }
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
    // No cursor - still apply invalid ref highlighting
    if (invalidRefRanges.length > 0) {
      renderedValue = '';
      let i = 0;
      for (const char of displayValue) {
        if (isInInvalidRef(i)) {
          renderedValue += themeColors.error(char);
        } else {
          renderedValue += char;
        }
        i++;
      }
    } else {
      renderedValue = displayValue;
    }
  }

  // Log that we're about to register useInput
  pasteLog('TextInput', 'RENDER - about to call useInput hook', {
    focus,
    isRawModeSupported,
    valueLen: value.length,
  });

  useInput(
    (input, key) => {
      // FIRST LINE - log immediately to ensure we see ANY calls
      try {
        pasteLog('useInput', '>>> ENTRY <<<', { inputLen: input.length });
      } catch (e) {
        // Ignore logging errors
      }

      // Log ALL useInput calls for debugging
      const inputHex = Buffer.from(input).toString('hex').substring(0, 60);
      pasteLog('useInput', 'Called', {
        inputLen: input.length,
        inputHex,
        inputPreview: input.substring(0, 30).replace(/[\x00-\x1f]/g, (c) => `<${c.charCodeAt(0).toString(16)}>`),
        hasReturn: key.return,
        hasEscape: key.escape,
        hasCtrl: key.ctrl,
        pasteInProgress: pasteInProgressRef.current,
      });

      // === PASTE DETECTION IN useInput ===
      // Since stdin events aren't firing, detect paste here
      const hasStartMarker = input.includes('\x1b[200~');
      const hasEndMarker = input.includes('\x1b[201~');

      // Handle paste start
      if (hasStartMarker) {
        pasteLogSeparator('useInput: PASTE START');
        pasteInProgressRef.current = true;
        pasteEmittedRef.current = false;
        setIsPasting(true);

        // Extract content after start marker
        const afterStart = input.split('\x1b[200~')[1] ?? '';
        if (hasEndMarker) {
          // Complete paste in one chunk
          const content = afterStart.split('\x1b[201~')[0] ?? '';
          pasteLog('useInput', 'Complete paste in one chunk', { contentLen: content.length });
          useInputPasteBufferRef.current = content;
        } else {
          useInputPasteBufferRef.current = afterStart;
        }
        clearLastRawKey();
      }

      // Handle paste end
      if (hasEndMarker) {
        pasteLogSeparator('useInput: PASTE END');
        if (!hasStartMarker) {
          // End marker without start - append content before marker
          const beforeEnd = input.split('\x1b[201~')[0] ?? '';
          useInputPasteBufferRef.current += beforeEnd;
        }

        pasteInProgressRef.current = false;
        pasteEndTimeRef.current = Date.now();

        const content = useInputPasteBufferRef.current;
        pasteLog('useInput', 'Emitting paste', { contentLen: content.length });
        pasteLogContent('useInput-PASTE', content);

        if (content.length > 0 && onPasteRef.current && !pasteEmittedRef.current) {
          pasteEmittedRef.current = true;
          setImmediate(() => {
            if (onPasteRef.current) {
              onPasteRef.current(content);
            }
            setTimeout(() => setIsPasting(false), 150);
          });
        } else {
          setTimeout(() => setIsPasting(false), 150);
        }

        useInputPasteBufferRef.current = '';
        clearLastRawKey();
        return;
      }

      // Accumulate during paste
      if (pasteInProgressRef.current) {
        useInputPasteBufferRef.current += input;
        pasteLog('useInput', 'Accumulating paste', { bufferLen: useInputPasteBufferRef.current.length });
        clearLastRawKey();
        return;
      }

      // === FALLBACK: Detect paste by heuristics (rapid multi-char input) ===
      const looksLikePaste = input.length > 1 || input.includes('\n') || input.includes('\r');
      if (looksLikePaste && !pasteInProgressRef.current) {
        pasteLog('useInput', 'Heuristic paste detected', { inputLen: input.length });

        // Accumulate rapid input
        useInputPasteBufferRef.current += input;

        // Clear previous timer
        if (useInputPasteTimerRef.current) {
          clearTimeout(useInputPasteTimerRef.current);
        }

        // Debounce - emit after 100ms of no input
        useInputPasteTimerRef.current = setTimeout(() => {
          const buffer = useInputPasteBufferRef.current;
          if (buffer.length >= 5) { // Lowered threshold
            pasteLog('useInput', 'Emitting heuristic paste', { len: buffer.length });
            pasteLogContent('useInput-HEURISTIC', buffer);

            if (onPasteRef.current) {
              setIsPasting(true);
              pasteEmittedRef.current = true;
              setImmediate(() => {
                if (onPasteRef.current) {
                  onPasteRef.current(buffer);
                }
                setTimeout(() => setIsPasting(false), 150);
              });
            }
          } else {
            pasteLog('useInput', 'Heuristic buffer too small, ignoring', { len: buffer.length });
          }
          useInputPasteBufferRef.current = '';
          useInputPasteTimerRef.current = null;
        }, 100);

        clearLastRawKey();
        return;
      }

      // === NORMAL INPUT HANDLING ===
      const inPasteCooldown = Date.now() - pasteEndTimeRef.current < 200;
      if (inPasteCooldown) {
        pasteLog('useInput', 'BLOCKED (cooldown)');
        clearLastRawKey();
        return;
      }

      // Block if input contains escape sequences (likely paste or garbage)
      // Normal typing doesn't produce raw escape sequences through useInput
      if (input.includes('\x1b') && !key.escape) {
        pasteLog('useInput', 'BLOCKED (escape sequence)');
        clearLastRawKey();
        return;
      }

      // === RAW KEY DETECTION ===
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

      // Submit on Enter (only when not pasting)
      if (key.return) {
        if (onSubmit) {
          onSubmit(value);
        }
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
  // During paste, show a stable placeholder to hide garbage from fragmented chunks
  if (isPasting) {
    return <Text dimColor>Pasting...</Text>;
  }

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
