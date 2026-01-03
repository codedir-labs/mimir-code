# Context Management

**Last Updated**: 2025-12-27

---

## Overview

Mimir uses a **hybrid context management system** that stores:
- **Messages**: Task descriptions, agent responses, tool summaries
- **Artifacts**: Large data (file contents, search results, command outputs)
- **Metadata**: Conversation info, metrics, tags

**Storage**:
- **Local mode**: `.mimir/context/` directory
- **Teams mode**: Cloud storage (Teams API) + local cache
- **Abstraction**: `IContextStorage` interface

---

## Architecture

### **Context = Messages + Artifacts + Metadata**

```
Conversation
├── Metadata (conversation ID, title, timestamps, metrics)
├── Messages (JSONL, append-only)
│   ├── User messages
│   ├── Assistant messages
│   ├── Tool call messages
│   └── System messages
└── Artifacts (separate files)
    ├── artifact://abc123 (file contents)
    ├── artifact://def456 (search results)
    └── artifact://ghi789 (command output)
```

### **Why Artifacts?**

**Problem**: Including large data directly in messages bloats context window

**Solution**: Store large data separately, reference by ID

**Example**:
```typescript
// ❌ BAD: Inline large file contents (wastes tokens)
{
  role: 'tool',
  content: `File contents:\n${fileContents}` // 5000 lines
}

// ✅ GOOD: Store as artifact, reference by ID
{
  role: 'tool',
  content: 'File contents stored in artifact://abc123 (5000 lines, auth logic)'
}
```

---

## Storage Implementations

### **Local Storage** (`.mimir/context/`)

```
.mimir/
└── context/
    ├── conversations/
    │   ├── conv-abc123/
    │   │   ├── messages.jsonl        # Append-only message log
    │   │   ├── metadata.json          # Conversation metadata
    │   │   └── artifacts/
    │   │       ├── art-001.txt        # File contents
    │   │       ├── art-002.json       # Search results
    │   │       └── art-003.txt        # Command output
    │   └── conv-def456/
    │       └── ...
    └── index.json                     # Conversation index
```

**Implementation**: `LocalContextStorage`

```typescript
export class LocalContextStorage implements IContextStorage {
  constructor(
    private fs: IFileSystem,
    private basePath: string // '.mimir/context'
  ) {}

  async appendMessage(conversationId: string, message: Message): Promise<void> {
    const messagePath = `${this.basePath}/conversations/${conversationId}/messages.jsonl`;
    await this.fs.ensureDir(path.dirname(messagePath));
    await this.fs.appendFile(messagePath, JSON.stringify(message) + '\n');
  }

  async storeArtifact(conversationId: string, artifact: Artifact): Promise<string> {
    const artifactId = `art-${generateId()}`;
    const artifactPath = `${this.basePath}/conversations/${conversationId}/artifacts/${artifactId}.txt`;
    await this.fs.ensureDir(path.dirname(artifactPath));
    await this.fs.writeFile(artifactPath, artifact.content);

    // Store metadata
    const metadataPath = `${artifactPath}.meta.json`;
    await this.fs.writeFile(metadataPath, JSON.stringify({
      id: artifactId,
      type: artifact.type,
      name: artifact.name,
      mimeType: artifact.mimeType,
      size: artifact.content.length,
      createdAt: new Date().toISOString(),
    }));

    return artifactId;
  }

  // ... other methods
}
```

---

### **Teams Storage** (Cloud API + Local Cache)

**Architecture**:
- **Writes**: Local cache first → Background sync to cloud
- **Reads**: Local cache (if synced) → Cloud (if cache miss)
- **Sync**: Batch sync every 60s (configurable)

```
Local Cache:
.mimir/
└── context-cache/
    ├── conv-abc123/        # Same structure as local
    │   ├── messages.jsonl
    │   ├── metadata.json
    │   └── artifacts/
    └── sync-state.json     # Sync status per conversation

Cloud Storage (Teams API):
POST /api/v1/orgs/{org}/context/conversations
POST /api/v1/orgs/{org}/context/conversations/{id}/messages
POST /api/v1/orgs/{org}/context/conversations/{id}/artifacts
GET  /api/v1/orgs/{org}/context/conversations/{id}
```

**Implementation**: `TeamsContextStorage`

```typescript
export class TeamsContextStorage implements IContextStorage {
  constructor(
    private client: ITeamsAPIClient,
    private authManager: IAuthManager
  ) {}

  async appendMessage(conversationId: string, message: Message): Promise<void> {
    const auth = await this.authManager.getAuth();
    if (!auth) throw new Error('Not authenticated');

    await this.client.context.appendMessage(auth.orgSlug, conversationId, message);
  }

  async storeArtifact(conversationId: string, artifact: Artifact): Promise<string> {
    const auth = await this.authManager.getAuth();
    if (!auth) throw new Error('Not authenticated');

    const result = await this.client.context.createArtifact(
      auth.orgSlug,
      conversationId,
      artifact
    );

    return result.artifactId;
  }

  // ... other methods
}
```

---

### **Hybrid Storage** (Local-First with Sync)

**Strategy**:
- **Write**: Always write to local cache immediately
- **Background sync**: Batch sync to Teams API every 60s
- **Read**: Prefer local cache, fallback to cloud
- **Conflict resolution**: Last-write-wins (timestamp-based)

**Implementation**: `HybridContextStorage`

```typescript
export class HybridContextStorage implements IContextStorage {
  private syncQueue: SyncQueue = new SyncQueue();

  constructor(
    private local: LocalContextStorage,
    private teams: TeamsContextStorage,
    private syncInterval: number = 60000 // 60s
  ) {
    this.startBackgroundSync();
  }

  async appendMessage(conversationId: string, message: Message): Promise<void> {
    // 1. Write to local cache immediately
    await this.local.appendMessage(conversationId, message);

    // 2. Add to sync queue (background sync)
    this.syncQueue.add({
      type: 'message',
      conversationId,
      data: message,
    });
  }

  async storeArtifact(conversationId: string, artifact: Artifact): Promise<string> {
    // 1. Store locally
    const artifactId = await this.local.storeArtifact(conversationId, artifact);

    // 2. Add to sync queue
    this.syncQueue.add({
      type: 'artifact',
      conversationId,
      artifactId,
      data: artifact,
    });

    return artifactId;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      // Try local cache first
      return await this.local.getMessages(conversationId);
    } catch {
      // Fallback to cloud
      const messages = await this.teams.getMessages(conversationId);

      // Cache locally
      for (const message of messages) {
        await this.local.appendMessage(conversationId, message);
      }

      return messages;
    }
  }

  private startBackgroundSync(): void {
    setInterval(async () => {
      await this.sync();
    }, this.syncInterval);
  }

  async sync(): Promise<void> {
    const items = this.syncQueue.getAll();

    for (const item of items) {
      try {
        if (item.type === 'message') {
          await this.teams.appendMessage(item.conversationId, item.data);
        } else if (item.type === 'artifact') {
          await this.teams.storeArtifact(item.conversationId, item.data);
        }

        this.syncQueue.markSynced(item.id);
      } catch (error) {
        this.syncQueue.markFailed(item.id, error.message);
      }
    }
  }

  // ... other methods
}
```

---

## Context Visualization Commands

### **Slash Commands**

```bash
# View context
/context                      # Show summary (messages, artifacts, tokens, cost)
/context messages             # List all messages
/context messages --role user # Filter by role
/context artifacts            # List all artifacts
/context show <artifact-id>   # Show artifact contents
/context stats                # Token count, cost, size

# Add to context
/context add <file-path>      # Add file as artifact
/context add-folder <path>    # Add folder structure
/context add-search <query>   # Add search results

# Manage context
/context prune                # Prune low-relevance messages
/context prune --strategy relevance --max-tokens 100000
/context clear                # Clear context (start fresh)
/context compact              # Manually compact (summarize old messages)
/context export <file>        # Export to JSON/Markdown
```

### **Example Output**

```bash
$ /context

📊 Context Summary

Conversation: conv-abc123
Title: "Add user authentication"
Messages: 45 (20 user, 15 assistant, 10 tool)
Artifacts: 12 (8 files, 3 search results, 1 command output)
Tokens: 85,420 / 200,000 (42.7%)
Cost: $0.0512
Created: 2025-12-27 10:30 AM
Updated: 2025-12-27 11:15 AM

Recent messages:
  [User] Add login page
  [Assistant] I'll create a login component...
  [Tool] Created file: src/pages/Login.tsx (artifact://art-007)
  [Assistant] Login page created. Next, I'll add authentication...

Artifacts:
  art-001: src/auth/login.ts (file, 250 lines)
  art-002: Search results: "authentication libraries" (search, 15 results)
  art-003: npm install output (command, 120 lines)
  ... +9 more

Run '/context messages' to see all messages
Run '/context artifacts' to see all artifacts
```

---

## Pruning Strategies

### **Relevance-Based Pruning**

**Score messages by**:
- **Recency**: Newer messages score higher
- **Role**: User messages score highest, tool results lower
- **Tool calls**: Messages with tool calls score higher
- **Success**: Successful operations score higher than failures
- **Keywords**: Messages matching task keywords score higher

**Algorithm**:
```typescript
function scoreMessage(message: Message, task: string, currentTime: Date): number {
  let score = 0;

  // Recency (0-100)
  const ageInHours = (currentTime.getTime() - message.timestamp.getTime()) / (1000 * 60 * 60);
  score += Math.max(0, 100 - ageInHours);

  // Role (0-100)
  if (message.role === 'user') score += 100;
  else if (message.role === 'assistant') score += 50;
  else if (message.role === 'tool') score += 25;

  // Tool calls (0-50)
  if (message.toolCalls && message.toolCalls.length > 0) {
    score += 50;
  }

  // Keywords (0-50)
  const taskKeywords = task.toLowerCase().split(' ');
  const messageText = message.content.toLowerCase();
  const matchingKeywords = taskKeywords.filter(k => messageText.includes(k)).length;
  score += (matchingKeywords / taskKeywords.length) * 50;

  return score;
}

async function pruneByRelevance(
  messages: Message[],
  task: string,
  maxTokens: number,
  keepRecent: number = 10
): Promise<Message[]> {
  // Always keep recent messages
  const recentMessages = messages.slice(-keepRecent);
  const olderMessages = messages.slice(0, -keepRecent);

  // Score older messages
  const scoredMessages = olderMessages.map(msg => ({
    message: msg,
    score: scoreMessage(msg, task, new Date()),
  }));

  // Sort by score (highest first)
  scoredMessages.sort((a, b) => b.score - a.score);

  // Keep messages until token limit
  const kept: Message[] = [];
  let tokenCount = countTokens(recentMessages);

  for (const { message } of scoredMessages) {
    const messageTokens = countTokens([message]);
    if (tokenCount + messageTokens <= maxTokens) {
      kept.push(message);
      tokenCount += messageTokens;
    }
  }

  // Return kept messages + recent messages (in chronological order)
  return [...kept.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()), ...recentMessages];
}
```

---

## Best Practices

### **1. Use Artifacts for Large Data**

```typescript
// ✅ GOOD: Store large file as artifact
const artifactId = await contextStorage.storeArtifact(conversationId, {
  type: 'file',
  name: 'auth.ts',
  content: fileContents, // 5000 lines
});

await contextStorage.appendMessage(conversationId, {
  role: 'tool',
  content: `File contents stored in artifact://${artifactId} (5000 lines, authentication logic)`,
});

// ❌ BAD: Include large file directly in message
await contextStorage.appendMessage(conversationId, {
  role: 'tool',
  content: `File contents:\n${fileContents}`, // Wastes 50,000+ tokens
});
```

### **2. Summarize Tool Results**

```typescript
// ✅ GOOD: Summarize search results
const searchResults = await searchFiles('authentication');
const artifactId = await contextStorage.storeArtifact(conversationId, {
  type: 'search_result',
  name: 'Authentication files',
  content: JSON.stringify(searchResults),
});

await contextStorage.appendMessage(conversationId, {
  role: 'tool',
  content: `Found ${searchResults.length} authentication files (see artifact://${artifactId}). Key files: src/auth/login.ts, src/auth/session.ts`,
});

// ❌ BAD: Include all results inline
await contextStorage.appendMessage(conversationId, {
  role: 'tool',
  content: `Found files:\n${searchResults.map(r => r.path).join('\n')}`, // Huge list
});
```

### **3. Prune Proactively**

```typescript
// Monitor context size, prune when approaching limit
if (contextTokens > 150000) {
  await contextManager.prune({
    type: 'relevance',
    maxTokens: 100000,
    keepRecent: 20,
  });
}
```

### **4. Export for Long Conversations**

```typescript
// Export conversation before clearing
await contextManager.export('conversation-backup.json');
await contextManager.clear();
```

---

**Last Updated**: 2025-12-27
