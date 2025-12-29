# Mimir Teams - Implementation Roadmap

**Status**: Ready for Implementation
**Last Updated**: 2025-12-27

---

## Overview

This roadmap focuses on **Phase 0-1: Abstractions & Interfaces** - setting up the foundation so that:
1. ✅ **Local CLI mode continues working** (zero breaking changes)
2. ✅ **Abstractions are in place** for Teams integration
3. ✅ **When authenticated**, Teams features activate seamlessly

**Duration**: 1-2 weeks
**Goal**: Local users unaffected, Teams hooks ready

---

## Phase 0: Foundation (Days 1-2)

### Goal
Set up repositories and development infrastructure.

---

### Task 0.1: Create API Contracts Package

**Repository**: `mimir-teams-api-contracts` (new repo)

**Steps**:
1. Create GitHub repository (public)
2. Initialize npm package:
   ```bash
   mkdir mimir-teams-api-contracts
   cd mimir-teams-api-contracts
   npm init -y
   npm install zod axios
   npm install -D typescript @types/node vitest eslint prettier
   ```

3. Configure TypeScript:
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "lib": ["ES2022"],
       "moduleResolution": "bundler",
       "declaration": true,
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true
     }
   }
   ```

4. Create package structure:
   ```
   src/
   ├── v1/
   │   ├── types/
   │   │   ├── auth.ts
   │   │   ├── organizations.ts
   │   │   ├── teams.ts
   │   │   ├── config.ts
   │   │   ├── audit.ts
   │   │   ├── tools.ts
   │   │   ├── llm.ts
   │   │   └── index.ts
   │   ├── schemas/
   │   │   ├── auth.schema.ts
   │   │   ├── organizations.schema.ts
   │   │   ├── teams.schema.ts
   │   │   ├── config.schema.ts
   │   │   ├── audit.schema.ts
   │   │   ├── tools.schema.ts
   │   │   ├── llm.schema.ts
   │   │   └── index.ts
   │   ├── client/
   │   │   ├── TeamsAPIClient.ts
   │   │   ├── endpoints/
   │   │   │   ├── auth.ts
   │   │   │   ├── organizations.ts
   │   │   │   ├── teams.ts
   │   │   │   ├── config.ts
   │   │   │   ├── audit.ts
   │   │   │   ├── tools.ts
   │   │   │   └── llm.ts
   │   │   └── index.ts
   │   └── index.ts
   └── index.ts
   ```

5. Publish alpha version:
   ```bash
   npm run build
   npm publish --tag alpha --access public
   ```

**Output**: `@codedir/mimir-teams-api-contracts@0.1.0-alpha.1` published to npm

---

### Task 0.2: Add API Contracts Dependency to CLI

**Repository**: `@codedir/mimir-code` (this repo)

**Steps**:
1. Install API contracts package:
   ```bash
   npm install @codedir/mimir-teams-api-contracts@alpha
   ```

2. Update `package.json`:
   ```json
   {
     "dependencies": {
       "@codedir/mimir-teams-api-contracts": "^0.1.0-alpha.1",
       // ... existing dependencies
     }
   }
   ```

3. Verify installation:
   ```bash
   npm install
   npm run build
   npm test
   ```

**Output**: API contracts package available in CLI

---

## Phase 1: Core Abstractions (Days 3-7)

### Goal
Create interfaces and abstractions that allow local mode to work as-is, but enable Teams integration when authenticated.

---

### Task 1.1: Define Core Interfaces

**File**: `src/core/interfaces/IConfigSource.ts` (NEW)

```typescript
import { Config } from '../types/Config.js';

/**
 * Interface for configuration sources.
 * Local mode: Only uses DefaultConfigSource, FileConfigSource, EnvConfigSource
 * Teams mode: Adds TeamsConfigSource with highest priority
 */
export interface IConfigSource {
  /** Human-readable name for debugging */
  name: string;

  /** Priority (higher = overrides lower). Teams = 100, Local = 50, etc. */
  priority: number;

  /** Load configuration from this source */
  load(): Promise<Partial<Config>>;

  /** Check if this source is available (e.g., file exists, API reachable) */
  isAvailable(): Promise<boolean>;

  /** Whether this source enforces config (cannot be overridden) */
  isEnforced(): boolean;
}
```

**File**: `src/core/interfaces/IAuthManager.ts` (NEW)

```typescript
/**
 * Auth context for a single organization.
 */
export interface AuthContext {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  orgSlug: string;
  userId: string;
  userEmail: string;
  orgSecret: string;  // For HMAC signing
}

/**
 * Multi-org authentication manager.
 * Local mode: Returns null (not authenticated)
 * Teams mode: Manages auth for multiple orgs
 */
export interface IAuthManager {
  /** Login to organization */
  login(email: string, password: string, orgSlug?: string): Promise<void>;

  /** Logout from organization (or all orgs) */
  logout(orgSlug?: string, all?: boolean): Promise<void>;

  /** Get auth context for organization (null if not authenticated) */
  getAuth(orgSlug?: string): Promise<AuthContext | null>;

  /** Get active organization slug */
  getActiveOrg(): Promise<string | null>;

  /** Set active organization */
  setActiveOrg(orgSlug: string): Promise<void>;

  /** List all authenticated organizations */
  listOrgs(): Promise<string[]>;

  /** Refresh access token */
  refreshToken(orgSlug: string): Promise<boolean>;

  /** Check if authenticated */
  isAuthenticated(orgSlug?: string): Promise<boolean>;
}
```

**File**: `src/core/interfaces/ITeamsAPIClient.ts` (NEW)

```typescript
import { TeamsAPIClient } from '@codedir/mimir-teams-api-contracts';

/**
 * Teams API client interface.
 * Local mode: Not used (null)
 * Teams mode: Initialized with auth manager
 */
export interface ITeamsAPIClient extends TeamsAPIClient {
  // Extend if needed for CLI-specific methods
}
```

**File**: `src/core/interfaces/IWorkspaceTeamDetector.ts` (NEW)

```typescript
/**
 * Team context detected from workspace.
 */
export interface TeamContext {
  teamId: string;
  teamSlug: string;
  teamName: string;
  role: 'admin' | 'developer' | 'viewer';
}

/**
 * Workspace team detector.
 * Local mode: Returns null (no team detection)
 * Teams mode: Detects team from git origin
 */
export interface IWorkspaceTeamDetector {
  /** Detect team from workspace (null if not found) */
  detect(orgSlug: string, workingDirectory: string): Promise<TeamContext | null>;

  /** Clear cached team mappings */
  clearCache(): Promise<void>;
}
```

**Output**: All core interfaces defined

---

### Task 1.2: Implement No-Op Classes for Local Mode

**File**: `src/core/auth/NoOpAuthManager.ts` (NEW)

```typescript
import { IAuthManager, AuthContext } from '../interfaces/IAuthManager.js';

/**
 * No-op auth manager for local mode.
 * Always returns null (not authenticated).
 */
export class NoOpAuthManager implements IAuthManager {
  async login(): Promise<void> {
    throw new Error('Teams features not available. Use local mode (BYOK).');
  }

  async logout(): Promise<void> {
    // No-op
  }

  async getAuth(): Promise<AuthContext | null> {
    return null;  // Not authenticated
  }

  async getActiveOrg(): Promise<string | null> {
    return null;
  }

  async setActiveOrg(): Promise<void> {
    throw new Error('Teams features not available.');
  }

  async listOrgs(): Promise<string[]> {
    return [];
  }

  async refreshToken(): Promise<boolean> {
    return false;
  }

  async isAuthenticated(): Promise<boolean> {
    return false;
  }
}
```

**File**: `src/core/team/NoOpTeamDetector.ts` (NEW)

```typescript
import { IWorkspaceTeamDetector, TeamContext } from '../interfaces/IWorkspaceTeamDetector.js';

/**
 * No-op team detector for local mode.
 * Always returns null (no team).
 */
export class NoOpTeamDetector implements IWorkspaceTeamDetector {
  async detect(): Promise<TeamContext | null> {
    return null;  // No team in local mode
  }

  async clearCache(): Promise<void> {
    // No-op
  }
}
```

**Output**: Local mode implementations (no-ops)

---

### Task 1.3: Implement Config Sources

**File**: `src/config/sources/DefaultConfigSource.ts` (NEW)

```typescript
import { IConfigSource } from '../../core/interfaces/IConfigSource.js';
import { Config } from '../../core/types/Config.js';

/**
 * Default configuration source (hardcoded fallback).
 * Always available, lowest priority.
 */
export class DefaultConfigSource implements IConfigSource {
  name = 'default';
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
      tools: {
        file_operations: { enabled: true },
        file_search: { enabled: true },
        bash_execution: { enabled: true },
        git: { enabled: true }
      },
      ui: {
        theme: 'nord',
        showProgress: true,
        compactMode: false
      },
      keyBindings: {
        interrupt: ['Ctrl+C', 'Escape'],
        accept: ['Enter'],
        // ... default shortcuts
      },
      docker: {
        enabled: false,
        cpuLimit: 2,
        memoryLimit: '512m'
      },
      mcp: {
        servers: []
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;  // Always available
  }

  isEnforced(): boolean {
    return false;  // Not enforced
  }
}
```

**File**: `src/config/sources/TeamsConfigSource.ts` (NEW)

```typescript
import { IConfigSource } from '../../core/interfaces/IConfigSource.js';
import { ITeamsAPIClient } from '../../core/interfaces/ITeamsAPIClient.js';
import { IAuthManager } from '../../core/interfaces/IAuthManager.js';
import { IStorageBackend } from '../../core/interfaces/IStorageBackend.js';
import { Config } from '../../core/types/Config.js';

/**
 * Teams configuration source (fetched from backend).
 * Only available when authenticated.
 * Highest priority, enforced.
 */
export class TeamsConfigSource implements IConfigSource {
  name = 'teams';
  priority = 100;  // Highest priority

  constructor(
    private client: ITeamsAPIClient,
    private authManager: IAuthManager,
    private storage: IStorageBackend,
    private teamId?: string
  ) {}

  async load(): Promise<Partial<Config>> {
    const auth = await this.authManager.getAuth();
    if (!auth) {
      return {};  // Not authenticated
    }

    try {
      // Fetch config from backend
      const response = await this.client.config.get(auth.orgSlug, this.teamId);

      // Cache config
      const ttl = response.organization.offline?.cache_ttl || 86400;  // 1 day default
      await this.storage.setCachedTeamsConfig(
        this.transformConfig(response),
        ttl
      );

      return this.transformConfig(response);
    } catch (error) {
      // Network error - check cache
      const cached = await this.storage.getCachedTeamsConfig();

      if (!cached) {
        throw new Error(
          'Cannot connect to Teams API and no cached config available.\n' +
          'Please connect to network or run: mimir auth logout'
        );
      }

      // Strict enforcement: No grace period
      const cacheExpired = cached.teams?.cacheExpiredAt &&
                           new Date(cached.teams.cacheExpiredAt) < new Date();

      if (cacheExpired) {
        throw new Error(
          'Cannot connect to Teams API.\n' +
          'Config cache expired. Please connect to network or run: mimir auth logout'
        );
      }

      console.warn('⚠ Using cached Teams config (offline mode)');
      return cached;
    }
  }

  async isAvailable(): Promise<boolean> {
    return await this.authManager.isAuthenticated();
  }

  isEnforced(): boolean {
    return true;  // Teams config is enforced
  }

  private transformConfig(response: any): Partial<Config> {
    // Transform backend response to CLI config format
    // (Implementation details in TEAMS-ARCHITECTURE.md)
    return {
      teams: {
        enabled: true,
        apiUrl: response.organization.api_url,
        orgSlug: response.organization.slug,
        teamId: this.teamId,
        // ...
      },
      enforcement: {
        allowedModels: response.organization.enforcement.allowed_models,
        allowedProviders: response.organization.enforcement.allowed_providers,
        // ...
      },
      // ...
    };
  }
}
```

**File**: `src/config/sources/FileConfigSource.ts` (EXISTING, extend if needed)

No changes needed - existing implementation works.

**File**: `src/config/sources/EnvConfigSource.ts` (EXISTING, extend if needed)

No changes needed - existing implementation works.

**Output**: All config sources implemented

---

### Task 1.4: Refactor ConfigManager

**File**: `src/config/ConfigManager.ts` (REFACTOR)

```typescript
import { IConfigSource } from '../core/interfaces/IConfigSource.js';
import { IAuthManager } from '../core/interfaces/IAuthManager.js';
import { ITeamsAPIClient } from '../core/interfaces/ITeamsAPIClient.js';
import { IStorageBackend } from '../core/interfaces/IStorageBackend.js';
import { IFileSystem } from '../platform/IFileSystem.js';
import { Config, ConfigSchema } from './schema.js';

import { DefaultConfigSource } from './sources/DefaultConfigSource.js';
import { TeamsConfigSource } from './sources/TeamsConfigSource.js';
import { FileConfigSource } from './sources/FileConfigSource.js';
import { EnvConfigSource } from './sources/EnvConfigSource.js';

/**
 * Configuration manager with multi-source support.
 * Handles both local mode and Teams mode seamlessly.
 */
export class ConfigManager {
  private sources: IConfigSource[] = [];
  private cache: Config | null = null;

  constructor(
    private fs: IFileSystem,
    private authManager: IAuthManager,
    private storage: IStorageBackend,
    private teamsClient?: ITeamsAPIClient,
    private teamId?: string
  ) {
    this.registerSources();
  }

  private registerSources(): void {
    // 1. Default config (priority 0)
    this.sources.push(new DefaultConfigSource());

    // 2. Environment config (priority 30)
    this.sources.push(new EnvConfigSource());

    // 3. Global file config (priority 40)
    this.sources.push(
      new FileConfigSource(
        this.getGlobalConfigPath(),
        this.fs
      )
    );

    // 4. Project file config (priority 50)
    this.sources.push(
      new FileConfigSource(
        '.mimir/config.yml',
        this.fs
      )
    );

    // 5. Teams config (priority 100, only if Teams client available)
    if (this.teamsClient) {
      this.sources.push(
        new TeamsConfigSource(
          this.teamsClient,
          this.authManager,
          this.storage,
          this.teamId
        )
      );
    }

    // Sort by priority (highest first)
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
          if (source.name === 'teams') {
            // Teams config failed - this is critical
            throw error;
          }
          console.warn(`Failed to load config from ${source.name}:`, error);
        }
      }
    }

    // Merge configs (reverse order = lowest priority first)
    const merged = this.mergeConfigs(configs.reverse());

    // Validate
    this.cache = ConfigSchema.parse(merged);
    return this.cache;
  }

  private mergeConfigs(
    configs: Array<{ source: IConfigSource; config: Partial<Config> }>
  ): Config {
    let result: any = {};

    for (const { source, config } of configs) {
      if (source.isEnforced()) {
        // Teams config: Apply enforcement rules
        result = this.applyEnforcedConfig(result, config);
      } else {
        // Local config: Deep merge
        result = this.deepMerge(result, config);
      }
    }

    return result as Config;
  }

  private applyEnforcedConfig(base: any, teamsConfig: Partial<Config>): any {
    const result = { ...base };

    // Enforced fields (Teams overrides completely)
    if (teamsConfig.enforcement) {
      result.enforcement = teamsConfig.enforcement;
    }

    if (teamsConfig.teams) {
      result.teams = teamsConfig.teams;
    }

    if (teamsConfig.tools) {
      result.tools = this.mergeTools(base.tools || {}, teamsConfig.tools);
    }

    // NOT enforced (keep local values)
    // - ui
    // - keyBindings

    return result;
  }

  private mergeTools(localTools: any, teamsTools: any): any {
    const merged = { ...localTools };

    for (const [name, teamsConfig] of Object.entries(teamsTools)) {
      if ((teamsConfig as any).enabled === false) {
        // Teams disabled: Cannot be re-enabled
        merged[name] = { enabled: false };
      } else {
        merged[name] = teamsConfig;
      }
    }

    return merged;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] instanceof Object && key in target && !(source[key] instanceof Array)) {
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
    return await this.authManager.isAuthenticated();
  }

  private getGlobalConfigPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    return `${homeDir}/.mimir/config.yml`;
  }
}
```

**Output**: ConfigManager refactored to support multi-source config with enforcement

---

### Task 1.5: Update Config Schema

**File**: `src/config/schema.ts` (EXTEND)

```typescript
import { z } from 'zod';

export const ConfigSchema = z.object({
  // ... existing fields

  // NEW: Teams config
  teams: z.object({
    enabled: z.boolean().default(false),
    apiUrl: z.string().url().optional(),
    orgSlug: z.string().optional(),
    teamId: z.string().optional(),
    features: z.object({
      sharedTools: z.boolean().default(false),
      auditSync: z.boolean().default(false),
      llmProxy: z.boolean().default(false),
      cloudSandbox: z.boolean().default(false)
    }),
    cacheExpiredAt: z.string().optional()  // Track cache expiry
  }).optional(),

  // NEW: Enforcement config
  enforcement: z.object({
    allowedModels: z.array(z.string()).default(['*']),
    blockedModels: z.array(z.string()).default([]),
    allowedProviders: z.array(z.string()).default(['*']),
    allowedSubAgents: z.array(z.string()).default(['*']),
    forcedSubAgents: z.record(z.object({
      enabled: z.boolean(),
      model: z.string(),
      trigger: z.enum(['always', 'on-write', 'on-commit', 'manual'])
    })).default({}),
    dockerMode: z.enum(['local', 'cloud', 'auto']).default('local'),
    maxBudget: z.object({
      monthly: z.number().optional()
    }).optional(),
    globalAllowlist: z.array(z.string()).default([]),
    globalBlocklist: z.array(z.string()).default([]),
    allowLocalOverrides: z.boolean().default(false),
    mcpServers: z.object({
      allowed: z.array(z.string()).default([]),
      blocked: z.array(z.string()).default([]),
      enforceList: z.boolean().default(false)
    }).optional()
  }).optional(),

  // Existing fields (unchanged)
  llm: z.object({ /* ... */ }),
  permissions: z.object({ /* ... */ }),
  tools: z.object({ /* ... */ }),
  ui: z.object({ /* ... */ }),
  keyBindings: z.object({ /* ... */ }),
  docker: z.object({ /* ... */ }),
  mcp: z.object({ /* ... */ })
});

export type Config = z.infer<typeof ConfigSchema>;
```

**Output**: Config schema supports Teams fields

---

### Task 1.6: Update Storage Schema

**File**: `src/storage/migrations/003_teams_support.sql` (NEW)

```sql
-- Cache for Teams config
CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Workspace to team mappings (supports multiple teams per repo)
CREATE TABLE IF NOT EXISTS workspace_team_mappings (
  workspace TEXT NOT NULL,
  org_slug TEXT NOT NULL,
  repository TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_slug TEXT NOT NULL,
  team_name TEXT NOT NULL,
  role TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (workspace, org_slug, repository)
);

-- Audit sync queue
CREATE TABLE IF NOT EXISTS audit_sync_queue (
  id TEXT PRIMARY KEY,
  permission_decision_id TEXT NOT NULL,
  synced_at INTEGER,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_team_mappings_org
  ON workspace_team_mappings(org_slug);

CREATE INDEX IF NOT EXISTS idx_workspace_team_mappings_repo
  ON workspace_team_mappings(repository);

CREATE INDEX IF NOT EXISTS idx_audit_sync_queue_synced
  ON audit_sync_queue(synced_at);
```

**File**: `src/storage/LocalSQLiteStorage.ts` (EXTEND)

Add methods:
```typescript
async getCachedTeamsConfig(): Promise<Partial<Config> | null> {
  const cached = await this.db.query.cacheEntries.findFirst({
    where: eq(cacheEntries.key, 'teams_config')
  });

  if (!cached) return null;

  // Check TTL
  if (cached.expiresAt && cached.expiresAt < new Date()) {
    return null;  // Expired
  }

  return JSON.parse(cached.value);
}

async setCachedTeamsConfig(config: Partial<Config>, ttl: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await this.db
    .insert(cacheEntries)
    .values({
      key: 'teams_config',
      value: JSON.stringify(config),
      expiresAt
    })
    .onConflictDoUpdate({
      target: cacheEntries.key,
      set: { value: JSON.stringify(config), expiresAt }
    });
}
```

**Output**: Storage ready for Teams caching

---

### Task 1.7: Update CLI Entry Point

**File**: `src/cli/index.ts` (UPDATE)

```typescript
import { Command } from 'commander';
import { NoOpAuthManager } from '../core/auth/NoOpAuthManager.js';
import { NoOpTeamDetector } from '../core/team/NoOpTeamDetector.js';
import { ConfigManager } from '../config/ConfigManager.js';
// ... other imports

export async function createCLI(): Promise<Command> {
  const program = new Command();

  program
    .name('mimir')
    .description('Platform-agnostic AI coding agent')
    .version(getVersion());

  // Initialize platform abstractions
  const fs = new FileSystem();
  const processExecutor = new ProcessExecutor();
  const storage = await createStorage(fs);

  // Initialize auth manager (no-op for now, Teams later)
  const authManager = new NoOpAuthManager();

  // Initialize team detector (no-op for now, Teams later)
  const teamDetector = new NoOpTeamDetector();

  // Initialize config manager
  // NOTE: teamsClient is undefined, so TeamsConfigSource won't be registered
  const configManager = new ConfigManager(
    fs,
    authManager,
    storage,
    undefined  // No Teams client yet
  );

  // Load config (will use: Default → Env → Global → Project)
  const config = await configManager.load();

  // Default command (chat)
  program
    .action(async () => {
      await chatCommand(config, fs, processExecutor, storage);
    });

  // Existing commands
  program.command('init').action(/* ... */);
  program.command('history').action(/* ... */);
  // ... other commands

  // Teams commands (scaffolded, not implemented yet)
  program.addCommand(createAuthCommand());
  program.addCommand(createOrgsCommand());
  program.addCommand(createTeamsCommand());

  return program;
}
```

**Output**: CLI works in local mode, Teams hooks in place

---

### Task 1.8: Scaffold Teams Commands

**File**: `src/cli/commands/auth.ts` (NEW)

```typescript
import { Command } from 'commander';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Authentication management');

  auth
    .command('login')
    .description('Authenticate with Mimir Teams')
    .option('--org <slug>', 'Specific organization')
    .action(async () => {
      console.log('TODO: Implement in Phase 2');
      console.log('For now, use local mode (BYOK)');
    });

  auth
    .command('logout')
    .description('Sign out')
    .option('--org <slug>', 'Specific organization')
    .option('--all', 'Logout from all orgs')
    .action(async () => {
      console.log('TODO: Implement in Phase 2');
    });

  auth
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      console.log('Not authenticated (local mode)');
    });

  return auth;
}
```

**File**: `src/cli/commands/orgs.ts` (NEW)

```typescript
import { Command } from 'commander';

export function createOrgsCommand(): Command {
  const orgs = new Command('orgs')
    .description('Organization management');

  orgs
    .command('list')
    .description('List organizations')
    .action(async () => {
      console.log('TODO: Implement in Phase 2');
    });

  orgs
    .command('set <slug>')
    .description('Set active organization')
    .action(async () => {
      console.log('TODO: Implement in Phase 2');
    });

  orgs
    .command('current')
    .description('Show current organization')
    .action(async () => {
      console.log('Not authenticated (local mode)');
    });

  return orgs;
}
```

**File**: `src/cli/commands/teams.ts` (NEW)

```typescript
import { Command } from 'commander';

export function createTeamsCommand(): Command {
  const teams = new Command('teams')
    .description('Team management');

  teams
    .command('list')
    .description('List teams')
    .action(async () => {
      console.log('TODO: Implement in Phase 3');
    });

  teams
    .command('create <slug>')
    .description('Create team')
    .action(async () => {
      console.log('TODO: Implement in Phase 3');
    });

  teams
    .command('current')
    .description('Show current team')
    .action(async () => {
      console.log('No team (local mode)');
    });

  return teams;
}
```

**Output**: Commands scaffolded, show helpful messages

---

## Phase 0-1 Checklist

### Phase 0: Foundation

- [ ] API contracts package created
- [ ] Package published to npm (alpha)
- [ ] API contracts installed in CLI
- [ ] Build and tests passing

### Phase 1: Abstractions

- [ ] `IConfigSource` interface defined
- [ ] `IAuthManager` interface defined
- [ ] `ITeamsAPIClient` interface defined
- [ ] `IWorkspaceTeamDetector` interface defined
- [ ] `NoOpAuthManager` implemented
- [ ] `NoOpTeamDetector` implemented
- [ ] `DefaultConfigSource` implemented
- [ ] `TeamsConfigSource` implemented (not used yet)
- [ ] `ConfigManager` refactored (multi-source)
- [ ] Config schema extended (teams, enforcement)
- [ ] Storage schema updated (migrations)
- [ ] Storage methods added (cache, team mappings)
- [ ] CLI entry point updated (uses abstractions)
- [ ] Commands scaffolded (auth, orgs, teams)
- [ ] All tests passing
- [ ] **Zero breaking changes to local mode**

---

## Verification

### Test Local Mode Still Works

```bash
# Should work exactly as before
mimir init
mimir

# New commands show helpful messages
mimir auth status
# → Not authenticated (local mode)

mimir orgs list
# → TODO: Implement in Phase 2

mimir teams current
# → No team (local mode)
```

### Test Config Loading (Local Mode)

```bash
# Config should load from:
# 1. Default (priority 0)
# 2. Environment (priority 30)
# 3. Global (priority 40)
# 4. Project (priority 50)

# Teams config (priority 100) NOT loaded (not authenticated)

mimir config show
# → Should show merged config without Teams fields
```

---

## Next Phases

### Phase 2: Authentication (Week 2)

Implement:
- `AuthManager` (multi-org support)
- `mimir auth login/logout/status`
- Token refresh
- Auth storage (`~/.mimir/auth.json`)

### Phase 3: Team Detection (Week 3)

Implement:
- `WorkspaceTeamDetector`
- `mimir teams list/create/current`
- Team detection API integration
- Local caching

### Phase 4: Config Enforcement (Week 3-4)

Implement:
- `TeamsConfigSource` integration
- Config merging with enforcement
- Offline mode handling
- Budget warnings

### Phase 5: LLM Proxy (Week 4-5)

Implement:
- `ProxiedLLMProvider`
- Budget checking
- Audit logging
- LLM proxy integration

---

## Success Criteria

### ✅ Phase 0-1 Complete When:

1. Local mode works exactly as before (zero breaking changes)
2. All abstractions/interfaces in place
3. Config system supports multi-source merging
4. Commands scaffolded (show helpful messages)
5. API contracts package published to npm
6. All tests passing

### 🚀 Ready for Phase 2

Once Phase 0-1 is complete:
- Authentication can be implemented without touching local mode
- Teams features activate seamlessly when authenticated
- No refactoring needed for later phases

---

**Last Updated**: 2025-12-27
**Status**: Ready for Implementation
