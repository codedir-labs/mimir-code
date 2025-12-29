# Mocking Strategy for Teams Integration

**Status**: Development (Backend Not Implemented Yet)
**Created**: 2025-12-27

---

## Overview

The Mimir Teams backend does not exist yet. To enable development of the CLI integration, we use **mock implementations** that simulate backend responses.

**Key Principle**: All mocks are **clearly marked** and **easy to replace** when the real backend is ready.

---

## What's Mocked

### 1. **MockTeamsAPIClient** (`src/mocks/MockTeamsAPIClient.ts`)

Simulates the Teams backend API with hardcoded responses.

**Mock Behavior**:
- `auth.login()` - Returns fake JWT tokens and mock organization list
- `auth.refresh()` - Returns new fake tokens
- `auth.logout()` - Returns success
- `organizations.list()` - Returns mock organizations
- `teams.detect()` - Returns mock team based on repository
- `config.get()` - Returns mock team configuration

**Mock Data**:
```typescript
// Mock Organizations
{
  id: 'mock-org-001',
  slug: 'acme-corp',
  name: 'Acme Corporation (MOCK)',
  subscriptionTier: 'teams'
}

// Mock User Credentials (accept any email/password)
email: any@example.com
password: any (length >= 8)

// Mock Tokens
accessToken: 'mock-access-token-...'
refreshToken: 'mock-refresh-token-...'
```

**Location**: `src/mocks/MockTeamsAPIClient.ts`

---

## How to Replace Mocks

### Step 1: Check for TODO Markers

All mock-related code is marked with:

```typescript
// TODO-MOCK: Replace with real TeamsAPIClient when backend is ready
```

Search for `TODO-MOCK` in the codebase to find all instances.

### Step 2: Swap MockTeamsAPIClient → TeamsAPIClient

**Current (Mock)**:
```typescript
import { MockTeamsAPIClient } from '../mocks/MockTeamsAPIClient.js';

const client = new MockTeamsAPIClient({
  baseURL: 'http://localhost:3000/api/v1', // Mock doesn't actually call this
});
```

**Future (Real)**:
```typescript
import { TeamsAPIClient } from '@codedir/mimir-teams-contracts';

const client = new TeamsAPIClient({
  baseURL: process.env.TEAMS_API_URL || 'https://teams.mimir.dev/api/v1',
  accessToken: authContext.accessToken,
});
```

### Step 3: Update AuthManager

**File**: `src/core/auth/AuthManager.ts`

**Change**:
```diff
- import { MockTeamsAPIClient } from '../../mocks/MockTeamsAPIClient.js';
+ import { TeamsAPIClient } from '@codedir/mimir-teams-contracts';

- // TODO-MOCK: Replace with real backend URL
- const client = new MockTeamsAPIClient({ baseURL: 'mock://localhost' });
+ const client = new TeamsAPIClient({
+   baseURL: process.env.TEAMS_API_URL || 'https://teams.mimir.dev/api/v1',
+ });
```

### Step 4: Remove Mock Files

Once backend is ready, delete:
- `src/mocks/MockTeamsAPIClient.ts`
- `src/mocks/index.ts`
- This file (`MOCKING.md`)

---

## Mock Limitations

### ❌ **What Mocks DON'T Do**:
1. **Network requests** - No actual HTTP calls made
2. **Token validation** - Accepts any token format
3. **User authentication** - No password checking (accepts any password ≥ 8 chars)
4. **Database persistence** - Data doesn't persist (stored in ~/.mimir/auth.json only)
5. **Rate limiting** - No throttling or quotas
6. **Error simulation** - Always returns success (except for validation errors)

### ✅ **What Mocks DO**:
1. **Match API contracts** - Same interface as real TeamsAPIClient
2. **Return valid data** - Passes Zod schema validation
3. **Enable E2E testing** - Full auth flow works (login → status → logout)
4. **Simulate multi-org** - Can switch between mock orgs
5. **Team detection** - Maps git repos to mock teams

---

## Mock Organizations Available

```typescript
// Organization 1 (Default)
{
  slug: 'acme-corp',
  name: 'Acme Corporation (MOCK)',
  subscriptionTier: 'teams'
}

// Organization 2
{
  slug: 'startup-xyz',
  name: 'Startup XYZ (MOCK)',
  subscriptionTier: 'enterprise'
}
```

---

## Mock Teams (for acme-corp)

```typescript
// Team 1
{
  slug: 'frontend-team',
  name: 'Frontend Team (MOCK)',
  repository: 'git@github.com:acme/frontend.git'
}

// Team 2
{
  slug: 'backend-team',
  name: 'Backend Team (MOCK)',
  repository: 'git@github.com:acme/backend.git'
}
```

---

## Testing with Mocks

### Test Login

```bash
mimir auth login

# Enter any email/password (≥ 8 chars)
Email: test@example.com
Password: password123

# Should show mock organizations
Organizations:
  1. acme-corp (Acme Corporation (MOCK))
  2. startup-xyz (Startup XYZ (MOCK))

Select organization: 1
✓ Authenticated to acme-corp
```

### Test Status

```bash
mimir auth status

# Should show:
✓ Authenticated to acme-corp
  User: test@example.com
  Role: member
  Token expires: <future date>
```

### Test Logout

```bash
mimir auth logout

# Should show:
✓ Logged out from acme-corp
```

---

## Environment Variables (for Future)

When backend is ready, set:

```bash
# .env
TEAMS_API_URL=https://teams.mimir.dev/api/v1

# Or for local development:
TEAMS_API_URL=http://localhost:3000/api/v1
```

---

## Checklist: Removing Mocks

When backend is ready:

- [ ] Search for all `TODO-MOCK` comments
- [ ] Replace `MockTeamsAPIClient` with `TeamsAPIClient` in AuthManager
- [ ] Update `baseURL` to use `TEAMS_API_URL` env variable
- [ ] Test login with real backend
- [ ] Test token refresh with real backend
- [ ] Delete `src/mocks/` directory
- [ ] Delete `MOCKING.md` (this file)
- [ ] Update documentation to reference real backend

---

**Last Updated**: 2025-12-27
