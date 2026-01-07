/**
 * Platform-specific test helpers
 * Provides utilities for conditional test execution based on platform
 */

import { platform } from 'os';

/**
 * Get current platform
 */
export const currentPlatform = platform();

/**
 * Platform type guards
 */
export const isWindows = currentPlatform === 'win32';
export const isMacOS = currentPlatform === 'darwin';
export const isLinux = currentPlatform === 'linux';
export const isUnix = isMacOS || isLinux;

/**
 * Get platform-specific modifier key (Cmd on macOS, Ctrl elsewhere)
 */
export function getModifierKey(): 'Cmd' | 'Ctrl' {
  return isMacOS ? 'Cmd' : 'Ctrl';
}

/**
 * Get platform-specific key combination
 * Example: getPlatformKey('ctrl+C') returns 'cmd+C' on macOS, 'ctrl+C' elsewhere
 */
export function getPlatformKey(key: string): string {
  if (isMacOS) {
    return key.replace(/ctrl/gi, 'Cmd');
  }
  return key;
}

/**
 * Platform-specific path examples for tests
 */
export const platformPaths = {
  absolute: isWindows ? 'C:\\Users\\test\\project' : '/home/test/project',
  relative: 'src/index.ts',
  separator: isWindows ? '\\' : '/',
};

/**
 * Platform-specific commands for tests
 */
export const platformCommands = {
  echo: {
    command: isWindows ? 'cmd' : 'echo',
    args: (text: string) => (isWindows ? ['/c', 'echo', text] : [text]),
  },
  shell: isWindows ? 'cmd' : 'sh',
  shellFlag: isWindows ? '/c' : '-c',
};

/**
 * Test timeout values (Windows often needs longer timeouts)
 */
export const platformTimeouts = {
  short: isWindows ? 2000 : 1000,
  medium: isWindows ? 5000 : 3000,
  long: isWindows ? 10000 : 5000,
};
