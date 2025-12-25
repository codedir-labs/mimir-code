/**
 * Top-level keyboard input capture
 * Wraps Ink's useInput and dispatches to KeyboardEventBus
 */

import { useInput } from 'ink';
import { useKeyboard } from './KeyboardContext.js';

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
 */
function inkKeyToString(input: string, key: InkKey): string {
  // Special keys
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

  const charCode = input.length > 0 ? input.charCodeAt(0) : -1;

  // Ctrl combinations
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
 */
export function useKeyboardInput(options: UseKeyboardInputOptions = {}): void {
  const { isActive = true } = options;
  const { eventBus, bindingsManager } = useKeyboard();

  useInput(
    (input, key) => {
      if (!isActive) return;

      const keyString = inkKeyToString(input, key);
      const action = bindingsManager.getActionForKey(keyString);

      if (action) {
        eventBus.dispatchAction(action, keyString);
      }
    },
    { isActive }
  );
}
