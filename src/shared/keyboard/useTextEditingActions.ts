/**
 * Hook for subscribing to text editing actions from KeyboardEventBus
 *
 * This allows TextInput to respond to configurable text editing shortcuts
 * (e.g., cursorToLineStart, deleteWordLeft) through the centralized keyboard system.
 *
 * When a user configures custom keybindings for text editing actions in config,
 * those keys will be intercepted by useKeyboardInput and dispatched here.
 *
 * Native key handling in TextInput serves as the fallback when actions are set to 'none'.
 */

import { useEffect, useRef } from 'react';
import { KeyBindingAction } from '@/shared/utils/KeyBindings.js';
import { useKeyboard } from './KeyboardContext.js';
import { KeyboardEvent } from './KeyboardEventBus.js';

/**
 * Text editing operations that can be triggered by keyboard actions
 */
export interface TextEditingOperations {
  /** Move cursor to start of line */
  cursorToLineStart: () => void;
  /** Move cursor to end of line */
  cursorToLineEnd: () => void;
  /** Move cursor one word left */
  cursorWordLeft: () => void;
  /** Move cursor one word right */
  cursorWordRight: () => void;
  /** Delete word before cursor */
  deleteWordLeft: () => void;
  /** Delete word after cursor */
  deleteWordRight: () => void;
  /** Delete from cursor to end of line */
  deleteToLineEnd: () => void;
  /** Delete from cursor to start of line */
  deleteToLineStart: () => void;
  /** Delete entire line */
  deleteEntireLine: () => void;
}

/**
 * Text editing action types
 */
const TEXT_EDITING_ACTIONS: KeyBindingAction[] = [
  'cursorToLineStart',
  'cursorToLineEnd',
  'cursorWordLeft',
  'cursorWordRight',
  'deleteWordLeft',
  'deleteWordRight',
  'deleteToLineEnd',
  'deleteToLineStart',
  'deleteEntireLine',
];

export interface UseTextEditingActionsOptions {
  /**
   * Whether to enable listening for text editing actions
   * Default: true
   */
  enabled?: boolean;

  /**
   * Priority for handlers (higher = runs first)
   * Default: 10 (higher than most handlers since TextInput should handle text editing)
   */
  priority?: number;
}

/**
 * Subscribe to text editing actions from KeyboardEventBus
 *
 * @param operations - Object with callbacks for each text editing operation
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * useTextEditingActions({
 *   cursorToLineStart: () => moveCursor(0),
 *   cursorToLineEnd: () => moveCursor(value.length),
 *   deleteWordLeft: () => { ... },
 *   // ... other operations
 * });
 * ```
 */
export function useTextEditingActions(
  operations: Partial<TextEditingOperations>,
  options: UseTextEditingActionsOptions = {}
): void {
  const { eventBus } = useKeyboard();
  const { enabled = true, priority = 10 } = options;

  // Store operations in ref to avoid recreating subscriptions
  const operationsRef = useRef(operations);
  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  useEffect(() => {
    if (!enabled || !eventBus) return;

    const unsubscribers: Array<() => void> = [];

    // Subscribe to each text editing action
    for (const action of TEXT_EDITING_ACTIONS) {
      const handler = (event: KeyboardEvent) => {
        const operation = operationsRef.current[action as keyof TextEditingOperations];
        if (operation) {
          operation();
          event.stopPropagation();
          return true;
        }
        return false;
      };

      const unsubscribe = eventBus.subscribe(action, handler, {
        priority,
        id: `text-editing-${action}`,
      });
      unsubscribers.push(unsubscribe);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [eventBus, enabled, priority]);
}

/**
 * Helper to create text editing operations from value/cursor state
 *
 * @param value - Current text value
 * @param cursorOffset - Current cursor position
 * @param onChange - Callback when value changes
 * @param onCursorChange - Callback when cursor position changes
 */
export function createTextEditingOperations(
  value: string,
  cursorOffset: number,
  onChange: (value: string) => void,
  onCursorChange: (offset: number) => void
): TextEditingOperations {
  // Word boundary helpers
  const findWordBoundaryLeft = (text: string, cursor: number): number => {
    if (cursor <= 0) return 0;
    let pos = cursor - 1;
    while (pos > 0 && /\s/.test(text[pos]!)) pos--;
    while (pos > 0 && !/\s/.test(text[pos - 1]!)) pos--;
    return pos;
  };

  const findWordBoundaryRight = (text: string, cursor: number): number => {
    if (cursor >= text.length) return text.length;
    let pos = cursor;
    while (pos < text.length && !/\s/.test(text[pos]!)) pos++;
    while (pos < text.length && /\s/.test(text[pos]!)) pos++;
    return pos;
  };

  return {
    cursorToLineStart: () => {
      onCursorChange(0);
    },

    cursorToLineEnd: () => {
      onCursorChange(value.length);
    },

    cursorWordLeft: () => {
      onCursorChange(findWordBoundaryLeft(value, cursorOffset));
    },

    cursorWordRight: () => {
      onCursorChange(findWordBoundaryRight(value, cursorOffset));
    },

    deleteWordLeft: () => {
      const wordStart = findWordBoundaryLeft(value, cursorOffset);
      const newValue = value.slice(0, wordStart) + value.slice(cursorOffset);
      onChange(newValue);
      onCursorChange(wordStart);
    },

    deleteWordRight: () => {
      const wordEnd = findWordBoundaryRight(value, cursorOffset);
      const newValue = value.slice(0, cursorOffset) + value.slice(wordEnd);
      onChange(newValue);
      // Cursor stays in place
    },

    deleteToLineEnd: () => {
      const newValue = value.slice(0, cursorOffset);
      onChange(newValue);
      // Cursor stays at current position
    },

    deleteToLineStart: () => {
      const newValue = value.slice(cursorOffset);
      onChange(newValue);
      onCursorChange(0);
    },

    deleteEntireLine: () => {
      onChange('');
      onCursorChange(0);
    },
  };
}
