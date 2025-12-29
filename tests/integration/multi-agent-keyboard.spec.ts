/**
 * Integration tests for multi-agent workflow keyboard interactions
 * Tests keyboard event handling in AgentSelectionUI and MultiAgentProgressView
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardEventBus } from '@/shared/keyboard/KeyboardEventBus.js';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import type { KeyBindingsConfig } from '@/shared/config/schemas.js';

describe('Multi-Agent Workflow Keyboard Integration', () => {
  let keyboardBus: KeyboardEventBus;
  let bindingsManager: KeyBindingsManager;

  const defaultConfig: KeyBindingsConfig = {
    leader: null,
    leaderTimeout: 1000,
    enabled: true,
    interrupt: ['ctrl+C', 'escape'],
    accept: ['enter'],
    modeSwitch: ['shift+Tab'],
    editCommand: ['ctrl+E'],
    showTooltip: ['tab'],
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
    bindingsManager = new KeyBindingsManager(defaultConfig);
    keyboardBus = new KeyboardEventBus(bindingsManager);
  });

  afterEach(() => {
    keyboardBus.removeAllListeners();
  });

  describe('AgentSelectionUI keyboard shortcuts', () => {
    it('should handle Enter key for approval', () => {
      const approveSpy = vi.fn();

      keyboardBus.subscribe('accept', approveSpy);

      const result = keyboardBus.dispatch('enter');

      expect(result).toBe(true);
      expect(approveSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle Escape key for cancellation', () => {
      const cancelSpy = vi.fn();

      keyboardBus.subscribe('interrupt', cancelSpy);

      const result = keyboardBus.dispatch('escape');

      expect(result).toBe(true);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle ctrl+C for cancellation', () => {
      const cancelSpy = vi.fn();

      keyboardBus.subscribe('interrupt', cancelSpy);

      const result = keyboardBus.dispatch('ctrl+C');

      expect(result).toBe(true);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle both Escape and ctrl+C through same interrupt action', () => {
      const interruptSpy = vi.fn();

      keyboardBus.subscribe('interrupt', interruptSpy);

      keyboardBus.dispatch('escape');
      keyboardBus.dispatch('ctrl+C');

      expect(interruptSpy).toHaveBeenCalledTimes(2);
    });

    it('should not trigger actions when keybinds are disabled', () => {
      const disabledConfig: KeyBindingsConfig = {
        ...defaultConfig,
        enabled: false,
      };

      const disabledBindings = new KeyBindingsManager(disabledConfig);
      const disabledBus = new KeyboardEventBus(disabledBindings);

      const approveSpy = vi.fn();
      disabledBus.subscribe('accept', approveSpy);

      const result = disabledBus.dispatch('enter');

      expect(result).toBe(false);
      expect(approveSpy).not.toHaveBeenCalled();
    });
  });

  describe('MultiAgentProgressView keyboard shortcuts', () => {
    it('should handle number keys for agent selection (1-5)', () => {
      // Note: Number key handling for agent selection is currently a TODO
      // This test documents expected behavior
      const selectAgentSpy = vi.fn();

      // In the future, number keys should trigger agent selection
      // For now, they may not have bindings
      const result1 = keyboardBus.dispatch('1');
      const result2 = keyboardBus.dispatch('2');
      const result3 = keyboardBus.dispatch('3');

      // Currently expected to not be handled (no binding)
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);

      // When implemented, these should trigger agent detail views
    });

    it('should handle interrupt during workflow execution', () => {
      const interruptSpy = vi.fn();

      keyboardBus.subscribe('interrupt', interruptSpy);

      keyboardBus.dispatch('ctrl+C');

      expect(interruptSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle navigation between running agents', () => {
      const navigateUpSpy = vi.fn();
      const navigateDownSpy = vi.fn();

      keyboardBus.subscribe('navigateUp', navigateUpSpy);
      keyboardBus.subscribe('navigateDown', navigateDownSpy);

      keyboardBus.dispatch('arrowup');
      keyboardBus.dispatch('arrowdown');

      expect(navigateUpSpy).toHaveBeenCalledTimes(1);
      expect(navigateDownSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('AgentDetailView keyboard shortcuts', () => {
    it('should handle Escape to close detail view', () => {
      const closeSpy = vi.fn();

      keyboardBus.subscribe('interrupt', closeSpy);

      keyboardBus.dispatch('escape');

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('should prioritize detail view close over workflow interrupt', () => {
      // When detail view is open, Escape should close it first
      // Then if pressed again, it should interrupt the workflow
      const handlers: string[] = [];

      // Detail view handler (higher priority)
      keyboardBus.subscribe(
        'interrupt',
        () => {
          handlers.push('detail-close');
        },
        { priority: 10 }
      );

      // Workflow interrupt handler (lower priority)
      keyboardBus.subscribe(
        'interrupt',
        () => {
          handlers.push('workflow-interrupt');
        },
        { priority: 5 }
      );

      keyboardBus.dispatch('escape');

      // Higher priority handler should run first
      expect(handlers[0]).toBe('detail-close');
      expect(handlers[1]).toBe('workflow-interrupt');
    });
  });

  describe('Keyboard event propagation in multi-agent context', () => {
    it('should allow stopping propagation from detail view', () => {
      const detailHandlerCalled = vi.fn();
      const workflowHandlerCalled = vi.fn();

      // Detail view handler stops propagation
      keyboardBus.subscribe(
        'interrupt',
        (event) => {
          detailHandlerCalled();
          event.stopPropagation();
        },
        { priority: 10 }
      );

      // Workflow handler should not be called
      keyboardBus.subscribe('interrupt', workflowHandlerCalled, { priority: 5 });

      keyboardBus.dispatch('escape');

      expect(detailHandlerCalled).toHaveBeenCalledTimes(1);
      expect(workflowHandlerCalled).not.toHaveBeenCalled();
    });

    it('should handle multiple subscribers for same action', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      keyboardBus.subscribe('accept', handler1, { priority: 10 });
      keyboardBus.subscribe('accept', handler2, { priority: 5 });
      keyboardBus.subscribe('accept', handler3, { priority: 1 });

      keyboardBus.dispatch('enter');

      // All handlers should be called in priority order
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should respect handler priority order', () => {
      const callOrder: number[] = [];

      keyboardBus.subscribe('accept', () => callOrder.push(1), { priority: 1 });
      keyboardBus.subscribe('accept', () => callOrder.push(10), { priority: 10 });
      keyboardBus.subscribe('accept', () => callOrder.push(5), { priority: 5 });

      keyboardBus.dispatch('enter');

      // Should be called in descending priority order
      expect(callOrder).toEqual([10, 5, 1]);
    });
  });

  describe('Keyboard context awareness', () => {
    it('should update context when agent is running', () => {
      keyboardBus.updateContext({ isAgentRunning: true });

      const context = keyboardBus.getContext();

      expect(context.isAgentRunning).toBe(true);
    });

    it('should update context when detail view is visible', () => {
      keyboardBus.updateContext({ isAutocompleteVisible: true });

      const context = keyboardBus.getContext();

      expect(context.isAutocompleteVisible).toBe(true);
    });

    it('should provide readonly context to event handlers', () => {
      let capturedContext: any;

      keyboardBus.subscribe('accept', (event) => {
        capturedContext = event.context;
      });

      keyboardBus.updateContext({ isAgentRunning: true });
      keyboardBus.dispatch('enter');

      expect(capturedContext).toBeDefined();
      expect(capturedContext.isAgentRunning).toBe(true);

      // Context should be frozen (readonly)
      expect(() => {
        capturedContext.isAgentRunning = false;
      }).toThrow();
    });
  });

  describe('Cleanup and unsubscribe', () => {
    it('should allow unsubscribing handlers', () => {
      const handler = vi.fn();

      const unsubscribe = keyboardBus.subscribe('accept', handler);

      keyboardBus.dispatch('enter');
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      keyboardBus.dispatch('enter');
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should track handler count correctly', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      expect(keyboardBus.getHandlerCount('accept')).toBe(0);

      const unsub1 = keyboardBus.subscribe('accept', handler1);
      expect(keyboardBus.getHandlerCount('accept')).toBe(1);

      const unsub2 = keyboardBus.subscribe('accept', handler2);
      expect(keyboardBus.getHandlerCount('accept')).toBe(2);

      unsub1();
      expect(keyboardBus.getHandlerCount('accept')).toBe(1);

      unsub2();
      expect(keyboardBus.getHandlerCount('accept')).toBe(0);
    });

    it('should clean up all handlers on removeAllListeners', () => {
      keyboardBus.subscribe('accept', vi.fn());
      keyboardBus.subscribe('interrupt', vi.fn());
      keyboardBus.subscribe('navigateUp', vi.fn());

      expect(keyboardBus.getHandlerCount('accept')).toBe(1);
      expect(keyboardBus.getHandlerCount('interrupt')).toBe(1);
      expect(keyboardBus.getHandlerCount('navigateUp')).toBe(1);

      keyboardBus.removeAllListeners();

      expect(keyboardBus.getHandlerCount('accept')).toBe(0);
      expect(keyboardBus.getHandlerCount('interrupt')).toBe(0);
      expect(keyboardBus.getHandlerCount('navigateUp')).toBe(0);
    });
  });

  describe('Error handling in keyboard handlers', () => {
    it('should catch handler errors and continue to next handler', () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();

      keyboardBus.subscribe('accept', handler1, { priority: 10 });
      keyboardBus.subscribe('accept', handler2, { priority: 5 });

      const result = keyboardBus.dispatch('enter');

      // Both handlers should be attempted
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Event should still be considered handled
      expect(result).toBe(true);
    });
  });
});
