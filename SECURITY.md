# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Mimir, please report it by emailing [security contact] or opening a private security advisory on GitHub.

**Please do not report security vulnerabilities through public GitHub issues.**

We will acknowledge receipt of your vulnerability report within 48 hours and aim to provide a detailed response within 7 days.

## Security Measures

### Dependency Audits

We run automated security audits on all dependencies:

- **Pre-commit hooks**: Blocks high/critical vulnerabilities
- **Pre-push hooks**: Blocks moderate+ vulnerabilities
- **CI/CD**: Weekly scheduled scans via GitHub Actions
- **Dependabot**: Automated dependency updates

### Package Security

All dependencies are regularly audited and updated. We use:

- **@yao-pkg/pkg**: Actively maintained fork of the deprecated `pkg` package with security fixes
- **esbuild**: Pinned to >=0.25.0 via resolutions to ensure dev server security fixes are applied

No known vulnerabilities in production or development dependencies.

### Docker Sandboxing

Mimir supports Docker-based sandboxing for executing untrusted code:

- Resource limits (CPU, memory)
- Network isolation options
- Read-only file system mounts
- Non-root user execution

### Permission System

All command executions go through a permission system:

- Risk assessment (low, medium, high, critical)
- User approval prompts
- Allowlist/blocklist support
- Audit trail in SQLite database

### Input Validation

- All configuration validated with Zod schemas
- Path sanitization to prevent traversal attacks
- Parameterized command execution (no string interpolation)

## Security Best Practices for Users

1. **API Keys**: Never commit API keys - use environment variables or `.env` files
2. **Docker**: Enable Docker sandboxing for untrusted code execution
3. **Permissions**: Review permission prompts carefully before accepting
4. **Updates**: Keep Mimir updated to latest version for security patches
5. **Audit Logs**: Regularly review `.mimir/mimir.db` permission audit trail

## Development Security Guidelines

See `CLAUDE.md` for security considerations when contributing:

- Input validation requirements
- Path sanitization rules
- Command execution safety
- Docker isolation practices
- Secret management
