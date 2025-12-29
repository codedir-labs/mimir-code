# CLI Authentication Implementation - Complete ✅

**Date**: 2025-12-29
**Status**: Ready for Integration Testing

## What Was Implemented

Complete CLI authentication integration with Mimir Teams backend using OAuth 2.0 Device Flow.

## 🎯 Key Features

### ✅ TeamsAPIClient

**Location**: `src/features/teams/api/TeamsAPIClient.ts`

**Functionality**:
- HTTP client for Mimir Teams backend API
- OAuth 2.0 Device Flow implementation (RFC 8628)
- Two-tier authentication support (user + org)
- Automatic token injection and refresh
- Error handling with RFC 8628 error codes

**Key Methods**:
```typescript
// Device Flow
await apiClient.requestDeviceCode({ clientId: 'mimir-cli' })
await apiClient.pollDeviceToken({ deviceCode })

// Organization Authorization
await apiClient.authorizeOrganization(orgSlug, userAccessToken)

// User Info
await apiClient.getUserInfo(userAccessToken)

// Token Refresh
await apiClient.refreshUserToken(refreshToken)

// API Access
await apiClient.getConfig(orgSlug, teamId)
await apiClient.listTeams(orgSlug)
await apiClient.createTeam(orgSlug, teamData)
```

### ✅ AuthStorage

**Location**: `src/features/auth/storage/AuthStorage.ts`

**Functionality**:
- Secure file storage for auth tokens in `~/.mimir/auth.json`
- File permissions: 0o600 (owner read/write only)
- Two-tier auth data structure:
  - User-level: `userAccessToken`, `userRefreshToken`
  - Org-level: `orgAccessToken` per organization
- Active organization tracking
- Token expiration checking

**File Format**:
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "userAccessToken": "...",
    "userRefreshToken": "...",
    "expiresAt": "2025-12-29T12:00:00.000Z"
  },
  "organizations": {
    "acme-corp": {
      "orgAccessToken": "...",
      "orgId": "org-id",
      "orgSlug": "acme-corp",
      "orgName": "Acme Corp",
      "userId": "user-id",
      "userEmail": "user@acme.com",
      "role": "admin",
      "orgSecret": "...",
      "expiresAt": "2025-12-29T13:00:00.000Z",
      "ssoProvider": null,
      "authenticatedAt": "2025-12-29T11:00:00.000Z"
    }
  },
  "activeOrg": "acme-corp"
}
```

### ✅ TeamsAuthManager

**Location**: `src/features/auth/manager/TeamsAuthManager.ts`

**Functionality**:
- Implements `IAuthManager` interface
- Device flow authentication
- Multi-organization session management
- Automatic token refresh
- SSO detection and handling

**Key Methods**:
```typescript
// Device Flow Login
await authManager.deviceFlowLogin({
  orgSlug: 'acme-corp', // Optional
  onDeviceCode: (userCode, verificationUri) => {
    // Display code to user
  },
  pollInterval: 5,
  timeout: 900
})

// Organization Management
await authManager.authorizeOrg(orgSlug)
await authManager.setActiveOrg(orgSlug)
const activeOrg = await authManager.getActiveOrg()
const orgs = await authManager.listOrgs()

// Auth Status
const auth = await authManager.getAuth(orgSlug)
const isAuth = await authManager.isAuthenticated(orgSlug)

// Logout
await authManager.logout(orgSlug)
await authManager.logout(undefined, true) // Logout from all
```

### ✅ CLI Commands

#### `mimir auth login`

**Location**: `src/features/auth/commands/auth.ts`

**Flow**:
1. Request device code from backend
2. Display user code + verification URI in a nice box
3. Poll backend every 5 seconds
4. Show spinner while waiting
5. On success: save tokens, set active org
6. Handle errors: timeout, denial, expiration

**Usage**:
```bash
mimir auth login                 # Login and select org
mimir auth login --org acme-corp # Login to specific org
```

**Output**:
```
┌─────────────────────────────────────────┐
│ Authenticate with Mimir Teams           │
│                                         │
│ 1. Visit: https://teams.mimir.dev/auth │
│ 2. Enter code: WXYZ-5678                │
│                                         │
│ Or visit this URL to auto-fill:        │
│ https://teams.mimir.dev/auth?user_code=WXYZ-5678 │
└─────────────────────────────────────────┘

⠋ Waiting for authorization...
✓ Authentication successful!
✓ Active organization: acme-corp
```

#### `mimir auth logout`

**Usage**:
```bash
mimir auth logout              # Logout from active org
mimir auth logout --org foo    # Logout from specific org
mimir auth logout --all        # Logout from all orgs
```

**Output**:
```
✓ Logged out from organization: acme-corp
```

#### `mimir auth status`

**Usage**:
```bash
mimir auth status
```

**Output** (authenticated):
```
📊 Authentication Status

────────────────────────────────────────────────────────────
  Mode:            Teams
  Authenticated:   Yes
  Active Org:      acme-corp
  User Email:      user@acme.com
  Token Expires:   12/29/2025, 1:00:00 PM
  Organizations:   2

  Authenticated Organizations:
  ● acme-corp (active)
  ○ other-org
────────────────────────────────────────────────────────────
```

**Output** (not authenticated):
```
📊 Authentication Status

────────────────────────────────────────────────────────────
  Mode:            Local (BYOK)
  Authenticated:   No
  Organization:    N/A
  Team:            N/A

  Not authenticated to Teams.
  Use mimir auth login to authenticate.
────────────────────────────────────────────────────────────
```

#### `mimir orgs list`

**Location**: `src/features/teams/commands/orgs.ts`

**Usage**:
```bash
mimir orgs list
```

**Output**:
```
📋 Your Organizations (2)

──────────────────────────────────────────────────────────────────────
  ● acme-corp [ACTIVE]
    Email: user@acme.com  |  Expires: 12/29/2025, 1:00:00 PM
  ○ other-org
    Email: user@other.com  |  Expires: 12/29/2025, 2:00:00 PM
──────────────────────────────────────────────────────────────────────

ℹ  Use mimir orgs set <slug> to switch organizations
```

#### `mimir orgs set <slug>`

**Usage**:
```bash
mimir orgs set other-org
```

**Output**:
```
✓ Active organization set to other-org
```

**Note**: If not already authenticated to the org, will automatically call `authorizeOrganization()`.

#### `mimir orgs current`

**Usage**:
```bash
mimir orgs current
```

**Output**:
```
📊 Current Organization

────────────────────────────────────────────────────────────
  Organization:    acme-corp
  User Email:      user@acme.com
  Token Expires:   12/29/2025, 1:00:00 PM
  Other Orgs:      other-org
────────────────────────────────────────────────────────────
```

## 📁 Files Created/Updated

### CLI Repository (D:\dev\mimir)

#### New Files (4)

1. **`src/features/teams/api/TeamsAPIClient.ts`** (560 lines)
   - HTTP client for Teams backend
   - Device flow implementation
   - Organization authorization
   - Config and teams endpoints

2. **`src/features/auth/storage/AuthStorage.ts`** (245 lines)
   - File-based auth storage
   - ~/.mimir/auth.json management
   - Token expiration checking
   - Multi-org session management

3. **`src/features/auth/manager/TeamsAuthManager.ts`** (595 lines)
   - IAuthManager implementation
   - Device flow login
   - Organization authorization
   - Token refresh logic
   - Multi-org switching

4. **`src/features/teams/api/index.ts`** (15 lines)
   - Export TeamsAPIClient types

5. **`src/features/auth/storage/index.ts`** (7 lines)
   - Export AuthStorage types

#### Updated Files (3)

1. **`src/features/auth/commands/auth.ts`** (194 lines)
   - Implemented `login` command with device flow
   - Implemented `logout` command
   - Implemented `status` command with full details

2. **`src/features/teams/commands/orgs.ts`** (194 lines)
   - Implemented `list` command
   - Implemented `set` command with auto-authorization
   - Implemented `current` command

3. **`src/features/auth/manager/index.ts`** (7 lines)
   - Added TeamsAuthManager export

## 🔐 Security Features

### Token Storage
- Auth file: `~/.mimir/auth.json`
- File permissions: `0o600` (owner read/write only)
- Directory permissions: `0o700` (owner read/write/execute only)
- Tokens stored in plain JSON (encrypted transport via HTTPS)

### Token Types
- **userAccessToken**: For user-scoped endpoints (Tier 1)
- **userRefreshToken**: For refreshing user access token
- **orgAccessToken**: For org-scoped endpoints (Tier 2)

### Token Expiration
- Access tokens: 1 hour
- Refresh tokens: Long-lived
- Automatic refresh when expired

### SSO Support
- Detects SSO requirement via `/auth/orgs/:slug/authorize`
- Returns `requiresSSO: true` with initiate URL
- User must complete SSO flow in browser

## 📊 Authentication Flow

### 1. Initial Login (Device Flow)

```
User runs: mimir auth login

CLI                        Backend                      User
 |                           |                            |
 |-- POST /auth/device/code ->|                            |
 |<- 200 OK                   |                            |
 |   (deviceCode, userCode)   |                            |
 |                           |                            |
 |-- Display userCode ------>|--------------------------->|
 |                           |                            |
 |-- POST /auth/device/token->|                            |
 |<- 400 authorization_pending|                            |
 |                           |                            |
 |-- (wait 5 seconds)        |                            |
 |                           |<-- Authorizes device ------|
 |                           |                            |
 |-- POST /auth/device/token->|                            |
 |<- 200 OK                   |                            |
 |   (userAccessToken,        |                            |
 |    userRefreshToken,       |                            |
 |    organizations[])        |                            |
 |                           |                            |
 |-- Save to ~/.mimir/auth.json                           |
```

### 2. Organization Authorization (Tier 2)

```
User has userAccessToken, wants to access org resources

CLI                        Backend
 |                           |
 |-- POST /auth/orgs/:slug/authorize ->|
 |   (Authorization: Bearer userAccessToken)
 |                           |
 |<- 200 OK                  |
 |   (orgAccessToken,        |
 |    organization: {        |
 |      id, slug, name, role |
 |    })                     |
 |                           |
 |-- Save to ~/.mimir/auth.json [organizations.slug]
```

### 3. SSO Required

```
Org requires SSO

CLI                        Backend
 |                           |
 |-- POST /auth/orgs/:slug/authorize ->|
 |   (Authorization: Bearer userAccessToken)
 |                           |
 |<- 403 Forbidden           |
 |   {                       |
 |     requiresSSO: true,    |
 |     ssoProvider: {...},   |
 |     initiateUrl: "..."    |
 |   }                       |
 |                           |
 |-- Display error with initiateUrl
```

### 4. API Requests (with org context)

```
User wants to list teams in acme-corp

CLI                        Backend
 |                           |
 |-- GET /orgs/acme-corp/teams ->|
 |   (Authorization: Bearer orgAccessToken)
 |                           |
 |<- 200 OK                  |
 |   { teams: [...] }        |
```

### 5. Token Refresh

```
orgAccessToken expired

CLI                        Backend
 |                           |
 |-- POST /auth/refresh --->|
 |   { refreshToken }        |
 |                           |
 |<- 200 OK                  |
 |   (new accessToken,       |
 |    new refreshToken)      |
 |                           |
 |-- Update ~/.mimir/auth.json
 |                           |
 |-- POST /auth/orgs/:slug/authorize ->|
 |   (new accessToken)       |
 |                           |
 |<- 200 OK                  |
 |   (new orgAccessToken)    |
 |                           |
 |-- Update ~/.mimir/auth.json [organizations.slug]
```

## 🧪 Testing

### Manual Testing Checklist

- [ ] Backend running at http://localhost:3000
- [ ] CLI built: `yarn build`
- [ ] Test device flow: `mimir auth login`
  - [ ] Device code displays correctly
  - [ ] User can authorize in browser
  - [ ] CLI polls and receives tokens
  - [ ] Tokens saved to ~/.mimir/auth.json
- [ ] Test multi-org: `mimir auth login` (user with 2+ orgs)
  - [ ] Shows org selection
  - [ ] Allows switching with `mimir orgs set`
- [ ] Test logout: `mimir auth logout`
  - [ ] Removes tokens from storage
  - [ ] `mimir auth status` shows "Not authenticated"
- [ ] Test logout all: `mimir auth logout --all`
  - [ ] Clears all org tokens
- [ ] Test orgs commands:
  - [ ] `mimir orgs list` shows all authenticated orgs
  - [ ] `mimir orgs set <slug>` switches active org
  - [ ] `mimir orgs current` shows active org details
- [ ] Test token expiration:
  - [ ] Manually edit ~/.mimir/auth.json to set expired timestamp
  - [ ] Run command, should auto-refresh
- [ ] Test SSO org:
  - [ ] Create org with SSO enabled
  - [ ] Try to authorize, should show SSO required message

### Integration Testing

```bash
# 1. Start backend
cd D:\dev\mimir-teams
yarn dev

# 2. Build CLI
cd D:\dev\mimir
yarn build

# 3. Test authentication flow
./dist/cli.mjs auth login
# → Should display device code
# → Visit URL and authorize
# → Should save tokens to ~/.mimir/auth.json

# 4. Check status
./dist/cli.mjs auth status
# → Should show "Authenticated: Yes"

# 5. List organizations
./dist/cli.mjs orgs list
# → Should show organizations

# 6. Test logout
./dist/cli.mjs auth logout
# → Should clear tokens

# 7. Check status again
./dist/cli.mjs auth status
# → Should show "Authenticated: No"
```

## 🚀 Next Steps

### Backend Requirements

1. **Device Authorization Page** (`/auth/device`)
   - User enters device code
   - Authenticates with Supabase
   - Approves device access
   - Updates `device_auth_codes` table status

2. **Environment Variables**
   - `NEXT_PUBLIC_APP_URL`: Backend URL
   - `JWT_SECRET`: JWT signing secret
   - `JWT_ISSUER`: JWT issuer
   - `JWT_AUDIENCE`: JWT audience

3. **Database Migration**
   - Run migrations for `device_auth_codes` table
   - Seed test organizations

### CLI Requirements

1. **Environment Variables**

   Create `.env` file in CLI root directory:
   ```bash
   cp .env.example .env
   ```

   Configure the backend URL:
   ```bash
   # Development (local backend)
   TEAMS_API_URL=http://localhost:3000/api/v1

   # Production
   TEAMS_API_URL=https://teams.mimir.dev/api/v1
   ```

   **Important**: The verification URL that users see in their browser is determined by the backend's `NEXT_PUBLIC_APP_URL` environment variable, not the CLI's `TEAMS_API_URL`. The backend returns the correct verification URL to the CLI.

   See `ENVIRONMENT_VARIABLES.md` for complete configuration guide.

2. **Build CLI**
   ```bash
   yarn build
   ```

3. **Test Locally**
   ```bash
   ./dist/cli.mjs auth login
   ```

### Local Development Setup

See `docs/LOCAL_DEV_SETUP.md` for detailed instructions on:
- Setting up both repositories
- Running backend + CLI together
- Creating test users and organizations
- Debugging authentication flow

## ✅ Implementation Checklist

- [x] TeamsAPIClient with device flow
- [x] AuthStorage for secure token management
- [x] TeamsAuthManager implementing IAuthManager
- [x] `mimir auth login` with device flow
- [x] `mimir auth logout` (single + all)
- [x] `mimir auth status` with full details
- [x] `mimir orgs list` showing all orgs
- [x] `mimir orgs set <slug>` with auto-authorization
- [x] `mimir orgs current` showing active org
- [x] Export index files for new modules
- [ ] Integration testing with backend
- [ ] End-to-end testing of full auth flow

## 📚 Documentation

- **Implementation Guide**: `docs/cli/authentication_integration.md`
- **Quick Reference**: `docs/cli/QUICK_REFERENCE.md`
- **Backend Architecture**: `D:\dev\mimir-teams\docs\architecture\authentication_architecture.md`
- **Middleware Guide**: `D:\dev\mimir-teams\docs\architecture\middleware_and_tenant_context.md`

## 🎯 Benefits

**Developer Experience**:
- ✅ Simple device flow (no browser redirect needed)
- ✅ Clear visual feedback with spinners and boxes
- ✅ Multi-org support (GitHub-like workflow)
- ✅ Automatic token refresh
- ✅ Helpful error messages

**Security**:
- ✅ OAuth 2.0 Device Flow (RFC 8628)
- ✅ Secure file storage with proper permissions
- ✅ Token type enforcement (user vs org)
- ✅ Organization matching validation
- ✅ Automatic token expiration

**Maintainability**:
- ✅ Clean separation: API client, storage, auth manager
- ✅ Type-safe with TypeScript
- ✅ Well-documented code
- ✅ Follows existing CLI patterns

---

**Status**: ✅ Complete and ready for integration testing
**Next**: Test end-to-end authentication flow with backend
