# Mimir Teams API Contracts

**Package**: `@codedir/mimir-teams-api-contracts`

**Purpose**: Shared TypeScript types, Zod schemas, and API client for Mimir Teams backend.

---

## Overview

The API contracts package is a **single source of truth** for the interface between:
- `@codedir/mimir-code` (CLI)
- `@codedir/mimir-teams` (Backend)

This ensures type safety and prevents breaking changes.

---

## Package Structure

```
@codedir/mimir-teams-api-contracts/
├── src/
│   ├── v1/
│   │   ├── types/
│   │   │   ├── auth.ts
│   │   │   ├── organizations.ts
│   │   │   ├── teams.ts
│   │   │   ├── tools.ts
│   │   │   ├── config.ts
│   │   │   ├── audit.ts
│   │   │   ├── llm.ts
│   │   │   ├── conversations.ts
│   │   │   └── index.ts
│   │   ├── schemas/
│   │   │   ├── auth.schema.ts
│   │   │   ├── organizations.schema.ts
│   │   │   ├── teams.schema.ts
│   │   │   ├── tools.schema.ts
│   │   │   ├── config.schema.ts
│   │   │   ├── audit.schema.ts
│   │   │   ├── llm.schema.ts
│   │   │   ├── conversations.schema.ts
│   │   │   └── index.ts
│   │   ├── client/
│   │   │   ├── TeamsAPIClient.ts
│   │   │   ├── endpoints/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── organizations.ts
│   │   │   │   ├── teams.ts
│   │   │   │   ├── tools.ts
│   │   │   │   ├── audit.ts
│   │   │   │   ├── llm.ts
│   │   │   │   └── conversations.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── index.ts (re-exports v1 as default)
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

---

## Type Definitions

### Auth Types

```typescript
// src/v1/types/auth.ts

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  user: UserProfile;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  organization: {
    slug: string;
    name: string;
    role: 'owner' | 'admin' | 'member' | 'auditor';
  };
  active_team?: {
    id: string;
    slug: string;
    name: string;
    role: 'admin' | 'developer' | 'viewer';
  };
}

export interface AuthContext {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  orgSlug: string;
  teamId?: string;
  userId: string;
  userEmail: string;
}
```

### Organization Types

```typescript
// src/v1/types/organizations.ts

export interface Organization {
  id: string;
  slug: string;
  name: string;
  subscription_tier: 'free' | 'teams' | 'enterprise';
  subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled';
  features: SubscriptionFeatures;
  budget?: OrganizationBudget;
}

export interface SubscriptionFeatures {
  max_teams: number; // -1 = unlimited
  max_members: number; // -1 = unlimited
  sso: boolean;
  llm_proxy: boolean;
  audit_retention_days: number;
  support_sla: 'community' | 'email' | 'priority';
  custom_tools: boolean;
  conversation_sync: boolean;
  cloud_sandbox: boolean;
  on_premise: boolean;
  api_access: boolean;
}

export interface OrganizationBudget {
  monthly_usd?: number; // undefined = unlimited
  alert_threshold: number; // 0-1 (e.g., 0.8 = 80%)
  current_usage: number;
}

export interface GetOrganizationConfigRequest {
  org_slug: string;
  team_id?: string; // Optional team context
}

export interface GetOrganizationConfigResponse {
  organization: OrganizationConfig;
  team?: TeamConfig;
}

export interface OrganizationConfig {
  slug: string;
  name: string;
  subscription_tier: 'free' | 'teams' | 'enterprise';
  features: SubscriptionFeatures;
  enforcement: EnforcementConfig;
  budget: OrganizationBudget;
  api_url: string;
}

export interface EnforcementConfig {
  allowed_models: string[]; // ['*'] = all
  blocked_models: string[];
  allowed_providers: string[]; // ['*'] = all
  allowed_sub_agents: string[]; // ['*'] = all
  forced_sub_agents: Record<string, ForcedSubAgent>;
  global_allowlist: string[];
  global_blocklist: string[];
  docker_mode: 'local' | 'cloud' | 'auto';
}

export interface ForcedSubAgent {
  enabled: boolean;
  model: string;
  trigger: 'always' | 'on-write' | 'on-commit' | 'manual';
}
```

### Team Types

```typescript
// src/v1/types/teams.ts

export interface Team {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description?: string;
  budget?: TeamBudget;
  repositories: Repository[];
  member_count: number;
  created_at: string; // ISO 8601
}

export interface TeamBudget {
  monthly_usd?: number;
  percentage?: number; // % of org budget
  current_usage: number;
}

export interface Repository {
  url: string;
  branch: string;
}

export interface TeamConfig {
  id: string;
  slug: string;
  name: string;
  config: TeamConfigOverrides;
}

export interface TeamConfigOverrides {
  allowed_models?: string[]; // Subset of org
  blocked_models?: string[];
  allowed_providers?: string[];
  allowed_sub_agents?: string[];
  forced_sub_agents?: Record<string, ForcedSubAgent>;
  enabled_tools?: string[];
  disabled_tools?: string[];
  team_allowlist?: string[];
  team_blocklist?: string[];
  custom_settings?: Record<string, any>;
}

export interface ListTeamsRequest {
  org_slug: string;
}

export interface ListTeamsResponse {
  teams: Team[];
}
```

### Tool Types

```typescript
// src/v1/types/tools.ts

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  version: string;
  source: 'org' | 'team';
  definition: CustomToolDefinition;
  code: string;
  compiled_code?: string;
  is_active: boolean;
  created_at: string;
}

export interface CustomToolDefinition {
  name: string;
  description: string;
  enabled: boolean;
  tokenCost?: number;
  schema: JSONSchema;
  runtime: 'typescript' | 'node';
  permissions?: {
    allowlist?: string[];
    autoAccept?: boolean;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
}

export interface ListToolsRequest {
  org_slug: string;
  team_id?: string;
}

export interface ListToolsResponse {
  tools: CustomTool[];
}

export interface CustomCommand {
  id: string;
  name: string;
  description: string;
  usage: string;
  source: 'org' | 'team';
  definition: CustomCommandDefinition;
  is_active: boolean;
  created_at: string;
}

export interface CustomCommandDefinition {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  prompt: string;
}

export interface ListCommandsRequest {
  org_slug: string;
  team_id?: string;
}

export interface ListCommandsResponse {
  commands: CustomCommand[];
}
```

### Audit Types

```typescript
// src/v1/types/audit.ts

export interface AuditLogEntry {
  id: string; // Generated by CLI
  team_id?: string;
  user_id: string;
  event_type: string;
  action: string;
  repository?: string;
  branch?: string;
  working_directory?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  approved: boolean;
  approval_method?: 'auto' | 'manual' | 'allowlist' | 'always';
  success?: boolean;
  output?: string; // Truncated
  error_message?: string;
  cli_version?: string;
  ip_address?: string;
  timestamp: string; // ISO 8601
  signature: string; // HMAC
}

export interface SyncAuditLogsRequest {
  org_slug: string;
  logs: AuditLogEntry[];
}

export interface SyncAuditLogsResponse {
  synced_count: number;
  failed_ids: string[];
}

export interface GetAuditLogsRequest {
  org_slug: string;
  team_id?: string;
  user_id?: string;
  event_type?: string;
  start_date?: string; // ISO 8601
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface GetAuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}
```

### LLM Types

```typescript
// src/v1/types/llm.ts

export interface ProxiedChatRequest {
  org_slug: string;
  team_id?: string;
  user_id: string;
  provider: string; // 'anthropic', 'openai', 'deepseek', etc.
  model: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
  max_tokens?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatResponse {
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
  finish_reason: 'stop' | 'length' | 'tool_calls';
}

export interface ChatChunk {
  id: string;
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason?: 'stop' | 'length' | 'tool_calls';
}

export interface BudgetCheckRequest {
  org_slug: string;
  estimated_cost: number;
}

export interface BudgetCheckResponse {
  allowed: boolean;
  reason?: string;
  budget?: {
    monthly_limit: number;
    current_usage: number;
    remaining: number;
  };
}

export interface GetUsageRequest {
  org_slug: string;
  period: 'day' | 'week' | 'month';
}

export interface GetUsageResponse {
  total_cost: number;
  total_tokens: number;
  request_count: number;
  breakdown_by_model: Array<{
    model: string;
    cost: number;
    tokens: number;
    requests: number;
  }>;
  breakdown_by_user: Array<{
    user_id: string;
    user_email: string;
    cost: number;
    tokens: number;
    requests: number;
  }>;
}
```

### Conversation Types

```typescript
// src/v1/types/conversations.ts

export interface Conversation {
  id: string;
  org_id: string;
  team_id?: string;
  user_id: string;
  title?: string;
  visibility: 'private' | 'team' | 'org';
  started_at: string; // ISO 8601
  ended_at?: string;
  total_messages: number;
  total_cost_usd: number;
  total_tokens: number;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokens?: number;
  cost_usd?: number;
  timestamp: string;
}

export interface SyncConversationsRequest {
  org_slug: string;
  conversations: Conversation[];
}

export interface SyncConversationsResponse {
  synced_count: number;
  failed_ids: string[];
}

export interface FetchConversationsRequest {
  org_slug: string;
  team_id?: string;
  user_id?: string;
  since?: string; // ISO 8601
  limit?: number;
  offset?: number;
}

export interface FetchConversationsResponse {
  conversations: Conversation[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## Zod Schemas

All types have corresponding Zod schemas for runtime validation:

```typescript
// src/v1/schemas/auth.schema.ts
import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    full_name: z.string(),
    avatar_url: z.string().url().optional(),
    organization: z.object({
      slug: z.string(),
      name: z.string(),
      role: z.enum(['owner', 'admin', 'member', 'auditor'])
    }),
    active_team: z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      role: z.enum(['admin', 'developer', 'viewer'])
    }).optional()
  })
});

// ... other schemas
```

---

## API Client

### Base Client

```typescript
// src/v1/client/TeamsAPIClient.ts
import axios, { AxiosInstance } from 'axios';
import { AuthEndpoints } from './endpoints/auth.js';
import { OrganizationEndpoints } from './endpoints/organizations.js';
import { TeamEndpoints } from './endpoints/teams.js';
import { ToolEndpoints } from './endpoints/tools.js';
import { AuditEndpoints } from './endpoints/audit.js';
import { LLMEndpoints } from './endpoints/llm.js';
import { ConversationEndpoints } from './endpoints/conversations.js';

export class TeamsAPIClient {
  private http: AxiosInstance;

  public auth: AuthEndpoints;
  public organizations: OrganizationEndpoints;
  public teams: TeamEndpoints;
  public tools: ToolEndpoints;
  public audit: AuditEndpoints;
  public llm: LLMEndpoints;
  public conversations: ConversationEndpoints;

  constructor(
    baseUrl: string,
    private getAccessToken?: () => Promise<string | null>,
    private onTokenExpired?: () => Promise<void>
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor (add auth token)
    this.http.interceptors.request.use(async (config) => {
      if (this.getAccessToken) {
        const token = await this.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // Response interceptor (handle 401)
    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.onTokenExpired) {
          await this.onTokenExpired();
        }
        throw error;
      }
    );

    // Initialize endpoint groups
    this.auth = new AuthEndpoints(this.http);
    this.organizations = new OrganizationEndpoints(this.http);
    this.teams = new TeamEndpoints(this.http);
    this.tools = new ToolEndpoints(this.http);
    this.audit = new AuditEndpoints(this.http);
    this.llm = new LLMEndpoints(this.http);
    this.conversations = new ConversationEndpoints(this.http);
  }

  setTeamContext(teamId?: string): void {
    if (teamId) {
      this.http.defaults.headers['X-Mimir-Team-Id'] = teamId;
    } else {
      delete this.http.defaults.headers['X-Mimir-Team-Id'];
    }
  }
}
```

### Endpoint Groups

```typescript
// src/v1/client/endpoints/auth.ts
import { AxiosInstance } from 'axios';
import {
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse
} from '../../types/auth.js';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshTokenRequestSchema,
  RefreshTokenResponseSchema
} from '../../schemas/auth.schema.js';

export class AuthEndpoints {
  constructor(private http: AxiosInstance) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    // Validate request
    LoginRequestSchema.parse(request);

    const response = await this.http.post<LoginResponse>(
      '/api/v1/auth/login',
      request
    );

    // Validate response
    return LoginResponseSchema.parse(response.data);
  }

  async refreshToken(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    RefreshTokenRequestSchema.parse(request);

    const response = await this.http.post<RefreshTokenResponse>(
      '/api/v1/auth/refresh',
      request
    );

    return RefreshTokenResponseSchema.parse(response.data);
  }

  async logout(): Promise<void> {
    await this.http.post('/api/v1/auth/logout');
  }
}

// src/v1/client/endpoints/organizations.ts
export class OrganizationEndpoints {
  constructor(private http: AxiosInstance) {}

  async getConfig(
    orgSlug: string,
    teamId?: string
  ): Promise<GetOrganizationConfigResponse> {
    const response = await this.http.get<GetOrganizationConfigResponse>(
      `/api/v1/orgs/${orgSlug}/config`,
      {
        headers: teamId ? { 'X-Mimir-Team-Id': teamId } : {}
      }
    );

    return GetOrganizationConfigResponseSchema.parse(response.data);
  }
}

// src/v1/client/endpoints/teams.ts
export class TeamEndpoints {
  constructor(private http: AxiosInstance) {}

  async list(orgSlug: string): Promise<ListTeamsResponse> {
    const response = await this.http.get<ListTeamsResponse>(
      `/api/v1/orgs/${orgSlug}/teams`
    );

    return ListTeamsResponseSchema.parse(response.data);
  }
}

// src/v1/client/endpoints/tools.ts
export class ToolEndpoints {
  constructor(private http: AxiosInstance) {}

  async list(
    orgSlug: string,
    teamId?: string
  ): Promise<ListToolsResponse> {
    const response = await this.http.get<ListToolsResponse>(
      `/api/v1/orgs/${orgSlug}/tools`,
      { params: { team_id: teamId } }
    );

    return ListToolsResponseSchema.parse(response.data);
  }

  async listCommands(
    orgSlug: string,
    teamId?: string
  ): Promise<ListCommandsResponse> {
    const response = await this.http.get<ListCommandsResponse>(
      `/api/v1/orgs/${orgSlug}/commands`,
      { params: { team_id: teamId } }
    );

    return ListCommandsResponseSchema.parse(response.data);
  }
}

// src/v1/client/endpoints/audit.ts
export class AuditEndpoints {
  constructor(private http: AxiosInstance) {}

  async sync(
    orgSlug: string,
    logs: AuditLogEntry[]
  ): Promise<SyncAuditLogsResponse> {
    const request: SyncAuditLogsRequest = { org_slug: orgSlug, logs };

    SyncAuditLogsRequestSchema.parse(request);

    const response = await this.http.post<SyncAuditLogsResponse>(
      `/api/v1/orgs/${orgSlug}/audit/sync`,
      request
    );

    return SyncAuditLogsResponseSchema.parse(response.data);
  }

  async get(
    orgSlug: string,
    params?: Omit<GetAuditLogsRequest, 'org_slug'>
  ): Promise<GetAuditLogsResponse> {
    const response = await this.http.get<GetAuditLogsResponse>(
      `/api/v1/orgs/${orgSlug}/audit`,
      { params }
    );

    return GetAuditLogsResponseSchema.parse(response.data);
  }
}

// src/v1/client/endpoints/llm.ts
export class LLMEndpoints {
  constructor(private http: AxiosInstance) {}

  async chat(request: ProxiedChatRequest): Promise<ChatResponse> {
    ProxiedChatRequestSchema.parse(request);

    const response = await this.http.post<ChatResponse>(
      '/api/v1/llm/chat',
      request
    );

    return ChatResponseSchema.parse(response.data);
  }

  async *streamChat(request: ProxiedChatRequest): AsyncGenerator<ChatChunk> {
    ProxiedChatRequestSchema.parse(request);

    const response = await this.http.post(
      '/api/v1/llm/chat/stream',
      request,
      { responseType: 'stream' }
    );

    for await (const chunk of response.data) {
      const parsed = JSON.parse(chunk.toString());
      yield ChatChunkSchema.parse(parsed);
    }
  }

  async checkBudget(
    orgSlug: string,
    estimatedCost: number
  ): Promise<BudgetCheckResponse> {
    const request: BudgetCheckRequest = { org_slug: orgSlug, estimated_cost: estimatedCost };

    const response = await this.http.post<BudgetCheckResponse>(
      `/api/v1/orgs/${orgSlug}/budget/check`,
      request
    );

    return BudgetCheckResponseSchema.parse(response.data);
  }

  async getUsage(
    orgSlug: string,
    period: 'day' | 'week' | 'month'
  ): Promise<GetUsageResponse> {
    const response = await this.http.get<GetUsageResponse>(
      `/api/v1/orgs/${orgSlug}/usage`,
      { params: { period } }
    );

    return GetUsageResponseSchema.parse(response.data);
  }
}

// src/v1/client/endpoints/conversations.ts
export class ConversationEndpoints {
  constructor(private http: AxiosInstance) {}

  async sync(
    orgSlug: string,
    conversations: Conversation[]
  ): Promise<SyncConversationsResponse> {
    const request: SyncConversationsRequest = { org_slug: orgSlug, conversations };

    const response = await this.http.post<SyncConversationsResponse>(
      `/api/v1/orgs/${orgSlug}/conversations/sync`,
      request
    );

    return SyncConversationsResponseSchema.parse(response.data);
  }

  async fetch(
    orgSlug: string,
    params?: Omit<FetchConversationsRequest, 'org_slug'>
  ): Promise<FetchConversationsResponse> {
    const response = await this.http.get<FetchConversationsResponse>(
      `/api/v1/orgs/${orgSlug}/conversations`,
      { params }
    );

    return FetchConversationsResponseSchema.parse(response.data);
  }
}
```

---

## Usage Examples

### CLI Usage

```typescript
// In @codedir/mimir-code
import { TeamsAPIClient } from '@codedir/mimir-teams-api-contracts';

const client = new TeamsAPIClient(
  'https://teams.mimir.dev',
  async () => {
    // Get token from auth manager
    const auth = await authManager.getAuth();
    return auth?.accessToken || null;
  },
  async () => {
    // Token expired, try refresh
    await authManager.refreshToken();
  }
);

// Login
const loginResult = await client.auth.login({
  email: 'user@acme.com',
  password: 'password123'
});

// Get org config
const config = await client.organizations.getConfig('acme-corp');

// Sync audit logs
await client.audit.sync('acme-corp', [
  {
    id: 'log-1',
    user_id: 'user-123',
    event_type: 'command_executed',
    action: 'git push origin main',
    risk_level: 'medium',
    approved: true,
    timestamp: new Date().toISOString(),
    signature: 'hmac-signature'
  }
]);

// Chat via proxy
const response = await client.llm.chat({
  org_slug: 'acme-corp',
  user_id: 'user-123',
  provider: 'anthropic',
  model: 'claude-sonnet-4.5',
  messages: [
    { role: 'user', content: 'Hello, Claude!' }
  ]
});
```

### Backend Usage

```typescript
// In @codedir/mimir-teams (Next.js API route)
import { LoginRequestSchema, LoginResponseSchema } from '@codedir/mimir-teams-api-contracts';

export async function POST(request: Request) {
  const body = await request.json();

  // Validate request
  const loginRequest = LoginRequestSchema.parse(body);

  // Authenticate
  const user = await authenticate(loginRequest.email, loginRequest.password);

  // Create response
  const response: LoginResponse = {
    access_token: generateJWT(user),
    refresh_token: generateRefreshToken(user),
    expires_in: 900, // 15 minutes
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      organization: {
        slug: user.organization.slug,
        name: user.organization.name,
        role: user.organization_role
      },
      active_team: user.active_team
    }
  };

  // Validate response (ensures we're returning correct shape)
  LoginResponseSchema.parse(response);

  return Response.json(response);
}
```

---

## Versioning Strategy

### Major Version (Breaking Changes)

Increment when:
- Removing fields from responses
- Changing field types
- Renaming endpoints
- Changing required fields

Example:
- v1: `{ email: string }`
- v2: `{ email_address: string }` ← Breaking change

### Minor Version (Additions)

Increment when:
- Adding new endpoints
- Adding optional fields to requests
- Adding new fields to responses

Example:
- v1.0: `{ email: string }`
- v1.1: `{ email: string, phone?: string }` ← Non-breaking

### Patch Version (Fixes)

Increment when:
- Fixing bugs in validation
- Updating documentation
- Internal refactoring

---

## Publishing

```bash
# Build
npm run build

# Test
npm run test

# Publish to npm
npm publish --access public

# Tag release
git tag v1.0.0
git push --tags
```

### package.json

```json
{
  "name": "@codedir/mimir-teams-api-contracts",
  "version": "1.0.0",
  "description": "Shared API contracts for Mimir Teams",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\""
  },
  "dependencies": {
    "axios": "^1.7.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/codedir/mimir-teams-api-contracts.git"
  },
  "license": "MIT"
}
```

---

## Testing

```typescript
// tests/client.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TeamsAPIClient } from '../src/v1/client/TeamsAPIClient.js';
import { mockServer } from './mocks/server.js';

describe('TeamsAPIClient', () => {
  let client: TeamsAPIClient;

  beforeEach(() => {
    client = new TeamsAPIClient('http://localhost:3000');
  });

  it('should login successfully', async () => {
    const response = await client.auth.login({
      email: 'test@example.com',
      password: 'password123'
    });

    expect(response.access_token).toBeDefined();
    expect(response.user.email).toBe('test@example.com');
  });

  it('should validate response schema', async () => {
    // Mock returns invalid response
    mockServer.use(
      http.post('/api/v1/auth/login', () => {
        return HttpResponse.json({
          // Missing required fields
          access_token: 'token'
        });
      })
    );

    await expect(
      client.auth.login({
        email: 'test@example.com',
        password: 'password123'
      })
    ).rejects.toThrow('Validation error');
  });
});
```

---

## Migration Guide

### From v1.x to v2.x (Future)

When breaking changes are needed:

1. **Publish v2 as separate package version**
2. **Maintain v1 for 6 months** (security fixes only)
3. **Provide migration guide**:

```typescript
// v1
const config = await client.getOrgConfig('acme-corp');

// v2
const config = await client.organizations.getConfig('acme-corp');
```

4. **CLI supports both versions** (for transition period)
5. **Backend maintains both API versions** (`/api/v1/...`, `/api/v2/...`)

---

## Next Steps

1. ✅ **Initialize package** - Set up repo, package.json
2. ✅ **Define core types** - Auth, Organizations, Teams
3. ✅ **Add Zod schemas** - Runtime validation
4. ✅ **Build API client** - Axios-based client
5. ✅ **Write tests** - Unit tests for client
6. ✅ **Publish to npm** - Make available to CLI and backend
7. ✅ **Integrate with CLI** - Use in TeamsAPIClient
8. ✅ **Integrate with backend** - Use in API routes

---

## Open Questions

- [ ] Should we generate OpenAPI spec from Zod schemas automatically?
- [ ] Should we provide a mock server for testing?
- [ ] Should we support custom base URLs per environment (dev, staging, prod)?
- [ ] Should we add retry logic to the client (exponential backoff)?
- [ ] Should we support request/response interceptors (for logging, metrics)?
