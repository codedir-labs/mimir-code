# Custom Slash Commands

Mimir supports custom slash commands to extend functionality for your specific workflow. Commands are defined as markdown files in the `.mimir/commands/` directory.

## Quick Start

1. Create a markdown file in `.mimir/commands/`:
   ```bash
   touch .mimir/commands/my-command.md
   ```

2. Add frontmatter and implementation:
   ```markdown
   ---
   name: my-command
   description: Brief description of what this command does
   category: general
   autoAccept: false
   riskLevel: low
   ---

   # My Custom Command

   Detailed documentation here...

   ## Implementation

   ```bash
   #!/usr/bin/env bash
   echo "Hello from custom command!"
   ```
   ```

3. Use in chat:
   ```
   /my-command
   ```

## Command File Format

### Frontmatter (Required)

Every command file must start with YAML frontmatter:

```yaml
---
name: command-name          # Command name (lowercase, hyphens allowed)
description: Short desc     # One-line description (shown in /help)
category: general           # Category: general, git, testing, deployment, etc.
autoAccept: false           # Skip permission prompt if true (DANGEROUS)
riskLevel: low              # low | medium | high | critical
---
```

### Metadata Fields

#### `name` (required)
- Command name as invoked in chat (`/name`)
- Must be lowercase
- Use hyphens for multi-word names (`test-coverage`, `deploy-prod`)
- Must match the filename (without .md extension)

#### `description` (required)
- Brief one-line summary
- Shown in `/help` command list
- Max 80 characters recommended

#### `category` (optional)
- Organizes commands in help menu
- Standard categories:
  - `general` - General utilities
  - `git` - Git operations
  - `testing` - Test runners and coverage
  - `deployment` - Deploy and release
  - `system` - System diagnostics
  - `development` - Dev tools and workflow

#### `autoAccept` (optional, default: false)
- If `true`, command runs without permission prompt
- **DANGEROUS**: Only use for read-only operations
- Examples:
  - ✅ `autoAccept: true` for `/status`, `/version`, `/help`
  - ❌ `autoAccept: true` for `/deploy`, `/delete`, `/commit`

#### `riskLevel` (optional, default: medium)
- Risk assessment for permission system
- Levels:
  - `low` - Read-only, safe operations
  - `medium` - Writes files, network requests
  - `high` - Destructive operations, system changes
  - `critical` - Irreversible actions, security impact

### Documentation Section

After frontmatter, add markdown documentation:

```markdown
# Command Title

Brief overview of what the command does.

## Usage

```
/command-name [arguments]
```

## Arguments

- `arg1` - Description of first argument
- `arg2` - Description of second argument (optional)

## Examples

```bash
/command-name foo bar
/command-name --verbose
```

## What it does

1. Step-by-step explanation
2. Of what happens
3. When command runs

## Implementation

```bash
#!/usr/bin/env bash
# Your bash script here
```

## Requirements

- List any dependencies
- Environment variables needed
- Tools that must be installed

## Related Commands

- `/other-command` - Brief description
- `/another-command` - Brief description
```

### Implementation Block

The most important part is the `## Implementation` section with a code block:

````markdown
## Implementation

```bash
#!/usr/bin/env bash
set -e  # Exit on error

# Your command implementation
echo "Running custom command..."

# Access arguments via $1, $2, $3
ARG1="$1"
ARG2="$2"

# Environment variables are available
echo "User: $USER"
echo "PWD: $PWD"

# Run other commands
yarn test
git status
```
````

## Argument Handling

Commands can accept arguments passed after the command name:

```
/deploy production --verbose
```

In your script, access via:

```bash
# $1 = production
# $2 = --verbose
# $@ = all arguments
# $# = argument count

ENVIRONMENT="$1"
VERBOSE="$2"

if [ "$VERBOSE" = "--verbose" ]; then
  set -x  # Enable debug output
fi

echo "Deploying to $ENVIRONMENT..."
```

## Special Variables

Available in command scripts:

| Variable | Description | Example |
|----------|-------------|---------|
| `$1`, `$2`, ... | Positional arguments | `/cmd arg1 arg2` |
| `$@` | All arguments | `"$@"` expands to all args |
| `$#` | Argument count | `if [ $# -eq 0 ]; then` |
| `$MIMIR_ROOT` | Project root directory | `/path/to/project` |
| `$MIMIR_CONFIG` | Config file path | `/path/to/.mimir/config.yml` |
| `$MIMIR_SESSION_ID` | Current session ID | `abc123...` |
| `$USER` | Current user | `username` |
| `$HOME` | User home directory | `/home/username` |
| `$PWD` | Working directory | Current directory |

## Example Commands

See `.mimir/commands/` for full examples:

- `test-coverage.md` - Run tests with coverage
- `commit.md` - Smart conventional commits
- `doctor.md` - System diagnostics

### Simple Example: Git Status

```markdown
---
name: status
description: Show git status with enhanced formatting
category: git
autoAccept: true
riskLevel: low
---

# Git Status Command

Shows git status with color-coded output.

## Implementation

```bash
#!/usr/bin/env bash
echo "📊 Repository Status"
git status --short

if ! git diff-index --quiet HEAD --; then
  echo "💡 Tip: Run /commit to create a commit"
fi
```
```

## Best Practices

### 1. Error Handling

Always use error handling in scripts:

```bash
#!/usr/bin/env bash
set -e  # Exit on error
set -u  # Error on undefined variables
set -o pipefail  # Catch errors in pipes

# Trap errors
trap 'echo "❌ Command failed at line $LINENO"' ERR
```

### 2. User Feedback

Provide clear output with emojis and formatting:

```bash
echo "🔍 Analyzing code..."
echo "✅ Tests passed"
echo "⚠️  Warning: deprecated API"
echo "❌ Build failed"
```

### 3. Argument Validation

Validate required arguments:

```bash
if [ $# -eq 0 ]; then
  echo "❌ Missing required argument"
  echo "Usage: /command <arg>"
  exit 1
fi
```

### 4. Platform Compatibility

Handle cross-platform differences:

```bash
# Detect OS
case "$(uname -s)" in
  Darwin*)  open coverage/index.html ;;      # macOS
  Linux*)   xdg-open coverage/index.html ;;  # Linux
  MINGW*)   start coverage/index.html ;;     # Windows
esac
```

## Permission System Integration

### Risk Levels

Commands are automatically assessed based on `riskLevel`:

- **Low**: No permission prompt if user has set `acceptRiskLevel: low` or higher
- **Medium**: Prompts unless `acceptRiskLevel: medium` or higher
- **High**: Always prompts unless `autoAccept: true` or in allowlist
- **Critical**: Always prompts with strong warning

### Auto-Accept

Only use `autoAccept: true` for completely safe, read-only commands:

```yaml
---
name: version
autoAccept: true
riskLevel: low
---
```

Examples of commands that should **NOT** use autoAccept:
- File modifications
- Network requests
- Running builds/tests (can consume resources)
- Git commits/pushes
- Deployments

### Command Allowlist

Users can add commands to their allowlist in `.mimir/config.yml`:

```yaml
permissions:
  alwaysAcceptCommands:
    - '/test'
    - '/lint'
    - '/build'
```

Or in `.mimir/allowlist.yml` (team-shared):

```yaml
# Team-wide allowed commands
commands:
  - '/test'
  - '/lint'
  - '/status'
  - '/doctor'
```

## Loading Custom Commands

Mimir automatically loads commands from:

1. **Built-in commands** (shipped with Mimir)
2. **Global commands** (`~/.mimir/commands/`)
3. **Project commands** (`.mimir/commands/`)

Project commands override global commands of the same name.

## Testing Custom Commands

Test commands directly from the shell:

```bash
# Extract implementation from markdown
sed -n '/^```bash/,/^```/p' .mimir/commands/my-command.md > /tmp/test.sh
sed -i '1d;$d' /tmp/test.sh

# Run with test arguments
bash /tmp/test.sh arg1 arg2
```

Or use Mimir's test mode:

```bash
mimir test-command my-command arg1 arg2
```

## Security Considerations

1. **Never commit secrets** in command files
2. **Validate all user input** before using in commands
3. **Set appropriate risk levels** for destructive commands
4. **Avoid eval** with user-provided input
5. **Sanitize file paths** to prevent traversal attacks
6. **Use quotes** around variables to prevent injection

## Sharing Commands with Team

Track `.mimir/commands/` in git:

```bash
# .gitignore
/.mimir/mimir.db
/.mimir/logs/
/.mimir/checkpoints/

# Keep commands tracked
!/.mimir/commands/
```

Team members automatically get your custom commands when they pull.

## Troubleshooting

### Command not found

- Check filename matches command name: `my-command.md` → `/my-command`
- Ensure frontmatter has `name:` field
- Restart Mimir to reload commands

### Permission denied

- Check `riskLevel` in frontmatter
- Add to allowlist in config.yml
- Use `autoAccept: true` for safe commands (carefully!)

### Script errors

- Add `set -e` to exit on first error
- Test script independently first
- Check logs in `.mimir/logs/commands.log`

## Next Steps

- Browse example commands in `.mimir/commands/`
- Copy and customize for your workflow
- Share useful commands with the community
