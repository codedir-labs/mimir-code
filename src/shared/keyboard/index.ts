/**
 * Centralized keyboard handling system
 * Provides event-driven keyboard shortcuts with hierarchical propagation
 */

export { KeyboardEventBus } from './KeyboardEventBus.js';
export type {
  KeyboardEvent,
  KeyboardEventContext,
  KeyboardEventHandler,
} from './KeyboardEventBus.js';

export { KeyboardProvider, useKeyboard, useShortcutKeys } from './KeyboardContext.js';
export type { KeyboardProviderProps } from './KeyboardContext.js';

export { useKeyboardAction, useKeyboardActions } from './useKeyboardAction.js';
export type { UseKeyboardActionOptions } from './useKeyboardAction.js';

export { useKeyboardInput } from './useKeyboardInput.js';
export type { UseKeyboardInputOptions } from './useKeyboardInput.js';

export { useTextEditingActions, createTextEditingOperations } from './useTextEditingActions.js';
export type {
  TextEditingOperations,
  UseTextEditingActionsOptions,
} from './useTextEditingActions.js';

// Raw key detection for terminal-specific key handling
export {
  RawKeyMapper,
  getRawKeyMapper,
  processRawKey,
  getLastRawKey,
  clearLastRawKey,
} from './RawKeyMapper.js';
export type { RawKeyResult } from './RawKeyMapper.js';
