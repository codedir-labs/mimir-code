/**
 * Integration tests for KeyboardEventBus with leader key sequences
 * Tests event routing, propagation, priority handling, and context management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import { KeyboardEventBus } from '@/shared/keyboard/KeyboardEventBus.js';
import { KeyBindingsConfig } from '@/shared/config/schemas.js';

describe('KeyboardEventBus - Integration', () => {
  let manager: KeyBindingsManager;
  let eventBus: KeyboardEventBus;

  const baseConfig: KeyBindingsConfig = {
    leader: 'ctrl+X',
    leaderTimeout: 1000,
    enabled: true,
    interrupt: ['ctrl+C', 'escape'],
    accept: ['enter'],
    modeSwitch: ['shift+Tab'],
    editCommand: ['ctrl+E'],
    showTooltip: ['ctrl+Space', 'tab'],
    navigateUp: ['arrowup'],
    navigateDown: ['arrowdown'],
    help: ['?'],
    clearScreen: ['ctrl+L'],
    undo: ['ctrl+Z'],
    redo: ['ctrl+Y'],
    newSession: ['n'],
    listSessions: ['l'],
    resumeSession: ['r'],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new KeyBindingsManager(baseConfig);
    eventBus = new KeyboardEventBus(manager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Event propagation and priority', () => {
    it('should execute handlers in priority order (highest first)', () => {
      const executionOrder: number[] = [];

      eventBus.subscribe(
        'interrupt',
        () => {
          executionOrder.push(1);
        },
        { priority: 10 }
      );

      eventBus.subscribe(
        'interrupt',
        () => {
          executionOrder.push(2);
        },
        { priority: 50 }
      );

      eventBus.subscribe(
        'interrupt',
        () => {
          executionOrder.push(3);
        },
        { priority: 30 }
      );

      eventBus.dispatch('ctrl+C');

      // Should execute in order: priority 50 → 30 → 10
      expect(executionOrder).toEqual([2, 3, 1]);
    });

    it('should stop propagation when handler calls stopPropagation()', () => {
      const handler1Spy = vi.fn((event) => {
        event.stopPropagation();
      });
      const handler2Spy = vi.fn();
      const handler3Spy = vi.fn();

      eventBus.subscribe('interrupt', handler1Spy, { priority: 30 });
      eventBus.subscribe('interrupt', handler2Spy, { priority: 20 });
      eventBus.subscribe('interrupt', handler3Spy, { priority: 10 });

      eventBus.dispatch('ctrl+C');

      // Only first handler should run
      expect(handler1Spy).toHaveBeenCalledTimes(1);
      expect(handler2Spy).not.toHaveBeenCalled();
      expect(handler3Spy).not.toHaveBeenCalled();
    });

    it('should stop propagation when handler returns true', () => {
      const handler1Spy = vi.fn(() => true); // Return true to stop
      const handler2Spy = vi.fn();

      eventBus.subscribe('interrupt', handler1Spy, { priority: 20 });
      eventBus.subscribe('interrupt', handler2Spy, { priority: 10 });

      eventBus.dispatch('ctrl+C');

      expect(handler1Spy).toHaveBeenCalledTimes(1);
      expect(handler2Spy).not.toHaveBeenCalled();
    });

    it('should continue propagation when handler returns false', () => {
      const handler1Spy = vi.fn(() => false); // Return false to continue
      const handler2Spy = vi.fn(() => false);
      const handler3Spy = vi.fn();

      eventBus.subscribe('interrupt', handler1Spy, { priority: 30 });
      eventBus.subscribe('interrupt', handler2Spy, { priority: 20 });
      eventBus.subscribe('interrupt', handler3Spy, { priority: 10 });

      eventBus.dispatch('ctrl+C');

      // All handlers should run
      expect(handler1Spy).toHaveBeenCalledTimes(1);
      expect(handler2Spy).toHaveBeenCalledTimes(1);
      expect(handler3Spy).toHaveBeenCalledTimes(1);
    });

    it('should continue propagation when handler returns undefined', () => {
      const handler1Spy = vi.fn(); // Returns undefined
      const handler2Spy = vi.fn();

      eventBus.subscribe('interrupt', handler1Spy, { priority: 20 });
      eventBus.subscribe('interrupt', handler2Spy, { priority: 10 });

      eventBus.dispatch('ctrl+C');

      expect(handler1Spy).toHaveBeenCalledTimes(1);
      expect(handler2Spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Context management', () => {
    it('should provide current context to handlers', () => {
      let receivedContext: Record<string, unknown> | null = null;

      eventBus.subscribe('interrupt', (event) => {
        receivedContext = event.context;
      });

      eventBus.updateContext({
        isAutocompleteVisible: true,
        isAgentRunning: false,
        isInputFocused: true,
      });

      eventBus.dispatch('ctrl+C');

      expect(receivedContext).toEqual({
        isAutocompleteVisible: true,
        isAgentRunning: false,
        isInputFocused: true,
      });
    });

    it('should update context and reflect in subsequent dispatches', () => {
      const contexts: Record<string, unknown>[] = [];

      eventBus.subscribe('interrupt', (event) => {
        contexts.push({ ...event.context });
      });

      // First dispatch with initial context
      eventBus.dispatch('ctrl+C');

      // Update context
      eventBus.updateContext({ isAgentRunning: true });

      // Second dispatch with updated context
      eventBus.dispatch('ctrl+C');

      expect(contexts).toHaveLength(2);
      expect(contexts[0].isAgentRunning).toBe(false);
      expect(contexts[1].isAgentRunning).toBe(true);
    });

    it('should freeze context (immutable)', () => {
      let receivedContext: Record<string, unknown> | null = null;

      eventBus.subscribe('interrupt', (event) => {
        receivedContext = event.context;
      });

      eventBus.dispatch('ctrl+C');

      // Try to modify context
      expect(() => {
        receivedContext.isAgentRunning = true;
      }).toThrow();
    });

    it('should support custom context properties', () => {
      let receivedContext: Record<string, unknown> | null = null;

      eventBus.subscribe('interrupt', (event) => {
        receivedContext = event.context;
      });

      eventBus.updateContext({
        customProperty: 'custom value',
        customNumber: 42,
      });

      eventBus.dispatch('ctrl+C');

      expect(receivedContext.customProperty).toBe('custom value');
      expect(receivedContext.customNumber).toBe(42);
    });
  });

  describe('Multiple shortcuts for same action', () => {
    it('should trigger same action for ctrl+C and Escape', () => {
      const interruptSpy = vi.fn();

      eventBus.subscribe('interrupt', interruptSpy);

      // Dispatch both shortcuts
      eventBus.dispatch('ctrl+C');
      eventBus.dispatch('escape');

      expect(interruptSpy).toHaveBeenCalledTimes(2);
    });

    it('should trigger same action for ctrl+Space and Tab', () => {
      const showTooltipSpy = vi.fn();

      eventBus.subscribe('showTooltip', showTooltipSpy);

      // Dispatch both shortcuts
      eventBus.dispatch('ctrl+Space');
      eventBus.dispatch('tab');

      expect(showTooltipSpy).toHaveBeenCalledTimes(2);
    });

    it('should provide correct rawKey in event for each shortcut', () => {
      const rawKeys: string[] = [];

      eventBus.subscribe('interrupt', (event) => {
        rawKeys.push(event.rawKey);
      });

      eventBus.dispatch('ctrl+C');
      eventBus.dispatch('escape');

      expect(rawKeys).toEqual(['ctrl+C', 'escape']);
    });
  });

  describe('Subscribe and unsubscribe', () => {
    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe('interrupt', handler);

      expect(typeof unsubscribe).toBe('function');

      // Trigger before unsubscribe
      eventBus.dispatch('ctrl+C');
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Trigger after unsubscribe
      eventBus.dispatch('ctrl+C');
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should allow multiple subscriptions to same action', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.subscribe('interrupt', handler1);
      eventBus.subscribe('interrupt', handler2);
      eventBus.subscribe('interrupt', handler3);

      eventBus.dispatch('ctrl+C');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should only unsubscribe specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.subscribe('interrupt', handler1);
      const unsubscribe2 = eventBus.subscribe('interrupt', handler2);
      eventBus.subscribe('interrupt', handler3);

      // Unsubscribe handler2
      unsubscribe2();

      eventBus.dispatch('ctrl+C');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled(); // Unsubscribed
      expect(handler3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling in handlers', () => {
    it('should continue executing other handlers if one throws', () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.subscribe('interrupt', handler1, { priority: 30 });
      eventBus.subscribe('interrupt', handler2, { priority: 20 });
      eventBus.subscribe('interrupt', handler3, { priority: 10 });

      // Should not throw, should log error
      eventBus.dispatch('ctrl+C');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1); // Still called despite handler1 error
      expect(handler3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Leader key sequence integration', () => {
    it('should complete full leader sequence workflow', () => {
      const newSessionSpy = vi.fn();
      const leaderActivatedSpy = vi.fn();
      const leaderCancelledSpy = vi.fn();

      eventBus.subscribe('newSession', newSessionSpy);
      eventBus.on('leaderActivated', leaderActivatedSpy);
      eventBus.on('leaderCancelled', leaderCancelledSpy);

      // Press leader key
      const handled1 = eventBus.dispatch('ctrl+X');
      expect(handled1).toBe(true);
      expect(leaderActivatedSpy).toHaveBeenCalledTimes(1);
      expect(eventBus.isLeaderMode()).toBe(true);

      // Press action key
      const handled2 = eventBus.dispatch('n');
      expect(handled2).toBe(true);
      expect(newSessionSpy).toHaveBeenCalledTimes(1);
      expect(leaderCancelledSpy).toHaveBeenCalledTimes(1);
      expect(eventBus.isLeaderMode()).toBe(false);
    });

    it('should handle rapid leader sequences', () => {
      const newSessionSpy = vi.fn();
      const listSessionsSpy = vi.fn();

      eventBus.subscribe('newSession', newSessionSpy);
      eventBus.subscribe('listSessions', listSessionsSpy);

      // First sequence: ctrl+X → n
      eventBus.dispatch('ctrl+X');
      eventBus.dispatch('n');

      // Second sequence: ctrl+X → l
      eventBus.dispatch('ctrl+X');
      eventBus.dispatch('l');

      // Third sequence: ctrl+X → n
      eventBus.dispatch('ctrl+X');
      eventBus.dispatch('n');

      expect(newSessionSpy).toHaveBeenCalledTimes(2);
      expect(listSessionsSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle direct shortcuts while leader key is configured', () => {
      const interruptSpy = vi.fn();
      const acceptSpy = vi.fn();
      const undoSpy = vi.fn();

      eventBus.subscribe('interrupt', interruptSpy);
      eventBus.subscribe('accept', acceptSpy);
      eventBus.subscribe('undo', undoSpy);

      // Direct shortcuts should work without leader
      eventBus.dispatch('ctrl+C');
      eventBus.dispatch('enter');
      eventBus.dispatch('ctrl+Z');

      expect(interruptSpy).toHaveBeenCalledTimes(1);
      expect(acceptSpy).toHaveBeenCalledTimes(1);
      expect(undoSpy).toHaveBeenCalledTimes(1);

      // Leader mode should not be activated
      expect(eventBus.isLeaderMode()).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle unknown keys gracefully', () => {
      const handled = eventBus.dispatch('ctrl+K'); // Not bound to any action

      expect(handled).toBe(false);
    });

    it('should handle empty key gracefully', () => {
      const handled = eventBus.dispatch('');

      expect(handled).toBe(false);
    });

    it('should return correct handler count', () => {
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('accept', vi.fn());

      expect(eventBus.getHandlerCount('interrupt')).toBe(2);
      expect(eventBus.getHandlerCount('accept')).toBe(1);
      expect(eventBus.getHandlerCount('undo')).toBe(0);
    });

    it('should clear handlers for specific action', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('interrupt', handler1);
      eventBus.subscribe('interrupt', handler2);

      expect(eventBus.getHandlerCount('interrupt')).toBe(2);

      eventBus.clearAction('interrupt');

      expect(eventBus.getHandlerCount('interrupt')).toBe(0);

      // Should not trigger after clear
      eventBus.dispatch('ctrl+C');
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should clear all handlers', () => {
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('accept', vi.fn());
      eventBus.subscribe('undo', vi.fn());

      expect(eventBus.getRegisteredActions()).toHaveLength(3);

      eventBus.clearAll();

      expect(eventBus.getRegisteredActions()).toHaveLength(0);
    });
  });

  describe('Direct action dispatch', () => {
    it('should dispatch action directly without key lookup', () => {
      const interruptSpy = vi.fn();
      eventBus.subscribe('interrupt', interruptSpy);

      // Dispatch action directly
      const handled = eventBus.dispatchAction('interrupt', 'test-key');

      expect(handled).toBe(true);
      expect(interruptSpy).toHaveBeenCalledTimes(1);

      // Check rawKey in event
      expect(interruptSpy.mock.calls[0][0].rawKey).toBe('test-key');
    });

    it('should return false for action with no handlers', () => {
      const handled = eventBus.dispatchAction('undo');

      expect(handled).toBe(false);
    });
  });
});
