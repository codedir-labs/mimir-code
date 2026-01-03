/**
 * Mock IFileSystem implementation for testing
 */

import type { IFileSystem } from '../../src/memory/platform.js';
import { join, dirname, basename } from 'path';

interface FileEntry {
  type: 'file' | 'directory';
  content?: string | Buffer;
}

export class MockFileSystem implements IFileSystem {
  private files: Map<string, FileEntry> = new Map();

  // Read operations

  async readFile(path: string, encoding?: 'utf-8'): Promise<string | Buffer> {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);

    if (!entry || entry.type !== 'file') {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    if (encoding === 'utf-8' && Buffer.isBuffer(entry.content)) {
      return entry.content.toString('utf-8');
    }

    return entry.content || '';
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);
    return this.files.has(normalized);
  }

  async readdir(path: string): Promise<string[]> {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    if (entry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    // Find all direct children
    const children = new Set<string>();
    const prefix = normalized === '/' ? '/' : normalized + '/';

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relative = filePath.slice(prefix.length);
        const firstSegment = relative.split('/')[0];
        if (firstSegment) {
          children.add(firstSegment);
        }
      }
    }

    return Array.from(children);
  }

  // Write operations

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const normalized = this.normalizePath(path);

    // Ensure parent directory exists
    const parent = dirname(normalized);
    if (parent !== normalized) {
      await this.ensureDir(parent);
    }

    this.files.set(normalized, {
      type: 'file',
      content,
    });
  }

  async appendFile(path: string, content: string): Promise<void> {
    const normalized = this.normalizePath(path);
    const existing = this.files.get(normalized);

    let newContent = content;
    if (existing && existing.type === 'file') {
      const existingContent = existing.content || '';
      newContent = existingContent.toString() + content;
    }

    await this.writeFile(normalized, newContent);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = this.normalizePath(path);

    if (options?.recursive) {
      await this.ensureDir(normalized);
    } else {
      // Check parent exists
      const parent = dirname(normalized);
      if (parent !== normalized && !this.files.has(parent)) {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }

      this.files.set(normalized, { type: 'directory' });
    }
  }

  async ensureDir(path: string): Promise<void> {
    const normalized = this.normalizePath(path);

    if (this.files.has(normalized)) {
      return;
    }

    // Handle root directory
    if (normalized === '/') {
      this.files.set('/', { type: 'directory' });
      return;
    }

    // Create all parent directories
    const parts = normalized.split('/').filter((p) => p);
    const isAbsolute = normalized.startsWith('/');

    // Ensure root exists for absolute paths
    if (isAbsolute && !this.files.has('/')) {
      this.files.set('/', { type: 'directory' });
    }

    for (let i = 0; i < parts.length; i++) {
      const current = isAbsolute
        ? '/' + parts.slice(0, i + 1).join('/')
        : parts.slice(0, i + 1).join('/');

      if (!this.files.has(current)) {
        this.files.set(current, { type: 'directory' });
      }
    }
  }

  // Delete operations

  async remove(path: string): Promise<void> {
    const normalized = this.normalizePath(path);

    // Remove the path and all children
    const keysToRemove: string[] = [];
    const prefix = normalized === '/' ? '/' : normalized + '/';

    for (const key of this.files.keys()) {
      if (key === normalized || key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.files.delete(key);
    }
  }

  async unlink(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }

    if (entry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
    }

    this.files.delete(normalized);
  }

  // Path operations

  join(...paths: string[]): string {
    const joined = join(...paths);
    // Normalize to forward slashes for consistency
    return joined.replace(/\\/g, '/');
  }

  dirname(path: string): string {
    const dir = dirname(path);
    return dir.replace(/\\/g, '/');
  }

  basename(path: string): string {
    return basename(path);
  }

  // Testing helpers

  reset(): void {
    this.files.clear();
  }

  getAllPaths(): string[] {
    return Array.from(this.files.keys()).sort();
  }

  getFileContent(path: string): string | Buffer | undefined {
    const normalized = this.normalizePath(path);
    return this.files.get(normalized)?.content;
  }

  private normalizePath(path: string): string {
    // Simple normalization: remove trailing slashes, handle relative paths
    let normalized = path.replace(/\\/g, '/');

    // Remove trailing slash unless it's root
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }
}
