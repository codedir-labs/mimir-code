# Checkpoint & Snapshot System

**Last Updated**: 2025-12-27
**Priority**: High - Implement in Phase 1 (with Context/Memory)

---

## Overview

The checkpoint system provides **rewind functionality** for multi-agent execution. Users can restore to any previous state when agents make unwanted changes or encounter issues.

### Key Features

✅ **Full filesystem snapshots** (like Replit)
✅ **Per-conversation storage** (snapshots tied to threads)
✅ **Interactive timeline UI** (agent-level detail)
✅ **Automatic snapshots** before every agent execution
✅ **Severity-based merge conflict resolution**
✅ **Auto-fix loops** with configurable retry limits
✅ **1-day retention** per conversation (configurable)

### Design Principles

1. **Simplicity over efficiency**: Full snapshots (not diffs) for easy implementation
2. **Local-first**: Snapshots stay local (Teams sync = TODO, low priority)
3. **Conversation-scoped**: Each conversation has its own snapshots folder
4. **User control**: Interactive UI for restore, diff, timeline view

---

## Architecture

### **Snapshot Structure**

```typescript
interface Snapshot {
  id: string;
  timestamp: Date;
  type: 'manual' | 'auto-agent' | 'auto-checkpoint';

  // Full filesystem state (all modified files)
  files: FileSnapshot[];

  // Conversation state
  conversation: {
    messageCount: number;
    lastMessageId: string;
    artifacts: string[];  // Artifact IDs
  };

  // Agent context (if created by agent)
  agent?: {
    id: string;
    role: AgentRole;
    status: AgentStatus;
    cost: number;
    tokens: number;
  };

  // Metadata
  description?: string;
  tags?: string[];
  size: number;  // Total bytes
}

interface FileSnapshot {
  path: string;
  content: Buffer;  // Full file contents
  hash: string;     // SHA-256 for integrity
  mimeType?: string;
}
```

### **Storage Layout**

**Per-Conversation Structure**:
```
.mimir/
└── context/
    └── conversations/
        └── conv-abc123/
            ├── messages.jsonl
            ├── metadata.json
            ├── artifacts/
            │   └── ...
            └── snapshots/              # NEW: Snapshots for this conversation
                ├── snap-001/
                │   ├── files/
                │   │   ├── src/auth.ts
                │   │   ├── src/session.ts
                │   │   └── ...
                │   ├── conversation-state.json
                │   └── metadata.json
                ├── snap-002/
                │   └── ...
                ├── snap-003/
                │   └── ...
                └── index.json          # Fast lookup
```

**Why per-conversation?**
- Each conversation is isolated (no cross-contamination)
- Easy cleanup (delete conversation = delete snapshots)
- Retention policy per conversation (not global)

---

## Snapshot Manager Interface

```typescript
interface ISnapshotManager {
  // Create snapshots
  createSnapshot(
    conversationId: string,
    type: 'manual' | 'auto-agent' | 'auto-checkpoint',
    description?: string
  ): Promise<Snapshot>;

  createAgentSnapshot(
    conversationId: string,
    agentId: string
  ): Promise<Snapshot>;

  // Query snapshots
  listSnapshots(conversationId: string): Promise<Snapshot[]>;
  getSnapshot(conversationId: string, snapshotId: string): Promise<Snapshot>;
  getCurrentSnapshot(conversationId: string): Promise<Snapshot | null>;

  // Timeline
  getTimeline(conversationId: string): Promise<SnapshotTimeline>;

  // Restore
  restore(
    conversationId: string,
    snapshotId: string,
    options?: RestoreOptions
  ): Promise<void>;

  restoreFiles(
    conversationId: string,
    snapshotId: string,
    filePaths: string[]
  ): Promise<void>;

  // Diff
  diff(
    conversationId: string,
    fromSnapshotId: string,
    toSnapshotId: string
  ): Promise<SnapshotDiff>;

  // Cleanup
  prune(conversationId: string, policy: RetentionPolicy): Promise<number>;
  pruneAll(): Promise<number>;  // Prune all conversations

  // TODO: Teams sync (low priority)
  // sync(conversationId: string): Promise<SyncResult>;
  // isSynced(conversationId: string, snapshotId: string): Promise<boolean>;
}

interface RestoreOptions {
  filesOnly?: boolean;        // Only restore files, not conversation
  conversationOnly?: boolean; // Only restore conversation, not files
  selectiveFiles?: string[];  // Only restore specific files
  preview?: boolean;          // Show diff before restoring
}

interface SnapshotTimeline {
  snapshots: SnapshotTimelineItem[];
  currentSnapshotId: string;
}

interface SnapshotTimelineItem {
  snapshot: Snapshot;
  agents?: AgentActivity[];
  fileChanges: FileChange[];
}

interface AgentActivity {
  agentId: string;
  role: AgentRole;
  startTime: Date;
  endTime: Date;
  status: AgentStatus;
  snapshotsBefore: string[];  // Snapshot IDs before this agent
  snapshotsAfter: string[];   // Snapshot IDs after this agent
}

interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesDeleted: number;
}

interface SnapshotDiff {
  files: FileDiff[];
  conversationDiff: {
    messagesAdded: number;
    artifactsAdded: string[];
  };
}

interface FileDiff {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  diff: string;  // Unified diff format
  linesAdded: number;
  linesDeleted: number;
}
```

---

## Auto-Snapshot Strategy

### **When Snapshots Are Created**

```typescript
// 1. Before every agent starts
await snapshotManager.createAgentSnapshot(conversationId, agentId);

// 2. Manual user checkpoint
await snapshotManager.createSnapshot(conversationId, 'manual', 'Before refactoring');

// 3. Auto-checkpoint (configurable triggers)
// - Before major file operations
// - Before bash execution
// - On user request
```

### **Automatic Snapshot Flow**

```typescript
class AgentOrchestrator {
  async executeAgent(agent: SubAgent, task: string): Promise<AgentResult> {
    // Create snapshot BEFORE agent starts
    const snapshot = await this.snapshotManager.createAgentSnapshot(
      this.conversationId,
      agent.id
    );

    logger.debug(`Snapshot created: ${snapshot.id} (before ${agent.role})`);

    try {
      // Execute agent
      const result = await agent.execute(task);

      return result;
    } catch (error) {
      // Agent failed - snapshot still exists for rollback
      logger.error(`Agent ${agent.id} failed. Snapshot ${snapshot.id} available for rollback.`);
      throw error;
    }
  }
}
```

---

## Merge Conflict Resolution

### **Severity-Based Strategy**

When parallel agents create merge conflicts:

```typescript
interface MergeConflict {
  path: string;
  agents: string[];  // Agent IDs that modified this file
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoResolvable: boolean;
  reason: string;
}

enum ConflictSeverity {
  LOW = 'low',           // Whitespace, formatting changes
  MEDIUM = 'medium',     // Logic changes, no overlap
  HIGH = 'high',         // Overlapping logic changes
  CRITICAL = 'critical'  // Syntax errors, breaking changes
}
```

### **Resolution Strategy**

```typescript
class MergeConflictResolver {
  async resolveConflicts(
    conflicts: MergeConflict[]
  ): Promise<MergeResolution> {

    const categorized = this.categorizeConflicts(conflicts);

    // 1. Auto-resolve low severity
    const autoResolved = await this.autoResolveLow(categorized.low);

    // 2. Medium severity - merger agent attempts resolution
    const mergerResolved = await this.resolveWithMerger(categorized.medium);

    // 3. High/Critical - prompt user
    const userResolved = await this.promptUserResolution(
      [...categorized.high, ...categorized.critical]
    );

    return {
      autoResolved,
      mergerResolved,
      userResolved,
      success: userResolved.length === 0  // Success if no user intervention needed
    };
  }

  private categorizeConflicts(conflicts: MergeConflict[]): {
    low: MergeConflict[];
    medium: MergeConflict[];
    high: MergeConflict[];
    critical: MergeConflict[];
  } {
    return {
      low: conflicts.filter(c => c.severity === 'low'),
      medium: conflicts.filter(c => c.severity === 'medium'),
      high: conflicts.filter(c => c.severity === 'high'),
      critical: conflicts.filter(c => c.severity === 'critical'),
    };
  }

  private async resolveWithMerger(
    conflicts: MergeConflict[]
  ): Promise<ResolvedConflict[]> {
    if (conflicts.length === 0) return [];

    // Create merger agent
    const merger = await this.createMergerAgent();

    // Attempt resolution
    const resolved = await merger.resolve(conflicts);

    // Validate resolution
    const validation = await this.validateResolution(resolved);

    if (!validation.success) {
      // Merger couldn't resolve - escalate to user
      return [];
    }

    return resolved;
  }

  private async promptUserResolution(
    conflicts: MergeConflict[]
  ): Promise<ResolvedConflict[]> {
    if (conflicts.length === 0) return [];

    // Create merger agent to generate options
    const merger = await this.createMergerAgent();
    const options = await merger.generateResolutionOptions(conflicts);

    // Show interactive UI
    const ui = new MergeConflictUI(conflicts, options);
    const userChoice = await ui.show();

    return userChoice;
  }
}
```

---

## Auto-Fix Loop (Reviewer Issues)

### **Configuration**

```yaml
# .mimir/config.yml
agentOrchestration:
  autoFix:
    enabled: true

    # Retry limits by severity
    maxRetries:
      low: 5       # Try 5 times for warnings
      medium: 3    # Try 3 times for medium issues
      high: 1      # Try 1 time for high issues
      critical: 0  # Never auto-fix critical - always prompt user

    # Total retry cap (across all severities)
    maxTotalRetries: 10

    # Exponential backoff
    exponentialBackoff: true
    backoffBase: 1000  # 1s, 2s, 4s, 8s, ...

    # Which agent fixes issues
    fixerAgent: thinker  # or 'auto' (orchestrator picks)

    # Escalation to user
    escalateToUser: true
```

### **Auto-Fix Flow**

```typescript
class ReviewerAutoFixLoop {
  async fixIssues(
    code: string,
    issues: ReviewIssue[]
  ): Promise<FixResult> {

    const config = this.config.agentOrchestration.autoFix;
    const categorized = this.categorizeIssues(issues);

    let totalRetries = 0;
    const maxTotal = config.maxTotalRetries;

    // Process by severity (critical first, then high, medium, low)
    for (const severity of ['critical', 'high', 'medium', 'low']) {
      const severityIssues = categorized[severity];
      if (severityIssues.length === 0) continue;

      const maxRetries = config.maxRetries[severity];

      if (maxRetries === 0) {
        // Don't auto-fix - escalate immediately
        return await this.escalateToUser(code, severityIssues, 0);
      }

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        totalRetries++;

        if (totalRetries > maxTotal) {
          // Hit total retry cap
          return await this.escalateToUser(
            code,
            severityIssues,
            totalRetries,
            'Total retry limit reached'
          );
        }

        // Create snapshot before fix attempt
        await this.snapshotManager.createSnapshot(
          this.conversationId,
          'auto-checkpoint',
          `Auto-fix attempt ${attempt} (${severity})`
        );

        // Attempt fix
        const fixer = await this.getFixer();
        const fixed = await fixer.fixIssues(code, severityIssues);

        // Re-validate
        const reviewer = await this.getReviewer();
        const review = await reviewer.review(fixed);

        if (!review.hasIssues) {
          // Fixed! Continue to next severity
          code = fixed;
          break;
        }

        // Still has issues - exponential backoff
        if (config.exponentialBackoff && attempt < maxRetries) {
          await this.wait(config.backoffBase * Math.pow(2, attempt - 1));
        }

        // Last attempt for this severity?
        if (attempt === maxRetries) {
          // Failed - escalate
          return await this.escalateToUser(
            code,
            review.issues,
            totalRetries,
            `Max retries (${maxRetries}) reached for ${severity} issues`
          );
        }
      }
    }

    // All issues fixed!
    return { success: true, code, totalRetries };
  }

  private async escalateToUser(
    code: string,
    issues: ReviewIssue[],
    attempts: number,
    reason?: string
  ): Promise<FixResult> {

    const prompt = `
⚠️ Auto-fix ${reason || `failed after ${attempts} attempts`}

Issues remaining (${issues.length}):
${issues.map((i, idx) => `  ${idx + 1}. [${i.severity}] ${i.message} (${i.file}:${i.line})`).join('\n')}

Snapshots created: ${attempts} (available for rollback)

Options:
  [a] Accept anyway (ignore issues and continue)
  [r] Reject all changes (rollback to snapshot before this agent)
  [v] View diff (compare current vs snapshot)
  [m] Manual fix (open editor, I'll fix it)
  [c] Continue trying (1 more attempt)
    `;

    const choice = await this.ui.prompt(prompt);

    switch (choice) {
      case 'a':
        return { success: true, code, ignoredIssues: issues };

      case 'r':
        return { success: false, rollback: true };

      case 'v':
        await this.showDiff();
        return await this.escalateToUser(code, issues, attempts, reason);

      case 'm':
        return { success: false, manualFix: true };

      case 'c':
        // One more attempt
        return await this.fixIssues(code, issues);
    }
  }

  private categorizeIssues(issues: ReviewIssue[]): Record<string, ReviewIssue[]> {
    return {
      critical: issues.filter(i => i.severity === 'critical'),
      high: issues.filter(i => i.severity === 'high'),
      medium: issues.filter(i => i.severity === 'medium'),
      low: issues.filter(i => i.severity === 'low'),
    };
  }
}

interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  file: string;
  line: number;
  suggestion?: string;
}

interface FixResult {
  success: boolean;
  code?: string;
  totalRetries?: number;
  ignoredIssues?: ReviewIssue[];
  rollback?: boolean;
  manualFix?: boolean;
}
```

---

## Slash Commands

### **Interactive Checkpoint Command**

```bash
/checkpoint                      # Show interactive menu
/checkpoint list                 # List all snapshots
/checkpoint show <id>            # Show snapshot details
/checkpoint restore <id>         # Restore to snapshot
/checkpoint restore <id> --files-only      # Restore only files
/checkpoint restore <id> --conversation-only  # Restore only conversation
/checkpoint diff <from> <to>     # Show diff between snapshots
/checkpoint timeline             # Show visual timeline
/checkpoint prune                # Manually prune old snapshots
```

### **Implementation**

```typescript
class CheckpointCommand implements ISlashCommand {
  name = 'checkpoint';
  description = 'Manage conversation snapshots';

  async execute(args: string[], context: IToolContext): Promise<CommandResult> {
    if (args.length === 0) {
      return await this.showInteractiveMenu(context);
    }

    const subcommand = args[0];

    switch (subcommand) {
      case 'list':
        return await this.listSnapshots(context);

      case 'show':
        return await this.showSnapshot(args[1], context);

      case 'restore':
        return await this.restoreSnapshot(args[1], args.slice(2), context);

      case 'diff':
        return await this.showDiff(args[1], args[2], context);

      case 'timeline':
        return await this.showTimeline(context);

      case 'prune':
        return await this.pruneSnapshots(context);

      default:
        return { success: false, message: `Unknown subcommand: ${subcommand}` };
    }
  }

  private async showInteractiveMenu(context: IToolContext): Promise<CommandResult> {
    const conversationId = context.conversation.id;
    const snapshots = await snapshotManager.listSnapshots(conversationId);
    const timeline = await snapshotManager.getTimeline(conversationId);

    const ui = new CheckpointUI({
      snapshots,
      timeline,
      conversationId,
    });

    const result = await ui.show();

    if (result.action === 'restore') {
      await snapshotManager.restore(conversationId, result.snapshotId);
      return { success: true, message: `Restored to snapshot ${result.snapshotId}` };
    } else if (result.action === 'diff') {
      await this.showDiff(result.fromSnapshotId, result.toSnapshotId, context);
      return { success: true };
    }

    return { success: true };
  }
}
```

---

## Timeline UI (Ink Component)

```typescript
const TimelineUI: React.FC<{ timeline: SnapshotTimeline }> = ({ timeline }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selected = timeline.snapshots[selectedIndex];
  const current = timeline.snapshots.find(
    s => s.snapshot.id === timeline.currentSnapshotId
  );

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1} marginBottom={1}>
        <Text bold>Snapshot Timeline</Text>
        <Text dimColor> (Current: {current?.snapshot.description || current?.snapshot.id})</Text>
      </Box>

      {/* Timeline */}
      <Box flexDirection="column">
        {timeline.snapshots.map((item, idx) => {
          const isCurrent = item.snapshot.id === timeline.currentSnapshotId;
          const isSelected = idx === selectedIndex;

          return (
            <SnapshotTimelineItem
              key={item.snapshot.id}
              item={item}
              isCurrent={isCurrent}
              isSelected={isSelected}
            />
          );
        })}
      </Box>

      {/* Footer */}
      <Box marginTop={1} borderStyle="single" paddingX={1}>
        <Text dimColor>
          {formatKeyboardShortcut(['ArrowUp', 'ArrowDown'])} navigate | {' '}
          {formatKeyboardShortcut('Enter')} restore | {' '}
          {formatKeyboardShortcut('d')} diff | {' '}
          {formatKeyboardShortcut('v')} view details
        </Text>
      </Box>
    </Box>
  );
};

const SnapshotTimelineItem: React.FC<Props> = ({
  item,
  isCurrent,
  isSelected
}) => {
  const { snapshot, agents, fileChanges } = item;
  const timestamp = format(snapshot.timestamp, 'HH:mm:ss');
  const icon = isCurrent ? '●' : '○';
  const color = isCurrent ? 'green' : isSelected ? 'cyan' : 'gray';

  return (
    <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
      {/* Snapshot marker */}
      <Box>
        <Text color={color}>
          {timestamp} {icon} {snapshot.description || `Snapshot ${snapshot.id.slice(0, 8)}`}
        </Text>
      </Box>

      {/* Agent activities */}
      {agents && agents.length > 0 && (
        <Box flexDirection="column" paddingLeft={4}>
          {agents.map(agent => {
            const duration = (agent.endTime.getTime() - agent.startTime.getTime()) / 1000;
            const statusIcon = agent.status === 'completed' ? '✓' :
                              agent.status === 'failed' ? '✗' : '⚠';

            return (
              <Box key={agent.agentId}>
                <Text dimColor>
                  ├─► {agent.role} ({duration.toFixed(1)}s) {statusIcon}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* File changes summary */}
      {fileChanges.length > 0 && (
        <Box paddingLeft={4}>
          <Text dimColor>
            Files: {fileChanges.filter(f => f.type === 'modified').length} modified, {' '}
            {fileChanges.filter(f => f.type === 'added').length} added, {' '}
            {fileChanges.filter(f => f.type === 'deleted').length} deleted
          </Text>
        </Box>
      )}
    </Box>
  );
};
```

---

## Retention Policy

### **Default Configuration**

```yaml
# .mimir/config.yml
snapshots:
  retention:
    perConversation:
      keepForHours: 24  # Keep snapshots for 24 hours (1 day)
      keepMinimum: 5    # Always keep last 5, regardless of age

    autoCleanup: true   # Auto-prune on conversation load
    pruneOnStartup: true  # Prune all conversations on CLI startup
```

### **Retention Implementation**

```typescript
class SnapshotRetentionManager {
  async pruneConversation(
    conversationId: string,
    policy: RetentionPolicy
  ): Promise<number> {
    const snapshots = await this.snapshotManager.listSnapshots(conversationId);

    // Sort by timestamp (newest first)
    snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const now = Date.now();
    const cutoffTime = now - (policy.keepForHours * 60 * 60 * 1000);

    let prunedCount = 0;

    for (let i = 0; i < snapshots.length; i++) {
      // Always keep minimum number
      if (i < policy.keepMinimum) {
        continue;
      }

      // Check if snapshot is older than cutoff
      if (snapshots[i].timestamp.getTime() < cutoffTime) {
        await this.deleteSnapshot(conversationId, snapshots[i].id);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  async pruneAllConversations(): Promise<number> {
    const conversations = await this.contextStorage.listConversations();

    let totalPruned = 0;

    for (const conv of conversations) {
      const pruned = await this.pruneConversation(
        conv.id,
        this.config.snapshots.retention.perConversation
      );
      totalPruned += pruned;
    }

    return totalPruned;
  }

  private async deleteSnapshot(
    conversationId: string,
    snapshotId: string
  ): Promise<void> {
    const snapshotPath = this.getSnapshotPath(conversationId, snapshotId);
    await this.fs.remove(snapshotPath);  // Recursively delete directory
  }
}

interface RetentionPolicy {
  keepForHours: number;
  keepMinimum: number;
}
```

---

## TODO: Teams Cloud Sync (Low Priority)

**Note**: Marked as low priority for initial implementation. Focus on local snapshots first.

```typescript
// Future: Teams cloud sync
interface ISnapshotCloudSync {
  // Upload snapshot to Teams cloud
  uploadSnapshot(conversationId: string, snapshotId: string): Promise<void>;

  // Download snapshot from Teams cloud
  downloadSnapshot(conversationId: string, snapshotId: string): Promise<Snapshot>;

  // Background batch sync
  sync(conversationId: string): Promise<SyncResult>;

  // Check sync status
  isSynced(conversationId: string, snapshotId: string): Promise<boolean>;
}

// Implementation notes:
// 1. Use chunked uploads for large snapshots
// 2. Compress snapshots before upload (gzip)
// 3. Background batch sync every 60s (configurable)
// 4. Local-first: snapshots work offline
// 5. Conflict resolution: last-write-wins (timestamp-based)
```

---

## Implementation Checklist

### **Phase 1: Core Snapshot System** (Week 1)

- [ ] Define `ISnapshotManager` interface
- [ ] Implement `LocalSnapshotStorage` (full filesystem snapshots)
- [ ] Per-conversation snapshot directories
- [ ] Create snapshot before agent execution
- [ ] Manual `/checkpoint` command
- [ ] List snapshots
- [ ] Restore snapshot (files + conversation)
- [ ] Retention policy (24h, keep last 5)

### **Phase 2: Timeline & Diff** (Week 2)

- [ ] Timeline UI (Ink component)
- [ ] Agent-level detail in timeline
- [ ] Diff between snapshots
- [ ] Interactive checkpoint menu

### **Phase 3: Merge Conflict Resolution** (Week 3)

- [ ] Detect file conflicts (parallel agents)
- [ ] Severity-based conflict categorization
- [ ] Merger agent (Option C: user-assisted with proposals)
- [ ] Conflict resolution UI

### **Phase 4: Auto-Fix Loop** (Week 4)

- [ ] Reviewer agent integration
- [ ] Severity-based retry limits
- [ ] Total retry cap
- [ ] Escalation to user UI
- [ ] Exponential backoff

### **Phase 5: Polish** (Week 5)

- [ ] Timeline visualization improvements
- [ ] Diff view with syntax highlighting
- [ ] Snapshot compression (optional)
- [ ] Performance optimization

### **TODO: Teams Cloud Sync** (Future)

- [ ] Upload/download snapshots to/from Teams API
- [ ] Background batch sync
- [ ] Conflict resolution (cloud vs local)

---

**Last Updated**: 2025-12-27
**Status**: Architecture Complete, Ready for Implementation
