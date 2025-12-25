/**
 * Keyboard shortcuts with platform-specific bindings
 * Loads from .mimir/config.yml
 */

import { KeyBindingsConfig } from '../config/schemas.js';
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
  | 'help' // ? - show help
  | 'clearScreen' // Ctrl+L - clear screen
  | 'undo' // Ctrl+Z - undo
  | 'redo' // Ctrl+Y (Cmd+Shift+Z on Mac) - redo
  | 'reject'; // @deprecated - use 'interrupt' instead

export class KeyBindingsManager {
  private bindings: Map<KeyBindingAction, KeyBinding> = new Map();
  private platform: 'darwin' | 'win32' | 'linux';

  constructor(private config: KeyBindingsConfig) {
    this.platform = os.platform() as 'darwin' | 'win32' | 'linux';
    this.initializeDefaults();
  }

  /**
   * Initialize default platform-specific bindings
   */
  private initializeDefaults(): void {
    const isMac = this.platform === 'darwin';
    const modKey = isMac ? 'Cmd' : 'Ctrl';

    // Helper to convert config keys to platform-specific
    const toPlatform = (keys: string[]): string[] => {
      return keys.map((key) => key.replace(/Ctrl/g, modKey));
    };

    // Core bindings from config
    this.addBinding('interrupt', {
      keys: toPlatform(this.config.interrupt),
      displayName: toPlatform(this.config.interrupt)[0] ?? 'Ctrl+C',
      action: 'interrupt',
      description: 'Cancel/interrupt current operation',
    });

    this.addBinding('accept', {
      keys: this.config.accept,
      displayName: this.config.accept[0] ?? 'Enter',
      action: 'accept',
      description: 'Accept/confirm action',
    });

    // Note: 'reject' action is deprecated - use 'interrupt' instead
    // Only add if explicitly configured for backwards compatibility
    if (this.config.reject && this.config.reject.length > 0) {
      this.addBinding('reject', {
        keys: this.config.reject,
        displayName: this.config.reject[0] ?? 'Escape',
        action: 'reject',
        description: 'Reject/cancel prompt (deprecated)',
      });
    }

    this.addBinding('modeSwitch', {
      keys: this.config.modeSwitch,
      displayName: this.config.modeSwitch[0] ?? 'Shift+Tab',
      action: 'modeSwitch',
      description: 'Switch between modes',
    });

    this.addBinding('editCommand', {
      keys: toPlatform(this.config.editCommand),
      displayName: toPlatform(this.config.editCommand)[0] ?? `${modKey}+E`,
      action: 'editCommand',
      description: 'Edit alternative instruction',
    });

    this.addBinding('showTooltip', {
      keys: toPlatform(this.config.showTooltip),
      displayName: toPlatform(this.config.showTooltip)[0] ?? `${modKey}+Space`,
      action: 'showTooltip',
      description: 'Show autocomplete/tooltip',
    });

    this.addBinding('navigateUp', {
      keys: this.config.navigateUp,
      displayName: this.config.navigateUp[0] ?? 'ArrowUp',
      action: 'navigateUp',
      description: 'Navigate up in list',
    });

    this.addBinding('navigateDown', {
      keys: this.config.navigateDown,
      displayName: this.config.navigateDown[0] ?? 'ArrowDown',
      action: 'navigateDown',
      description: 'Navigate down in list',
    });

    this.addBinding('help', {
      keys: this.config.help,
      displayName: this.config.help[0] ?? '?',
      action: 'help',
      description: 'Show help overlay',
    });

    this.addBinding('clearScreen', {
      keys: toPlatform(this.config.clearScreen),
      displayName: toPlatform(this.config.clearScreen)[0] ?? `${modKey}+L`,
      action: 'clearScreen',
      description: 'Clear screen',
    });

    this.addBinding('undo', {
      keys: toPlatform(this.config.undo),
      displayName: toPlatform(this.config.undo)[0] ?? `${modKey}+Z`,
      action: 'undo',
      description: 'Undo last action',
    });

    // Redo has platform-specific default
    const redoKeys = isMac ? [`${modKey}+Shift+Z`] : toPlatform(this.config.redo);

    this.addBinding('redo', {
      keys: redoKeys,
      displayName: redoKeys[0] ?? `${modKey}+Y`,
      action: 'redo',
      description: 'Redo last undone action',
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
   * Handles: Ctrl/Control, Cmd/Command, variations in case
   */
  static normalizeKey(key: string): string {
    return key
      .replace(/Control/gi, 'Ctrl')
      .replace(/Command/gi, 'Cmd')
      .replace(/Delete/gi, 'Del')
      .replace(/Escape/gi, 'Esc')
      .split('+')
      .map((part) => part.trim())
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
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
    return binding.replace(/Ctrl|Cmd/gi, modKey);
  }
}
