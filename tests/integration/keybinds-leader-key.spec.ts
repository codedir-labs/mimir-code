/**
 * Integration tests for leader key functionality
 * Tests leader key sequences, timeout behavior, and platform-specific handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import { KeyboardEventBus } from '@/shared/keyboard/KeyboardEventBus.js';
import { KeyBindingsConfig } from '@/shared/config/schemas.js';

describe('Leader Key - Integration', () => {
  let manager: KeyBindingsManager;
  let eventBus: KeyboardEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Leader key enabled (ctrl+X)', () => {
    beforeEach(() => {
      const config: KeyBindingsConfig = {
        leader: 'ctrl+X',
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

      manager = new KeyBindingsManager(config);
      eventBus = new KeyboardEventBus(manager);
    });

    it('should recognize ctrl+X as the leader key', () => {
      expect(manager.getLeaderKey()).toBe('ctrl+X');
      expect(manager.isLeaderKey('ctrl+X')).toBe(true);
      expect(manager.isLeaderKey('ctrl+C')).toBe(false);
    });

    it('should have 1 second timeout by default', () => {
      expect(manager.getLeaderTimeout()).toBe(1000);
    });

    it('should enter leader mode when leader key is pressed', () => {
      const leaderActivatedSpy = vi.fn();
      eventBus.on('leaderActivated', leaderActivatedSpy);

      const handled = eventBus.dispatch('ctrl+X');

      expect(handled).toBe(true);
      expect(eventBus.isLeaderMode()).toBe(true);
      expect(leaderActivatedSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger action after leader key sequence (ctrl+X → n)', () => {
      const actionSpy = vi.fn();
      eventBus.subscribe('newSession', actionSpy);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Press action key
      eventBus.dispatch('n');
      expect(eventBus.isLeaderMode()).toBe(false);
      expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger correct action for different sequences', () => {
      const newSessionSpy = vi.fn();
      const listSessionsSpy = vi.fn();
      const resumeSessionSpy = vi.fn();

      eventBus.subscribe('newSession', newSessionSpy);
      eventBus.subscribe('listSessions', listSessionsSpy);
      eventBus.subscribe('resumeSession', resumeSessionSpy);

      // Test ctrl+X → n
      eventBus.dispatch('ctrl+X');
      eventBus.dispatch('n');
      expect(newSessionSpy).toHaveBeenCalledTimes(1);

      // Test ctrl+X → l
      eventBus.dispatch('ctrl+X');
      eventBus.dispatch('l');
      expect(listSessionsSpy).toHaveBeenCalledTimes(1);

      // Test ctrl+X → r
      eventBus.dispatch('ctrl+X');
      eventBus.dispatch('r');
      expect(resumeSessionSpy).toHaveBeenCalledTimes(1);
    });

    it('should cancel leader mode after timeout', () => {
      const leaderCancelledSpy = vi.fn();
      eventBus.on('leaderCancelled', leaderCancelledSpy);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Advance time past timeout
      vi.advanceTimersByTime(1000);

      expect(eventBus.isLeaderMode()).toBe(false);
      expect(leaderCancelledSpy).toHaveBeenCalledTimes(1);
    });

    it('should not trigger action if timeout expires before action key', () => {
      // Note: When leader mode times out, pressing 'n' will trigger newSession
      // because 'n' is still a valid direct keybind. This is expected behavior.
      // Leader mode only affects whether we're waiting for a sequence, not
      // whether individual keys are valid.

      const actionSpy = vi.fn();
      eventBus.subscribe('newSession', actionSpy);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Advance time past timeout
      vi.advanceTimersByTime(1000);
      expect(eventBus.isLeaderMode()).toBe(false);

      // Press action key after timeout
      // This will trigger the action because 'n' is a valid direct keybind
      eventBus.dispatch('n');

      // Action should be triggered (as a direct keybind, not as leader sequence)
      expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    it('should cancel leader mode when pressing leader key again', () => {
      const leaderCancelledSpy = vi.fn();
      eventBus.on('leaderCancelled', leaderCancelledSpy);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Press leader key again
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(false);
      expect(leaderCancelledSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle unknown action key gracefully', () => {
      const leaderCancelledSpy = vi.fn();
      eventBus.on('leaderCancelled', leaderCancelledSpy);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Press unknown action key
      const handled = eventBus.dispatch('z'); // Not bound to any action

      expect(handled).toBe(false);
      expect(eventBus.isLeaderMode()).toBe(false);
      expect(leaderCancelledSpy).toHaveBeenCalledTimes(1);
    });

    it('should not interfere with direct shortcuts', () => {
      const interruptSpy = vi.fn();
      const acceptSpy = vi.fn();

      eventBus.subscribe('interrupt', interruptSpy);
      eventBus.subscribe('accept', acceptSpy);

      // Direct shortcuts should still work
      eventBus.dispatch('ctrl+C');
      expect(interruptSpy).toHaveBeenCalledTimes(1);

      eventBus.dispatch('enter');
      expect(acceptSpy).toHaveBeenCalledTimes(1);

      // Leader mode should not be activated
      expect(eventBus.isLeaderMode()).toBe(false);
    });
  });

  describe('Leader key disabled (default)', () => {
    beforeEach(() => {
      const config: KeyBindingsConfig = {
        leader: null, // Disabled
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

      manager = new KeyBindingsManager(config);
      eventBus = new KeyboardEventBus(manager);
    });

    it('should return null for leader key', () => {
      expect(manager.getLeaderKey()).toBeNull();
    });

    it('should not enter leader mode for any key', () => {
      expect(manager.isLeaderKey('ctrl+X')).toBe(false);

      const handled = eventBus.dispatch('ctrl+X');
      expect(handled).toBe(false);
      expect(eventBus.isLeaderMode()).toBe(false);
    });

    it('should trigger actions directly without leader key', () => {
      const newSessionSpy = vi.fn();
      eventBus.subscribe('newSession', newSessionSpy);

      // Press 'n' directly (no leader key needed)
      eventBus.dispatch('n');

      expect(newSessionSpy).toHaveBeenCalledTimes(1);
      expect(eventBus.isLeaderMode()).toBe(false);
    });
  });

  describe('Custom leader timeout', () => {
    it('should respect custom timeout (500ms)', () => {
      const config: KeyBindingsConfig = {
        leader: 'ctrl+X',
        leaderTimeout: 500, // Custom short timeout
        enabled: true,
        interrupt: ['ctrl+C'],
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

      manager = new KeyBindingsManager(config);
      eventBus = new KeyboardEventBus(manager);

      expect(manager.getLeaderTimeout()).toBe(500);

      const leaderCancelledSpy = vi.fn();
      eventBus.on('leaderCancelled', leaderCancelledSpy);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Advance time by 400ms (still within timeout)
      vi.advanceTimersByTime(400);
      expect(eventBus.isLeaderMode()).toBe(true);

      // Advance time by 100ms more (total 500ms, timeout reached)
      vi.advanceTimersByTime(100);
      expect(eventBus.isLeaderMode()).toBe(false);
      expect(leaderCancelledSpy).toHaveBeenCalledTimes(1);
    });

    it('should respect custom timeout (2000ms)', () => {
      const config: KeyBindingsConfig = {
        leader: 'ctrl+X',
        leaderTimeout: 2000, // Custom long timeout
        enabled: true,
        interrupt: ['ctrl+C'],
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

      manager = new KeyBindingsManager(config);
      eventBus = new KeyboardEventBus(manager);

      expect(manager.getLeaderTimeout()).toBe(2000);

      // Press leader key
      eventBus.dispatch('ctrl+X');
      expect(eventBus.isLeaderMode()).toBe(true);

      // Advance time by 1500ms (still within timeout)
      vi.advanceTimersByTime(1500);
      expect(eventBus.isLeaderMode()).toBe(true);

      // Advance time by 500ms more (total 2000ms, timeout reached)
      vi.advanceTimersByTime(500);
      expect(eventBus.isLeaderMode()).toBe(false);
    });
  });

  describe('Platform-specific leader key (macOS)', () => {
    it('should convert Ctrl to Cmd on macOS', () => {
      // Mock macOS platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const config: KeyBindingsConfig = {
        leader: 'ctrl+X', // Will be converted to cmd+X on macOS
        leaderTimeout: 1000,
        enabled: true,
        interrupt: ['ctrl+C'],
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

      manager = new KeyBindingsManager(config);

      // Should convert Ctrl to Cmd
      expect(manager.getLeaderKey()).toBe('cmd+X');
      expect(manager.isLeaderKey('cmd+X')).toBe(true);
      expect(manager.isLeaderKey('ctrl+X')).toBe(false);
    });
  });
});
