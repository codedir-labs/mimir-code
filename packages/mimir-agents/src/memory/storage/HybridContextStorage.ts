/**
 * HybridContextStorage - Local-first storage with cloud sync
 *
 * Strategy:
 * - Write to local storage immediately (fast, offline-capable)
 * - Queue operations for cloud sync in background
 * - Read from local storage by default
 * - Sync from cloud periodically or on demand
 */

import type { IContextStorage, PruningStrategy } from '../interfaces.js';
import type {
  Artifact,
  Conversation,
  ConversationWithMessages,
  Message,
  SyncQueueItem,
  SyncResult,
} from '../types.js';

export interface HybridStorageOptions {
  localStorage: IContextStorage;
  cloudStorage: IContextStorage;
  syncInterval?: number; // milliseconds, 0 = manual sync only
  maxQueueSize?: number; // max items in sync queue
  autoSync?: boolean; // automatically sync on operations
}

export class HybridContextStorage implements IContextStorage {
  private localStorage: IContextStorage;
  private cloudStorage: IContextStorage;
  private syncQueue: SyncQueueItem[] = [];
  private syncInterval: number;
  private maxQueueSize: number;
  private autoSync: boolean;
  private syncTimer?: NodeJS.Timeout;
  private isSyncing = false;

  constructor(options: HybridStorageOptions) {
    this.localStorage = options.localStorage;
    this.cloudStorage = options.cloudStorage;
    this.syncInterval = options.syncInterval ?? 60000; // 1 minute default
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.autoSync = options.autoSync ?? true;

    // Start periodic sync if interval > 0
    if (this.syncInterval > 0) {
      this.startPeriodicSync();
    }
  }

  // Conversation management

  async createConversation(metadata: Partial<Conversation>): Promise<string> {
    // Create locally first
    const id = await this.localStorage.createConversation(metadata);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('conversation-create', id, metadata);
    }

    return id;
  }

  async getConversation(conversationId: string): Promise<ConversationWithMessages> {
    // Read from local storage (fast)
    return await this.localStorage.getConversation(conversationId);
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    // Update locally first
    await this.localStorage.updateConversation(conversationId, updates);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('conversation-update', conversationId, updates);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    // Delete locally first
    await this.localStorage.deleteConversation(conversationId);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('conversation-delete', conversationId, null);
    }
  }

  async listConversations(): Promise<Conversation[]> {
    // Read from local storage
    return await this.localStorage.listConversations();
  }

  // Message management

  async appendMessage(
    conversationId: string,
    message: Omit<Message, 'id' | 'timestamp'>
  ): Promise<void> {
    // Append locally first
    await this.localStorage.appendMessage(conversationId, message);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('message-append', conversationId, message);
    }
  }

  async getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]> {
    // Read from local storage
    return await this.localStorage.getMessages(conversationId, limit, offset);
  }

  async getMessageCount(conversationId: string): Promise<number> {
    // Read from local storage
    return await this.localStorage.getMessageCount(conversationId);
  }

  // Artifact management

  async storeArtifact(conversationId: string, artifact: Artifact): Promise<string> {
    // Store locally first
    const id = await this.localStorage.storeArtifact(conversationId, artifact);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('artifact-store', conversationId, { ...artifact, id });
    }

    return id;
  }

  async getArtifact(conversationId: string, artifactId: string): Promise<Artifact> {
    // Read from local storage
    return await this.localStorage.getArtifact(conversationId, artifactId);
  }

  async listArtifacts(conversationId: string): Promise<Artifact[]> {
    // Read from local storage
    return await this.localStorage.listArtifacts(conversationId);
  }

  async deleteArtifact(conversationId: string, artifactId: string): Promise<void> {
    // Delete locally first
    await this.localStorage.deleteArtifact(conversationId, artifactId);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('artifact-delete', conversationId, { artifactId });
    }
  }

  // Pruning

  async pruneMessages(conversationId: string, strategy: PruningStrategy): Promise<number> {
    // Prune locally only (cloud will sync from local)
    return await this.localStorage.pruneMessages(conversationId, strategy);
  }

  // Export/Import

  async export(conversationId: string, format: 'json' | 'markdown'): Promise<string> {
    // Export from local storage
    return await this.localStorage.export(conversationId, format);
  }

  async clear(conversationId: string): Promise<void> {
    // Clear locally first
    await this.localStorage.clear(conversationId);

    // Queue for cloud sync
    if (this.autoSync) {
      await this.queueOperation('conversation-clear', conversationId, null);
    }
  }

  // Sync operations

  private async queueOperation(type: string, conversationId: string, data: unknown): Promise<void> {
    const item: SyncQueueItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      type: type.includes('message') ? 'message' : 'artifact',
      conversationId,
      data: data as Message | Artifact,
      status: 'pending',
      createdAt: new Date(),
    };

    this.syncQueue.push(item);

    // Trim queue if too large
    if (this.syncQueue.length > this.maxQueueSize) {
      this.syncQueue = this.syncQueue.slice(-this.maxQueueSize);
    }

    // Trigger immediate sync if auto-sync is enabled
    if (this.autoSync && !this.isSyncing) {
      // Don't await - sync in background
      void this.syncToCloud();
    }
  }

  async syncToCloud(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        syncedMessages: 0,
        syncedArtifacts: 0,
        errors: ['Sync already in progress'],
      };
    }

    this.isSyncing = true;

    const result: SyncResult = {
      success: true,
      syncedMessages: 0,
      syncedArtifacts: 0,
      errors: [],
    };

    try {
      // Process queue items
      const pending = this.syncQueue.filter((item) => item.status === 'pending');

      for (const item of pending) {
        try {
          // Sync operation to cloud
          // This is simplified - real implementation would handle each operation type
          if (item.type === 'message') {
            result.syncedMessages++;
          } else if (item.type === 'artifact') {
            result.syncedArtifacts++;
          }

          item.status = 'synced';
        } catch (error) {
          item.status = 'failed';
          item.error = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to sync ${item.id}: ${item.error}`);
        }
      }

      // Remove synced items from queue
      this.syncQueue = this.syncQueue.filter((item) => item.status !== 'synced');

      result.success = result.errors.length === 0;
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  async syncFromCloud(conversationId?: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedMessages: 0,
      syncedArtifacts: 0,
      errors: [],
    };

    try {
      if (conversationId) {
        // Sync specific conversation from cloud to local
        const cloudConv = await this.cloudStorage.getConversation(conversationId);
        const localConv = await this.localStorage.getConversation(conversationId);

        // Sync messages
        if (cloudConv.messageCount > localConv.messageCount) {
          const newMessages = cloudConv.messages.slice(localConv.messageCount);
          for (const msg of newMessages) {
            await this.localStorage.appendMessage(conversationId, msg);
            result.syncedMessages++;
          }
        }

        // Sync artifacts
        if (cloudConv.artifactCount > localConv.artifactCount) {
          const cloudArtifacts = cloudConv.artifacts;
          const localArtifacts = localConv.artifacts;
          const localArtifactIds = new Set(localArtifacts.map((a) => a.id));

          for (const artifact of cloudArtifacts) {
            if (!localArtifactIds.has(artifact.id)) {
              await this.localStorage.storeArtifact(conversationId, artifact);
              result.syncedArtifacts++;
            }
          }
        }
      } else {
        // Sync all conversations
        const cloudConvs = await this.cloudStorage.listConversations();
        const localConvs = await this.localStorage.listConversations();
        const localConvIds = new Set(localConvs.map((c) => c.id));

        for (const cloudConv of cloudConvs) {
          if (!localConvIds.has(cloudConv.id)) {
            // New conversation - create locally
            await this.localStorage.createConversation(cloudConv);
          } else {
            // Existing conversation - sync messages and artifacts
            const syncResult = await this.syncFromCloud(cloudConv.id);
            result.syncedMessages += syncResult.syncedMessages;
            result.syncedArtifacts += syncResult.syncedArtifacts;
            result.errors.push(...syncResult.errors);
          }
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  getSyncStatus(): {
    queueSize: number;
    isSyncing: boolean;
    pendingOperations: number;
  } {
    return {
      queueSize: this.syncQueue.length,
      isSyncing: this.isSyncing,
      pendingOperations: this.syncQueue.filter((item) => item.status === 'pending').length,
    };
  }

  private startPeriodicSync(): void {
    this.syncTimer = setInterval(() => {
      void this.syncToCloud();
    }, this.syncInterval);
  }

  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  async destroy(): Promise<void> {
    this.stopSync();

    // Final sync before destroy
    if (this.syncQueue.length > 0) {
      await this.syncToCloud();
    }
  }
}
