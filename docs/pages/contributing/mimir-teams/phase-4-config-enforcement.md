# Phase 4: Config Enforcement

**Status**: Ready for Implementation
**Estimated Duration**: 1-2 weeks
**Prerequisites**: Phase 3 (Team Detection) Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Goals](#goals)
3. [Architecture](#architecture)
4. [Enforcement Rules](#enforcement-rules)
5. [Implementation Tasks](#implementation-tasks)
6. [Offline Mode](#offline-mode)
7. [Testing Strategy](#testing-strategy)
8. [Success Criteria](#success-criteria)

---

## Overview

Phase 4 implements centralized configuration enforcement from the Teams backend. When authenticated and working in a team workspace, the CLI loads team-specific configuration that cannot be overridden by users.

**Key Principle**: Teams backend is the source of truth for security-critical settings like allowed models, providers, tools, and policies.

---

## Goals

### Primary Goals
1. ✅ Load team config from Teams backend
2. ✅ Enforce policy restrictions (models, providers, tools)
3. ✅ Merge team config with local config (priority-based)
4. ✅ Cache config locally with TTL
5. ✅ Offline mode with cached config

### Secondary Goals
1. ✅ Handle config fetch failures gracefully
2. ✅ Provide clear feedback on enforced settings
3. ✅ Support partial enforcement (some fields enforced, others not)
4. ✅ Allow local overrides where permitted

### Non-Goals (Future Phases)
- ❌ LLM proxy (Phase 5)
- ❌ Cloud storage sync (Phase 6)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      ConfigManager                           │
│  Priority hierarchy:                                         │
│    100 - Teams (enforced)                                    │
│     50 - Project file                                        │
│     40 - Global file                                         │
│     30 - Environment                                         │
│      0 - Default                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TeamsConfigSource                         │
│  - load()                                                    │
│  - isAvailable()                                             │
│  - isEnforced() → true                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│   Teams API Client      │   │   Local Cache (SQLite)  │
│  GET /teams/:id/config  │   │  Table: cache_entries   │
└─────────────────────────┘   └─────────────────────────┘
```

### Data Flow

```
ConfigManager.load()
  │
  ├─> Load Default config (priority 0)
  ├─> Load Env config (priority 30)
  ├─> Load Global file config (priority 40)
  ├─> Load Project file config (priority 50)
  │
  ├─> If authenticated && team detected:
  │   │
  │   ├─> TeamsConfigSource.load()
  │   │   │
  │   │   ├─> Check cache
  │   │   │   SELECT * FROM cache_entries
  │   │   │   WHERE key = 'team-config:{teamId}'
  │   │   │   AND expires_at > NOW()
  │   │   │
  │   │   ├─> If cache HIT && not expired:
  │   │   │   └─> Return cached config
  │   │   │
  │   │   ├─> If cache MISS or expired:
  │   │   │   │
  │   │   │   ├─> Fetch from API
  │   │   │   │   GET /teams/{teamId}/config
  │   │   │   │
  │   │   │   ├─> Validate response
  │   │   │   │
  │   │   │   ├─> Cache result
  │   │   │   │   INSERT INTO cache_entries
  │   │   │   │
  │   │   │   └─> Return config
  │   │   │
  │   │   └─> Priority: 100 (highest, enforced)
  │   │
  │   └─> Merge configs (Teams config overrides others)
  │
  └─> Return final merged config
```

---

## Enforcement Rules

### Enforced Fields (Cannot be overridden)

Teams backend enforces these fields with **highest priority** (100):

1. **LLM Configuration**
   - `enforcement.allowedModels` - Whitelist of allowed models
   - `enforcement.blockedModels` - Blacklist of forbidden models
   - `enforcement.allowedProviders` - Allowed LLM providers
   - `llm.provider` - Default provider (if set by team)
   - `llm.model` - Default model (if set by team)

2. **Tools Configuration**
   - `tools.*` - Enable/disable specific tools
   - Teams can disable tools, users cannot re-enable

3. **Docker/Sandbox**
   - `enforcement.dockerMode` - local/cloud/auto
   - `docker.enabled` - Enable/disable sandboxing

4. **Permissions**
   - `enforcement.globalAllowlist` - Commands always allowed
   - `enforcement.globalBlocklist` - Commands always blocked

### Partially Enforced Fields (Team provides defaults)

Teams can provide defaults, but users can override:

1. **Budget & Rate Limits**
   - `budget.*` - User can set lower limits
   - `rateLimit.*` - User can set stricter limits

2. **Monitoring**
   - `monitoring.*` - User preferences respected

### Non-Enforced Fields (User preferences)

Users have full control:

1. **UI Configuration**
   - `ui.theme`
   - `ui.syntaxHighlighting`
   - `ui.compactMode`

2. **Key Bindings**
   - `keyBindings.*`

3. **Local Settings**
   - `.mimir/config.yml` user preferences

---

## Implementation Tasks

### Task 1: Update TeamsConfigSource

**File**: `src/config/sources/TeamsConfigSource.ts`

**Current Implementation** (from Phase 0-1):
```typescript
export class TeamsConfigSource implements IConfigSource {
  name = 'teams';
  priority = 100;

  constructor(
    private teamsClient: ITeamsAPIClient,
    private authManager: IAuthManager,
    private storage: IStorageBackend,
    private teamId?: string
  ) {}

  async load(): Promise<Partial<Config>> {
    // TODO: Implement in Phase 4
    return {};
  }

  async isAvailable(): Promise<boolean> {
    return this.teamsClient !== null && (await this.authManager.isAuthenticated());
  }

  isEnforced(): boolean {
    return true;
  }
}
```

**Phase 4 Implementation**:
```typescript
export class TeamsConfigSource implements IConfigSource {
  name = 'teams';
  priority = 100;

  private readonly CACHE_KEY_PREFIX = 'team-config:';
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private teamsClient: ITeamsAPIClient,
    private authManager: IAuthManager,
    private storage: IStorageBackend,
    private teamId?: string
  ) {}

  async load(): Promise<Partial<Config>> {
    const context = await this.authManager.getActiveContext();
    if (!context) {
      throw new Error('Not authenticated');
    }

    const teamId = this.teamId || await this.detectTeamId();
    if (!teamId) {
      throw new Error('No team detected for workspace');
    }

    // 1. Try cache first
    const cached = await this.loadFromCache(teamId);
    if (cached) {
      logger.debug('Loaded team config from cache', { teamId });
      return cached;
    }

    // 2. Fetch from API
    logger.debug('Fetching team config from API', { teamId });

    try {
      const response = await this.teamsClient.config.get(
        context.orgSlug,
        teamId
      );

      const config = this.transformApiResponse(response);

      // 3. Cache the result
      await this.saveToCache(teamId, config, response.cacheMaxAge);

      logger.info('Team config loaded', {
        teamId,
        enforcedFields: Object.keys(config.enforcement || {}),
      });

      return config;
    } catch (error) {
      logger.error('Failed to fetch team config', { teamId, error });

      // If offline and cache exists (even expired), use it
      const expiredCache = await this.loadFromCache(teamId, true);
      if (expiredCache) {
        logger.warn('Using expired cache (offline mode)', { teamId });
        return expiredCache;
      }

      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    return (
      this.teamsClient !== null &&
      (await this.authManager.isAuthenticated())
    );
  }

  isEnforced(): boolean {
    return true;
  }

  // Private helpers

  private async detectTeamId(): Promise<string | null> {
    // Get team from workspace detector
    const teamDetector = getTeamDetector(); // From DI
    const team = await teamDetector.detectTeam(process.cwd());
    return team?.teamId || null;
  }

  private async loadFromCache(
    teamId: string,
    includeExpired = false
  ): Promise<Partial<Config> | null> {
    const cacheKey = this.CACHE_KEY_PREFIX + teamId;

    const rows = await this.storage.query<{
      value: string;
      expires_at: number;
    }>(
      'SELECT value, expires_at FROM cache_entries WHERE key = ?',
      [cacheKey]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    if (!includeExpired && row.expires_at <= Date.now()) {
      return null; // Expired
    }

    try {
      return JSON.parse(row.value);
    } catch (error) {
      logger.warn('Failed to parse cached config', { teamId, error });
      return null;
    }
  }

  private async saveToCache(
    teamId: string,
    config: Partial<Config>,
    ttl?: number
  ): Promise<void> {
    const cacheKey = this.CACHE_KEY_PREFIX + teamId;
    const expiresAt = Date.now() + (ttl || this.DEFAULT_TTL);

    await this.storage.execute(
      `INSERT OR REPLACE INTO cache_entries
       (key, value, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [cacheKey, JSON.stringify(config), expiresAt, Date.now()]
    );
  }

  private transformApiResponse(response: ConfigResponse): Partial<Config> {
    // Transform API response to Config format
    return {
      llm: response.llm,
      docker: response.docker,
      tools: response.tools,
      enforcement: {
        allowedModels: response.enforcement?.allowedModels || [],
        blockedModels: response.enforcement?.blockedModels || [],
        allowedProviders: response.enforcement?.allowedProviders || [],
        globalAllowlist: response.enforcement?.globalAllowlist || [],
        globalBlocklist: response.enforcement?.globalBlocklist || [],
        dockerMode: response.enforcement?.dockerMode || 'local',
        allowLocalOverrides: response.enforcement?.allowLocalOverrides ?? true,
      },
      budget: response.budget,
      rateLimit: response.rateLimit,
      teams: {
        enabled: true,
        apiUrl: this.teamsClient.baseUrl,
        orgSlug: response.orgSlug,
        teamId: response.teamId,
        features: response.features,
      },
    };
  }
}
```

### Task 2: Update ConfigManager Merge Logic

**File**: `src/config/ConfigManager.ts`

**Already implemented in Phase 0-1**, but verify enforcement logic:

```typescript
private mergeConfigs(
  configs: Array<{ source: IConfigSource; config: Partial<Config> }>
): Partial<Config> {
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

  return result as Partial<Config>;
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

  // Partially enforced (merge but respect Teams restrictions)
  if (teamsConfig.llm) {
    result.llm = { ...base.llm, ...teamsConfig.llm };
  }

  if (teamsConfig.docker) {
    result.docker = { ...base.docker, ...teamsConfig.docker };
  }

  // NOT enforced (keep local values)
  // - ui
  // - keyBindings
  // - monitoring (user can configure)
  // - budget (user can set stricter limits)
  // - rateLimit (user can set stricter limits)

  return result;
}

private mergeTools(localTools: ToolsConfig, teamsTools: ToolsConfig): ToolsConfig {
  const merged: ToolsConfig = { ...localTools };

  for (const [name, teamsConfig] of Object.entries(teamsTools)) {
    const config = teamsConfig as { enabled: boolean };
    if (config.enabled === false) {
      // Teams disabled: Cannot be re-enabled
      merged[name] = { enabled: false };
    } else {
      // Teams enabled or no restriction: Use Teams config
      merged[name] = config;
    }
  }

  return merged;
}
```

### Task 3: Enforcement Validation

**File**: `src/config/EnforcementValidator.ts` (new)

```typescript
export class EnforcementValidator {
  /**
   * Validate that user's desired config respects enforcement rules
   */
  static validate(
    userConfig: Partial<Config>,
    enforcement: Config['enforcement']
  ): ValidationResult {
    const errors: string[] = [];

    // Check LLM provider
    if (
      userConfig.llm?.provider &&
      enforcement.allowedProviders.length > 0
    ) {
      if (!enforcement.allowedProviders.includes(userConfig.llm.provider)) {
        errors.push(
          `Provider "${userConfig.llm.provider}" not allowed. ` +
          `Allowed: ${enforcement.allowedProviders.join(', ')}`
        );
      }
    }

    // Check LLM model
    if (userConfig.llm?.model) {
      // Check blocklist
      if (enforcement.blockedModels.includes(userConfig.llm.model)) {
        errors.push(`Model "${userConfig.llm.model}" is blocked by team policy`);
      }

      // Check allowlist (if specified)
      if (
        enforcement.allowedModels.length > 0 &&
        !enforcement.allowedModels.includes(userConfig.llm.model)
      ) {
        errors.push(
          `Model "${userConfig.llm.model}" not allowed. ` +
          `Allowed: ${enforcement.allowedModels.join(', ')}`
        );
      }
    }

    // Check tools
    for (const [toolName, toolConfig] of Object.entries(userConfig.tools || {})) {
      if (toolConfig.enabled && enforcement.tools?.[toolName]?.enabled === false) {
        errors.push(`Tool "${toolName}" is disabled by team policy`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Show enforcement info to user
   */
  static displayEnforcement(enforcement: Config['enforcement']): void {
    console.log(chalk.bold('\nTeam Policy Enforcement:\n'));

    if (enforcement.allowedProviders.length > 0) {
      console.log(`  Allowed Providers: ${chalk.cyan(enforcement.allowedProviders.join(', '))}`);
    }

    if (enforcement.allowedModels.length > 0) {
      console.log(`  Allowed Models: ${chalk.cyan(enforcement.allowedModels.join(', '))}`);
    }

    if (enforcement.blockedModels.length > 0) {
      console.log(`  Blocked Models: ${chalk.red(enforcement.blockedModels.join(', '))}`);
    }

    if (enforcement.dockerMode !== 'local') {
      console.log(`  Docker Mode: ${chalk.yellow(enforcement.dockerMode)}`);
    }

    console.log();
  }
}
```

### Task 4: Config Command

**File**: `src/cli/commands/config.ts` (new)

```typescript
export function buildConfigCommand(): Command {
  const cmd = new Command('config');
  cmd.description('View and manage configuration');

  // View current config
  cmd
    .command('show')
    .description('Show current configuration')
    .option('--teams', 'Show only teams config')
    .option('--local', 'Show only local config')
    .action(async (options) => {
      const configManager = getConfigManager();
      const config = await configManager.load();

      if (options.teams) {
        console.log(yaml.stringify({ teams: config.teams, enforcement: config.enforcement }));
      } else if (options.local) {
        // Show local config without teams
        const { teams, enforcement, ...localConfig } = config;
        console.log(yaml.stringify(localConfig));
      } else {
        console.log(yaml.stringify(config));
      }
    });

  // Show enforcement rules
  cmd
    .command('enforcement')
    .description('Show team enforcement rules')
    .action(async () => {
      const configManager = getConfigManager();
      const config = await configManager.load();

      if (!config.enforcement || !config.teams?.enabled) {
        console.log(chalk.yellow('No team enforcement active'));
        return;
      }

      EnforcementValidator.displayEnforcement(config.enforcement);
    });

  // Clear cache
  cmd
    .command('clear-cache')
    .description('Clear configuration cache')
    .action(async () => {
      const configManager = getConfigManager();
      await configManager.reload();
      console.log(chalk.green('✓ Configuration cache cleared'));
    });

  return cmd;
}
```

---

## Offline Mode

### Strategy

1. **Cache team config** for 24 hours
2. **Grace period**: Use expired cache if API unreachable
3. **Hard limit**: Maximum 7 days offline (configurable)
4. **User feedback**: Clear messaging about offline mode

### Implementation

```typescript
async load(): Promise<Partial<Config>> {
  try {
    // Try to fetch fresh config
    return await this.fetchFromAPI();
  } catch (error) {
    // Network error or API unavailable
    logger.warn('Failed to fetch team config, trying cache', { error });

    const cached = await this.loadFromCache(teamId, true); // Include expired

    if (cached) {
      const cacheAge = Date.now() - cached.cachedAt;
      const maxOfflineTime = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (cacheAge < maxOfflineTime) {
        logger.info('Using cached config (offline mode)', {
          cacheAgeHours: Math.floor(cacheAge / 1000 / 60 / 60),
        });
        return cached.config;
      } else {
        throw new Error(
          `Cannot use cached config (${Math.floor(cacheAge / 1000 / 60 / 60 / 24)} days old). ` +
          `Please reconnect to the internet or run 'mimir auth logout' to use local mode.`
        );
      }
    }

    throw error;
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('TeamsConfigSource', () => {
  it('should load config from API', async () => {
    // Test API fetch
  });

  it('should cache config after loading', async () => {
    // Test caching
  });

  it('should use cache when available', async () => {
    // Test cache hit
  });

  it('should fetch fresh config when cache expired', async () => {
    // Test cache expiry
  });

  it('should use expired cache in offline mode', async () => {
    // Test offline mode
  });

  it('should throw error when cache too old', async () => {
    // Test max offline time
  });
});

describe('EnforcementValidator', () => {
  it('should validate allowed models', async () => {
    // Test model allowlist
  });

  it('should reject blocked models', async () => {
    // Test model blocklist
  });

  it('should validate providers', async () => {
    // Test provider allowlist
  });

  it('should validate tools', async () => {
    // Test tool enforcement
  });
});
```

### Integration Tests

```typescript
describe('Config Enforcement Flow', () => {
  it('should load and apply team config', async () => {
    // Authenticate
    // Detect team
    // Load config
    // Verify enforcement applied
  });

  it('should prevent using blocked models', async () => {
    // Set blocked models in team config
    // Try to use blocked model
    // Verify error
  });

  it('should allow local overrides where permitted', async () => {
    // Set team config
    // Override UI settings locally
    // Verify override works
  });
});
```

---

## Success Criteria

Phase 4 is complete when:

- [ ] **Config loading working**
  - [ ] Fetch team config from API
  - [ ] Cache locally with TTL
  - [ ] Merge with local config (correct priorities)

- [ ] **Enforcement working**
  - [ ] Block disallowed models/providers
  - [ ] Disable tools per team policy
  - [ ] Enforce docker mode
  - [ ] Apply allowlist/blocklist

- [ ] **Offline mode working**
  - [ ] Use cached config when offline
  - [ ] Grace period (7 days max)
  - [ ] Clear error messages

- [ ] **Commands functional**
  - [ ] `mimir config show` - view config
  - [ ] `mimir config enforcement` - view rules
  - [ ] `mimir config clear-cache` - clear cache

- [ ] **Testing complete**
  - [ ] Unit tests: 80%+ coverage
  - [ ] Integration tests pass
  - [ ] Manual testing with real teams

---

## Timeline

**Week 1**:
- Day 1-2: Update TeamsConfigSource
- Day 3: Enforcement validation
- Day 4: Config commands
- Day 5: Offline mode handling

**Week 2**:
- Day 6-7: Testing
- Day 8: Documentation
- Day 9-10: Code review and polish

---

## Next Phase

After Phase 4 completes → **Phase 5: LLM Proxy**
- Route LLM calls through Teams backend
- Hide individual API keys
- Enforce budgets and quotas
- Track usage per user
