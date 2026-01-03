/**
 * Teams context storage implementation (stub)
 * Will be fully implemented when Teams integration is ready
 */

import type { IContextStorage, PruningStrategy } from '../interfaces.js';
import type { Artifact, Conversation, ConversationWithMessages, Message } from '../types.js';

export class TeamsContextStorage implements IContextStorage {
  constructor() {
    // Will be injected when Teams integration is ready
    // private client: ITeamsAPIClient,
    // private authManager: IAuthManager
  }

  async createConversation(_metadata: Partial<Conversation>): Promise<string> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async getConversation(_conversationId: string): Promise<ConversationWithMessages> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async updateConversation(
    _conversationId: string,
    _updates: Partial<Conversation>
  ): Promise<void> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async deleteConversation(_conversationId: string): Promise<void> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async listConversations(): Promise<Conversation[]> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async appendMessage(
    _conversationId: string,
    _message: Omit<Message, 'id' | 'timestamp'>
  ): Promise<void> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async getMessages(
    _conversationId: string,
    _limit?: number,
    _offset?: number
  ): Promise<Message[]> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async getMessageCount(_conversationId: string): Promise<number> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async storeArtifact(_conversationId: string, _artifact: Artifact): Promise<string> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async getArtifact(_conversationId: string, _artifactId: string): Promise<Artifact> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async listArtifacts(_conversationId: string): Promise<Artifact[]> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async deleteArtifact(_conversationId: string, _artifactId: string): Promise<void> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async pruneMessages(_conversationId: string, _strategy: PruningStrategy): Promise<number> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async export(_conversationId: string, _format: 'json' | 'markdown'): Promise<string> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }

  async clear(_conversationId: string): Promise<void> {
    throw new Error('TeamsContextStorage: Not implemented - Teams integration pending');
  }
}
