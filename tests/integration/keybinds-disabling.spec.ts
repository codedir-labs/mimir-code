/**
 * Integration tests for disabling keybinds
 * Tests individual keybind disabling and global disable functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import { KeyboardEventBus } from '@/shared/keyboard/KeyboardEventBus.js';
import { KeyBindingsConfig } from '@/shared/config/schemas.js';

describe('Keybind Disabling - Integration', () => {
  describe('Individual keybind disabling (set to empty array)', () => {
    let manager: KeyBindingsManager;
    let eventBus: KeyboardEventBus;

    beforeEach(() => {
      const config: KeyBindingsConfig = {
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
        // Disable these shortcuts by setting to empty array
        help: [],
        clearScreen: [],
        undo: [],
        redo: [],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
      };

      manager = new KeyBindingsManager(config);
      eventBus = new KeyboardEventBus(manager);
    });

    it('should not trigger disabled keybinds', () => {
      const helpSpy = vi.fn();
      const clearScreenSpy = vi.fn();
      const undoSpy = vi.fn();
      const redoSpy = vi.fn();

      eventBus.subscribe('help', helpSpy);
      eventBus.subscribe('clearScreen', clearScreenSpy);
      eventBus.subscribe('undo', undoSpy);
      eventBus.subscribe('redo', redoSpy);

      // Try to trigger disabled shortcuts
      eventBus.dispatch('?');
      eventBus.dispatch('ctrl+L');
      eventBus.dispatch('ctrl+Z');
      eventBus.dispatch('ctrl+Y');

      // None should be triggered
      expect(helpSpy).not.toHaveBeenCalled();
      expect(clearScreenSpy).not.toHaveBeenCalled();
      expect(undoSpy).not.toHaveBeenCalled();
      expect(redoSpy).not.toHaveBeenCalled();
    });

    it('should still trigger enabled keybinds', () => {
      const interruptSpy = vi.fn();
      const acceptSpy = vi.fn();
      const newSessionSpy = vi.fn();

      eventBus.subscribe('interrupt', interruptSpy);
      eventBus.subscribe('accept', acceptSpy);
      eventBus.subscribe('newSession', newSessionSpy);

      // Trigger enabled shortcuts
      eventBus.dispatch('ctrl+C');
      eventBus.dispatch('enter');
      eventBus.dispatch('n');

      expect(interruptSpy).toHaveBeenCalledTimes(1);
      expect(acceptSpy).toHaveBeenCalledTimes(1);
      expect(newSessionSpy).toHaveBeenCalledTimes(1);
    });

    it('should have no binding for disabled keybind', () => {
      const helpBinding = manager.getBinding('help');
      const clearScreenBinding = manager.getBinding('clearScreen');

      // Bindings exist but have empty keys
      expect(helpBinding).toBeDefined();
      expect(helpBinding?.keys).toEqual([]);

      expect(clearScreenBinding).toBeDefined();
      expect(clearScreenBinding?.keys).toEqual([]);
    });

    it('should not return disabled keybinds in action lookup', () => {
      const helpAction = manager.getActionForKey('?');
      const clearScreenAction = manager.getActionForKey('ctrl+L');
      const undoAction = manager.getActionForKey('ctrl+Z');

      expect(helpAction).toBeNull();
      expect(clearScreenAction).toBeNull();
      expect(undoAction).toBeNull();
    });
  });

  describe('Global keybind disabling (enabled: false)', () => {
    let manager: KeyBindingsManager;
    let eventBus: KeyboardEventBus;

    beforeEach(() => {
      const config: KeyBindingsConfig = {
        leader: null,
        leaderTimeout: 1000,
        enabled: false, // Disable ALL keybinds
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

    it('should report keybinds as globally disabled', () => {
      expect(manager.isEnabled()).toBe(false);
    });

    it('should not dispatch any keybinds', () => {
      const interruptSpy = vi.fn();
      const acceptSpy = vi.fn();
      const helpSpy = vi.fn();
      const undoSpy = vi.fn();

      eventBus.subscribe('interrupt', interruptSpy);
      eventBus.subscribe('accept', acceptSpy);
      eventBus.subscribe('help', helpSpy);
      eventBus.subscribe('undo', undoSpy);

      // Try to trigger any shortcut
      const handled1 = eventBus.dispatch('ctrl+C');
      const handled2 = eventBus.dispatch('enter');
      const handled3 = eventBus.dispatch('?');
      const handled4 = eventBus.dispatch('ctrl+Z');

      // None should be dispatched
      expect(handled1).toBe(false);
      expect(handled2).toBe(false);
      expect(handled3).toBe(false);
      expect(handled4).toBe(false);

      expect(interruptSpy).not.toHaveBeenCalled();
      expect(acceptSpy).not.toHaveBeenCalled();
      expect(helpSpy).not.toHaveBeenCalled();
      expect(undoSpy).not.toHaveBeenCalled();
    });

    it('should not enter leader mode even if leader key is configured', () => {
      const configWithLeader: KeyBindingsConfig = {
        leader: 'ctrl+X', // Leader key configured
        leaderTimeout: 1000,
        enabled: false, // But globally disabled
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

      const managerWithLeader = new KeyBindingsManager(configWithLeader);
      const eventBusWithLeader = new KeyboardEventBus(managerWithLeader);

      // Try to activate leader mode
      const handled = eventBusWithLeader.dispatch('ctrl+X');

      expect(handled).toBe(false);
      expect(eventBusWithLeader.isLeaderMode()).toBe(false);
    });

    it('should still allow subscribing to actions (handlers registered but never called)', () => {
      const interruptSpy = vi.fn();
      const unsubscribe = eventBus.subscribe('interrupt', interruptSpy);

      expect(typeof unsubscribe).toBe('function');

      // Try to trigger
      eventBus.dispatch('ctrl+C');
      expect(interruptSpy).not.toHaveBeenCalled();

      // Cleanup
      unsubscribe();
    });
  });

  describe('Mixed enabled/disabled keybinds', () => {
    let manager: KeyBindingsManager;
    let eventBus: KeyboardEventBus;

    beforeEach(() => {
      const config: KeyBindingsConfig = {
        leader: null,
        leaderTimeout: 1000,
        enabled: true, // Globally enabled
        // Mix of enabled and disabled
        interrupt: ['ctrl+C', 'escape'],
        accept: ['enter'],
        modeSwitch: [], // Disabled
        editCommand: ['ctrl+E'],
        showTooltip: [], // Disabled
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        help: ['?'],
        clearScreen: [], // Disabled
        undo: ['ctrl+Z'],
        redo: [], // Disabled
        newSession: ['n'],
        listSessions: [], // Disabled
        resumeSession: ['r'],
      };

      manager = new KeyBindingsManager(config);
      eventBus = new KeyboardEventBus(manager);
    });

    it('should only trigger enabled keybinds', () => {
      const interruptSpy = vi.fn();
      const acceptSpy = vi.fn();
      const modeSwitchSpy = vi.fn();
      const showTooltipSpy = vi.fn();
      const clearScreenSpy = vi.fn();
      const redoSpy = vi.fn();
      const listSessionsSpy = vi.fn();

      eventBus.subscribe('interrupt', interruptSpy);
      eventBus.subscribe('accept', acceptSpy);
      eventBus.subscribe('modeSwitch', modeSwitchSpy);
      eventBus.subscribe('showTooltip', showTooltipSpy);
      eventBus.subscribe('clearScreen', clearScreenSpy);
      eventBus.subscribe('redo', redoSpy);
      eventBus.subscribe('listSessions', listSessionsSpy);

      // Trigger both enabled and disabled
      eventBus.dispatch('ctrl+C'); // Enabled
      eventBus.dispatch('enter'); // Enabled
      eventBus.dispatch('shift+Tab'); // Disabled
      eventBus.dispatch('tab'); // Disabled
      eventBus.dispatch('ctrl+L'); // Disabled
      eventBus.dispatch('ctrl+Y'); // Disabled
      eventBus.dispatch('l'); // Disabled

      // Only enabled should be triggered
      expect(interruptSpy).toHaveBeenCalledTimes(1);
      expect(acceptSpy).toHaveBeenCalledTimes(1);

      // Disabled should not be triggered
      expect(modeSwitchSpy).not.toHaveBeenCalled();
      expect(showTooltipSpy).not.toHaveBeenCalled();
      expect(clearScreenSpy).not.toHaveBeenCalled();
      expect(redoSpy).not.toHaveBeenCalled();
      expect(listSessionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('Config validation with "none" string', () => {
    it('should convert "none" to empty array', async () => {
      // This tests the schema transformation
      const { KeyBindingsConfigSchema } = await import('@/shared/config/schemas.js');

      const rawConfig = {
        leader: 'none',
        leaderTimeout: 1000,
        enabled: true,
        interrupt: 'ctrl+C',
        accept: 'enter',
        modeSwitch: 'shift+Tab',
        editCommand: 'ctrl+E',
        showTooltip: 'tab',
        navigateUp: 'arrowup',
        navigateDown: 'arrowdown',
        help: 'none', // Set to "none"
        clearScreen: 'none', // Set to "none"
        undo: 'ctrl+Z',
        redo: 'ctrl+Y',
        newSession: 'n',
        listSessions: 'l',
        resumeSession: 'r',
      };

      const parsed = KeyBindingsConfigSchema.parse(rawConfig);

      // "none" should be converted to empty array for shortcuts
      expect(parsed.help).toEqual([]);
      expect(parsed.clearScreen).toEqual([]);

      // "none" should be converted to null for leader
      expect(parsed.leader).toBeNull();

      // Other shortcuts should be arrays
      expect(parsed.interrupt).toEqual(['ctrl+C']);
      expect(parsed.accept).toEqual(['enter']);
    });
  });

  describe('Re-enabling keybinds after disabling', () => {
    it('should work when changing config', () => {
      // Start with disabled
      const config1: KeyBindingsConfig = {
        leader: null,
        leaderTimeout: 1000,
        enabled: false,
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

      let manager = new KeyBindingsManager(config1);
      let eventBus = new KeyboardEventBus(manager);

      expect(manager.isEnabled()).toBe(false);

      // Create new config with enabled
      const config2: KeyBindingsConfig = {
        ...config1,
        enabled: true,
      };

      manager = new KeyBindingsManager(config2);
      eventBus = new KeyboardEventBus(manager);

      expect(manager.isEnabled()).toBe(true);

      // Should now work
      const interruptSpy = vi.fn();
      eventBus.subscribe('interrupt', interruptSpy);

      eventBus.dispatch('ctrl+C');
      expect(interruptSpy).toHaveBeenCalledTimes(1);
    });
  });
});
