/**
 * Tests for ContextManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../../../src/memory/managers/ContextManager.js';
import { LocalContextStorage } from '../../../src/memory/storage/LocalContextStorage.js';
import { MockFileSystem } from '../../mocks/MockFileSystem.js';

describe('ContextManager', () => {
  let fs: MockFileSystem;
  let storage: LocalContextStorage;
  let manager: ContextManager;

  beforeEach(() => {
    fs = new MockFileSystem();
    storage = new LocalContextStorage(fs, '.mimir/context');
    manager = new ContextManager({ storage });
  });

  describe('createConversation', () => {
    it('should create conversation and set as current', async () => {
      const id = await manager.createConversation({ title: 'Test' });

      expect(id).toMatch(/^conv-/);
      expect(manager.getCurrentConversationId()).toBe(id);
    });

    it('should create conversation with metadata', async () => {
      const id = await manager.createConversation({
        title: 'Custom',
        tags: ['test'],
        tokens: 100,
        cost: 0.05,
      });

      const conversation = await manager.getConversation(id);
      expect(conversation.title).toBe('Custom');
      expect(conversation.tags).toEqual(['test']);
      expect(conversation.tokens).toBe(100);
      expect(conversation.cost).toBe(0.05);
    });
  });

  describe('switchConversation', () => {
    it('should switch to existing conversation', async () => {
      const id1 = await manager.createConversation({ title: 'Conv 1' });
      const id2 = await manager.createConversation({ title: 'Conv 2' });

      expect(manager.getCurrentConversationId()).toBe(id2);

      await manager.switchConversation(id1);
      expect(manager.getCurrentConversationId()).toBe(id1);
    });

    it('should throw error if conversation does not exist', async () => {
      await expect(manager.switchConversation('nonexistent')).rejects.toThrow();
    });
  });

  describe('getConversation', () => {
    it('should get current conversation', async () => {
      const id = await manager.createConversation({ title: 'Test' });

      const conversation = await manager.getConversation();
      expect(conversation.id).toBe(id);
      expect(conversation.title).toBe('Test');
    });

    it('should get specific conversation', async () => {
      const id1 = await manager.createConversation({ title: 'Conv 1' });
      await manager.createConversation({ title: 'Conv 2' });

      const conversation = await manager.getConversation(id1);
      expect(conversation.title).toBe('Conv 1');
    });

    it('should throw error if no conversation selected', async () => {
      await expect(manager.getConversation()).rejects.toThrow('No conversation selected');
    });
  });

  describe('updateConversation', () => {
    it('should update current conversation', async () => {
      await manager.createConversation({ title: 'Original' });

      await manager.updateConversation({ title: 'Updated' });

      const conversation = await manager.getConversation();
      expect(conversation.title).toBe('Updated');
    });

    it('should update specific conversation', async () => {
      const id = await manager.createConversation({ title: 'Original' });
      await manager.createConversation({ title: 'Other' });

      await manager.updateConversation({ title: 'Updated' }, id);

      const conversation = await manager.getConversation(id);
      expect(conversation.title).toBe('Updated');
    });
  });

  describe('deleteConversation', () => {
    it('should delete current conversation and clear current ID', async () => {
      const id = await manager.createConversation({ title: 'Test' });

      await manager.deleteConversation();

      expect(manager.getCurrentConversationId()).toBeNull();

      const conversations = await manager.listConversations();
      expect(conversations.find((c) => c.id === id)).toBeUndefined();
    });

    it('should delete specific conversation without clearing current', async () => {
      const id1 = await manager.createConversation({ title: 'Conv 1' });
      const id2 = await manager.createConversation({ title: 'Conv 2' });

      await manager.deleteConversation(id1);

      expect(manager.getCurrentConversationId()).toBe(id2);

      const conversations = await manager.listConversations();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]!.id).toBe(id2);
    });
  });

  describe('listConversations', () => {
    it('should list all conversations', async () => {
      await manager.createConversation({ title: 'Conv 1' });
      await manager.createConversation({ title: 'Conv 2' });
      await manager.createConversation({ title: 'Conv 3' });

      const conversations = await manager.listConversations();
      expect(conversations).toHaveLength(3);
    });

    it('should return empty array when no conversations exist', async () => {
      const conversations = await manager.listConversations();
      expect(conversations).toEqual([]);
    });
  });

  describe('appendMessage', () => {
    it('should append message to current conversation', async () => {
      await manager.createConversation({ title: 'Test' });

      await manager.appendMessage({ role: 'user', content: 'Hello' });

      const messages = await manager.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe('Hello');
    });

    it('should append message to specific conversation', async () => {
      const id1 = await manager.createConversation({ title: 'Conv 1' });
      await manager.createConversation({ title: 'Conv 2' });

      await manager.appendMessage({ role: 'user', content: 'Message 1' }, id1);

      const messages = await manager.getMessages(id1);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe('Message 1');
    });

    it('should throw error if no conversation selected', async () => {
      await expect(manager.appendMessage({ role: 'user', content: 'Test' })).rejects.toThrow(
        'No conversation selected'
      );
    });
  });

  describe('getMessages', () => {
    it('should get messages from current conversation', async () => {
      await manager.createConversation({ title: 'Test' });
      await manager.appendMessage({ role: 'user', content: 'Message 1' });
      await manager.appendMessage({ role: 'assistant', content: 'Message 2' });

      const messages = await manager.getMessages();
      expect(messages).toHaveLength(2);
    });

    it('should support pagination', async () => {
      await manager.createConversation({ title: 'Test' });

      for (let i = 0; i < 10; i++) {
        await manager.appendMessage({ role: 'user', content: `Message ${i}` });
      }

      const messages = await manager.getMessages(undefined, 5, 0);
      expect(messages).toHaveLength(5);
    });
  });

  describe('getRecentMessages', () => {
    it('should get last N messages', async () => {
      await manager.createConversation({ title: 'Test' });

      for (let i = 0; i < 10; i++) {
        await manager.appendMessage({ role: 'user', content: `Message ${i}` });
      }

      const recent = await manager.getRecentMessages(3);
      expect(recent).toHaveLength(3);
      expect(recent[0]!.content).toBe('Message 7');
      expect(recent[1]!.content).toBe('Message 8');
      expect(recent[2]!.content).toBe('Message 9');
    });
  });

  describe('storeArtifact', () => {
    it('should store artifact in current conversation', async () => {
      await manager.createConversation({ title: 'Test' });

      const artifactId = await manager.storeArtifact({
        type: 'file',
        name: 'test.ts',
        content: 'export const test = 1;',
      });

      expect(artifactId).toMatch(/^art-/);

      const artifact = await manager.getArtifact(artifactId);
      expect(artifact.name).toBe('test.ts');
      expect(artifact.content).toBe('export const test = 1;');
    });
  });

  describe('listArtifacts', () => {
    it('should list all artifacts in current conversation', async () => {
      await manager.createConversation({ title: 'Test' });

      await manager.storeArtifact({ type: 'file', name: 'file1.ts', content: 'test1' });
      await manager.storeArtifact({ type: 'file', name: 'file2.ts', content: 'test2' });

      const artifacts = await manager.listArtifacts();
      expect(artifacts).toHaveLength(2);
    });
  });

  describe('deleteArtifact', () => {
    it('should delete artifact from current conversation', async () => {
      await manager.createConversation({ title: 'Test' });

      const artifactId = await manager.storeArtifact({
        type: 'file',
        name: 'test.ts',
        content: 'test',
      });

      await manager.deleteArtifact(artifactId);

      const artifacts = await manager.listArtifacts();
      expect(artifacts).toHaveLength(0);
    });
  });

  describe('export', () => {
    it('should export current conversation as JSON', async () => {
      await manager.createConversation({ title: 'Test' });
      await manager.appendMessage({ role: 'user', content: 'Hello' });

      const exported = await manager.export('json');
      const parsed = JSON.parse(exported);

      expect(parsed.title).toBe('Test');
      expect(parsed.messages).toHaveLength(1);
    });

    it('should export conversation as Markdown', async () => {
      await manager.createConversation({ title: 'Test Export' });
      await manager.appendMessage({ role: 'user', content: 'Hello' });

      const exported = await manager.export('markdown');

      expect(exported).toContain('# Test Export');
      expect(exported).toContain('Hello');
    });
  });

  describe('clear', () => {
    it('should clear all messages and artifacts from current conversation', async () => {
      await manager.createConversation({ title: 'Test' });
      await manager.appendMessage({ role: 'user', content: 'Message' });
      await manager.storeArtifact({ type: 'file', name: 'test.ts', content: 'test' });

      await manager.clear();

      const stats = await manager.getStats();
      expect(stats.messageCount).toBe(0);
      expect(stats.artifactCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return conversation statistics', async () => {
      await manager.createConversation({ title: 'Test', tokens: 100, cost: 0.05 });
      await manager.appendMessage({ role: 'user', content: 'Message 1' });
      await manager.appendMessage({ role: 'assistant', content: 'Message 2' });
      await manager.storeArtifact({ type: 'file', name: 'test.ts', content: 'test' });

      const stats = await manager.getStats();

      expect(stats.messageCount).toBe(2);
      expect(stats.artifactCount).toBe(1);
      expect(stats.tokens).toBe(100);
      expect(stats.cost).toBe(0.05);
    });
  });

  describe('getTotalStats', () => {
    it('should return aggregate statistics across all conversations', async () => {
      await manager.createConversation({ title: 'Conv 1', tokens: 100, cost: 0.05 });
      await manager.appendMessage({ role: 'user', content: 'Message 1' });
      await manager.storeArtifact({ type: 'file', name: 'file1.ts', content: 'test' });

      await manager.createConversation({ title: 'Conv 2', tokens: 200, cost: 0.1 });
      await manager.appendMessage({ role: 'user', content: 'Message 2' });
      await manager.appendMessage({ role: 'assistant', content: 'Response' });

      const stats = await manager.getTotalStats();

      expect(stats.totalConversations).toBe(2);
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalArtifacts).toBe(1);
      expect(stats.totalTokens).toBe(300);
      expect(stats.totalCost).toBeCloseTo(0.15, 2);
    });
  });

  describe('searchMessages', () => {
    it('should search messages in current conversation', async () => {
      await manager.createConversation({ title: 'Test' });
      await manager.appendMessage({ role: 'user', content: 'Hello world' });
      await manager.appendMessage({ role: 'assistant', content: 'Hi there' });
      await manager.appendMessage({ role: 'user', content: 'Goodbye world' });

      const results = await manager.searchMessages('world');

      expect(results).toHaveLength(2);
      expect(results[0]!.content).toBe('Hello world');
      expect(results[1]!.content).toBe('Goodbye world');
    });

    it('should search messages across all conversations when no current conversation', async () => {
      const id1 = await manager.createConversation({ title: 'Conv 1' });
      await manager.appendMessage({ role: 'user', content: 'Hello world' });

      const id2 = await manager.createConversation({ title: 'Conv 2' });
      await manager.appendMessage({ role: 'user', content: 'Goodbye world' });

      // Switch to a conversation and delete it to clear current
      await manager.deleteConversation(id2);

      const results = await manager.searchMessages('world');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', async () => {
      await manager.createConversation({ title: 'Test' });
      await manager.appendMessage({ role: 'user', content: 'HELLO WORLD' });

      const results = await manager.searchMessages('hello');
      expect(results).toHaveLength(1);
    });
  });

  describe('searchConversations', () => {
    it('should search conversations by title', async () => {
      await manager.createConversation({ title: 'Test Conversation' });
      await manager.createConversation({ title: 'Another Conversation' });
      await manager.createConversation({ title: 'Different Topic' });

      const results = await manager.searchConversations('conversation');

      expect(results).toHaveLength(2);
    });

    it('should search conversations by tags', async () => {
      await manager.createConversation({ title: 'Conv 1', tags: ['test', 'demo'] });
      await manager.createConversation({ title: 'Conv 2', tags: ['production'] });
      await manager.createConversation({ title: 'Conv 3', tags: ['test'] });

      const results = await manager.searchConversations('test');

      expect(results).toHaveLength(2);
    });

    it('should be case-insensitive', async () => {
      await manager.createConversation({ title: 'TEST CONVERSATION' });

      const results = await manager.searchConversations('conversation');
      expect(results).toHaveLength(1);
    });
  });
});
