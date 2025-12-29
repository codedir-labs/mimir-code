# Mimir Code

Platform-agnostic AI coding agent CLI. Supports 7+ LLM providers (DeepSeek, Anthropic, OpenAI, Google/Gemini, Qwen, Ollama) with permission-based security.

## Quick Start

```bash
# Clone and install
git clone https://github.com/codedir-labs/@codedir/mimir-code.git
cd mimir
yarn install

# Run setup wizard
yarn mimir setup

# Start chatting
yarn mimir
```

## Development Setup

After cloning the repository, configure Git to use LF line endings:

```bash
git config core.autocrlf false
```

This ensures consistent line endings across platforms (required for Prettier formatting checks).

## Manual Testing

```bash
# Development
yarn dev

# Tests
yarn test
yarn test:unit
yarn test:integration

# Build
yarn build
```

## Commands

### Core Commands
- `mimir` - Interactive chat
- `mimir setup` - Configuration wizard
- `mimir init` - Initialize project
- `mimir history list` - View conversations
- `mimir cost today` - Cost analytics
- `mimir permissions list` - Manage allowlist
- `mimir doctor` - Run diagnostics

### Teams Commands (Enterprise)
- `mimir auth login` - Authenticate with Teams
- `mimir auth logout` - Sign out
- `mimir auth status` - Show authentication status
- `mimir orgs list` - List organizations
- `mimir teams list` - List teams in organization

## Teams/Enterprise Mode

Mimir supports enterprise deployments with centralized management:

**Features**:
- Centralized configuration via cloud API
- Policy enforcement (models, tools, sandboxing)
- Shared resources (tools, commands, allowlists)
- Cloud storage for conversations and audit logs
- LLM proxy (hide individual API keys)
- Budget quotas and usage tracking

**Status**: ✅ Authentication implemented! Full Teams integration in progress.

### Configuration

To use Teams integration, configure the backend URL:

```bash
# Copy environment template
cp .env.example .env

# Edit .env and set:
TEAMS_API_URL=http://localhost:3000/api/v1  # Development
# or
TEAMS_API_URL=https://teams.mimir.dev/api/v1  # Production
```

### Authentication Flow

```bash
# Login with device flow
mimir auth login

# The CLI will display:
# 1. A device code (e.g., WXYZ-5678)
# 2. A verification URL (e.g., https://teams.mimir.dev/auth/device)
#
# Visit the URL in your browser and enter the code to authorize.

# Check authentication status
mimir auth status

# List organizations
mimir orgs list

# Switch between organizations
mimir orgs set <slug>
```

### Additional Documentation

- `TEAMS_SETUP.md` - Quick setup guide for Teams integration
- `ENVIRONMENT_VARIABLES.md` - Complete environment variable reference
- `CLI_IMPLEMENTATION_COMPLETE.md` - Technical implementation details