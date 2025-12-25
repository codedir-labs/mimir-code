/**
 * Unit tests for DatabaseManager with IFileSystem abstraction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DatabaseManager,
  DatabaseConfig,
  closeDatabaseManager,
} from '../../../src/storage/Database.js';
import { FileSystemAdapter } from '../../../src/platform/FileSystemAdapter.js';
import type { IFileSystem } from '../../../src/platform/IFileSystem.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('DatabaseManager', () => {
  let testDir: string;
  let fs: IFileSystem;
  let dbPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mimir-db-test-'));
    fs = new FileSystemAdapter();
    dbPath = join(testDir, '.mimir', 'test.db');

    // Close any existing singleton instance
    closeDatabaseManager();
  });

  afterEach(async () => {
    closeDatabaseManager();

    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('DatabaseManager.create() factory method', () => {
    it('should create database using IFileSystem abstraction', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      expect(db).toBeDefined();
      expect(db.getDb()).toBeDefined();
      expect(db.getSqlite()).toBeDefined();

      // Verify database file was created
      const dbExists = await fs.exists(dbPath);
      expect(dbExists).toBe(true);

      // Close database to release file lock
      db.close();
    });

    it('should create database directory if it does not exist', async () => {
      const nestedPath = join(testDir, 'nested', 'path', '.mimir', 'test.db');
      const config: DatabaseConfig = {
        path: nestedPath,
        fileSystem: fs,
        verbose: false,
      };

      // Directory should not exist yet
      const dirPath = join(testDir, 'nested', 'path', '.mimir');
      const dirExistsBefore = await fs.exists(dirPath);
      expect(dirExistsBefore).toBe(false);

      const db = await DatabaseManager.create(config);

      // Directory should now exist
      const dirExistsAfter = await fs.exists(dirPath);
      expect(dirExistsAfter).toBe(true);

      // Database should be created
      const dbExists = await fs.exists(nestedPath);
      expect(dbExists).toBe(true);

      db.close();
    });

    it('should handle existing database directory gracefully', async () => {
      const dbDir = join(testDir, '.mimir');
      await fs.mkdir(dbDir, { recursive: true });

      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      // Should not throw even though directory exists
      const db = await DatabaseManager.create(config);
      expect(db).toBeDefined();

      db.close();
    });

    it('should use mock IFileSystem in tests', async () => {
      // Create directory for database (better-sqlite3 requires parent dir to exist)
      await fs.mkdir(join(testDir, '.mimir'), { recursive: true });

      // Create a mock filesystem that delegates actual file operations
      const mockFs: IFileSystem = {
        exists: vi.fn().mockResolvedValue(false),
        mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
          // Actually create the directory for better-sqlite3
          return fs.mkdir(path, options);
        }),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readdir: vi.fn(),
        stat: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        copyFile: vi.fn(),
        glob: vi.fn(),
      };

      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: mockFs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      // Verify mock was called
      expect(mockFs.exists).toHaveBeenCalledWith(join(testDir, '.mimir'));
      expect(mockFs.mkdir).toHaveBeenCalledWith(join(testDir, '.mimir'), { recursive: true });

      db.close();
    });
  });

  describe('Database operations', () => {
    it('should execute queries successfully', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      // Test a simple query
      const result = db.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      db.close();
    });

    it('should support transactions', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      // Test transaction
      expect(() => {
        db.transaction((tx) => {
          // Transaction operations would go here
          return true;
        });
      }).not.toThrow();

      db.close();
    });

    it('should have WAL mode enabled', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      const stats = db.getStats();
      expect(stats.walMode).toBe(true);

      db.close();
    });

    it('should vacuum database', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      // Should not throw
      expect(() => db.vacuum()).not.toThrow();

      db.close();
    });
  });

  describe('Backward compatibility fallback', () => {
    it('should fall back to sync fs when no IFileSystem provided', async () => {
      // Note: This tests the fallback path for legacy code
      // We want this to work but prefer the IFileSystem path

      const config: DatabaseConfig = {
        path: dbPath,
        verbose: false,
        // No fileSystem provided - uses fallback
      };

      const db = await DatabaseManager.create(config);
      expect(db).toBeDefined();

      // Verify database was created
      const dbExists = await fs.exists(dbPath);
      expect(dbExists).toBe(true);

      db.close();
    });
  });

  describe('Database initialization', () => {
    it('should initialize with default pricing data', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      // Check that pricing table has data
      const pricingData = db.query<{ count: number }>('SELECT COUNT(*) as count FROM pricing');

      expect(pricingData).toBeDefined();
      expect(pricingData[0].count).toBeGreaterThan(0);

      db.close();
    });

    it('should create all required tables', async () => {
      const config: DatabaseConfig = {
        path: dbPath,
        fileSystem: fs,
        verbose: false,
      };

      const db = await DatabaseManager.create(config);

      const requiredTables = [
        'conversations',
        'messages',
        'tool_calls',
        'permissions',
        'checkpoints',
        'cost_summary',
        'session_state',
        'metrics',
        'pricing',
        'migrations',
      ];

      for (const tableName of requiredTables) {
        const result = db.query<{ count: number }>(
          `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        );

        expect(result[0].count).toBe(1);
      }

      db.close();
    });
  });
});
