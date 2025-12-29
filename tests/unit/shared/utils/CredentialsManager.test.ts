/**
 * Unit tests for CredentialsManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Use vi.hoisted to define testHomedir BEFORE mocks are processed
// eslint-disable-next-line @typescript-eslint/no-require-imports
const testHomedir = vi.hoisted(() =>
  require('path').join(require('os').tmpdir(), 'mimir-test-home')
);

// Mock keytar
vi.mock('keytar', () => ({
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
}));

// Mock os.homedir to use test directory
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => testHomedir,
  };
});

// Import after mocks are set up
import { CredentialsManager, type StorageLocation } from '@/shared/utils/CredentialsManager.js';
import * as keytar from 'keytar';

describe('CredentialsManager', () => {
  let credentialsManager: CredentialsManager;
  let testDir: string;
  let expectedCredentialsPath: string;

  beforeEach(() => {
    credentialsManager = new CredentialsManager();
    testDir = join(tmpdir(), `mimir-test-${Date.now()}`);
    // This matches the mocked homedir path from the vi.mock('os') above
    expectedCredentialsPath = join(testHomedir, '.mimir', 'credentials.enc');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Cleanup mocked credentials path
    try {
      await fs.rm(testHomedir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('setKey', () => {
    it('should store API key in keychain', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-test-123';
      const location: StorageLocation = { type: 'keychain' };

      await credentialsManager.setKey(provider, apiKey, location);

      expect(keytar.setPassword).toHaveBeenCalledWith('com.codedir.mimir', provider, apiKey);
    });

    it('should store API key in encrypted file', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-test-123';
      // Using default path via mocked homedir()
      const location: StorageLocation = { type: 'file' };

      await credentialsManager.setKey(provider, apiKey, location);

      // Verify file was created
      const fileExists = await fs
        .access(expectedCredentialsPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file content is encrypted (not plaintext)
      const content = await fs.readFile(expectedCredentialsPath, 'utf-8');
      expect(content).not.toContain(apiKey);
      expect(content).toContain(provider);
    });

    it('should handle env var storage (logs instructions)', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-test-123';
      const location: StorageLocation = { type: 'env' };

      // Should not throw
      await expect(credentialsManager.setKey(provider, apiKey, location)).resolves.not.toThrow();

      // Should not call keytar
      expect(keytar.setPassword).not.toHaveBeenCalled();
    });

    it('should throw error for unsupported storage type', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-test-123';
      const location = { type: 'invalid' } as StorageLocation;

      await expect(credentialsManager.setKey(provider, apiKey, location)).rejects.toThrow(
        'Unsupported storage type'
      );
    });

    it('should create directory if it does not exist', async () => {
      const provider = 'anthropic';
      const apiKey = 'sk-ant-123';
      const location: StorageLocation = { type: 'file' };

      await credentialsManager.setKey(provider, apiKey, location);

      // Verify file was created (directory should be auto-created)
      const fileExists = await fs
        .access(expectedCredentialsPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('getKey', () => {
    it('should retrieve API key from environment variable first', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-env-123';

      // Set env var
      process.env.DEEPSEEK_API_KEY = apiKey;

      const result = await credentialsManager.getKey(provider);

      expect(result).toBe(apiKey);
      expect(keytar.getPassword).not.toHaveBeenCalled();

      // Cleanup
      delete process.env.DEEPSEEK_API_KEY;
    });

    it('should retrieve API key from keychain if no env var', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-keychain-123';

      vi.mocked(keytar.getPassword).mockResolvedValue(apiKey);

      const result = await credentialsManager.getKey(provider);

      expect(result).toBe(apiKey);
      expect(keytar.getPassword).toHaveBeenCalledWith('com.codedir.mimir', provider);
    });

    it('should retrieve API key from encrypted file if keychain fails', async () => {
      const provider = 'anthropic';
      const apiKey = 'sk-file-123';
      // Using default path via mocked homedir()

      // Store in file
      await credentialsManager.setKey(provider, apiKey, {
        type: 'file',
      });

      // Mock keychain failure
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('Keychain error'));

      const result = await credentialsManager.getKey(provider);

      expect(result).toBe(apiKey);
    });

    it('should return null if no API key found anywhere', async () => {
      const provider = 'openai';

      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await credentialsManager.getKey(provider);

      expect(result).toBeNull();
    });

    it('should decrypt encrypted file correctly', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-complex-key-with-special-chars-!@#$%^&*()';
      // Using default path via mocked homedir()

      // Store
      await credentialsManager.setKey(provider, apiKey, {
        type: 'file',
      });

      // Mock keychain failure to force file read
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Retrieve
      const result = await credentialsManager.getKey(provider);

      expect(result).toBe(apiKey);
    });
  });

  describe('deleteKey', () => {
    it('should delete API key from keychain', async () => {
      const provider = 'deepseek';

      await credentialsManager.deleteKey(provider);

      expect(keytar.deletePassword).toHaveBeenCalledWith('com.codedir.mimir', provider);
    });

    it('should delete API key from encrypted file', async () => {
      const provider = 'anthropic';
      const apiKey = 'sk-test-123';
      // Using default path via mocked homedir()

      // Store
      await credentialsManager.setKey(provider, apiKey, {
        type: 'file',
      });

      // Delete
      await credentialsManager.deleteKey(provider);

      // Try to retrieve - should fail
      vi.mocked(keytar.getPassword).mockResolvedValue(null);
      const result = await credentialsManager.getKey(provider);

      expect(result).toBeNull();
    });

    it('should delete file if no credentials remain', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-test-123';
      // Using default path via mocked homedir()

      // Store
      await credentialsManager.setKey(provider, apiKey, {
        type: 'file',
      });

      // Delete
      await credentialsManager.deleteKey(provider);

      // File should be deleted
      const fileExists = await fs
        .access(expectedCredentialsPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });

    it('should keep file if other credentials remain', async () => {
      // Using default path via mocked homedir()

      // Store two providers
      await credentialsManager.setKey('deepseek', 'sk-1', {
        type: 'file',
      });
      await credentialsManager.setKey('anthropic', 'sk-2', {
        type: 'file',
      });

      // Delete one
      await credentialsManager.deleteKey('deepseek');

      // File should still exist
      const fileExists = await fs
        .access(expectedCredentialsPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Other provider should still be retrievable
      vi.mocked(keytar.getPassword).mockResolvedValue(null);
      const result = await credentialsManager.getKey('anthropic');
      expect(result).toBe('sk-2');
    });
  });

  describe('listProviders', () => {
    it('should list providers from keychain', async () => {
      const keychainCreds = [
        { account: 'deepseek', password: 'sk-1' },
        { account: 'anthropic', password: 'sk-2' },
      ];

      vi.mocked(keytar.findCredentials).mockResolvedValue(keychainCreds);

      const providers = await credentialsManager.listProviders();

      expect(providers.length).toBeGreaterThanOrEqual(2);
      expect(providers.some((p) => p.provider === 'deepseek')).toBe(true);
      expect(providers.some((p) => p.provider === 'anthropic')).toBe(true);
      expect(providers[0].storage).toBe('keychain');
    });

    it('should list providers from encrypted file', async () => {
      // Using default path via mocked homedir()

      // Store providers
      await credentialsManager.setKey('deepseek', 'sk-1', {
        type: 'file',
      });
      await credentialsManager.setKey('openai', 'sk-3', {
        type: 'file',
      });

      // Mock keychain empty
      vi.mocked(keytar.findCredentials).mockResolvedValue([]);

      const providers = await credentialsManager.listProviders();

      expect(providers.length).toBe(2);
      expect(providers.some((p) => p.provider === 'deepseek')).toBe(true);
      expect(providers.some((p) => p.provider === 'openai')).toBe(true);
      expect(providers[0].storage).toBe('file');
    });

    it('should return empty array if no providers configured', async () => {
      vi.mocked(keytar.findCredentials).mockResolvedValue([]);

      const providers = await credentialsManager.listProviders();

      expect(providers).toEqual([]);
    });
  });

  describe('hasKey', () => {
    it('should return true if API key exists', async () => {
      const provider = 'deepseek';

      vi.mocked(keytar.getPassword).mockResolvedValue('sk-test-123');

      const result = await credentialsManager.hasKey(provider);

      expect(result).toBe(true);
    });

    it('should return false if API key does not exist', async () => {
      const provider = 'openai';

      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      const result = await credentialsManager.hasKey(provider);

      expect(result).toBe(false);
    });
  });

  describe('file permissions', () => {
    it('should set restrictive permissions on Unix', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows
        return;
      }

      const provider = 'deepseek';
      const apiKey = 'sk-test-123';
      // Using default path via mocked homedir()

      await credentialsManager.setKey(provider, apiKey, {
        type: 'file',
      });

      const stats = await fs.stat(expectedCredentialsPath);
      const mode = stats.mode & 0o777; // Get permission bits

      expect(mode).toBe(0o600); // Owner read/write only
    });
  });

  describe('encryption', () => {
    it('should use machine-specific encryption key', async () => {
      const provider = 'deepseek';
      const apiKey = 'sk-secret-123';
      // Using default path via mocked homedir()

      await credentialsManager.setKey(provider, apiKey, {
        type: 'file',
      });

      const content = await fs.readFile(expectedCredentialsPath, 'utf-8');
      const data = JSON.parse(content);

      // Verify encrypted data structure
      expect(data.version).toBe('1.0');
      expect(data.credentials[provider]).toBeDefined();
      expect(data.credentials[provider].encryptedKey).toBeDefined();
      expect(data.credentials[provider].iv).toBeDefined();
      expect(data.credentials[provider].configuredAt).toBeDefined();

      // Verify API key is not in plaintext
      expect(content).not.toContain(apiKey);
    });

    it('should decrypt with correct machine-specific key', async () => {
      const provider1 = 'deepseek';
      const provider2 = 'anthropic';
      const apiKey1 = 'sk-test-1';
      const apiKey2 = 'sk-test-2';
      // Using default path via mocked homedir()

      // Store multiple keys
      await credentialsManager.setKey(provider1, apiKey1, {
        type: 'file',
      });
      await credentialsManager.setKey(provider2, apiKey2, {
        type: 'file',
      });

      // Create new instance to simulate restart
      const newManager = new CredentialsManager();

      // Mock keychain to force file read
      vi.mocked(keytar.getPassword).mockResolvedValue(null);

      // Should decrypt correctly
      const result1 = await newManager.getKey(provider1);
      const result2 = await newManager.getKey(provider2);

      expect(result1).toBe(apiKey1);
      expect(result2).toBe(apiKey2);
    });
  });
});
