/**
 * React hook for subscribing to keyboard actions
 * Components use this to handle specific keyboard shortcuts
 */

import { useEffect, useRef } from 'react';
import { KeyBindingAction } from '@/shared/utils/KeyBindings.js';
import { KeyboardEvent } from './KeyboardEventBus.js';
import { useKeyboard } from './KeyboardContext.js';

export interface UseKeyboardActionOptions {
  /**
   * Priority for this handler (higher = runs first)
   * Use this for nested components where child should handle before parent
   * Default: 0
   */
  priority?: number;

  /**
   * Enable/disable this handler
   * Default: true
   */
  enabled?: boolean;

  /**
   * Unique ID for this handler (for debugging)
   * Default: auto-generated
   */
  id?: string;
}

/**
 * Subscribe to a keyboard action
 * Handler can return true to stop propagation to parent handlers
 *
 * @example
 * // Handle Escape in a tooltip (child component)
 * useKeyboardAction('reject', (event) => {
 *   if (!isTooltipVisible) return false; // Let parent handle it
 *   hideTooltip();
 *   return true; // Stop propagation - we handled it
 * }, { priority: 10 }); // Higher priority than parent
 *
 * // Handle Escape in main interface (parent component)
 * useKeyboardAction('reject', (event) => {
 *   showExitConfirmation();
 *   return true;
 * }, { priority: 0 });
 */
export function useKeyboardAction(
  action: KeyBindingAction,
  handler: (event: KeyboardEvent) => void | boolean,
  options: UseKeyboardActionOptions = {}
): void {
  const { eventBus } = useKeyboard();
  const { priority = 0, enabled = true, id } = options;

  // Use ref to avoid recreating handler on every render
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    // Wrap handler to use latest version from ref
    const wrappedHandler = (event: KeyboardEvent) => {
      return handlerRef.current(event);
    };

    const unsubscribe = eventBus.subscribe(action, wrappedHandler, {
      priority,
      id,
    });

    return unsubscribe;
  }, [eventBus, action, priority, enabled, id]);
}

/**
 * Subscribe to multiple keyboard actions with the same handler
 */
export function useKeyboardActions(
  actions: KeyBindingAction[],
  handler: (event: KeyboardEvent) => void | boolean,
  options: UseKeyboardActionOptions = {}
): void {
  const { eventBus } = useKeyboard();
  const { priority = 0, enabled = true } = options;

  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const wrappedHandler = (event: KeyboardEvent) => {
      return handlerRef.current(event);
    };

    const unsubscribers = actions.map((action) =>
      eventBus.subscribe(action, wrappedHandler, {
        priority,
        id: options.id ? `${options.id}-${action}` : undefined,
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [eventBus, actions.join(','), priority, enabled, options.id]);
}
