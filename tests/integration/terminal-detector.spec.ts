/**
 * Integration tests for terminal detection
 * Tests Windows Terminal detection, setup instructions, and cross-platform behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectTerminal,
  getWindowsTerminalSetupMessage,
  checkWindowsTerminalSetup,
} from '@/shared/utils/terminalDetector.js';

describe('Terminal Detection - Integration', () => {
  // Store original values
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  describe('Windows Terminal detection', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
    });

    it('should detect Windows Terminal via WT_SESSION', () => {
      process.env.WT_SESSION = 'some-session-id';
      delete process.env.WT_PROFILE_ID;

      const info = detectTerminal();

      expect(info.name).toBe('Windows Terminal');
      expect(info.isWindowsTerminal).toBe(true);
      expect(info.needsShiftEnterSetup).toBe(true);
      expect(info.setupInstructions).toBeDefined();
      expect(info.setupInstructions).toContain('keybinds');
    });

    it('should detect Windows Terminal via WT_PROFILE_ID', () => {
      delete process.env.WT_SESSION;
      process.env.WT_PROFILE_ID = 'some-profile-id';

      const info = detectTerminal();

      expect(info.name).toBe('Windows Terminal');
      expect(info.isWindowsTerminal).toBe(true);
      expect(info.needsShiftEnterSetup).toBe(true);
    });

    it('should detect Windows Terminal via both WT_SESSION and WT_PROFILE_ID', () => {
      process.env.WT_SESSION = 'session';
      process.env.WT_PROFILE_ID = 'profile';

      const info = detectTerminal();

      expect(info.name).toBe('Windows Terminal');
      expect(info.isWindowsTerminal).toBe(true);
    });

    it('should detect unknown Windows terminal when WT variables are missing', () => {
      delete process.env.WT_SESSION;
      delete process.env.WT_PROFILE_ID;

      const info = detectTerminal();

      expect(info.name).toBe('Unknown Windows Terminal');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(true);
      expect(info.setupInstructions).toBeDefined();
    });

    it('should recommend shift+Enter setup for all Windows terminals', () => {
      // Test with Windows Terminal
      process.env.WT_SESSION = 'session';
      let info = detectTerminal();
      expect(info.needsShiftEnterSetup).toBe(true);

      // Test with unknown Windows terminal
      delete process.env.WT_SESSION;
      info = detectTerminal();
      expect(info.needsShiftEnterSetup).toBe(true);
    });
  });

  describe('macOS terminal detection', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
    });

    it('should detect iTerm2', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';

      const info = detectTerminal();

      expect(info.name).toBe('iTerm2');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
      expect(info.setupInstructions).toBeUndefined();
    });

    it('should detect Terminal.app', () => {
      process.env.TERM_PROGRAM = 'Apple_Terminal';

      const info = detectTerminal();

      expect(info.name).toBe('Terminal.app');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });

    it('should detect unknown macOS terminal', () => {
      process.env.TERM_PROGRAM = 'SomeOtherTerminal';

      const info = detectTerminal();

      expect(info.name).toBe('SomeOtherTerminal');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });

    it('should handle missing TERM_PROGRAM', () => {
      delete process.env.TERM_PROGRAM;

      const info = detectTerminal();

      expect(info.name).toBe('Unknown macOS Terminal');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });

    it('should not recommend shift+Enter setup for macOS', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';

      const info = detectTerminal();

      expect(info.needsShiftEnterSetup).toBe(false);
    });
  });

  describe('Linux terminal detection', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
    });

    it('should detect terminal from TERM variable', () => {
      process.env.TERM = 'xterm-256color';

      const info = detectTerminal();

      expect(info.name).toBe('xterm-256color');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });

    it('should handle missing TERM variable', () => {
      delete process.env.TERM;

      const info = detectTerminal();

      expect(info.name).toBe('Unknown Terminal');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });

    it('should not recommend shift+Enter setup for Linux', () => {
      process.env.TERM = 'xterm-256color';

      const info = detectTerminal();

      expect(info.needsShiftEnterSetup).toBe(false);
    });
  });

  describe('Windows Terminal setup message', () => {
    it('should return formatted setup instructions', () => {
      const message = getWindowsTerminalSetupMessage();

      expect(message).toContain('Windows Terminal Configuration Required');
      expect(message).toContain('shift+enter');
      expect(message).toContain('Open JSON file');
      expect(message).toContain('sendInput');
      expect(message).toContain('\\u001b[13;2u');
      expect(message).toContain('ctrl+,');
      expect(message).toContain('actions');
      expect(message).toContain('keybindings');
      expect(message).toContain('shift+enter');
    });

    it('should include documentation link', () => {
      const message = getWindowsTerminalSetupMessage();

      expect(message).toContain('https://mimir.dev/configuration/keybinds#windows-terminal-setup');
    });

    it('should be properly formatted with box drawing', () => {
      const message = getWindowsTerminalSetupMessage();

      expect(message).toContain('╭');
      expect(message).toContain('╰');
      expect(message).toContain('│');
    });
  });

  describe('checkWindowsTerminalSetup', () => {
    it('should return true for Windows terminals', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      process.env.WT_SESSION = 'session';

      const needsSetup = checkWindowsTerminalSetup();

      expect(needsSetup).toBe(true);
    });

    it('should return false for macOS terminals', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      process.env.TERM_PROGRAM = 'iTerm.app';

      const needsSetup = checkWindowsTerminalSetup();

      expect(needsSetup).toBe(false);
    });

    it('should return false for Linux terminals', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      process.env.TERM = 'xterm-256color';

      const needsSetup = checkWindowsTerminalSetup();

      expect(needsSetup).toBe(false);
    });
  });

  describe('Cross-platform consistency', () => {
    it('should always return TerminalInfo with required fields', () => {
      const platforms = ['win32', 'darwin', 'linux'];

      platforms.forEach((platform) => {
        Object.defineProperty(process, 'platform', {
          value: platform,
          configurable: true,
        });

        const info = detectTerminal();

        expect(info).toHaveProperty('name');
        expect(info).toHaveProperty('isWindowsTerminal');
        expect(info).toHaveProperty('needsShiftEnterSetup');

        expect(typeof info.name).toBe('string');
        expect(typeof info.isWindowsTerminal).toBe('boolean');
        expect(typeof info.needsShiftEnterSetup).toBe('boolean');

        // setupInstructions is optional
        if (info.setupInstructions !== undefined) {
          expect(typeof info.setupInstructions).toBe('string');
        }
      });
    });

    it('should only set isWindowsTerminal=true on Windows platform', () => {
      // Windows Terminal on Windows
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      process.env.WT_SESSION = 'session';
      let info = detectTerminal();
      expect(info.isWindowsTerminal).toBe(true);

      // macOS terminal
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      info = detectTerminal();
      expect(info.isWindowsTerminal).toBe(false);

      // Linux terminal
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      info = detectTerminal();
      expect(info.isWindowsTerminal).toBe(false);
    });
  });

  describe('Environment variable edge cases', () => {
    it('should handle empty WT_SESSION', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      process.env.WT_SESSION = '';
      delete process.env.WT_PROFILE_ID;

      const info = detectTerminal();

      // Empty string is falsy, should not detect as Windows Terminal
      expect(info.isWindowsTerminal).toBe(false);
    });

    it('should handle empty WT_PROFILE_ID', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      delete process.env.WT_SESSION;
      process.env.WT_PROFILE_ID = '';

      const info = detectTerminal();

      // Empty string is falsy
      expect(info.isWindowsTerminal).toBe(false);
    });

    it('should handle empty TERM_PROGRAM', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      process.env.TERM_PROGRAM = '';

      const info = detectTerminal();

      expect(info.name).toBe('Unknown macOS Terminal');
    });

    it('should handle empty TERM', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      process.env.TERM = '';

      const info = detectTerminal();

      expect(info.name).toBe('Unknown Terminal');
    });
  });

  describe('Real-world scenarios', () => {
    it('should detect Windows Terminal in typical Windows environment', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      process.env.WT_SESSION = 'abc123-def456';
      process.env.WT_PROFILE_ID = '{guid-here}';

      const info = detectTerminal();

      expect(info.name).toBe('Windows Terminal');
      expect(info.isWindowsTerminal).toBe(true);
      expect(info.needsShiftEnterSetup).toBe(true);
    });

    it('should detect iTerm2 in typical macOS environment', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      process.env.TERM_PROGRAM = 'iTerm.app';
      process.env.TERM = 'xterm-256color';

      const info = detectTerminal();

      expect(info.name).toBe('iTerm2');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });

    it('should detect gnome-terminal in typical Linux environment', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      process.env.TERM = 'xterm-256color';
      process.env.COLORTERM = 'truecolor';

      const info = detectTerminal();

      expect(info.name).toBe('xterm-256color');
      expect(info.isWindowsTerminal).toBe(false);
      expect(info.needsShiftEnterSetup).toBe(false);
    });
  });
});
