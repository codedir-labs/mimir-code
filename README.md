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

- `mimir` - Interactive chat
- `mimir setup` - Configuration wizard
- `mimir init` - Initialize project
- `mimir history list` - View conversations
- `mimir cost today` - Cost analytics
- `mimir permissions list` - Manage allowlist
- `mimir doctor` - Run diagnostics

## Development

See [CLAUDE.md](CLAUDE.md) for architecture details and development guidelines.