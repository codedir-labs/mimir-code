/**
 * Keyboard shortcuts with platform-specific bindings
 * Loads from .mimir/config.yml
 */

import { KeyBindingsConfig } from '@/shared/config/schemas.js';
import { logger } from './logger.js';
import os from 'os';

export interface KeyBinding {
  keys: string[]; // Now supports multiple shortcuts per action
  displayName: string; // Primary key for display
  action: string;
  description: string;
}

export type KeyBindingAction =
  | 'interrupt' // Ctrl+C and Escape - cancel/interrupt operation
  | 'accept' // Enter - confirm action
  | 'modeSwitch' // Shift+Tab - switch modes
  | 'editCommand' // Ctrl+E - edit instruction
  | 'showTooltip' // Ctrl+Space and Tab - show autocomplete
  | 'navigateUp' // Arrow Up - navigate up in lists
  | 'navigateDown' // Arrow Down - navigate down in lists
  | 'navigateLeft' // Arrow Left - navigate attachments left
  | 'navigateRight' // Arrow Right - navigate attachments right
  | 'removeAttachment' // Delete/Backspace - remove selected attachment
  | 'pasteFromClipboard' // Ctrl+V - manual paste trigger
  | 'help' // ? - show help
  | 'clearScreen' // Ctrl+L - clear screen
  | 'undo' // Ctrl+Z - undo
  | 'redo' // Ctrl+Y (Cmd+Shift+Z on Mac) - redo
  | 'newSession' // n (with leader) - create new session
  | 'listSessions' // l (with leader) - list sessions
  | 'resumeSession' // r (with leader) - resume session
  // Text editing actions (configurable for vim-like bindings)
  | 'cursorToLineStart' // Move cursor to start of line (Home, Ctrl+A)
  | 'cursorToLineEnd' // Move cursor to end of line (End, Ctrl+E)
  | 'cursorWordLeft' // Move cursor one word left (Ctrl+Left, Alt+B)
  | 'cursorWordRight' // Move cursor one word right (Ctrl+Right, Alt+F)
  | 'deleteWordLeft' // Delete word before cursor (Ctrl+W, Ctrl+Backspace)
  | 'deleteWordRight' // Delete word after cursor (Ctrl+Delete, Alt+D)
  | 'deleteToLineEnd' // Delete from cursor to end of line (Ctrl+K)
  | 'deleteToLineStart' // Delete from cursor to start of line (Ctrl+U)
  | 'deleteEntireLine'; // Delete entire line (Ctrl+U alternative)

export class KeyBindingsManager {
  private bindings: Map<KeyBindingAction, KeyBinding> = new Map();
  private platform: 'darwin' | 'win32' | 'linux';
  private leaderKey: string | null;
  private leaderTimeout: number;
  private enabled: boolean;

  constructor(private config: KeyBindingsConfig) {
    this.platform = os.platform() as 'darwin' | 'win32' | 'linux';
    this.leaderKey = config.leader ?? null;
    this.leaderTimeout = config.leaderTimeout ?? 1000;
    this.enabled = config.enabled ?? true;
    this.initializeDefaults();
  }

  /**
   * Check if keybinds are globally enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get leader key configuration
   */
  getLeaderKey(): string | null {
    if (!this.leaderKey) return null;
    const isMac = this.platform === 'darwin';
    const modKey = isMac ? 'cmd' : 'ctrl';
    return this.leaderKey.replace(/ctrl/gi, modKey);
  }

  /**
   * Get leader key timeout in milliseconds
   */
  getLeaderTimeout(): number {
    return this.leaderTimeout;
  }

  /**
   * Check if a key is the leader key
   */
  isLeaderKey(key: string): boolean {
    if (!this.leaderKey) return false;
    const normalizedLeader = KeyBindingsManager.normalizeKey(this.getLeaderKey() ?? '');
    const normalizedKey = KeyBindingsManager.normalizeKey(key);
    return normalizedLeader === normalizedKey;
  }

  /**
   * Initialize default platform-specific bindings
   */
  private initializeDefaults(): void {
    const isMac = this.platform === 'darwin';
    const modKey = isMac ? 'Cmd' : 'Ctrl';
    const leaderKey = this.getLeaderKey(); // Get platform-specific leader key

    // Helper to convert config keys to platform-specific and replace <leader> placeholder
    const toPlatform = (keys: string[]): string[] => {
      return keys.map((key) => {
        // Replace <leader> placeholder with actual leader key
        if (key.includes('<leader>') && leaderKey) {
          return key.replace(/<leader>/gi, leaderKey);
        }
        // Convert ctrl to platform-specific modifier (cmd on macOS)
        return key.replace(/ctrl/gi, modKey.toLowerCase());
      });
    };

    // Helper to safely get first key or fallback
    const getDisplayName = (keys: string[] | undefined, fallback: string): string => {
      return keys?.[0] ?? fallback;
    };

    // Core bindings from config
    const interruptKeys = toPlatform(this.config.interrupt ?? []);
    this.addBinding('interrupt', {
      keys: interruptKeys,
      displayName: getDisplayName(interruptKeys, 'Ctrl+C'),
      action: 'interrupt',
      description: 'Cancel/interrupt current operation',
    });

    this.addBinding('accept', {
      keys: this.config.accept ?? [],
      displayName: getDisplayName(this.config.accept, 'Enter'),
      action: 'accept',
      description: 'Accept/confirm action',
    });

    this.addBinding('modeSwitch', {
      keys: this.config.modeSwitch ?? [],
      displayName: getDisplayName(this.config.modeSwitch, 'Shift+Tab'),
      action: 'modeSwitch',
      description: 'Switch between modes',
    });

    const editCommandKeys = toPlatform(this.config.editCommand ?? []);
    this.addBinding('editCommand', {
      keys: editCommandKeys,
      displayName: getDisplayName(editCommandKeys, `${modKey}+E`),
      action: 'editCommand',
      description: 'Edit alternative instruction',
    });

    const showTooltipKeys = toPlatform(this.config.showTooltip ?? []);
    this.addBinding('showTooltip', {
      keys: showTooltipKeys,
      displayName: getDisplayName(showTooltipKeys, `${modKey}+Space`),
      action: 'showTooltip',
      description: 'Show autocomplete/tooltip',
    });

    this.addBinding('navigateUp', {
      keys: this.config.navigateUp ?? [],
      displayName: getDisplayName(this.config.navigateUp, 'ArrowUp'),
      action: 'navigateUp',
      description: 'Navigate up in list',
    });

    this.addBinding('navigateDown', {
      keys: this.config.navigateDown ?? [],
      displayName: getDisplayName(this.config.navigateDown, 'ArrowDown'),
      action: 'navigateDown',
      description: 'Navigate down in list',
    });

    this.addBinding('navigateLeft', {
      keys: this.config.navigateLeft ?? [],
      displayName: getDisplayName(this.config.navigateLeft, 'ArrowLeft'),
      action: 'navigateLeft',
      description: 'Navigate attachments left',
    });

    this.addBinding('navigateRight', {
      keys: this.config.navigateRight ?? [],
      displayName: getDisplayName(this.config.navigateRight, 'ArrowRight'),
      action: 'navigateRight',
      description: 'Navigate attachments right',
    });

    this.addBinding('removeAttachment', {
      keys: this.config.removeAttachment ?? [],
      displayName: getDisplayName(this.config.removeAttachment, 'Delete'),
      action: 'removeAttachment',
      description: 'Remove selected attachment',
    });

    const pasteFromClipboardKeys = toPlatform(this.config.pasteFromClipboard ?? []);
    this.addBinding('pasteFromClipboard', {
      keys: pasteFromClipboardKeys,
      displayName: getDisplayName(pasteFromClipboardKeys, `${modKey}+V`),
      action: 'pasteFromClipboard',
      description: 'Paste from clipboard',
    });

    this.addBinding('help', {
      keys: this.config.help ?? [],
      displayName: getDisplayName(this.config.help, '?'),
      action: 'help',
      description: 'Show help overlay',
    });

    const clearScreenKeys = toPlatform(this.config.clearScreen ?? []);
    this.addBinding('clearScreen', {
      keys: clearScreenKeys,
      displayName: getDisplayName(clearScreenKeys, `${modKey}+L`),
      action: 'clearScreen',
      description: 'Clear screen',
    });

    const undoKeys = toPlatform(this.config.undo ?? []);
    this.addBinding('undo', {
      keys: undoKeys,
      displayName: getDisplayName(undoKeys, `${modKey}+Z`),
      action: 'undo',
      description: 'Undo last action',
    });

    // Redo has platform-specific default
    const redoKeys = isMac ? [`${modKey}+Shift+Z`] : toPlatform(this.config.redo ?? []);

    this.addBinding('redo', {
      keys: redoKeys,
      displayName: getDisplayName(redoKeys, `${modKey}+Y`),
      action: 'redo',
      description: 'Redo last undone action',
    });

    // Session management (typically used with leader key)
    this.addBinding('newSession', {
      keys: this.config.newSession ?? [],
      displayName: getDisplayName(this.config.newSession, 'n'),
      action: 'newSession',
      description: 'Create new session',
    });

    this.addBinding('listSessions', {
      keys: this.config.listSessions ?? [],
      displayName: getDisplayName(this.config.listSessions, 'l'),
      action: 'listSessions',
      description: 'List sessions',
    });

    this.addBinding('resumeSession', {
      keys: this.config.resumeSession ?? [],
      displayName: getDisplayName(this.config.resumeSession, 'r'),
      action: 'resumeSession',
      description: 'Resume session',
    });
  }

  /**
   * Add or override a key binding
   */
  private addBinding(action: KeyBindingAction, binding: KeyBinding): void {
    this.bindings.set(action, binding);
  }

  /**
   * Get binding for action
   */
  getBinding(action: KeyBindingAction): KeyBinding | undefined {
    return this.bindings.get(action);
  }

  /**
   * Get all bindings
   */
  getAllBindings(): Map<KeyBindingAction, KeyBinding> {
    return new Map(this.bindings);
  }

  /**
   * Get help text for all shortcuts
   */
  getHelpText(): string {
    const lines = ['Keyboard Shortcuts:', ''];

    for (const [, binding] of this.bindings) {
      // Format multiple keys as "Ctrl+C, Escape"
      const keysDisplay = binding.keys.join(', ');
      lines.push(`  ${keysDisplay.padEnd(20)} ${binding.description}`);
    }

    return lines.join('\n');
  }

  /**
   * Normalize key string for comparison
   * Normalizes all keys to lowercase for consistency
   */
  static normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/control/g, 'ctrl')
      .replace(/command/g, 'cmd')
      .replace(/option/g, 'alt')
      .replace(/esc(?![a-z])/g, 'escape') // esc → escape (but not in 'escape')
      .replace(/del(?![a-z])/g, 'delete') // del → delete (but not in 'delete')
      .replace(/return/g, 'enter')
      .split('+')
      .map((part) => part.trim())
      .join('+');
  }

  /**
   * Check if pressed key matches any binding for the action
   */
  matches(pressedKey: string, action: KeyBindingAction): boolean {
    const binding = this.bindings.get(action);
    if (!binding || !binding.keys) return false;

    const normalizedPressed = KeyBindingsManager.normalizeKey(pressedKey);

    // Check if pressed key matches any of the bound keys
    return binding.keys.some((key) => {
      const normalizedBinding = KeyBindingsManager.normalizeKey(key);
      return normalizedPressed === normalizedBinding;
    });
  }

  /**
   * Get action for a pressed key (reverse lookup)
   */
  getActionForKey(pressedKey: string): KeyBindingAction | null {
    const normalizedPressed = KeyBindingsManager.normalizeKey(pressedKey);

    for (const [action, binding] of this.bindings) {
      // Defensive check: skip if binding is somehow undefined
      if (!binding || !binding.keys) {
        logger.warn(`Invalid binding for action: ${action}`, { binding });
        continue;
      }

      if (binding.keys.some((key) => KeyBindingsManager.normalizeKey(key) === normalizedPressed)) {
        return action;
      }
    }

    return null;
  }

  /**
   * Get platform-specific modifier key name
   */
  static getModifierKey(platform?: NodeJS.Platform): string {
    const p = platform || os.platform();
    return p === 'darwin' ? 'Cmd' : 'Ctrl';
  }

  /**
   * Convert config binding to platform-specific display
   */
  static toPlatformBinding(binding: string, platform?: NodeJS.Platform): string {
    const modKey = KeyBindingsManager.getModifierKey(platform);
    return binding.replace(/ctrl|cmd/gi, modKey.toLowerCase());
  }
}
