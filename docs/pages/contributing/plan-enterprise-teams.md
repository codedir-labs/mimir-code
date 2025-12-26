# Enterprise/Teams Support - Overview

> **Note**: This document provides a high-level overview. For detailed implementation plans, see:
> - [Mimir Teams Backend Architecture](./plan-mimir-teams.md) - Next.js + Supabase backend
> - [CLI Teams Integration](./plan-cli-teams-integration.md) - CLI abstractions and integration
> - [API Contracts](./plan-api-contracts.md) - Shared TypeScript types and client

---

## Project Structure

Mimir Teams functionality is split across **three separate projects**:

### 1. `@codedir/mimir-code` (This Repo - CLI)
**Repository**: Current repository (OSS - AGPL-3.0)

**Purpose**: Local-first AI coding agent CLI

**Teams Features**:
- Optional Teams authentication (`mimir teams login`)
- Fetches config from Teams API (if authenticated)
- Syncs audit logs to Teams backend
- Routes LLM requests through Teams proxy (optional)

**See**: [plan-cli-teams-integration.md](./plan-cli-teams-integration.md)

### 2. `@codedir/mimir-teams` (Separate Repo - Backend)
**Repository**: New repository (private or separate license)

**Purpose**: Multi-tenant SaaS backend for enterprise management

**Technology**:
- Next.js 16 (App Router)
- Supabase (PostgreSQL + Auth + RLS)
- Hetzner hosting (on-premise capable)

**Features**:
- Organization and team management
- Hierarchical permissions (org → team → member)
- Config enforcement API
- Audit log storage and compliance reports
- LLM proxy with budget tracking
- Custom tools and commands sharing

**See**: [plan-mimir-teams.md](./plan-mimir-teams.md)

### 3. `@codedir/mimir-teams-api-contracts` (Shared Package)
**Repository**: New npm package

**Purpose**: Shared API types, Zod schemas, and client for type safety

**Used By**:
- CLI (TeamsAPIClient implementation)
- Backend (API route validation)

**See**: [plan-api-contracts.md](./plan-api-contracts.md)

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  @codedir/mimir-code (CLI)                  │
│  • Local-first agent loop                   │
│  • BYOK (Bring Your Own Keys)               │
│  • Platform abstractions (fs, process)      │
│  • Optional Teams integration               │
└──────────────┬──────────────────────────────┘
               │ Uses API Contracts
               │ (REST API, JWT auth)
               ▼
┌─────────────────────────────────────────────┐
│  @codedir/mimir-teams-api-contracts         │
│  • TypeScript types                         │
│  • Zod schemas                              │
│  • Axios-based client                       │
│  • Versioned (v1, v2, ...)                  │
└──────────────┬──────────────────────────────┘
               │ Implements contracts
               ▼
┌─────────────────────────────────────────────┐
│  @codedir/mimir-teams (Backend)             │
│  • Next.js 16 API routes                    │
│  • Supabase (PostgreSQL + RLS)              │
│  • Multi-tenancy (org → team → member)      │
│  • Compliance (SOC 2, ISO 27001, GDPR)      │
│  • LLM Proxy (budget enforcement)           │
│  • Hetzner hosting (on-prem ready)          │
└─────────────────────────────────────────────┘
```

---

## Key Features

### Organizational Hierarchy

```
Organization (e.g., "acme-corp")
  ├─ Owner, Admin, Member, Auditor roles
  ├─ Subscription tier (free, teams, enterprise)
  ├─ Budget limits (monthly)
  ├─ API keys (org-level)
  ├─ Enforcement config (allowed models, tools, etc.)
  │
  └─ Teams (e.g., "frontend-team", "backend-team")
      ├─ Admin, Developer, Viewer roles
      ├─ Team-level budget (subset of org budget)
      ├─ Team-level config overrides
      ├─ Linked repositories/workspaces
      │
      └─ Members
          ├─ Individual budgets
          └─ Permissions scoped to teams
```

### Configuration Enforcement

**Hierarchy** (highest to lowest priority):
1. Default config (hardcoded)
2. **Teams API config** (enforced, cannot override)
3. Global config (`~/.mimir/config.yml`)
4. Project config (`.mimir/config.yml`)
5. Environment variables (`.env`)
6. CLI flags (may be restricted)

**Enforced Settings**:
- Allowed/blocked LLM models
- Allowed/blocked providers
- Required sub-agents (e.g., forced security agent)
- Budget limits
- Global allowlist/blocklist
- Tool restrictions

### Compliance & Security

**SOC 2 Type II**:
- ✅ Audit logs (immutable, tamper-proof)
- ✅ Access controls (RLS, RBAC)
- ✅ Encryption at rest and in transit
- ✅ Incident response procedures

**ISO 27001**:
- ✅ Risk assessment framework
- ✅ Security policies
- ✅ Business continuity planning

**GDPR**:
- ✅ Right to access (data export)
- ✅ Right to erasure (soft delete + anonymization)
- ✅ Right to portability (JSON export)
- ✅ Consent management

**DORA** (Digital Operational Resilience):
- ✅ ICT risk management
- ✅ Incident reporting
- ✅ Third-party risk (LLM providers)

---

## Goals

1. **Centralized Management**: Teams admin can configure tools, allowlists, MCP servers, etc. for entire org
2. **Policy Enforcement**: Enterprise config overrides local settings (users cannot bypass)
3. **Audit & Compliance**: All actions logged to central audit trail with compliance exports
4. **Hierarchical Permissions**: Org → Team → Member with role-based access control
5. **Cost Control**: Organization-level and team-level budgets with quota enforcement
6. **Security**: Optional LLM proxy to hide individual API keys and track usage
7. **On-Premise Support**: Designed for both cloud (Hetzner) and on-prem deployment

---

## Business Model & Pricing

### Target Market
- **Primary**: Mid-size companies (50-500 engineers) with IP concerns
- **Secondary**: Enterprises requiring compliance (finance, healthcare, government)
- **Differentiator**: BYOK + multi-provider + security-first + on-premise

### Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** (OSS CLI) | $0 | Unlimited local usage, BYOK, community support |
| **Teams** | $25/user/month | Shared config, audit logs, compliance exports, email support, up to 25 users |
| **Enterprise** | $50/user/month (min 10 users) | Everything in Teams + SSO/SAML, LLM Proxy, cloud sandboxes, SLA, unlimited teams, on-premise deployment |

### Revenue Projections (Conservative)

**Year 1**:
- 10 enterprise customers × 20 users avg × $50/user = **$120K ARR**

**Year 2**:
- 20 enterprise customers × 20 users avg × $50/user = **$240K ARR**
- 100 teams × 5 users avg × $25/user = **$150K ARR**
- **Total**: **$390K ARR**

### Competitive Landscape

| Tool | Pricing | Limitations |
|------|---------|-------------|
| GitHub Copilot Business | $19/user/month | Microsoft sees your code, OpenAI-only |
| Cursor Team | $40/user/month | Vendor lock-in, cloud-only |
| Tabnine Enterprise | $39/user/month | Limited customization |
| **Mimir Teams** | **$25-50/user/month** | **No code leaves network, multi-provider, on-prem ready** |

---

## Implementation Roadmap

### Phase 1: MVP (6-8 weeks)

**Backend** (`@codedir/mimir-teams`):
- [ ] Next.js 16 + Supabase setup
- [ ] Database schema with RLS policies
- [ ] Auth (email/password)
- [ ] Organization and team CRUD
- [ ] Config API (GET/PUT)
- [ ] Audit log sync API (POST)
- [ ] Basic dashboard (config editor, audit viewer)

**Contracts** (`@codedir/mimir-teams-api-contracts`):
- [ ] TypeScript types + Zod schemas
- [ ] API client with auth interceptors
- [ ] Publish to npm

**CLI** (`@codedir/mimir-code`):
- [ ] Abstraction interfaces (IConfigSource, IStorageBackend, ITeamsAPIClient)
- [ ] TeamsConfigSource + AuthManager
- [ ] `mimir teams login/logout/status` commands
- [ ] Audit log signing (HMAC)
- [ ] Background sync manager

### Phase 2: Core Features (4-6 weeks)

**Backend**:
- [ ] Custom tools and commands management
- [ ] Hierarchical permissions (org/team roles)
- [ ] Budget management (org/team/member budgets)
- [ ] Usage analytics dashboard
- [ ] Compliance reports (SOC 2, GDPR, DORA exports)

**CLI**:
- [ ] HybridStorage (local + cloud sync)
- [ ] Load Teams tools/commands
- [ ] Budget checking before LLM calls
- [ ] Config merging with enforcement

### Phase 3: Advanced Features (4-6 weeks)

**Backend**:
- [ ] LLM Proxy with margin fees
- [ ] SSO/SAML integration
- [ ] Subscription system with Stripe
- [ ] Shared conversation history (permission-based)
- [ ] Multi-tenancy (separate databases per tenant)

**CLI**:
- [ ] ProxiedLLMProvider
- [ ] Conversation sync (if feature enabled)
- [ ] Team context switching

### Phase 4: Enterprise & Compliance (4 weeks)

**Backend**:
- [ ] SOC 2 audit preparation
- [ ] ISO 27001 documentation
- [ ] DORA compliance reports
- [ ] Advanced RBAC (custom roles)
- [ ] On-premise deployment (Docker Compose + Helm charts)
- [ ] Cloud sandbox orchestration

---

## Security & Compliance Checklist

### SOC 2 Type II Requirements
- [ ] Encryption at rest (Supabase default)
- [ ] Encryption in transit (HTTPS, TLS 1.3)
- [ ] Access controls (RLS policies, RBAC)
- [ ] Audit logs (immutable, tamper-proof)
- [ ] Data retention policies
- [ ] Incident response plan
- [ ] Vulnerability management (quarterly pen tests)

### ISO 27001 Requirements
- [ ] Risk assessment framework
- [ ] Security policies (documented)
- [ ] Incident response procedures
- [ ] Business continuity planning
- [ ] Asset management
- [ ] Third-party risk management

### GDPR Requirements
- [ ] Right to access (data export API)
- [ ] Right to erasure (soft delete + anonymization)
- [ ] Right to portability (JSON export)
- [ ] Consent management
- [ ] Data processing agreements (DPA)
- [ ] Privacy policy

### DORA Requirements
- [ ] ICT risk management
- [ ] Incident reporting (aligned with GDPR)
- [ ] Operational resilience testing
- [ ] Third-party risk assessment (LLM providers)

---

## Migration Path

### For Existing Local Users

**No changes required** - Teams integration is opt-in:

```bash
# Continue using Mimir locally (unchanged)
mimir init
mimir chat

# Opt into Teams (when ready)
mimir teams login
# → CLI fetches config from Teams backend
# → Audit logs sync automatically
```

### For New Enterprise Users

```bash
# Install CLI
npm install -g @codedir/mimir-code

# Authenticate with organization
mimir teams login
# Email: user@acme.com
# Password: ********

# Initialize project
mimir init
# → Fetches org/team config from API
# → Creates .mimir/ with enforced settings

# Start coding
mimir chat
```

---

## Next Steps

### Immediate Actions (Week 1)
1. ✅ **Review these plans** - Ensure alignment across all stakeholders
2. ✅ **Set up repositories**:
   - Create `@codedir/mimir-teams` (private repo)
   - Create `@codedir/mimir-teams-api-contracts` (public npm package)
3. ✅ **Initialize projects**:
   - Next.js 16 + Supabase project
   - API contracts package with Zod + TypeScript
4. ✅ **Database design** - Finalize schema, create migrations

### Short-term (Weeks 2-4)
1. ✅ **Build MVP backend** - Auth, org/team CRUD, config API
2. ✅ **Build API contracts** - Types, schemas, client
3. ✅ **Integrate CLI** - Abstractions, TeamsConfigSource, auth commands
4. ✅ **Test full flow** - Login → config fetch → audit sync

### Mid-term (Weeks 5-12)
1. ✅ **Beta testing** - 3-5 companies, gather feedback
2. ✅ **Iterate on features** - Based on user needs
3. ✅ **Build LLM proxy** - Budget enforcement, margin fees
4. ✅ **Add SSO/SAML** - For enterprise customers
5. ✅ **Prepare compliance** - SOC 2, ISO 27001 documentation

### Long-term (Months 4-6)
1. ✅ **SOC 2 audit** - Engage auditor, complete certification
2. ✅ **Launch publicly** - Marketing, sales outreach
3. ✅ **Onboard customers** - 10 enterprise customers by end of Year 1
4. ✅ **Scale infrastructure** - Multi-region, high availability

---

## Open Questions

### Technical
- [ ] Should we support GitHub/GitLab OAuth in addition to email/password?
- [ ] Should LLM Proxy support self-hosted LLM endpoints?
- [ ] Should audit logs export to external systems (S3, Datadog)?
- [ ] Should we provide Kubernetes Helm charts for on-premise?

### Business
- [ ] Pricing: Flat per-seat or usage-based (tokens/cost)?
- [ ] Should Free tier allow Teams features (limited)?
- [ ] Should we offer annual discounts (e.g., 20% off)?
- [ ] Should we build reseller/partner program?

### Compliance
- [ ] Which compliance certifications are table-stakes? (SOC 2, ISO 27001, HIPAA?)
- [ ] Should we pursue FedRAMP for government customers?
- [ ] What data residency requirements do we need to support? (EU, UK, US)

---

## References

- [Mimir Teams Backend Plan](./plan-mimir-teams.md) - Full backend architecture
- [CLI Teams Integration Plan](./plan-cli-teams-integration.md) - CLI abstractions
- [API Contracts Plan](./plan-api-contracts.md) - Shared types and client
- [Tool System Plan](./plan-tools.md) - Custom tools architecture
- [Agent Orchestration Plan](./plan-agent-orchestration.md) - Multi-agent system

---

**Last Updated**: 2025-12-26
