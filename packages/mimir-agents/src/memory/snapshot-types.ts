/**
 * Types for snapshot and checkpoint system
 */

/**
 * Agent role types
 */
export type AgentRole =
  | 'main'
  | 'finder'
  | 'thinker'
  | 'researcher'
  | 'refactoring'
  | 'reviewer'
  | 'tester'
  | 'security'
  | 'rush'
  | 'merger';

/**
 * Agent status
 */
export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Snapshot type
 */
export type SnapshotType = 'manual' | 'auto-agent' | 'auto-checkpoint';

/**
 * File snapshot (complete file state at a point in time)
 */
export interface FileSnapshot {
  path: string;
  content: Buffer;
  hash: string; // SHA-256 for integrity
  mimeType?: string;
}

/**
 * Snapshot of conversation state
 */
export interface ConversationSnapshot {
  messageCount: number;
  lastMessageId: string;
  artifacts: string[]; // Artifact IDs
}

/**
 * Agent metadata in snapshot
 */
export interface AgentSnapshot {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  cost?: number;
  tokens?: number;
}

/**
 * Complete snapshot
 */
export interface Snapshot {
  id: string;
  timestamp: Date;
  type: SnapshotType;

  // Full filesystem state (all modified files)
  files: FileSnapshot[];

  // Conversation state
  conversation: ConversationSnapshot;

  // Agent context (if created by agent)
  agent?: AgentSnapshot;

  // Metadata
  description?: string;
  tags?: string[];
  size: number; // Total bytes
}

/**
 * Snapshot metadata (lightweight, for indexing)
 */
export interface SnapshotMetadata {
  id: string;
  timestamp: Date;
  type: SnapshotType;
  description?: string;
  tags?: string[];
  size: number;
  fileCount: number;
  agent?: {
    id: string;
    role: AgentRole;
    status: AgentStatus;
    cost?: number;
    tokens?: number;
  };
}

/**
 * File change type
 */
export type FileChangeType = 'added' | 'modified' | 'deleted';

/**
 * File change summary
 */
export interface FileChange {
  path: string;
  type: FileChangeType;
  linesAdded: number;
  linesDeleted: number;
}

/**
 * File diff
 */
export interface FileDiff extends FileChange {
  diff: string; // Unified diff format
}

/**
 * Agent activity in timeline
 */
export interface AgentActivity {
  agentId: string;
  role: AgentRole;
  startTime: Date;
  endTime: Date;
  status: AgentStatus;
  snapshotsBefore: string[]; // Snapshot IDs before this agent
  snapshotsAfter: string[]; // Snapshot IDs after this agent
}

/**
 * Timeline item (snapshot with context)
 */
export interface SnapshotTimelineItem {
  snapshot: Snapshot;
  agents?: AgentActivity[];
  fileChanges: FileChange[];
}

/**
 * Snapshot timeline
 */
export interface SnapshotTimeline {
  snapshots: SnapshotTimelineItem[];
  currentSnapshotId: string;
}

/**
 * Snapshot diff
 */
export interface SnapshotDiff {
  files: FileDiff[];
  conversationDiff: {
    messagesAdded: number;
    artifactsAdded: string[];
  };
}

/**
 * Restore options
 */
export interface RestoreOptions {
  filesOnly?: boolean; // Only restore files, not conversation
  conversationOnly?: boolean; // Only restore conversation, not files
  selectiveFiles?: string[]; // Only restore specific files
  preview?: boolean; // Show diff before restoring
}

/**
 * Retention policy
 */
export interface RetentionPolicy {
  keepForHours: number;
  keepMinimum: number;
}

/**
 * Merge conflict severity
 */
export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Merge conflict
 */
export interface MergeConflict {
  path: string;
  agents: string[]; // Agent IDs that modified this file
  severity: ConflictSeverity;
  autoResolvable: boolean;
  reason: string;
}

/**
 * Resolved conflict
 */
export interface ResolvedConflict {
  path: string;
  resolution: 'auto' | 'merger' | 'user';
  content: string;
}

/**
 * Merge resolution result
 */
export interface MergeResolution {
  autoResolved: ResolvedConflict[];
  mergerResolved: ResolvedConflict[];
  userResolved: ResolvedConflict[];
  success: boolean;
}

/**
 * Review issue severity
 */
export type ReviewIssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Review issue
 */
export interface ReviewIssue {
  severity: ReviewIssueSeverity;
  message: string;
  file: string;
  line: number;
  suggestion?: string;
}

/**
 * Fix result from auto-fix loop
 */
export interface FixResult {
  success: boolean;
  code?: string;
  totalRetries?: number;
  ignoredIssues?: ReviewIssue[];
  rollback?: boolean;
  manualFix?: boolean;
}
