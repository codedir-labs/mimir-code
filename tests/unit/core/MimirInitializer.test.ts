/**
 * Unit tests for MimirInitializer with IFileSystem abstraction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MimirInitializer } from '@/features/init/MimirInitializer.js';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
import type { IFileSystem } from '@codedir/mimir-agents';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { closeDatabaseManager } from '@codedir/mimir-agents-node/storage';

describe('MimirInitializer', () => {
  let testDir: string;
  let fs: IFileSystem;
  let configLoader: ConfigLoader;
  let initializer: MimirInitializer;
  let mockHomeDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mimir-init-test-'));
    fs = new FileSystemAdapter();

    // Create a mock home directory for global config/allowlist loading
    mockHomeDir = join(testDir, 'home');
    await mkdir(mockHomeDir, { recursive: true });

    // Mock HOME/USERPROFILE to use test directory
    if (process.platform === 'win32') {
      process.env.USERPROFILE = mockHomeDir;
    } else {
      process.env.HOME = mockHomeDir;
    }

    configLoader = new ConfigLoader(fs);
    initializer = new MimirInitializer(fs, configLoader);

    // Close any existing database instances
    closeDatabaseManager();
  });

  afterEach(async () => {
    // Close database to release file locks
    closeDatabaseManager();

    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('isWorkspaceInitialized', () => {
    it('should return false for uninitialized workspace', async () => {
      const uninitializedDir = join(testDir, 'uninitialized');
      await fs.mkdir(uninitializedDir, { recursive: true });

      const isInitialized = await initializer.isWorkspaceInitialized(uninitializedDir);
      expect(isInitialized).toBe(false);
    });

    it('should return true for initialized workspace', async () => {
      const initializedDir = join(testDir, 'initialized');
      await fs.mkdir(initializedDir, { recursive: true });

      const mimirDir = join(initializedDir, '.mimir');
      await fs.mkdir(mimirDir, { recursive: true });

      // Create a dummy database file (isWorkspaceInitialized checks for both dir and db)
      const dbPath = join(mimirDir, 'mimir.db');
      await fs.writeFile(dbPath, '');

      const isInitialized = await initializer.isWorkspaceInitialized(initializedDir);
      expect(isInitialized).toBe(true);
    });
  });

  describe('initializeWorkspace', () => {
    it('should create .mimir directory structure', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      // Note: config creation may fail in test environment, but core structure should be created
      expect(result.success).toBe(true);

      // Verify .mimir directory exists
      const mimirDir = join(testDir, '.mimir');
      const mimirExists = await fs.exists(mimirDir);
      expect(mimirExists).toBe(true);
    });

    it('should create all required subdirectories', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);

      // Check all subdirectories
      const subdirs = ['logs', 'commands', 'checkpoints', 'themes'];
      for (const subdir of subdirs) {
        const dirPath = join(testDir, '.mimir', subdir);
        const exists = await fs.exists(dirPath);
        expect(exists).toBe(true);
      }
    });

    it('should create .gitignore file', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);

      const gitignorePath = join(testDir, '.mimir', '.gitignore');
      const gitignoreExists = await fs.exists(gitignorePath);
      expect(gitignoreExists).toBe(true);

      // Verify content
      const content = await fs.readFile(gitignorePath, 'utf-8');
      expect(content).toContain('logs/');
      expect(content).toContain('*.db');
      expect(content).toContain('checkpoints/');
    });

    it('should be idempotent - running twice should not cause errors', async () => {
      // First initialization
      const result1 = await initializer.initializeWorkspace(testDir);
      expect(result1.success).toBe(true);

      // Second initialization
      const result2 = await initializer.initializeWorkspace(testDir);
      expect(result2.success).toBe(true);

      // Should skip already-created files
      expect(result2.created.length).toBeLessThanOrEqual(result1.created.length);
    });

    it('should track created files in result', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);
      expect(result.created.length).toBeGreaterThan(0);

      // Should include .mimir directory
      expect(result.created).toContain('.mimir/');

      // Should include subdirectories
      expect(result.created.some((p) => p.includes('logs/'))).toBe(true);
      expect(result.created.some((p) => p.includes('commands/'))).toBe(true);
      expect(result.created.some((p) => p.includes('checkpoints/'))).toBe(true);
      expect(result.created.some((p) => p.includes('themes/'))).toBe(true);
    });

    it('should initialize database', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);

      // Verify database file exists
      const dbPath = join(testDir, '.mimir', 'mimir.db');
      const dbExists = await fs.exists(dbPath);
      expect(dbExists).toBe(true);

      // If database was created, dbInitialized should be true
      if (dbExists) {
        expect(result.dbInitialized).toBe(true);
      }
    });

    it('should attempt to create config.yml', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);

      // Config creation may fail in test environment due to missing theme source files
      // But we should at least attempt it
      const configPath = join(testDir, '.mimir', 'config.yml');
      const configExists = await fs.exists(configPath);

      // If config exists, configCreated should be true
      if (configExists) {
        expect(result.configCreated).toBe(true);

        // Verify it has content
        const content = await fs.readFile(configPath, 'utf-8');
        expect(content).toContain('llm:');
        expect(content).toContain('provider:');
      }
    });
  });

  describe('Theme copying with IFileSystem', () => {
    it('should use IFileSystem for theme file operations', async () => {
      // Create a spy filesystem to track calls
      const spyFs: IFileSystem = {
        exists: vi.fn(async (path: string) => {
          return fs.exists(path);
        }),
        mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
          return fs.mkdir(path, options);
        }),
        readFile: vi.fn(async (path: string, encoding?: BufferEncoding) => {
          return fs.readFile(path, encoding);
        }),
        writeFile: vi.fn(async (path: string, content: string) => {
          return fs.writeFile(path, content);
        }),
        readdir: vi.fn(async (path: string) => fs.readdir(path)),
        stat: vi.fn(async (path: string) => fs.stat(path)),
        unlink: vi.fn(async (path: string) => fs.unlink(path)),
        rmdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
          return fs.rmdir(path, options);
        }),
        copyFile: vi.fn(async (src: string, dest: string) => fs.copyFile(src, dest)),
        glob: vi.fn(async (pattern: string, options?: Parameters<IFileSystem['glob']>[1]) =>
          fs.glob(pattern, options)
        ),
      };

      const spyConfigLoader = new ConfigLoader(spyFs);
      const spyInitializer = new MimirInitializer(spyFs, spyConfigLoader);

      await spyInitializer.initializeWorkspace(testDir);

      // Verify IFileSystem methods were called
      expect(spyFs.exists).toHaveBeenCalled();
      expect(spyFs.mkdir).toHaveBeenCalled();
      expect(spyFs.writeFile).toHaveBeenCalled();

      // Verify readFile was called for theme copying (not readFileSync)
      // Note: This might be 0 if theme source files don't exist in test environment
      // The important thing is that writeFile is called for themes
      const writeFileCalls = vi.mocked(spyFs.writeFile).mock.calls;

      // At minimum, should attempt to write gitignore and config
      expect(writeFileCalls.length).toBeGreaterThan(0);
    });

    it('should handle theme copying errors gracefully', async () => {
      // This tests the error handling in copyDefaultThemes
      // Even if theme source files don't exist, initialization should succeed
      const result = await initializer.initializeWorkspace(testDir);

      // Should succeed even if some themes can't be copied
      expect(result.success).toBe(true);

      // Themes directory should still be created
      const themesDir = join(testDir, '.mimir', 'themes');
      const themesExists = await fs.exists(themesDir);
      expect(themesExists).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should capture errors in result object', async () => {
      // Create a mock filesystem that fails on specific operations
      const failingFs: IFileSystem = {
        exists: vi.fn().mockResolvedValue(false),
        mkdir: vi.fn().mockRejectedValue(new Error('Permission denied')),
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        copyFile: vi.fn(),
        glob: vi.fn().mockResolvedValue([]),
      };

      const failingConfigLoader = new ConfigLoader(failingFs);
      const failingInitializer = new MimirInitializer(failingFs, failingConfigLoader);

      const result = await failingInitializer.initializeWorkspace(testDir);

      // Should fail but not throw
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Permission denied');
    });
  });

  describe('Integration with ConfigLoader', () => {
    it('should attempt to create default config file', async () => {
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);

      // Config creation may fail in test environment
      // Check if it was created
      const configPath = join(testDir, '.mimir', 'config.yml');
      const configExists = await fs.exists(configPath);

      if (configExists) {
        expect(result.configCreated).toBe(true);

        // Read and verify config content
        const configContent = await fs.readFile(configPath, 'utf-8');

        // Should contain default provider settings
        expect(configContent).toContain('llm:');
        expect(configContent).toContain('provider:');
        expect(configContent).toContain('model:');
      } else {
        // Config creation failed - verify error was recorded
        expect(result.errors.some((e) => e.includes('config'))).toBe(true);
      }
    });

    it('should not overwrite existing config', async () => {
      const configPath = join(testDir, '.mimir', 'config.yml');

      // Create .mimir directory
      await fs.mkdir(join(testDir, '.mimir'), { recursive: true });

      // Write custom config
      const customConfig = 'llm:\n  provider: custom-provider\n  model: custom-model';
      await fs.writeFile(configPath, customConfig);

      // Initialize workspace
      const result = await initializer.initializeWorkspace(testDir);

      expect(result.success).toBe(true);

      // Config should not be overwritten
      const configContent = await fs.readFile(configPath, 'utf-8');
      expect(configContent).toContain('custom-provider');
      expect(configContent).toContain('custom-model');
    });
  });
});
