/**
 * Unit tests for path utilities
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  resolvePath,
  joinPath,
  relativePath,
  dirname,
  basename,
  extname,
  isAbsolute,
  sanitizePath,
  toUnixPath,
  toWindowsPath,
  getPathSeparator,
  parsePath,
  formatPath,
} from '../../../src/platform/pathUtils.js';
import { platform } from 'os';

describe('pathUtils', () => {
  describe('normalizePath', () => {
    it('should normalize path with forward slashes', () => {
      const result = normalizePath('foo\\bar\\baz');
      expect(result).toBe('foo/bar/baz');
    });

    it('should handle already normalized paths', () => {
      const result = normalizePath('foo/bar/baz');
      expect(result).toBe('foo/bar/baz');
    });

    it('should handle mixed slashes', () => {
      const result = normalizePath('foo/bar\\baz');
      expect(result).toBe('foo/bar/baz');
    });
  });

  describe('resolvePath', () => {
    it('should resolve path to absolute', () => {
      const result = resolvePath('foo', 'bar');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('should handle absolute path', () => {
      const isWindows = platform() === 'win32';
      const absolutePath = isWindows ? 'C:\\foo\\bar' : '/foo/bar';

      const result = resolvePath(absolutePath);
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });
  });

  describe('joinPath', () => {
    it('should join path segments', () => {
      const result = joinPath('foo', 'bar', 'baz');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
      expect(result).toContain('baz');
    });

    it('should handle empty segments', () => {
      const result = joinPath('foo', '', 'bar');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });
  });

  describe('relativePath', () => {
    it('should compute relative path', () => {
      const from = '/foo/bar';
      const to = '/foo/baz';

      const result = relativePath(from, to);
      expect(result).toContain('baz');
    });
  });

  describe('dirname', () => {
    it('should get directory name', () => {
      const result = dirname('/foo/bar/baz.txt');
      expect(result).toContain('bar');
    });

    it('should handle Windows paths', () => {
      const result = dirname('C:\\foo\\bar\\baz.txt');
      expect(result).toContain('bar');
    });
  });

  describe('basename', () => {
    it('should get file name', () => {
      const result = basename('/foo/bar/baz.txt');
      expect(result).toBe('baz.txt');
    });

    it('should get file name without extension', () => {
      const result = basename('/foo/bar/baz.txt', '.txt');
      expect(result).toBe('baz');
    });
  });

  describe('extname', () => {
    it('should get file extension', () => {
      const result = extname('file.txt');
      expect(result).toBe('.txt');
    });

    it('should handle multiple dots', () => {
      const result = extname('file.test.ts');
      expect(result).toBe('.ts');
    });

    it('should return empty for no extension', () => {
      const result = extname('file');
      expect(result).toBe('');
    });
  });

  describe('isAbsolute', () => {
    it('should detect absolute Unix path', () => {
      const result = isAbsolute('/foo/bar');
      expect(result).toBe(true);
    });

    it('should detect absolute Windows path', () => {
      const result = isAbsolute('C:\\foo\\bar');
      expect(result).toBe(true);
    });

    it('should detect relative path', () => {
      const result = isAbsolute('foo/bar');
      expect(result).toBe(false);
    });
  });

  describe('toUnixPath', () => {
    it('should convert Windows path to Unix', () => {
      const result = toUnixPath('C:\\foo\\bar\\baz');
      expect(result).toBe('C:/foo/bar/baz');
    });

    it('should handle already Unix paths', () => {
      const result = toUnixPath('/foo/bar/baz');
      expect(result).toBe('/foo/bar/baz');
    });
  });

  describe('toWindowsPath', () => {
    it('should convert Unix path to Windows', () => {
      const result = toWindowsPath('C:/foo/bar/baz');
      expect(result).toBe('C:\\foo\\bar\\baz');
    });

    it('should handle already Windows paths', () => {
      const result = toWindowsPath('C:\\foo\\bar\\baz');
      expect(result).toBe('C:\\foo\\bar\\baz');
    });
  });

  describe('sanitizePath', () => {
    it('should allow paths within base directory', () => {
      const baseDir = '/home/user/project';
      const filePath = 'src/index.ts';

      const result = sanitizePath(filePath, baseDir);
      expect(result).toContain('project');
      expect(result).toContain('src');
    });

    it('should prevent directory traversal', () => {
      const baseDir = '/home/user/project';
      const filePath = '../../../etc/passwd';

      expect(() => sanitizePath(filePath, baseDir)).toThrow('Path traversal detected');
    });

    it('should allow absolute paths within base', () => {
      const baseDir = '/home/user/project';
      const filePath = '/home/user/project/src/index.ts';

      const result = sanitizePath(filePath, baseDir);
      expect(result).toContain('src');
    });
  });

  describe('parsePath', () => {
    it('should parse path into components', () => {
      const result = parsePath('/foo/bar/baz.txt');

      expect(result.dir).toContain('bar');
      expect(result.base).toBe('baz.txt');
      expect(result.name).toBe('baz');
      expect(result.ext).toBe('.txt');
    });

    it('should parse Windows path', () => {
      const result = parsePath('C:\\foo\\bar\\baz.txt');

      expect(result.base).toBe('baz.txt');
      expect(result.name).toBe('baz');
      expect(result.ext).toBe('.txt');
    });
  });

  describe('formatPath', () => {
    it('should format path from components', () => {
      const result = formatPath({
        dir: '/foo/bar',
        base: 'baz.txt',
      });

      expect(result).toContain('bar');
      expect(result).toContain('baz.txt');
    });

    it('should prioritize base over name+ext', () => {
      const result = formatPath({
        dir: '/foo',
        base: 'bar.txt',
        name: 'baz',
        ext: '.js',
      });

      expect(result).toContain('bar.txt');
    });
  });

  describe('getPathSeparator', () => {
    it('should return platform-specific separator', () => {
      const separator = getPathSeparator();
      expect(['/', '\\'].includes(separator)).toBe(true);
    });
  });
});
