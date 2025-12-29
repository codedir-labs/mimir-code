# Environment Variables - CLI & Backend

Complete guide to environment variables for Mimir CLI and Teams Backend integration.

## Overview

Two repositories need environment configuration:
1. **CLI Repository** (`D:\dev\mimir`) - Mimir CLI tool
2. **Backend Repository** (`D:\dev\mimir-teams`) - Teams backend API

## CLI Environment Variables

**File**: `D:\dev\mimir\.env`

### Teams Integration

```bash
# Backend API endpoint
# Development: http://localhost:3000/api/v1
# Production: https://teams.mimir.dev/api/v1
TEAMS_API_URL=http://localhost:3000/api/v1
```

**Purpose**:
- CLI uses this to make API requests to the backend
- Device flow authentication
- Organization management
- Config fetching

**Example Values**:
```bash
# Local development (backend running on localhost)
TEAMS_API_URL=http://localhost:3000/api/v1

# Staging environment
TEAMS_API_URL=https://teams-staging.mimir.dev/api/v1

# Production
TEAMS_API_URL=https://teams.mimir.dev/api/v1
```

### LLM Provider Keys (Local BYOK Mode)

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

**Purpose**: When not using Teams mode, CLI uses these keys directly.

### Other CLI Variables

```bash
# Logging level
LOG_LEVEL=info

# Node environment
NODE_ENV=development

# Docker
DOCKER_ENABLED=true

# UI Theme
MIMIR_THEME=mimir
```

## Backend Environment Variables

**File**: `D:\dev\mimir-teams\.env`

### Application URL

```bash
# Public URL of backend application
# This is what users see in their browser!
# Development: http://localhost:3000
# Production: https://teams.mimir.dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Purpose**:
- **Device Flow**: Generates verification URL for users
  - CLI displays: "Visit http://localhost:3000/auth/device"
  - User opens this URL in browser
- OAuth callbacks
- SSO redirects

**IMPORTANT**: This must match the actual hostname users access!

**Example Values**:
```bash
# Local development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Staging with ngrok/tunneling
NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io

# Production
NEXT_PUBLIC_APP_URL=https://teams.mimir.dev
```

### JWT Configuration

```bash
# JWT secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
JWT_SECRET=your-32-character-secret-key-here
JWT_ISSUER=mimir-teams
JWT_AUDIENCE=mimir-api
```

### Database URLs

```bash
# Main database (data plane)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# Control plane (routing database)
CONTROL_PLANE_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

### Supabase Configuration

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

## How They Work Together

### Device Flow Authentication Sequence

1. **CLI requests device code**:
   ```
   POST http://localhost:3000/api/v1/auth/device/code
   ```
   - CLI uses `TEAMS_API_URL` to determine backend address

2. **Backend returns verification URL**:
   ```json
   {
     "deviceCode": "abc123...",
     "userCode": "WXYZ-5678",
     "verificationUri": "http://localhost:3000/auth/device"
   }
   ```
   - Backend uses `NEXT_PUBLIC_APP_URL` to generate this URL

3. **CLI displays to user**:
   ```
   Visit: http://localhost:3000/auth/device
   Enter code: WXYZ-5678
   ```
   - User sees the URL from backend's `NEXT_PUBLIC_APP_URL`

4. **User authorizes in browser**:
   - Opens `http://localhost:3000/auth/device`
   - Enters code `WXYZ-5678`
   - Logs in and approves

5. **CLI polls for token**:
   ```
   POST http://localhost:3000/api/v1/auth/device/token
   ```
   - CLI uses `TEAMS_API_URL` again

## Configuration Examples

### Local Development

**CLI** (`D:\dev\mimir\.env`):
```bash
TEAMS_API_URL=http://localhost:3000/api/v1
```

**Backend** (`D:\dev\mimir-teams\.env`):
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Result**:
- CLI makes requests to `http://localhost:3000/api/v1`
- User visits `http://localhost:3000/auth/device` in browser

### Local Development with Tunneling (ngrok)

If you want to test from another device or share with team:

**Backend** (`D:\dev\mimir-teams\.env`):
```bash
NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io
```

**CLI** (`D:\dev\mimir\.env`):
```bash
TEAMS_API_URL=https://abc123.ngrok.io/api/v1
```

**Result**:
- CLI makes requests to `https://abc123.ngrok.io/api/v1`
- User visits `https://abc123.ngrok.io/auth/device` in browser
- Works from any device with internet access!

### Staging Environment

**Backend** (`D:\dev\mimir-teams\.env`):
```bash
NEXT_PUBLIC_APP_URL=https://teams-staging.mimir.dev
```

**CLI** (`D:\dev\mimir\.env`):
```bash
TEAMS_API_URL=https://teams-staging.mimir.dev/api/v1
```

### Production

**Backend** (`D:\dev\mimir-teams\.env`):
```bash
NEXT_PUBLIC_APP_URL=https://teams.mimir.dev
```

**CLI** (`D:\dev\mimir\.env`):
```bash
TEAMS_API_URL=https://teams.mimir.dev/api/v1
```

## Validation Checklist

Before testing device flow authentication:

- [ ] Backend `.env` has `NEXT_PUBLIC_APP_URL` set correctly
- [ ] CLI `.env` has `TEAMS_API_URL` set correctly
- [ ] Backend is running: `curl http://localhost:3000/api/v1/health`
- [ ] URLs match:
  - CLI API base: `http://localhost:3000/api/v1`
  - Backend app URL: `http://localhost:3000`
- [ ] JWT_SECRET is set in backend (required for token signing)
- [ ] Database is accessible

## Troubleshooting

### "Failed to connect to backend"

**Symptoms**: CLI cannot reach backend API

**Check**:
1. Backend is running: `curl $TEAMS_API_URL/health`
2. `TEAMS_API_URL` in CLI `.env` is correct
3. No typos (e.g., extra slashes, wrong port)

**Fix**:
```bash
# CLI .env
TEAMS_API_URL=http://localhost:3000/api/v1  # Correct
# Not: http://localhost:3000/api/v1/  (trailing slash)
# Not: http://localhost:3001/api/v1  (wrong port)
```

### "Verification URL doesn't work"

**Symptoms**: User visits URL but gets 404 or connection refused

**Check**:
1. `NEXT_PUBLIC_APP_URL` in backend `.env` matches actual URL
2. Backend is accessible at that URL
3. No firewall blocking

**Fix**:
```bash
# Backend .env
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Must be accessible!
```

### "CORS error" or "Forbidden"

**Symptoms**: CLI gets CORS or 403 errors

**Check**:
1. Backend CORS configuration allows CLI origin
2. JWT_SECRET is set correctly
3. API endpoint is correct (should end with `/api/v1`)

## Best Practices

### Development

1. **Use localhost**:
   ```bash
   TEAMS_API_URL=http://localhost:3000/api/v1
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

2. **Keep in sync**: CLI and backend URLs should match base URL

3. **Don't commit**: Add `.env` to `.gitignore`

### Production

1. **Use HTTPS**:
   ```bash
   TEAMS_API_URL=https://teams.mimir.dev/api/v1
   NEXT_PUBLIC_APP_URL=https://teams.mimir.dev
   ```

2. **Environment-specific**: Different `.env` for staging/prod

3. **Secure secrets**: Use secret management (AWS Secrets Manager, HashiCorp Vault)

4. **Validate on deploy**: Check URLs are accessible before going live

## Summary

**Key Takeaway**: Two variables control the flow:

1. **`TEAMS_API_URL`** (CLI) - Where CLI sends API requests
2. **`NEXT_PUBLIC_APP_URL`** (Backend) - Where users open browser

They must match the same base URL for device flow to work!

Example:
```
CLI:     TEAMS_API_URL=http://localhost:3000/api/v1
Backend: NEXT_PUBLIC_APP_URL=http://localhost:3000
                                     ↑
                            Must match this part!
```
