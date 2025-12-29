# Phase 3: Team Detection

**Status**: Ready for Implementation
**Estimated Duration**: 1 week
**Prerequisites**: Phase 2 (Authentication) Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Goals](#goals)
3. [Architecture](#architecture)
4. [Implementation Tasks](#implementation-tasks)
5. [Cache Strategy](#cache-strategy)
6. [Testing Strategy](#testing-strategy)
7. [Success Criteria](#success-criteria)

---

## Overview

Phase 3 implements automatic team detection based on git repository URLs. When a user runs Mimir in a git repository, the CLI automatically detects which team(s) the repository belongs to and loads the appropriate team configuration.

**Key Principle**: Workspace-aware. The CLI should "know" which team context it's operating in based on the current directory's git remote.

---

## Goals

### Primary Goals
1. ✅ Auto-detect team from git remote URL
2. ✅ Cache team mappings locally with TTL
3. ✅ Support multiple teams per repository
4. ✅ Handle team detection failures gracefully
5. ✅ Provide team management commands

### Secondary Goals
1. ✅ Support custom git remote names (not just `origin`)
2. ✅ Handle repositories without git
3. ✅ Allow manual team override
4. ✅ Clear cache when needed

### Non-Goals (Future Phases)
- ❌ Config enforcement (Phase 4)
- ❌ LLM proxy (Phase 5)
- ❌ Cloud storage sync (Phase 6)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     WorkspaceTeamDetector                    │
│  - detectTeam(workspaceRoot)                                 │
│  - getTeams(workspaceRoot)                                   │
│  - clearCache()                                              │
│  - setTeamOverride(workspaceRoot, teamId)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Git Repository                          │
│  - getRemoteUrls()                                           │
│  - extractOrgAndRepo(url)                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Teams API Client                           │
│  - GET /repos/{org}/{repo}/teams                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Local Cache (SQLite)                     │
│  Table: workspace_team_mappings                              │
│  - workspace_path                                            │
│  - git_remote_url                                            │
│  - team_id                                                   │
│  - cached_at                                                 │
│  - expires_at                                                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User runs: mimir (in git repo)
  │
  ├─> WorkspaceTeamDetector.detectTeam()
  │   │
  │   ├─> Check cache
  │   │   SELECT * FROM workspace_team_mappings
  │   │   WHERE workspace_path = ?
  │   │   AND expires_at > NOW()
  │   │
  │   ├─> If cache HIT: Return team_id
  │   │
  │   ├─> If cache MISS:
  │   │   │
  │   │   ├─> Git.getRemoteUrls()
  │   │   │   (git remote -v)
  │   │   │
  │   │   ├─> Extract org/repo
  │   │   │   github.com/acme-corp/api → acme-corp/api
  │   │   │
  │   │   ├─> TeamsAPIClient.getTeamsForRepo()
  │   │   │   GET /repos/acme-corp/api/teams
  │   │   │   → [{ teamId: 'team-123', teamSlug: 'backend' }]
  │   │   │
  │   │   ├─> Save to cache
  │   │   │   INSERT INTO workspace_team_mappings
  │   │   │
  │   │   └─> Return team_id
  │   │
  │   └─> If multiple teams: Prompt user
  │
  └─> Load team config (Phase 4)
```

---

## Implementation Tasks

### Task 1: Git Repository Helper

**File**: `src/core/git/GitRepository.ts`

```typescript
export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

export interface RepoIdentifier {
  platform: 'github' | 'gitlab' | 'bitbucket' | 'other';
  org: string;
  repo: string;
}

export class GitRepository {
  constructor(
    private workspaceRoot: string,
    private processExecutor: IProcessExecutor
  ) {}

  /**
   * Get all git remotes for the workspace
   */
  async getRemotes(): Promise<GitRemote[]> {
    try {
      const result = await this.processExecutor.execute(
        'git',
        ['remote', '-v'],
        { cwd: this.workspaceRoot }
      );

      const lines = result.stdout.trim().split('\n');
      const remotes: GitRemote[] = [];

      for (const line of lines) {
        // Format: origin  https://github.com/org/repo.git (fetch)
        const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
        if (match) {
          remotes.push({
            name: match[1],
            url: match[2],
            type: match[3] as 'fetch' | 'push',
          });
        }
      }

      return remotes;
    } catch (error) {
      logger.debug('Failed to get git remotes', { error });
      return [];
    }
  }

  /**
   * Extract org and repo from git URL
   */
  parseRemoteUrl(url: string): RepoIdentifier | null {
    // Support multiple formats:
    // - https://github.com/org/repo.git
    // - git@github.com:org/repo.git
    // - ssh://git@github.com/org/repo.git

    const patterns = [
      // HTTPS
      /https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      // SSH (git@host:org/repo)
      /git@([^:]+):([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      // SSH (ssh://git@host/org/repo)
      /ssh:\/\/git@([^\/]+)\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const [, host, org, repo] = match;

        let platform: RepoIdentifier['platform'] = 'other';
        if (host.includes('github.com')) platform = 'github';
        else if (host.includes('gitlab.com')) platform = 'gitlab';
        else if (host.includes('bitbucket.org')) platform = 'bitbucket';

        return { platform, org, repo };
      }
    }

    return null;
  }

  /**
   * Check if workspace is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.processExecutor.execute(
        'git',
        ['rev-parse', '--git-dir'],
        { cwd: this.workspaceRoot }
      );
      return true;
    } catch {
      return false;
    }
  }
}
```

### Task 2: WorkspaceTeamDetector Implementation

**File**: `src/core/team/WorkspaceTeamDetector.ts`

```typescript
export interface TeamMapping {
  teamId: string;
  teamSlug: string;
  teamName: string;
  repository: {
    platform: string;
    org: string;
    repo: string;
  };
}

export class WorkspaceTeamDetector implements IWorkspaceTeamDetector {
  constructor(
    private storage: IStorageBackend,
    private authManager: IAuthManager,
    private teamsClient: ITeamsAPIClient | null,
    private processExecutor: IProcessExecutor
  ) {}

  /**
   * Detect team(s) for the current workspace
   */
  async detectTeam(workspaceRoot: string): Promise<TeamMapping | null> {
    // 1. Check if authenticated
    const context = await this.authManager.getActiveContext();
    if (!context || !this.teamsClient) {
      return null; // Not in Teams mode
    }

    // 2. Check cache first
    const cached = await this.getCachedTeam(workspaceRoot);
    if (cached) {
      logger.debug('Team detected from cache', {
        workspaceRoot,
        teamId: cached.teamId,
      });
      return cached;
    }

    // 3. Detect from git remote
    const gitRepo = new GitRepository(workspaceRoot, this.processExecutor);

    if (!(await gitRepo.isGitRepository())) {
      logger.debug('Not a git repository', { workspaceRoot });
      return null;
    }

    const remotes = await gitRepo.getRemotes();
    if (remotes.length === 0) {
      logger.debug('No git remotes found', { workspaceRoot });
      return null;
    }

    // 4. Try each remote (prefer 'origin')
    const sortedRemotes = this.sortRemotes(remotes);

    for (const remote of sortedRemotes) {
      const repoId = gitRepo.parseRemoteUrl(remote.url);
      if (!repoId) continue;

      try {
        const teams = await this.fetchTeamsForRepo(repoId, context);

        if (teams.length === 0) {
          continue; // No teams for this repo
        }

        let selectedTeam: TeamMapping;

        if (teams.length === 1) {
          selectedTeam = teams[0];
        } else {
          // Multiple teams - prompt user
          selectedTeam = await this.promptTeamSelection(teams);
        }

        // 5. Cache the result
        await this.cacheTeamMapping(
          workspaceRoot,
          remote.url,
          selectedTeam
        );

        logger.info('Team detected', {
          workspaceRoot,
          teamId: selectedTeam.teamId,
          teamSlug: selectedTeam.teamSlug,
        });

        return selectedTeam;
      } catch (error) {
        logger.warn('Failed to fetch teams for repo', {
          remote: remote.url,
          error,
        });
        continue;
      }
    }

    return null;
  }

  /**
   * Get all teams for a workspace (if multiple)
   */
  async getTeams(workspaceRoot: string): Promise<TeamMapping[]> {
    const context = await this.authManager.getActiveContext();
    if (!context || !this.teamsClient) {
      return [];
    }

    const gitRepo = new GitRepository(workspaceRoot, this.processExecutor);
    const remotes = await gitRepo.getRemotes();

    const allTeams: TeamMapping[] = [];

    for (const remote of remotes) {
      const repoId = gitRepo.parseRemoteUrl(remote.url);
      if (!repoId) continue;

      try {
        const teams = await this.fetchTeamsForRepo(repoId, context);
        allTeams.push(...teams);
      } catch (error) {
        logger.warn('Failed to fetch teams', { remote: remote.url, error });
      }
    }

    // Deduplicate by teamId
    const uniqueTeams = allTeams.filter(
      (team, index, self) =>
        index === self.findIndex((t) => t.teamId === team.teamId)
    );

    return uniqueTeams;
  }

  /**
   * Clear cache for a workspace or globally
   */
  async clearCache(workspaceRoot?: string): Promise<void> {
    if (workspaceRoot) {
      await this.storage.execute(
        'DELETE FROM workspace_team_mappings WHERE workspace_path = ?',
        [workspaceRoot]
      );
      logger.info('Cache cleared for workspace', { workspaceRoot });
    } else {
      await this.storage.execute('DELETE FROM workspace_team_mappings');
      logger.info('All team cache cleared');
    }
  }

  /**
   * Manually override team for a workspace
   */
  async setTeamOverride(
    workspaceRoot: string,
    teamId: string
  ): Promise<void> {
    const context = await this.authManager.getActiveContext();
    if (!context || !this.teamsClient) {
      throw new Error('Not authenticated');
    }

    // Fetch team details
    const team = await this.teamsClient.teams.get(context.orgSlug, teamId);

    const mapping: TeamMapping = {
      teamId: team.id,
      teamSlug: team.slug,
      teamName: team.name,
      repository: {
        platform: 'manual',
        org: context.orgSlug,
        repo: 'override',
      },
    };

    await this.cacheTeamMapping(workspaceRoot, 'manual-override', mapping);

    logger.info('Team override set', { workspaceRoot, teamId });
  }

  // Private helpers

  private sortRemotes(remotes: GitRemote[]): GitRemote[] {
    // Prefer 'origin', then 'upstream', then alphabetical
    return remotes.sort((a, b) => {
      if (a.name === 'origin') return -1;
      if (b.name === 'origin') return 1;
      if (a.name === 'upstream') return -1;
      if (b.name === 'upstream') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  private async fetchTeamsForRepo(
    repoId: RepoIdentifier,
    context: AuthContext
  ): Promise<TeamMapping[]> {
    const response = await this.teamsClient!.repos.getTeams(
      context.orgSlug,
      repoId.org,
      repoId.repo
    );

    return response.teams.map((team) => ({
      teamId: team.id,
      teamSlug: team.slug,
      teamName: team.name,
      repository: {
        platform: repoId.platform,
        org: repoId.org,
        repo: repoId.repo,
      },
    }));
  }

  private async getCachedTeam(
    workspaceRoot: string
  ): Promise<TeamMapping | null> {
    const rows = await this.storage.query<{
      team_id: string;
      team_slug: string;
      team_name: string;
      repository_data: string;
      expires_at: number;
    }>(
      `SELECT team_id, team_slug, team_name, repository_data, expires_at
       FROM workspace_team_mappings
       WHERE workspace_path = ?
       AND expires_at > ?`,
      [workspaceRoot, Date.now()]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      teamId: row.team_id,
      teamSlug: row.team_slug,
      teamName: row.team_name,
      repository: JSON.parse(row.repository_data),
    };
  }

  private async cacheTeamMapping(
    workspaceRoot: string,
    gitRemoteUrl: string,
    team: TeamMapping
  ): Promise<void> {
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    await this.storage.execute(
      `INSERT OR REPLACE INTO workspace_team_mappings
       (workspace_path, git_remote_url, team_id, team_slug, team_name,
        repository_data, cached_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workspaceRoot,
        gitRemoteUrl,
        team.teamId,
        team.teamSlug,
        team.teamName,
        JSON.stringify(team.repository),
        now,
        expiresAt,
      ]
    );
  }

  private async promptTeamSelection(
    teams: TeamMapping[]
  ): Promise<TeamMapping> {
    console.log(
      chalk.yellow('\nMultiple teams found for this repository:\n')
    );

    teams.forEach((team, index) => {
      console.log(`  ${index + 1}. ${chalk.bold(team.teamName)} (${team.teamSlug})`);
    });

    const answer = await input({
      message: '\nSelect team:',
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1 || num > teams.length) {
          return `Please enter a number between 1 and ${teams.length}`;
        }
        return true;
      },
    });

    return teams[parseInt(answer) - 1];
  }
}
```

### Task 3: Teams Commands

**File**: `src/cli/commands/teams.ts` (update existing)

#### `mimir teams current`

```typescript
async function currentTeamCommand(workspaceRoot: string): Promise<void> {
  const teamDetector = getTeamDetector(); // From DI

  const team = await teamDetector.detectTeam(workspaceRoot);

  if (!team) {
    console.log(chalk.yellow('Team: Not detected'));
    console.log('\nPossible reasons:');
    console.log('  - Not a git repository');
    console.log('  - Repository not linked to any team');
    console.log('  - Not authenticated (run `mimir auth login`)');
    return;
  }

  console.log(chalk.green('Team: Detected'));
  console.log(`\nTeam: ${chalk.bold(team.teamName)} (${team.teamSlug})`);
  console.log(`ID: ${team.teamId}`);
  console.log(
    `Repository: ${team.repository.platform}/${team.repository.org}/${team.repository.repo}`
  );
}
```

#### `mimir teams list`

```typescript
async function listTeamsCommand(workspaceRoot: string): Promise<void> {
  const teamDetector = getTeamDetector();

  console.log('\nFetching teams...\n');

  const teams = await teamDetector.getTeams(workspaceRoot);

  if (teams.length === 0) {
    console.log(chalk.yellow('No teams found for this repository'));
    return;
  }

  console.log(`Found ${teams.length} team(s):\n`);

  teams.forEach((team, index) => {
    console.log(`${index + 1}. ${chalk.bold(team.teamName)}`);
    console.log(`   Slug: ${team.teamSlug}`);
    console.log(`   ID: ${team.teamId}`);
    console.log(`   Repo: ${team.repository.org}/${team.repository.repo}`);
    console.log();
  });
}
```

#### `mimir teams clear-cache`

```typescript
async function clearCacheCommand(workspaceRoot?: string): Promise<void> {
  const teamDetector = getTeamDetector();

  const confirmed = await confirm({
    message: workspaceRoot
      ? `Clear team cache for current workspace?`
      : `Clear all team cache?`,
    default: false,
  });

  if (!confirmed) {
    console.log('Cancelled');
    return;
  }

  await teamDetector.clearCache(workspaceRoot);

  console.log(chalk.green('\n✓ Cache cleared'));
}
```

### Task 4: API Contracts

**Add to Teams API Client**:

#### GET /repos/:org/:repo/teams

**Headers**:
```
Authorization: Bearer <accessToken>
```

**Response**:
```typescript
interface RepoTeamsResponse {
  repository: {
    org: string;
    repo: string;
    platform: string;
  };
  teams: Array<{
    id: string;
    slug: string;
    name: string;
    role: 'owner' | 'admin' | 'member';
  }>;
}
```

---

## Cache Strategy

### Cache TTL

- **Default**: 7 days
- **Configurable**: Via teams backend config
- **Manual clear**: `mimir teams clear-cache`

### Cache Invalidation

Cache is invalidated when:
1. TTL expires (7 days)
2. User manually clears cache
3. Git remote URL changes
4. Team is manually overridden

### Cache Storage

```sql
CREATE TABLE workspace_team_mappings (
  workspace_path TEXT PRIMARY KEY,
  git_remote_url TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_slug TEXT NOT NULL,
  team_name TEXT NOT NULL,
  repository_data TEXT NOT NULL, -- JSON
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_workspace_team_expires
  ON workspace_team_mappings(workspace_path, expires_at);
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('WorkspaceTeamDetector', () => {
  describe('detectTeam', () => {
    it('should return null when not authenticated', async () => {
      // Test implementation
    });

    it('should return null for non-git repository', async () => {
      // Test implementation
    });

    it('should detect team from git remote', async () => {
      // Mock git remote
      // Mock API response
      // Verify team detected
    });

    it('should use cached team when available', async () => {
      // Test implementation
    });

    it('should prompt user when multiple teams found', async () => {
      // Test implementation
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific workspace', async () => {
      // Test implementation
    });

    it('should clear all cache when no workspace specified', async () => {
      // Test implementation
    });
  });
});
```

### Integration Tests

```typescript
describe('Team Detection Flow', () => {
  it('should detect team in real git repository', async () => {
    // Create temp git repo
    // Add remote
    // Run detection
    // Verify correct team
  });

  it('should cache team mapping', async () => {
    // First detection (API call)
    // Second detection (cache hit, no API call)
  });
});
```

---

## Success Criteria

Phase 3 is complete when:

- [ ] **Team detection working**
  - [ ] Auto-detect from git remote
  - [ ] Support GitHub, GitLab, Bitbucket
  - [ ] Handle multiple remotes (prefer origin)
  - [ ] Prompt when multiple teams

- [ ] **Caching implemented**
  - [ ] Cache mappings in SQLite
  - [ ] 7-day TTL
  - [ ] Manual cache clearing works

- [ ] **Commands functional**
  - [ ] `mimir teams current` - show detected team
  - [ ] `mimir teams list` - show all teams for repo
  - [ ] `mimir teams clear-cache` - clear cache

- [ ] **Testing**
  - [ ] Unit tests: 80%+ coverage
  - [ ] Integration tests pass
  - [ ] Manual testing in real repos

- [ ] **Documentation**
  - [ ] Update README with teams commands
  - [ ] Document team detection logic
  - [ ] API docs complete

---

## Timeline

**Week 1**:
- Day 1: GitRepository helper
- Day 2: WorkspaceTeamDetector core
- Day 3: Caching implementation
- Day 4: Teams commands
- Day 5: Testing and documentation

---

## Next Phase

After Phase 3 completes → **Phase 4: Config Enforcement**
- Load team config from backend
- Apply enforcement rules
- Offline mode with cached config
