# Vertical Slicing Architecture

**CRITICAL**: Mimir uses **vertical slicing by feature**, not horizontal layering.

## Principles

1. **Feature Cohesion** - All code for a feature lives together (commands, UI, logic, storage, types)
2. **Public APIs** - Features export clean public APIs via `index.ts`
3. **Dependency Management** - Features import from other features' public APIs only
4. **Shared Infrastructure** - Truly shared code lives in `shared/`
5. **Clear Boundaries** - Loosely coupled, highly cohesive features

## Structure

```
src/
├── features/              # Vertical slices
│   ├── chat/             # Commands, UI, agent, memory, slash commands
│   ├── teams/            # API client, auth, sync, commands
│   ├── tools/            # Registry, built-in, custom, MCP
│   └── ...
├── shared/               # Horizontal infrastructure
│   ├── platform/         # IFileSystem, IProcessExecutor, IDockerClient
│   ├── config/           # ConfigLoader, schemas
│   ├── storage/          # Database, IStorageBackend
│   ├── providers/        # LLM providers
│   ├── ui/              # Header, Footer, Logo
│   ├── keyboard/         # KeyboardEventBus
│   └── utils/            # Logger, errors, cache
└── types/                # Global types
```

## Feature Slice Structure

```
features/my-feature/
├── commands/           # CLI commands
├── components/         # UI components
├── api/               # API clients
├── storage/           # Repositories
├── [logic]/           # Core logic
├── types.ts           # Feature types
└── index.ts           # PUBLIC API (REQUIRED)
```

## Public API Pattern

**CRITICAL**: Every feature MUST export via `index.ts`:

```typescript
// features/teams/index.ts
export { createTeamsCommand } from './commands/teams.js';
export { TeamsAPIClient } from './api/TeamsAPIClient.js';
export type { Team, Organization } from './types.js';

// DO NOT export implementation details
```

## Import Rules

✅ **GOOD** - Import from public APIs:
```typescript
import { TeamsAPIClient } from '@/features/teams';
import { IFileSystem } from '@/shared/platform';
```

❌ **BAD** - Import from internal files:
```typescript
import { TeamsAPIClientImpl } from '@/features/teams/api/TeamsAPIClientImpl';
```

## Path Aliases

```typescript
import { TeamsAPIClient } from '@/features/teams';
import { IFileSystem } from '@/shared/platform';
import { Config } from '@/types';
```

Configured in `tsconfig.json`:
```json
{
  "paths": {
    "@/features/*": ["./src/features/*"],
    "@/shared/*": ["./src/shared/*"],
    "@/types/*": ["./src/types/*"]
  }
}
```

## Dependency Flow

```
features/chat → features/tools → shared/platform
              → features/permissions
              → shared/providers

features/teams → shared/config
               → shared/storage
```

**Rules**:
1. Features can depend on `shared/` ✅
2. Features can depend on other features via public APIs (sparingly) ⚠️
3. `shared/` MUST NOT depend on `features/` ❌
4. No circular dependencies ❌

## When to Create a Feature

Create when:
- Clear user-facing capability
- Has own CLI/slash commands
- Has distinct UI components
- Has independent storage/state
- Multiple devs might work on it

**Do NOT** create for:
- Shared utilities → `shared/utils/`
- Infrastructure → `shared/platform/`, `shared/config/`
- Cross-feature types → `types/`

## Testing Structure

Tests mirror source:

```
tests/
├── features/
│   ├── chat/
│   ├── teams/
│   └── ...
└── shared/
    ├── platform/
    └── ...
```

- Unit tests: `*.test.ts`
- Integration tests: `*.spec.ts`
- Each feature's tests run independently
