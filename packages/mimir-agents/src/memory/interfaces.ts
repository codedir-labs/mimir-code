/**
 * Interfaces for context and snapshot storage
 */

import type { Artifact, Conversation, ConversationWithMessages, Message } from './types.js';
import type {
  MergeConflict,
  RestoreOptions,
  RetentionPolicy,
  Snapshot,
  SnapshotDiff,
  SnapshotMetadata,
  SnapshotTimeline,
} from './snapshot-types.js';

/**
 * Context storage interface (abstraction for local/cloud/hybrid)
 */
export interface IContextStorage {
  // Conversation management
  createConversation(metadata: Partial<Conversation>): Promise<string>;
  getConversation(conversationId: string): Promise<ConversationWithMessages>;
  updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  listConversations(): Promise<Conversation[]>;

  // Message management
  appendMessage(conversationId: string, message: Omit<Message, 'id' | 'timestamp'>): Promise<void>;
  getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  getMessageCount(conversationId: string): Promise<number>;

  // Artifact management
  storeArtifact(conversationId: string, artifact: Artifact): Promise<string>;
  getArtifact(conversationId: string, artifactId: string): Promise<Artifact>;
  listArtifacts(conversationId: string): Promise<Artifact[]>;
  deleteArtifact(conversationId: string, artifactId: string): Promise<void>;

  // Pruning
  pruneMessages(conversationId: string, strategy: PruningStrategy): Promise<number>;

  // Export
  export(conversationId: string, format: 'json' | 'markdown'): Promise<string>;

  // Cleanup
  clear(conversationId: string): Promise<void>;
}

/**
 * Pruning strategy interface
 */
export interface PruningStrategy {
  type: 'relevance' | 'age' | 'token-based';
  maxTokens?: number;
  keepRecent?: number;
  task?: string; // For relevance scoring
}

/**
 * Snapshot manager interface
 */
export interface ISnapshotManager {
  // Create snapshots
  createSnapshot(
    conversationId: string,
    type: 'manual' | 'auto-agent' | 'auto-checkpoint',
    description?: string
  ): Promise<Snapshot>;

  createAgentSnapshot(conversationId: string, agentId: string): Promise<Snapshot>;

  // Query snapshots
  listSnapshots(conversationId: string): Promise<SnapshotMetadata[]>;
  getSnapshot(conversationId: string, snapshotId: string): Promise<Snapshot>;
  getCurrentSnapshot(conversationId: string): Promise<Snapshot | null>;

  // Timeline
  getTimeline(conversationId: string): Promise<SnapshotTimeline>;

  // Restore
  restore(conversationId: string, snapshotId: string, options?: RestoreOptions): Promise<void>;

  restoreFiles(conversationId: string, snapshotId: string, filePaths: string[]): Promise<void>;

  // Diff
  diff(conversationId: string, fromSnapshotId: string, toSnapshotId: string): Promise<SnapshotDiff>;

  // Cleanup
  prune(conversationId: string, policy: RetentionPolicy): Promise<number>;
  pruneAll(): Promise<number>;
}

/**
 * Snapshot storage interface (implementation layer)
 */
export interface ISnapshotStorage {
  // Create
  createSnapshot(conversationId: string, snapshot: Snapshot): Promise<void>;

  // Read
  getSnapshot(conversationId: string, snapshotId: string): Promise<Snapshot>;
  listSnapshots(conversationId: string): Promise<SnapshotMetadata[]>;

  // Delete
  deleteSnapshot(conversationId: string, snapshotId: string): Promise<void>;

  // Helpers
  snapshotExists(conversationId: string, snapshotId: string): Promise<boolean>;
}

/**
 * Merge conflict resolver interface
 */
export interface IMergeConflictResolver {
  // Detect conflicts
  detectConflicts(snapshots: Snapshot[]): Promise<MergeConflict[]>;

  // Resolve conflicts
  resolveConflicts(conflicts: MergeConflict[]): Promise<any>;

  // Categorize by severity
  categorizeConflicts(conflicts: MergeConflict[]): Record<string, MergeConflict[]>;
}

/**
 * Teams API client interface (for cloud sync)
 */
export interface ITeamsAPIClient {
  context: {
    createConversation(orgSlug: string, metadata: Partial<Conversation>): Promise<{ id: string }>;
    appendMessage(orgSlug: string, conversationId: string, message: Message): Promise<void>;
    createArtifact(
      orgSlug: string,
      conversationId: string,
      artifact: Artifact
    ): Promise<{ artifactId: string }>;
    getConversation(orgSlug: string, conversationId: string): Promise<ConversationWithMessages>;
    getMessages(orgSlug: string, conversationId: string): Promise<Message[]>;
    getArtifact(orgSlug: string, conversationId: string, artifactId: string): Promise<Artifact>;
  };
}

/**
 * Auth manager interface
 */
export interface IAuthManager {
  getAuth(): Promise<{ orgSlug: string; token: string } | null>;
  isAuthenticated(): Promise<boolean>;
}

/**
 * Sync queue interface
 */
export interface ISyncQueue {
  add(item: Omit<import('./types.js').SyncQueueItem, 'id' | 'status' | 'createdAt'>): void;
  getAll(): import('./types.js').SyncQueueItem[];
  markSynced(id: string): void;
  markFailed(id: string, error: string): void;
  clear(): void;
}
