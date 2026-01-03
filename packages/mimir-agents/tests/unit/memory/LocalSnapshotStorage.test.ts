/**
 * Tests for LocalSnapshotStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalSnapshotStorage } from '../../../src/memory/storage/LocalSnapshotStorage.js';
import { MockFileSystem } from '../../mocks/MockFileSystem.js';
import type { Snapshot, FileSnapshot } from '../../../src/memory/snapshot-types.js';

describe('LocalSnapshotStorage', () => {
  let fs: MockFileSystem;
  let storage: LocalSnapshotStorage;

  beforeEach(() => {
    fs = new MockFileSystem();
    storage = new LocalSnapshotStorage(fs, '.mimir/context');
  });

  const createFileSnapshot = (path: string, content: string): FileSnapshot => ({
    path,
    content: Buffer.from(content),
    hash: 'mock-hash',
  });

  const createSnapshot = (id: string, files: FileSnapshot[]): Snapshot => ({
    id,
    timestamp: new Date(),
    type: 'manual',
    files,
    conversation: {
      messageCount: 5,
      lastMessageId: 'msg-123',
      artifacts: ['art-1', 'art-2'],
    },
    description: 'Test snapshot',
    tags: ['test'],
    size: files.reduce((sum, f) => sum + f.content.length, 0),
  });

  describe('createSnapshot', () => {
    it('should create snapshot directory structure', async () => {
      const snapshot = createSnapshot('snap-1', []);

      await storage.createSnapshot('conv-1', snapshot);

      const paths = fs.getAllPaths();
      expect(paths).toContain(fs.join('.mimir/context/conversations/conv-1/snapshots/snap-1'));
      expect(paths).toContain(
        fs.join('.mimir/context/conversations/conv-1/snapshots/snap-1/files')
      );
    });

    it('should store snapshot metadata', async () => {
      const snapshot = createSnapshot('snap-1', []);

      await storage.createSnapshot('conv-1', snapshot);

      const metadataPath = '.mimir/context/conversations/conv-1/snapshots/snap-1/metadata.json';
      const metadataStr = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataStr as string);

      expect(metadata.id).toBe('snap-1');
      expect(metadata.type).toBe('manual');
      expect(metadata.description).toBe('Test snapshot');
      expect(metadata.tags).toEqual(['test']);
      expect(metadata.fileCount).toBe(0);
    });

    it('should store conversation state', async () => {
      const snapshot = createSnapshot('snap-1', []);

      await storage.createSnapshot('conv-1', snapshot);

      const statePath =
        '.mimir/context/conversations/conv-1/snapshots/snap-1/conversation-state.json';
      const stateStr = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateStr as string);

      expect(state.messageCount).toBe(5);
      expect(state.lastMessageId).toBe('msg-123');
      expect(state.artifacts).toEqual(['art-1', 'art-2']);
    });

    it('should store snapshot files', async () => {
      const files = [
        createFileSnapshot('src/file1.ts', 'export const test = 1;'),
        createFileSnapshot('src/file2.ts', 'export const test = 2;'),
      ];
      const snapshot = createSnapshot('snap-1', files);

      await storage.createSnapshot('conv-1', snapshot);

      const file1 = await fs.readFile(
        '.mimir/context/conversations/conv-1/snapshots/snap-1/files/src/file1.ts',
        'utf-8'
      );
      const file2 = await fs.readFile(
        '.mimir/context/conversations/conv-1/snapshots/snap-1/files/src/file2.ts',
        'utf-8'
      );

      expect(file1).toBe('export const test = 1;');
      expect(file2).toBe('export const test = 2;');
    });

    it('should store files in nested directories', async () => {
      const files = [
        createFileSnapshot('src/utils/helpers/format.ts', 'export const format = ()=>{}'),
      ];
      const snapshot = createSnapshot('snap-1', files);

      await storage.createSnapshot('conv-1', snapshot);

      const file = await fs.readFile(
        '.mimir/context/conversations/conv-1/snapshots/snap-1/files/src/utils/helpers/format.ts',
        'utf-8'
      );
      expect(file).toBe('export const format = ()=>{}');
    });

    it('should create and update index', async () => {
      const snapshot = createSnapshot('snap-1', []);

      await storage.createSnapshot('conv-1', snapshot);

      const indexPath = '.mimir/context/conversations/conv-1/snapshots/index.json';
      const indexStr = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexStr as string);

      expect(index).toHaveLength(1);
      expect(index[0].id).toBe('snap-1');
    });

    it('should sort index by timestamp (newest first)', async () => {
      const snapshot1 = createSnapshot('snap-1', []);
      const snapshot2 = createSnapshot('snap-2', []);
      snapshot1.timestamp = new Date('2024-01-01');
      snapshot2.timestamp = new Date('2024-01-02');

      await storage.createSnapshot('conv-1', snapshot1);
      await storage.createSnapshot('conv-1', snapshot2);

      const snapshots = await storage.listSnapshots('conv-1');
      expect(snapshots[0]!.id).toBe('snap-2'); // Newest first
      expect(snapshots[1]!.id).toBe('snap-1');
    });

    it('should include agent metadata if present', async () => {
      const snapshot = createSnapshot('snap-1', []);
      snapshot.agent = {
        id: 'agent-1',
        role: 'finder',
        status: 'completed',
      };

      await storage.createSnapshot('conv-1', snapshot);

      const metadataPath = '.mimir/context/conversations/conv-1/snapshots/snap-1/metadata.json';
      const metadataStr = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataStr as string);

      expect(metadata.agent).toEqual({
        id: 'agent-1',
        role: 'finder',
        status: 'completed',
      });
    });
  });

  describe('getSnapshot', () => {
    it('should retrieve complete snapshot', async () => {
      const files = [createFileSnapshot('test.ts', 'export const test = 1;')];
      const originalSnapshot = createSnapshot('snap-1', files);

      await storage.createSnapshot('conv-1', originalSnapshot);

      const retrieved = await storage.getSnapshot('conv-1', 'snap-1');

      expect(retrieved.id).toBe('snap-1');
      expect(retrieved.type).toBe('manual');
      expect(retrieved.description).toBe('Test snapshot');
      expect(retrieved.files).toHaveLength(1);
      expect(retrieved.files[0]!.path).toBe('test.ts');
      expect(retrieved.files[0]!.content.toString()).toBe('export const test = 1;');
    });

    it('should load nested files recursively', async () => {
      const files = [
        createFileSnapshot('src/a.ts', 'a'),
        createFileSnapshot('src/utils/b.ts', 'b'),
        createFileSnapshot('src/utils/helpers/c.ts', 'c'),
      ];
      const snapshot = createSnapshot('snap-1', files);

      await storage.createSnapshot('conv-1', snapshot);

      const retrieved = await storage.getSnapshot('conv-1', 'snap-1');

      expect(retrieved.files).toHaveLength(3);
      const paths = retrieved.files.map((f) => f.path).sort();
      expect(paths).toEqual(['src/a.ts', 'src/utils/b.ts', 'src/utils/helpers/c.ts']);
    });

    it('should throw error if snapshot not found', async () => {
      await expect(storage.getSnapshot('conv-1', 'nonexistent')).rejects.toThrow(
        'Snapshot nonexistent not found in conversation conv-1'
      );
    });

    it('should restore conversation state', async () => {
      const snapshot = createSnapshot('snap-1', []);

      await storage.createSnapshot('conv-1', snapshot);

      const retrieved = await storage.getSnapshot('conv-1', 'snap-1');

      expect(retrieved.conversation.messageCount).toBe(5);
      expect(retrieved.conversation.lastMessageId).toBe('msg-123');
      expect(retrieved.conversation.artifacts).toEqual(['art-1', 'art-2']);
    });

    it('should convert timestamp to Date object', async () => {
      const snapshot = createSnapshot('snap-1', []);
      snapshot.timestamp = new Date('2024-01-01T12:00:00Z');

      await storage.createSnapshot('conv-1', snapshot);

      const retrieved = await storage.getSnapshot('conv-1', 'snap-1');

      expect(retrieved.timestamp).toBeInstanceOf(Date);
      expect(retrieved.timestamp.toISOString()).toBe('2024-01-01T12:00:00.000Z');
    });
  });

  describe('listSnapshots', () => {
    it('should return empty array when no snapshots exist', async () => {
      const snapshots = await storage.listSnapshots('conv-1');
      expect(snapshots).toEqual([]);
    });

    it('should return all snapshots for conversation', async () => {
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', []));
      await storage.createSnapshot('conv-1', createSnapshot('snap-2', []));
      await storage.createSnapshot('conv-1', createSnapshot('snap-3', []));

      const snapshots = await storage.listSnapshots('conv-1');

      expect(snapshots).toHaveLength(3);
    });

    it('should return metadata only, not full snapshots', async () => {
      const files = [createFileSnapshot('large-file.ts', 'a'.repeat(10000))];
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', files));

      const snapshots = await storage.listSnapshots('conv-1');

      expect(snapshots[0]).toHaveProperty('id');
      expect(snapshots[0]).toHaveProperty('timestamp');
      expect(snapshots[0]).toHaveProperty('type');
      expect(snapshots[0]).not.toHaveProperty('files'); // Metadata only
    });

    it('should convert timestamps to Date objects', async () => {
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', []));

      const snapshots = await storage.listSnapshots('conv-1');

      expect(snapshots[0]!.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot directory', async () => {
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', []));

      await storage.deleteSnapshot('conv-1', 'snap-1');

      const exists = await fs.exists('.mimir/context/conversations/conv-1/snapshots/snap-1');
      expect(exists).toBe(false);
    });

    it('should remove snapshot from index', async () => {
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', []));
      await storage.createSnapshot('conv-1', createSnapshot('snap-2', []));

      await storage.deleteSnapshot('conv-1', 'snap-1');

      const snapshots = await storage.listSnapshots('conv-1');
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]!.id).toBe('snap-2');
    });

    it('should handle deleting nonexistent snapshot', async () => {
      // Should not throw, just be a no-op
      await expect(storage.deleteSnapshot('conv-1', 'nonexistent')).resolves.not.toThrow();
    });
  });

  describe('snapshotExists', () => {
    it('should return true if snapshot exists', async () => {
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', []));

      const exists = await storage.snapshotExists('conv-1', 'snap-1');
      expect(exists).toBe(true);
    });

    it('should return false if snapshot does not exist', async () => {
      const exists = await storage.snapshotExists('conv-1', 'snap-1');
      expect(exists).toBe(false);
    });
  });

  describe('file hashing', () => {
    it('should store file content as Buffer', async () => {
      const files = [createFileSnapshot('test.ts', 'test content')];
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', files));

      const retrieved = await storage.getSnapshot('conv-1', 'snap-1');

      expect(Buffer.isBuffer(retrieved.files[0]!.content)).toBe(true);
    });

    it('should preserve binary content', async () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const files: FileSnapshot[] = [
        {
          path: 'image.png',
          content: binaryContent,
          hash: 'mock-hash',
        },
      ];
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', files));

      const retrieved = await storage.getSnapshot('conv-1', 'snap-1');

      expect(retrieved.files[0]!.content).toEqual(binaryContent);
    });
  });

  describe('index management', () => {
    it('should handle multiple conversations independently', async () => {
      await storage.createSnapshot('conv-1', createSnapshot('snap-1', []));
      await storage.createSnapshot('conv-2', createSnapshot('snap-2', []));

      const conv1Snapshots = await storage.listSnapshots('conv-1');
      const conv2Snapshots = await storage.listSnapshots('conv-2');

      expect(conv1Snapshots).toHaveLength(1);
      expect(conv1Snapshots[0]!.id).toBe('snap-1');

      expect(conv2Snapshots).toHaveLength(1);
      expect(conv2Snapshots[0]!.id).toBe('snap-2');
    });

    it('should update existing snapshot in index', async () => {
      const snapshot1 = createSnapshot('snap-1', []);
      snapshot1.description = 'Original';

      await storage.createSnapshot('conv-1', snapshot1);

      const snapshot2 = createSnapshot('snap-1', []); // Same ID
      snapshot2.description = 'Updated';

      await storage.createSnapshot('conv-1', snapshot2);

      const snapshots = await storage.listSnapshots('conv-1');
      expect(snapshots).toHaveLength(1); // Only one entry
      expect(snapshots[0]!.description).toBe('Updated');
    });
  });
});
