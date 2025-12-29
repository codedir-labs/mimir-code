# Phase 2: Authentication Implementation

**Status**: Ready for Implementation
**Estimated Duration**: 1-2 weeks
**Prerequisites**: Phase 0-1 Complete ✅

---

## Table of Contents

1. [Overview](#overview)
2. [Goals](#goals)
3. [Architecture](#architecture)
4. [Implementation Tasks](#implementation-tasks)
5. [API Contracts](#api-contracts)
6. [Security](#security)
7. [Testing Strategy](#testing-strategy)
8. [Success Criteria](#success-criteria)

---

## Overview

Phase 2 implements complete authentication infrastructure for Teams mode, enabling users to:
- Authenticate with Teams backend
- Manage multiple organization contexts
- Switch between organizations
- Persist sessions across CLI restarts
- Auto-refresh tokens before expiry

**Key Principle**: Authentication is the gateway to all Teams features. Once authenticated, users gain access to centralized config, shared tools, and enterprise features.

---

## Goals

### Primary Goals
1. ✅ Implement multi-organization authentication
2. ✅ Secure token storage with refresh logic
3. ✅ Auth commands (`login`, `logout`, `status`)
4. ✅ Organization management commands
5. ✅ Session persistence across restarts

### Secondary Goals
1. ✅ Support device code flow (browser-based OAuth)
2. ✅ Handle token expiry gracefully
3. ✅ Support multiple simultaneous organizations
4. ✅ Provide clear auth status feedback

### Non-Goals (Future Phases)
- ❌ Team detection (Phase 3)
- ❌ Config enforcement (Phase 4)
- ❌ LLM proxy (Phase 5)
- ❌ Cloud storage sync (Phase 6)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Entry                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       AuthManager                            │
│  - login(orgSlug)                                            │
│  - logout()                                                  │
│  - getActiveContext()                                        │
│  - refreshToken()                                            │
│  - switchOrganization()                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Token Storage                             │
│  File: ~/.mimir/auth.json                                   │
│  Format: { activeOrg, contexts: {...} }                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Teams API Client                           │
│  - POST /auth/login                                          │
│  - POST /auth/refresh                                        │
│  - POST /auth/logout                                         │
│  - GET /orgs                                                 │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Login Flow
```
User: mimir auth login
  │
  ├─> AuthManager.login()
  │   │
  │   ├─> Prompt for credentials
  │   │   (email/password or device code)
  │   │
  │   ├─> TeamsAPIClient.auth.login()
  │   │   (POST /auth/login)
  │   │
  │   ├─> Receive: { orgs: [...], token }
  │   │
  │   ├─> Prompt user to select org
  │   │
  │   ├─> Save to ~/.mimir/auth.json
  │   │   {
  │   │     "activeOrg": "acme-corp",
  │   │     "contexts": {
  │   │       "acme-corp": {
  │   │         "orgSlug": "acme-corp",
  │   │         "userId": "user-123",
  │   │         "accessToken": "...",
  │   │         "refreshToken": "...",
  │   │         "expiresAt": 1234567890
  │   │       }
  │   │     }
  │   │   }
  │   │
  │   └─> Return AuthContext
  │
  └─> Display success message
```

#### Token Refresh Flow
```
Before API call:
  │
  ├─> AuthManager.getActiveContext()
  │   │
  │   ├─> Check token expiry
  │   │   if (expiresAt - now) < 5 minutes:
  │   │
  │   └─> AuthManager.refreshToken()
  │       │
  │       ├─> POST /auth/refresh
  │       │   { refreshToken }
  │       │
  │       ├─> Receive new tokens
  │       │
  │       └─> Update ~/.mimir/auth.json
  │
  └─> Proceed with API call
```

---

## Implementation Tasks

### Task 1: AuthManager Core Implementation

**File**: `src/core/auth/AuthManager.ts`

**Interface**:
```typescript
export interface AuthContext {
  orgSlug: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  email?: string;
}

export interface AuthStorage {
  activeOrg: string | null;
  contexts: Record<string, AuthContext>;
}

export class AuthManager implements IAuthManager {
  constructor(
    private fs: IFileSystem,
    private teamsClient: ITeamsAPIClient
  ) {}

  async login(credentials: LoginCredentials): Promise<AuthContext>;
  async logout(): Promise<void>;
  async getActiveContext(): Promise<AuthContext | null>;
  async refreshToken(context: AuthContext): Promise<AuthContext>;
  async switchOrganization(orgSlug: string): Promise<void>;
  async isAuthenticated(): Promise<boolean>;

  private async loadStorage(): Promise<AuthStorage>;
  private async saveStorage(storage: AuthStorage): Promise<void>;
  private getStoragePath(): string;
}
```

**Implementation Steps**:

1. **Token Storage** (Day 1)
   ```typescript
   private getStoragePath(): string {
     return path.join(os.homedir(), '.mimir', 'auth.json');
   }

   private async loadStorage(): Promise<AuthStorage> {
     const storagePath = this.getStoragePath();

     if (!(await this.fs.exists(storagePath))) {
       return { activeOrg: null, contexts: {} };
     }

     const content = await this.fs.readFile(storagePath);
     return JSON.parse(content);
   }

   private async saveStorage(storage: AuthStorage): Promise<void> {
     const storagePath = this.getStoragePath();
     const dir = path.dirname(storagePath);

     if (!(await this.fs.exists(dir))) {
       await this.fs.mkdir(dir, { recursive: true });
     }

     await this.fs.writeFile(
       storagePath,
       JSON.stringify(storage, null, 2)
     );

     // Set file permissions (owner read/write only)
     if (process.platform !== 'win32') {
       await this.fs.chmod(storagePath, 0o600);
     }
   }
   ```

2. **Login Implementation** (Day 1-2)
   ```typescript
   async login(credentials: LoginCredentials): Promise<AuthContext> {
     // Call Teams API
     const response = await this.teamsClient.auth.login({
       email: credentials.email,
       password: credentials.password,
     });

     // User selects organization (if multiple)
     const selectedOrg = response.organizations.length === 1
       ? response.organizations[0]
       : await this.promptOrganizationSelection(response.organizations);

     // Create auth context
     const context: AuthContext = {
       orgSlug: selectedOrg.slug,
       userId: response.userId,
       accessToken: response.accessToken,
       refreshToken: response.refreshToken,
       expiresAt: Date.now() + response.expiresIn * 1000,
       email: credentials.email,
     };

     // Save to storage
     const storage = await this.loadStorage();
     storage.activeOrg = selectedOrg.slug;
     storage.contexts[selectedOrg.slug] = context;
     await this.saveStorage(storage);

     logger.info('Authentication successful', {
       orgSlug: selectedOrg.slug,
       userId: response.userId,
     });

     return context;
   }
   ```

3. **Token Refresh** (Day 2)
   ```typescript
   async refreshToken(context: AuthContext): Promise<AuthContext> {
     logger.debug('Refreshing access token', {
       orgSlug: context.orgSlug,
     });

     const response = await this.teamsClient.auth.refresh({
       refreshToken: context.refreshToken,
     });

     const newContext: AuthContext = {
       ...context,
       accessToken: response.accessToken,
       refreshToken: response.refreshToken,
       expiresAt: Date.now() + response.expiresIn * 1000,
     };

     // Update storage
     const storage = await this.loadStorage();
     storage.contexts[context.orgSlug] = newContext;
     await this.saveStorage(storage);

     return newContext;
   }

   async getActiveContext(): Promise<AuthContext | null> {
     const storage = await this.loadStorage();

     if (!storage.activeOrg) {
       return null;
     }

     const context = storage.contexts[storage.activeOrg];
     if (!context) {
       return null;
     }

     // Auto-refresh if expiring soon (< 5 minutes)
     const timeUntilExpiry = context.expiresAt - Date.now();
     if (timeUntilExpiry < 5 * 60 * 1000) {
       try {
         return await this.refreshToken(context);
       } catch (error) {
         logger.warn('Token refresh failed', { error });
         // Return expired context, let caller handle
         return context;
       }
     }

     return context;
   }
   ```

4. **Logout** (Day 2)
   ```typescript
   async logout(): Promise<void> {
     const storage = await this.loadStorage();

     if (!storage.activeOrg) {
       throw new Error('Not authenticated');
     }

     const context = storage.contexts[storage.activeOrg];

     // Call backend to invalidate token
     try {
       await this.teamsClient.auth.logout({
         accessToken: context.accessToken,
       });
     } catch (error) {
       logger.warn('Failed to invalidate token on backend', { error });
       // Continue with local logout anyway
     }

     // Remove from storage
     delete storage.contexts[storage.activeOrg];

     // If no more contexts, clear active org
     if (Object.keys(storage.contexts).length === 0) {
       storage.activeOrg = null;
     } else {
       // Set first remaining org as active
       storage.activeOrg = Object.keys(storage.contexts)[0];
     }

     await this.saveStorage(storage);

     logger.info('Logged out successfully');
   }
   ```

5. **Organization Switching** (Day 2)
   ```typescript
   async switchOrganization(orgSlug: string): Promise<void> {
     const storage = await this.loadStorage();

     if (!storage.contexts[orgSlug]) {
       throw new Error(`Not authenticated to organization: ${orgSlug}`);
     }

     storage.activeOrg = orgSlug;
     await this.saveStorage(storage);

     logger.info('Switched organization', { orgSlug });
   }

   async isAuthenticated(): Promise<boolean> {
     const context = await this.getActiveContext();
     return context !== null && context.expiresAt > Date.now();
   }
   ```

### Task 2: Auth Commands Implementation

**Files**:
- `src/cli/commands/auth.ts` (update existing)
- `src/cli/commands/orgs.ts` (update existing)

#### `mimir auth login`

```typescript
async function loginCommand(): Promise<void> {
  const authManager = getAuthManager(); // From DI container

  // Prompt for credentials
  const email = await input({
    message: 'Email:',
    validate: (value) => {
      if (!value.includes('@')) {
        return 'Please enter a valid email';
      }
      return true;
    },
  });

  const password = await password({
    message: 'Password:',
    mask: '*',
  });

  try {
    console.log('\nAuthenticating...');

    const context = await authManager.login({ email, password });

    console.log(chalk.green('\n✓ Authentication successful'));
    console.log(`\nOrganization: ${chalk.bold(context.orgSlug)}`);
    console.log(`User ID: ${context.userId}`);

  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error(chalk.red('\n✗ Authentication failed'));
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
```

#### `mimir auth status`

```typescript
async function statusCommand(): Promise<void> {
  const authManager = getAuthManager();

  const context = await authManager.getActiveContext();

  if (!context) {
    console.log(chalk.yellow('Status: Not authenticated'));
    console.log('\nRun `mimir auth login` to authenticate');
    return;
  }

  const expiresIn = Math.floor((context.expiresAt - Date.now()) / 1000 / 60);

  console.log(chalk.green('Status: Authenticated'));
  console.log(`\nOrganization: ${chalk.bold(context.orgSlug)}`);
  console.log(`User ID: ${context.userId}`);
  console.log(`Email: ${context.email || 'N/A'}`);
  console.log(`Token expires in: ${expiresIn} minutes`);
}
```

#### `mimir auth logout`

```typescript
async function logoutCommand(): Promise<void> {
  const authManager = getAuthManager();

  const confirmed = await confirm({
    message: 'Are you sure you want to logout?',
    default: false,
  });

  if (!confirmed) {
    console.log('Logout cancelled');
    return;
  }

  try {
    await authManager.logout();
    console.log(chalk.green('\n✓ Logged out successfully'));
  } catch (error) {
    console.error(chalk.red('\n✗ Logout failed'));
    console.error(error.message);
    process.exit(1);
  }
}
```

#### `mimir orgs list`

```typescript
async function listOrgsCommand(): Promise<void> {
  const authManager = getAuthManager();
  const storage = await authManager.loadStorage(); // Make this public

  if (Object.keys(storage.contexts).length === 0) {
    console.log(chalk.yellow('No organizations'));
    console.log('\nRun `mimir auth login` to authenticate');
    return;
  }

  console.log('\nOrganizations:\n');

  for (const [orgSlug, context] of Object.entries(storage.contexts)) {
    const isActive = orgSlug === storage.activeOrg;
    const indicator = isActive ? chalk.green('●') : ' ';
    const name = isActive ? chalk.bold(orgSlug) : orgSlug;

    console.log(`  ${indicator} ${name}`);
    console.log(`    User: ${context.userId}`);
    console.log(`    Email: ${context.email || 'N/A'}`);
    console.log();
  }
}
```

#### `mimir orgs set <slug>`

```typescript
async function setOrgCommand(orgSlug: string): Promise<void> {
  const authManager = getAuthManager();

  try {
    await authManager.switchOrganization(orgSlug);
    console.log(chalk.green(`\n✓ Switched to ${chalk.bold(orgSlug)}`));
  } catch (error) {
    console.error(chalk.red(`\n✗ Failed to switch organization`));
    console.error(error.message);
    process.exit(1);
  }
}
```

### Task 3: Device Code Flow (Optional Enhancement)

**Alternative to password-based login**:

```typescript
async function deviceCodeLogin(): Promise<AuthContext> {
  // Request device code
  const deviceCodeResponse = await this.teamsClient.auth.requestDeviceCode({
    clientId: 'mimir-cli',
  });

  console.log('\nTo authenticate, visit:');
  console.log(chalk.bold.cyan(deviceCodeResponse.verificationUri));
  console.log('\nAnd enter code:');
  console.log(chalk.bold.green(deviceCodeResponse.userCode));
  console.log('\nWaiting for authentication...');

  // Poll for completion
  const interval = deviceCodeResponse.interval || 5;
  const expiresAt = Date.now() + deviceCodeResponse.expiresIn * 1000;

  while (Date.now() < expiresAt) {
    await sleep(interval * 1000);

    try {
      const tokenResponse = await this.teamsClient.auth.pollDeviceCode({
        deviceCode: deviceCodeResponse.deviceCode,
      });

      if (tokenResponse.status === 'completed') {
        // Success! Create context
        return this.createContextFromTokenResponse(tokenResponse);
      }
    } catch (error) {
      if (error.code === 'authorization_pending') {
        // Still waiting, continue polling
        continue;
      }
      throw error;
    }
  }

  throw new Error('Device code expired');
}
```

### Task 4: Integration with CLI Entry Point

**File**: `src/cli.ts`

```typescript
// Update DI container initialization
async function initializeDependencies(): Promise<Container> {
  const container = new Container();

  // Platform abstractions
  const fs = new FileSystemAdapter();
  const processExecutor = new ProcessExecutorAdapter();

  // Auth & Teams (conditional on environment)
  const teamsApiUrl = process.env.MIMIR_TEAMS_API_URL;
  const teamsClient = teamsApiUrl
    ? new TeamsAPIClient(teamsApiUrl)
    : null;

  const authManager = teamsClient
    ? new AuthManager(fs, teamsClient)
    : new NoOpAuthManager();

  // Storage backend
  const storageBackend = new LocalStorageBackend(fs);

  // Config manager
  const configManager = new ConfigManager(
    fs,
    authManager,
    storageBackend,
    teamsClient
  );

  // Register in container
  container.register('fs', fs);
  container.register('processExecutor', processExecutor);
  container.register('authManager', authManager);
  container.register('teamsClient', teamsClient);
  container.register('configManager', configManager);

  return container;
}
```

---

## API Contracts

### POST /auth/login

**Request**:
```typescript
interface LoginRequest {
  email: string;
  password: string;
}
```

**Response**:
```typescript
interface LoginResponse {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // Seconds
  organizations: Array<{
    slug: string;
    name: string;
    role: 'owner' | 'admin' | 'member';
  }>;
}
```

### POST /auth/refresh

**Request**:
```typescript
interface RefreshRequest {
  refreshToken: string;
}
```

**Response**:
```typescript
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
```

### POST /auth/logout

**Request**:
```typescript
interface LogoutRequest {
  accessToken: string;
}
```

**Response**:
```typescript
interface LogoutResponse {
  success: boolean;
}
```

### GET /orgs

**Headers**:
```
Authorization: Bearer <accessToken>
```

**Response**:
```typescript
interface OrganizationsResponse {
  organizations: Array<{
    slug: string;
    name: string;
    role: 'owner' | 'admin' | 'member';
    settings: {
      budgetEnabled: boolean;
      teamsEnabled: boolean;
    };
  }>;
}
```

---

## Security

### Token Storage Security

1. **File Permissions**:
   ```typescript
   // Unix: Set to 0600 (owner read/write only)
   await this.fs.chmod(authPath, 0o600);

   // Windows: Use ACLs (future enhancement)
   ```

2. **Encryption** (Optional for v1):
   ```typescript
   import { createCipheriv, createDecipheriv } from 'crypto';

   // Derive key from system keychain
   const key = await getKeychainKey();

   function encrypt(data: string): string {
     const cipher = createCipheriv('aes-256-gcm', key, iv);
     return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
   }
   ```

3. **Never Log Tokens**:
   ```typescript
   // Bad
   logger.info('Token received', { token: accessToken });

   // Good
   logger.info('Token received', { tokenLength: accessToken.length });
   ```

### Network Security

1. **HTTPS Only**:
   ```typescript
   if (!apiUrl.startsWith('https://')) {
     throw new Error('Teams API must use HTTPS');
   }
   ```

2. **Certificate Validation**:
   ```typescript
   const agent = new https.Agent({
     rejectUnauthorized: true, // Never disable in production
   });
   ```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/core/auth/AuthManager.test.ts`

```typescript
describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockFs: IFileSystem;
  let mockTeamsClient: ITeamsAPIClient;

  beforeEach(() => {
    mockFs = createMockFileSystem();
    mockTeamsClient = createMockTeamsClient();
    authManager = new AuthManager(mockFs, mockTeamsClient);
  });

  describe('login', () => {
    it('should save auth context to storage', async () => {
      const credentials = {
        email: 'alice@example.com',
        password: 'password123',
      };

      mockTeamsClient.auth.login.mockResolvedValue({
        userId: 'user-123',
        accessToken: 'token-abc',
        refreshToken: 'refresh-xyz',
        expiresIn: 3600,
        organizations: [{ slug: 'acme', name: 'Acme Corp', role: 'member' }],
      });

      const context = await authManager.login(credentials);

      expect(context.orgSlug).toBe('acme');
      expect(context.userId).toBe('user-123');

      // Verify storage
      const storage = JSON.parse(
        await mockFs.readFile('~/.mimir/auth.json')
      );
      expect(storage.activeOrg).toBe('acme');
      expect(storage.contexts['acme']).toBeDefined();
    });

    it('should prompt for org selection when multiple orgs', async () => {
      // Test implementation
    });

    it('should handle authentication failure', async () => {
      mockTeamsClient.auth.login.mockRejectedValue(
        new Error('Invalid credentials')
      );

      await expect(
        authManager.login({ email: 'bad@example.com', password: 'wrong' })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('refreshToken', () => {
    it('should update tokens in storage', async () => {
      // Test implementation
    });

    it('should handle refresh failure', async () => {
      // Test implementation
    });
  });

  describe('getActiveContext', () => {
    it('should auto-refresh expiring tokens', async () => {
      // Mock context that expires in 2 minutes
      const expiringContext = {
        orgSlug: 'acme',
        userId: 'user-123',
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 2 * 60 * 1000,
      };

      await mockFs.writeFile(
        '~/.mimir/auth.json',
        JSON.stringify({
          activeOrg: 'acme',
          contexts: { acme: expiringContext },
        })
      );

      mockTeamsClient.auth.refresh.mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const context = await authManager.getActiveContext();

      expect(context.accessToken).toBe('new-token');
      expect(mockTeamsClient.auth.refresh).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should remove context from storage', async () => {
      // Test implementation
    });

    it('should call backend logout endpoint', async () => {
      // Test implementation
    });
  });
});
```

### Integration Tests

**File**: `tests/integration/auth-flow.spec.ts`

```typescript
describe('Authentication Flow', () => {
  it('should complete full login-logout cycle', async () => {
    // 1. Start not authenticated
    const authManager = new AuthManager(fs, teamsClient);
    expect(await authManager.isAuthenticated()).toBe(false);

    // 2. Login
    const context = await authManager.login({
      email: 'test@example.com',
      password: 'password',
    });
    expect(context).toBeDefined();

    // 3. Verify authenticated
    expect(await authManager.isAuthenticated()).toBe(true);

    // 4. Logout
    await authManager.logout();

    // 5. Verify not authenticated
    expect(await authManager.isAuthenticated()).toBe(false);
  });

  it('should persist session across CLI restarts', async () => {
    // Test implementation
  });

  it('should handle token refresh during long session', async () => {
    // Test implementation
  });
});
```

---

## Success Criteria

Phase 2 is complete when:

- [ ] **AuthManager fully implemented**
  - [ ] Login with multi-org support
  - [ ] Logout with backend invalidation
  - [ ] Token refresh logic
  - [ ] Organization switching
  - [ ] Session persistence

- [ ] **Auth commands working end-to-end**
  - [ ] `mimir auth login` - interactive login
  - [ ] `mimir auth logout` - clean logout
  - [ ] `mimir auth status` - show current status
  - [ ] `mimir orgs list` - list all orgs
  - [ ] `mimir orgs set <slug>` - switch org

- [ ] **Token management**
  - [ ] Tokens stored securely (file permissions)
  - [ ] Auto-refresh before expiry (< 5 min)
  - [ ] Handle refresh failures gracefully
  - [ ] Support multiple orgs simultaneously

- [ ] **Testing**
  - [ ] Unit tests: 80%+ coverage for AuthManager
  - [ ] Integration tests: Full auth flow
  - [ ] Manual testing: All commands work

- [ ] **Documentation**
  - [ ] Update README with auth commands
  - [ ] API documentation complete
  - [ ] User guide for multi-org setup

- [ ] **Zero breaking changes**
  - [ ] Local mode unaffected
  - [ ] All existing tests pass
  - [ ] No TypeScript errors

---

## Timeline

**Week 1**:
- Day 1-2: AuthManager core (token storage, login, refresh)
- Day 3: Auth commands (login, logout, status)
- Day 4: Organization commands (list, set)
- Day 5: Testing and bug fixes

**Week 2**:
- Day 6-7: Integration tests
- Day 8: Security review and hardening
- Day 9: Documentation
- Day 10: Code review and final testing

---

## Next Phase

After Phase 2 completes → **Phase 3: Team Detection**
- Auto-detect team from git remote URL
- Cache team mappings locally
- Handle multi-team repositories
