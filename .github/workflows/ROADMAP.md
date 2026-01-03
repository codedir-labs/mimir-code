# GitHub Workflows Improvement Roadmap

> **Purpose**: A structured guide for LLM agents to incrementally improve CI/CD quality gates.
> Each phase can be implemented in a separate session while maintaining architectural coherence.

## Philosophy: AI-Enforced Best Practices

In an AI-assisted codebase, **automated enforcement is critical**. Unlike human developers who internalize conventions over time, each LLM session starts fresh. This means:

1. **Gate everything** - If it's not enforced in CI, it will drift
2. **Fail loudly** - Ambiguous warnings get ignored; hard failures get fixed
3. **Document inline** - CLAUDE.md and README.md are the "memory" between sessions
4. **Self-documenting gates** - Each check should explain *why* it failed and *how* to fix it

### The Enforcement Pyramid

```
                    ┌─────────────┐
                    │   Release   │  ← Final gate before users
                    │    Gate     │
                    ├─────────────┤
                    │  Security   │  ← Must pass for any merge
                    │   Scans     │
                    ├─────────────┤
                    │   Quality   │  ← Complexity, duplication, coverage
                    │    Gates    │
                    ├─────────────┤
                    │    Fast     │  ← Types, lint, format (< 2 min)
                    │  Feedback   │
                    └─────────────┘
```

Each layer should block progression to the next. Fast feedback catches 80% of issues in seconds.

---

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | **DONE** | Baseline workflows (test, build, security, release) |
| 1 | **DONE** (2025-01-03) | Path filtering & variables |
| 2 | **DONE** (2025-01-03) | Quality gates expansion |
| 3 | **DONE** (2025-01-03) | Monorepo optimization |
| 4 | **DONE** (2025-01-03) | Security hardening |
| 5 | **DONE** (2025-01-03) | Aggregated reporting |

---

## Phase 1: Foundation Improvements

### 1.1 Path Filtering - Avoid Unnecessary Runs

**Why**: Save CI minutes and reduce noise. Docs-only PRs don't need full test matrix.

**Files to modify**:
- `.github/workflows/test.yml`
- `.github/workflows/build.yml`
- `.github/workflows/code-quality.yml`

**Implementation**:
```yaml
on:
  pull_request:
    branches: [main, develop]
    paths-ignore:
      - 'docs/**'
      - '**/*.md'
      - '!CLAUDE.md'           # CLAUDE.md changes SHOULD trigger (affects behavior)
      - '.github/ISSUE_TEMPLATE/**'
      - 'LICENSE'
      - '.vscode/**'
```

**Exception**: `security.yml` should ALWAYS run (security is never skippable).

**After implementation**: Update README.md section "Workflow Organization" to note path filtering.

---

### 1.2 Centralized Variables

**Why**: Node version, coverage thresholds, etc. should be defined once.

**Files to create/modify**:
- Create `.github/workflows/variables.yml` (reusable workflow that exports vars)
- Update all workflows to use these variables

**Implementation**:
```yaml
# .github/workflows/variables.yml
name: Variables
on:
  workflow_call:
    outputs:
      node-version:
        value: '22'
      coverage-threshold:
        value: '80'
      timeout-default:
        value: '15'

jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Exporting variables"
```

**Usage in other workflows**:
```yaml
jobs:
  vars:
    uses: ./.github/workflows/variables.yml

  test:
    needs: vars
    steps:
      - uses: actions/setup-node@SHA
        with:
          node-version: ${{ needs.vars.outputs.node-version }}
```

**After implementation**: Add "Centralized Variables" section to README.md.

---

## Phase 2: Quality Gates Expansion

### 2.1 Bundle Size Tracking

**Why**: Prevent bundle bloat. Track size over time and fail on regression.

**Files to modify**:
- `.github/workflows/code-quality.yml` (add new job)

**Implementation**:
```yaml
bundle-size:
  name: Bundle Size Check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@SHA
    - uses: actions/setup-node@SHA
    - run: yarn install --frozen-lockfile
    - run: yarn build

    - name: Check bundle size
      run: |
        MAX_SIZE_MB=50
        ACTUAL_SIZE=$(du -sm dist | cut -f1)

        echo "## Bundle Size Report" >> $GITHUB_STEP_SUMMARY
        echo "- Current: ${ACTUAL_SIZE}MB" >> $GITHUB_STEP_SUMMARY
        echo "- Limit: ${MAX_SIZE_MB}MB" >> $GITHUB_STEP_SUMMARY

        if [ "$ACTUAL_SIZE" -gt "$MAX_SIZE_MB" ]; then
          echo "::error::Bundle size ${ACTUAL_SIZE}MB exceeds limit ${MAX_SIZE_MB}MB"
          exit 1
        fi
```

**Future enhancement**: Compare against main branch to show delta in PRs.

**After implementation**: Add to README.md quality gates table.

---

### 2.2 Conventional Commits

**Why**: Consistent commit messages enable automated changelog generation.

**Files to create/modify**:
- Create `commitlint.config.js` in repo root
- Create `.husky/commit-msg` hook
- Add job to `.github/workflows/test.yml`

**Local hook (Husky)**:
```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

**CI validation**:
```yaml
commit-lint:
  name: Commit Message Lint
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@SHA
      with:
        fetch-depth: 0
    - uses: actions/setup-node@SHA
    - run: yarn install --frozen-lockfile
    - name: Validate commits
      run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }}
```

**Config**:
```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'build', 'ci', 'chore', 'revert'
    ]],
    'subject-max-length': [2, 'always', 72],
  }
};
```

**After implementation**: Add to README.md and CLAUDE.md commit guidelines.

---

### 2.3 PR Title Lint

**Why**: PR titles often become merge commit messages. Enforce consistency.

**Files to modify**:
- `.github/workflows/test.yml` (add job)

**Implementation**:
```yaml
pr-title:
  name: PR Title Lint
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - name: Check PR title
      run: |
        TITLE="${{ github.event.pull_request.title }}"
        PATTERN="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,72}$"

        if [[ ! "$TITLE" =~ $PATTERN ]]; then
          echo "::error::PR title must follow conventional commits format"
          echo ""
          echo "Expected: type(scope): description"
          echo "Example: feat(auth): add OAuth2 support"
          echo ""
          echo "Got: $TITLE"
          exit 1
        fi
```

**After implementation**: Document in README.md.

---

### 2.4 Dependency Size Delta

**Why**: Show impact of dependency changes. Catch accidental bloat.

**Files to modify**:
- `.github/workflows/code-quality.yml` (add job)

**Implementation**:
```yaml
dependency-delta:
  name: Dependency Size Delta
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@SHA
    - uses: actions/checkout@SHA
      with:
        ref: ${{ github.base_ref }}
        path: base

    - name: Compare dependencies
      run: |
        # Get base branch size
        cd base && yarn install --frozen-lockfile 2>/dev/null
        BASE_SIZE=$(du -sm node_modules | cut -f1)
        cd ..

        # Get PR branch size
        yarn install --frozen-lockfile
        PR_SIZE=$(du -sm node_modules | cut -f1)

        DELTA=$((PR_SIZE - BASE_SIZE))

        echo "## Dependency Size" >> $GITHUB_STEP_SUMMARY
        echo "| Branch | Size |" >> $GITHUB_STEP_SUMMARY
        echo "|--------|------|" >> $GITHUB_STEP_SUMMARY
        echo "| Base | ${BASE_SIZE}MB |" >> $GITHUB_STEP_SUMMARY
        echo "| PR | ${PR_SIZE}MB |" >> $GITHUB_STEP_SUMMARY
        echo "| **Delta** | **${DELTA}MB** |" >> $GITHUB_STEP_SUMMARY

        # Warn if significant increase
        if [ "$DELTA" -gt 10 ]; then
          echo "::warning::Dependency size increased by ${DELTA}MB"
        fi
```

**After implementation**: Document in README.md.

---

### 2.5 TypeDoc Validation

**Why**: Ensure API documentation builds without errors.

**Files to modify**:
- Add to `.github/workflows/code-quality.yml`

**Implementation**:
```yaml
typedoc:
  name: API Documentation Build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@SHA
    - uses: actions/setup-node@SHA
    - run: yarn install --frozen-lockfile
    - name: Build TypeDoc
      run: |
        npx typedoc --validation.notExported --validation.notDocumented 2>&1 | tee typedoc.log

        # Count warnings
        WARNINGS=$(grep -c "warning" typedoc.log || echo 0)

        echo "## TypeDoc Report" >> $GITHUB_STEP_SUMMARY
        echo "- Warnings: $WARNINGS" >> $GITHUB_STEP_SUMMARY

        if [ "$WARNINGS" -gt 20 ]; then
          echo "::error::Too many TypeDoc warnings ($WARNINGS)"
          exit 1
        fi
```

**After implementation**: Document in README.md.

---

### 2.6 SBOM Generation & License Compliance

**Why**: Software Bill of Materials for security audits. License compliance for legal.

**Files to create/modify**:
- Create `.github/allowed-licenses.json`
- Create `.github/allowed-packages.json` (for exceptions)
- Add to `.github/workflows/security.yml`

**Allowed licenses config**:
```json
// .github/allowed-licenses.json
{
  "allowed": [
    "MIT",
    "ISC",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "Apache-2.0",
    "CC0-1.0",
    "0BSD",
    "Unlicense"
  ],
  "forbidden": [
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0"
  ]
}
```

**Package exceptions**:
```json
// .github/allowed-packages.json
{
  "exceptions": [
    {
      "package": "some-gpl-package",
      "license": "GPL-3.0",
      "reason": "Used only in dev tooling, not bundled",
      "approved_by": "tech-lead",
      "approved_date": "2025-01-03"
    }
  ]
}
```

**Implementation**:
```yaml
sbom-and-licenses:
  name: SBOM & License Check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@SHA
    - uses: actions/setup-node@SHA
    - run: yarn install --frozen-lockfile

    - name: Generate SBOM
      run: |
        npx @cyclonedx/cyclonedx-npm --output-file sbom.json --output-format json

    - name: Check licenses
      run: |
        npx license-checker --production --json > licenses.json

        # Parse and validate against allowed-licenses.json
        node << 'EOF'
        const licenses = require('./licenses.json');
        const allowed = require('./.github/allowed-licenses.json');
        const exceptions = require('./.github/allowed-packages.json');

        const violations = [];

        for (const [pkg, info] of Object.entries(licenses)) {
          const license = info.licenses;
          if (allowed.forbidden.includes(license)) {
            const exception = exceptions.exceptions.find(e => e.package === pkg.split('@')[0]);
            if (!exception) {
              violations.push({ package: pkg, license });
            }
          }
        }

        if (violations.length > 0) {
          console.error('License violations found:');
          violations.forEach(v => console.error(`  - ${v.package}: ${v.license}`));
          process.exit(1);
        }

        console.log('All licenses compliant');
        EOF

    - name: Upload SBOM
      uses: actions/upload-artifact@SHA
      with:
        name: sbom
        path: sbom.json
```

**After implementation**: Document in README.md security section.

---

## Phase 3: Monorepo Optimization

### 3.1 Selective Package Testing

**Why**: Only test packages that changed. Saves CI time as monorepo grows.

**Files to modify**:
- `.github/workflows/test.yml`

**Implementation**:
```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      mimir-agents: ${{ steps.filter.outputs.mimir-agents }}
      mimir-agents-node: ${{ steps.filter.outputs.mimir-agents-node }}
      cli: ${{ steps.filter.outputs.cli }}
      workflows: ${{ steps.filter.outputs.workflows }}
    steps:
      - uses: actions/checkout@SHA
      - uses: dorny/paths-filter@SHA
        id: filter
        with:
          filters: |
            mimir-agents:
              - 'packages/mimir-agents/**'
            mimir-agents-node:
              - 'packages/mimir-agents-node/**'
            cli:
              - 'src/**'
              - 'package.json'
              - 'tsconfig.json'
            workflows:
              - '.github/workflows/**'

  test-agents:
    needs: changes
    if: needs.changes.outputs.mimir-agents == 'true' || needs.changes.outputs.workflows == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: yarn test:packages --filter=@codedir/mimir-agents

  test-agents-node:
    needs: changes
    if: needs.changes.outputs.mimir-agents-node == 'true' || needs.changes.outputs.workflows == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: yarn test:packages --filter=@codedir/mimir-agents-node

  test-cli:
    needs: changes
    if: needs.changes.outputs.cli == 'true' || needs.changes.outputs.workflows == 'true'
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - run: yarn test
```

**After implementation**: Update README.md workflow organization section.

---

### 3.2 Aggressive Caching

**Why**: Tools like jscpd, knip, license-checker are slow to install. Cache them.

**Files to modify**:
- `.github/workflows/code-quality.yml`
- `.github/workflows/security.yml`

**Implementation**:
```yaml
- name: Cache npx tools
  uses: actions/cache@SHA
  with:
    path: ~/.npm/_npx
    key: npx-tools-${{ runner.os }}-${{ hashFiles('.github/workflows/*.yml') }}

- name: Cache TypeScript build
  uses: actions/cache@SHA
  with:
    path: |
      **/tsconfig.tsbuildinfo
      **/.tsbuildinfo
    key: tsc-${{ runner.os }}-${{ hashFiles('**/tsconfig.json') }}-${{ hashFiles('**/*.ts') }}
    restore-keys: |
      tsc-${{ runner.os }}-${{ hashFiles('**/tsconfig.json') }}-
      tsc-${{ runner.os }}-
```

**After implementation**: Document caching strategy in README.md.

---

## Phase 4: Security Hardening

### 4.1 ClamAV Malware Scanning

**Why**: Scan for malware in PRs. Defense against supply chain attacks.

**Files to modify**:
- `.github/workflows/security.yml`

**Implementation**:
```yaml
clamav-scan:
  name: Malware Scan
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@SHA

    - name: Install ClamAV
      run: |
        sudo apt-get update
        sudo apt-get install -y clamav clamav-daemon
        sudo freshclam

    - name: Scan repository
      run: |
        clamscan --recursive --infected --exclude-dir=node_modules --exclude-dir=.git . | tee scan.log

        INFECTED=$(grep -c "FOUND" scan.log || echo 0)

        echo "## ClamAV Scan Results" >> $GITHUB_STEP_SUMMARY
        echo "- Files scanned: $(grep -oP 'Scanned files: \K\d+' scan.log)" >> $GITHUB_STEP_SUMMARY
        echo "- Infected: $INFECTED" >> $GITHUB_STEP_SUMMARY

        if [ "$INFECTED" -gt 0 ]; then
          echo "::error::Malware detected!"
          cat scan.log
          exit 1
        fi
```

**After implementation**: Add to README.md security section.

---

### 4.2 Workflow Security Scanning

**Why**: Detect vulnerable patterns in workflow files themselves.

**Files to modify**:
- `.github/workflows/security.yml`

**Implementation**:
```yaml
workflow-security:
  name: Workflow Security Scan
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@SHA

    - name: Check for dangerous patterns
      run: |
        ISSUES=0

        # Check for unpinned actions
        if grep -rE "uses: .+@(v[0-9]+|main|master|latest)" .github/workflows/*.yml; then
          echo "::error::Found unpinned actions (should use SHA)"
          ISSUES=$((ISSUES + 1))
        fi

        # Check for dangerous expression injections
        if grep -rE '\$\{\{.*github\.(event\.issue\.title|event\.pull_request\.title|event\.comment\.body)' .github/workflows/*.yml; then
          echo "::error::Potential expression injection vulnerability"
          ISSUES=$((ISSUES + 1))
        fi

        # Check for missing permissions
        for file in .github/workflows/*.yml; do
          if ! grep -q "permissions:" "$file"; then
            echo "::warning::$file is missing explicit permissions block"
          fi
        done

        if [ "$ISSUES" -gt 0 ]; then
          exit 1
        fi
```

**After implementation**: Document in README.md.

---

### 4.3 Restrict Workflow Permissions

**Why**: Principle of least privilege. Limit blast radius of compromised workflows.

**Files to modify**: ALL workflow files

**Implementation**: Add to top of each workflow:
```yaml
permissions:
  contents: read  # Minimal default

jobs:
  job-needing-more:
    permissions:
      contents: read
      packages: write  # Only where needed
```

**Audit checklist**:
| Workflow | Required Permissions |
|----------|---------------------|
| test.yml | `contents: read` |
| build.yml | `contents: read` |
| code-quality.yml | `contents: read` |
| security.yml | `contents: read`, `security-events: write` |
| release.yml | `contents: write`, `packages: write`, `id-token: write` |

**After implementation**: Update README.md permissions section.

---

## Phase 5: Aggregated Reporting

### 5.1 Quality Status Gate Job

**Why**: Single job to check in branch protection. Aggregates all results.

**Files to modify**:
- `.github/workflows/test.yml`

**Implementation**:
```yaml
# Add as final job in test.yml
ci-gate:
  name: CI Gate
  runs-on: ubuntu-latest
  needs: [typecheck, lint, format, test, coverage]
  if: always()
  steps:
    - name: Check all jobs
      run: |
        echo "## CI Gate Summary" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        echo "| Check | Status |" >> $GITHUB_STEP_SUMMARY
        echo "|-------|--------|" >> $GITHUB_STEP_SUMMARY

        FAILED=0

        check_job() {
          local name=$1
          local result=$2
          if [ "$result" == "success" ]; then
            echo "| $name | :white_check_mark: Pass |" >> $GITHUB_STEP_SUMMARY
          elif [ "$result" == "skipped" ]; then
            echo "| $name | :fast_forward: Skipped |" >> $GITHUB_STEP_SUMMARY
          else
            echo "| $name | :x: Fail |" >> $GITHUB_STEP_SUMMARY
            FAILED=$((FAILED + 1))
          fi
        }

        check_job "Type Check" "${{ needs.typecheck.result }}"
        check_job "Lint" "${{ needs.lint.result }}"
        check_job "Format" "${{ needs.format.result }}"
        check_job "Tests" "${{ needs.test.result }}"
        check_job "Coverage" "${{ needs.coverage.result }}"

        if [ "$FAILED" -gt 0 ]; then
          echo "" >> $GITHUB_STEP_SUMMARY
          echo ":x: **$FAILED check(s) failed**" >> $GITHUB_STEP_SUMMARY
          exit 1
        fi

        echo "" >> $GITHUB_STEP_SUMMARY
        echo ":white_check_mark: **All checks passed**" >> $GITHUB_STEP_SUMMARY
```

**Branch protection**: Require only `CI Gate` status check instead of all individual jobs.

**After implementation**: Update README.md and branch protection rules documentation.

---

### 5.2 PR Comment Reports

**Why**: Inline visibility. Don't make reviewers hunt for metrics.

**Files to modify**:
- `.github/workflows/test.yml` (coverage comment)
- `.github/workflows/code-quality.yml` (quality comment)

**Implementation** (example for coverage):
```yaml
- name: Comment coverage on PR
  uses: marocchino/sticky-pull-request-comment@SHA
  if: github.event_name == 'pull_request'
  with:
    header: coverage-report
    message: |
      ## Coverage Report

      | Metric | Value | Threshold |
      |--------|-------|-----------|
      | Lines | ${{ steps.coverage.outputs.lines }}% | 80% |
      | Functions | ${{ steps.coverage.outputs.functions }}% | 80% |
      | Branches | ${{ steps.coverage.outputs.branches }}% | 80% |

      <details>
      <summary>Coverage by package</summary>

      ```
      ${{ steps.coverage.outputs.details }}
      ```
      </details>
```

**After implementation**: Document in README.md.

---

## Maintenance Protocol

After implementing any phase:

1. **Update README.md**: Add new checks to the appropriate section
2. **Update CLAUDE.md**: If it affects developer workflow
3. **Test the workflow**: Create a test PR to verify
4. **Update this roadmap**: Mark phase as DONE with date

### Updating This Roadmap

When marking a phase complete:
```markdown
| Phase | Status | Description |
|-------|--------|-------------|
| 1 | **DONE** (2025-01-15) | Path filtering & variables |
```

---

## AI Implementation Notes

When implementing any phase:

1. **Read README.md first** - Understand current state
2. **Check CLAUDE.md** - Follow project conventions
3. **Pin all actions to SHA** - See README.md for current SHAs
4. **Use GITHUB_STEP_SUMMARY** - For visibility in PR checks
5. **Add explicit permissions** - Minimal permissions per job
6. **Set timeouts** - Default 15 minutes
7. **Update documentation** - README.md after each change

### Common Patterns

**Getting action SHA**:
```bash
curl -s https://api.github.com/repos/OWNER/REPO/git/refs/tags/vX.Y.Z | jq -r '.object.sha'
```

**Job output to summary**:
```yaml
echo "## Title" >> $GITHUB_STEP_SUMMARY
echo "| Col1 | Col2 |" >> $GITHUB_STEP_SUMMARY
echo "|------|------|" >> $GITHUB_STEP_SUMMARY
```

**Fail with helpful message**:
```yaml
echo "::error::Description of what went wrong and how to fix it"
exit 1
```

---

## Future Considerations

Not in current scope but worth tracking:

- **GitHub Environments** for staged deployments
- **Dependabot auto-merge** for patch updates
- **Semantic release** for automated versioning
- **Changelog generation** from conventional commits
- **Performance benchmarks** tracked over time
- **Visual regression testing** if UI components added
- **E2E tests** with Playwright when CLI has more features

---

*Last updated: 2025-01-03*
