# Mimir CLI - Teams Integration Architecture

**Repository**: `@codedir/mimir-code` (This repo - CLI)

**Purpose**: Prepare the CLI architecture to support optional Teams backend integration while maintaining full local-first functionality.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Abstraction Layers](#abstraction-layers)
3. [Configuration System](#configuration-system)
4. [Storage Abstraction](#storage-abstraction)
5. [API Client Interface](#api-client-interface)
6. [Authentication](#authentication)
7. [Config Merging Strategy](#config-merging-strategy)
8. [Tool System Integration](#tool-system-integration)
9. [Audit Trail](#audit-trail)
10. [LLM Provider Abstraction](#llm-provider-abstraction)
11. [CLI Commands](#cli-commands)
12. [Implementation Phases](#implementation-phases)

---

## Design Principles

### 1. **Local-First, Cloud-Optional**
- CLI must work 100% offline with BYOK (Bring Your Own Keys)
- Teams integration is **opt-in** via `mimir teams login`
- All features available locally, Teams adds centralized management

### 2. **Zero Breaking Changes**
- Existing local users unaffected
- Teams features added via new abstractions, not modifications
- Backward compatible configuration

### 3. **Interface-Based Design**
- Abstract all Teams-dependent code behind interfaces
- Implementations: `LocalStorage`, `TeamsCloudStorage`, `HybridStorage`
- Provider pattern for LLM clients: `DirectProvider`, `ProxiedProvider`

### 4. **Graceful Degradation**
- If Teams API unavailable → fall back to cached config (if allowed)
- If offline → local mode continues working
- Clear error messages when Teams features unavailable

### 5. **Security**
- No sensitive data in Teams requests (code stays local)
- API keys fetched on-demand, never stored in Teams requests
- Audit logs use HMAC signatures (tamper-proof)

---

## Abstraction Layers

### Overview

```
┌─────────────────────────────────────────┐
│          CLI Application                │
│  (Commands, UI, Agent Loop)             │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      Configuration Manager              │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ FileConfig   │  │ TeamsConfig     │ │
│  │ Source       │  │ Source (API)    │ │
│  └──────────────┘  └─────────────────┘ │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      Storage Backend (Interface)        │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ LocalSQLite  │  │ HybridStorage   │ │
│  │ Storage      │  │ (local+cloud)   │ │
│  └──────────────┘  └─────────────────┘ │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      LLM Provider (Interface)           │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Direct       │  │ Proxied         │ │
│  │ Provider     │  │ Provider (API)  │ │
│  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// src/core/interfaces/IConfigSource.ts
export interface IConfigSource {
  priority: number; // Higher = more important
  load(): Promise<Partial<Config>>;
  isAvailable(): Promise<boolean>;
}

// src/core/interfaces/IStorageBackend.ts
export interface IStorageBackend {
  // Conversations
  saveConversation(conv: Conversation): Promise<void>;
  loadConversation(id: string): Promise<Conversation | null>;
  listConversations(filter?: ConversationFilter): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  appendMessage(convId: string, message: Message): Promise<void>;
  loadMessages(convId: string, limit?: number): Promise<Message[]>;

  // Tool calls
  recordToolCall(call: ToolCall): Promise<void>;
  getToolCalls(convId: string): Promise<ToolCall[]>;

  // Audit / Permissions
  recordPermissionDecision(decision: PermissionDecision): Promise<void>;
  getAuditLog(filter: AuditFilter): Promise<PermissionDecision[]>;

  // Config caching (for Teams mode)
  getCachedTeamsConfig(): Promise<Partial<Config> | null>;
  setCachedTeamsConfig(config: Partial<Config>, ttl?: number): Promise<void>;

  // Sync status
  getSyncStatus(): Promise<SyncStatus>;
  markSynced(resourceType: string, ids: string[]): Promise<void>;
}

// src/core/interfaces/ITeamsAPIClient.ts
export interface ITeamsAPIClient {
  // Auth
  login(email: string, password: string): Promise<AuthResult>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  logout(): Promise<void>;

  // Config
  getOrganizationConfig(orgSlug: string, teamId?: string): Promise<TeamsConfig>;

  // Tools & Commands
  listCustomTools(orgSlug: string, teamId?: string): Promise<CustomTool[]>;
  listCustomCommands(orgSlug: string, teamId?: string): Promise<CustomCommand[]>;

  // Audit
  syncAuditLogs(orgSlug: string, logs: AuditLogEntry[]): Promise<SyncResult>;

  // LLM Proxy (optional)
  chat(request: ProxiedChatRequest): Promise<ChatResponse>;
  streamChat(request: ProxiedChatRequest): AsyncGenerator<ChatChunk>;

  // Budget
  checkBudget(orgSlug: string, estimatedCost: number): Promise<BudgetCheckResult>;
  getUsage(orgSlug: string, period: 'day' | 'week' | 'month'): Promise<UsageStats>;

  // Conversations (optional, Teams feature)
  syncConversations(orgSlug: string, conversations: Conversation[]): Promise<SyncResult>;
  fetchConversations(orgSlug: string, since?: Date): Promise<Conversation[]>;
}

// src/core/interfaces/ILLMProvider.ts (Existing, extended)
export interface ILLMProvider {
  chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse>;
  streamChat(messages: Message[], tools?: Tool[]): AsyncGenerator<ChatChunk>;
  countTokens(text: string): number;
  calculateCost(inputTokens: number, outputTokens: number): number;

  // NEW: For proxied providers
  supportsProxy(): boolean;
  setProxyClient?(client: ITeamsAPIClient): void;
}
```

---

## Configuration System

### Config Hierarchy (Revised)

**Priority Order** (highest to lowest):

1. **Default config** (hardcoded fallback)
2. **Teams config** (from API, if authenticated) ← **ENFORCED**
3. **Global config** (`~/.mimir/config.yml`)
4. **Project config** (`.mimir/config.yml`)
5. **Environment variables** (`.env`)
6. **CLI flags** (runtime overrides, may be restricted by Teams)

### Config Sources

```typescript
// src/config/sources/DefaultConfigSource.ts
export class DefaultConfigSource implements IConfigSource {
  priority = 0;

  async load(): Promise<Partial<Config>> {
    return {
      llm: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 8000
      },
      permissions: {
        autoAccept: false,
        acceptRiskLevel: 'low',
        alwaysAcceptCommands: []
      },
      docker: {
        enabled: false,
        cpuLimit: 2,
        memoryLimit: '512m'
      },
      ui: {
        theme: 'nord',
        showProgress: true
      },
      tools: {
        file_operations: { enabled: true },
        file_search: { enabled: true },
        bash_execution: { enabled: true },
        git: { enabled: true }
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }
}

// src/config/sources/TeamsConfigSource.ts
export class TeamsConfigSource implements IConfigSource {
  priority = 10; // Highest priority (after default)

  constructor(
    private apiClient: ITeamsAPIClient,
    private authManager: AuthManager,
    private storage: IStorageBackend
  ) {}

  async load(): Promise<Partial<Config>> {
    const auth = await this.authManager.getAuth();

    if (!auth || !auth.orgSlug) {
      return {}; // Not authenticated
    }

    try {
      // Fetch fresh config from Teams API
      const teamsConfig = await this.apiClient.getOrganizationConfig(
        auth.orgSlug,
        auth.teamId
      );

      // Cache for offline scenarios
      await this.storage.setCachedTeamsConfig(teamsConfig, 300); // 5-min TTL

      return this.transformTeamsConfig(teamsConfig);
    } catch (error) {
      // Network error - try cached config
      const cached = await this.storage.getCachedTeamsConfig();

      if (!cached) {
        throw new Error(
          'Cannot connect to Teams API and no cached config available. ' +
          'Please connect to network or use `mimir teams logout` to switch to local mode.'
        );
      }

      // Check if offline mode allowed
      if (!cached.teams?.offline?.allowed) {
        throw new Error(
          'Your organization requires connection to Teams API. Please connect to network.'
        );
      }

      console.warn('Using cached Teams config (offline mode)');
      return cached;
    }
  }

  async isAvailable(): Promise<boolean> {
    const auth = await this.authManager.getAuth();
    return !!auth?.orgSlug;
  }

  private transformTeamsConfig(teamsConfig: TeamsConfig): Partial<Config> {
    // Transform API response to internal config format
    return {
      teams: {
        enabled: true,
        apiUrl: teamsConfig.api_url,
        orgSlug: teamsConfig.organization.slug,
        teamId: teamsConfig.team?.id,
        features: {
          sharedTools: teamsConfig.features.custom_tools,
          sharedAllowlist: true,
          conversationSync: teamsConfig.features.conversation_sync ?? false,
          auditSync: true,
          cloudSandbox: teamsConfig.features.cloud_sandbox ?? false,
          llmProxy: teamsConfig.features.llm_proxy ?? false,
          modelQuotas: true
        },
        sync: {
          mode: 'local-first',
          batchInterval: 60000, // 1 minute
          conflictResolution: 'cloud-wins'
        },
        offline: {
          allowed: teamsConfig.organization.subscription_tier !== 'enterprise',
          fallbackToLocal: true
        }
      },
      enforcement: {
        allowedModels: teamsConfig.enforcement.allowed_models,
        blockedModels: teamsConfig.enforcement.blocked_models,
        allowedProviders: teamsConfig.enforcement.allowed_providers,
        allowedSubAgents: teamsConfig.enforcement.allowed_sub_agents,
        forcedSubAgents: teamsConfig.enforcement.forced_sub_agents,
        dockerMode: teamsConfig.enforcement.docker_mode,
        maxBudget: teamsConfig.budget.monthly_usd
          ? { monthly: teamsConfig.budget.monthly_usd }
          : undefined,
        globalAllowlist: teamsConfig.enforcement.global_allowlist,
        globalBlocklist: teamsConfig.enforcement.global_blocklist
      },
      tools: this.mergeToolsConfig(teamsConfig)
    };
  }

  private mergeToolsConfig(teamsConfig: TeamsConfig): Record<string, ToolConfig> {
    const toolsConfig: Record<string, ToolConfig> = {};

    // Disable tools not in Teams config
    if (teamsConfig.team?.config?.enabled_tools) {
      const enabledTools = new Set(teamsConfig.team.config.enabled_tools);

      // All built-in tools
      ['file_operations', 'file_search', 'bash_execution', 'git'].forEach(tool => {
        toolsConfig[tool] = { enabled: enabledTools.has(tool) };
      });
    }

    return toolsConfig;
  }
}

// src/config/sources/FileConfigSource.ts
export class FileConfigSource implements IConfigSource {
  priority = 5; // Lower than Teams

  constructor(
    private filePath: string,
    private fs: IFileSystem
  ) {}

  async load(): Promise<Partial<Config>> {
    if (!(await this.fs.exists(this.filePath))) {
      return {};
    }

    const content = await this.fs.readFile(this.filePath, 'utf-8');
    const parsed = yaml.parse(content);

    // Validate with Zod
    return ConfigSchema.partial().parse(parsed);
  }

  async isAvailable(): Promise<boolean> {
    return await this.fs.exists(this.filePath);
  }
}
```

### Config Manager

```typescript
// src/config/ConfigManager.ts
export class ConfigManager {
  private sources: IConfigSource[] = [];
  private cache: Config | null = null;

  constructor(
    private fs: IFileSystem,
    private authManager: AuthManager,
    private storage: IStorageBackend,
    private teamsClient?: ITeamsAPIClient
  ) {
    this.registerSources();
  }

  private registerSources(): void {
    // 1. Default config (always present)
    this.sources.push(new DefaultConfigSource());

    // 2. Teams config (if authenticated)
    if (this.teamsClient) {
      this.sources.push(
        new TeamsConfigSource(this.teamsClient, this.authManager, this.storage)
      );
    }

    // 3. Global config
    this.sources.push(
      new FileConfigSource(
        this.getGlobalConfigPath(),
        this.fs
      )
    );

    // 4. Project config
    this.sources.push(
      new FileConfigSource(
        '.mimir/config.yml',
        this.fs
      )
    );

    // 5. Environment variables
    this.sources.push(new EnvConfigSource());

    // Sort by priority (higher first)
    this.sources.sort((a, b) => b.priority - a.priority);
  }

  async load(): Promise<Config> {
    if (this.cache) {
      return this.cache;
    }

    const configs: Array<{ source: IConfigSource; config: Partial<Config> }> = [];

    // Load all available sources
    for (const source of this.sources) {
      if (await source.isAvailable()) {
        try {
          const config = await source.load();
          configs.push({ source, config });
        } catch (error) {
          console.warn(`Failed to load config from ${source.constructor.name}:`, error);
        }
      }
    }

    // Merge configs (reverse order = default first, teams last)
    const merged = this.mergeConfigs(
      configs.reverse().map(c => c.config)
    );

    // Validate final config
    this.cache = ConfigSchema.parse(merged);
    return this.cache;
  }

  private mergeConfigs(configs: Partial<Config>[]): Config {
    let result: any = {};

    for (const config of configs) {
      result = this.deepMerge(result, config);
    }

    return result as Config;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  async reload(): Promise<Config> {
    this.cache = null;
    return await this.load();
  }

  async isTeamsMode(): Promise<boolean> {
    const auth = await this.authManager.getAuth();
    return !!auth?.orgSlug;
  }
}
```

---

## Storage Abstraction

### Implementations

```typescript
// src/storage/LocalSQLiteStorage.ts
export class LocalSQLiteStorage implements IStorageBackend {
  constructor(private db: Database) {}

  async saveConversation(conv: Conversation): Promise<void> {
    await this.db.insert(conversations).values(conv);
  }

  async loadConversation(id: string): Promise<Conversation | null> {
    return await this.db.query.conversations.findFirst({
      where: eq(conversations.id, id)
    });
  }

  // ... other methods (existing implementation)

  async getCachedTeamsConfig(): Promise<Partial<Config> | null> {
    const cached = await this.db.query.cacheEntries.findFirst({
      where: eq(cacheEntries.key, 'teams_config')
    });

    if (!cached) return null;

    // Check TTL
    if (cached.expiresAt && cached.expiresAt < new Date()) {
      await this.db.delete(cacheEntries).where(eq(cacheEntries.key, 'teams_config'));
      return null;
    }

    return JSON.parse(cached.value);
  }

  async setCachedTeamsConfig(config: Partial<Config>, ttl = 300): Promise<void> {
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.db.insert(cacheEntries).values({
      key: 'teams_config',
      value: JSON.stringify(config),
      expiresAt
    }).onConflictDoUpdate({
      target: cacheEntries.key,
      set: {
        value: JSON.stringify(config),
        expiresAt
      }
    });
  }

  async getSyncStatus(): Promise<SyncStatus> {
    // Return sync metadata (last sync time, pending items)
    const status = await this.db.query.syncStatus.findFirst();
    return status || { lastSyncAt: null, pendingCount: 0 };
  }

  async markSynced(resourceType: string, ids: string[]): Promise<void> {
    // Mark resources as synced to cloud
    await this.db.update(syncQueue)
      .set({ syncedAt: new Date() })
      .where(
        and(
          eq(syncQueue.resourceType, resourceType),
          inArray(syncQueue.resourceId, ids)
        )
      );
  }
}

// src/storage/HybridStorage.ts
export class HybridStorage implements IStorageBackend {
  constructor(
    private local: LocalSQLiteStorage,
    private cloud: ITeamsAPIClient,
    private syncManager: SyncManager,
    private authManager: AuthManager
  ) {}

  async saveConversation(conv: Conversation): Promise<void> {
    // 1. Save locally (always)
    await this.local.saveConversation(conv);

    // 2. Queue for cloud sync (if Teams enabled)
    if (await this.authManager.isAuthenticated()) {
      this.syncManager.queueSync('conversation', conv.id);
    }
  }

  async loadConversation(id: string): Promise<Conversation | null> {
    // Try local first
    let conv = await this.local.loadConversation(id);

    if (conv) {
      return conv;
    }

    // If not found and Teams enabled, try cloud
    if (await this.authManager.isAuthenticated()) {
      const auth = await this.authManager.getAuth();
      const cloudConvs = await this.cloud.fetchConversations(
        auth.orgSlug!,
        undefined // all time
      );

      conv = cloudConvs.find(c => c.id === id) || null;

      if (conv) {
        // Cache locally
        await this.local.saveConversation(conv);
      }
    }

    return conv;
  }

  async recordPermissionDecision(decision: PermissionDecision): Promise<void> {
    // Save locally
    await this.local.recordPermissionDecision(decision);

    // Queue for audit sync
    if (await this.authManager.isAuthenticated()) {
      this.syncManager.queueSync('audit', decision.id);
    }
  }

  // Delegate other methods to local storage
  async loadMessages(convId: string, limit?: number): Promise<Message[]> {
    return await this.local.loadMessages(convId, limit);
  }

  // ... other delegations
}
```

### Sync Manager

```typescript
// src/storage/SyncManager.ts
export class SyncManager {
  private syncQueue: Map<string, Set<string>> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(
    private storage: LocalSQLiteStorage,
    private client: ITeamsAPIClient,
    private authManager: AuthManager,
    private config: Config
  ) {}

  start(): void {
    if (this.syncInterval) return;

    const interval = this.config.teams?.sync?.batchInterval ?? 60000;
    this.syncInterval = setInterval(() => this.syncBatch(), interval);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  queueSync(resourceType: string, id: string): void {
    if (!this.syncQueue.has(resourceType)) {
      this.syncQueue.set(resourceType, new Set());
    }
    this.syncQueue.get(resourceType)!.add(id);
  }

  async syncBatch(): Promise<void> {
    if (this.isSyncing || this.syncQueue.size === 0) return;
    if (!(await this.authManager.isAuthenticated())) return;

    this.isSyncing = true;

    try {
      const auth = await this.authManager.getAuth();

      // Sync audit logs
      const auditIds = this.syncQueue.get('audit') ?? new Set();
      if (auditIds.size > 0) {
        const logs = await this.storage.getAuditLog({
          ids: Array.from(auditIds)
        });

        // Transform to API format
        const apiLogs = logs.map(log => this.transformAuditLog(log));

        await this.client.syncAuditLogs(auth.orgSlug!, apiLogs);

        await this.storage.markSynced('audit', Array.from(auditIds));
        this.syncQueue.delete('audit');
      }

      // Sync conversations (if feature enabled)
      if (this.config.teams?.features?.conversationSync) {
        const convIds = this.syncQueue.get('conversation') ?? new Set();
        if (convIds.size > 0) {
          const conversations = await Promise.all(
            Array.from(convIds).map(id => this.storage.loadConversation(id))
          );

          await this.client.syncConversations(
            auth.orgSlug!,
            conversations.filter(Boolean) as Conversation[]
          );

          await this.storage.markSynced('conversation', Array.from(convIds));
          this.syncQueue.delete('conversation');
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
      // Don't throw - retry on next interval
    } finally {
      this.isSyncing = false;
    }
  }

  async forceSyncNow(): Promise<void> {
    await this.syncBatch();
  }

  private transformAuditLog(log: PermissionDecision): AuditLogEntry {
    return {
      id: log.id,
      team_id: log.teamId,
      user_id: log.userId,
      event_type: 'command_executed',
      action: log.command,
      repository: log.repository,
      branch: log.branch,
      risk_level: log.riskLevel,
      approved: log.approved,
      success: log.success,
      timestamp: log.timestamp.toISOString(),
      signature: this.signAuditLog(log)
    };
  }

  private signAuditLog(log: PermissionDecision): string {
    // HMAC signature for tamper-proofing
    const auth = this.authManager.getAuthSync();
    const secret = auth?.orgSecret || 'local-secret';

    const payload = JSON.stringify({
      id: log.id,
      user_id: log.userId,
      action: log.command,
      timestamp: log.timestamp.toISOString()
    });

    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}
```

---

## API Client Interface

### Teams API Client

```typescript
// src/teams/TeamsAPIClient.ts
export class TeamsAPIClient implements ITeamsAPIClient {
  private httpClient: AxiosInstance;

  constructor(
    private baseUrl: string,
    private authManager: AuthManager
  ) {
    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 10000
    });

    // Add auth interceptor
    this.httpClient.interceptors.request.use(async (config) => {
      const auth = await this.authManager.getAuth();
      if (auth?.accessToken) {
        config.headers.Authorization = `Bearer ${auth.accessToken}`;
      }
      if (auth?.teamId) {
        config.headers['X-Mimir-Team-Id'] = auth.teamId;
      }
      return config;
    });

    // Add token refresh interceptor
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Try to refresh token
          const refreshed = await this.authManager.refreshToken();
          if (refreshed) {
            // Retry original request
            return this.httpClient.request(error.config);
          }
        }
        throw error;
      }
    );
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const response = await this.httpClient.post<AuthResult>('/api/v1/auth/login', {
      email,
      password
    });

    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const response = await this.httpClient.post<AuthResult>('/api/v1/auth/refresh', {
      refresh_token: refreshToken
    });

    return response.data;
  }

  async logout(): Promise<void> {
    await this.httpClient.post('/api/v1/auth/logout');
  }

  async getOrganizationConfig(
    orgSlug: string,
    teamId?: string
  ): Promise<TeamsConfig> {
    const response = await this.httpClient.get<TeamsConfig>(
      `/api/v1/orgs/${orgSlug}/config`,
      { headers: teamId ? { 'X-Mimir-Team-Id': teamId } : {} }
    );

    return response.data;
  }

  async listCustomTools(
    orgSlug: string,
    teamId?: string
  ): Promise<CustomTool[]> {
    const response = await this.httpClient.get<{ tools: CustomTool[] }>(
      `/api/v1/orgs/${orgSlug}/tools`,
      { params: { team_id: teamId } }
    );

    return response.data.tools;
  }

  async syncAuditLogs(
    orgSlug: string,
    logs: AuditLogEntry[]
  ): Promise<SyncResult> {
    const response = await this.httpClient.post<SyncResult>(
      `/api/v1/orgs/${orgSlug}/audit/sync`,
      { logs }
    );

    return response.data;
  }

  async chat(request: ProxiedChatRequest): Promise<ChatResponse> {
    const response = await this.httpClient.post<ChatResponse>(
      '/api/v1/llm/chat',
      request
    );

    return response.data;
  }

  async *streamChat(request: ProxiedChatRequest): AsyncGenerator<ChatChunk> {
    const response = await this.httpClient.post(
      '/api/v1/llm/chat/stream',
      request,
      { responseType: 'stream' }
    );

    for await (const chunk of response.data) {
      yield JSON.parse(chunk.toString());
    }
  }

  async checkBudget(
    orgSlug: string,
    estimatedCost: number
  ): Promise<BudgetCheckResult> {
    const response = await this.httpClient.post<BudgetCheckResult>(
      `/api/v1/orgs/${orgSlug}/budget/check`,
      { estimated_cost: estimatedCost }
    );

    return response.data;
  }

  async getUsage(
    orgSlug: string,
    period: 'day' | 'week' | 'month'
  ): Promise<UsageStats> {
    const response = await this.httpClient.get<UsageStats>(
      `/api/v1/orgs/${orgSlug}/usage`,
      { params: { period } }
    );

    return response.data;
  }

  async syncConversations(
    orgSlug: string,
    conversations: Conversation[]
  ): Promise<SyncResult> {
    const response = await this.httpClient.post<SyncResult>(
      `/api/v1/orgs/${orgSlug}/conversations/sync`,
      { conversations }
    );

    return response.data;
  }

  async fetchConversations(
    orgSlug: string,
    since?: Date
  ): Promise<Conversation[]> {
    const response = await this.httpClient.get<{ conversations: Conversation[] }>(
      `/api/v1/orgs/${orgSlug}/conversations`,
      { params: { since: since?.toISOString() } }
    );

    return response.data.conversations;
  }
}
```

---

## Authentication

### Auth Manager

```typescript
// src/teams/AuthManager.ts
export class AuthManager {
  constructor(
    private fs: IFileSystem,
    private client: ITeamsAPIClient
  ) {}

  async login(email: string, password: string): Promise<void> {
    const result = await this.client.login(email, password);

    // Store auth in ~/.mimir/auth.json
    await this.saveAuth({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
      orgSlug: result.user.organization.slug,
      teamId: result.user.active_team?.id,
      userId: result.user.id,
      userEmail: result.user.email
    });
  }

  async logout(): Promise<void> {
    try {
      await this.client.logout();
    } finally {
      // Always delete local auth
      const authPath = await this.getAuthPath();
      if (await this.fs.exists(authPath)) {
        await this.fs.unlink(authPath);
      }
    }
  }

  async getAuth(): Promise<AuthContext | null> {
    const authPath = await this.getAuthPath();

    if (!(await this.fs.exists(authPath))) {
      return null;
    }

    const content = await this.fs.readFile(authPath, 'utf-8');
    const auth = JSON.parse(content) as AuthContext;

    // Check if expired
    if (new Date(auth.expiresAt) < new Date()) {
      // Try to refresh
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        return null;
      }
      return await this.getAuth(); // Reload refreshed auth
    }

    return auth;
  }

  getAuthSync(): AuthContext | null {
    // Synchronous version for non-async contexts
    const authPath = this.getAuthPathSync();

    if (!fs.existsSync(authPath)) {
      return null;
    }

    const content = fs.readFileSync(authPath, 'utf-8');
    return JSON.parse(content);
  }

  async refreshToken(): Promise<boolean> {
    const auth = await this.getAuth();

    if (!auth?.refreshToken) {
      return false;
    }

    try {
      const result = await this.client.refreshToken(auth.refreshToken);

      await this.saveAuth({
        ...auth,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: new Date(Date.now() + result.expires_in * 1000)
      });

      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const auth = await this.getAuth();
    return !!auth;
  }

  async switchTeam(teamId: string): Promise<void> {
    const auth = await this.getAuth();

    if (!auth) {
      throw new Error('Not authenticated');
    }

    await this.saveAuth({
      ...auth,
      teamId
    });
  }

  private async saveAuth(auth: AuthContext): Promise<void> {
    const authPath = await this.getAuthPath();

    // Ensure directory exists
    const dir = path.dirname(authPath);
    if (!(await this.fs.exists(dir))) {
      await this.fs.mkdir(dir, { recursive: true });
    }

    await this.fs.writeFile(authPath, JSON.stringify(auth, null, 2), {
      mode: 0o600 // Owner read/write only
    });
  }

  private async getAuthPath(): Promise<string> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    return path.join(homeDir, '.mimir', 'auth.json');
  }

  private getAuthPathSync(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    return path.join(homeDir, '.mimir', 'auth.json');
  }
}

export interface AuthContext {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  orgSlug: string;
  teamId?: string;
  userId: string;
  userEmail: string;
  orgSecret?: string; // For audit log signing
}
```

---

## Config Merging Strategy

### Enforcement Rules

Teams config **overrides** local config for enforced fields:

```typescript
// src/config/ConfigMerger.ts
export class ConfigMerger {
  merge(
    defaultConfig: Partial<Config>,
    teamsConfig: Partial<Config>,
    localConfig: Partial<Config>
  ): Config {
    // Start with default
    let result = { ...defaultConfig };

    // Merge local config
    result = this.deepMerge(result, localConfig);

    // Teams config overrides (enforced)
    if (teamsConfig.enforcement) {
      result.enforcement = teamsConfig.enforcement; // No local override
    }

    if (teamsConfig.teams) {
      result.teams = teamsConfig.teams; // No local override
    }

    // Tools: Teams can disable, but cannot enable if Teams disabled it
    if (teamsConfig.tools) {
      result.tools = this.mergeTools(result.tools, teamsConfig.tools);
    }

    return result as Config;
  }

  private mergeTools(
    localTools: Record<string, ToolConfig>,
    teamsTools: Record<string, ToolConfig>
  ): Record<string, ToolConfig> {
    const merged = { ...localTools };

    // Teams tools override local
    for (const [name, teamsConfig] of Object.entries(teamsTools)) {
      if (teamsConfig.enabled === false) {
        // Teams disabled this tool - cannot be re-enabled locally
        merged[name] = { enabled: false };
      } else if (merged[name]?.enabled === undefined) {
        // Teams enabled, local doesn't care - use Teams setting
        merged[name] = teamsConfig;
      }
      // else: local config takes precedence if both enabled
    }

    return merged;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}
```

---

## Tool System Integration

### Custom Tools from Teams

```typescript
// src/tools/ToolRegistry.ts (Extended)
export class ToolRegistry {
  async loadAll(config: Config): Promise<void> {
    // ... existing built-in tools

    // Load Teams tools (if authenticated)
    if (config.teams?.enabled && config.teams.features.sharedTools) {
      await this.loadTeamsTools(config);
    }

    // Load local custom tools (if allowed)
    if (!config.enforcement?.disableLocalTools) {
      await this.loadLocalTools();
    }
  }

  private async loadTeamsTools(config: Config): Promise<void> {
    const teamsClient = this.getTeamsClient();
    const auth = await this.authManager.getAuth();

    if (!auth) return;

    const teamsTools = await teamsClient.listCustomTools(
      auth.orgSlug,
      auth.teamId
    );

    for (const toolDef of teamsTools) {
      const tool = await this.buildCustomTool(toolDef);
      tool.source = toolDef.source === 'org' ? 'teams-org' : 'teams-team';

      // Teams tools have higher priority than local
      this.registerTool(tool, { override: true });
    }
  }

  private async buildCustomTool(def: CustomTool): Promise<Tool> {
    // Same compilation process as local tools
    // See plan-tools.md for details
    return {
      name: def.name,
      description: def.description,
      schema: this.jsonSchemaToZod(def.definition.schema),
      enabled: true,
      tokenCost: this.estimateTokenCost(def),
      source: 'teams',
      execute: async (args, context) => {
        // Execute in Docker sandbox
        const executor = new TypeScriptToolExecutor(def, this.fs);
        return await executor.execute(args, context);
      }
    };
  }
}
```

---

## Audit Trail

### Audit Logger (Extended)

```typescript
// src/core/AuditLogger.ts
export class AuditLogger {
  constructor(
    private storage: IStorageBackend,
    private syncManager?: SyncManager
  ) {}

  async logPermissionDecision(decision: PermissionDecision): Promise<void> {
    // Enrich with metadata
    const enriched = {
      ...decision,
      id: decision.id || uuidv4(),
      timestamp: new Date(),
      cliVersion: getVersion(),
      ipAddress: await this.getLocalIP()
    };

    // Save locally
    await this.storage.recordPermissionDecision(enriched);

    // Queue for Teams sync (if enabled)
    if (this.syncManager) {
      this.syncManager.queueSync('audit', enriched.id);
    }
  }

  async getAuditLog(filter: AuditFilter): Promise<PermissionDecision[]> {
    return await this.storage.getAuditLog(filter);
  }

  private async getLocalIP(): Promise<string> {
    // Get local IP for audit trail
    const networkInterfaces = os.networkInterfaces();
    for (const name of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[name]!) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }
}
```

---

## LLM Provider Abstraction

### Proxied Provider

```typescript
// src/providers/ProxiedLLMProvider.ts
export class ProxiedLLMProvider extends BaseLLMProvider {
  constructor(
    private config: Config,
    private teamsClient: ITeamsAPIClient,
    private authManager: AuthManager
  ) {
    super(config);
  }

  supportsProxy(): boolean {
    return true;
  }

  async chat(messages: Message[], tools?: Tool[]): Promise<ChatResponse> {
    const auth = await this.authManager.getAuth();

    if (!auth) {
      throw new Error('Not authenticated with Teams');
    }

    // Check budget before request
    const estimatedTokens = this.estimateTokens(messages);
    const estimatedCost = this.estimateCost(estimatedTokens);

    const budgetCheck = await this.teamsClient.checkBudget(
      auth.orgSlug,
      estimatedCost
    );

    if (!budgetCheck.allowed) {
      throw new BudgetExceededError(budgetCheck.reason);
    }

    // Forward to Teams API (which proxies to LLM provider)
    const response = await this.teamsClient.chat({
      org_slug: auth.orgSlug,
      team_id: auth.teamId,
      user_id: auth.userId,
      provider: this.config.llm.provider,
      model: this.config.llm.model,
      messages,
      tools: tools?.map(t => this.toolToAPIFormat(t)),
      temperature: this.config.llm.temperature,
      max_tokens: this.config.llm.maxTokens
    });

    return response;
  }

  async *streamChat(
    messages: Message[],
    tools?: Tool[]
  ): AsyncGenerator<ChatChunk> {
    const auth = await this.authManager.getAuth();

    if (!auth) {
      throw new Error('Not authenticated with Teams');
    }

    // Budget check
    const estimatedTokens = this.estimateTokens(messages);
    const estimatedCost = this.estimateCost(estimatedTokens);

    const budgetCheck = await this.teamsClient.checkBudget(
      auth.orgSlug,
      estimatedCost
    );

    if (!budgetCheck.allowed) {
      throw new BudgetExceededError(budgetCheck.reason);
    }

    // Stream from Teams API
    yield* this.teamsClient.streamChat({
      org_slug: auth.orgSlug,
      team_id: auth.teamId,
      user_id: auth.userId,
      provider: this.config.llm.provider,
      model: this.config.llm.model,
      messages,
      tools: tools?.map(t => this.toolToAPIFormat(t)),
      temperature: this.config.llm.temperature,
      max_tokens: this.config.llm.maxTokens
    });
  }

  countTokens(text: string): number {
    // Use local tokenizer (same as DirectProvider)
    return super.countTokens(text);
  }

  calculateCost(inputTokens: number, outputTokens: number): number {
    // Use local pricing data (may differ from actual cost due to margin)
    return super.calculateCost(inputTokens, outputTokens);
  }

  private estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => {
      return sum + this.countTokens(msg.content);
    }, 0);
  }

  private estimateCost(tokens: number): number {
    // Rough estimate (input tokens only, output unknown)
    return this.calculateCost(tokens, tokens * 0.3); // Assume 30% output
  }
}

// src/providers/ProviderFactory.ts (Extended)
export class ProviderFactory {
  static create(
    config: Config,
    authManager: AuthManager,
    teamsClient?: ITeamsAPIClient
  ): ILLMProvider {
    // If Teams LLM proxy enabled, use proxied provider
    if (config.teams?.features?.llmProxy && teamsClient) {
      return new ProxiedLLMProvider(config, teamsClient, authManager);
    }

    // Otherwise, direct provider
    switch (config.llm.provider) {
      case 'deepseek':
        return new DeepSeekProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      default:
        throw new Error(`Unknown provider: ${config.llm.provider}`);
    }
  }
}
```

---

## CLI Commands

### Teams Commands

```typescript
// src/cli/commands/teams.ts
import { Command } from 'commander';

export function createTeamsCommand(
  authManager: AuthManager,
  teamsClient: ITeamsAPIClient,
  configManager: ConfigManager
): Command {
  const teams = new Command('teams')
    .description('Manage Teams integration');

  // Login
  teams
    .command('login')
    .description('Authenticate with Mimir Teams')
    .action(async () => {
      const { email } = await prompts({
        type: 'text',
        name: 'email',
        message: 'Email:'
      });

      const { password } = await prompts({
        type: 'password',
        name: 'password',
        message: 'Password:'
      });

      await authManager.login(email, password);

      const auth = await authManager.getAuth();

      console.log(chalk.green('✓ Authenticated'));
      console.log(chalk.gray(`  Organization: ${auth!.orgSlug}`));
      console.log(chalk.gray(`  Email: ${auth!.userEmail}`));

      // Reload config to fetch Teams config
      await configManager.reload();

      console.log(chalk.green('\n✓ Teams config loaded'));
    });

  // Logout
  teams
    .command('logout')
    .description('Sign out from Mimir Teams')
    .action(async () => {
      await authManager.logout();
      console.log(chalk.green('✓ Signed out'));

      // Reload config (back to local mode)
      await configManager.reload();
    });

  // Status
  teams
    .command('status')
    .description('Show Teams authentication status')
    .action(async () => {
      const auth = await authManager.getAuth();

      if (!auth) {
        console.log(chalk.yellow('Not authenticated with Teams'));
        console.log(chalk.gray('\nRun `mimir teams login` to authenticate'));
        return;
      }

      console.log(chalk.bold('Teams Status\n'));
      console.log(chalk.gray('Organization:'), auth.orgSlug);
      console.log(chalk.gray('Team:'), auth.teamId || 'None (org-level)');
      console.log(chalk.gray('Email:'), auth.userEmail);

      // Get usage stats
      const usage = await teamsClient.getUsage(auth.orgSlug, 'month');

      console.log('\n' + chalk.bold('Usage (This Month)\n'));
      console.log(chalk.gray('Cost:'), `$${usage.total_cost.toFixed(2)}`);
      console.log(chalk.gray('Tokens:'), usage.total_tokens.toLocaleString());
      console.log(chalk.gray('Requests:'), usage.request_count.toLocaleString());

      // Get budget
      const config = await configManager.load();
      if (config.enforcement?.maxBudget?.monthly) {
        const budget = config.enforcement.maxBudget.monthly;
        const percentage = (usage.total_cost / budget) * 100;

        console.log('\n' + chalk.bold('Budget\n'));
        console.log(
          chalk.gray('Limit:'),
          `$${budget.toFixed(2)}`
        );
        console.log(
          chalk.gray('Used:'),
          `${percentage.toFixed(1)}%`
        );

        if (percentage > 90) {
          console.log(chalk.red('\n⚠ Budget nearly exceeded!'));
        }
      }
    });

  // Switch team
  teams
    .command('switch-team')
    .description('Switch active team')
    .action(async () => {
      const auth = await authManager.getAuth();

      if (!auth) {
        console.log(chalk.red('Not authenticated with Teams'));
        return;
      }

      // Fetch available teams
      const config = await configManager.load();
      // Would need Teams API endpoint to list user's teams
      // For now, prompt for team ID

      const { teamId } = await prompts({
        type: 'text',
        name: 'teamId',
        message: 'Team ID (leave empty for org-level):'
      });

      await authManager.switchTeam(teamId || undefined);
      await configManager.reload();

      console.log(chalk.green('✓ Switched team'));
    });

  // Sync
  teams
    .command('sync')
    .description('Force sync audit logs and conversations')
    .option('--force', 'Force full sync')
    .action(async (options) => {
      const syncManager = getSyncManager(); // Get from DI container

      if (!syncManager) {
        console.log(chalk.red('Teams sync not enabled'));
        return;
      }

      console.log(chalk.gray('Syncing...'));

      await syncManager.forceSyncNow();

      console.log(chalk.green('✓ Sync complete'));
    });

  return teams;
}
```

### Updated Main CLI

```typescript
// src/cli/index.ts
import { Command } from 'commander';
import { createTeamsCommand } from './commands/teams.js';

export async function createCLI(): Promise<Command> {
  const program = new Command();

  program
    .name('mimir')
    .description('Platform-agnostic AI coding agent')
    .version(getVersion());

  // Initialize DI container
  const container = await initializeContainer();

  // Get services
  const configManager = container.get<ConfigManager>('ConfigManager');
  const authManager = container.get<AuthManager>('AuthManager');
  const teamsClient = container.get<ITeamsAPIClient>('TeamsAPIClient');

  // Existing commands
  program.command('init').description('Initialize .mimir/ directory').action(initCommand);
  program.command('chat').description('Start interactive chat').action(chatCommand);
  // ... other commands

  // Teams commands (NEW)
  program.addCommand(createTeamsCommand(authManager, teamsClient, configManager));

  return program;
}
```

---

## Implementation Phases

### Phase 1: Abstractions & Interfaces (Week 1)
- [ ] Create `IConfigSource` interface
- [ ] Create `IStorageBackend` interface
- [ ] Create `ITeamsAPIClient` interface
- [ ] Create `ILLMProvider.supportsProxy()` method
- [ ] Update `ConfigManager` to support multiple sources
- [ ] Create `AuthManager` (auth.json management)

### Phase 2: Local Implementations (Week 1)
- [ ] Implement `DefaultConfigSource`
- [ ] Implement `FileConfigSource`
- [ ] Implement `EnvConfigSource`
- [ ] Ensure `LocalSQLiteStorage` implements new interface
- [ ] Add caching methods to `LocalSQLiteStorage`

### Phase 3: Teams API Client (Week 2)
- [ ] Install `@codedir/mimir-teams-api-contracts` package
- [ ] Implement `TeamsAPIClient`
- [ ] Implement `TeamsConfigSource`
- [ ] Add auth interceptors (token refresh)
- [ ] Add error handling (offline mode fallback)

### Phase 4: Hybrid Storage (Week 2)
- [ ] Implement `HybridStorage`
- [ ] Implement `SyncManager` (background batch sync)
- [ ] Add sync queue to SQLite schema
- [ ] Add audit log signing (HMAC)

### Phase 5: LLM Proxy (Week 3)
- [ ] Implement `ProxiedLLMProvider`
- [ ] Update `ProviderFactory` to detect Teams mode
- [ ] Add budget checking before LLM calls
- [ ] Add streaming support for proxied requests

### Phase 6: CLI Commands (Week 3)
- [ ] Implement `mimir teams login`
- [ ] Implement `mimir teams logout`
- [ ] Implement `mimir teams status`
- [ ] Implement `mimir teams switch-team`
- [ ] Implement `mimir teams sync`

### Phase 7: Config Merging (Week 4)
- [ ] Implement `ConfigMerger`
- [ ] Add enforcement rules (Teams overrides)
- [ ] Add validation (warn if local config conflicts)
- [ ] Test all merge scenarios

### Phase 8: Tool System Integration (Week 4)
- [ ] Extend `ToolRegistry` to load Teams tools
- [ ] Add `source` field to tools ('local', 'teams-org', 'teams-team')
- [ ] Add priority/override logic (Teams > local)

### Phase 9: Testing (Week 5)
- [ ] Unit tests for all new abstractions
- [ ] Integration tests with mock Teams API
- [ ] E2E test: login → fetch config → sync audit logs
- [ ] Test offline mode (cached config)
- [ ] Test budget enforcement
- [ ] Test token refresh

### Phase 10: Documentation (Week 5)
- [ ] Update README with Teams setup instructions
- [ ] Add Teams configuration examples
- [ ] Document config hierarchy
- [ ] Add troubleshooting guide
- [ ] Update CLAUDE.md with Teams architecture

---

## Migration Path

### For Existing Local Users

**No changes required.** Teams integration is opt-in:

```bash
# Continue using Mimir locally (unchanged)
mimir init
mimir chat

# Opt into Teams (when available)
mimir teams login
# → CLI now fetches config from Teams backend
# → Audit logs sync automatically
# → LLM calls routed through proxy (if enabled)
```

### For New Teams Users

```bash
# Install CLI
npm install -g @codedir/mimir-code

# Authenticate with Teams
mimir teams login
# Email: user@acme.com
# Password: ********

# Initialize project
mimir init
# → Fetches org/team config from Teams API
# → Creates .mimir/ with local overrides (if allowed)

# Start coding
mimir chat
```

---

## Next Steps

1. ✅ **Review this plan** - Ensure architecture aligns with backend plan
2. ✅ **Create API contracts package** - `@codedir/mimir-teams-api-contracts`
3. ✅ **Implement Phase 1** - Abstractions & interfaces
4. ✅ **Mock Teams API** - For testing without backend
5. ✅ **Implement Phases 2-4** - Core Teams integration
6. ✅ **Coordinate with backend** - Ensure API compatibility
7. ✅ **Test full flow** - Login → config → LLM proxy → audit sync
8. ✅ **Beta test with users** - Gather feedback

---

## Open Questions

- [ ] Should we support `.mimirrc` in addition to `.mimir/config.yml`?
- [ ] Should `mimir teams login` support OAuth (browser-based flow)?
- [ ] Should we cache Teams tools locally (avoid re-download)?
- [ ] Should we allow local config to **extend** Teams config (e.g., add tools)?
- [ ] Should we show a warning when local config conflicts with Teams config?
- [ ] Should we support multiple org/team profiles (switch between them)?
