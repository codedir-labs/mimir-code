/**
 * Secure credentials management for API keys
 * Supports multiple storage backends: OS Keychain, Encrypted File, Environment Variables
 */

import * as keytar from 'keytar';
import CryptoJS from 'crypto-js';
import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { logger } from './logger.js';

/**
 * Storage location types
 */
export type StorageLocationType = 'keychain' | 'file' | 'env';

/**
 * Storage location configuration
 */
export interface StorageLocation {
  type: StorageLocationType;
  path?: string; // For 'file' type
}

/**
 * Provider credential metadata
 */
export interface CredentialMetadata {
  provider: string;
  storage: StorageLocationType;
  configuredAt: Date;
}

/**
 * Encrypted credentials file format
 */
interface EncryptedCredentialsFile {
  version: '1.0';
  credentials: {
    [provider: string]: {
      encryptedKey: string;
      iv: string;
      configuredAt: string;
    };
  };
}

/**
 * Service name for keychain
 */
const KEYCHAIN_SERVICE = 'com.codedir.mimir';

/**
 * Default encrypted file path
 */
const DEFAULT_CREDENTIALS_PATH = join(homedir(), '.mimir', 'credentials.enc');

/**
 * Secure credentials manager
 */
export class CredentialsManager {
  private encryptionKey: string;

  constructor() {
    // Derive encryption key from machine-specific data
    this.encryptionKey = this.deriveEncryptionKey();
  }

  /**
   * Derive machine-specific encryption key
   */
  private deriveEncryptionKey(): string {
    // Use machine-specific data for encryption key
    // In production, this could use DPAPI on Windows, Keychain on macOS, etc.
    const machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'default';
    const salt = 'mimir-credentials-v1';
    return CryptoJS.PBKDF2(machineId + salt, salt, {
      keySize: 256 / 32,
      iterations: 1000,
    }).toString();
  }

  /**
   * Store API key
   */
  async setKey(provider: string, apiKey: string, location: StorageLocation): Promise<void> {
    logger.debug('Storing API key', { provider, storage: location.type });

    try {
      switch (location.type) {
        case 'keychain':
          await this.setKeychainKey(provider, apiKey);
          break;

        case 'file':
          await this.setFileKey(provider, apiKey, location.path);
          break;

        case 'env':
          // For env vars, we just log instructions
          logger.info('To use environment variable storage, set:', {
            variable: this.getEnvVarName(provider),
          });
          break;

        default:
          throw new Error(`Unsupported storage type: ${location.type}`);
      }

      logger.info('API key stored successfully', { provider, storage: location.type });
    } catch (error) {
      logger.error('Failed to store API key', { provider, error });
      throw new Error(`Failed to store API key for ${provider}: ${error.message}`);
    }
  }

  /**
   * Retrieve API key
   */
  async getKey(provider: string): Promise<string | null> {
    logger.debug('Retrieving API key', { provider });

    // Try environment variable first
    const envKey = this.getEnvKey(provider);
    if (envKey) {
      logger.debug('Using API key from environment variable', { provider });
      return envKey;
    }

    // Try keychain
    try {
      const keychainKey = await this.getKeychainKey(provider);
      if (keychainKey) {
        logger.debug('Using API key from keychain', { provider });
        return keychainKey;
      }
    } catch (error) {
      logger.debug('Keychain retrieval failed, trying file', { provider, error: error.message });
    }

    // Try encrypted file
    try {
      const fileKey = await this.getFileKey(provider);
      if (fileKey) {
        logger.debug('Using API key from encrypted file', { provider });
        return fileKey;
      }
    } catch (error) {
      logger.debug('File retrieval failed', { provider, error: error.message });
    }

    logger.warn('No API key found for provider', { provider });
    return null;
  }

  /**
   * Delete API key
   */
  async deleteKey(provider: string): Promise<void> {
    logger.debug('Deleting API key', { provider });

    let deleted = false;

    // Try keychain
    try {
      await keytar.deletePassword(KEYCHAIN_SERVICE, provider);
      deleted = true;
    } catch (error) {
      logger.debug('Keychain deletion failed', { provider, error: error.message });
    }

    // Try encrypted file
    try {
      await this.deleteFileKey(provider);
      deleted = true;
    } catch (error) {
      logger.debug('File deletion failed', { provider, error: error.message });
    }

    if (deleted) {
      logger.info('API key deleted', { provider });
    } else {
      logger.warn('No API key found to delete', { provider });
    }
  }

  /**
   * List configured providers
   */
  async listProviders(): Promise<CredentialMetadata[]> {
    const providers: CredentialMetadata[] = [];

    // Check keychain
    try {
      const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE);
      for (const cred of credentials) {
        providers.push({
          provider: cred.account,
          storage: 'keychain',
          configuredAt: new Date(), // Keychain doesn't store timestamp
        });
      }
    } catch (error) {
      logger.debug('Failed to list keychain credentials', { error: error.message });
    }

    // Check encrypted file
    try {
      const fileProviders = await this.listFileProviders();
      providers.push(...fileProviders);
    } catch (error) {
      logger.debug('Failed to list file credentials', { error: error.message });
    }

    return providers;
  }

  /**
   * Check if provider has stored credentials
   */
  async hasKey(provider: string): Promise<boolean> {
    const key = await this.getKey(provider);
    return key !== null;
  }

  /**
   * Keychain operations
   */
  private async setKeychainKey(provider: string, apiKey: string): Promise<void> {
    await keytar.setPassword(KEYCHAIN_SERVICE, provider, apiKey);
  }

  private async getKeychainKey(provider: string): Promise<string | null> {
    return await keytar.getPassword(KEYCHAIN_SERVICE, provider);
  }

  /**
   * Encrypted file operations
   */
  private async setFileKey(provider: string, apiKey: string, customPath?: string): Promise<void> {
    const filePath = customPath || DEFAULT_CREDENTIALS_PATH;

    // Ensure directory exists
    const dir = join(filePath, '..');
    await fs.mkdir(dir, { recursive: true });

    // Load existing file or create new
    let data: EncryptedCredentialsFile;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content);
    } catch {
      data = {
        version: '1.0',
        credentials: {},
      };
    }

    // Encrypt API key
    const iv = CryptoJS.lib.WordArray.random(16).toString();
    const encrypted = CryptoJS.AES.encrypt(apiKey, this.encryptionKey, {
      iv: CryptoJS.enc.Hex.parse(iv),
    }).toString();

    // Store encrypted credential
    data.credentials[provider] = {
      encryptedKey: encrypted,
      iv,
      configuredAt: new Date().toISOString(),
    };

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // Set restrictive permissions (Unix only)
    if (process.platform !== 'win32') {
      await fs.chmod(filePath, 0o600);
    }
  }

  private async getFileKey(provider: string, customPath?: string): Promise<string | null> {
    const filePath = customPath || DEFAULT_CREDENTIALS_PATH;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data: EncryptedCredentialsFile = JSON.parse(content);

      const credential = data.credentials[provider];
      if (!credential) {
        return null;
      }

      // Decrypt API key
      const decrypted = CryptoJS.AES.decrypt(credential.encryptedKey, this.encryptionKey, {
        iv: CryptoJS.enc.Hex.parse(credential.iv),
      });

      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async deleteFileKey(provider: string, customPath?: string): Promise<void> {
    const filePath = customPath || DEFAULT_CREDENTIALS_PATH;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data: EncryptedCredentialsFile = JSON.parse(content);

      delete data.credentials[provider];

      // If no credentials left, delete file
      if (Object.keys(data.credentials).length === 0) {
        await fs.unlink(filePath);
      } else {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async listFileProviders(): Promise<CredentialMetadata[]> {
    const filePath = DEFAULT_CREDENTIALS_PATH;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data: EncryptedCredentialsFile = JSON.parse(content);

      return Object.entries(data.credentials).map(([provider, cred]) => ({
        provider,
        storage: 'file' as StorageLocationType,
        configuredAt: new Date(cred.configuredAt),
      }));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Environment variable operations
   */
  private getEnvKey(provider: string): string | null {
    const envVar = this.getEnvVarName(provider);
    return process.env[envVar] || null;
  }

  private getEnvVarName(provider: string): string {
    return `${provider.toUpperCase()}_API_KEY`;
  }
}
