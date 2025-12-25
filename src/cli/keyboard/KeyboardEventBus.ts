/**
 * Central keyboard event bus for dispatching keyboard actions
 * Supports event propagation control and priority-based handling
 */

import { EventEmitter } from 'events';
import { KeyBindingAction, KeyBindingsManager } from '../../utils/KeyBindings.js';
import { logger } from '../../utils/logger.js';

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
 */
export class KeyboardEventBus extends EventEmitter {
  private handlers: Map<KeyBindingAction, KeyboardEventHandler[]> = new Map();
  private context: KeyboardEventContext = {
    isAutocompleteVisible: false,
    isAgentRunning: false,
    isInputFocused: true,
  };

  constructor(private bindingsManager: KeyBindingsManager) {
    super();
    this.setMaxListeners(50); // Allow many components to subscribe
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
   */
  dispatch(rawKey: string): boolean {
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

    if (!handlers || handlers.length === 0) {
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
        break;
      }

      try {
        const result = handler(event);

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
