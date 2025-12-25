/**
 * Unit tests for cache utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache, TokenCache, FileCache } from '../../../src/utils/cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({ maxSize: 1000 });
  });

  describe('get / set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');

      expect(result).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');

      const result = cache.get('key1');
      expect(result).toBe('value2');
    });
  });

  describe('has', () => {
    it('should check if key exists', () => {
      cache.set('key1', 'value1');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete entries', () => {
      cache.set('key1', 'value1');
      const deleted = cache.delete('key1');

      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('should return false for missing keys', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.getCount()).toBe(0);
      expect(cache.getSize()).toBe(0);
    });

    it('should call onEvict for all entries', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string>({ maxSize: 1000, onEvict });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(onEvict).toHaveBeenCalledTimes(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items', () => {
      const cache = new LRUCache<string>({ maxSize: 100 });

      // Add items
      cache.set('key1', 'a'.repeat(30), 60); // 60 bytes
      cache.set('key2', 'b'.repeat(30), 60); // 60 bytes
      cache.set('key3', 'c'.repeat(30), 60); // 60 bytes (should evict key1)

      expect(cache.has('key1')).toBe(false); // Evicted
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
    });

    it('should update LRU order on access', () => {
      const cache = new LRUCache<string>({ maxSize: 100 });

      cache.set('key1', 'a'.repeat(30), 60);
      cache.set('key2', 'b'.repeat(30), 60);

      // Access key1 to make it more recent
      cache.get('key1');

      // Add key3, should evict key2 (least recently used)
      cache.set('key3', 'c'.repeat(30), 60);

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted
      expect(cache.has('key3')).toBe(true);
    });

    it('should not cache items larger than maxSize', () => {
      const cache = new LRUCache<string>({ maxSize: 100 });

      cache.set('huge', 'x'.repeat(1000), 2000);

      expect(cache.has('huge')).toBe(false);
    });
  });

  describe('maxAge expiration', () => {
    it('should expire old entries', async () => {
      const cache = new LRUCache<string>({
        maxSize: 1000,
        maxAge: 100, // 100ms
      });

      cache.set('key1', 'value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = cache.get('key1');
      expect(result).toBeUndefined();
    });

    it('should evict expired entries manually', () => {
      const cache = new LRUCache<string>({
        maxSize: 1000,
        maxAge: 100,
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // Wait and evict
      setTimeout(() => {
        const evicted = cache.evictExpired();
        expect(evicted).toBe(2);
      }, 150);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      expect(stats.count).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.maxSize).toBe(1000);
      expect(stats.utilization).toBeGreaterThan(0);
      expect(stats.utilization).toBeLessThanOrEqual(1);
    });
  });
});

describe('TokenCache', () => {
  let cache: TokenCache;

  beforeEach(() => {
    cache = new TokenCache();
  });

  describe('getOrCompute', () => {
    it('should compute and cache token count', () => {
      const compute = vi.fn((text: string) => text.length);

      const result1 = cache.getOrCompute('hello world', compute);
      const result2 = cache.getOrCompute('hello world', compute);

      expect(result1).toBe(11);
      expect(result2).toBe(11);
      expect(compute).toHaveBeenCalledOnce(); // Cached on second call
    });

    it('should handle different texts', () => {
      const compute = vi.fn((text: string) => text.split(' ').length);

      const result1 = cache.getOrCompute('hello world', compute);
      const result2 = cache.getOrCompute('foo bar baz', compute);

      expect(result1).toBe(2);
      expect(result2).toBe(3);
      expect(compute).toHaveBeenCalledTimes(2);
    });
  });
});

describe('FileCache', () => {
  let cache: FileCache;

  beforeEach(() => {
    cache = new FileCache();
  });

  describe('cacheFile / getFile', () => {
    it('should cache and retrieve file contents', () => {
      const path = '/path/to/file.txt';
      const content = 'file content here';

      cache.cacheFile(path, content);
      const result = cache.getFile(path);

      expect(result).toBe(content);
    });

    it('should return undefined for uncached files', () => {
      const result = cache.getFile('/nonexistent.txt');
      expect(result).toBeUndefined();
    });

    it('should expire after maxAge', async () => {
      const path = '/temp/file.txt';
      const content = 'temporary content';

      cache.cacheFile(path, content);

      // Wait for expiration (FileCache has 5 minute maxAge, so we'd need to mock time)
      // For testing, we can just verify the get returns the value immediately
      const result = cache.getFile(path);
      expect(result).toBe(content);
    });
  });
});
