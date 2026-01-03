/**
 * FileSystemAdapter - Cross-platform file system implementation
 * Uses Node.js fs/promises + fast-glob for file operations
 */

import type { IFileSystem } from '@codedir/mimir-agents';
import fs from 'fs/promises';
import * as path from 'path';

export class FileSystemAdapter implements IFileSystem {
  async readFile(pathStr: string, encoding?: 'utf-8'): Promise<string | Buffer> {
    if (encoding === 'utf-8') {
      return fs.readFile(pathStr, 'utf-8');
    }
    return fs.readFile(pathStr);
  }

  async writeFile(pathStr: string, content: string | Buffer, encoding?: string): Promise<void> {
    if (encoding) {
      await fs.writeFile(pathStr, content, encoding as BufferEncoding);
    } else {
      await fs.writeFile(pathStr, content);
    }
  }

  async appendFile(pathStr: string, content: string): Promise<void> {
    await fs.appendFile(pathStr, content);
  }

  async exists(pathStr: string): Promise<boolean> {
    try {
      await fs.access(pathStr);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(pathStr: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(pathStr, options);
  }

  async ensureDir(pathStr: string): Promise<void> {
    await fs.mkdir(pathStr, { recursive: true });
  }

  async readdir(pathStr: string): Promise<string[]> {
    return fs.readdir(pathStr);
  }

  async remove(pathStr: string): Promise<void> {
    await fs.rm(pathStr, { recursive: true, force: true });
  }

  async unlink(pathStr: string): Promise<void> {
    await fs.unlink(pathStr);
  }

  // Path operations (synchronous)
  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(pathStr: string): string {
    return path.dirname(pathStr);
  }

  basename(pathStr: string): string {
    return path.basename(pathStr);
  }
}
