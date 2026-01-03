/**
 * ContextManager - High-level API for context and memory management
 *
 * Provides unified interface for:
 * - Conversation management
 * - Message history with pruning
 * - Artifact storage
 * - Export/import
 */

import type { IFileSystem } from '../platform.js';
import type { IContextStorage, PruningStrategy } from '../interfaces.js';
import type { Artifact, Conversation, ConversationWithMessages, Message } from '../types.js';

export interface ContextManagerOptions {
  storage: IContextStorage;
  fs?: IFileSystem;
  autoSave?: boolean;
  defaultPruningStrategy?: PruningStrategy;
}

export class ContextManager {
  private storage: IContextStorage;
  private currentConversationId: string | null = null;
  private autoSave: boolean;
  private defaultPruningStrategy?: PruningStrategy;

  constructor(options: ContextManagerOptions) {
    this.storage = options.storage;
    this.autoSave = options.autoSave ?? true;
    this.defaultPruningStrategy = options.defaultPruningStrategy;
  }

  // Conversation management

  async createConversation(metadata?: Partial<Conversation>): Promise<string> {
    const id = await this.storage.createConversation(metadata || {});
    this.currentConversationId = id;
    return id;
  }

  async switchConversation(conversationId: string): Promise<void> {
    // Verify conversation exists
    await this.storage.getConversation(conversationId);
    this.currentConversationId = conversationId;
  }

  getCurrentConversationId(): string | null {
    return this.currentConversationId;
  }

  async getConversation(conversationId?: string): Promise<ConversationWithMessages> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.getConversation(id);
  }

  async updateConversation(updates: Partial<Conversation>, conversationId?: string): Promise<void> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    await this.storage.updateConversation(id, updates);
  }

  async deleteConversation(conversationId?: string): Promise<void> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    await this.storage.deleteConversation(id);

    // If we deleted the current conversation, clear it
    if (id === this.currentConversationId) {
      this.currentConversationId = null;
    }
  }

  async listConversations(): Promise<Conversation[]> {
    return await this.storage.listConversations();
  }

  // Message management

  async appendMessage(
    message: Omit<Message, 'id' | 'timestamp'>,
    conversationId?: string
  ): Promise<void> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }

    await this.storage.appendMessage(id, message);

    // Auto-prune if strategy is configured
    if (this.autoSave && this.defaultPruningStrategy) {
      await this.pruneMessages(this.defaultPruningStrategy, id);
    }
  }

  async getMessages(conversationId?: string, limit?: number, offset?: number): Promise<Message[]> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.getMessages(id, limit, offset);
  }

  async getRecentMessages(count: number, conversationId?: string): Promise<Message[]> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    const messages = await this.storage.getMessages(id);
    return messages.slice(-count);
  }

  async pruneMessages(strategy: PruningStrategy, conversationId?: string): Promise<number> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.pruneMessages(id, strategy);
  }

  // Artifact management

  async storeArtifact(artifact: Artifact, conversationId?: string): Promise<string> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.storeArtifact(id, artifact);
  }

  async getArtifact(artifactId: string, conversationId?: string): Promise<Artifact> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.getArtifact(id, artifactId);
  }

  async listArtifacts(conversationId?: string): Promise<Artifact[]> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.listArtifacts(id);
  }

  async deleteArtifact(artifactId: string, conversationId?: string): Promise<void> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    await this.storage.deleteArtifact(id, artifactId);
  }

  // Export/Import

  async export(format: 'json' | 'markdown', conversationId?: string): Promise<string> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    return await this.storage.export(id, format);
  }

  async clear(conversationId?: string): Promise<void> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }
    await this.storage.clear(id);
  }

  // Statistics

  async getStats(conversationId?: string): Promise<{
    messageCount: number;
    artifactCount: number;
    tokens?: number;
    cost?: number;
  }> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      throw new Error('No conversation selected');
    }

    const conversation = await this.storage.getConversation(id);
    return {
      messageCount: conversation.messageCount,
      artifactCount: conversation.artifactCount,
      tokens: conversation.tokens,
      cost: conversation.cost,
    };
  }

  async getTotalStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    totalArtifacts: number;
    totalTokens: number;
    totalCost: number;
  }> {
    const conversations = await this.storage.listConversations();

    let totalMessages = 0;
    let totalArtifacts = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const conv of conversations) {
      totalMessages += conv.messageCount;
      totalArtifacts += conv.artifactCount;
      totalTokens += conv.tokens || 0;
      totalCost += conv.cost || 0;
    }

    return {
      totalConversations: conversations.length,
      totalMessages,
      totalArtifacts,
      totalTokens,
      totalCost,
    };
  }

  // Search

  async searchMessages(query: string, conversationId?: string): Promise<Message[]> {
    const id = conversationId || this.currentConversationId;
    if (!id) {
      // Search across all conversations
      const conversations = await this.storage.listConversations();
      const allMessages: Message[] = [];

      for (const conv of conversations) {
        const messages = await this.storage.getMessages(conv.id);
        const matching = messages.filter((msg) =>
          msg.content.toLowerCase().includes(query.toLowerCase())
        );
        allMessages.push(...matching);
      }

      return allMessages;
    } else {
      // Search within specific conversation
      const messages = await this.storage.getMessages(id);
      return messages.filter((msg) => msg.content.toLowerCase().includes(query.toLowerCase()));
    }
  }

  async searchConversations(query: string): Promise<Conversation[]> {
    const conversations = await this.storage.listConversations();
    return conversations.filter(
      (conv) =>
        conv.title.toLowerCase().includes(query.toLowerCase()) ||
        conv.tags?.some((tag) => tag.toLowerCase().includes(query.toLowerCase()))
    );
  }
}
