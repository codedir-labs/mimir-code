/**
 * Paste debugging logger
 * Writes verbose logs to .mimir/logs/paste-debug.log
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_DIR = path.join(os.homedir(), '.mimir', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'paste-debug.log');

// Unique session ID to track log entries
const SESSION_ID = Math.random().toString(36).substring(2, 8);
let logSequence = 0;

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  // Ignore errors creating directory
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function sanitizeContent(content: string, maxLen = 200): string {
  // Replace escape sequences with visible representations
  const sanitized = content.replace(/\x1b/g, '<ESC>').replace(/\r/g, '<CR>').replace(/\n/g, '<LF>');

  if (sanitized.length > maxLen) {
    return sanitized.substring(0, maxLen) + `... (${content.length} total chars)`;
  }
  return sanitized;
}

export function pasteLog(category: string, message: string, data?: Record<string, unknown>): void {
  try {
    const timestamp = getTimestamp();
    const seq = ++logSequence;
    let logLine = `[${timestamp}] [${SESSION_ID}:${seq}] [${category}] ${message}`;

    if (data) {
      const dataStr = Object.entries(data)
        .map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key}=${sanitizeContent(value)}`;
          }
          return `${key}=${JSON.stringify(value)}`;
        })
        .join(', ');
      logLine += ` | ${dataStr}`;
    }

    logLine += '\n';

    // Write synchronously to ensure all logs appear
    fs.appendFileSync(LOG_FILE, logLine);

    // Also write to stderr for immediate visibility during debugging
    // process.stderr.write(`PASTE: ${logLine}`);
  } catch (e) {
    // Try to log the error itself
    try {
      fs.appendFileSync(LOG_FILE, `[ERROR] pasteLog failed: ${e}\n`);
    } catch {
      // Give up
    }
  }
}

export function pasteLogClear(): void {
  try {
    fs.writeFileSync(
      LOG_FILE,
      `=== Paste Debug Log Started ${getTimestamp()} | Session: ${SESSION_ID} ===\n`
    );
    logSequence = 0;
  } catch (e) {
    // Ignore
  }
}

// Log when this module is loaded (useful to see if module is reloaded)
pasteLog('MODULE', 'pasteLogger module loaded', { pid: process.pid });

// Set up GLOBAL stdin listener at module load time
// This runs before any Ink code and should see ALL stdin data
let globalStdinListenerActive = false;
export function enableGlobalStdinListener(): void {
  if (globalStdinListenerActive) return;
  globalStdinListenerActive = true;

  pasteLog('GLOBAL', 'Setting up global stdin listener', {
    stdinIsTTY: process.stdin.isTTY,
    stdinIsReadable: process.stdin.readable,
  });

  // Use prependListener to run before all other handlers
  process.stdin.prependListener('data', (data: Buffer | string) => {
    const dataStr = typeof data === 'string' ? data : data.toString('utf8');
    const hex = Buffer.from(dataStr).toString('hex').substring(0, 80);
    pasteLog('GLOBAL-STDIN', 'Data received', {
      len: dataStr.length,
      hex,
      preview: dataStr
        .substring(0, 40)
        .replace(/[\x00-\x1f]/g, (c) => `<${c.charCodeAt(0).toString(16)}>`),
    });
  });

  pasteLog('GLOBAL', 'Global stdin listener registered');
}

export function pasteLogSeparator(label: string): void {
  pasteLog('---', `========== ${label} ==========`);
}

// Log content stats
export function pasteLogContent(label: string, content: string): void {
  const lines = content.split('\n').length;
  const chars = content.length;
  const bytes = Buffer.byteLength(content, 'utf8');
  const hasStartMarker = content.includes('\x1b[200~');
  const hasEndMarker = content.includes('\x1b[201~');
  const first50 = sanitizeContent(content.substring(0, 50));
  const last50 = sanitizeContent(content.substring(Math.max(0, content.length - 50)));

  pasteLog(label, 'Content stats', {
    lines,
    chars,
    bytes,
    hasStartMarker,
    hasEndMarker,
    first50,
    last50,
  });
}
