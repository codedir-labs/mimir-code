# Mimir Teams - Backend Architecture Plan

**Repository**: `@codedir/mimir-teams` (Separate codebase)

**Purpose**: Multi-tenant SaaS backend for enterprise team management, configuration enforcement, audit logging, and LLM proxy (optional).

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Multi-Tenancy Design](#multi-tenancy-design)
6. [Hierarchical Permissions](#hierarchical-permissions)
7. [API Design](#api-design)
8. [LLM Proxy Architecture](#llm-proxy-architecture)
9. [Compliance & Security](#compliance--security)
10. [Subscription System](#subscription-system)
11. [Deployment Architecture](#deployment-architecture)
12. [Implementation Phases](#implementation-phases)

---

## Overview

Mimir Teams is a **multi-tenant SaaS platform** that provides:

- **Organization Management**: Top-level entity for companies (identified by slug)
- **Team Management**: Sub-organizations within orgs (e.g., frontend-team, backend-team)
- **Hierarchical Permissions**: Org → Team → Member with role-based access control
- **Configuration Enforcement**: Centralized config that CLI clients fetch and obey
- **Budget Management**: Org-level and team-level budget controls for LLM usage
- **Audit Trail**: Complete, immutable log of all CLI actions for compliance
- **LLM Proxy** (Optional): Route LLM requests through backend, enforce quotas, take margin fees
- **Compliance**: SOC 2, ISO 27001, DORA, GDPR-ready architecture
- **On-Premise Support**: Designed for both cloud and on-prem deployment

---

## Architecture Principles

### 1. **Local-First, Cloud-Optional**
- CLI works 100% locally by default (BYOK - Bring Your Own Keys)
- Teams backend is **optional enhancement** for enterprises
- No code leaves network (LLM proxy is opt-in)
- On-premise deployment supported via Docker Compose

### 2. **Multi-Tenancy Isolation**
- PostgreSQL Row-Level Security (RLS) for query-level isolation
- Option for **separate databases per tenant** (large enterprises)
- Org slug as primary identifier (e.g., `acme-corp`, `github`)

### 3. **Hierarchical Configuration**
- **Organization** → Base config, API keys, budget
- **Team** → Override/refine org config (cannot exceed org budget)
- **Member** → Individual budgets, permissions within teams

### 4. **Zero-Trust Security**
- API keys never stored in CLI (fetched on-demand)
- JWTs expire frequently (15-min access, 7-day refresh)
- All actions audited (append-only audit log)
- Cryptographic signatures on audit logs (tamper-proof)

### 5. **Compliance-First**
- GDPR: Right to erasure, data export, consent management
- SOC 2: Audit logs, access controls, encryption at rest/transit
- ISO 27001: Risk management, incident response
- DORA: Operational resilience, third-party risk

---

## Technology Stack

### Backend
- **Next.js 16** (App Router) - Server-side rendering, API routes
- **TypeScript** - Type safety across frontend/backend
- **Supabase** - PostgreSQL + Auth + Realtime + Storage
  - PostgreSQL 16 with Row-Level Security (RLS)
  - Supabase Auth (email/password, later SSO/SAML)
  - Supabase Storage (compliance document exports)
- **Drizzle ORM** - Type-safe database queries
- **Zod** - Runtime validation for API inputs

### Frontend
- **Shadcn UI** - Pre-built, accessible components
- **Tailwind CSS** - Utility-first styling
- **React Server Components** - Performance optimization
- **TanStack Query** - Data fetching, caching

### Infrastructure
- **Hetzner Cloud** - Primary hosting (EU data residency)
  - Dedicated server or Cloud instances
  - Private networking for database
- **Docker** - On-premise deployment
- **nginx** - Reverse proxy, rate limiting
- **PostgreSQL Replication** - Multi-region support

### Monitoring & Observability
- **Sentry** - Error tracking
- **Axiom** or **Grafana Cloud** - Logs, metrics
- **Uptime Kuma** - Health checks

---

## Database Schema

### Core Principles
- **Soft deletes** (for GDPR right to erasure)
- **Audit columns** (created_at, updated_at, created_by)
- **Row-Level Security** on all tables
- **Append-only audit logs** (immutable)

### Schema Design

```sql
-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- e.g., 'acme-corp', 'github'
  name TEXT NOT NULL,

  -- Subscription
  subscription_tier TEXT NOT NULL DEFAULT 'free',
    -- 'free' | 'teams' | 'enterprise'
  subscription_status TEXT NOT NULL DEFAULT 'active',
    -- 'active' | 'trial' | 'suspended' | 'cancelled'
  trial_ends_at TIMESTAMPTZ,

  -- Feature flags (derived from subscription)
  features JSONB NOT NULL DEFAULT '{
    "sso": false,
    "llm_proxy": false,
    "audit_retention_days": 30,
    "max_teams": 5,
    "max_members": 25
  }'::jsonb,

  -- Budget (org-wide)
  budget_monthly_usd NUMERIC(10, 2), -- NULL = unlimited
  budget_alert_threshold NUMERIC(3, 2) DEFAULT 0.8, -- Alert at 80%

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ, -- Soft delete

  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_orgs_slug ON organizations(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_orgs_subscription ON organizations(subscription_tier);

-- ============================================================
-- TEAMS (Sub-organizations within orgs)
-- ============================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, -- Unique within org (e.g., 'frontend', 'backend')
  name TEXT NOT NULL,
  description TEXT,

  -- Budget (subset of org budget)
  budget_monthly_usd NUMERIC(10, 2), -- NULL = no limit (inherits org)
  budget_percentage NUMERIC(5, 2), -- % of org budget (0-100)
    -- If both set, takes minimum

  -- Linked workspaces/repos
  repositories JSONB DEFAULT '[]'::jsonb,
    -- [{"url": "https://github.com/acme/frontend", "branch": "main"}]

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(org_id, slug),
  CONSTRAINT valid_budget_percentage CHECK (
    budget_percentage IS NULL OR
    (budget_percentage >= 0 AND budget_percentage <= 100)
  )
);

CREATE INDEX idx_teams_org ON teams(org_id) WHERE deleted_at IS NULL;

-- ============================================================
-- USERS (Supabase Auth)
-- ============================================================

-- Supabase manages auth.users table
-- We extend with user profile

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MEMBERSHIPS (Users → Organizations)
-- ============================================================

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Org-level role
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'auditor')),
    -- owner: Full control, billing
    -- admin: Manage members, config (no billing)
    -- member: Use CLI, limited config
    -- auditor: Read-only, view audit logs

  -- Budget (individual)
  budget_monthly_usd NUMERIC(10, 2), -- NULL = no individual limit

  -- Invitation
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(org_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- TEAM MEMBERSHIPS
-- ============================================================

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Denormalized for RLS performance

  -- Team-level role
  role TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'viewer')),
    -- admin: Manage team config, members
    -- developer: Use CLI, approve commands
    -- viewer: Read-only

  -- Budget (team-scoped)
  budget_monthly_usd NUMERIC(10, 2),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(team_id, user_id),

  -- User must be org member first
  FOREIGN KEY (org_id, user_id)
    REFERENCES organization_members(org_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_members_org ON team_members(org_id);

-- ============================================================
-- LLM PROVIDER API KEYS
-- ============================================================

CREATE TABLE llm_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    -- Either org_id OR team_id must be set (not both)

  provider TEXT NOT NULL, -- 'anthropic', 'openai', 'deepseek', 'google'
  api_key_encrypted TEXT NOT NULL, -- Encrypted with org-specific key

  -- Metadata
  name TEXT, -- Friendly name (e.g., "Production Claude Key")
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  rotated_at TIMESTAMPTZ,

  CHECK (
    (org_id IS NOT NULL AND team_id IS NULL) OR
    (org_id IS NULL AND team_id IS NOT NULL)
  )
);

CREATE INDEX idx_api_keys_org ON llm_api_keys(org_id) WHERE is_active;
CREATE INDEX idx_api_keys_team ON llm_api_keys(team_id) WHERE is_active;

-- ============================================================
-- CONFIGURATION (Org and Team level)
-- ============================================================

-- Organization-level config
CREATE TABLE organization_config (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Enforcement
  allowed_models TEXT[] DEFAULT ARRAY['*'], -- ['claude-sonnet-4.5', 'gpt-4']
  blocked_models TEXT[] DEFAULT '{}',

  allowed_providers TEXT[] DEFAULT ARRAY['*'], -- ['anthropic', 'openai']

  -- Agent orchestration
  allowed_sub_agents TEXT[] DEFAULT ARRAY['*'],
    -- ['finder', 'oracle', 'reviewer']
  forced_sub_agents JSONB DEFAULT '{}'::jsonb,
    -- {"security": {"enabled": true, "model": "sonnet-4.5", "trigger": "on-write"}}

  -- Permissions
  global_allowlist TEXT[] DEFAULT '{}',
    -- ["yarn test", "git status", "docker ps"]
  global_blocklist TEXT[] DEFAULT '{}',

  -- Docker
  docker_mode TEXT DEFAULT 'local', -- 'local' | 'cloud' | 'auto'

  -- Custom settings
  custom_settings JSONB DEFAULT '{}'::jsonb,

  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Team-level config (overrides/extends org config)
CREATE TABLE team_config (
  team_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Enforcement (team can further restrict, not expand)
  allowed_models TEXT[], -- Subset of org.allowed_models
  blocked_models TEXT[], -- Union with org.blocked_models

  allowed_providers TEXT[],

  allowed_sub_agents TEXT[],
  forced_sub_agents JSONB,

  -- Permissions (team-specific)
  team_allowlist TEXT[] DEFAULT '{}',
  team_blocklist TEXT[] DEFAULT '{}',

  -- Tool overrides
  enabled_tools TEXT[], -- NULL = all org tools
  disabled_tools TEXT[] DEFAULT '{}',

  -- Custom settings
  custom_settings JSONB DEFAULT '{}'::jsonb,

  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- CUSTOM TOOLS & COMMANDS
-- ============================================================

CREATE TABLE custom_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    -- Either org_id OR team_id

  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- Tool definition (YAML)
  definition JSONB NOT NULL,
    -- Full tool YAML converted to JSON

  -- Code
  code TEXT NOT NULL, -- TypeScript source
  compiled_code TEXT, -- Compiled JavaScript (cached)

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (
    (org_id IS NOT NULL AND team_id IS NULL) OR
    (org_id IS NULL AND team_id IS NOT NULL)
  )
);

CREATE INDEX idx_tools_org ON custom_tools(org_id) WHERE is_active;
CREATE INDEX idx_tools_team ON custom_tools(team_id) WHERE is_active;

CREATE TABLE custom_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NOT NULL,
  usage TEXT,

  -- Command definition (YAML)
  definition JSONB NOT NULL,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CHECK (
    (org_id IS NOT NULL AND team_id IS NULL) OR
    (org_id IS NULL AND team_id IS NOT NULL)
  )
);

-- ============================================================
-- AUDIT LOGS (Immutable)
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY, -- Generated by CLI, prevents duplicates
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event
  event_type TEXT NOT NULL,
    -- 'command_executed', 'file_modified', 'config_changed', etc.
  action TEXT NOT NULL, -- The actual command/action

  -- Context
  repository TEXT, -- Git repo if applicable
  branch TEXT,
  working_directory TEXT,

  -- Decision
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  approved BOOLEAN NOT NULL,
  approval_method TEXT,
    -- 'auto', 'manual', 'allowlist', 'always'

  -- Result
  success BOOLEAN,
  output TEXT, -- Truncated to 10KB
  error_message TEXT,

  -- Metadata
  cli_version TEXT,
  ip_address INET,

  -- Compliance
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature TEXT, -- HMAC signature for tamper-proof logs

  -- Retention
  retention_until TIMESTAMPTZ
    GENERATED ALWAYS AS (
      timestamp + INTERVAL '1 day' *
      COALESCE(
        (SELECT (features->>'audit_retention_days')::int
         FROM organizations WHERE id = org_id),
        30
      )
    ) STORED
);

CREATE INDEX idx_audit_org ON audit_logs(org_id, timestamp DESC);
CREATE INDEX idx_audit_team ON audit_logs(team_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_retention ON audit_logs(retention_until)
  WHERE retention_until IS NOT NULL;

-- Prevent updates/deletes (append-only)
CREATE RULE audit_logs_immutable AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_nodelete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ============================================================
-- LLM USAGE TRACKING
-- ============================================================

CREATE TABLE llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Usage
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  total_tokens INT NOT NULL,

  -- Cost
  cost_usd NUMERIC(10, 6) NOT NULL,
  margin_fee_usd NUMERIC(10, 6) DEFAULT 0, -- If using LLM proxy

  -- Metadata
  timestamp TIMESTAMPTZ DEFAULT now(),

  -- For aggregation queries
  date DATE GENERATED ALWAYS AS (timestamp::date) STORED,
  year_month TEXT GENERATED ALWAYS AS (
    to_char(timestamp, 'YYYY-MM')
  ) STORED
);

CREATE INDEX idx_usage_org_date ON llm_usage(org_id, date);
CREATE INDEX idx_usage_team_date ON llm_usage(team_id, date);
CREATE INDEX idx_usage_user_date ON llm_usage(user_id, date);
CREATE INDEX idx_usage_month ON llm_usage(year_month);

-- ============================================================
-- CONVERSATION HISTORY (Optional, for Teams feature)
-- ============================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT,

  -- Permissions
  visibility TEXT NOT NULL DEFAULT 'private',
    -- 'private' | 'team' | 'org'

  -- Metadata
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,

  -- Aggregates
  total_messages INT DEFAULT 0,
  total_cost_usd NUMERIC(10, 4) DEFAULT 0,
  total_tokens INT DEFAULT 0
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,

  -- Tokens/cost
  tokens INT,
  cost_usd NUMERIC(10, 6),

  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conv ON conversation_messages(conversation_id, timestamp);

-- ============================================================
-- SUBSCRIPTIONS & BILLING
-- ============================================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Plan
  plan_id TEXT NOT NULL, -- References subscription_plans.id
  status TEXT NOT NULL DEFAULT 'active',
    -- 'active' | 'trial' | 'past_due' | 'cancelled'

  -- Billing
  billing_email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  -- Dates
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  trial_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscription plans (configurable)
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY, -- 'free', 'teams', 'enterprise'
  name TEXT NOT NULL,
  description TEXT,

  -- Pricing
  price_monthly_usd NUMERIC(10, 2),
  price_yearly_usd NUMERIC(10, 2),

  -- Features (JSONB for flexibility)
  features JSONB NOT NULL,
    -- {
    --   "max_teams": 5,
    --   "max_members": 25,
    --   "sso": false,
    --   "llm_proxy": false,
    --   "audit_retention_days": 30,
    --   "support_sla": "community",
    --   "custom_tools": true
    -- }

  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed plans
INSERT INTO subscription_plans (id, name, price_monthly_usd, price_yearly_usd, features) VALUES
('free', 'Free', 0, 0, '{
  "max_teams": 1,
  "max_members": 3,
  "sso": false,
  "llm_proxy": false,
  "audit_retention_days": 7,
  "support_sla": "community",
  "custom_tools": false
}'::jsonb),
('teams', 'Teams', 25, 240, '{
  "max_teams": 10,
  "max_members": 50,
  "sso": false,
  "llm_proxy": true,
  "audit_retention_days": 90,
  "support_sla": "email",
  "custom_tools": true
}'::jsonb),
('enterprise', 'Enterprise', 50, 480, '{
  "max_teams": -1,
  "max_members": -1,
  "sso": true,
  "llm_proxy": true,
  "audit_retention_days": 365,
  "support_sla": "priority",
  "custom_tools": true,
  "on_premise": true
}'::jsonb);
```

---

## Multi-Tenancy Design

### Row-Level Security (RLS)

All tables use PostgreSQL RLS to enforce tenant isolation:

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
-- ... (enable on all tables)

-- Policy: Users can only see their organizations
CREATE POLICY "org_access"
  ON organizations
  FOR ALL
  USING (
    id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see teams they're members of
CREATE POLICY "team_access"
  ON teams
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Audit logs scoped to user's org
CREATE POLICY "audit_access"
  ON audit_logs
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Prevent modification of audit logs
CREATE POLICY "audit_immutable"
  ON audit_logs
  FOR UPDATE
  USING (false);

CREATE POLICY "audit_nodelete"
  ON audit_logs
  FOR DELETE
  USING (false);
```

### Separate Databases (Enterprise Feature)

For large enterprises requiring complete data isolation:

```typescript
// Multi-database connection manager
class DatabaseManager {
  private connections: Map<string, Supabase> = new Map();

  getConnection(orgSlug: string): Supabase {
    // Check if org has dedicated database
    const dbConfig = this.getOrgDatabaseConfig(orgSlug);

    if (dbConfig.dedicated) {
      // Connect to org-specific database
      return this.createConnection(dbConfig.connectionString);
    }

    // Use shared database with RLS
    return this.getSharedConnection();
  }
}
```

---

## Hierarchical Permissions

### Permission Hierarchy

```
Organization (owner, admin, member, auditor)
  └─ Team (admin, developer, viewer)
      └─ Member (individual budgets, scoped permissions)
```

### Permission Checks

```typescript
// Permission evaluation order
function canPerformAction(
  user: User,
  action: string,
  resource: Resource
): boolean {
  // 1. Check org-level role
  const orgRole = getUserOrgRole(user.id, resource.org_id);
  if (orgRole === 'owner') return true;
  if (orgRole === 'auditor' && !isWriteAction(action)) return true;

  // 2. Check team-level role (if team-scoped resource)
  if (resource.team_id) {
    const teamRole = getUserTeamRole(user.id, resource.team_id);
    if (teamRole === 'admin') return true;
    if (teamRole === 'developer' && !isAdminAction(action)) return true;
  }

  // 3. Check resource-specific permissions
  return hasPermission(user.id, action, resource);
}
```

### Budget Enforcement

```typescript
// Budget hierarchy: Member < Team < Org
function checkBudget(
  userId: string,
  teamId: string,
  orgId: string,
  estimatedCost: number
): { allowed: boolean; reason?: string } {

  // 1. Get org budget
  const orgBudget = getOrgBudget(orgId);
  const orgUsage = getOrgUsageThisMonth(orgId);

  if (orgBudget && orgUsage + estimatedCost > orgBudget) {
    return { allowed: false, reason: 'Organization budget exceeded' };
  }

  // 2. Get team budget (if team-scoped)
  if (teamId) {
    const teamBudget = getTeamBudget(teamId);
    const teamUsage = getTeamUsageThisMonth(teamId);

    if (teamBudget && teamUsage + estimatedCost > teamBudget) {
      return { allowed: false, reason: 'Team budget exceeded' };
    }
  }

  // 3. Get member budget
  const memberBudget = getMemberBudget(userId, teamId || orgId);
  const memberUsage = getMemberUsageThisMonth(userId);

  if (memberBudget && memberUsage + estimatedCost > memberBudget) {
    return { allowed: false, reason: 'Personal budget exceeded' };
  }

  return { allowed: true };
}
```

---

## API Design

### API Versioning

All APIs use URL versioning: `/api/v1/...`

**Contract Package**: `@codedir/mimir-teams-api-contracts`

```typescript
// packages/api-contracts/src/v1/index.ts

export namespace MimirTeamsAPI.v1 {
  // Auth
  export namespace Auth {
    export type LoginRequest = {
      email: string;
      password: string;
    };

    export type LoginResponse = {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: UserProfile;
    };
  }

  // Organizations
  export namespace Organizations {
    export type GetConfigRequest = {
      orgSlug: string;
    };

    export type GetConfigResponse = {
      organization: OrganizationConfig;
      team?: TeamConfig; // If user has active team context
    };

    export type OrganizationConfig = {
      slug: string;
      name: string;
      subscription_tier: 'free' | 'teams' | 'enterprise';
      features: SubscriptionFeatures;
      enforcement: {
        allowed_models: string[];
        blocked_models: string[];
        allowed_providers: string[];
        allowed_sub_agents: string[];
        forced_sub_agents: Record<string, any>;
        global_allowlist: string[];
        global_blocklist: string[];
        docker_mode: 'local' | 'cloud' | 'auto';
      };
      budget: {
        monthly_usd?: number;
        alert_threshold: number;
        current_usage: number;
      };
    };
  }

  // Teams
  export namespace Teams {
    export type ListTeamsRequest = {
      orgSlug: string;
    };

    export type ListTeamsResponse = {
      teams: Team[];
    };

    export type Team = {
      id: string;
      slug: string;
      name: string;
      description: string;
      member_count: number;
      budget?: {
        monthly_usd?: number;
        percentage?: number;
        current_usage: number;
      };
    };
  }

  // LLM Proxy
  export namespace LLM {
    export type ChatRequest = {
      provider: string;
      model: string;
      messages: Message[];
      tools?: Tool[];
      temperature?: number;
      max_tokens?: number;

      // Context
      org_slug: string;
      team_id?: string;
      user_id: string;
    };

    export type ChatResponse = {
      id: string;
      model: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      };
      cost: {
        base_cost_usd: number;
        margin_fee_usd: number;
        total_cost_usd: number;
      };
      content: string;
      tool_calls?: ToolCall[];
    };
  }

  // Audit
  export namespace Audit {
    export type SyncLogsRequest = {
      orgSlug: string;
      logs: AuditLogEntry[];
    };

    export type AuditLogEntry = {
      id: string;
      team_id?: string;
      user_id: string;
      event_type: string;
      action: string;
      repository?: string;
      branch?: string;
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      approved: boolean;
      success?: boolean;
      timestamp: string; // ISO 8601
      signature: string; // HMAC
    };
  }

  // Custom Tools
  export namespace Tools {
    export type ListToolsRequest = {
      orgSlug: string;
      teamId?: string; // Optional team filter
    };

    export type ListToolsResponse = {
      tools: CustomTool[];
    };

    export type CustomTool = {
      id: string;
      name: string;
      description: string;
      version: string;
      definition: Record<string, any>;
      code: string;
      source: 'org' | 'team';
    };
  }
}
```

### API Routes

```typescript
// app/api/v1/orgs/[orgSlug]/config/route.ts
export async function GET(
  request: Request,
  { params }: { params: { orgSlug: string } }
) {
  const user = await getAuthUser(request);
  const { orgSlug } = params;

  // Check access
  const hasAccess = await userHasOrgAccess(user.id, orgSlug);
  if (!hasAccess) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get org config
  const orgConfig = await db.query.organizationConfig.findFirst({
    where: eq(organizations.slug, orgSlug)
  });

  // Get team config if user has active team
  const teamId = request.headers.get('X-Mimir-Team-Id');
  let teamConfig = null;

  if (teamId) {
    teamConfig = await db.query.teamConfig.findFirst({
      where: eq(teams.id, teamId)
    });
  }

  // Merge configs (team overrides org)
  const mergedConfig = mergeConfigs(orgConfig, teamConfig);

  return Response.json({
    organization: mergedConfig,
    team: teamConfig
  });
}
```

---

## LLM Proxy Architecture

### Purpose
- **Hide API keys** from individual CLI users
- **Enforce budgets** before forwarding to LLM providers
- **Track usage** for billing and analytics
- **Take margin fees** (e.g., 10-20% markup)

### Flow

```
CLI → Mimir Teams API → LLM Provider → Response
          ↓
    Budget Check
    Usage Tracking
    Margin Calculation
```

### Implementation

```typescript
// app/api/v1/llm/chat/route.ts
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  const body = await request.json();

  const { org_slug, team_id, provider, model, messages } = body;

  // 1. Check budget
  const estimatedTokens = estimateTokens(messages);
  const estimatedCost = calculateCost(provider, model, estimatedTokens);

  const budgetCheck = await checkBudget(
    user.id,
    team_id,
    org_slug,
    estimatedCost
  );

  if (!budgetCheck.allowed) {
    return Response.json({
      error: budgetCheck.reason
    }, { status: 402 }); // Payment Required
  }

  // 2. Get API key (org or team)
  const apiKey = await getAPIKey(org_slug, team_id, provider);

  if (!apiKey) {
    return Response.json({
      error: 'No API key configured for provider'
    }, { status: 400 });
  }

  // 3. Forward to LLM provider
  const providerClient = createProviderClient(provider, apiKey);
  const response = await providerClient.chat({
    model,
    messages,
    ...body
  });

  // 4. Calculate costs
  const baseCost = calculateActualCost(
    provider,
    model,
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  const marginFee = baseCost * 0.15; // 15% margin
  const totalCost = baseCost + marginFee;

  // 5. Track usage
  await db.insert(llmUsage).values({
    org_id: org.id,
    team_id,
    user_id: user.id,
    provider,
    model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    total_tokens: response.usage.total_tokens,
    cost_usd: baseCost,
    margin_fee_usd: marginFee
  });

  // 6. Return response with cost breakdown
  return Response.json({
    ...response,
    cost: {
      base_cost_usd: baseCost,
      margin_fee_usd: marginFee,
      total_cost_usd: totalCost
    }
  });
}
```

---

## Compliance & Security

### SOC 2 Type II

**Controls**:
- ✅ Encryption at rest (Supabase handles)
- ✅ Encryption in transit (HTTPS, TLS 1.3)
- ✅ Access controls (RLS, RBAC)
- ✅ Audit logs (immutable, tamper-proof)
- ✅ Data retention policies
- ✅ Incident response plan
- ✅ Vulnerability management

**Evidence**:
- Automated audit log exports (PDF, CSV)
- Access review reports (quarterly)
- Penetration test results (annual)

### ISO 27001

**ISMS (Information Security Management System)**:
- Risk assessment framework
- Security policies documentation
- Incident response procedures
- Business continuity planning

### DORA (Digital Operational Resilience Act)

**Requirements**:
- ✅ ICT risk management
- ✅ Incident reporting (GDPR-aligned)
- ✅ Operational resilience testing
- ✅ Third-party risk management (LLM providers)

**Implementation**:
```typescript
// app/api/v1/compliance/dora-report/route.ts
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  const { orgSlug } = params;

  // Generate DORA compliance report
  const report = {
    organization: orgSlug,
    reporting_period: {
      start: '2025-01-01',
      end: '2025-12-31'
    },
    incidents: await getSecurityIncidents(orgSlug),
    resilience_tests: await getResilienceTests(orgSlug),
    third_party_risks: [
      {
        provider: 'Anthropic',
        service: 'Claude API',
        risk_level: 'low',
        mitigations: ['API key rotation', 'Rate limiting']
      }
    ],
    summary: {
      total_incidents: 2,
      critical_incidents: 0,
      mean_time_to_resolution: '2.5 hours'
    }
  };

  return Response.json(report);
}
```

### GDPR

**Rights**:
1. **Right to Access** (export user data)
2. **Right to Erasure** (soft delete + anonymization)
3. **Right to Portability** (JSON export)
4. **Right to Object** (opt-out of analytics)

**Implementation**:
```typescript
// app/api/v1/gdpr/export/route.ts
export async function POST(request: Request) {
  const user = await getAuthUser(request);

  // Export all user data
  const userData = {
    profile: await getUserProfile(user.id),
    organizations: await getUserOrgs(user.id),
    teams: await getUserTeams(user.id),
    audit_logs: await getUserAuditLogs(user.id),
    conversations: await getUserConversations(user.id),
    usage: await getUserUsage(user.id)
  };

  // Generate PDF report
  const pdf = await generateGDPRExport(userData);

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="gdpr-export.pdf"'
    }
  });
}

// app/api/v1/gdpr/delete/route.ts
export async function POST(request: Request) {
  const user = await getAuthUser(request);

  // Soft delete + anonymize
  await db.transaction(async (tx) => {
    // Anonymize audit logs (keep for compliance)
    await tx.update(auditLogs)
      .set({ user_id: ANONYMOUS_USER_ID })
      .where(eq(auditLogs.user_id, user.id));

    // Soft delete user data
    await tx.update(userProfiles)
      .set({ deleted_at: new Date() })
      .where(eq(userProfiles.id, user.id));

    // Revoke auth
    await revokeUserAuth(user.id);
  });

  return Response.json({ success: true });
}
```

### Audit Trail Tamper-Proofing

```typescript
// Sign audit logs with HMAC
function signAuditLog(log: AuditLogEntry, orgSecret: string): string {
  const payload = JSON.stringify({
    id: log.id,
    user_id: log.user_id,
    action: log.action,
    timestamp: log.timestamp
  });

  return crypto
    .createHmac('sha256', orgSecret)
    .update(payload)
    .digest('hex');
}

// Verify signature
function verifyAuditLog(log: AuditLogEntry, orgSecret: string): boolean {
  const expectedSignature = signAuditLog(log, orgSecret);
  return crypto.timingSafeEqual(
    Buffer.from(log.signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Subscription System

### Configurable Plans

Plans defined in `subscription_plans` table:

```sql
-- Add new plan
INSERT INTO subscription_plans (id, name, price_monthly_usd, features)
VALUES (
  'pro',
  'Professional',
  40,
  '{
    "max_teams": 20,
    "max_members": 100,
    "sso": false,
    "llm_proxy": true,
    "audit_retention_days": 180,
    "support_sla": "email",
    "custom_tools": true,
    "api_access": true
  }'::jsonb
);
```

### Feature Flags

```typescript
// Check if org has feature
function hasFeature(orgId: string, feature: string): boolean {
  const org = getOrganization(orgId);
  return org.features[feature] === true || org.features[feature] > 0;
}

// Usage
if (hasFeature(orgId, 'sso')) {
  // Show SSO settings
}

if (org.features.max_teams !== -1 &&
    currentTeamCount >= org.features.max_teams) {
  throw new Error('Team limit reached. Upgrade to create more teams.');
}
```

### Upgrade Flow

```typescript
// app/api/v1/subscriptions/upgrade/route.ts
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  const { org_slug, plan_id } = await request.json();

  // Get plan
  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.id, plan_id)
  });

  if (!plan) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    customer: org.stripe_customer_id,
    line_items: [{
      price: plan.stripe_price_id,
      quantity: 1
    }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/orgs/${org_slug}/billing/success`,
    cancel_url: `${process.env.APP_URL}/orgs/${org_slug}/billing`
  });

  return Response.json({ checkout_url: session.url });
}
```

---

## Deployment Architecture

### Hetzner Cloud Setup

```yaml
# docker-compose.yml (On-premise or Hetzner)

version: '3.9'

services:
  app:
    image: mimir-teams:latest
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/mimir_teams
      - NEXTAUTH_URL=https://teams.mimir.dev
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=mimir_teams
      - POSTGRES_USER=mimir
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:
```

### Infrastructure

```bash
# Hetzner Cloud Server
# Type: CX51 (8 vCPU, 32GB RAM, 240GB SSD)
# Cost: ~€30/month

# Set up server
ssh root@mimir-teams.hetzner.cloud

# Install Docker
curl -fsSL https://get.docker.com | sh

# Deploy
git clone https://github.com/codedir/mimir-teams.git
cd mimir-teams
cp .env.example .env
# Edit .env with production secrets

docker-compose up -d

# Set up backups (daily to Hetzner Storage Box)
crontab -e
# 0 2 * * * /root/mimir-teams/scripts/backup.sh
```

### Multi-Region (Optional)

```
Primary: Hetzner Germany (eu-central)
Replica: Hetzner Finland (eu-north) (read-only)

PostgreSQL Streaming Replication
→ Automatic failover with patroni
```

---

## Implementation Phases

### Phase 1: Core Backend (2-3 weeks)
- [x] Next.js 16 + Supabase setup
- [ ] Database schema implementation
- [ ] Row-Level Security policies
- [ ] Auth (email/password)
- [ ] Organization CRUD
- [ ] Team CRUD
- [ ] Member management
- [ ] Basic config API (GET /config)

### Phase 2: CLI Integration (1 week)
- [ ] API contracts package (`@codedir/mimir-teams-api-contracts`)
- [ ] Config sync endpoint
- [ ] Audit log sync endpoint (POST)
- [ ] Test CLI ↔ Backend integration

### Phase 3: Configuration Management (1-2 weeks)
- [ ] Org-level config UI
- [ ] Team-level config UI (overrides)
- [ ] Allowlist/blocklist management
- [ ] Model enforcement
- [ ] Agent enforcement
- [ ] Budget settings

### Phase 4: Custom Tools & Commands (2 weeks)
- [ ] Tool upload API
- [ ] Tool compilation service
- [ ] Command management UI
- [ ] Org vs Team scoping
- [ ] Version control

### Phase 5: Audit & Compliance (2 weeks)
- [ ] Audit log viewer (filterable, exportable)
- [ ] Compliance reports (SOC 2, ISO 27001, DORA, GDPR)
- [ ] GDPR export/delete endpoints
- [ ] Audit log retention policies
- [ ] Tamper-proof signatures

### Phase 6: LLM Proxy (2 weeks)
- [ ] Provider abstraction
- [ ] API key management (encrypted)
- [ ] Budget enforcement (real-time)
- [ ] Usage tracking
- [ ] Margin fee calculation
- [ ] Streaming support

### Phase 7: Analytics & Reporting (1-2 weeks)
- [ ] Usage dashboard (per user, team, org)
- [ ] Cost breakdown charts
- [ ] Top expensive calls
- [ ] Model usage distribution
- [ ] Export to CSV/PDF

### Phase 8: Subscriptions & Billing (2 weeks)
- [ ] Subscription plans table
- [ ] Stripe integration
- [ ] Upgrade/downgrade flows
- [ ] Usage-based billing (if applicable)
- [ ] Invoicing

### Phase 9: Enterprise Features (3-4 weeks)
- [ ] SSO/SAML integration
- [ ] Advanced RBAC (custom roles)
- [ ] Separate database per tenant (optional)
- [ ] On-premise deployment docs
- [ ] Approval workflows (Slack integration)

### Phase 10: Shared Conversations (1-2 weeks)
- [ ] Conversation sync API
- [ ] Visibility controls (private/team/org)
- [ ] Conversation viewer UI
- [ ] Search & filters

---

## Next Steps

1. ✅ **Finalize database schema** - Review with team
2. ✅ **Create API contracts package** - `@codedir/mimir-teams-api-contracts`
3. ✅ **Set up Next.js 16 project** - Initialize with Supabase
4. ✅ **Implement Phase 1** - Core backend with auth and CRUD
5. ✅ **Build CLI integration** - Test with mimir-code CLI
6. ✅ **Deploy MVP to Hetzner** - Test on-premise setup
7. ✅ **Beta test with 3-5 companies** - Gather feedback
8. ✅ **Iterate on features** - Based on customer needs

---

## Open Questions

- [ ] Should we support GitHub/GitLab OAuth in addition to email/password?
- [ ] LLM Proxy: Should we support custom LLM endpoints (e.g., self-hosted)?
- [ ] Audit retention: Should we allow orgs to export to external log systems (S3, Datadog)?
- [ ] Pricing: Flat per-seat or usage-based (tokens/cost)?
- [ ] On-premise: Should we provide Kubernetes Helm charts?
