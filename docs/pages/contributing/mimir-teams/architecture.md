# Mimir Teams - Complete Architecture

**Status**: Final Architecture
**Last Updated**: 2025-12-27

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Decisions](#core-decisions)
3. [System Architecture](#system-architecture)
4. [Authentication Flow](#authentication-flow)
5. [Team Detection](#team-detection)
6. [Configuration Hierarchy](#configuration-hierarchy)
7. [Command Structure](#command-structure)
8. [Database Schema](#database-schema)
9. [API Contracts](#api-contracts)
10. [Budget & Enforcement](#budget--enforcement)
11. [Licensing](#licensing)

---

## Executive Summary

### What We're Building

Transform Mimir from a **local-only AI coding assistant** into an **enterprise-ready platform** with:

- **Organization-level management**: Centralized config, tools, permissions
- **Team-based workspaces**: Automatic team detection from git repositories
- **Multi-org support**: Users can belong to multiple organizations (like GitHub)
- **Security & compliance**: SOC 2, ISO 27001, GDPR ready
- **Budget enforcement**: Per-user budgets within teams, hard limits
- **Audit trail**: Immutable, tamper-proof logs
- **LLM proxy**: All calls routed through backend (hide keys, enforce budgets)

### Key Principles

1. **Local-first, Cloud-optional**: CLI works 100% offline (free tier), Teams is opt-in
2. **Workspace-aware**: Automatic team detection from git origins
3. **Config enforcement**: Teams backend enforces models, providers, tools, budgets
4. **Zero breaking changes**: Existing local users unaffected
5. **GitHub-like multi-org**: Login once, select organization

---

## Core Decisions

### 1. Configuration Priority Order

| Priority | Source | Enforced | Can Override |
|----------|--------|----------|--------------|
| **100** | **Teams (Backend)** | ✅ Yes | Nothing (highest) |
| 50 | Local/Project (`.mimir/config.yml`) | ❌ No | Global, Env, Default |
| 40 | Global (`~/.mimir/config.yml`) | ❌ No | Env, Default |
| 30 | Environment (`.env`, `MIMIR_*`) | ❌ No | Default |
| 0 | Default (hardcoded) | ❌ No | Nothing (base layer) |

**Note**: Teams config (from backend) has highest priority and enforces critical fields.

---

### 2. Multi-Organization Support

**Model**: Like GitHub - login once, select organization

**Flow**:
```bash
# User logs in
mimir auth login
# Email: alice@example.com
# Password: ********
#
# → Organizations:
#   1. acme-corp (alice@acme.com)
#   2. startup-xyz (alice@example.com)
#
# → Select organization: 1
# → Authenticated to acme-corp

# Switch organization
mimir orgs set startup-xyz
# → Switched to startup-xyz
```

**Features**:
- Single login, multiple orgs
- Email per org (for SSO/different domains)
- Or primary email (for non-SSO orgs)
- Active org tracked, switchable anytime

---

### 3. Team Structure

#### Repository Sharing
**Decision**: Same repository CAN be used by multiple teams

**Example**:
```
Repository: git@github.com:acme/monorepo.git

Team A (frontend-team):
  - Members: Alice, Bob, Charlie
  - Budget: $500/month
  - Tools: file_operations, git
  - Repository: git@github.com:acme/monorepo.git

Team B (backend-team):
  - Members: David, Eve, Frank
  - Budget: $1000/month
  - Tools: file_operations, git, bash_execution
  - Repository: git@github.com:acme/monorepo.git (SAME REPO)
```

**Constraint**: User cannot be in multiple teams under the same repository
```
✗ Alice cannot be in both frontend-team AND backend-team
  (both teams use git@github.com:acme/monorepo.git)

✓ Alice can be in frontend-team (acme/monorepo.git)
  AND ml-team (acme/ml-models.git)
  (different repositories)
```

**Team Detection**:
When multiple teams share a repo, CLI prompts user to select team on first use:
```bash
cd ~/acme/monorepo
mimir

# → Detected multiple teams for this repository:
#   1. frontend-team (Frontend Team)
#   2. backend-team (Backend Team)
#
# → Which team are you working with? 1
# → Using frontend-team
# → (Selection cached for this workspace)
```

#### Repository Field
**Decision**: Optional but warn if not provided

```bash
mimir teams create planning-team
# → Warning: No repository specified. Team detection will not work.
# → You can add a repository later with: mimir teams update planning-team --repository <url>
# → Continue? (y/n): y
# → Team created
```

#### Team Creation Permissions
**Decision**: Only org owners and admins can create teams

#### Team Auto-Join
**Decision**: Prompt user (Option B)

```bash
mimir teams create backend-team
# → Team created: backend-team
# → Join this team as admin? (y/n): y
# → You are now an admin of backend-team
```

---

### 4. Configuration & Enforcement

#### Config Cache TTL
**Decision**: Default 1 day, configurable in backend (per-org setting)

**Backend Config**:
```yaml
organization:
  offline:
    cache_ttl: 86400  # 1 day (in seconds)
```

**Enterprise orgs** can set shorter TTL (e.g., 1 hour)
**Startup orgs** can set longer TTL (e.g., 7 days)

#### Cache Enforcement
**Decision**: Strict (Option B)

```
1. CLI loads config from backend
2. Config cached locally with TTL
3. If cache expired:
   - Try to fetch fresh config from backend
   - If network unavailable: ERROR
   - User must connect to network OR logout
4. No grace period, no stale cache
```

**Error Message**:
```
✗ Cannot connect to Teams API

Config cache expired 2 hours ago.
Please connect to network and retry.

To switch to local mode: mimir auth logout
```

---

### 5. Budget & Enforcement

#### Budget Model
**Decision**: Per-user budgets within teams

**Hierarchy**:
```
Organization Budget: $5000/month
  └─ Team A Budget: $2000/month
      ├─ Alice: $500/month
      ├─ Bob: $500/month
      └─ Charlie: $1000/month

  └─ Team B Budget: $3000/month
      ├─ David: $1500/month
      └─ Eve: $1500/month
```

**Enforcement**:
- Each user has a budget (set by team admin or org admin)
- **Hard limit**: Cannot exceed budget (LLM calls blocked)
- Warnings configurable (e.g., warn at 80%, 90%)
- Email notifications (future feature)

**Example**:
```bash
mimir
# Alice makes LLM calls...
# → ⚠ Budget warning: 85% used ($425/$500)

# Alice continues...
# → ✗ Budget limit reached
#   You have used $500 of your $500 monthly budget.
#   Contact your team admin to increase your budget.
```

---

### 6. Other Decisions

- **MCP Enforcement**: Decide later (placeholder in config)
- **Rate Limiting**: Rely on backend (no client-side limiting)
- **Team Deletion**: Soft delete only (GDPR compliance)
- **Tool Installation**: Auto-install with consent (Option A) or trust-based (Option C)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                    User Workstation                     │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Mimir CLI (@codedir/mimir-code)                   │ │
│  │  • Local-first (works offline for free tier)      │ │
│  │  • Teams-optional (opt-in with `mimir auth login`)│ │
│  │                                                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │ │
│  │  │ Auth Manager │  │Config Manager│  │ Tool Reg │ │ │
│  │  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │ │
│  │         │                 │                │        │ │
│  │  ┌──────▼─────────────────▼────────────────▼─────┐ │ │
│  │  │      Teams API Client                         │ │ │
│  │  │  (Uses @codedir/mimir-teams-api-contracts)    │ │ │
│  │  └──────────────────┬────────────────────────────┘ │ │
│  │                     │                               │ │
│  │  ┌──────────────────▼────────────────────────────┐ │ │
│  │  │      Local SQLite Storage                     │ │ │
│  │  │  • Cache Teams config                         │ │ │
│  │  │  • Cache team mappings                        │ │ │
│  │  │  • Store conversations (local only)           │ │ │
│  │  └───────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / REST API
                       │ (JWT auth, API contracts)
┌──────────────────────▼──────────────────────────────────┐
│              Mimir Teams Backend                        │
│            (@codedir/mimir-teams - CLOSED SOURCE)       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Next.js 16 App Router + API Routes             │   │
│  │                                                  │   │
│  │  • Auth (JWT, OAuth, SSO)                       │   │
│  │  • Config enforcement                           │   │
│  │  • Team detection                               │   │
│  │  • Audit logging                                │   │
│  │  • LLM proxy (budget enforcement)               │   │
│  │  • Custom tools/commands                        │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                   │
│  ┌──────────────────▼──────────────────────────────┐   │
│  │  Supabase (PostgreSQL + Auth + RLS)             │   │
│  │  • organizations, teams, team_members           │   │
│  │  • enforcement_configs, custom_tools            │   │
│  │  • audit_logs, llm_usage                        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                       │
                       │ (For LLM Proxy)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LLM Providers                              │
│  • Anthropic, DeepSeek, OpenAI, Google Gemini          │
└─────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### Login Flow (GitHub-like)

```
1. User runs: mimir auth login

2. CLI prompts for credentials:
   Email: alice@example.com
   Password: ********

3. CLI calls backend: POST /api/v1/auth/login
   {
     "email": "alice@example.com",
     "password": "********"
   }

4. Backend authenticates user:
   • Verify credentials (Supabase Auth)
   • Fetch user's organizations

5. Backend returns organizations:
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_in": 900,
     "user": {
       "id": "user-123",
       "email": "alice@example.com",
       "full_name": "Alice Johnson",
       "organizations": [
         {
           "org_id": "org-abc",
           "org_slug": "acme-corp",
           "org_name": "Acme Corporation",
           "role": "member",
           "email": "alice@acme.com"  // Org-specific email (for SSO)
         },
         {
           "org_id": "org-xyz",
           "org_slug": "startup-xyz",
           "org_name": "Startup XYZ",
           "role": "owner",
           "email": "alice@example.com"  // Primary email (no SSO)
         }
       ]
     },
     "org_secret": "..."  // For first org (or selected org)
   }

6. If multiple orgs, CLI prompts:
   Organizations:
     1. acme-corp (alice@acme.com)
     2. startup-xyz (alice@example.com)

   Select organization: 1

7. CLI stores auth for selected org:
   ~/.mimir/auth.json:
   {
     "organizations": {
       "acme-corp": {
         "accessToken": "...",
         "refreshToken": "...",
         "expiresAt": "...",
         "userId": "user-123",
         "userEmail": "alice@acme.com",
         "orgSecret": "..."
       }
     },
     "activeOrg": "acme-corp"
   }

8. CLI displays success:
   ✓ Authenticated to acme-corp
     Email: alice@acme.com
     Role: member

9. User can login to other orgs:
   mimir auth login --org startup-xyz
   (Stores separate auth for startup-xyz)

10. User can switch orgs:
    mimir orgs set startup-xyz
    → activeOrg changed to "startup-xyz"
```

---

## Team Detection

### Algorithm

```
1. User runs: mimir

2. CLI loads active org from auth:
   activeOrg = "acme-corp"

3. CLI detects workspace:
   • Current directory: /Users/alice/acme/monorepo
   • Check if git: git rev-parse --show-toplevel
   • Extract origin: git remote get-url origin
     → git@github.com:acme/monorepo.git

4. Check local cache:
   SELECT team_id, team_slug FROM workspace_team_mappings
   WHERE org_slug = 'acme-corp'
     AND repository = 'git@github.com:acme/monorepo.git'
     AND expires_at > NOW()

5. If cache miss, call backend:
   POST /api/v1/orgs/acme-corp/teams/detect
   {
     "repository": "git@github.com:acme/monorepo.git",
     "user_id": "user-123"
   }

6. Backend detects teams:
   SELECT t.id, t.slug, t.name, tm.role
   FROM teams t
   JOIN team_members tm ON t.id = tm.team_id
   WHERE t.org_id = 'org-abc'
     AND t.repository = 'git@github.com:acme/monorepo.git'
     AND tm.user_id = 'user-123'

   Found:
   - team-aaa: frontend-team (role: developer)
   - team-bbb: backend-team (role: admin)

7. If multiple teams, prompt user:
   Detected multiple teams for this repository:
     1. frontend-team (Frontend Team) - Developer
     2. backend-team (Backend Team) - Admin

   Which team are you working with? 1

8. CLI caches selection:
   INSERT INTO workspace_team_mappings (
     workspace, org_slug, team_id, team_slug, repository, ...
   ) VALUES (
     '/Users/alice/acme/monorepo',
     'acme-corp',
     'team-aaa',
     'frontend-team',
     'git@github.com:acme/monorepo.git',
     ...
   )

9. CLI loads config with team context:
   GET /api/v1/orgs/acme-corp/config?team_id=team-aaa

10. CLI proceeds with team context applied
```

---

## Configuration Hierarchy

### Merging Algorithm

```typescript
function mergeConfigs(sources: ConfigSource[]): Config {
  // Sort by priority (lowest to highest)
  sources.sort((a, b) => a.priority - b.priority);

  let result = {};

  for (const source of sources) {
    if (source.name === 'teams' && source.isEnforced()) {
      // Teams config: Enforce critical fields
      result = applyEnforcedConfig(result, source.config);
    } else {
      // Local config: Deep merge
      result = deepMerge(result, source.config);
    }
  }

  return result;
}

function applyEnforcedConfig(base: Config, teamsConfig: Config): Config {
  const result = { ...base };

  // ENFORCED: Teams config overrides completely
  if (teamsConfig.enforcement) {
    result.enforcement = teamsConfig.enforcement;
  }

  if (teamsConfig.teams) {
    result.teams = teamsConfig.teams;
  }

  if (teamsConfig.tools) {
    result.tools = mergeTools(base.tools, teamsConfig.tools);
  }

  // NOT ENFORCED: Keep local values
  // - ui (theme, colors)
  // - keyBindings (shortcuts)

  return result;
}
```

### Example Config Resolution

**Scenario**: User in `acme-corp` org, `frontend-team` team

**Default Config** (Priority 0):
```yaml
llm:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7
tools:
  bash_execution: { enabled: true }
```

**Environment** (Priority 30):
```bash
MIMIR_LLM_TEMPERATURE=0.9
```

**Global Config** (Priority 40):
```yaml
ui:
  theme: dracula
```

**Project Config** (Priority 50):
```yaml
llm:
  maxTokens: 16000
```

**Teams Config (Backend)** (Priority 100, ENFORCED):
```yaml
enforcement:
  allowedModels: [claude-sonnet-4.5]
  allowedProviders: [anthropic]
llm:
  provider: anthropic
  model: claude-sonnet-4.5
tools:
  bash_execution: { enabled: false }  # Security: disabled
```

**Final Merged Config**:
```yaml
llm:
  provider: anthropic          # From Teams (enforced)
  model: claude-sonnet-4.5     # From Teams (enforced)
  temperature: 0.9             # From Environment (not enforced)
  maxTokens: 16000             # From Project (not enforced)

enforcement:
  allowedModels: [claude-sonnet-4.5]  # From Teams
  allowedProviders: [anthropic]        # From Teams

tools:
  bash_execution: { enabled: false }   # From Teams (enforced)

ui:
  theme: dracula                       # From Global (not enforced)
```

---

## Command Structure

### CLI Commands

```bash
# Default command (start chat)
mimir

# Authentication
mimir auth login              # Login to organization
mimir auth login --org <slug> # Login to specific org
mimir auth logout             # Logout from active org
mimir auth logout --all       # Logout from all orgs
mimir auth status             # Show auth status

# Organizations
mimir orgs list               # List all organizations
mimir orgs set <slug>         # Set active organization
mimir orgs current            # Show current organization
mimir orgs show               # Show org details (budget, usage)

# Teams
mimir teams list              # List teams in current org
mimir teams create <slug>     # Create new team (admin only)
mimir teams current           # Show current team (detected)
mimir teams show <slug>       # Show team details
mimir teams update <slug>     # Update team (admin only)

# Existing commands (unchanged)
mimir init                    # Initialize .mimir/ directory
mimir history                 # Manage conversation history
mimir cost                    # View cost analytics
mimir permissions             # Manage permissions
# ... etc
```

---

## Database Schema

### CLI (SQLite)

```sql
-- Cache for Teams config
CREATE TABLE cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Workspace to team mappings (with multi-team support)
CREATE TABLE workspace_team_mappings (
  workspace TEXT NOT NULL,
  org_slug TEXT NOT NULL,
  repository TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_slug TEXT NOT NULL,
  team_name TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (workspace, org_slug, repository)
);

-- Audit sync queue
CREATE TABLE audit_sync_queue (
  id TEXT PRIMARY KEY,
  permission_decision_id TEXT NOT NULL,
  synced_at INTEGER,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_workspace_team_mappings_org ON workspace_team_mappings(org_slug);
CREATE INDEX idx_workspace_team_mappings_repo ON workspace_team_mappings(repository);
```

### Backend (PostgreSQL / Supabase)

```sql
-- Organizations (tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subscription_tier TEXT NOT NULL,  -- 'free', 'teams', 'enterprise'
  org_secret TEXT NOT NULL,         -- For HMAC signing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams (allow multiple teams per repository)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  repository TEXT,                  -- Git origin (nullable, can be shared)
  budget_monthly_usd DECIMAL(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,           -- Soft delete
  UNIQUE(org_id, slug)
  -- NOTE: NO unique constraint on repository (allows sharing)
);

-- Team members (with per-user budgets)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  role TEXT NOT NULL,               -- 'admin', 'developer', 'viewer'
  budget_monthly_usd DECIMAL(10, 2),  -- Per-user budget
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id),

  -- CONSTRAINT: User cannot be in multiple teams with same repository
  CONSTRAINT unique_user_per_repo UNIQUE (user_id, (
    SELECT repository FROM teams WHERE id = team_id
  ))
);

-- Enforcement config (org + team level)
CREATE TABLE enforcement_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  team_id UUID REFERENCES teams(id),  -- NULL = org-level

  allowed_models TEXT[] NOT NULL,
  blocked_models TEXT[] NOT NULL,
  allowed_providers TEXT[] NOT NULL,
  global_allowlist TEXT[] NOT NULL,
  global_blocklist TEXT[] NOT NULL,
  docker_mode TEXT NOT NULL DEFAULT 'local',

  allow_local_overrides BOOLEAN NOT NULL DEFAULT false,

  -- MCP enforcement (placeholder for future)
  mcp_allowed_servers TEXT[],
  mcp_blocked_servers TEXT[],
  mcp_enforce_list BOOLEAN NOT NULL DEFAULT false,

  -- Offline config
  cache_ttl_seconds INTEGER NOT NULL DEFAULT 86400,  -- 1 day

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs (immutable, soft-deletable for GDPR)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id) NOT NULL,

  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  repository TEXT,
  risk_level TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  approval_method TEXT,
  success BOOLEAN,
  output TEXT,
  error_message TEXT,

  signature TEXT NOT NULL,  -- HMAC
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ        -- Soft delete (GDPR)
);

-- LLM usage (for budget tracking)
CREATE TABLE llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id) NOT NULL,

  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd DECIMAL(10, 6) NOT NULL,

  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom tools (org + team level)
CREATE TABLE custom_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  team_id UUID REFERENCES teams(id),

  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL,
  schema JSONB NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row-Level Security (RLS) policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE enforcement_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_tools ENABLE ROW LEVEL SECURITY;

-- (Policies defined based on user's org membership)
```

---

## API Contracts

### Key Endpoints

```typescript
// Authentication
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

// Organizations
GET    /api/v1/orgs
GET    /api/v1/orgs/:slug
GET    /api/v1/orgs/:slug/config?team_id=:teamId

// Teams
GET    /api/v1/orgs/:slug/teams
POST   /api/v1/orgs/:slug/teams
GET    /api/v1/orgs/:slug/teams/:teamSlug
PATCH  /api/v1/orgs/:slug/teams/:teamSlug
POST   /api/v1/orgs/:slug/teams/detect

// Audit
POST   /api/v1/orgs/:slug/audit/sync

// LLM Proxy
POST   /api/v1/llm/chat
POST   /api/v1/llm/chat/stream
POST   /api/v1/orgs/:slug/budget/check
GET    /api/v1/orgs/:slug/usage

// Tools
GET    /api/v1/orgs/:slug/tools?team_id=:teamId
```

**Package**: `@codedir/mimir-teams-api-contracts` (public npm, MIT license)

---

## Budget & Enforcement

### Budget Hierarchy

```
Organization: $5000/month
  └─ Team A: $2000/month
      ├─ Alice: $500/month (hard limit)
      ├─ Bob: $500/month
      └─ Charlie: $1000/month
```

### Budget Check Flow

```
1. User makes LLM request

2. CLI estimates cost: ~$0.05

3. CLI calls: POST /api/v1/orgs/acme-corp/budget/check
   {
     "team_id": "team-aaa",
     "user_id": "user-123",
     "estimated_cost": 0.05
   }

4. Backend checks:
   - User budget: $500/month
   - User usage (this month): $495
   - Remaining: $5
   - Estimated cost: $0.05
   - Allowed: false (would exceed budget)

5. Backend returns:
   {
     "allowed": false,
     "reason": "Budget limit reached",
     "budget": {
       "monthly_limit": 500,
       "current_usage": 495,
       "remaining": 5,
       "estimated_cost": 0.05
     }
   }

6. CLI blocks request:
   ✗ Budget limit reached
     You have used $495 of your $500 monthly budget.
     This request would cost ~$0.05.
     Contact your team admin to increase your budget.
```

### Configurable Warnings

**Backend Config** (per-user or per-team):
```yaml
user:
  budget_alerts:
    warn_at: [0.8, 0.9]  # Warn at 80%, 90%
    block_at: 1.0        # Block at 100%
```

**CLI Behavior**:
```bash
# At 80% usage
⚠ Budget warning: 80% used ($400/$500)

# At 90% usage
⚠ Budget warning: 90% used ($450/$500)
  Only $50 remaining this month.

# At 100% usage
✗ Budget limit reached
  Contact admin to increase budget.
```

---

## Licensing

| Repository | License | Visibility |
|------------|---------|------------|
| `@codedir/mimir-code` (CLI) | **AGPL-3.0** | Open source (GitHub) |
| `@codedir/mimir-teams` (Backend) | **Proprietary** | Closed source (private repo) |
| `@codedir/mimir-teams-api-contracts` | **MIT** | Public (npm package) |

---

## Summary

### ✅ Architecture Complete

- Multi-org support (GitHub-like)
- Multiple teams can share same repository
- Strict config enforcement (1-day cache TTL, no grace period)
- Per-user budgets with hard limits
- GDPR-compliant (soft delete only)
- Clear command structure (`mimir`, `mimir auth`, `mimir orgs`, `mimir teams`)

### 🚀 Ready for Implementation

Next: See **[TEAMS-ROADMAP.md](./TEAMS-ROADMAP.md)** for detailed Phase 0-1 implementation plan.

---

**Last Updated**: 2025-12-27
