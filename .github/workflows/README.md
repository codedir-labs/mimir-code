# GitHub Workflows Security & Best Practices

**MUST READ** before modifying any workflow files.

## Supply Chain Security

### Pin Actions to SHA (CRITICAL)

**NEVER** use floating version tags like `@v4`, `@main`, or `@latest`. Always pin to the full commit SHA.

**Bad:**
```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
```

**Good:**
```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
- uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0
```

### Why Pin to SHA?

1. **Tag mutability**: Version tags can be moved to point to different commits
2. **Supply chain attacks**: Compromised tags can inject malicious code
3. **Reproducibility**: Builds are deterministic with SHA pinning
4. **Audit trail**: Changes require explicit PR updates

### How to Find Action SHAs

1. Go to the action's repository (e.g., `github.com/actions/checkout`)
2. Navigate to Releases or Tags
3. Find the version you want
4. Copy the full commit SHA from the tag

Or use the GitHub API:
```bash
curl -s https://api.github.com/repos/actions/checkout/git/refs/tags/v4.2.2 | jq -r '.object.sha'
```

### Current Pinned Actions

| Action | SHA | Version |
|--------|-----|---------|
| `actions/checkout` | `11bd71901bbe5b1630ceea73d27597364c9af683` | v4.2.2 |
| `actions/setup-node` | `1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a` | v4.2.0 |
| `actions/upload-artifact` | `65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08` | v4.6.0 |
| `actions/cache` | `1bd1e32a3bdc45362d1e726936510720a7c30a57` | v4.2.0 |
| `actions/configure-pages` | `983d7736d9b0ae728b81ab479565c72886d7745b` | v5.0.0 |
| `actions/upload-pages-artifact` | `56afc609e74202658d3ffba0e8f6dda462b719fa` | v3.0.1 |
| `actions/deploy-pages` | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` | v4.0.5 |
| `actions/dependency-review-action` | `3b139cfc5fae8b618d3eae3675e383bb1769c019` | v4.5.0 |
| `actions/github-script` | `60a0d83039c74a4aee543508d2ffcb1c3799cdea` | v7.0.1 |
| `github/codeql-action` | `6e93df3c1b954c609ccb2761345ddc9dba76b649` | v3.28.1 |
| `codecov/codecov-action` | `0f8570b1a125f4937846a11fcfa3bcd548bd8c97` | v4.6.0 |
| `softprops/action-gh-release` | `c95fe1489396fe8a9eb87c0abf8aa5b2ef267fda` | v2.2.1 |
| `oven-sh/setup-bun` | `735343b667d3e6f658f44d0eca948eb6282f2b76` | v2.0.2 |
| `trufflesecurity/trufflehog` | `b6b00bbe5460109a21287b6612bd68a86bf060c2` | v3.88.3 |
| `dorny/paths-filter` | `de90cc6fb38fc0963ad72b210f1f284cd68cea36` | v3.0.2 |

## Workflow Best Practices

### Permissions

Always use minimal permissions. Prefer job-level over workflow-level.

```yaml
permissions:
  contents: read  # Default for most jobs

jobs:
  build:
    permissions:
      contents: read
      packages: write  # Only where needed
```

### Concurrency

Prevent duplicate runs and wasted resources:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

### Timeouts

Always set timeouts to prevent runaway jobs:

```yaml
jobs:
  build:
    timeout-minutes: 15
```

### Secrets

- **Never** hardcode secrets
- Use GitHub Secrets or OIDC where possible
- Prefer `GITHUB_TOKEN` over PATs when sufficient
- Use environment protection rules for sensitive deployments

### Path Filtering

Most workflows skip runs when only docs/config files change:

```yaml
paths-ignore:
  - 'docs/**'
  - '**/*.md'
  - '!CLAUDE.md'           # CLAUDE.md always triggers (affects behavior)
  - '.github/ISSUE_TEMPLATE/**'
  - 'LICENSE'
  - '.vscode/**'
```

**Exception**: `security.yml` always runs (security is never skippable).

### Repository Variables

Configuration is managed via GitHub repository variables (not workflow files).

**Setup** (run once):
```bash
# Linux/macOS
.github/setup-variables.sh

# Windows (PowerShell)
.\.github\setup-variables.ps1
```

**Variables**:
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_VERSION` | `22` | Node.js version for all workflows |

**Usage in workflows** (with fallback for forks):
```yaml
node-version: ${{ vars.NODE_VERSION || '22' }}
```

### Workflow Organization

| Workflow | Purpose | Trigger | Jobs |
|----------|---------|---------|------|
| `test.yml` | Run tests on PRs | `pull_request` | changes, commit-lint, pr-title, test, ci-gate |
| `build.yml` | Build verification | `pull_request` | build |
| `security.yml` | Security scanning | `pull_request`, `schedule` | clamav-scan, workflow-security, npm-audit, dependency-review, codeql-analysis, secret-scanning, sbom-generation, license-check |
| `code-quality.yml` | Quality gates | `pull_request` | complexity, dead-code, duplicate-code, bundle-size, dependency-size-delta, typedoc-validation |
| `release.yml` | Full release pipeline | `push` to main | test, security, build, release |
| `deploy-docs.yml` | Documentation deployment | `workflow_call` | build-docs, deploy |

### Reusable Workflows

Use `workflow_call` for shared logic:

```yaml
# In shared workflow
on:
  workflow_call:

# In caller
jobs:
  security:
    uses: ./.github/workflows/security.yml
```

## Security Checklist

Before merging workflow changes:

- [ ] Actions pinned to SHA (not version tags)
- [ ] Minimal permissions declared
- [ ] Timeouts set on all jobs
- [ ] No secrets in logs (`add-mask` used where needed)
- [ ] Environment protection for production deploys
- [ ] Concurrency settings prevent resource waste
- [ ] Third-party actions reviewed for security

## Updating Action Versions

When updating an action:

1. Check the release notes for breaking changes
2. Get the new SHA from the release tag
3. Update the SHA and version comment
4. Test in a PR before merging
5. Update the table in this README

## Resources

- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [SLSA Supply Chain Security](https://slsa.dev/)
- [StepSecurity](https://www.stepsecurity.io/) - Automated workflow hardening
