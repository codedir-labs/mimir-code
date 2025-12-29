# Phase 6: Cloud Storage & Sync

**Status**: Ready for Implementation
**Estimated Duration**: 2 weeks
**Prerequisites**: Phase 5 (LLM Proxy) Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Goals](#goals)
3. [Architecture](#architecture)
4. [Sync Strategy](#sync-strategy)
5. [Implementation Tasks](#implementation-tasks)
6. [Conflict Resolution](#conflict-resolution)
7. [Testing Strategy](#testing-strategy)
8. [Success Criteria](#success-criteria)

---

## Overview

Phase 6 implements cloud storage synchronization for conversations and audit logs. This enables:
- Conversation history accessible from any device
- Centralized audit trail for compliance
- Team-wide conversation sharing (optional)
- Backup and disaster recovery
- Cross-device continuity

**Key Principle**: Local-first sync. The CLI writes locally first, then syncs in the background. Users never wait for network operations.

---

## Goals

### Primary Goals
1. ✅ Sync conversation history to cloud
2. ✅ Sync audit logs to cloud
3. ✅ Local-first architecture (no blocking)
4. ✅ Background batch sync
5. ✅ Handle offline mode gracefully

### Secondary Goals
1. ✅ Conflict resolution (last-write-wins)
2. ✅ Sync status indicator
3. ✅ Manual sync trigger
4. ✅ Selective sync (privacy mode)

### Non-Goals
- ❌ Real-time collaboration (future)
- ❌ Operational transforms (too complex for v1)
- ❌ File/code sync (separate feature)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Agent                            │
│  (Creates conversations, tool calls, messages)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    HybridStorageBackend                      │
│  - Writes locally (instant)                                  │
│  - Queues for background sync                                │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  Local SQLite       │          │   Sync Queue            │
│  - Conversations    │          │  - Pending syncs        │
│  - Messages         │          │  - Retry logic          │
│  - Tool calls       │          │  - Error tracking       │
│  - Audit logs       │          └─────────────────────────┘
└─────────────────────┘                      │
                                             ▼
                              ┌─────────────────────────┐
                              │   Background Worker     │
                              │  - Batch sync (10s)     │
                              │  - Exponential backoff  │
                              │  - Network detection    │
                              └─────────────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────┐
                              │   Teams API             │
                              │  POST /sync/batch       │
                              │  GET /sync/pull         │
                              └─────────────────────────┘
```

### Data Flow

```
User action (send message)
  │
  ├─> Agent processes message
  │   │
  │   ├─> Create conversation (if new)
  │   ├─> Save message to local DB
  │   ├─> Call LLM (proxied)
  │   ├─> Save response to local DB
  │   │
  │   └─> Queue for sync
  │       INSERT INTO sync_queue (type, entity_id, action)
  │
  └─> Continue conversation (no waiting)

Background (every 10 seconds):
  │
  ├─> SyncWorker.run()
  │   │
  │   ├─> Check network connectivity
  │   │
  │   ├─> If offline: Skip
  │   │
  │   ├─> Fetch pending syncs
  │   │   SELECT * FROM sync_queue
  │   │   WHERE status = 'pending'
  │   │   ORDER BY created_at ASC
  │   │   LIMIT 100
  │   │
  │   ├─> Batch items
  │   │   {
  │   │     conversations: [...],
  │   │     messages: [...],
  │   │     toolCalls: [...],
  │   │     auditLogs: [...]
  │   │   }
  │   │
  │   ├─> POST /sync/batch
  │   │
  │   ├─> If success:
  │   │   └─> Mark items as synced
  │   │       UPDATE sync_queue SET status = 'synced'
  │   │
  │   └─> If failure:
  │       ├─> Increment retry_count
  │       ├─> Exponential backoff
  │       └─> Log error
  │
  └─> Sleep(10s)
```

---

## Sync Strategy

### Local-First Design

1. **Write local immediately** - No waiting for network
2. **Queue for background sync** - Non-blocking
3. **Batch sync every 10s** - Reduce API calls
4. **Exponential backoff on failure** - Don't spam API
5. **Last-write-wins** - Simple conflict resolution

### What Gets Synced

**Conversations**:
- Conversation metadata (id, title, created_at, updated_at)
- Messages (role, content, tokens, cost)
- Tool calls (name, arguments, result)
- Conversation state (active, archived)

**Audit Logs**:
- Permission decisions (approved, denied, always, never)
- Command executions (command, args, result)
- Tool executions (tool, args, status)
- Errors and warnings

**Not Synced** (Privacy):
- Local file contents (unless explicitly shared)
- Environment variables
- API keys (never synced)
- User preferences (UI settings, key bindings)

### Sync Frequency

- **Batch interval**: 10 seconds
- **Max batch size**: 100 items
- **Retry schedule**: 30s, 60s, 120s, 300s (5 min max)
- **Max retries**: 10 (then manual intervention needed)

---

## Implementation Tasks

### Task 1: Storage Backend Abstraction

**File**: `src/storage/IStorageBackend.ts` (already exists)

Extend interface:
```typescript
export interface IStorageBackend {
  // Existing methods
  execute(sql: string, params?: any[]): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;

  // New sync methods
  queueForSync(
    type: SyncEntityType,
    entityId: string,
    action: 'create' | 'update' | 'delete'
  ): Promise<void>;

  getPendingSync(limit: number): Promise<SyncQueueItem[]>;
  markSynced(items: SyncQueueItem[]): Promise<void>;
  markFailed(item: SyncQueueItem, error: string): Promise<void>;
}

export type SyncEntityType =
  | 'conversation'
  | 'message'
  | 'tool_call'
  | 'audit_log';

export interface SyncQueueItem {
  id: number;
  type: SyncEntityType;
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  data: any; // JSON serialized entity
  status: 'pending' | 'synced' | 'failed';
  retry_count: number;
  error_message?: string;
  created_at: number;
  updated_at: number;
}
```

### Task 2: HybridStorageBackend Implementation

**File**: `src/storage/HybridStorageBackend.ts` (new)

```typescript
export class HybridStorageBackend implements IStorageBackend {
  constructor(
    private localDb: LocalStorageBackend,
    private teamsClient: ITeamsAPIClient | null,
    private authManager: IAuthManager,
    private teamDetector: IWorkspaceTeamDetector
  ) {
    // Start background sync worker
    this.startSyncWorker();
  }

  // Write operations - always local first
  async execute(sql: string, params?: any[]): Promise<void> {
    await this.localDb.execute(sql, params);
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    return this.localDb.query(sql, params);
  }

  // Sync queue operations
  async queueForSync(
    type: SyncEntityType,
    entityId: string,
    action: 'create' | 'update' | 'delete'
  ): Promise<void> {
    // Check if in Teams mode
    if (!this.teamsClient || !(await this.authManager.isAuthenticated())) {
      return; // Local mode - no sync
    }

    const team = await this.teamDetector.detectTeam(process.cwd());
    if (!team) {
      return; // No team - no sync
    }

    // Fetch entity data
    const data = await this.fetchEntityData(type, entityId);

    // Add to sync queue
    await this.localDb.execute(
      `INSERT INTO sync_queue
       (type, entity_id, action, data, status, retry_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [type, entityId, action, JSON.stringify(data), Date.now(), Date.now()]
    );

    logger.debug('Queued for sync', { type, entityId, action });
  }

  async getPendingSync(limit: number): Promise<SyncQueueItem[]> {
    return this.localDb.query<SyncQueueItem>(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
       AND retry_count < 10
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit]
    );
  }

  async markSynced(items: SyncQueueItem[]): Promise<void> {
    const ids = items.map((item) => item.id);
    const placeholders = ids.map(() => '?').join(',');

    await this.localDb.execute(
      `UPDATE sync_queue
       SET status = 'synced', updated_at = ?
       WHERE id IN (${placeholders})`,
      [Date.now(), ...ids]
    );
  }

  async markFailed(item: SyncQueueItem, error: string): Promise<void> {
    await this.localDb.execute(
      `UPDATE sync_queue
       SET status = 'failed',
           retry_count = retry_count + 1,
           error_message = ?,
           updated_at = ?
       WHERE id = ?`,
      [error, Date.now(), item.id]
    );
  }

  // Background sync worker
  private startSyncWorker(): void {
    setInterval(() => {
      this.syncBatch().catch((error) => {
        logger.error('Sync worker error', { error });
      });
    }, 10000); // 10 seconds
  }

  private async syncBatch(): Promise<void> {
    // Check if in Teams mode
    if (!this.teamsClient || !(await this.authManager.isAuthenticated())) {
      return;
    }

    // Check network connectivity
    if (!(await this.isOnline())) {
      logger.debug('Offline - skipping sync');
      return;
    }

    // Get pending items
    const pending = await this.getPendingSync(100);

    if (pending.length === 0) {
      return;
    }

    logger.info('Syncing batch', { count: pending.length });

    // Group by type
    const batch = this.groupByType(pending);

    try {
      const context = await this.authManager.getActiveContext();
      const team = await this.teamDetector.detectTeam(process.cwd());

      if (!context || !team) {
        return;
      }

      // Send batch to backend
      await this.teamsClient.sync.batch(
        context.orgSlug,
        team.teamId,
        batch
      );

      // Mark as synced
      await this.markSynced(pending);

      logger.info('Sync successful', { count: pending.length });
    } catch (error) {
      logger.warn('Sync failed', { error, count: pending.length });

      // Mark as failed (will retry with backoff)
      for (const item of pending) {
        await this.markFailed(item, (error as Error).message);
      }
    }
  }

  private async isOnline(): Promise<boolean> {
    try {
      // Simple connectivity check
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(this.teamsClient!.baseUrl + '/health', {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }

  private groupByType(items: SyncQueueItem[]): SyncBatch {
    const batch: SyncBatch = {
      conversations: [],
      messages: [],
      toolCalls: [],
      auditLogs: [],
    };

    for (const item of items) {
      const data = JSON.parse(item.data);

      switch (item.type) {
        case 'conversation':
          batch.conversations.push(data);
          break;
        case 'message':
          batch.messages.push(data);
          break;
        case 'tool_call':
          batch.toolCalls.push(data);
          break;
        case 'audit_log':
          batch.auditLogs.push(data);
          break;
      }
    }

    return batch;
  }

  private async fetchEntityData(
    type: SyncEntityType,
    entityId: string
  ): Promise<any> {
    switch (type) {
      case 'conversation':
        return this.fetchConversation(entityId);
      case 'message':
        return this.fetchMessage(entityId);
      case 'tool_call':
        return this.fetchToolCall(entityId);
      case 'audit_log':
        return this.fetchAuditLog(entityId);
    }
  }

  private async fetchConversation(id: string): Promise<any> {
    const rows = await this.localDb.query(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  // Similar methods for other entities...
}
```

### Task 3: Sync Status Indicator

**File**: `src/cli/components/SyncStatus.tsx` (new)

```typescript
import React, { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import chalk from 'chalk';

interface SyncStatusProps {
  storage: IStorageBackend;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ storage }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = await storage.getPendingSync(1000);
      setPendingCount(pending.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (pendingCount === 0) {
    return (
      <Box>
        <Text color="green">✓ Synced</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="yellow">⟳ Syncing... ({pendingCount} pending)</Text>
    </Box>
  );
};
```

### Task 4: Manual Sync Command

**File**: `src/cli/commands/sync.ts` (new)

```typescript
export function buildSyncCommand(): Command {
  const cmd = new Command('sync');
  cmd.description('Manage cloud synchronization');

  cmd
    .command('now')
    .description('Trigger immediate sync')
    .action(async () => {
      const storage = getStorage(); // From DI

      console.log('\nSyncing...');

      // Force sync
      await storage.syncBatch();

      const pending = await storage.getPendingSync(1000);

      if (pending.length === 0) {
        console.log(chalk.green('\n✓ All data synced'));
      } else {
        console.log(chalk.yellow(`\n${pending.length} items still pending`));
      }
    });

  cmd
    .command('status')
    .description('Show sync status')
    .action(async () => {
      const storage = getStorage();

      const pending = await storage.getPendingSync(1000);
      const failed = await storage.query(
        'SELECT COUNT(*) as count FROM sync_queue WHERE status = "failed"'
      );

      console.log(chalk.bold('\nSync Status\n'));
      console.log(`Pending: ${chalk.yellow(pending.length)}`);
      console.log(`Failed: ${chalk.red(failed[0].count)}`);

      if (failed[0].count > 0) {
        console.log(chalk.yellow('\nRun `mimir sync retry` to retry failed items'));
      }
    });

  cmd
    .command('retry')
    .description('Retry failed syncs')
    .action(async () => {
      const storage = getStorage();

      await storage.execute(
        `UPDATE sync_queue
         SET status = 'pending', retry_count = 0
         WHERE status = 'failed'`
      );

      console.log(chalk.green('\n✓ Failed items queued for retry'));
    });

  return cmd;
}
```

### Task 5: API Contracts

**Add to Teams API Client**:

#### POST /sync/batch

**Headers**:
```
Authorization: Bearer <accessToken>
X-Team-ID: <teamId>
```

**Request**:
```typescript
interface SyncBatchRequest {
  conversations: Conversation[];
  messages: Message[];
  toolCalls: ToolCall[];
  auditLogs: AuditLog[];
}
```

**Response**:
```typescript
interface SyncBatchResponse {
  success: boolean;
  synced: {
    conversations: number;
    messages: number;
    toolCalls: number;
    auditLogs: number;
  };
  errors?: Array<{
    type: string;
    id: string;
    error: string;
  }>;
}
```

#### GET /sync/pull

Pull changes from cloud (for multi-device sync):

**Headers**:
```
Authorization: Bearer <accessToken>
X-Team-ID: <teamId>
```

**Query Parameters**:
```
?since=<timestamp>
```

**Response**:
```typescript
interface SyncPullResponse {
  conversations: Conversation[];
  messages: Message[];
  toolCalls: ToolCall[];
  auditLogs: AuditLog[];
  serverTimestamp: number;
}
```

---

## Conflict Resolution

### Strategy: Last-Write-Wins

Simple but effective for v1:

1. **Use server timestamps** as source of truth
2. **Newer update wins** on conflict
3. **No merge logic** (too complex for v1)
4. **User notified** of conflicts (rare)

### Example Conflict

```
Device A: Edit conversation title at 10:00:00
Device B: Edit conversation title at 10:00:05

Sync to server:
  - Device A pushes first → accepted
  - Device B pushes later → overwrites (last-write-wins)
  - Device A pulls next sync → gets Device B's title
```

### Future: Operational Transforms

For real-time collaboration (Phase 7+):
- CRDTs (Conflict-free Replicated Data Types)
- Operational transforms (like Google Docs)
- More complex but supports real-time editing

---

## Testing Strategy

### Unit Tests

```typescript
describe('HybridStorageBackend', () => {
  it('should write locally without waiting', async () => {
    const start = Date.now();
    await storage.execute('INSERT INTO conversations...');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // < 100ms
  });

  it('should queue items for sync', async () => {
    await storage.queueForSync('conversation', 'conv-123', 'create');

    const pending = await storage.getPendingSync(10);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('conversation');
  });

  it('should batch sync items', async () => {
    // Add 10 items
    // Trigger sync
    // Verify batch API called once
  });

  it('should retry failed syncs with backoff', async () => {
    // Mock API failure
    // Trigger sync
    // Verify retry scheduled
  });
});
```

### Integration Tests

```typescript
describe('Sync Flow', () => {
  it('should sync conversation to cloud', async () => {
    // Create conversation locally
    // Wait for sync
    // Verify appears in cloud
  });

  it('should handle offline mode', async () => {
    // Go offline
    // Create conversation
    // Go online
    // Verify syncs automatically
  });

  it('should pull changes from cloud', async () => {
    // Create conversation on Device A
    // Pull on Device B
    // Verify conversation appears
  });
});
```

---

## Success Criteria

Phase 6 is complete when:

- [ ] **Sync working**
  - [ ] Conversations sync to cloud
  - [ ] Audit logs sync to cloud
  - [ ] Background batch sync (10s)
  - [ ] Exponential backoff on failure

- [ ] **Local-first architecture**
  - [ ] Writes instant (no blocking)
  - [ ] Background sync non-blocking
  - [ ] Offline mode supported

- [ ] **Conflict resolution**
  - [ ] Last-write-wins implemented
  - [ ] Server timestamp authority
  - [ ] User notified of conflicts

- [ ] **Commands functional**
  - [ ] `mimir sync now` - force sync
  - [ ] `mimir sync status` - show status
  - [ ] `mimir sync retry` - retry failed

- [ ] **Testing complete**
  - [ ] Unit tests: 80%+ coverage
  - [ ] Integration tests pass
  - [ ] Multi-device testing

---

## Timeline

**Week 1**:
- Day 1-2: Storage backend abstraction
- Day 3-4: HybridStorageBackend implementation
- Day 5: Background sync worker

**Week 2**:
- Day 6: Sync commands
- Day 7: UI sync indicator
- Day 8-9: Testing
- Day 10: Documentation and polish

---

## Next Steps

After Phase 6 → **Complete Teams Integration! 🎉**

Optional future enhancements:
- Phase 7: Real-time collaboration
- Phase 8: Team analytics dashboard
- Phase 9: Custom integrations (Slack, GitHub, etc.)
- Phase 10: Advanced security (encryption at rest, audit compliance)
