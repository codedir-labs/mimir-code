# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting Vulnerabilities

Email security issues or open a private GitHub security advisory. **Do not use public issues.**

Response: acknowledgment within 48 hours, detailed response within 7 days.

## Security Measures

- **Dependency audits**: Pre-commit/push hooks, weekly CI scans, Dependabot
- **Docker sandboxing**: Resource limits, network isolation, read-only mounts
- **Permission system**: Risk assessment, user approval, audit trail
- **Input validation**: Zod schemas, path sanitization, parameterized commands

## For Users

1. Use environment variables for API keys (never commit)
2. Enable Docker sandboxing for untrusted code
3. Review permission prompts carefully
4. Keep Mimir Code updated
