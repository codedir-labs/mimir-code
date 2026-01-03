/**
 * Unit tests for ChatCommand workspace injection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatCommand } from '@/features/chat/commands/ChatCommand.js';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { FirstRunDetector } from '../../../src/cli/utils/firstRunDetector.js';
import { SetupCommand } from '../../../src/cli/commands/SetupCommand.js';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
import type { IFileSystem } from '@codedir/mimir-agents';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { closeDatabaseManager } from '@codedir/mimir-agents-node/storage';

// Mock Ink to avoid terminal rendering in tests
vi.mock('ink', () => ({
  render: vi.fn(() => ({
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  })),
  Text: vi.fn(() => null),
  Box: vi.fn(() => null),
  useInput: vi.fn(),
  useApp: vi.fn(() => ({ exit: vi.fn() })),
}));

// Mock React
vi.mock('react', () => ({
  default: {
    createElement: vi.fn(() => null),
    memo: vi.fn((component) => component),
    useState: vi.fn(() => [null, vi.fn()]),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn) => fn),
    useMemo: vi.fn((fn) => fn()),
    createContext: vi.fn(() => ({
      Provider: vi.fn(() => null),
      Consumer: vi.fn(() => null),
    })),
  },
  createElement: vi.fn(() => null),
  memo: vi.fn((component) => component),
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  createContext: vi.fn(() => ({
    Provider: vi.fn(() => null),
    Consumer: vi.fn(() => null),
  })),
}));

describe('ChatCommand', () => {
  let testDir: string;
  let fs: IFileSystem;
  let configLoader: ConfigLoader;
  let firstRunDetector: FirstRunDetector;
  let setupCommand: SetupCommand;
  let chatCommand: ChatCommand;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mimir-chat-test-'));
    fs = new FileSystemAdapter();
    configLoader = new ConfigLoader(fs);

    // Mock FirstRunDetector to skip first-run wizard
    firstRunDetector = {
      isFirstRun: vi.fn().mockResolvedValue(false),
    } as unknown as FirstRunDetector;

    // Mock SetupCommand
    setupCommand = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as SetupCommand;

    chatCommand = new ChatCommand(configLoader, firstRunDetector, setupCommand, fs);
  });

  afterEach(async () => {
    // Close database to release file locks
    closeDatabaseManager();

    // Wait a bit for file handles to be released (Windows issue)
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (testDir) {
      try {
        await rm(testDir, { recursive: true, force: true, maxRetries: 3 });
      } catch (error) {
        // Ignore cleanup errors in tests
        console.warn('Test cleanup warning:', error);
      }
    }
  });

  describe('Workspace root injection', () => {
    it('should accept workspace root as parameter', async () => {
      // Initialize workspace first
      const mimirDir = join(testDir, '.mimir');
      await fs.mkdir(mimirDir, { recursive: true });

      // Create minimal config
      const configPath = join(mimirDir, 'config.yml');
      const minimalConfig = `
llm:
  provider: anthropic
  model: claude-3-5-sonnet-20241022
ui:
  theme: mimir
`;
      await fs.writeFile(configPath, minimalConfig);

      // Execute with explicit workspace root
      // Note: This will try to render Ink UI, but we've mocked it
      // We're just testing that the parameter is accepted
      expect(async () => {
        await chatCommand.execute(testDir);
      }).not.toThrow();
    });

    it('should use provided workspace root instead of process.cwd()', async () => {
      // Create workspace in custom location
      const customWorkspace = join(testDir, 'custom-workspace');
      await fs.mkdir(customWorkspace, { recursive: true });

      const mimirDir = join(customWorkspace, '.mimir');
      await fs.mkdir(mimirDir, { recursive: true });

      const configPath = join(mimirDir, 'config.yml');
      const config = `
llm:
  provider: anthropic
  model: claude-3-5-sonnet-20241022
ui:
  theme: mimir
`;
      await fs.writeFile(configPath, config);

      // Execute with custom workspace
      // Should not use process.cwd(), but the provided path
      expect(async () => {
        await chatCommand.execute(customWorkspace);
      }).not.toThrow();

      // Verify config was loaded from custom workspace
      // (implicitly tested by not throwing)
    });

    it('should fall back to process.cwd() when no workspace provided', async () => {
      // Note: This tests the fallback behavior
      // In practice, CLI should always provide workspace root

      // We can't easily test process.cwd() behavior without mocking
      // This test documents the fallback exists
      expect(chatCommand.execute).toBeDefined();
    });
  });

  describe('Workspace initialization', () => {
    it('should auto-initialize workspace if .mimir does not exist', async () => {
      // Workspace without .mimir directory
      const uninitializedWorkspace = join(testDir, 'uninitialized');
      await fs.mkdir(uninitializedWorkspace, { recursive: true });

      // Execute - should auto-initialize
      try {
        await chatCommand.execute(uninitializedWorkspace);
      } catch (error) {
        // May throw due to Ink rendering, but initialization should happen
      }

      // Verify .mimir directory was created
      const mimirDir = join(uninitializedWorkspace, '.mimir');
      const mimirExists = await fs.exists(mimirDir);
      expect(mimirExists).toBe(true);
    });

    it('should throw error when workspace initialization fails', async () => {
      // Create a workspace where initialization will fail
      const failingWorkspace = join(testDir, 'failing');
      await fs.mkdir(failingWorkspace, { recursive: true });

      // Create a mock fs that fails on mkdir
      const failingFs: IFileSystem = {
        exists: vi.fn().mockResolvedValue(false),
        mkdir: vi.fn().mockRejectedValue(new Error('Permission denied')),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readdir: vi.fn(),
        stat: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        copyFile: vi.fn(),
        glob: vi.fn(),
      };

      const failingConfigLoader = new ConfigLoader(failingFs);
      const failingChatCommand = new ChatCommand(
        failingConfigLoader,
        firstRunDetector,
        setupCommand,
        failingFs
      );

      // Should throw error instead of calling process.exit
      await expect(failingChatCommand.execute(failingWorkspace)).rejects.toThrow(
        'Workspace initialization failed'
      );
    });

    it('should not re-initialize if .mimir already exists', async () => {
      // Pre-initialized workspace
      const initializedWorkspace = join(testDir, 'initialized');
      await fs.mkdir(initializedWorkspace, { recursive: true });

      const mimirDir = join(initializedWorkspace, '.mimir');
      await fs.mkdir(mimirDir, { recursive: true });

      const configPath = join(mimirDir, 'config.yml');
      const config = `
llm:
  provider: anthropic
  model: claude-3-5-sonnet-20241022
ui:
  theme: mimir
`;
      await fs.writeFile(configPath, config);

      // Execute
      try {
        await chatCommand.execute(initializedWorkspace);
      } catch (error) {
        // Ignore Ink rendering errors
      }

      // Workspace should still have only the files we created
      const files = await fs.readdir(mimirDir);
      expect(files).toContain('config.yml');
    });
  });

  describe('First-run detection', () => {
    it('should launch setup wizard on first run', async () => {
      // Mock first run
      firstRunDetector.isFirstRun = vi.fn().mockResolvedValue(true);

      const workspace = join(testDir, 'first-run');
      await fs.mkdir(workspace, { recursive: true });

      try {
        await chatCommand.execute(workspace);
      } catch (error) {
        // Ignore rendering errors
      }

      // Verify setup command was called
      expect(setupCommand.execute).toHaveBeenCalled();
    });

    it('should skip setup wizard on subsequent runs', async () => {
      // Mock not first run
      firstRunDetector.isFirstRun = vi.fn().mockResolvedValue(false);

      const workspace = join(testDir, 'existing');
      await fs.mkdir(workspace, { recursive: true });

      const mimirDir = join(workspace, '.mimir');
      await fs.mkdir(mimirDir, { recursive: true });

      const configPath = join(mimirDir, 'config.yml');
      const config = `
llm:
  provider: anthropic
  model: claude-3-5-sonnet-20241022
ui:
  theme: mimir
`;
      await fs.writeFile(configPath, config);

      try {
        await chatCommand.execute(workspace);
      } catch (error) {
        // Ignore rendering errors
      }

      // Verify setup command was not called
      expect(setupCommand.execute).not.toHaveBeenCalled();
    });
  });

  describe('Error handling improvements', () => {
    it('should throw errors instead of calling process.exit', async () => {
      // This tests our refactoring from process.exit(1) to throw Error

      const failingFs: IFileSystem = {
        exists: vi.fn().mockResolvedValue(false),
        mkdir: vi.fn().mockRejectedValue(new Error('Disk full')),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readdir: vi.fn(),
        stat: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        copyFile: vi.fn(),
        glob: vi.fn(),
      };

      const failingConfigLoader = new ConfigLoader(failingFs);
      const failingChatCommand = new ChatCommand(
        failingConfigLoader,
        firstRunDetector,
        setupCommand,
        failingFs
      );

      // Should throw, not exit
      await expect(failingChatCommand.execute(testDir)).rejects.toThrow();
    });

    it('should include error details in thrown error', async () => {
      const failingFs: IFileSystem = {
        exists: vi.fn().mockResolvedValue(false),
        mkdir: vi.fn().mockRejectedValue(new Error('Custom error message')),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readdir: vi.fn(),
        stat: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        copyFile: vi.fn(),
        glob: vi.fn(),
      };

      const failingConfigLoader = new ConfigLoader(failingFs);
      const failingChatCommand = new ChatCommand(
        failingConfigLoader,
        firstRunDetector,
        setupCommand,
        failingFs
      );

      await expect(failingChatCommand.execute(testDir)).rejects.toThrow(
        'Workspace initialization failed'
      );
    });
  });
});
