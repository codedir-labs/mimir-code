# @codedir/mimir-teams-contracts

**API contracts for Mimir Teams integration**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

This package provides TypeScript types and API client functions for integrating with Mimir Teams backend. All types and client code are **auto-generated from OpenAPI specification** to ensure type safety and consistency with the backend API.

## Installation

```bash
npm install @codedir/mimir-teams-contracts
# or
yarn add @codedir/mimir-teams-contracts
```

## Usage

### Types

All types are generated from the OpenAPI specification:

```typescript
import type {
  LoginRequest,
  LoginResponse,
  Organization,
  Team,
  ConfigResponse,
} from '@codedir/mimir-teams-contracts';

const loginRequest: LoginRequest = {
  email: 'alice@example.com',
  password: 'secret123',
  orgSlug: 'acme-corp', // optional
};
```

### API Client Functions

The package provides typed functions for all API endpoints:

```typescript
import {
  login,
  listOrganizations,
  getConfig,
  type LoginResponse,
} from '@codedir/mimir-teams-contracts';

// Authenticate
const response: LoginResponse = await login({
  body: {
    email: 'alice@example.com',
    password: 'secret123',
  },
});

// List organizations
const orgs = await listOrganizations();

// Get config
const config = await getConfig({
  path: { slug: 'acme-corp' },
  query: { team_id: 'team-123' },
});
```

### Using with Custom Client

You can also configure the client with custom options:

```typescript
import { client } from '@codedir/mimir-teams-contracts/generated';

// Configure base URL and headers
client.setConfig({
  baseUrl: 'https://teams.mimir.dev/api/v1',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

## API Reference

All endpoints are defined in the OpenAPI specification (`openapi/teams-api.yaml`).

### Authentication

- `login()` - Login to organization
- `refreshToken()` - Refresh access token
- `logout()` - Logout from organization

### Organizations

- `listOrganizations()` - List user's organizations
- `getOrganization()` - Get organization details
- `getConfig()` - Get organization/team configuration

### Teams

- `listTeams()` - List teams in organization
- `detectTeam()` - Detect team from workspace repository

## OpenAPI Workflow

This package uses **OpenAPI as the single source of truth** for all API contracts.

### 1. OpenAPI Specification

The API is defined in `openapi/teams-api.yaml`:

```yaml
paths:
  /auth/login:
    post:
      operationId: login
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginResponse'
```

### 2. Code Generation

TypeScript types and client are generated using [@hey-api/openapi-ts](https://github.com/hey-api/openapi-ts):

```bash
# Generate code from OpenAPI spec
yarn generate

# Watch mode (auto-regenerate on spec changes)
yarn generate:watch

# Generate from remote backend URL (when backend is implemented)
yarn generate:from-url
```

**Note**: Code generation runs automatically during `yarn build` via the `prebuild` hook.

### 3. Generated Code

The generation creates:

- `src/generated/types.gen.ts` - All TypeScript types
- `src/generated/sdk.gen.ts` - API client functions
- `src/generated/client/` - HTTP client utilities
- `src/generated/index.ts` - Main export file

### 4. Usage in Mimir CLI

Import the generated types and functions in your code:

```typescript
import {
  login,
  type LoginRequest,
  type LoginResponse,
} from '@codedir/mimir-teams-contracts';
```

### 5. Updating the API

When the backend API changes:

1. **Development** (mock spec):
   - Update `openapi/teams-api.yaml` manually
   - Run `yarn generate` to regenerate types

2. **Production** (real backend):
   - Backend exports OpenAPI spec at `/openapi.json`
   - Run `yarn generate:from-url` to regenerate from live spec
   - Types automatically stay in sync with backend

## Mock Backend

**Status**: The backend is not yet implemented. This package currently contains a **mock OpenAPI specification** that serves as a contract for future implementation.

All API responses are simulated using `MockTeamsAPIClient` (see `src/mocks/MockTeamsAPIClient.ts`). When the real backend is ready:

1. Export the OpenAPI spec from the backend
2. Update `openapi-ts.config.ts` to point to the backend URL
3. Regenerate types: `yarn generate:from-url`
4. Replace `MockTeamsAPIClient` with real HTTP client

See `MOCKING.md` for detailed information on the mocking strategy.

## Development

```bash
# Install dependencies
yarn install

# Generate types from OpenAPI spec
yarn generate

# Build package
yarn build

# Watch mode (auto-rebuild on changes)
yarn dev

# Run tests
yarn test

# Lint
yarn lint

# Format
yarn format
```

## File Structure

```
packages/mimir-teams-contracts/
├── openapi/
│   └── teams-api.yaml           # OpenAPI 3.1 specification (source of truth)
├── src/
│   ├── generated/               # Auto-generated (do not edit manually)
│   │   ├── types.gen.ts         # TypeScript types
│   │   ├── sdk.gen.ts           # API client functions
│   │   ├── client/              # HTTP client utilities
│   │   └── index.ts             # Main exports
│   └── index.ts                 # Package entry point
├── openapi-ts.config.ts         # Code generation config
├── package.json
├── tsconfig.json
└── README.md
```

## License

AGPL-3.0 © Codedir

This package is part of the Mimir project and is licensed under the GNU Affero General Public License v3.0.
See the LICENSE file for details.
