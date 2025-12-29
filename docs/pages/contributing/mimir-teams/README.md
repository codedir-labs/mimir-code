# Mimir Teams Integration

This directory contains documentation for the Teams/Enterprise features of Mimir.

**Status**: Phase 0-1 Complete ✅
**Next Phase**: Phase 2 - Authentication
**Implementation Timeline**: 6-8 weeks

## Quick Links

- **[Overview](./overview.md)** - Complete roadmap and phase summaries
- **[Architecture](./architecture.md)** - Technical architecture and design patterns
- **[Roadmap](./roadmap.md)** - Detailed implementation roadmap

## Implementation Phases

1. **[Phase 0-1: Foundation](./phase-0-1-complete.md)** ✅ Complete
   - API contracts package
   - Core abstractions and interfaces
   - No-Op implementations
   - Config sources and Teams commands

2. **[Phase 2: Authentication](./phase-2-authentication.md)** 🔜 Next (1-2 weeks)
   - Multi-organization authentication
   - Token management and refresh
   - Auth commands

3. **[Phase 3: Team Detection](./phase-3-team-detection.md)** (1 week)
   - Git repository-based team detection
   - Team caching and mapping

4. **[Phase 4: Config Enforcement](./phase-4-config-enforcement.md)** (1-2 weeks)
   - Teams config as source of truth
   - Policy enforcement
   - Offline mode support

5. **[Phase 5: LLM Proxy](./phase-5-llm-proxy.md)** (2 weeks)
   - Proxied LLM calls
   - Budget enforcement
   - Usage tracking

6. **[Phase 6: Cloud Storage](./phase-6-cloud-storage.md)** (2 weeks)
   - Hybrid local-first storage
   - Background sync
   - Conversation and audit log sync

## Key Features

- **Centralized Configuration**: Admin-managed config via cloud API
- **Policy Enforcement**: Enforced settings that cannot be overridden
- **Shared Resources**: Tools, commands, MCP servers, allowlists
- **LLM Proxy**: Route calls through backend, hide API keys
- **Budget Quotas**: Organization and user-level spending limits
- **Cloud Storage**: Conversation history and audit logs
- **Offline Support**: Cached config with TTL

## Note

**This is future work.** The core Mimir agent implementation takes priority. These features will be implemented after the core agent loop, tool system, and multi-agent orchestration are complete and stable.
