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
 * Convert Ink key event to normalized key string
 * Uses RawKeyMapper result when available for accurate detection
 */
function inkKeyToString(input: string, key: InkKey, rawResult: RawKeyResult | null): string {
  // If raw detection succeeded with high/medium confidence, prefer that
  // This handles terminal-specific escape sequences that Ink doesn't detect correctly
  if (rawResult && rawResult.detectedRaw && rawResult.key && rawResult.confidence !== 'low') {
    // Map raw key names to our normalized format if needed
    const rawKey = rawResult.key;

    // Handle special cases where raw detection is more accurate
    // Especially for Backspace/Delete distinction and Home/End
    if (
      rawKey === 'Backspace' ||
      rawKey === 'Delete' ||
      rawKey === 'Home' ||
      rawKey === 'End' ||
      rawKey === 'Insert' ||
      rawKey === 'PageUp' ||
      rawKey === 'PageDown' ||
      rawKey.startsWith('Ctrl+') ||
      rawKey.startsWith('Alt+') ||
      rawKey.startsWith('Shift+') ||
      rawKey.startsWith('F')
    ) {
      // Normalize arrow key names to match Ink's format
      return rawKey
        .replace('ArrowUp', 'ArrowUp')
        .replace('ArrowDown', 'ArrowDown')
        .replace('ArrowLeft', 'ArrowLeft')
        .replace('ArrowRight', 'ArrowRight')
        .replace('Ctrl+Shift+ArrowUp', 'Ctrl+Shift+Up')
        .replace('Ctrl+Shift+ArrowDown', 'Ctrl+Shift+Down')
        .replace('Ctrl+Shift+ArrowLeft', 'Ctrl+Shift+Left')
        .replace('Ctrl+Shift+ArrowRight', 'Ctrl+Shift+Right')
        .replace('Ctrl+ArrowUp', 'Ctrl+Up')
        .replace('Ctrl+ArrowDown', 'Ctrl+Down')
        .replace('Ctrl+ArrowLeft', 'Ctrl+Left')
        .replace('Ctrl+ArrowRight', 'Ctrl+Right')
        .replace('Alt+ArrowUp', 'Alt+Up')
        .replace('Alt+ArrowDown', 'Alt+Down')
        .replace('Alt+ArrowLeft', 'Alt+Left')
        .replace('Alt+ArrowRight', 'Alt+Right')
        .replace('Shift+ArrowUp', 'Shift+Up')
        .replace('Shift+ArrowDown', 'Shift+Down')
        .replace('Shift+ArrowLeft', 'Shift+Left')
        .replace('Shift+ArrowRight', 'Shift+Right');
    }
  }

  // Fall back to Ink's key detection for everything else
  // Ctrl+Shift combinations (for attachment navigation)
  if (key.ctrl && key.shift) {
    if (key.upArrow) return 'Ctrl+Shift+Up';
    if (key.downArrow) return 'Ctrl+Shift+Down';
    if (key.leftArrow) return 'Ctrl+Shift+Left';
    if (key.rightArrow) return 'Ctrl+Shift+Right';
    if (key.backspace) return 'Ctrl+Shift+Backspace';
    if (key.delete) return 'Ctrl+Shift+Delete';
  }

  // Special keys with Ctrl modifier (OS text editing)
  if (key.ctrl) {
    if (key.leftArrow) return 'Ctrl+Left';
    if (key.rightArrow) return 'Ctrl+Right';
    if (key.upArrow) return 'Ctrl+Up';
    if (key.downArrow) return 'Ctrl+Down';
    if (key.backspace) return 'Ctrl+Backspace';
    if (key.delete) return 'Ctrl+Delete';
    if (key.home) return 'Ctrl+Home';
    if (key.end) return 'Ctrl+End';
  }

  // Special keys with Meta/Alt modifier (macOS word navigation)
  if (key.meta) {
    if (key.leftArrow) return 'Alt+Left';
    if (key.rightArrow) return 'Alt+Right';
    if (key.upArrow) return 'Alt+Up';
    if (key.downArrow) return 'Alt+Down';
    if (key.backspace) return 'Alt+Backspace';
    if (key.delete) return 'Alt+Delete';
  }

  // Basic special keys (no modifiers)
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

  const charCode = input.length > 0 ? input.charCodeAt(0) : -1;

  // Ctrl combinations with regular characters
  if (key.ctrl) {
    // Control characters (0x00-0x1F)
    if (charCode >= 0x00 && charCode <= 0x1f) {
      const letter = CONTROL_CHAR_MAP[charCode];
      if (letter) {
        return `Ctrl+${letter}`;
      }
    }

    // Printable characters
    if (input.length === 1) {
      return `Ctrl+${input.toUpperCase()}`;
    }

    return `Ctrl`;
  }

  // Meta/Cmd combinations (macOS)
  if (key.meta) {
    if (key.shift && input.length === 1) {
      return `Cmd+Shift+${input.toUpperCase()}`;
    }
    if (input.length === 1) {
      return `Cmd+${input.toUpperCase()}`;
    }
    return `Cmd`;
  }

  // Shift combinations
  if (key.shift && input.length === 1) {
    return input;
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
