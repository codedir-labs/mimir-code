/**
 * Tests for SnapshotManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotManager } from '../../../src/memory/managers/SnapshotManager.js';
import { LocalSnapshotStorage } from '../../../src/memory/storage/LocalSnapshotStorage.js';
import { LocalContextStorage } from '../../../src/memory/storage/LocalContextStorage.js';
import { MockFileSystem } from '../../mocks/MockFileSystem.js';
import type { Snapshot, FileSnapshot } from '../../../src/memory/snapshot-types.js';

describe('SnapshotManager', () => {
  let fs: MockFileSystem;
  let snapshotStorage: LocalSnapshotStorage;
  let contextStorage: LocalContextStorage;
  let manager: SnapshotManager;
  const workingDir = '/project';

  beforeEach(() => {
    fs = new MockFileSystem();
    snapshotStorage = new LocalSnapshotStorage(fs, '.mimir/context');
    contextStorage = new LocalContextStorage(fs, '.mimir/context');
    manager = new SnapshotManager(fs, snapshotStorage, contextStorage, workingDir);
  });

  const createFileSnapshot = (path: string, content: string): FileSnapshot => ({
    path,
    content: Buffer.from(content),
    hash: 'mock-hash-' + path,
  });

  describe('createSnapshot', () => {
    it('should create a manual snapshot', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });
      await contextStorage.appendMessage(convId, { role: 'user', content: 'Hello' });

      const snapshot = await manager.createSnapshot(convId, 'manual', 'Manual checkpoint');

      expect(snapshot.id).toMatch(/^snap-/);
      expect(snapshot.type).toBe('manual');
      expect(snapshot.description).toBe('Manual checkpoint');
      expect(snapshot.conversation.messageCount).toBe(1);
    });

    it('should create auto-agent snapshot', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot = await manager.createSnapshot(convId, 'auto-agent');

      expect(snapshot.type).toBe('auto-agent');
    });

    it('should create auto-checkpoint snapshot', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot = await manager.createSnapshot(convId, 'auto-checkpoint');

      expect(snapshot.type).toBe('auto-checkpoint');
    });

    it('should capture conversation state', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });
      await contextStorage.appendMessage(convId, { role: 'user', content: 'Message 1' });
      await contextStorage.appendMessage(convId, { role: 'assistant', content: 'Response 1' });
      await contextStorage.storeArtifact(convId, {
        type: 'file',
        name: 'test.ts',
        content: 'code',
      });

      const snapshot = await manager.createSnapshot(convId, 'manual');

      expect(snapshot.conversation.messageCount).toBe(2);
      expect(snapshot.conversation.lastMessageId).toBeTruthy();
      expect(snapshot.conversation.artifacts).toHaveLength(1);
    });

    it('should store snapshot via storage backend', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot = await manager.createSnapshot(convId, 'manual');

      const retrieved = await snapshotStorage.getSnapshot(convId, snapshot.id);
      expect(retrieved.id).toBe(snapshot.id);
    });

    it('should calculate snapshot size', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot = await manager.createSnapshot(convId, 'manual');

      expect(snapshot.size).toBeGreaterThanOrEqual(0);
    });

    it('should handle conversation with no messages', async () => {
      const convId = await contextStorage.createConversation({ title: 'Empty' });

      const snapshot = await manager.createSnapshot(convId, 'manual');

      expect(snapshot.conversation.messageCount).toBe(0);
      expect(snapshot.conversation.lastMessageId).toBe('');
    });
  });

  describe('createAgentSnapshot', () => {
    it('should create agent-specific snapshot with description', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot = await manager.createAgentSnapshot(convId, 'agent-123');

      expect(snapshot.type).toBe('auto-agent');
      expect(snapshot.description).toContain('agent-123');
      expect(snapshot.description).toContain('before execution');
    });
  });

  describe('listSnapshots', () => {
    it('should list all snapshots for conversation', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      await manager.createSnapshot(convId, 'manual', 'First');
      await manager.createSnapshot(convId, 'manual', 'Second');
      await manager.createSnapshot(convId, 'manual', 'Third');

      const snapshots = await manager.listSnapshots(convId);

      expect(snapshots).toHaveLength(3);
    });

    it('should return empty array when no snapshots exist', async () => {
      const snapshots = await manager.listSnapshots('conv-1');

      expect(snapshots).toEqual([]);
    });
  });

  describe('getSnapshot', () => {
    it('should retrieve snapshot by ID', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });
      const created = await manager.createSnapshot(convId, 'manual', 'Test snapshot');

      const retrieved = await manager.getSnapshot(convId, created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.description).toBe('Test snapshot');
    });
  });

  describe('getCurrentSnapshot', () => {
    it('should return most recent snapshot', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      await manager.createSnapshot(convId, 'manual', 'First');
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different timestamp
      const snap2 = await manager.createSnapshot(convId, 'manual', 'Second');

      const current = await manager.getCurrentSnapshot(convId);

      expect(current).not.toBeNull();
      expect(current!.id).toBe(snap2.id);
      expect(current!.description).toBe('Second');
    });

    it('should return null when no snapshots exist', async () => {
      const current = await manager.getCurrentSnapshot('conv-1');

      expect(current).toBeNull();
    });
  });

  describe('getTimeline', () => {
    it('should build timeline with snapshots', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      await manager.createSnapshot(convId, 'manual', 'First');
      await manager.createSnapshot(convId, 'manual', 'Second');

      const timeline = await manager.getTimeline(convId);

      expect(timeline.snapshots).toHaveLength(2);
      expect(timeline.currentSnapshotId).toBeTruthy();
    });

    it('should calculate file changes between snapshots', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      // Manually create snapshots with files
      const snap1: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('file1.ts', 'original')],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      const snap2: Snapshot = {
        id: 'snap-2',
        timestamp: new Date(),
        type: 'manual',
        files: [
          createFileSnapshot('file1.ts', 'modified'),
          createFileSnapshot('file2.ts', 'new file'),
        ],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 200,
      };

      await snapshotStorage.createSnapshot(convId, snap1);
      await snapshotStorage.createSnapshot(convId, snap2);

      const timeline = await manager.getTimeline(convId);

      expect(timeline.snapshots[1]!.fileChanges).toBeDefined();
      expect(timeline.snapshots[1]!.fileChanges!.length).toBeGreaterThan(0);
    });

    it('should handle empty timeline', async () => {
      const timeline = await manager.getTimeline('conv-1');

      expect(timeline.snapshots).toEqual([]);
      expect(timeline.currentSnapshotId).toBe('');
    });
  });

  describe('restore', () => {
    it('should restore files from snapshot', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      // Create snapshot with files
      const snapshot: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('restored.ts', 'restored content')],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };
      await snapshotStorage.createSnapshot(convId, snapshot);

      await manager.restore(convId, 'snap-1', { filesOnly: true });

      const restoredContent = await fs.readFile('/project/restored.ts', 'utf-8');
      expect(restoredContent).toBe('restored content');
    });

    it('should restore conversation state', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });
      await contextStorage.appendMessage(convId, { role: 'user', content: 'Original message' });

      const snapshot = await manager.createSnapshot(convId, 'manual');

      // Add more messages
      await contextStorage.appendMessage(convId, { role: 'user', content: 'New message 1' });
      await contextStorage.appendMessage(convId, { role: 'user', content: 'New message 2' });

      await manager.restore(convId, snapshot.id, { conversationOnly: true });

      const conversation = await contextStorage.getConversation(convId);
      expect(conversation.messageCount).toBe(0); // Cleared
    });

    it('should restore both files and conversation by default', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('file.ts', 'content')],
        conversation: { messageCount: 1, lastMessageId: 'msg-1', artifacts: [] },
        size: 100,
      };
      await snapshotStorage.createSnapshot(convId, snapshot);

      await manager.restore(convId, 'snap-1');

      const fileExists = await fs.exists('/project/file.ts');
      expect(fileExists).toBe(true);
    });
  });

  describe('restoreFiles', () => {
    it('should restore only specified files', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snapshot: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [
          createFileSnapshot('file1.ts', 'file1'),
          createFileSnapshot('file2.ts', 'file2'),
          createFileSnapshot('file3.ts', 'file3'),
        ],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };
      await snapshotStorage.createSnapshot(convId, snapshot);

      await manager.restoreFiles(convId, 'snap-1', ['file1.ts', 'file3.ts']);

      const file1Exists = await fs.exists('/project/file1.ts');
      const file2Exists = await fs.exists('/project/file2.ts');
      const file3Exists = await fs.exists('/project/file3.ts');

      expect(file1Exists).toBe(true);
      expect(file2Exists).toBe(false);
      expect(file3Exists).toBe(true);
    });
  });

  describe('diff', () => {
    it('should detect added files', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snap1: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 0,
      };

      const snap2: Snapshot = {
        id: 'snap-2',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('new.ts', 'new file content')],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      await snapshotStorage.createSnapshot(convId, snap1);
      await snapshotStorage.createSnapshot(convId, snap2);

      const diff = await manager.diff(convId, 'snap-1', 'snap-2');

      expect(diff.files).toHaveLength(1);
      expect(diff.files[0]!.type).toBe('added');
      expect(diff.files[0]!.path).toBe('new.ts');
      expect(diff.files[0]!.linesAdded).toBeGreaterThan(0);
      expect(diff.files[0]!.linesDeleted).toBe(0);
    });

    it('should detect deleted files', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snap1: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('deleted.ts', 'content')],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      const snap2: Snapshot = {
        id: 'snap-2',
        timestamp: new Date(),
        type: 'manual',
        files: [],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 0,
      };

      await snapshotStorage.createSnapshot(convId, snap1);
      await snapshotStorage.createSnapshot(convId, snap2);

      const diff = await manager.diff(convId, 'snap-1', 'snap-2');

      expect(diff.files).toHaveLength(1);
      expect(diff.files[0]!.type).toBe('deleted');
      expect(diff.files[0]!.path).toBe('deleted.ts');
    });

    it('should detect modified files by hash', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snap1: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('modified.ts', 'original content')],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      const snap2: Snapshot = {
        id: 'snap-2',
        timestamp: new Date(),
        type: 'manual',
        files: [
          {
            path: 'modified.ts',
            content: Buffer.from('modified content'),
            hash: 'different-hash',
          },
        ],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      await snapshotStorage.createSnapshot(convId, snap1);
      await snapshotStorage.createSnapshot(convId, snap2);

      const diff = await manager.diff(convId, 'snap-1', 'snap-2');

      expect(diff.files).toHaveLength(1);
      expect(diff.files[0]!.type).toBe('modified');
      expect(diff.files[0]!.path).toBe('modified.ts');
    });

    it('should generate unified diff format', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snap1: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [createFileSnapshot('file.ts', 'line1\nline2')],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      const snap2: Snapshot = {
        id: 'snap-2',
        timestamp: new Date(),
        type: 'manual',
        files: [
          {
            path: 'file.ts',
            content: Buffer.from('line1\nline2\nline3'),
            hash: 'different',
          },
        ],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 100,
      };

      await snapshotStorage.createSnapshot(convId, snap1);
      await snapshotStorage.createSnapshot(convId, snap2);

      const diff = await manager.diff(convId, 'snap-1', 'snap-2');

      expect(diff.files[0]!.diff).toContain('---');
      expect(diff.files[0]!.diff).toContain('+++');
      expect(diff.files[0]!.diff).toContain('@@');
    });

    it('should calculate conversation diff', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const snap1: Snapshot = {
        id: 'snap-1',
        timestamp: new Date(),
        type: 'manual',
        files: [],
        conversation: { messageCount: 5, lastMessageId: 'msg-5', artifacts: ['art-1'] },
        size: 0,
      };

      const snap2: Snapshot = {
        id: 'snap-2',
        timestamp: new Date(),
        type: 'manual',
        files: [],
        conversation: {
          messageCount: 8,
          lastMessageId: 'msg-8',
          artifacts: ['art-1', 'art-2', 'art-3'],
        },
        size: 0,
      };

      await snapshotStorage.createSnapshot(convId, snap1);
      await snapshotStorage.createSnapshot(convId, snap2);

      const diff = await manager.diff(convId, 'snap-1', 'snap-2');

      expect(diff.conversationDiff.messagesAdded).toBe(3);
      expect(diff.conversationDiff.artifactsAdded).toEqual(['art-2', 'art-3']);
    });
  });

  describe('prune', () => {
    it('should remove old snapshots', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      // Create old snapshots
      const oldSnapshot: Snapshot = {
        id: 'snap-old',
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        type: 'auto-checkpoint',
        files: [],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 0,
      };

      const recentSnapshot: Snapshot = {
        id: 'snap-recent',
        timestamp: new Date(),
        type: 'manual',
        files: [],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 0,
      };

      await snapshotStorage.createSnapshot(convId, oldSnapshot);
      await snapshotStorage.createSnapshot(convId, recentSnapshot);

      const prunedCount = await manager.prune(convId, {
        keepForHours: 24,
        keepMinimum: 1,
      });

      expect(prunedCount).toBe(1);

      const remaining = await manager.listSnapshots(convId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe('snap-recent');
    });

    it('should always keep minimum number of snapshots', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      // Create 5 old snapshots
      for (let i = 0; i < 5; i++) {
        const snapshot: Snapshot = {
          id: `snap-${i}`,
          timestamp: new Date(Date.now() - (48 + i) * 60 * 60 * 1000),
          type: 'auto-checkpoint',
          files: [],
          conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
          size: 0,
        };
        await snapshotStorage.createSnapshot(convId, snapshot);
      }

      const prunedCount = await manager.prune(convId, {
        keepForHours: 24,
        keepMinimum: 3, // Keep at least 3
      });

      expect(prunedCount).toBe(2); // Only prune 2

      const remaining = await manager.listSnapshots(convId);
      expect(remaining).toHaveLength(3);
    });

    it('should not prune if all snapshots are recent', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      await manager.createSnapshot(convId, 'manual');
      await manager.createSnapshot(convId, 'manual');

      const prunedCount = await manager.prune(convId, {
        keepForHours: 24,
        keepMinimum: 1,
      });

      expect(prunedCount).toBe(0);

      const snapshots = await manager.listSnapshots(convId);
      expect(snapshots).toHaveLength(2);
    });
  });

  describe('pruneAll', () => {
    it('should prune snapshots across all conversations', async () => {
      const conv1 = await contextStorage.createConversation({ title: 'Conv 1' });
      const conv2 = await contextStorage.createConversation({ title: 'Conv 2' });

      // Create multiple snapshots for both conversations
      // Default policy: keepForHours: 24, keepMinimum: 5
      // Create 6 old snapshots and 1 recent per conversation
      for (const convId of [conv1, conv2]) {
        // Create 6 old snapshots (older than 24h)
        for (let i = 0; i < 6; i++) {
          const oldSnapshot: Snapshot = {
            id: `snap-old-${convId}-${i}`,
            timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000 - i * 1000),
            type: 'auto-checkpoint',
            files: [],
            conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
            size: 0,
          };
          await snapshotStorage.createSnapshot(convId, oldSnapshot);
        }

        // Create 1 recent snapshot
        const recentSnapshot: Snapshot = {
          id: `snap-recent-${convId}`,
          timestamp: new Date(),
          type: 'manual',
          files: [],
          conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
          size: 0,
        };
        await snapshotStorage.createSnapshot(convId, recentSnapshot);
      }

      const totalPruned = await manager.pruneAll();

      // Should prune 2 old snapshots from each conversation
      // Each conv has 7 total (6 old + 1 recent), keeps 5 minimum, prunes 2
      // 2 conversations × 2 pruned = 4 total
      expect(totalPruned).toBe(4);
    });

    it('should use default retention policy', async () => {
      const convId = await contextStorage.createConversation({ title: 'Test' });

      const veryOldSnapshot: Snapshot = {
        id: 'snap-old',
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
        type: 'auto-checkpoint',
        files: [],
        conversation: { messageCount: 0, lastMessageId: '', artifacts: [] },
        size: 0,
      };
      await snapshotStorage.createSnapshot(convId, veryOldSnapshot);

      const totalPruned = await manager.pruneAll();

      // Default policy: keepForHours: 24, keepMinimum: 5
      // Since we have only 1 snapshot, it should not be pruned (keepMinimum: 5)
      expect(totalPruned).toBe(0);
    });
  });
});
