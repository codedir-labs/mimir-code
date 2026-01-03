/**
 * Tests for LocalContextStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalContextStorage } from '../../../src/memory/storage/LocalContextStorage.js';
import { MockFileSystem } from '../../mocks/MockFileSystem.js';

describe('LocalContextStorage', () => {
  let fs: MockFileSystem;
  let storage: LocalContextStorage;

  beforeEach(() => {
    fs = new MockFileSystem();
    storage = new LocalContextStorage(fs, '.mimir/context');
  });

  describe('createConversation', () => {
    it('should create a new conversation with default values', async () => {
      const id = await storage.createConversation({ title: 'Test Conversation' });

      expect(id).toMatch(/^conv-/);

      // Verify directory structure created
      const paths = fs.getAllPaths();
      expect(paths).toContain(fs.join('.mimir/context/conversations', id));
      expect(paths).toContain(fs.join('.mimir/context/conversations', id, 'artifacts'));

      // Verify metadata file
      const metadata = await fs.readFile(
        `.mimir/context/conversations/${id}/metadata.json`,
        'utf-8'
      );
      const parsed = JSON.parse(metadata as string);
      expect(parsed.id).toBe(id);
      expect(parsed.title).toBe('Test Conversation');
      expect(parsed.messageCount).toBe(0);
      expect(parsed.artifactCount).toBe(0);
    });

    it('should create conversation with custom metadata', async () => {
      const id = await storage.createConversation({
        title: 'Custom',
        tags: ['test', 'demo'],
        tokens: 1000,
        cost: 0.05,
      });

      const conversation = await storage.getConversation(id);
      expect(conversation.title).toBe('Custom');
      expect(conversation.tags).toEqual(['test', 'demo']);
      expect(conversation.tokens).toBe(1000);
      expect(conversation.cost).toBe(0.05);
    });

    it('should create index entry for new conversation', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      const conversations = await storage.listConversations();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.id).toBe(id);
    });
  });

  describe('appendMessage', () => {
    it('should append a message to the conversation', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      await storage.appendMessage(id, {
        role: 'user',
        content: 'Hello, world!',
      });

      const messages = await storage.getMessages(id);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe('user');
      expect(messages[0]?.content).toBe('Hello, world!');
      expect(messages[0]?.id).toMatch(/^msg-/);
      expect(messages[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should append multiple messages in order', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      await storage.appendMessage(id, { role: 'user', content: 'First' });
      await storage.appendMessage(id, { role: 'assistant', content: 'Second' });
      await storage.appendMessage(id, { role: 'user', content: 'Third' });

      const messages = await storage.getMessages(id);
      expect(messages).toHaveLength(3);
      expect(messages[0]?.content).toBe('First');
      expect(messages[1]?.content).toBe('Second');
      expect(messages[2]?.content).toBe('Third');
    });

    it('should update conversation messageCount', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      await storage.appendMessage(id, { role: 'user', content: 'Test' });
      await storage.appendMessage(id, { role: 'assistant', content: 'Response' });

      const conversation = await storage.getConversation(id);
      expect(conversation.messageCount).toBe(2);
    });

    it('should support messages with tool calls', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      await storage.appendMessage(id, {
        role: 'assistant',
        content: 'Running tool...',
        toolCalls: [
          {
            id: 'call-1',
            name: 'readFile',
            arguments: { path: 'test.ts' },
            result: 'File contents',
          },
        ],
      });

      const messages = await storage.getMessages(id);
      expect(messages[0]?.toolCalls).toHaveLength(1);
      expect(messages[0]?.toolCalls?.[0]?.name).toBe('readFile');
    });
  });

  describe('getMessages', () => {
    it('should return empty array for conversation with no messages', async () => {
      const id = await storage.createConversation({ title: 'Test' });
      const messages = await storage.getMessages(id);
      expect(messages).toEqual([]);
    });

    it('should support pagination with limit', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      for (let i = 0; i < 10; i++) {
        await storage.appendMessage(id, { role: 'user', content: `Message ${i}` });
      }

      const messages = await storage.getMessages(id, 5);
      expect(messages).toHaveLength(5);
    });

    it('should support pagination with offset', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      for (let i = 0; i < 10; i++) {
        await storage.appendMessage(id, { role: 'user', content: `Message ${i}` });
      }

      const messages = await storage.getMessages(id, 3, 5);
      expect(messages).toHaveLength(3);
      expect(messages[0]?.content).toBe('Message 5');
    });
  });

  describe('storeArtifact', () => {
    it('should store an artifact with metadata', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      const artifactId = await storage.storeArtifact(id, {
        type: 'file',
        name: 'test.ts',
        content: 'export const test = 1;',
        mimeType: 'text/typescript',
      });

      expect(artifactId).toMatch(/^art-/);

      // Verify artifact file exists
      const content = await fs.readFile(
        `.mimir/context/conversations/${id}/artifacts/${artifactId}.txt`,
        'utf-8'
      );
      expect(content).toBe('export const test = 1;');

      // Verify metadata file exists
      const metaContent = await fs.readFile(
        `.mimir/context/conversations/${id}/artifacts/${artifactId}.txt.meta.json`,
        'utf-8'
      );
      const meta = JSON.parse(metaContent as string);
      expect(meta.name).toBe('test.ts');
      expect(meta.type).toBe('file');
      expect(meta.mimeType).toBe('text/typescript');
    });

    it('should update conversation artifactCount', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      await storage.storeArtifact(id, {
        type: 'file',
        name: 'test.ts',
        content: 'test',
      });

      const conversation = await storage.getConversation(id);
      expect(conversation.artifactCount).toBe(1);
    });

    it('should use provided artifact ID if given', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      const artifactId = await storage.storeArtifact(id, {
        id: 'custom-id',
        type: 'file',
        name: 'test.ts',
        content: 'test',
      });

      expect(artifactId).toBe('custom-id');
    });
  });

  describe('getArtifact', () => {
    it('should retrieve stored artifact', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      const artifactId = await storage.storeArtifact(id, {
        type: 'search_result',
        name: 'Search results',
        content: JSON.stringify({ results: ['a', 'b', 'c'] }),
      });

      const artifact = await storage.getArtifact(id, artifactId);
      expect(artifact.id).toBe(artifactId);
      expect(artifact.type).toBe('search_result');
      expect(artifact.name).toBe('Search results');
      expect(artifact.content).toBe(JSON.stringify({ results: ['a', 'b', 'c'] }));
    });
  });

  describe('listArtifacts', () => {
    it('should list all artifacts in conversation', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      await storage.storeArtifact(id, { type: 'file', name: 'file1.ts', content: 'test1' });
      await storage.storeArtifact(id, { type: 'file', name: 'file2.ts', content: 'test2' });
      await storage.storeArtifact(id, {
        type: 'command_output',
        name: 'npm test',
        content: 'output',
      });

      const artifacts = await storage.listArtifacts(id);
      expect(artifacts).toHaveLength(3);
    });

    it('should return empty array for conversation with no artifacts', async () => {
      const id = await storage.createConversation({ title: 'Test' });
      const artifacts = await storage.listArtifacts(id);
      expect(artifacts).toEqual([]);
    });
  });

  describe('deleteArtifact', () => {
    it('should delete artifact and update count', async () => {
      const id = await storage.createConversation({ title: 'Test' });

      const artifactId = await storage.storeArtifact(id, {
        type: 'file',
        name: 'test.ts',
        content: 'test',
      });

      await storage.deleteArtifact(id, artifactId);

      const artifacts = await storage.listArtifacts(id);
      expect(artifacts).toHaveLength(0);

      const conversation = await storage.getConversation(id);
      expect(conversation.artifactCount).toBe(0);
    });
  });

  describe('updateConversation', () => {
    it('should update conversation metadata', async () => {
      const id = await storage.createConversation({ title: 'Original' });

      await storage.updateConversation(id, {
        title: 'Updated',
        tags: ['new', 'tags'],
      });

      const conversation = await storage.getConversation(id);
      expect(conversation.title).toBe('Updated');
      expect(conversation.tags).toEqual(['new', 'tags']);
    });

    it('should update updatedAt timestamp', async () => {
      const id = await storage.createConversation({ title: 'Test' });
      const original = await storage.getConversation(id);

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storage.updateConversation(id, { title: 'Updated' });
      const updated = await storage.getConversation(id);

      expect(updated.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation and all files', async () => {
      const id = await storage.createConversation({ title: 'Test' });
      await storage.appendMessage(id, { role: 'user', content: 'Test' });
      await storage.storeArtifact(id, { type: 'file', name: 'test.ts', content: 'test' });

      await storage.deleteConversation(id);

      const exists = await fs.exists(`.mimir/context/conversations/${id}`);
      expect(exists).toBe(false);
    });

    it('should remove from index', async () => {
      const id = await storage.createConversation({ title: 'Test' });
      await storage.deleteConversation(id);

      const conversations = await storage.listConversations();
      expect(conversations).toHaveLength(0);
    });
  });

  describe('export', () => {
    it('should export conversation as JSON', async () => {
      const id = await storage.createConversation({ title: 'Test Export' });
      await storage.appendMessage(id, { role: 'user', content: 'Hello' });
      await storage.storeArtifact(id, { type: 'file', name: 'test.ts', content: 'code' });

      const exported = await storage.export(id, 'json');
      const parsed = JSON.parse(exported);

      expect(parsed.title).toBe('Test Export');
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.artifacts).toHaveLength(1);
    });

    it('should export conversation as Markdown', async () => {
      const id = await storage.createConversation({ title: 'Test Export' });
      await storage.appendMessage(id, { role: 'user', content: 'Hello' });

      const exported = await storage.export(id, 'markdown');

      expect(exported).toContain('# Test Export');
      expect(exported).toContain('## Messages');
      expect(exported).toContain('### user');
      expect(exported).toContain('Hello');
    });
  });

  describe('clear', () => {
    it('should clear all messages and artifacts', async () => {
      const id = await storage.createConversation({ title: 'Test' });
      await storage.appendMessage(id, { role: 'user', content: 'Test' });
      await storage.storeArtifact(id, { type: 'file', name: 'test.ts', content: 'test' });

      await storage.clear(id);

      const conversation = await storage.getConversation(id);
      expect(conversation.messageCount).toBe(0);
      expect(conversation.artifactCount).toBe(0);
      expect(conversation.messages).toHaveLength(0);
      expect(conversation.artifacts).toHaveLength(0);
    });
  });

  describe('listConversations', () => {
    it('should list all conversations', async () => {
      await storage.createConversation({ title: 'Conv 1' });
      await storage.createConversation({ title: 'Conv 2' });
      await storage.createConversation({ title: 'Conv 3' });

      const conversations = await storage.listConversations();
      expect(conversations).toHaveLength(3);
    });

    it('should return empty array when no conversations exist', async () => {
      const conversations = await storage.listConversations();
      expect(conversations).toEqual([]);
    });
  });
});
