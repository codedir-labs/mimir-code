# Next Steps: Teams Integration Roadmap

**Current Status**: Phase 0-1 Complete ✅
**Next Phase**: Phase 2 - Authentication
**Total Duration**: 6-8 weeks for complete Teams integration

---

## Overview

Phase 0-1 has successfully completed the foundation for Teams integration. All abstractions, interfaces, and infrastructure are in place. This document outlines the complete roadmap for implementing all Teams features across Phases 2-6.

**Quick Links to Detailed Phase Plans**:
- [Phase 2: Authentication](./phase-2-authentication.md) (1-2 weeks)
- [Phase 3: Team Detection](./phase-3-team-detection.md) (1 week)
- [Phase 4: Config Enforcement](./phase-4-config-enforcement.md) (1-2 weeks)
- [Phase 5: LLM Proxy](./phase-5-llm-proxy.md) (2 weeks)
- [Phase 6: Cloud Storage](./phase-6-cloud-storage.md) (2 weeks)

---

## Complete Roadmap Summary

### Phase 2: Authentication (1-2 weeks)

**Goal**: Enable users to authenticate with Teams backend and manage multiple organizations.

**Key Features**:
- Multi-organization authentication (GitHub-like)
- Secure token storage (~/.mimir/auth.json)
- Auto-refresh tokens before expiry
- Commands: `mimir auth login/logout/status`, `mimir orgs list/set`

**Deliverables**:
- AuthManager implementation
- Token refresh logic
- Auth commands
- Session persistence

**See**: [phase-2-authentication.md](./phase-2-authentication.md) for complete details.

---

### Phase 3: Team Detection (1 week)

**Goal**: Auto-detect team from git repository URL.

**Key Features**:
- Parse git remote URLs (GitHub, GitLab, Bitbucket)
- Cache team mappings locally (7-day TTL)
- Support multiple teams per repository
- Commands: `mimir teams current/list/clear-cache`

**Deliverables**:
- GitRepository helper
- WorkspaceTeamDetector implementation
- Team caching system
- Teams commands

**See**: [phase-3-team-detection.md](./phase-3-team-detection.md) for complete details.

---

### Phase 4: Config Enforcement (1-2 weeks)

**Goal**: Load and enforce team configuration from Teams backend.

**Key Features**:
- Fetch team config from API
- Enforce allowed models, providers, tools
- Priority-based config merging (Teams = highest)
- Offline mode with cached config (24h TTL)

**Deliverables**:
- TeamsConfigSource implementation
- Enforcement validation
- Config commands
- Offline mode handling

**See**: [phase-4-config-enforcement.md](./phase-4-config-enforcement.md) for complete details.

---

### Phase 5: LLM Proxy (2 weeks)

**Goal**: Route all LLM calls through Teams backend for budget enforcement and usage tracking.

**Key Features**:
- Proxied LLM provider
- Per-user budget enforcement
- Usage tracking (tokens, cost, requests)
- Streaming support

**Deliverables**:
- ProxiedLLMProvider implementation
- Budget error handling
- Budget monitor
- Usage commands: `mimir usage status/history`

**See**: [phase-5-llm-proxy.md](./phase-5-llm-proxy.md) for complete details.

---

### Phase 6: Cloud Storage & Sync (2 weeks)

**Goal**: Sync conversations and audit logs to Teams backend.

**Key Features**:
- Local-first architecture (no blocking writes)
- Background batch sync (10s intervals)
- Offline mode support
- Conflict resolution (last-write-wins)

**Deliverables**:
- HybridStorageBackend implementation
- Background sync worker
- Sync commands: `mimir sync now/status/retry`
- Sync status indicator

**See**: [phase-6-cloud-storage.md](./phase-6-cloud-storage.md) for complete details.

---

## Implementation Priority

### Must-Have for v1.0 (MVP)
- ✅ Phase 0-1: Foundation (Complete)
- 🔜 Phase 2: Authentication (Next)
- 🔜 Phase 3: Team Detection
- 🔜 Phase 4: Config Enforcement
- 🔜 Phase 5: LLM Proxy

### Nice-to-Have for v1.0
- ⏸️ Phase 6: Cloud Storage (can be v1.1)

### Future Enhancements (v2.0+)
- Phase 7: Real-time collaboration
- Phase 8: Team analytics dashboard
- Phase 9: Custom integrations (Slack, GitHub)
- Phase 10: Advanced security (encryption at rest)

---

## Immediate Next Steps (Phase 2 Focus)

The next logical step is to implement **Phase 2: Authentication**, which enables users to authenticate with Teams and establishes the foundation for all subsequent features.

---

## Phase 2 Goals

Implement complete authentication flow for Teams mode:

1. **Multi-organization authentication** - Support users in multiple Teams organizations
2. **Token management** - Access tokens, refresh tokens, secure storage
3. **Authentication commands** - `mimir auth login/logout/status`
4. **Organization commands** - `mimir orgs list/set/current`
5. **Session persistence** - Survive CLI restarts

---

## Implementation Tasks

### 1. AuthManager Implementation

**File**: `src/core/auth/AuthManager.ts`

Replace `NoOpAuthManager` with real implementation:

```typescript
class AuthManager implements IAuthManager {
  // Token storage in ~/.mimir/auth.json
  // Multi-org context management
  // Token refresh logic
  // Session lifecycle
}
```

**Key Methods**:
- `login(orgSlug: string): Promise<AuthContext>` - Interactive login flow
- `logout(): Promise<void>` - Token invalidation
- `getActiveContext(): Promise<AuthContext | null>` - Current session
- `refreshToken(context: AuthContext): Promise<AuthContext>` - Auto-refresh
- `switchOrganization(orgSlug: string): Promise<void>` - Change active org

**Token Storage**:
- File: `~/.mimir/auth.json`
- Schema:
  ```json
  {
    "activeOrg": "acme-corp",
    "contexts": {
      "acme-corp": {
        "orgSlug": "acme-corp",
        "userId": "user-123",
        "accessToken": "...",
        "refreshToken": "...",
        "expiresAt": 1234567890
      }
    }
  }
  ```

### 2. Auth Commands

**Files**: `src/cli/commands/auth.ts`

Update scaffolded commands with real implementations:

#### `mimir auth login`
- Interactive: Prompt for organization slug
- Open browser for OAuth flow (or device code flow)
- Wait for callback/confirmation
- Store tokens securely
- Set as active organization

#### `mimir auth logout`
- Invalidate tokens via API
- Remove from local storage
- Clear active organization if matches

#### `mimir auth status`
- Show current authentication state
- Display active organization
- Show user info
- Show token expiry
- Indicate local vs Teams mode

### 3. Organization Commands

**Files**: `src/cli/commands/orgs.ts`

#### `mimir orgs list`
- Fetch organizations from API
- Display with table formatting
- Show current org with indicator

#### `mimir orgs set <slug>`
- Switch active organization
- Validate org exists in stored contexts
- Update `~/.mimir/auth.json`

#### `mimir orgs current`
- Show current active organization
- Display org details from API

### 4. Token Refresh Logic

**Background Token Refresh**:
- Check token expiry before each API call
- Auto-refresh if < 5 minutes remaining
- Retry with refresh if access token expired
- Handle refresh token expiry (prompt re-login)

**Retry Logic**:
```typescript
async function withTokenRefresh<T>(
  fn: () => Promise<T>,
  context: AuthContext
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isTokenExpiredError(error)) {
      const newContext = await refreshToken(context);
      return await fn(); // Retry with new token
    }
    throw error;
  }
}
```

### 5. Secure Storage

**Encryption**:
- Encrypt auth.json with user's system keychain (optional for v1)
- Use file permissions 0600 (owner read/write only)
- Never log tokens or sensitive data

**File Structure**:
```
~/.mimir/
├── auth.json          # Encrypted auth contexts
├── config.yml         # User config
└── mimir.db          # Local storage
```

### 6. Integration with ConfigManager

**Update ConfigManager**:
- Check `AuthManager.isAuthenticated()` before loading Teams config
- Pass organization slug to `TeamsConfigSource`
- Handle auth errors gracefully (fallback to local mode)

**Flow**:
1. CLI starts
2. ConfigManager.load() called
3. Check if authenticated
4. If yes: Load Teams config from API
5. If no: Use local config only

### 7. CLI Entry Point Updates

**File**: `src/cli.ts`

- Initialize `AuthManager` (not `NoOpAuthManager`)
- Pass to `ConfigManager` constructor
- Handle authentication errors at startup

### 8. Error Handling

**Common Scenarios**:
- Network unavailable during login
- Invalid organization slug
- Token expired and refresh failed
- User revoked access
- Multiple devices logged in

**User Experience**:
- Clear error messages
- Suggest corrective actions
- Graceful degradation to local mode
- Never lose local data

---

## Testing Strategy

### Unit Tests

**AuthManager Tests** (`tests/unit/core/auth/AuthManager.test.ts`):
- Token storage and retrieval
- Token refresh logic
- Multi-org context switching
- Session expiry handling

**Auth Commands Tests** (`tests/unit/cli/commands/auth.test.ts`):
- Login flow simulation
- Logout behavior
- Status display formatting

### Integration Tests

**End-to-End Auth Flow** (`tests/integration/auth.spec.ts`):
- Full login/logout cycle
- Token refresh on expiry
- Multi-org switching
- Session persistence across CLI restarts

**Mock Backend**:
- Use `MockTeamsAPIClient` for testing
- Simulate token expiry
- Test error scenarios

---

## Dependencies

### New Dependencies (None Required)

All necessary libraries already present:
- HTTP client: Use native `fetch` or existing deps
- JSON storage: Built-in `fs` via `IFileSystem`
- Encryption (optional): `crypto` module

### External Services

**Teams Backend Requirements**:
- `/auth/login` endpoint (OAuth or device code flow)
- `/auth/refresh` endpoint (token refresh)
- `/auth/logout` endpoint (token invalidation)
- `/orgs` endpoint (list organizations)

---

## Success Criteria

Phase 2 is complete when:

- [ ] Users can authenticate with `mimir auth login`
- [ ] Sessions persist across CLI restarts
- [ ] Tokens auto-refresh before expiry
- [ ] Users can switch between multiple orgs
- [ ] `mimir auth status` shows accurate state
- [ ] All auth commands work end-to-end
- [ ] Unit tests pass (80%+ coverage)
- [ ] Integration tests pass
- [ ] Documentation updated
- [ ] Zero breaking changes to local mode

---

## Follow-up Phases

After Phase 2 completes:

**Phase 3: Team Detection**
- Auto-detect team from git remote URL
- Cache team mappings locally
- `mimir teams list/current/clear-cache` commands

**Phase 4: Config Enforcement**
- Load Teams config from API
- Apply enforcement rules (models, tools, policies)
- Offline mode with cached config

**Phase 5: LLM Proxy**
- Route LLM calls through Teams backend
- Budget tracking and quotas
- Usage analytics

**Phase 6: Cloud Storage**
- Sync conversations to Teams backend
- Sync audit logs
- Hybrid storage (local-first with background sync)

---

## Implementation Order

1. **AuthManager** - Core authentication logic (2-3 days)
2. **Auth Commands** - CLI commands for login/logout/status (1-2 days)
3. **Organization Commands** - Org management (1 day)
4. **Token Refresh** - Auto-refresh logic (1 day)
5. **Testing** - Unit + integration tests (2-3 days)
6. **Documentation** - Update docs and examples (1 day)

**Total**: 1-2 weeks for a single developer

---

## Risk Mitigation

**Risk**: Users accidentally log out and lose local data
- **Mitigation**: Local data is independent of auth state. Logout only removes Teams access.

**Risk**: Token refresh fails in the middle of a task
- **Mitigation**: Graceful degradation. Show error, suggest re-login, continue with local mode.

**Risk**: Network unavailable during Teams mode
- **Mitigation**: Use cached config (with TTL). Block after cache expires.

**Risk**: Multiple devices logged in simultaneously
- **Mitigation**: Tokens are device-specific. No conflict.

---

## Open Questions

1. **OAuth vs Device Code Flow?**
   - OAuth: Better UX, requires localhost server
   - Device Code: Works everywhere, slightly more steps
   - **Recommendation**: Start with device code (simpler), add OAuth later

2. **Token Encryption?**
   - Encrypt `auth.json` with system keychain?
   - **Recommendation**: Start with file permissions (0600), add encryption in later phase

3. **Session TTL?**
   - How long should tokens last?
   - **Recommendation**: Access token: 1 hour, Refresh token: 30 days

4. **Offline Mode?**
   - How long to allow offline mode with cached config?
   - **Recommendation**: TTL from Teams backend (configurable per org)

---

## Summary

Phase 2 is the critical next step that unlocks all subsequent Teams features. It establishes the authentication foundation required for:
- Config enforcement
- Team detection
- LLM proxy
- Cloud storage
- Audit logging

Once authentication is complete, the remaining phases can be implemented in parallel by different team members.

**Recommended Action**: Begin Phase 2 implementation immediately. Start with `AuthManager` core logic, then build out commands and testing.
