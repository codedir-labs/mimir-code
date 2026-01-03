/**
 * Core types for context and memory management
 */

/**
 * Message in a conversation
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

/**
 * Tool call in a message
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

/**
 * Artifact (large data stored separately from messages)
 */
export interface Artifact {
  id?: string;
  type: 'file' | 'search_result' | 'command_output' | 'custom';
  name: string;
  content: string;
  mimeType?: string;
  size?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

/**
 * Conversation metadata
 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  artifactCount: number;
  tokens?: number;
  cost?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Conversation with messages
 */
export interface ConversationWithMessages extends Conversation {
  messages: Message[];
  artifacts: Artifact[];
}

/**
 * Sync result from cloud storage
 */
export interface SyncResult {
  success: boolean;
  syncedMessages: number;
  syncedArtifacts: number;
  errors: string[];
}

/**
 * Sync queue item
 */
export interface SyncQueueItem {
  id: string;
  type: 'message' | 'artifact';
  conversationId: string;
  data: Message | Artifact;
  artifactId?: string;
  status: 'pending' | 'synced' | 'failed';
  error?: string;
  createdAt: Date;
}
