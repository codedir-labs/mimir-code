/**
 * Unit tests for FileSystemAdapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
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
      const readContent = await fs.readFile(filePath, 'utf-8');

      expect(readContent).toBe(content);
    });

    it('should write and read UTF-8 content', async () => {
      const filePath = join(testDir, 'utf8.txt');
      const content = 'Hello 世界 🌍';

      await fs.writeFile(filePath, content);
      const readContent = await fs.readFile(filePath, 'utf-8');

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

  describe('unlink', () => {
    it('should delete file', async () => {
      const filePath = join(testDir, 'delete.txt');
      await fs.writeFile(filePath, 'content');

      await fs.unlink(filePath);
      const exists = await fs.exists(filePath);

      expect(exists).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove directory recursively', async () => {
      const dirPath = join(testDir, 'deletedir');
      await fs.mkdir(dirPath);
      await fs.writeFile(join(dirPath, 'file.txt'), 'content');

      await fs.remove(dirPath);
      const exists = await fs.exists(dirPath);

      expect(exists).toBe(false);
    });

    it('should remove file', async () => {
      const filePath = join(testDir, 'remove.txt');
      await fs.writeFile(filePath, 'content');

      await fs.remove(filePath);
      const exists = await fs.exists(filePath);

      expect(exists).toBe(false);
    });
  });
});
