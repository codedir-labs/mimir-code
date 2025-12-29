# Security Best Practices

**CRITICAL**: Security-first design at every layer.

## Core Principles

1. **Input Validation** - Always use Zod schemas
2. **Path Sanitization** - Prevent `../` traversal attacks
3. **Command Execution** - Use parameterized execution, never string interpolation
4. **Docker Isolation** - Run untrusted code in containers with resource limits
5. **Secret Management** - Never commit API keys; use environment variables
6. **Audit Trail** - Log all command executions to `permissions` table

## Input Validation

All user input and API responses MUST be validated with Zod:

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  provider: z.enum(['anthropic', 'deepseek']),
  model: z.string(),
  apiKey: z.string().min(1),
});

const config = ConfigSchema.parse(userInput);
```

## Path Sanitization

Prevent directory traversal:

```typescript
import path from 'path';

function sanitizePath(userPath: string, basePath: string): string {
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return resolved;
}
```

## Command Execution

❌ **NEVER** use string interpolation:
```typescript
await exec(`git commit -m "${message}"`); // VULNERABLE
```

✅ **ALWAYS** use parameterized execution:
```typescript
await processExecutor.execute('git', ['commit', '-m', message]);
```

## Docker Isolation

Run untrusted code in sandboxed containers:

```typescript
const container = await dockerClient.createContainer({
  image: 'mimir-sandbox',
  cpuLimit: config.docker.cpuLimit,
  memoryLimit: config.docker.memoryLimit,
  networkMode: 'none', // No network access
  readOnly: true,      // Read-only root filesystem
});
```

## Secret Management

❌ **NEVER** commit secrets:
- API keys
- Credentials
- Tokens

✅ **ALWAYS** use environment variables:
```typescript
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
```

Add to `.gitignore`:
```
.env
.env.local
*.key
credentials.json
```

## Audit Trail

Log all security-relevant operations:

```typescript
await permissionsRepository.create({
  command: 'rm -rf data/',
  riskLevel: 'critical',
  decision: 'rejected',
  reason: 'User declined',
  timestamp: new Date(),
});
```

## Permission System

All commands go through risk assessment:

1. **Assess** - `RiskAssessor` determines level (low/medium/high/critical)
2. **Check** - Verify against allowlist/blocklist
3. **Prompt** - Ask user if not auto-accepted
4. **Log** - Record decision to audit trail
5. **Execute** - Run or reject based on decision

Risk levels:
- **Low** - Read operations, safe commands
- **Medium** - Write operations, file modifications
- **High** - System commands, network access
- **Critical** - Destructive operations, privilege escalation

## Common Vulnerabilities to Avoid

- **SQL Injection** - Use parameterized queries
- **XSS** - Sanitize output in terminal rendering
- **Command Injection** - Never use shell string interpolation
- **Path Traversal** - Validate all file paths
- **SSRF** - Validate URLs before fetching
- **Prototype Pollution** - Avoid unsafe object merging
- **ReDoS** - Test regex patterns for performance

## Security Checklist

Before committing code:
- [ ] All user input validated with Zod
- [ ] File paths sanitized
- [ ] Commands use parameterized execution
- [ ] No hardcoded secrets
- [ ] Audit logging for sensitive operations
- [ ] Docker isolation for untrusted code
- [ ] Tests include security test cases
