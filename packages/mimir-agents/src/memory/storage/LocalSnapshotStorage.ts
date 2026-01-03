/**
 * Local snapshot storage implementation
 * Stores full filesystem snapshots in .mimir/context/conversations/{id}/snapshots/
 */

import type { IFileSystem } from '../platform.js';
import type { ISnapshotStorage } from '../interfaces.js';
import type {
  Snapshot,
  SnapshotMetadata,
  FileSnapshot,
  ConversationSnapshot,
} from '../snapshot-types.js';
import { createHash } from 'crypto';

export class LocalSnapshotStorage implements ISnapshotStorage {
  constructor(
    private fs: IFileSystem,
    private basePath: string // '.mimir/context'
  ) {}

  // Create snapshot

  async createSnapshot(conversationId: string, snapshot: Snapshot): Promise<void> {
    const snapshotPath = this.getSnapshotPath(conversationId, snapshot.id);

    // Create snapshot directory
    await this.fs.ensureDir(snapshotPath);

    // Store files
    const filesPath = this.fs.join(snapshotPath, 'files');
    await this.fs.ensureDir(filesPath);

    for (const file of snapshot.files) {
      const filePath = this.fs.join(filesPath, file.path);
      await this.fs.ensureDir(this.fs.dirname(filePath));
      await this.fs.writeFile(filePath, file.content);
    }

    // Store conversation state
    const conversationStatePath = this.fs.join(snapshotPath, 'conversation-state.json');
    await this.fs.writeFile(conversationStatePath, JSON.stringify(snapshot.conversation, null, 2));

    // Store metadata
    const metadataPath = this.fs.join(snapshotPath, 'metadata.json');
    const metadata: SnapshotMetadata = {
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      type: snapshot.type,
      description: snapshot.description,
      tags: snapshot.tags,
      size: snapshot.size,
      fileCount: snapshot.files.length,
      agent: snapshot.agent
        ? {
            id: snapshot.agent.id,
            role: snapshot.agent.role,
            status: snapshot.agent.status,
          }
        : undefined,
    };
    await this.fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Update index
    await this.updateIndex(conversationId, metadata);
  }

  // Read snapshots

  async getSnapshot(conversationId: string, snapshotId: string): Promise<Snapshot> {
    const snapshotPath = this.getSnapshotPath(conversationId, snapshotId);
    const exists = await this.fs.exists(snapshotPath);

    if (!exists) {
      throw new Error(`Snapshot ${snapshotId} not found in conversation ${conversationId}`);
    }

    // Load metadata
    const metadataPath = this.fs.join(snapshotPath, 'metadata.json');
    const metadataStr = (await this.fs.readFile(metadataPath, 'utf-8')) as string;
    const metadata = JSON.parse(metadataStr) as SnapshotMetadata;

    // Load conversation state
    const conversationStatePath = this.fs.join(snapshotPath, 'conversation-state.json');
    const conversationStateStr = (await this.fs.readFile(conversationStatePath, 'utf-8')) as string;
    const conversationState = JSON.parse(conversationStateStr) as ConversationSnapshot;

    // Load files
    const filesPath = this.fs.join(snapshotPath, 'files');
    const files = await this.loadFilesRecursive(filesPath, '');

    return {
      id: metadata.id,
      timestamp: new Date(metadata.timestamp),
      type: metadata.type,
      files,
      conversation: conversationState,
      agent: metadata.agent,
      description: metadata.description,
      tags: metadata.tags,
      size: metadata.size,
    };
  }

  async listSnapshots(conversationId: string): Promise<SnapshotMetadata[]> {
    const index = await this.getIndex(conversationId);
    return index.map((meta) => ({
      ...meta,
      timestamp: new Date(meta.timestamp),
    }));
  }

  // Delete snapshot

  async deleteSnapshot(conversationId: string, snapshotId: string): Promise<void> {
    const snapshotPath = this.getSnapshotPath(conversationId, snapshotId);
    await this.fs.remove(snapshotPath);

    // Update index
    const index = await this.getIndex(conversationId);
    const filtered = index.filter((meta) => meta.id !== snapshotId);
    await this.saveIndex(conversationId, filtered);
  }

  // Helpers

  async snapshotExists(conversationId: string, snapshotId: string): Promise<boolean> {
    const snapshotPath = this.getSnapshotPath(conversationId, snapshotId);
    return await this.fs.exists(snapshotPath);
  }

  // Private helpers

  private getSnapshotPath(conversationId: string, snapshotId: string): string {
    return this.fs.join(this.basePath, 'conversations', conversationId, 'snapshots', snapshotId);
  }

  private async loadFilesRecursive(
    basePath: string,
    relativePath: string
  ): Promise<FileSnapshot[]> {
    const fullPath = this.fs.join(basePath, relativePath);
    const exists = await this.fs.exists(fullPath);

    if (!exists) {
      return [];
    }

    const entries = await this.fs.readdir(fullPath);
    const files: FileSnapshot[] = [];

    for (const entry of entries) {
      const entryPath = this.fs.join(fullPath, entry);
      const relativeEntryPath = relativePath ? this.fs.join(relativePath, entry) : entry;

      // Check if directory (simple heuristic: if it has no extension, it's a directory)
      try {
        const content = await this.fs.readFile(entryPath);
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content as string);

        files.push({
          path: relativeEntryPath,
          content: buffer,
          hash: this.hashBuffer(buffer),
        });
      } catch {
        // If readFile fails, it might be a directory - recurse
        const subFiles = await this.loadFilesRecursive(basePath, relativeEntryPath);
        files.push(...subFiles);
      }
    }

    return files;
  }

  private hashBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async getIndex(conversationId: string): Promise<SnapshotMetadata[]> {
    const indexPath = this.fs.join(
      this.basePath,
      'conversations',
      conversationId,
      'snapshots',
      'index.json'
    );

    const exists = await this.fs.exists(indexPath);
    if (!exists) {
      return [];
    }

    const content = (await this.fs.readFile(indexPath, 'utf-8')) as string;
    return JSON.parse(content) as SnapshotMetadata[];
  }

  private async saveIndex(conversationId: string, snapshots: SnapshotMetadata[]): Promise<void> {
    const indexPath = this.fs.join(
      this.basePath,
      'conversations',
      conversationId,
      'snapshots',
      'index.json'
    );

    await this.fs.ensureDir(this.fs.dirname(indexPath));
    await this.fs.writeFile(indexPath, JSON.stringify(snapshots, null, 2));
  }

  private async updateIndex(conversationId: string, metadata: SnapshotMetadata): Promise<void> {
    const index = await this.getIndex(conversationId);
    const existing = index.findIndex((meta) => meta.id === metadata.id);

    if (existing >= 0) {
      index[existing] = metadata;
    } else {
      index.push(metadata);
    }

    // Sort by timestamp (newest first)
    index.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    await this.saveIndex(conversationId, index);
  }
}
