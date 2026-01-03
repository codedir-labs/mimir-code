/**
 * In-memory LRU cache for tokens and file contents
 */

import { logger } from './logger.js';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  size: number;
}

export interface CacheOptions {
  maxSize: number; // Maximum cache size in bytes
  maxAge?: number; // Maximum age in milliseconds
  onEvict?: (key: string, value: unknown) => void;
}

export class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private currentSize = 0;
  private maxSize: number;
  private maxAge?: number;
  private onEvict?: (key: string, value: T) => void;

  constructor(options: CacheOptions) {
    this.maxSize = options.maxSize;
    this.maxAge = options.maxAge;
    this.onEvict = options.onEvict;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.maxAge && Date.now() - entry.timestamp > this.maxAge) {
      this.delete(key);
      return undefined;
    }

    // Update access order (move to end)
    this.updateAccessOrder(key);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, size?: number): void {
    const entrySize = size ?? this.estimateSize(value);

    // If entry already exists, remove it first
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict entries until we have enough space
    while (this.currentSize + entrySize > this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder[0];
      this.delete(oldestKey!);
    }

    // Don't cache if entry is larger than max size
    if (entrySize > this.maxSize) {
      logger.warn('Cache entry too large', { key, size: entrySize, maxSize: this.maxSize });
      return;
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      size: entrySize,
    });
    this.accessOrder.push(key);
    this.currentSize += entrySize;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Call eviction callback
    if (this.onEvict) {
      this.onEvict(key, entry.value);
    }

    // Remove from cache
    this.cache.delete(key);
    this.currentSize -= entry.size;

    // Remove from access order
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }

    return true;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    // Call eviction callback for all entries
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }

    this.cache.clear();
    this.accessOrder = [];
    this.currentSize = 0;
  }

  /**
   * Get cache size in bytes
   */
  getSize(): number {
    return this.currentSize;
  }

  /**
   * Get number of entries
   */
  getCount(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    count: number;
    maxSize: number;
    utilization: number;
  } {
    return {
      size: this.currentSize,
      count: this.cache.size,
      maxSize: this.maxSize,
      utilization: this.currentSize / this.maxSize,
    };
  }

  /**
   * Update access order (move key to end)
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: T): number {
    if (typeof value === 'string') {
      return value.length * 2; // Approximate size in bytes (UTF-16)
    }

    if (typeof value === 'number') {
      return 8; // 64-bit number
    }

    if (typeof value === 'boolean') {
      return 4;
    }

    if (value == null) {
      return 0;
    }

    // For objects, use JSON.stringify to estimate size
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // Default estimate if serialization fails
    }
  }

  /**
   * Evict expired entries
   */
  evictExpired(): number {
    if (!this.maxAge) {
      return 0;
    }

    const now = Date.now();
    let evictedCount = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        this.delete(key);
        evictedCount++;
      }
    }

    return evictedCount;
  }
}

/**
 * Specialized cache for token counts
 */
export class TokenCache extends LRUCache<number> {
  constructor(maxSize = 10 * 1024 * 1024) {
    // 10MB default
    super({ maxSize });
  }

  /**
   * Get or compute token count
   */
  getOrCompute(text: string, compute: (text: string) => number): number {
    const key = this.hashText(text);
    const cached = this.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const count = compute(text);
    this.set(key, count, text.length * 2);
    return count;
  }

  /**
   * Simple hash function for text
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

/**
 * Specialized cache for file contents
 */
export class FileCache extends LRUCache<string> {
  constructor(maxSize = 50 * 1024 * 1024) {
    // 50MB default
    super({
      maxSize,
      maxAge: 5 * 60 * 1000, // 5 minutes
    });
  }

  /**
   * Cache file content with path as key
   */
  cacheFile(path: string, content: string): void {
    this.set(path, content, content.length * 2);
  }

  /**
   * Get cached file content
   */
  getFile(path: string): string | undefined {
    return this.get(path);
  }
}
