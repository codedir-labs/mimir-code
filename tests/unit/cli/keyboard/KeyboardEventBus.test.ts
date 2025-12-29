/**
 * Unit tests for KeyboardEventBus
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardEventBus } from '@/shared/keyboard/KeyboardEventBus.js';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import { KeyBindingsConfig } from '@/shared/config/schemas.js';
import { IFileSystem } from '@codedir/mimir-agents';
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
      interrupt: ['ctrl+C', 'escape'],
      accept: ['enter'],
      reject: ['escape'],
      modeSwitch: ['shift+Tab'],
      editCommand: ['ctrl+E'],
      showTooltip: ['ctrl+Space', 'tab'],
      navigateUp: ['arrowup'],
      navigateDown: ['arrowdown'],
      help: ['?'],
      clearScreen: ['ctrl+L'],
      undo: ['ctrl+Z'],
      redo: ['ctrl+Y'],
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
      const interruptKey = getPlatformKey('ctrl+C');

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

      const interruptKey = getPlatformKey('ctrl+C');
      const result = eventBus.dispatch(interruptKey);

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('should handle multiple keys mapped to same action', () => {
      const handler = vi.fn();
      eventBus.subscribe('interrupt', handler);

      const interruptKey = getPlatformKey('ctrl+C');

      // Both ctrl+C (or cmd+C on Mac) and Escape map to 'interrupt'
      eventBus.dispatch(interruptKey);
      eventBus.dispatch('escape');

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Context-Aware Action Filtering', () => {
    describe('navigateUp/navigateDown', () => {
      it('should be relevant when autocomplete is visible', () => {
        eventBus.updateContext({ isAutocompleteVisible: true });

        expect(eventBus.isActionRelevantInContext('navigateUp')).toBe(true);
        expect(eventBus.isActionRelevantInContext('navigateDown')).toBe(true);
      });

      it('should NOT be relevant when autocomplete is hidden', () => {
        eventBus.updateContext({ isAutocompleteVisible: false });

        expect(eventBus.isActionRelevantInContext('navigateUp')).toBe(false);
        expect(eventBus.isActionRelevantInContext('navigateDown')).toBe(false);
      });
    });

    describe('showTooltip', () => {
      it('should be relevant when input is focused', () => {
        eventBus.updateContext({ isInputFocused: true });

        expect(eventBus.isActionRelevantInContext('showTooltip')).toBe(true);
      });

      it('should NOT be relevant when input is not focused', () => {
        eventBus.updateContext({ isInputFocused: false });

        expect(eventBus.isActionRelevantInContext('showTooltip')).toBe(false);
      });
    });

    describe('interrupt', () => {
      it('should be relevant when agent is running', () => {
        eventBus.updateContext({ isAgentRunning: true });

        expect(eventBus.isActionRelevantInContext('interrupt')).toBe(true);
      });

      it('should NOT be relevant when agent is not running', () => {
        eventBus.updateContext({ isAgentRunning: false });

        expect(eventBus.isActionRelevantInContext('interrupt')).toBe(false);
      });
    });

    describe('accept', () => {
      it('should always be relevant (context-independent)', () => {
        // Test different contexts
        eventBus.updateContext({ isAutocompleteVisible: true });
        expect(eventBus.isActionRelevantInContext('accept')).toBe(true);

        eventBus.updateContext({ isAutocompleteVisible: false });
        expect(eventBus.isActionRelevantInContext('accept')).toBe(true);
      });
    });

    describe('global actions', () => {
      it('should always be relevant for help, clearScreen, undo, redo', () => {
        // Test different contexts
        eventBus.updateContext({
          isAutocompleteVisible: false,
          isAgentRunning: false,
          isInputFocused: false,
        });

        expect(eventBus.isActionRelevantInContext('help')).toBe(true);
        expect(eventBus.isActionRelevantInContext('clearScreen')).toBe(true);
        expect(eventBus.isActionRelevantInContext('undo')).toBe(true);
        expect(eventBus.isActionRelevantInContext('redo')).toBe(true);
      });
    });
  });
});
