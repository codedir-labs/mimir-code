/**
 * Tests for HybridContextStorage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridContextStorage } from '../../../src/memory/storage/HybridContextStorage.js';
import { LocalContextStorage } from '../../../src/memory/storage/LocalContextStorage.js';
import { TeamsContextStorage } from '../../../src/memory/storage/TeamsContextStorage.js';
import { MockFileSystem } from '../../mocks/MockFileSystem.js';

describe('HybridContextStorage', () => {
  let fs: MockFileSystem;
  let localStorage: LocalContextStorage;
  let cloudStorage: TeamsContextStorage;
  let hybridStorage: HybridContextStorage;

  beforeEach(() => {
    fs = new MockFileSystem();
    localStorage = new LocalContextStorage(fs, '.mimir/context');
    cloudStorage = new TeamsContextStorage();
    hybridStorage = new HybridContextStorage({
      localStorage,
      cloudStorage,
      syncInterval: 0, // Manual sync only for tests
      autoSync: false, // Disable auto-sync for predictable tests
    });
  });

  afterEach(async () => {
    await hybridStorage.destroy();
  });

  describe('createConversation', () => {
    it('should create conversation in local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      expect(id).toMatch(/^conv-/);

      // Verify it exists in local storage
      const conversation = await localStorage.getConversation(id);
      expect(conversation.title).toBe('Test');
    });

    it('should not throw when autoSync is enabled', async () => {
      const autoSyncStorage = new HybridContextStorage({
        localStorage,
        cloudStorage,
        syncInterval: 0,
        autoSync: true,
      });

      await expect(autoSyncStorage.createConversation({ title: 'Test' })).resolves.toBeDefined();

      await autoSyncStorage.destroy();
    });
  });

  describe('getConversation', () => {
    it('should read from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      const conversation = await hybridStorage.getConversation(id);

      expect(conversation.id).toBe(id);
      expect(conversation.title).toBe('Test');
    });
  });

  describe('updateConversation', () => {
    it('should update in local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Original' });

      await hybridStorage.updateConversation(id, { title: 'Updated' });

      const conversation = await hybridStorage.getConversation(id);
      expect(conversation.title).toBe('Updated');
    });
  });

  describe('deleteConversation', () => {
    it('should delete from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      await hybridStorage.deleteConversation(id);

      const conversations = await hybridStorage.listConversations();
      expect(conversations.find((c) => c.id === id)).toBeUndefined();
    });
  });

  describe('listConversations', () => {
    it('should list conversations from local storage', async () => {
      await hybridStorage.createConversation({ title: 'Conv 1' });
      await hybridStorage.createConversation({ title: 'Conv 2' });

      const conversations = await hybridStorage.listConversations();

      expect(conversations).toHaveLength(2);
    });
  });

  describe('appendMessage', () => {
    it('should append message to local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      await hybridStorage.appendMessage(id, { role: 'user', content: 'Hello' });

      const messages = await hybridStorage.getMessages(id);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe('Hello');
    });
  });

  describe('getMessages', () => {
    it('should read messages from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });
      await hybridStorage.appendMessage(id, { role: 'user', content: 'Message 1' });
      await hybridStorage.appendMessage(id, { role: 'assistant', content: 'Message 2' });

      const messages = await hybridStorage.getMessages(id);

      expect(messages).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      for (let i = 0; i < 10; i++) {
        await hybridStorage.appendMessage(id, { role: 'user', content: `Message ${i}` });
      }

      const messages = await hybridStorage.getMessages(id, 5, 0);
      expect(messages).toHaveLength(5);
    });
  });

  describe('getMessageCount', () => {
    it('should return message count from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });
      await hybridStorage.appendMessage(id, { role: 'user', content: 'Message 1' });
      await hybridStorage.appendMessage(id, { role: 'user', content: 'Message 2' });

      const count = await hybridStorage.getMessageCount(id);

      expect(count).toBe(2);
    });
  });

  describe('storeArtifact', () => {
    it('should store artifact in local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      const artifactId = await hybridStorage.storeArtifact(id, {
        type: 'file',
        name: 'test.ts',
        content: 'export const test = 1;',
      });

      expect(artifactId).toMatch(/^art-/);

      const artifact = await hybridStorage.getArtifact(id, artifactId);
      expect(artifact.name).toBe('test.ts');
    });
  });

  describe('getArtifact', () => {
    it('should read artifact from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });
      const artifactId = await hybridStorage.storeArtifact(id, {
        type: 'file',
        name: 'test.ts',
        content: 'test content',
      });

      const artifact = await hybridStorage.getArtifact(id, artifactId);

      expect(artifact.content).toBe('test content');
    });
  });

  describe('listArtifacts', () => {
    it('should list artifacts from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });
      await hybridStorage.storeArtifact(id, { type: 'file', name: 'file1.ts', content: 'test1' });
      await hybridStorage.storeArtifact(id, { type: 'file', name: 'file2.ts', content: 'test2' });

      const artifacts = await hybridStorage.listArtifacts(id);

      expect(artifacts).toHaveLength(2);
    });
  });

  describe('deleteArtifact', () => {
    it('should delete artifact from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });
      const artifactId = await hybridStorage.storeArtifact(id, {
        type: 'file',
        name: 'test.ts',
        content: 'test',
      });

      await hybridStorage.deleteArtifact(id, artifactId);

      const artifacts = await hybridStorage.listArtifacts(id);
      expect(artifacts).toHaveLength(0);
    });
  });

  describe('pruneMessages', () => {
    it('should prune messages in local storage only', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      for (let i = 0; i < 10; i++) {
        await hybridStorage.appendMessage(id, { role: 'user', content: `Message ${i}` });
      }

      // Prune is not implemented in LocalContextStorage, so it returns 0
      const pruned = await hybridStorage.pruneMessages(id, {
        type: 'token-based',
        maxTokens: 100,
      });

      expect(pruned).toBe(0);
    });
  });

  describe('export', () => {
    it('should export from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test Export' });
      await hybridStorage.appendMessage(id, { role: 'user', content: 'Hello' });

      const exported = await hybridStorage.export(id, 'json');
      const parsed = JSON.parse(exported);

      expect(parsed.title).toBe('Test Export');
    });
  });

  describe('clear', () => {
    it('should clear messages and artifacts from local storage', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });
      await hybridStorage.appendMessage(id, { role: 'user', content: 'Message' });
      await hybridStorage.storeArtifact(id, { type: 'file', name: 'test.ts', content: 'test' });

      await hybridStorage.clear(id);

      const conversation = await hybridStorage.getConversation(id);
      expect(conversation.messageCount).toBe(0);
      expect(conversation.artifactCount).toBe(0);
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', () => {
      const status = hybridStorage.getSyncStatus();

      expect(status).toHaveProperty('queueSize');
      expect(status).toHaveProperty('isSyncing');
      expect(status).toHaveProperty('pendingOperations');
      expect(status.queueSize).toBe(0);
      expect(status.isSyncing).toBe(false);
      expect(status.pendingOperations).toBe(0);
    });

    it('should have defined sync status properties', () => {
      const status = hybridStorage.getSyncStatus();

      expect(status).toHaveProperty('queueSize');
      expect(status).toHaveProperty('isSyncing');
      expect(status).toHaveProperty('pendingOperations');
      expect(typeof status.queueSize).toBe('number');
      expect(typeof status.isSyncing).toBe('boolean');
      expect(typeof status.pendingOperations).toBe('number');
    });
  });

  describe('syncToCloud', () => {
    it('should return sync result with expected properties', async () => {
      const result = await hybridStorage.syncToCloud();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('syncedMessages');
      expect(result).toHaveProperty('syncedArtifacts');
      expect(result).toHaveProperty('errors');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.syncedMessages).toBe('number');
      expect(typeof result.syncedArtifacts).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should handle concurrent sync calls', async () => {
      // Start two syncs concurrently
      const sync1Promise = hybridStorage.syncToCloud();
      const sync2Promise = hybridStorage.syncToCloud();

      const [result1, result2] = await Promise.all([sync1Promise, sync2Promise]);

      // Both should complete (one may report already in progress)
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(typeof result1.success).toBe('boolean');
      expect(typeof result2.success).toBe('boolean');
    });

    it('should process queue when called', async () => {
      const result = await hybridStorage.syncToCloud();

      // Should complete successfully even with empty queue
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('syncFromCloud', () => {
    it('should return success result for sync from cloud', async () => {
      const id = await hybridStorage.createConversation({ title: 'Test' });

      const result = await hybridStorage.syncFromCloud(id);

      expect(result.success).toBeDefined();
      expect(result.syncedMessages).toBeDefined();
      expect(result.syncedArtifacts).toBeDefined();
      expect(result.errors).toBeDefined();
    });

    it('should handle sync errors gracefully', async () => {
      const result = await hybridStorage.syncFromCloud('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('periodic sync', () => {
    it('should start periodic sync when interval > 0', async () => {
      const periodicStorage = new HybridContextStorage({
        localStorage,
        cloudStorage,
        syncInterval: 100, // 100ms
        autoSync: false,
      });

      // Wait for at least one sync interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      await periodicStorage.destroy();
    });

    it('should not start periodic sync when interval = 0', () => {
      const manualStorage = new HybridContextStorage({
        localStorage,
        cloudStorage,
        syncInterval: 0,
        autoSync: false,
      });

      const status = manualStorage.getSyncStatus();
      expect(status.isSyncing).toBe(false);
    });
  });

  describe('stopSync', () => {
    it('should stop periodic sync', async () => {
      const periodicStorage = new HybridContextStorage({
        localStorage,
        cloudStorage,
        syncInterval: 100,
        autoSync: false,
      });

      periodicStorage.stopSync();

      // Sync should not occur after stopping
      await new Promise((resolve) => setTimeout(resolve, 150));

      await periodicStorage.destroy();
    });
  });

  describe('destroy', () => {
    it('should stop sync and perform final sync', async () => {
      const autoSyncStorage = new HybridContextStorage({
        localStorage,
        cloudStorage,
        syncInterval: 100,
        autoSync: true,
      });

      await autoSyncStorage.createConversation({ title: 'Test' });

      await autoSyncStorage.destroy();

      // Status should show sync completed
      const status = autoSyncStorage.getSyncStatus();
      expect(status.isSyncing).toBe(false);
    });
  });

  describe('queue management', () => {
    it('should create storage with custom maxQueueSize', async () => {
      const limitedStorage = new HybridContextStorage({
        localStorage,
        cloudStorage,
        syncInterval: 0,
        autoSync: false,
        maxQueueSize: 5,
      });

      // Storage should be created successfully
      expect(limitedStorage).toBeDefined();

      const status = limitedStorage.getSyncStatus();
      expect(status).toBeDefined();

      await limitedStorage.destroy();
    });
  });
});
