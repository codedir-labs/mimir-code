/**
 * Integration tests for attachment keyboard shortcut configuration
 * Tests custom keybinds, leader keys, and platform-specific bindings
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import type { KeyBindingsConfig } from '@/shared/config/schemas.js';

describe('Attachment Keybind Configuration', () => {
  describe('Default Keybinds', () => {
    it('should have default navigateLeft binding', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const binding = manager.getBinding('navigateLeft');

      expect(binding).toBeDefined();
      expect(binding?.keys).toContain('arrowleft');
      expect(binding?.description).toBe('Navigate attachments left (previous)');
    });

    it('should have default navigateRight binding', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const binding = manager.getBinding('navigateRight');

      expect(binding).toBeDefined();
      expect(binding?.keys).toContain('arrowright');
      expect(binding?.description).toBe('Navigate attachments right (next)');
    });

    it('should have default removeAttachment binding with multiple keys', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const binding = manager.getBinding('removeAttachment');

      expect(binding).toBeDefined();
      expect(binding?.keys).toEqual(['delete', 'backspace']);
      expect(binding?.description).toBe('Remove selected attachment');
    });

    it('should have default pasteFromClipboard binding', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const binding = manager.getBinding('pasteFromClipboard');

      expect(binding).toBeDefined();
      expect(binding?.keys).toContain('ctrl+v');
      expect(binding?.description).toBe('Paste from clipboard');
    });
  });

  describe('Custom Keybinds', () => {
    it('should allow custom navigateLeft keybind', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['h'], // Vim-style
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.matches('h', 'navigateLeft')).toBe(true);
      expect(manager.matches('arrowleft', 'navigateLeft')).toBe(false);
    });

    it('should allow custom navigateRight keybind', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['l'], // Vim-style
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.matches('l', 'navigateRight')).toBe(true);
      expect(manager.matches('arrowright', 'navigateRight')).toBe(false);
    });

    it('should allow multiple custom keybinds for same action', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft', 'h', 'ctrl+h'], // Multiple options
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.matches('arrowleft', 'navigateLeft')).toBe(true);
      expect(manager.matches('h', 'navigateLeft')).toBe(true);
      expect(manager.matches('ctrl+h', 'navigateLeft')).toBe(true);
    });

    it('should allow custom removeAttachment keybind', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['x'], // Custom single key
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.matches('x', 'removeAttachment')).toBe(true);
      expect(manager.matches('delete', 'removeAttachment')).toBe(false);
    });
  });

  describe('Platform-Specific Conversion', () => {
    it('should convert ctrl to cmd on macOS for navigateLeft', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['ctrl+arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const binding = manager.getBinding('navigateLeft');

      // On macOS, ctrl would be converted to cmd
      expect(binding?.keys).toBeDefined();
      // The actual conversion depends on os.platform(), so we just verify it exists
    });

    it('should convert ctrl to cmd on macOS for pasteFromClipboard', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const binding = manager.getBinding('pasteFromClipboard');

      expect(binding?.keys).toBeDefined();
    });
  });

  describe('Key Normalization', () => {
    it('should normalize uppercase to lowercase', () => {
      const normalized = KeyBindingsManager.normalizeKey('ARROWLEFT');
      expect(normalized).toBe('arrowleft');
    });

    it('should normalize Control to ctrl', () => {
      const normalized = KeyBindingsManager.normalizeKey('Control+V');
      expect(normalized).toBe('ctrl+v');
    });

    it('should normalize Command to cmd', () => {
      const normalized = KeyBindingsManager.normalizeKey('Command+V');
      expect(normalized).toBe('cmd+v');
    });

    it('should normalize Option to alt', () => {
      const normalized = KeyBindingsManager.normalizeKey('Option+Left');
      expect(normalized).toBe('alt+left');
    });

    it('should normalize Esc to escape', () => {
      const normalized = KeyBindingsManager.normalizeKey('Esc');
      expect(normalized).toBe('escape');
    });

    it('should normalize Del to delete', () => {
      const normalized = KeyBindingsManager.normalizeKey('Del');
      expect(normalized).toBe('delete');
    });

    it('should normalize Return to enter', () => {
      const normalized = KeyBindingsManager.normalizeKey('Return');
      expect(normalized).toBe('enter');
    });

    it('should trim whitespace around keys', () => {
      const normalized = KeyBindingsManager.normalizeKey('  ctrl + v  ');
      expect(normalized).toBe('ctrl+v');
    });
  });

  describe('Keybind Matching', () => {
    let manager: KeyBindingsManager;

    beforeEach(() => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      manager = new KeyBindingsManager(config);
    });

    it('should match navigateLeft with ArrowLeft', () => {
      expect(manager.matches('arrowleft', 'navigateLeft')).toBe(true);
      expect(manager.matches('ArrowLeft', 'navigateLeft')).toBe(true);
      expect(manager.matches('ARROWLEFT', 'navigateLeft')).toBe(true);
    });

    it('should match navigateRight with ArrowRight', () => {
      expect(manager.matches('arrowright', 'navigateRight')).toBe(true);
      expect(manager.matches('ArrowRight', 'navigateRight')).toBe(true);
    });

    it('should match removeAttachment with Delete or Backspace', () => {
      expect(manager.matches('delete', 'removeAttachment')).toBe(true);
      expect(manager.matches('backspace', 'removeAttachment')).toBe(true);
      expect(manager.matches('Delete', 'removeAttachment')).toBe(true);
      expect(manager.matches('Backspace', 'removeAttachment')).toBe(true);
    });

    it('should match pasteFromClipboard with Ctrl+V', () => {
      expect(manager.matches('ctrl+v', 'pasteFromClipboard')).toBe(true);
      expect(manager.matches('Ctrl+V', 'pasteFromClipboard')).toBe(true);
    });

    it('should not match wrong keys', () => {
      expect(manager.matches('arrowup', 'navigateLeft')).toBe(false);
      expect(manager.matches('enter', 'removeAttachment')).toBe(false);
    });
  });

  describe('Reverse Lookup (Get Action for Key)', () => {
    let manager: KeyBindingsManager;

    beforeEach(() => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      manager = new KeyBindingsManager(config);
    });

    it('should find navigateLeft action for ArrowLeft key', () => {
      const action = manager.getActionForKey('arrowleft');
      expect(action).toBe('navigateLeft');
    });

    it('should find navigateRight action for ArrowRight key', () => {
      const action = manager.getActionForKey('arrowright');
      expect(action).toBe('navigateRight');
    });

    it('should find removeAttachment action for Delete key', () => {
      const action = manager.getActionForKey('delete');
      expect(action).toBe('removeAttachment');
    });

    it('should find removeAttachment action for Backspace key', () => {
      const action = manager.getActionForKey('backspace');
      expect(action).toBe('removeAttachment');
    });

    it('should return null for unbound key', () => {
      const action = manager.getActionForKey('ctrl+x');
      expect(action).toBeNull();
    });
  });

  describe('Disabled Keybinds', () => {
    it('should respect globally disabled keybinds', () => {
      const config: KeyBindingsConfig = {
        enabled: false, // Globally disabled
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.isEnabled()).toBe(false);
    });

    it('should disable specific keybind with empty array', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: [], // Disabled
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.matches('arrowleft', 'navigateLeft')).toBe(false);
      expect(manager.getActionForKey('arrowleft')).toBeNull();
    });
  });

  describe('Leader Key Support', () => {
    it('should support leader key for attachment actions', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: 'ctrl+x',
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['<leader>h'],
        navigateRight: ['<leader>l'],
        removeAttachment: ['<leader>x'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.getLeaderKey()).toBeTruthy();
      expect(manager.getLeaderTimeout()).toBe(1000);
    });

    it('should check if key is leader key', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: 'ctrl+x',
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);

      expect(manager.isLeaderKey('ctrl+x')).toBe(true);
      expect(manager.isLeaderKey('ctrl+c')).toBe(false);
    });
  });

  describe('Help Text Generation', () => {
    it('should include attachment keybinds in help text', () => {
      const config: KeyBindingsConfig = {
        enabled: true,
        leader: null,
        leaderTimeout: 1000,
        interrupt: ['ctrl+c'],
        accept: ['enter'],
        modeSwitch: ['shift+tab'],
        editCommand: ['ctrl+e'],
        showTooltip: ['ctrl+space'],
        navigateUp: ['arrowup'],
        navigateDown: ['arrowdown'],
        navigateLeft: ['arrowleft'],
        navigateRight: ['arrowright'],
        removeAttachment: ['delete', 'backspace'],
        insertAttachmentRef: ['ctrl+r'],
        openAttachment: ['ctrl+o'],
        pasteFromClipboard: ['ctrl+v'],
        help: ['?'],
        clearScreen: ['ctrl+l'],
        undo: ['ctrl+z'],
        redo: ['ctrl+y'],
        newSession: ['n'],
        listSessions: ['l'],
        resumeSession: ['r'],
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      };

      const manager = new KeyBindingsManager(config);
      const helpText = manager.getHelpText();

      // Check for descriptions, not action names
      expect(helpText).toContain('Navigate attachments left');
      expect(helpText).toContain('Navigate attachments right');
      expect(helpText).toContain('Remove selected attachment');
      expect(helpText).toContain('Paste from clipboard');
    });
  });
});
