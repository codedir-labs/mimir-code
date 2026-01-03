/**
 * Cross-platform path utilities
 * Handles Windows vs Unix path differences
 */

import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

/**
 * Normalize path to use forward slashes (cross-platform)
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/');
}

/**
 * Resolve path to absolute path
 */
export function resolvePath(...paths: string[]): string {
  return path.resolve(...paths);
}

/**
 * Join path segments
 */
export function joinPath(...paths: string[]): string {
  return path.join(...paths);
}

/**
 * Get relative path from base to target
 */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Get directory name from path
 */
export function dirname(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get file name from path (with or without extension)
 */
export function basename(filePath: string, ext?: string): string {
  return path.basename(filePath, ext);
}

/**
 * Get file extension
 */
export function extname(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Check if path is absolute
 */
export function isAbsolute(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Convert file URL to path
 */
export function urlToPath(url: string): string {
  return fileURLToPath(url);
}

/**
 * Get home directory
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Get temp directory
 */
export function getTempDir(): string {
  return os.tmpdir();
}

/**
 * Convert Windows path to Unix-style path
 */
export function toUnixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Convert Unix path to Windows-style path
 */
export function toWindowsPath(filePath: string): string {
  return filePath.replace(/\//g, '\\');
}

/**
 * Sanitize path to prevent directory traversal attacks
 */
export function sanitizePath(filePath: string, baseDir: string): string {
  const normalizedBase = normalizePath(resolvePath(baseDir));
  const resolved = normalizePath(resolvePath(normalizedBase, filePath));

  // Check if resolved path is within base directory
  // Ensure both paths end without separator for consistent comparison
  const base = normalizedBase.endsWith('/') ? normalizedBase : normalizedBase + '/';
  const target = resolved + (resolved.endsWith('/') ? '' : '/');

  if (!target.startsWith(base) && resolved !== normalizedBase) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  return resolved;
}

/**
 * Get platform-specific path separator
 */
export function getPathSeparator(): string {
  return path.sep;
}

/**
 * Get platform-specific path delimiter
 */
export function getPathDelimiter(): string {
  return path.delimiter;
}

/**
 * Parse path into components
 */
export function parsePath(filePath: string): path.ParsedPath {
  return path.parse(filePath);
}

/**
 * Format path from components
 */
export function formatPath(pathObject: path.FormatInputPathObject): string {
  return path.format(pathObject);
}
