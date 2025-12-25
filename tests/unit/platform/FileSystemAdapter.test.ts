/**
 * Unit tests for FileSystemAdapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemAdapter } from '../../../src/platform/FileSystemAdapter.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('FileSystemAdapter', () => {
  let fs: FileSystemAdapter;
  let testDir: string;

  beforeEach(async () => {
    fs = new FileSystemAdapter();
    testDir = await mkdtemp(join(tmpdir(), 'mimir-test-'));
  });

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('readFile / writeFile', () => {
    it('should write and read a file', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, Mimir!';

      await fs.writeFile(filePath, content);
      const readContent = await fs.readFile(filePath);

      expect(readContent).toBe(content);
    });

    it('should write and read UTF-8 content', async () => {
      const filePath = join(testDir, 'utf8.txt');
      const content = 'Hello 世界 🌍';

      await fs.writeFile(filePath, content);
      const readContent = await fs.readFile(filePath);

      expect(readContent).toBe(content);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = join(testDir, 'exists.txt');
      await fs.writeFile(filePath, 'content');

      const exists = await fs.exists(filePath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = join(testDir, 'nonexistent.txt');

      const exists = await fs.exists(filePath);
      expect(exists).toBe(false);
    });
  });

  describe('mkdir / readdir', () => {
    it('should create directory', async () => {
      const dirPath = join(testDir, 'newdir');

      await fs.mkdir(dirPath);
      const exists = await fs.exists(dirPath);

      expect(exists).toBe(true);
    });

    it('should create nested directories recursively', async () => {
      const dirPath = join(testDir, 'a', 'b', 'c');

      await fs.mkdir(dirPath, { recursive: true });
      const exists = await fs.exists(dirPath);

      expect(exists).toBe(true);
    });

    it('should read directory contents', async () => {
      await fs.writeFile(join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(join(testDir, 'file2.txt'), 'content2');

      const files = await fs.readdir(testDir);

      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
      expect(files).toHaveLength(2);
    });
  });

  describe('stat', () => {
    it('should get file stats', async () => {
      const filePath = join(testDir, 'stats.txt');
      const content = 'test content';
      await fs.writeFile(filePath, content);

      const stats = await fs.stat(filePath);

      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.mtime).toBeInstanceOf(Date);
    });

    it('should get directory stats', async () => {
      const dirPath = join(testDir, 'statsdir');
      await fs.mkdir(dirPath);

      const stats = await fs.stat(dirPath);

      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('unlink / rmdir', () => {
    it('should delete file', async () => {
      const filePath = join(testDir, 'delete.txt');
      await fs.writeFile(filePath, 'content');

      await fs.unlink(filePath);
      const exists = await fs.exists(filePath);

      expect(exists).toBe(false);
    });

    it('should remove directory', async () => {
      const dirPath = join(testDir, 'deletedir');
      await fs.mkdir(dirPath);

      await fs.rmdir(dirPath);
      const exists = await fs.exists(dirPath);

      expect(exists).toBe(false);
    });
  });

  describe('copyFile', () => {
    it('should copy file', async () => {
      const srcPath = join(testDir, 'src.txt');
      const destPath = join(testDir, 'dest.txt');
      const content = 'copy me';

      await fs.writeFile(srcPath, content);
      await fs.copyFile(srcPath, destPath);

      const destContent = await fs.readFile(destPath);
      expect(destContent).toBe(content);
    });
  });

  describe('glob', () => {
    beforeEach(async () => {
      // Create test file structure
      await fs.writeFile(join(testDir, 'file1.ts'), 'content');
      await fs.writeFile(join(testDir, 'file2.ts'), 'content');
      await fs.writeFile(join(testDir, 'file3.js'), 'content');
      await fs.mkdir(join(testDir, 'subdir'));
      await fs.writeFile(join(testDir, 'subdir', 'file4.ts'), 'content');
    });

    it('should find files by glob pattern', async () => {
      const files = await fs.glob('*.ts', { cwd: testDir });

      expect(files).toContain('file1.ts');
      expect(files).toContain('file2.ts');
      expect(files).not.toContain('file3.js');
    });

    it('should find files recursively', async () => {
      const files = await fs.glob('**/*.ts', { cwd: testDir });

      expect(files).toContain('file1.ts');
      expect(files).toContain('file2.ts');
      expect(files).toContain('subdir/file4.ts');
    });

    it('should respect ignore patterns', async () => {
      const files = await fs.glob('**/*.ts', {
        cwd: testDir,
        ignore: ['subdir/**'],
      });

      expect(files).toContain('file1.ts');
      expect(files).toContain('file2.ts');
      expect(files).not.toContain('subdir/file4.ts');
    });
  });
});
