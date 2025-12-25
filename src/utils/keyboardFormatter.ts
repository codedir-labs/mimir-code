/**
 * Keyboard shortcut formatting utility
 * Converts keyboard shortcuts to user-friendly display format with icons
 */

import os from 'os';

/**
 * Icon mappings for keyboard keys
 */
const KEY_ICONS: Record<string, string> = {
  // Arrow keys
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',

  // Special keys
  Enter: '↵',
  Return: '↵',
  Backspace: '⌫',
  Delete: '⌦',
  Del: '⌦',
  Space: '␣',

  // Modifiers
  Shift: '⇧',
  Control: '⌃',
  Ctrl: '⌃',
  Command: '⌘',
  Cmd: '⌘',
  Meta: '⌘',
};

/**
 * Platform-specific modifier names
 */
const PLATFORM_MODIFIERS: Record<string, Record<string, string>> = {
  darwin: {
    Ctrl: 'Cmd',
    Control: 'Command',
  },
  win32: {
    Cmd: 'Ctrl',
    Command: 'Control',
  },
  linux: {
    Cmd: 'Ctrl',
    Command: 'Control',
  },
};

export interface KeyboardFormatterOptions {
  /**
   * Use icons instead of text (default: true)
   * When true: ArrowUp → ↑, Enter → ↵, Ctrl → ⌃
   * When false: ArrowUp → Arrow Up, Enter → Enter, Ctrl → Ctrl
   */
  useIcons?: boolean;

  /**
   * Use icons for modifiers (default: false)
   * When true: Ctrl+C → ⌃C
   * When false: Ctrl+C → Ctrl+C
   */
  useModifierIcons?: boolean;

  /**
   * Platform override (default: current platform)
   * Used to convert Ctrl/Cmd based on platform
   */
  platform?: NodeJS.Platform;

  /**
   * Separator for multiple shortcuts (default: ', ')
   * Example: 'Ctrl+C, Escape' vs 'Ctrl+C / Escape'
   */
  separator?: string;

  /**
   * Show only first shortcut when multiple are provided (default: false)
   */
  showFirstOnly?: boolean;
}

/**
 * Normalize key name for consistent formatting
 * Handles case variations and aliases
 */
function normalizeKeyName(key: string): string {
  return key
    .replace(/Control/gi, 'Ctrl')
    .replace(/Command/gi, 'Cmd')
    .replace(/Delete/gi, 'Del')
    .replace(/Escape/gi, 'Esc')
    .split('+')
    .map((part) => part.trim())
    .map((part) => {
      const lower = part.toLowerCase();

      // Handle arrow keys with proper casing (case-insensitive input)
      if (lower === 'arrowup' || lower === 'up') return 'ArrowUp';
      if (lower === 'arrowdown' || lower === 'down') return 'ArrowDown';
      if (lower === 'arrowleft' || lower === 'left') return 'ArrowLeft';
      if (lower === 'arrowright' || lower === 'right') return 'ArrowRight';

      // Standard case: capitalize first letter
      const normalized = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();

      // Map common aliases
      if (normalized === 'Meta') return 'Cmd';
      if (normalized === 'Option') return 'Alt';

      return normalized;
    })
    .join('+');
}

/**
 * Apply platform-specific modifier conversions
 */
function applyPlatformModifiers(key: string, platform: NodeJS.Platform): string {
  const modifiers = PLATFORM_MODIFIERS[platform] || PLATFORM_MODIFIERS.linux;
  if (!modifiers) return key;

  let result = key;

  for (const [from, to] of Object.entries(modifiers)) {
    // Replace modifier keys, being careful with word boundaries
    result = result.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }

  return result;
}

/**
 * Format a single keyboard shortcut with icons
 */
function formatSingleShortcut(
  shortcut: string,
  options: Required<KeyboardFormatterOptions>
): string {
  const { useIcons, useModifierIcons, platform } = options;

  // Normalize and apply platform modifiers
  let normalized = normalizeKeyName(shortcut);
  normalized = applyPlatformModifiers(normalized, platform);

  // Split into parts (e.g., "Ctrl+Shift+C" → ["Ctrl", "Shift", "C"])
  const parts = normalized.split('+').map((p) => p.trim());

  // Format each part
  const formatted = parts.map((part, index) => {
    const isModifier = index < parts.length - 1; // All parts except the last are modifiers
    const icon = KEY_ICONS[part];

    if (useIcons && icon) {
      // Use icon if available
      if (isModifier && !useModifierIcons) {
        // For modifiers, respect useModifierIcons option
        return part;
      }
      return icon;
    }

    // No icon - format as readable text
    if (part.startsWith('Arrow')) {
      // ArrowUp → Up (when not using icons)
      return part.replace('Arrow', '');
    }

    return part;
  });

  // Join with '+' for modifier combinations, or directly for single keys
  if (formatted.length === 1) {
    return formatted[0] ?? '';
  }

  // Join modifiers with '+' or '' depending on whether we're using modifier icons
  if (useModifierIcons && formatted.every((f) => f.length === 1)) {
    // All single chars (icons) - no separator needed (e.g., ⌘⇧C)
    return formatted.join('');
  }

  return formatted.join('+');
}

/**
 * Format keyboard shortcut(s) for display
 *
 * @param shortcuts - Single shortcut string or array of shortcuts
 * @param options - Formatting options
 * @returns Formatted shortcut string
 *
 * @example
 * ```typescript
 * // Single shortcut with icons
 * formatKeyboardShortcut('ArrowUp');
 * // → '↑'
 *
 * // Multiple shortcuts
 * formatKeyboardShortcut(['Ctrl+C', 'Escape']);
 * // → 'Ctrl+C, Esc'
 *
 * // With modifier icons
 * formatKeyboardShortcut('Ctrl+Shift+C', { useModifierIcons: true });
 * // → '⌃⇧C'
 *
 * // Without icons
 * formatKeyboardShortcut('Enter', { useIcons: false });
 * // → 'Enter'
 *
 * // Navigation keys for footer
 * formatKeyboardShortcut(['ArrowUp', 'ArrowDown'], { separator: '/' });
 * // → '↑/↓'
 * ```
 */
export function formatKeyboardShortcut(
  shortcuts: string | string[],
  options: KeyboardFormatterOptions = {}
): string {
  const opts: Required<KeyboardFormatterOptions> = {
    useIcons: options.useIcons ?? true,
    useModifierIcons: options.useModifierIcons ?? false,
    platform: options.platform ?? os.platform(),
    separator: options.separator ?? ', ',
    showFirstOnly: options.showFirstOnly ?? false,
  };

  // Handle array of shortcuts
  if (Array.isArray(shortcuts)) {
    if (shortcuts.length === 0) return '';
    if (opts.showFirstOnly) {
      const first = shortcuts[0];
      if (!first) return '';
      return formatSingleShortcut(first, opts);
    }
    return shortcuts.map((s) => formatSingleShortcut(s, opts)).join(opts.separator);
  }

  // Single shortcut
  return formatSingleShortcut(shortcuts, opts);
}

/**
 * Helper for navigation arrows (↑↓)
 * Common pattern in UI footers
 */
export function formatNavigationArrows(
  upShortcut: string | string[],
  downShortcut: string | string[],
  options: KeyboardFormatterOptions = {}
): string {
  const up = formatKeyboardShortcut(upShortcut, { ...options, showFirstOnly: true });
  const down = formatKeyboardShortcut(downShortcut, { ...options, showFirstOnly: true });
  return `${up}${down}`;
}

/**
 * Helper for building UI footer text with shortcuts
 *
 * @example
 * ```typescript
 * buildFooterText([
 *   { shortcut: ['ArrowUp', 'ArrowDown'], label: 'navigate' },
 *   { shortcut: 'Enter', label: 'select' },
 *   { shortcut: ['Ctrl+C', 'Escape'], label: 'cancel' },
 * ]);
 * // → '↑↓ navigate | Enter select | Ctrl+C, Esc cancel'
 * ```
 */
export function buildFooterText(
  items: Array<{ shortcut: string | string[]; label: string }>,
  options: KeyboardFormatterOptions = {}
): string {
  return items
    .map(({ shortcut, label }) => {
      const formatted = formatKeyboardShortcut(shortcut, options);
      return `${formatted} ${label}`;
    })
    .join(' | ');
}
