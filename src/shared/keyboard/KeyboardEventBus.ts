/**
 * Central keyboard event bus for dispatching keyboard actions
 * Supports event propagation control and priority-based handling
 */

import { EventEmitter } from 'events';
import { KeyBindingAction, KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import { logger } from '@/shared/utils/logger.js';

export interface KeyboardEventContext {
  /** Is autocomplete/tooltip currently showing? */
  isAutocompleteVisible: boolean;
  /** Is the agent currently running? */
  isAgentRunning: boolean;
  /** Is there text input currently focused? */
  isInputFocused: boolean;
  /** Custom context data */
  [key: string]: unknown;
}

export interface KeyboardEvent {
  /** The semantic action triggered */
  action: KeyBindingAction;
  /** Raw key that was pressed */
  rawKey: string;
  /** Current context when event was triggered */
  context: Readonly<KeyboardEventContext>;
  /** Stop propagation to parent handlers */
  stopPropagation(): void;
  /** Was propagation stopped? */
  isPropagationStopped(): boolean;
}

export interface KeyboardEventHandler {
  /** The action this handler responds to */
  action: KeyBindingAction;
  /** Handler function */
  handler: (event: KeyboardEvent) => void | boolean;
  /** Priority (higher = runs first). Default: 0 */
  priority?: number;
  /** Unique ID for this handler (for cleanup) */
  id: string;
}

/**
 * Central keyboard event bus
 * Manages keyboard event routing with priority and propagation control
 * Supports leader key sequences (e.g., Ctrl+X followed by 'n')
 */
export class KeyboardEventBus extends EventEmitter {
  private handlers: Map<KeyBindingAction, KeyboardEventHandler[]> = new Map();
  private context: KeyboardEventContext = {
    isAutocompleteVisible: false,
    isAgentRunning: false,
    isInputFocused: true,
  };

  // Leader key state
  private leaderKeyPressed: boolean = false;
  private leaderKeyTimeout: NodeJS.Timeout | null = null;

  constructor(private bindingsManager: KeyBindingsManager) {
    super();
    this.setMaxListeners(50); // Allow many components to subscribe
  }

  /**
   * Check if currently in leader key mode
   */
  isLeaderMode(): boolean {
    return this.leaderKeyPressed;
  }

  /**
   * Cancel leader key mode
   */
  private cancelLeaderMode(): void {
    this.leaderKeyPressed = false;
    if (this.leaderKeyTimeout) {
      clearTimeout(this.leaderKeyTimeout);
      this.leaderKeyTimeout = null;
    }
    this.emit('leaderCancelled');
  }

  /**
   * Enter leader key mode
   */
  private enterLeaderMode(): void {
    this.leaderKeyPressed = true;
    this.emit('leaderActivated');

    // Set timeout to auto-cancel
    const timeout = this.bindingsManager.getLeaderTimeout();
    this.leaderKeyTimeout = setTimeout(() => {
      logger.debug('Leader key timeout expired');
      this.cancelLeaderMode();
    }, timeout);
  }

  /**
   * Update keyboard context
   */
  updateContext(updates: Partial<KeyboardEventContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Get current context (readonly)
   */
  getContext(): Readonly<KeyboardEventContext> {
    return Object.freeze({ ...this.context });
  }

  /**
   * Check if an action is relevant in the current context
   * Used to filter out actions that shouldn't be intercepted right now
   */
  isActionRelevantInContext(action: KeyBindingAction): boolean {
    // Autocomplete-specific actions only when autocomplete is visible
    if (action === 'navigateUp' || action === 'navigateDown') {
      return this.context.isAutocompleteVisible;
    }

    // Tooltip/autocomplete trigger only when input is focused
    if (action === 'showTooltip') {
      return this.context.isInputFocused;
    }

    // Text editing actions only when input is focused
    const textEditingActions: KeyBindingAction[] = [
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
    if (textEditingActions.includes(action)) {
      return this.context.isInputFocused;
    }

    // Interrupt is always relevant (exit app when not running, interrupt agent when running)
    if (action === 'interrupt') {
      return true;
    }

    // Accept can be context-dependent (enter key)
    // When autocomplete is visible, it should accept autocomplete
    // When input is focused without autocomplete, it should submit
    // Both are valid uses of 'accept', so it's always relevant
    if (action === 'accept') {
      return true;
    }

    // All other actions are context-independent (global)
    // Examples: help, clearScreen, undo, redo, modeSwitch, etc.
    return true;
  }

  /**
   * Subscribe to keyboard action
   * Returns unsubscribe function
   */
  subscribe(
    action: KeyBindingAction,
    handler: (event: KeyboardEvent) => void | boolean,
    options: { priority?: number; id?: string } = {}
  ): () => void {
    const handlerObj: KeyboardEventHandler = {
      action,
      handler,
      priority: options.priority ?? 0,
      id: options.id ?? `${action}-${Date.now()}-${Math.random()}`,
    };

    const handlers = this.handlers.get(action) || [];
    handlers.push(handlerObj);

    // Sort by priority (descending)
    handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    this.handlers.set(action, handlers);

    logger.info('[KB-BUS] Handler subscribed', {
      action,
      handlerId: handlerObj.id,
      priority: handlerObj.priority,
      totalHandlers: handlers.length,
    });

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(action);
      if (handlers) {
        const index = handlers.findIndex((h) => h.id === handlerObj.id);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Dispatch a raw key press
   * Converts to action and emits to handlers
   * Handles leader key sequences
   */
  dispatch(rawKey: string): boolean {
    // Check if keybinds are globally disabled
    if (!this.bindingsManager.isEnabled()) {
      return false;
    }

    // Check if this is the leader key
    if (this.bindingsManager.isLeaderKey(rawKey)) {
      if (!this.leaderKeyPressed) {
        logger.debug(`Leader key pressed: ${rawKey}`);
        this.enterLeaderMode();
        return true;
      }
      // If leader key pressed again, cancel leader mode
      this.cancelLeaderMode();
      return true;
    }

    // If in leader mode, look up action for this key
    if (this.leaderKeyPressed) {
      const action = this.bindingsManager.getActionForKey(rawKey);

      // Cancel leader mode regardless of whether action found
      this.cancelLeaderMode();

      if (!action) {
        logger.debug(`No action found for key in leader mode: ${rawKey}`);
        return false;
      }

      logger.debug(
        `Leader sequence completed: ${this.bindingsManager.getLeaderKey()} + ${rawKey} → ${action}`
      );
      return this.dispatchAction(action, rawKey);
    }

    // Normal mode - direct key to action mapping
    const action = this.bindingsManager.getActionForKey(rawKey);

    if (!action) {
      return false;
    }

    return this.dispatchAction(action, rawKey);
  }

  /**
   * Dispatch a specific action
   * @returns true if event was handled, false otherwise
   */
  dispatchAction(action: KeyBindingAction, rawKey?: string): boolean {
    const handlers = this.handlers.get(action);

    logger.info('[KB-BUS] dispatchAction called', {
      action,
      rawKey,
      handlerCount: handlers?.length ?? 0,
    });

    if (!handlers || handlers.length === 0) {
      logger.info('[KB-BUS] No handlers registered for action', { action });
      return false;
    }

    let propagationStopped = false;

    const event: KeyboardEvent = {
      action,
      rawKey: rawKey ?? action,
      context: this.getContext(),
      stopPropagation: () => {
        propagationStopped = true;
      },
      isPropagationStopped: () => propagationStopped,
    };

    // Execute handlers in priority order
    for (const { handler, id, priority } of handlers) {
      if (propagationStopped) {
        logger.info('[KB-BUS] Propagation stopped, skipping remaining handlers');
        break;
      }

      logger.info('[KB-BUS] Calling handler', { action, handlerId: id, priority });

      try {
        const result = handler(event);
        logger.info('[KB-BUS] Handler result', { action, handlerId: id, result });

        // Handler can return false to continue, true to stop propagation
        if (result === false) {
          continue;
        } else if (result === true) {
          event.stopPropagation();
        }
      } catch (error) {
        logger.error(`Error in keyboard handler for ${action}`, {
          error,
          handlerId: id,
          priority,
        });
      }
    }

    return true;
  }

  /**
   * Remove all handlers for an action
   */
  clearAction(action: KeyBindingAction): void {
    this.handlers.delete(action);
  }

  /**
   * Remove all handlers
   */
  clearAll(): void {
    this.handlers.clear();
  }

  /**
   * Override EventEmitter's removeAllListeners to also clear our handlers
   */
  override removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    if (!event) {
      // If no specific event, clear all handlers
      this.clearAll();
    }
    return this;
  }

  /**
   * Get all registered actions
   */
  getRegisteredActions(): KeyBindingAction[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler count for action
   */
  getHandlerCount(action: KeyBindingAction): number {
    return this.handlers.get(action)?.length ?? 0;
  }
}
