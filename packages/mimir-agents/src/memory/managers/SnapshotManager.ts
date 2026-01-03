/**
 * Snapshot manager - High-level API for checkpoint system
 */

import type { IFileSystem } from '../platform.js';
import type { ISnapshotManager, ISnapshotStorage, IContextStorage } from '../interfaces.js';
import type {
  Snapshot,
  SnapshotMetadata,
  SnapshotTimeline,
  SnapshotTimelineItem,
  SnapshotDiff,
  RestoreOptions,
  RetentionPolicy,
  FileSnapshot,
  FileChange,
  FileDiff,
} from '../snapshot-types.js';

export class SnapshotManager implements ISnapshotManager {
  constructor(
    private fs: IFileSystem,
    private snapshotStorage: ISnapshotStorage,
    private contextStorage: IContextStorage,
    private workingDirectory: string // Current working directory (e.g., process.cwd())
  ) {}

  // Create snapshots

  async createSnapshot(
    conversationId: string,
    type: 'manual' | 'auto-agent' | 'auto-checkpoint',
    description?: string
  ): Promise<Snapshot> {
    const id = `snap-${this.generateId()}`;
    const timestamp = new Date();

    // Capture current filesystem state
    const files = await this.captureFilesystemState();

    // Get conversation state
    const conversation = await this.contextStorage.getConversation(conversationId);

    const snapshot: Snapshot = {
      id,
      timestamp,
      type,
      files,
      conversation: {
        messageCount: conversation.messageCount,
        lastMessageId:
          conversation.messages.length > 0
            ? conversation.messages[conversation.messages.length - 1]!.id
            : '',
        artifacts: conversation.artifacts.map((a) => a.id!),
      },
      description,
      size: this.calculateSnapshotSize(files),
    };

    await this.snapshotStorage.createSnapshot(conversationId, snapshot);

    return snapshot;
  }

  async createAgentSnapshot(conversationId: string, agentId: string): Promise<Snapshot> {
    const snapshot = await this.createSnapshot(
      conversationId,
      'auto-agent',
      `Agent ${agentId} - before execution`
    );

    // Add agent metadata (this would be populated by the agent orchestrator)
    // For now, just return the snapshot
    return snapshot;
  }

  // Query snapshots

  async listSnapshots(conversationId: string): Promise<SnapshotMetadata[]> {
    return await this.snapshotStorage.listSnapshots(conversationId);
  }

  async getSnapshot(conversationId: string, snapshotId: string): Promise<Snapshot> {
    return await this.snapshotStorage.getSnapshot(conversationId, snapshotId);
  }

  async getCurrentSnapshot(conversationId: string): Promise<Snapshot | null> {
    const snapshots = await this.listSnapshots(conversationId);

    if (snapshots.length === 0) {
      return null;
    }

    // Return most recent snapshot
    return await this.getSnapshot(conversationId, snapshots[0]!.id);
  }

  // Timeline

  async getTimeline(conversationId: string): Promise<SnapshotTimeline> {
    const metadata = await this.listSnapshots(conversationId);
    const snapshots: SnapshotTimelineItem[] = [];

    for (const meta of metadata) {
      const snapshot = await this.getSnapshot(conversationId, meta.id);

      // Calculate file changes from previous snapshot
      const fileChanges: FileChange[] = [];
      if (snapshots.length > 0) {
        const previousSnapshot = snapshots[snapshots.length - 1]!.snapshot;
        fileChanges.push(...this.calculateFileChanges(previousSnapshot, snapshot));
      }

      snapshots.push({
        snapshot,
        fileChanges,
        // TODO: Add agent activities once agent tracking is implemented
      });
    }

    const currentSnapshotId = metadata.length > 0 ? metadata[0]!.id : '';

    return {
      snapshots,
      currentSnapshotId,
    };
  }

  // Restore

  async restore(
    conversationId: string,
    snapshotId: string,
    options?: RestoreOptions
  ): Promise<void> {
    const snapshot = await this.getSnapshot(conversationId, snapshotId);

    const restoreFiles = options?.filesOnly || !options?.conversationOnly;
    const restoreConversation = options?.conversationOnly || !options?.filesOnly;

    if (restoreFiles) {
      const filesToRestore = options?.selectiveFiles
        ? snapshot.files.filter((f) => options.selectiveFiles!.includes(f.path))
        : snapshot.files;

      await this.restoreFilesFromSnapshot(filesToRestore);
    }

    if (restoreConversation) {
      await this.restoreConversationState(conversationId, snapshot);
    }
  }

  async restoreFiles(
    conversationId: string,
    snapshotId: string,
    filePaths: string[]
  ): Promise<void> {
    const snapshot = await this.getSnapshot(conversationId, snapshotId);
    const filesToRestore = snapshot.files.filter((f) => filePaths.includes(f.path));

    await this.restoreFilesFromSnapshot(filesToRestore);
  }

  // Diff

  async diff(
    conversationId: string,
    fromSnapshotId: string,
    toSnapshotId: string
  ): Promise<SnapshotDiff> {
    const fromSnapshot = await this.getSnapshot(conversationId, fromSnapshotId);
    const toSnapshot = await this.getSnapshot(conversationId, toSnapshotId);

    const files: FileDiff[] = [];

    // Find modified and deleted files
    for (const fromFile of fromSnapshot.files) {
      const toFile = toSnapshot.files.find((f) => f.path === fromFile.path);

      if (!toFile) {
        // File was deleted
        files.push({
          path: fromFile.path,
          type: 'deleted',
          diff: `--- ${fromFile.path}\n+++ /dev/null\n@@ -1,${this.countLines(fromFile.content)} +0,0 @@\n${this.bufferToLines(
            fromFile.content
          )
            .map((l) => `-${l}`)
            .join('\n')}`,
          linesAdded: 0,
          linesDeleted: this.countLines(fromFile.content),
        });
      } else if (fromFile.hash !== toFile.hash) {
        // File was modified
        const diff = this.generateDiff(fromFile, toFile);
        files.push(diff);
      }
    }

    // Find added files
    for (const toFile of toSnapshot.files) {
      const fromFile = fromSnapshot.files.find((f) => f.path === toFile.path);

      if (!fromFile) {
        files.push({
          path: toFile.path,
          type: 'added',
          diff: `--- /dev/null\n+++ ${toFile.path}\n@@ -0,0 +1,${this.countLines(toFile.content)} @@\n${this.bufferToLines(
            toFile.content
          )
            .map((l) => `+${l}`)
            .join('\n')}`,
          linesAdded: this.countLines(toFile.content),
          linesDeleted: 0,
        });
      }
    }

    return {
      files,
      conversationDiff: {
        messagesAdded:
          toSnapshot.conversation.messageCount - fromSnapshot.conversation.messageCount,
        artifactsAdded: toSnapshot.conversation.artifacts.filter(
          (a) => !fromSnapshot.conversation.artifacts.includes(a)
        ),
      },
    };
  }

  // Cleanup

  async prune(conversationId: string, policy: RetentionPolicy): Promise<number> {
    const snapshots = await this.listSnapshots(conversationId);

    // Sort by timestamp (newest first)
    snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const now = Date.now();
    const cutoffTime = now - policy.keepForHours * 60 * 60 * 1000;

    let prunedCount = 0;

    for (let i = 0; i < snapshots.length; i++) {
      // Always keep minimum number
      if (i < policy.keepMinimum) {
        continue;
      }

      // Check if snapshot is older than cutoff
      if (new Date(snapshots[i]!.timestamp).getTime() < cutoffTime) {
        await this.snapshotStorage.deleteSnapshot(conversationId, snapshots[i]!.id);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  async pruneAll(): Promise<number> {
    const conversations = await this.contextStorage.listConversations();

    let totalPruned = 0;

    for (const conv of conversations) {
      const pruned = await this.prune(conv.id, {
        keepForHours: 24,
        keepMinimum: 5,
      });
      totalPruned += pruned;
    }

    return totalPruned;
  }

  // Private helpers

  private async captureFilesystemState(): Promise<FileSnapshot[]> {
    // TODO: Implement filesystem tracking
    // For now, return empty array - this would need to track which files have changed
    // In a real implementation, we'd:
    // 1. Track files modified during agent execution
    // 2. Read their current contents
    // 3. Create FileSnapshots with hash
    return [];
  }

  private async restoreFilesFromSnapshot(files: FileSnapshot[]): Promise<void> {
    for (const file of files) {
      const filePath = this.fs.join(this.workingDirectory, file.path);
      await this.fs.ensureDir(this.fs.dirname(filePath));
      await this.fs.writeFile(filePath, file.content);
    }
  }

  private async restoreConversationState(
    conversationId: string,
    _snapshot: Snapshot
  ): Promise<void> {
    // Clear current conversation
    await this.contextStorage.clear(conversationId);

    // TODO: Restore messages and artifacts from snapshot
    // This would require extending the snapshot to include full message/artifact data
    // For now, this is a placeholder
  }

  private calculateFileChanges(from: Snapshot, to: Snapshot): FileChange[] {
    const changes: FileChange[] = [];

    // Find modified and deleted files
    for (const fromFile of from.files) {
      const toFile = to.files.find((f) => f.path === fromFile.path);

      if (!toFile) {
        changes.push({
          path: fromFile.path,
          type: 'deleted',
          linesAdded: 0,
          linesDeleted: this.countLines(fromFile.content),
        });
      } else if (fromFile.hash !== toFile.hash) {
        const linesAdded = this.countLines(toFile.content);
        const linesDeleted = this.countLines(fromFile.content);
        changes.push({
          path: fromFile.path,
          type: 'modified',
          linesAdded,
          linesDeleted,
        });
      }
    }

    // Find added files
    for (const toFile of to.files) {
      const fromFile = from.files.find((f) => f.path === toFile.path);

      if (!fromFile) {
        changes.push({
          path: toFile.path,
          type: 'added',
          linesAdded: this.countLines(toFile.content),
          linesDeleted: 0,
        });
      }
    }

    return changes;
  }

  private generateDiff(from: FileSnapshot, to: FileSnapshot): FileDiff {
    const fromLines = this.bufferToLines(from.content);
    const toLines = this.bufferToLines(to.content);

    // Simple diff implementation (naive)
    const diff: string[] = [];
    diff.push(`--- ${from.path}`);
    diff.push(`+++ ${to.path}`);
    diff.push(`@@ -1,${fromLines.length} +1,${toLines.length} @@`);

    // Add all from lines as deletions
    fromLines.forEach((line) => diff.push(`-${line}`));

    // Add all to lines as additions
    toLines.forEach((line) => diff.push(`+${line}`));

    return {
      path: from.path,
      type: 'modified',
      diff: diff.join('\n'),
      linesAdded: toLines.length,
      linesDeleted: fromLines.length,
    };
  }

  private bufferToLines(buffer: Buffer): string[] {
    const text = buffer.toString('utf-8');
    return text.split('\n');
  }

  private countLines(buffer: Buffer): number {
    return this.bufferToLines(buffer).length;
  }

  private calculateSnapshotSize(files: FileSnapshot[]): number {
    return files.reduce((sum, file) => sum + file.content.length, 0);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
