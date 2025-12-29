/**
 * Utility to detect terminal type and provide setup guidance
 */

import os from 'os';
import { logger } from './logger.js';

export interface TerminalInfo {
  /** Terminal name (e.g., 'Windows Terminal', 'iTerm2', 'Unknown') */
  name: string;
  /** Whether this is Windows Terminal */
  isWindowsTerminal: boolean;
  /** Whether the terminal might need shift+enter configuration */
  needsShiftEnterSetup: boolean;
  /** Setup instructions URL or description */
  setupInstructions?: string;
}

/**
 * Detect the current terminal and provide setup guidance
 */
export function detectTerminal(): TerminalInfo {
  const platform = os.platform();

  // Windows Terminal detection
  if (platform === 'win32') {
    // Windows Terminal sets WT_SESSION environment variable
    const isWindowsTerminal = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;

    if (isWindowsTerminal) {
      logger.debug('Detected Windows Terminal');
      return {
        name: 'Windows Terminal',
        isWindowsTerminal: true,
        needsShiftEnterSetup: true,
        setupInstructions: 'https://mimir.dev/configuration/keybinds#windows-terminal-setup',
      };
    }

    // Other Windows terminals
    logger.debug('Detected Windows terminal (not Windows Terminal)');
    return {
      name: 'Unknown Windows Terminal',
      isWindowsTerminal: false,
      needsShiftEnterSetup: true,
      setupInstructions: 'https://mimir.dev/configuration/keybinds#windows-terminal-setup',
    };
  }

  // macOS terminal detection
  if (platform === 'darwin') {
    const termProgram = process.env.TERM_PROGRAM;

    if (termProgram === 'iTerm.app') {
      return {
        name: 'iTerm2',
        isWindowsTerminal: false,
        needsShiftEnterSetup: false,
      };
    }

    if (termProgram === 'Apple_Terminal') {
      return {
        name: 'Terminal.app',
        isWindowsTerminal: false,
        needsShiftEnterSetup: false,
      };
    }

    return {
      name: termProgram || 'Unknown macOS Terminal',
      isWindowsTerminal: false,
      needsShiftEnterSetup: false,
    };
  }

  // Linux terminal detection
  const term = process.env.TERM || '';
  return {
    name: term || 'Unknown Terminal',
    isWindowsTerminal: false,
    needsShiftEnterSetup: false,
  };
}

/**
 * Get Windows Terminal setup instructions
 */
export function getWindowsTerminalSetupMessage(): string {
  return `
╭─────────────────────────────────────────────────────────────────────────╮
│                                                                         │
│  Windows Terminal Configuration Required                               │
│                                                                         │
│  To use shift+enter and other modified enter keys, you need to         │
│  configure Windows Terminal manually.                                   │
│                                                                         │
│  Quick Setup:                                                           │
│  1. Press ctrl+, to open Settings                                      │
│  2. Click "Open JSON file" in bottom-left                              │
│  3. Add this to the "actions" array:                                    │
│                                                                         │
│     {                                                                   │
│       "command": {                                                      │
│         "action": "sendInput",                                          │
│         "input": "\\u001b[13;2u"                                        │
│       }                                                                 │
│     }                                                                   │
│                                                                         │
│  4. Add this to the "keybindings" array:                                │
│                                                                         │
│     {                                                                   │
│       "command": {                                                      │
│         "action": "sendInput",                                          │
│         "input": "\\u001b[13;2u"                                        │
│       },                                                                │
│       "keys": "shift+enter"                                             │
│     }                                                                   │
│                                                                         │
│  5. Restart Windows Terminal                                           │
│                                                                         │
│  Full documentation:                                                    │
│  https://mimir.dev/configuration/keybinds#windows-terminal-setup        │
│                                                                         │
╰─────────────────────────────────────────────────────────────────────────╯
`.trim();
}

/**
 * Check if Windows Terminal setup is needed and show notification
 * Returns true if setup is needed
 */
export function checkWindowsTerminalSetup(): boolean {
  const terminalInfo = detectTerminal();

  if (terminalInfo.needsShiftEnterSetup) {
    logger.info('Windows Terminal detected - shift+enter configuration may be required');
    return true;
  }

  return false;
}
