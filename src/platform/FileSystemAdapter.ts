/**
 * FileSystemAdapter - Cross-platform file system implementation
 * Uses Node.js fs/promises + fast-glob for file operations
 */

import { IFileSystem, Stats } from './IFileSystem.js';
import fs from 'fs/promises';
import fg from 'fast-glob';

export class FileSystemAdapter implements IFileSystem {
  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    return fs.readFile(path, encoding);
  }

  async writeFile(
    path: string,
    content: string,
    encoding: BufferEncoding = 'utf-8'
  ): Promise<void> {
    await fs.writeFile(path, content, encoding);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(path, options);
  }

  async readdir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  async stat(path: string): Promise<Stats> {
    const stats = await fs.stat(path);
    return {
      isFile: () => stats.isFile(),
      isDirectory: () => stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
    };
  }

  async unlink(path: string): Promise<void> {
    await fs.unlink(path);
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.rmdir(path, options);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await fs.copyFile(src, dest);
  }

  async glob(pattern: string, options?: { cwd?: string; ignore?: string[] }): Promise<string[]> {
    return fg(pattern, {
      cwd: options?.cwd,
      ignore: options?.ignore,
    });
  }
}
