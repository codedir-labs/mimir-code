/**
 * Utility for clearing terminal screen
 * Used for transitions between UI views (wizard to chat, etc.)
 */

/**
 * Clears the terminal screen completely
 * Uses ANSI escape codes for cross-platform compatibility
 */
export const clearScreen = (): void => {
  // ANSI escape sequence: \x1Bc - full reset (clears screen and scrollback)
  // Alternative: \x1B[2J\x1B[3J\x1B[H - clear screen + scrollback + move to home
  process.stdout.write('\x1Bc');
};

/**
 * Clears the terminal screen (viewport only, keeps scrollback)
 */
export const clearViewport = (): void => {
  // ANSI escape sequence: \x1B[2J - clear viewport only
  // \x1B[H - move cursor to home position
  process.stdout.write('\x1B[2J\x1B[H');
};
