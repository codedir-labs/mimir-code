/**
 * Local context storage implementation
 * Stores context in .mimir/context/ directory
 */

import type { IFileSystem } from '../platform.js';
import type { IContextStorage, PruningStrategy } from '../interfaces.js';
import type { Artifact, Conversation, ConversationWithMessages, Message } from '../types.js';

export class LocalContextStorage implements IContextStorage {
  constructor(
    private fs: IFileSystem,
    private basePath: string // '.mimir/context'
  ) {}

  // Conversation management

  async createConversation(metadata: Partial<Conversation>): Promise<string> {
    const id = `conv-${this.generateId()}`;
    const conversation: Conversation = {
      id,
      title: metadata.title || 'Untitled',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      artifactCount: 0,
      tokens: metadata.tokens || 0,
      cost: metadata.cost || 0,
      tags: metadata.tags || [],
      metadata: metadata.metadata || {},
    };

    const conversationPath = this.getConversationPath(id);
    await this.fs.ensureDir(conversationPath);
    await this.fs.ensureDir(this.fs.join(conversationPath, 'artifacts'));

    // Write metadata
    const metadataPath = this.fs.join(conversationPath, 'metadata.json');
    await this.fs.writeFile(metadataPath, JSON.stringify(conversation, null, 2));

    // Initialize empty messages file
    const messagesPath = this.fs.join(conversationPath, 'messages.jsonl');
    await this.fs.writeFile(messagesPath, '');

    // Update index
    await this.updateIndex(conversation);

    return id;
  }

  async getConversation(conversationId: string): Promise<ConversationWithMessages> {
    const metadata = await this.getConversationMetadata(conversationId);
    const messages = await this.getMessages(conversationId);
    const artifacts = await this.listArtifacts(conversationId);

    return {
      ...metadata,
      messages,
      artifacts,
    };
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    const metadata = await this.getConversationMetadata(conversationId);
    const updated = {
      ...metadata,
      ...updates,
      updatedAt: new Date(),
    };

    const metadataPath = this.fs.join(this.getConversationPath(conversationId), 'metadata.json');
    await this.fs.writeFile(metadataPath, JSON.stringify(updated, null, 2));

    await this.updateIndex(updated);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversationPath = this.getConversationPath(conversationId);
    await this.fs.remove(conversationPath);

    // Update index
    const index = await this.getIndex();
    const filtered = index.filter((c) => c.id !== conversationId);
    await this.saveIndex(filtered);
  }

  async listConversations(): Promise<Conversation[]> {
    return await this.getIndex();
  }

  // Message management

  async appendMessage(
    conversationId: string,
    message: Omit<Message, 'id' | 'timestamp'>
  ): Promise<void> {
    const fullMessage: Message = {
      ...message,
      id: `msg-${this.generateId()}`,
      timestamp: new Date(),
    };

    const messagesPath = this.fs.join(this.getConversationPath(conversationId), 'messages.jsonl');
    await this.fs.appendFile(messagesPath, JSON.stringify(fullMessage) + '\n');

    // Update conversation metadata
    const metadata = await this.getConversationMetadata(conversationId);
    metadata.messageCount++;
    metadata.updatedAt = new Date();
    await this.updateConversation(conversationId, metadata);
  }

  async getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]> {
    const messagesPath = this.fs.join(this.getConversationPath(conversationId), 'messages.jsonl');

    const exists = await this.fs.exists(messagesPath);
    if (!exists) {
      return [];
    }

    const content = (await this.fs.readFile(messagesPath, 'utf-8')) as string;
    if (!content || content.trim() === '') {
      return [];
    }

    const lines = content.trim().split('\n');
    const messages: Message[] = lines
      .filter((line: string) => line.trim() !== '')
      .map((line: string) => {
        const parsed = JSON.parse(line);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });

    // Apply offset and limit
    const start = offset || 0;
    const end = limit ? start + limit : messages.length;
    return messages.slice(start, end);
  }

  async getMessageCount(conversationId: string): Promise<number> {
    const metadata = await this.getConversationMetadata(conversationId);
    return metadata.messageCount;
  }

  // Artifact management

  async storeArtifact(conversationId: string, artifact: Artifact): Promise<string> {
    const artifactId = artifact.id || `art-${this.generateId()}`;
    const artifactPath = this.fs.join(
      this.getConversationPath(conversationId),
      'artifacts',
      `${artifactId}.txt`
    );

    await this.fs.writeFile(artifactPath, artifact.content);

    // Store metadata
    const metadataPath = `${artifactPath}.meta.json`;
    const metadata = {
      id: artifactId,
      type: artifact.type,
      name: artifact.name,
      mimeType: artifact.mimeType,
      size: artifact.content.length,
      createdAt: artifact.createdAt || new Date(),
      metadata: artifact.metadata || {},
    };
    await this.fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Update conversation metadata
    const conv = await this.getConversationMetadata(conversationId);
    conv.artifactCount++;
    await this.updateConversation(conversationId, conv);

    return artifactId;
  }

  async getArtifact(conversationId: string, artifactId: string): Promise<Artifact> {
    const artifactPath = this.fs.join(
      this.getConversationPath(conversationId),
      'artifacts',
      `${artifactId}.txt`
    );
    const metadataPath = `${artifactPath}.meta.json`;

    const [content, metadataStr] = await Promise.all([
      this.fs.readFile(artifactPath, 'utf-8'),
      this.fs.readFile(metadataPath, 'utf-8'),
    ]);

    const metadata = JSON.parse(metadataStr as string);

    return {
      id: metadata.id,
      type: metadata.type,
      name: metadata.name,
      content: content as string,
      mimeType: metadata.mimeType,
      size: metadata.size,
      createdAt: new Date(metadata.createdAt),
      metadata: metadata.metadata,
    };
  }

  async listArtifacts(conversationId: string): Promise<Artifact[]> {
    const artifactsPath = this.fs.join(this.getConversationPath(conversationId), 'artifacts');

    const exists = await this.fs.exists(artifactsPath);
    if (!exists) {
      return [];
    }

    const files = await this.fs.readdir(artifactsPath);
    const metadataFiles = files.filter((f) => f.endsWith('.meta.json'));

    const artifacts = await Promise.all(
      metadataFiles.map(async (file) => {
        const artifactId = file.replace('.txt.meta.json', '');
        return await this.getArtifact(conversationId, artifactId);
      })
    );

    return artifacts;
  }

  async deleteArtifact(conversationId: string, artifactId: string): Promise<void> {
    const artifactPath = this.fs.join(
      this.getConversationPath(conversationId),
      'artifacts',
      `${artifactId}.txt`
    );
    const metadataPath = `${artifactPath}.meta.json`;

    await Promise.all([this.fs.unlink(artifactPath), this.fs.unlink(metadataPath)]);

    // Update conversation metadata
    const conv = await this.getConversationMetadata(conversationId);
    conv.artifactCount--;
    await this.updateConversation(conversationId, conv);
  }

  // Pruning

  async pruneMessages(_conversationId: string, _strategy: PruningStrategy): Promise<number> {
    // TODO: Implement pruning strategies
    // For now, return 0 (no messages pruned)
    return 0;
  }

  // Export

  async export(conversationId: string, format: 'json' | 'markdown'): Promise<string> {
    const conversation = await this.getConversation(conversationId);

    if (format === 'json') {
      return JSON.stringify(conversation, null, 2);
    } else {
      // Markdown format
      let md = `# ${conversation.title}\n\n`;
      md += `**Created**: ${conversation.createdAt.toISOString()}\n`;
      md += `**Updated**: ${conversation.updatedAt.toISOString()}\n`;
      md += `**Messages**: ${conversation.messageCount}\n`;
      md += `**Artifacts**: ${conversation.artifactCount}\n\n`;

      md += `## Messages\n\n`;
      for (const message of conversation.messages) {
        md += `### ${message.role} (${message.timestamp.toISOString()})\n\n`;
        md += `${message.content}\n\n`;
      }

      if (conversation.artifacts.length > 0) {
        md += `## Artifacts\n\n`;
        for (const artifact of conversation.artifacts) {
          md += `### ${artifact.name} (${artifact.type})\n\n`;
          md += `\`\`\`\n${artifact.content}\n\`\`\`\n\n`;
        }
      }

      return md;
    }
  }

  // Cleanup

  async clear(conversationId: string): Promise<void> {
    // Delete all messages
    const messagesPath = this.fs.join(this.getConversationPath(conversationId), 'messages.jsonl');
    await this.fs.writeFile(messagesPath, '');

    // Delete all artifacts
    const artifactsPath = this.fs.join(this.getConversationPath(conversationId), 'artifacts');
    const exists = await this.fs.exists(artifactsPath);
    if (exists) {
      const files = await this.fs.readdir(artifactsPath);
      await Promise.all(files.map((file) => this.fs.unlink(this.fs.join(artifactsPath, file))));
    }

    // Update conversation metadata
    await this.updateConversation(conversationId, {
      messageCount: 0,
      artifactCount: 0,
      updatedAt: new Date(),
    });
  }

  // Private helpers

  private getConversationPath(conversationId: string): string {
    return this.fs.join(this.basePath, 'conversations', conversationId);
  }

  private async getConversationMetadata(conversationId: string): Promise<Conversation> {
    const metadataPath = this.fs.join(this.getConversationPath(conversationId), 'metadata.json');
    const content = await this.fs.readFile(metadataPath, 'utf-8');
    const parsed = JSON.parse(content as string);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    };
  }

  private async getIndex(): Promise<Conversation[]> {
    const indexPath = this.fs.join(this.basePath, 'index.json');
    const exists = await this.fs.exists(indexPath);

    if (!exists) {
      return [];
    }

    const content = await this.fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(content as string);
    return parsed.map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));
  }

  private async saveIndex(conversations: Conversation[]): Promise<void> {
    const indexPath = this.fs.join(this.basePath, 'index.json');
    await this.fs.ensureDir(this.basePath);
    await this.fs.writeFile(indexPath, JSON.stringify(conversations, null, 2));
  }

  private async updateIndex(conversation: Conversation): Promise<void> {
    const index = await this.getIndex();
    const existing = index.findIndex((c) => c.id === conversation.id);

    if (existing >= 0) {
      index[existing] = conversation;
    } else {
      index.push(conversation);
    }

    await this.saveIndex(index);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
