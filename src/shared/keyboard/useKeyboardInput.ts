/**
 * Top-level keyboard input capture
 * Wraps Ink's useInput and dispatches to KeyboardEventBus
 *
 * Uses RawKeyMapper for accurate key detection across different terminals.
 * Raw stdin detection happens before Ink's useInput for maximum compatibility.
 */

import { useInput, useStdin } from 'ink';
import { useKeyboard } from './KeyboardContext.js';
import { logger } from '@/shared/utils/logger.js';
import { getLastRawKey, type RawKeyResult } from './RawKeyMapper.js';

/**
 * Ink Key object type
 * Based on Ink's useInput hook callback signature
 */
interface InkKey {
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  shift?: boolean;
  backspace?: boolean;
  delete?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  home?: boolean;
  end?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

/**
 * ASCII control character mapping (0x00-0x1F)
 * Maps character codes to Ctrl+ key combinations
 */
const CONTROL_CHAR_MAP: Record<number, string> = {
  0x00: 'Space',
  0x01: 'A',
  0x02: 'B',
  0x03: 'C',
  0x04: 'D',
  0x05: 'E',
  0x06: 'F',
  0x07: 'G',
  0x08: 'H',
  0x09: 'I',
  0x0a: 'J',
  0x0b: 'K',
  0x0c: 'L',
  0x0d: 'M',
  0x0e: 'N',
  0x0f: 'O',
  0x10: 'P',
  0x11: 'Q',
  0x12: 'R',
  0x13: 'S',
  0x14: 'T',
  0x15: 'U',
  0x16: 'V',
  0x17: 'W',
  0x18: 'X',
  0x19: 'Y',
  0x1a: 'Z',
  0x1b: '[',
  0x1c: '\\',
  0x1d: ']',
  0x1e: '^',
  0x1f: '_',
};

/**
 * Keys that benefit from raw detection accuracy
 */
const RAW_PRIORITY_KEYS = new Set([
  'Backspace',
  'Delete',
  'Home',
  'End',
  'Insert',
  'PageUp',
  'PageDown',
]);

/**
 * Check if a key should use raw detection
 */
function shouldUseRawDetection(rawKey: string): boolean {
  if (RAW_PRIORITY_KEYS.has(rawKey)) return true;
  if (rawKey.startsWith('Ctrl+')) return true;
  if (rawKey.startsWith('Alt+')) return true;
  if (rawKey.startsWith('Shift+')) return true;
  if (rawKey.startsWith('F')) return true;
  return false;
}

/**
 * Normalize arrow key names from raw detection format to Ink's format
 */
function normalizeRawArrowKey(rawKey: string): string {
  const arrowReplacements: [RegExp, string][] = [
    [/Ctrl\+Shift\+ArrowUp/, 'Ctrl+Shift+Up'],
    [/Ctrl\+Shift\+ArrowDown/, 'Ctrl+Shift+Down'],
    [/Ctrl\+Shift\+ArrowLeft/, 'Ctrl+Shift+Left'],
    [/Ctrl\+Shift\+ArrowRight/, 'Ctrl+Shift+Right'],
    [/Ctrl\+ArrowUp/, 'Ctrl+Up'],
    [/Ctrl\+ArrowDown/, 'Ctrl+Down'],
    [/Ctrl\+ArrowLeft/, 'Ctrl+Left'],
    [/Ctrl\+ArrowRight/, 'Ctrl+Right'],
    [/Alt\+ArrowUp/, 'Alt+Up'],
    [/Alt\+ArrowDown/, 'Alt+Down'],
    [/Alt\+ArrowLeft/, 'Alt+Left'],
    [/Alt\+ArrowRight/, 'Alt+Right'],
    [/Shift\+ArrowUp/, 'Shift+Up'],
    [/Shift\+ArrowDown/, 'Shift+Down'],
    [/Shift\+ArrowLeft/, 'Shift+Left'],
    [/Shift\+ArrowRight/, 'Shift+Right'],
  ];

  for (const [pattern, replacement] of arrowReplacements) {
    if (pattern.test(rawKey)) {
      return rawKey.replace(pattern, replacement);
    }
  }
  return rawKey;
}

/**
 * Convert Ctrl+Shift combinations to key string
 */
function handleCtrlShiftKey(key: InkKey): string | null {
  if (key.upArrow) return 'Ctrl+Shift+Up';
  if (key.downArrow) return 'Ctrl+Shift+Down';
  if (key.leftArrow) return 'Ctrl+Shift+Left';
  if (key.rightArrow) return 'Ctrl+Shift+Right';
  if (key.backspace) return 'Ctrl+Shift+Backspace';
  if (key.delete) return 'Ctrl+Shift+Delete';
  return null;
}

/**
 * Convert Ctrl combinations to key string
 */
function handleCtrlKey(key: InkKey): string | null {
  if (key.leftArrow) return 'Ctrl+Left';
  if (key.rightArrow) return 'Ctrl+Right';
  if (key.upArrow) return 'Ctrl+Up';
  if (key.downArrow) return 'Ctrl+Down';
  if (key.backspace) return 'Ctrl+Backspace';
  if (key.delete) return 'Ctrl+Delete';
  if (key.home) return 'Ctrl+Home';
  if (key.end) return 'Ctrl+End';
  return null;
}

/**
 * Convert Meta/Alt combinations to key string
 */
function handleMetaKey(key: InkKey): string | null {
  if (key.leftArrow) return 'Alt+Left';
  if (key.rightArrow) return 'Alt+Right';
  if (key.upArrow) return 'Alt+Up';
  if (key.downArrow) return 'Alt+Down';
  if (key.backspace) return 'Alt+Backspace';
  if (key.delete) return 'Alt+Delete';
  return null;
}

/**
 * Convert basic special keys to key string
 */
function handleSpecialKey(key: InkKey): string | null {
  if (key.return) return 'Enter';
  if (key.escape) return 'Escape';
  if (key.tab) return key.shift ? 'Shift+Tab' : 'Tab';
  if (key.backspace) return 'Backspace';
  if (key.delete) return 'Delete';
  if (key.upArrow) return 'ArrowUp';
  if (key.downArrow) return 'ArrowDown';
  if (key.leftArrow) return 'ArrowLeft';
  if (key.rightArrow) return 'ArrowRight';
  if (key.pageUp) return 'PageUp';
  if (key.pageDown) return 'PageDown';
  if (key.home) return 'Home';
  if (key.end) return 'End';
  return null;
}

/**
 * Convert Ink key event to normalized key string
 * Uses RawKeyMapper result when available for accurate detection
 */
function inkKeyToString(input: string, key: InkKey, rawResult: RawKeyResult | null): string {
  // If raw detection succeeded with high/medium confidence, prefer that
  if (rawResult?.detectedRaw && rawResult.key && rawResult.confidence !== 'low') {
    const rawKey = rawResult.key;
    if (shouldUseRawDetection(rawKey)) {
      return normalizeRawArrowKey(rawKey);
    }
  }

  // Fall back to Ink's key detection
  // Check modifier combinations in order of specificity
  if (key.ctrl && key.shift) {
    const result = handleCtrlShiftKey(key);
    if (result) return result;
  }

  if (key.ctrl) {
    const result = handleCtrlKey(key);
    if (result) return result;
  }

  if (key.meta) {
    const result = handleMetaKey(key);
    if (result) return result;
  }

  // Basic special keys
  const specialResult = handleSpecialKey(key);
  if (specialResult) return specialResult;

  // Handle control characters and modifier combinations with input
  return handleInputWithModifiers(input, key);
}

/**
 * Handle input characters with modifiers
 */
function handleInputWithModifiers(input: string, key: InkKey): string {
  const charCode = input.length > 0 ? input.charCodeAt(0) : -1;

  if (key.ctrl) {
    // Control characters (0x00-0x1F)
    if (charCode >= 0x00 && charCode <= 0x1f) {
      const letter = CONTROL_CHAR_MAP[charCode];
      if (letter) return `Ctrl+${letter}`;
    }
    if (input.length === 1) return `Ctrl+${input.toUpperCase()}`;
    return `Ctrl`;
  }

  if (key.meta) {
    if (key.shift && input.length === 1) return `Cmd+Shift+${input.toUpperCase()}`;
    if (input.length === 1) return `Cmd+${input.toUpperCase()}`;
    return `Cmd`;
  }

  return input;
}

export interface UseKeyboardInputOptions {
  isActive?: boolean;
}

/**
 * Capture keyboard input and dispatch to event bus
 *
 * IMPORTANT: This hook uses INVERTED LOGIC (blacklist, not whitelist)
 * - Only intercepts keys that are CONFIGURED in keybindings
 * - Only intercepts if action is RELEVANT in current context
 * - All other keys passthrough to Ink components (TextInput, etc.)
 *
 * This ensures OS text editing shortcuts (Home, End, Ctrl+Arrow, etc.)
 * work natively unless explicitly configured for Mimir actions.
 */
export function useKeyboardInput(options: UseKeyboardInputOptions = {}): void {
  const { isActive = true } = options;
  const { eventBus, bindingsManager } = useKeyboard();
  const { isRawModeSupported } = useStdin();

  // NOTE: Raw stdin listener is NOT set up here.
  // TextInput has its own raw stdin listener for text editing keys.
  // useKeyboardInput only intercepts configured keybindings, which Ink handles fine.
  // Having two listeners causes race conditions where one clears the result before the other reads it.

  useInput(
    (input, key) => {
      try {
        if (!isActive) {
          logger.debug('[KB] useKeyboardInput inactive, ignoring input');
          return;
        }

        // Get raw detection result (set by TextInput's stdin listener)
        // This provides accurate detection for Alt+Backspace and other terminal-specific sequences
        const rawResult = getLastRawKey();

        // Convert to normalized key string using Ink's detection with raw fallback
        const keyString = inkKeyToString(input, key, rawResult);

        logger.debug('[KB] Key converted', { keyString });

        const action = bindingsManager.getActionForKey(keyString);

        // INVERTED LOGIC: If no action configured, let it passthrough
        if (!action) {
          logger.debug('[KB] No action for key, passthrough', { keyString });
          return; // Key not configured → passthrough to TextInput/other components
        }

        // If action exists but not relevant in current context, passthrough
        const isRelevant = eventBus.isActionRelevantInContext(action);
        if (!isRelevant) {
          logger.debug('[KB] Action not relevant in context, passthrough', { action });
          return; // Action not relevant now → passthrough
        }

        // Only NOW intercept and dispatch
        logger.debug('[KB] Dispatching action', { action, keyString });
        eventBus.dispatchAction(action, keyString);
      } catch (err) {
        logger.error('[KB] Error in useKeyboardInput', {
          error: String(err),
          stack: (err as Error)?.stack,
        });
      }
    },
    { isActive: isActive && isRawModeSupported === true }
  );
}
