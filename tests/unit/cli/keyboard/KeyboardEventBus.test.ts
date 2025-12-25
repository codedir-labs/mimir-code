/**
 * Unit tests for KeyboardEventBus
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardEventBus } from '../../../../src/cli/keyboard/KeyboardEventBus.js';
import { KeyBindingsManager } from '../../../../src/utils/KeyBindings.js';
import { KeyBindingsConfig } from '../../../../src/config/schemas.js';
import { IFileSystem } from '../../../../src/platform/IFileSystem.js';
import { getPlatformKey } from '../../../helpers/platformHelpers.js';

describe('KeyboardEventBus', () => {
  let eventBus: KeyboardEventBus;
  let bindingsManager: KeyBindingsManager;
  let mockFs: IFileSystem;

  beforeEach(() => {
    // Create mock filesystem
    mockFs = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      glob: vi.fn(),
      copy: vi.fn(),
      remove: vi.fn(),
      ensureDir: vi.fn(),
      move: vi.fn(),
    } as unknown as IFileSystem;

    const config: KeyBindingsConfig = {
      interrupt: ['Ctrl+C', 'Escape'],
      accept: ['Enter'],
      reject: ['Escape'],
      modeSwitch: ['Shift+Tab'],
      editCommand: ['Ctrl+E'],
      showTooltip: ['Ctrl+Space', 'Tab'],
      navigateUp: ['ArrowUp'],
      navigateDown: ['ArrowDown'],
      help: ['?'],
      clearScreen: ['Ctrl+L'],
      undo: ['Ctrl+Z'],
      redo: ['Ctrl+Y'],
    };

    bindingsManager = new KeyBindingsManager(config, mockFs);
    eventBus = new KeyboardEventBus(bindingsManager);
  });

  describe('Context Management', () => {
    it('should initialize with default context', () => {
      const context = eventBus.getContext();

      expect(context.isAutocompleteVisible).toBe(false);
      expect(context.isAgentRunning).toBe(false);
      expect(context.isInputFocused).toBe(true);
    });

    it('should update context', () => {
      eventBus.updateContext({ isAutocompleteVisible: true });

      const context = eventBus.getContext();
      expect(context.isAutocompleteVisible).toBe(true);
      expect(context.isAgentRunning).toBe(false); // Other values unchanged
    });

    it('should return frozen context from getContext', () => {
      const context = eventBus.getContext();

      expect(() => {
        // @ts-expect-error - Testing immutability
        context.isAutocompleteVisible = true;
      }).toThrow();
    });
  });

  describe('Subscription', () => {
    it('should subscribe to action', () => {
      const handler = vi.fn();

      eventBus.subscribe('interrupt', handler);

      expect(eventBus.getHandlerCount('interrupt')).toBe(1);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.subscribe('interrupt', handler);
      expect(eventBus.getHandlerCount('interrupt')).toBe(1);

      unsubscribe();
      expect(eventBus.getHandlerCount('interrupt')).toBe(0);
    });

    it('should support multiple handlers for same action', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('interrupt', handler1);
      eventBus.subscribe('interrupt', handler2);

      expect(eventBus.getHandlerCount('interrupt')).toBe(2);
    });

    it('should sort handlers by priority (descending)', () => {
      const callOrder: number[] = [];

      eventBus.subscribe(
        'interrupt',
        () => {
          callOrder.push(1);
        },
        { priority: 0 }
      );
      eventBus.subscribe(
        'interrupt',
        () => {
          callOrder.push(2);
        },
        { priority: 10 }
      );
      eventBus.subscribe(
        'interrupt',
        () => {
          callOrder.push(3);
        },
        { priority: 5 }
      );

      eventBus.dispatchAction('interrupt');

      expect(callOrder).toEqual([2, 3, 1]); // Highest priority first
    });
  });

  describe('Event Dispatching', () => {
    it('should dispatch action to handlers', () => {
      const handler = vi.fn();
      const interruptKey = getPlatformKey('Ctrl+C');

      eventBus.subscribe('interrupt', handler);
      eventBus.dispatchAction('interrupt', interruptKey);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'interrupt',
          rawKey: interruptKey,
        })
      );
    });

    it('should include context in event', () => {
      eventBus.updateContext({ isAgentRunning: true });

      const handler = vi.fn();
      eventBus.subscribe('interrupt', handler);
      eventBus.dispatchAction('interrupt');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            isAgentRunning: true,
          }),
        })
      );
    });

    it('should return false if no action mapped for key', () => {
      const result = eventBus.dispatch('UnknownKey');

      expect(result).toBe(false);
    });

    it('should return false if no handlers registered', () => {
      const result = eventBus.dispatchAction('interrupt');

      expect(result).toBe(false);
    });

    it('should return true if handlers exist', () => {
      const handler = vi.fn();
      eventBus.subscribe('interrupt', handler);

      const result = eventBus.dispatchAction('interrupt');

      expect(result).toBe(true);
    });
  });

  describe('Event Propagation', () => {
    it('should stop propagation when handler returns true', () => {
      const handler1 = vi.fn(() => true); // Stop propagation
      const handler2 = vi.fn();

      eventBus.subscribe('interrupt', handler1, { priority: 10 });
      eventBus.subscribe('interrupt', handler2, { priority: 0 });

      eventBus.dispatchAction('interrupt');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled(); // Should not be called
    });

    it('should continue propagation when handler returns false', () => {
      const handler1 = vi.fn(() => false); // Continue
      const handler2 = vi.fn(() => false);
      const handler3 = vi.fn();

      eventBus.subscribe('interrupt', handler1, { priority: 10 });
      eventBus.subscribe('interrupt', handler2, { priority: 5 });
      eventBus.subscribe('interrupt', handler3, { priority: 0 });

      eventBus.dispatchAction('interrupt');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should stop propagation when event.stopPropagation() is called', () => {
      const handler1 = vi.fn((event) => {
        event.stopPropagation();
      });
      const handler2 = vi.fn();

      eventBus.subscribe('interrupt', handler1, { priority: 10 });
      eventBus.subscribe('interrupt', handler2, { priority: 0 });

      eventBus.dispatchAction('interrupt');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should catch handler errors and continue to next handler', () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = vi.fn();

      eventBus.subscribe('interrupt', handler1, { priority: 10 });
      eventBus.subscribe('interrupt', handler2, { priority: 0 });

      // Should not throw
      expect(() => eventBus.dispatchAction('interrupt')).not.toThrow();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled(); // Should still be called
    });
  });

  describe('Cleanup', () => {
    it('should clear all handlers for action', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('interrupt', handler1);
      eventBus.subscribe('interrupt', handler2);

      eventBus.clearAction('interrupt');

      expect(eventBus.getHandlerCount('interrupt')).toBe(0);
    });

    it('should clear all handlers for all actions', () => {
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('accept', vi.fn());
      eventBus.subscribe('reject', vi.fn());

      eventBus.clearAll();

      expect(eventBus.getHandlerCount('interrupt')).toBe(0);
      expect(eventBus.getHandlerCount('accept')).toBe(0);
      expect(eventBus.getHandlerCount('reject')).toBe(0);
    });
  });

  describe('Introspection', () => {
    it('should return registered actions', () => {
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('accept', vi.fn());

      const actions = eventBus.getRegisteredActions();

      expect(actions).toContain('interrupt');
      expect(actions).toContain('accept');
      expect(actions).toHaveLength(2);
    });

    it('should return handler count for action', () => {
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('interrupt', vi.fn());
      eventBus.subscribe('accept', vi.fn());

      expect(eventBus.getHandlerCount('interrupt')).toBe(2);
      expect(eventBus.getHandlerCount('accept')).toBe(1);
      expect(eventBus.getHandlerCount('reject')).toBe(0);
    });
  });

  describe('Integration with KeyBindingsManager', () => {
    it('should dispatch correct action from raw key', () => {
      const handler = vi.fn();
      eventBus.subscribe('interrupt', handler);

      const interruptKey = getPlatformKey('Ctrl+C');
      const result = eventBus.dispatch(interruptKey);

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('should handle multiple keys mapped to same action', () => {
      const handler = vi.fn();
      eventBus.subscribe('interrupt', handler);

      const interruptKey = getPlatformKey('Ctrl+C');

      // Both Ctrl+C (or Cmd+C on Mac) and Escape map to 'interrupt'
      eventBus.dispatch(interruptKey);
      eventBus.dispatch('Escape');

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
