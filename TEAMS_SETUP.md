# Teams Integration Setup Guide

Quick guide to setting up Mimir CLI with Teams backend for authentication and organization management.

## Prerequisites

- Node.js 18+ installed
- Yarn package manager
- Teams backend running (see backend repository)

## Setup Steps

### 1. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and configure the Teams API URL:

**For Local Development:**
```bash
TEAMS_API_URL=http://localhost:3000/api/v1
```

**For Production:**
```bash
TEAMS_API_URL=https://teams.mimir.dev/api/v1
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Build the CLI

```bash
yarn build
```

### 4. Test Authentication

```bash
# Login with device flow
./dist/cli.mjs auth login

# Or if using yarn:
yarn mimir auth login
```

You will see output like:

```
┌─────────────────────────────────────────┐
│ Authenticate with Mimir Teams           │
│                                         │
│ 1. Visit: http://localhost:3000/auth/device │
│ 2. Enter code: WXYZ-5678                │
│                                         │
│ Or visit this URL to auto-fill:        │
│ http://localhost:3000/auth/device?user_code=WXYZ-5678 │
└─────────────────────────────────────────┘

⠋ Waiting for authorization...
```

### 5. Authorize in Browser

1. Open the verification URL in your browser
2. Enter the device code shown in the CLI
3. Log in with your Mimir Teams account
4. Authorize the CLI to access your account

The CLI will automatically detect the authorization and complete the login.

### 6. Verify Authentication

Check your authentication status:
```bash
mimir auth status
```

You should see:
```
📊 Authentication Status

────────────────────────────────────────────────────────────
  Mode:            Teams
  Authenticated:   Yes
  Active Org:      your-org-slug
  User Email:      your@email.com
  Token Expires:   12/29/2025, 1:00:00 PM
  Organizations:   1

  Authenticated Organizations:
  ● your-org-slug (active)
────────────────────────────────────────────────────────────
```

## Organization Management

### List Organizations

```bash
mimir orgs list
```

### Switch Active Organization

```bash
mimir orgs set <org-slug>
```

### View Current Organization

```bash
mimir orgs current
```

## Logout

**Logout from current organization:**
```bash
mimir auth logout
```

**Logout from specific organization:**
```bash
mimir auth logout --org <org-slug>
```

**Logout from all organizations:**
```bash
mimir auth logout --all
```

## Troubleshooting

### "Failed to connect to backend"

**Problem**: CLI cannot reach the backend API.

**Solution**:
1. Verify backend is running: `curl http://localhost:3000/api/v1/health`
2. Check `TEAMS_API_URL` in `.env`
3. Ensure no firewall is blocking the connection

### "Device code expired"

**Problem**: You took too long to authorize (15 minute timeout).

**Solution**: Run `mimir auth login` again to get a new code.

### "Not a member of organization"

**Problem**: You tried to access an organization you're not a member of.

**Solution**: Contact your organization admin to add you as a member.

### "Token expired"

**Problem**: Your access token has expired (1 hour lifetime).

**Solution**: The CLI will automatically refresh your token. If it fails, run `mimir auth login` again.

### "SSO required"

**Problem**: The organization requires SSO authentication.

**Solution**: Visit the SSO initiation URL displayed in the error message to complete SSO authentication.

## Authentication Storage

Auth tokens are stored in:
```
~/.mimir/auth.json
```

File permissions: `0o600` (owner read/write only)

**Do not share this file** - it contains your access tokens!

## Environment Variables Reference

### CLI Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEAMS_API_URL` | Backend API endpoint | `http://localhost:3000/api/v1` |

### Backend Environment Variables

The verification URL shown to users is determined by the **backend's** environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public URL of backend | `https://teams.mimir.dev` |

**Important**: Make sure the backend's `NEXT_PUBLIC_APP_URL` matches the actual hostname users will access!

## Architecture Overview

### Two-Tier Authentication

1. **Tier 1: User Authentication**
   - User logs in via device flow → `userAccessToken`
   - Used for user-scoped endpoints (e.g., list organizations)

2. **Tier 2: Organization Authorization**
   - User selects organization → `orgAccessToken`
   - Used for org-scoped endpoints (e.g., list teams)

### Token Lifetime

- **Access Token**: 1 hour (auto-refreshed)
- **Refresh Token**: Long-lived (used to get new access token)
- **Org Access Token**: 1 hour (auto-refreshed)

### Multi-Organization Support

- Authenticate once, access multiple organizations
- Switch between organizations instantly
- Each org has its own access token
- GitHub-like workflow

## Next Steps

- Read `CLI_IMPLEMENTATION_COMPLETE.md` for technical details
- See backend documentation for API reference
- Check `docs/LOCAL_DEV_SETUP.md` for local development setup

## Support

For issues or questions:
- CLI issues: https://github.com/codedir/mimir-code/issues
- Backend issues: https://github.com/codedir/mimir-teams/issues
