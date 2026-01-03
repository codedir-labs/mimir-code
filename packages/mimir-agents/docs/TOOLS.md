# Built-in Tools

Mimir Agents provides a comprehensive set of built-in tools that agents can use to accomplish tasks.

## File Operations

### read_file
Read the contents of a file.

**Parameters:**
- `path` (string, required): Path to the file to read

**Example:**
```typescript
{
  path: '/path/to/file.txt'
}
```

### write_file
Write content to a file. Automatically creates parent directories if needed.

**Parameters:**
- `path` (string, required): Path to the file to write
- `content` (string, required): Content to write to the file

**Example:**
```typescript
{
  path: '/path/to/file.txt',
  content: 'Hello, World!'
}
```

### diff
Show differences between two files or strings. Generates unified diff format.

**Parameters:**
- `oldPath` (string, optional): Path to old file
- `newPath` (string, optional): Path to new file
- `oldContent` (string, optional): Old content as string
- `newContent` (string, optional): New content as string
- `unified` (boolean, optional): Use unified diff format (default: true)

**Note:** Either `oldPath` or `oldContent` must be provided. Same for new content.

**Example:**
```typescript
{
  oldPath: '/path/to/old.txt',
  newPath: '/path/to/new.txt'
}
```

## Search Tools

### grep
Search for patterns in files using regex. **Use this instead of grep in bash commands.**

**Parameters:**
- `pattern` (string, required): Regular expression pattern to search for
- `paths` (string[], optional): Paths to search (default: ['.'])
- `recursive` (boolean, optional): Search directories recursively (default: false)
- `ignoreCase` (boolean, optional): Case-insensitive search (default: false)
- `invertMatch` (boolean, optional): Show non-matching lines (default: false)
- `maxResults` (number, optional): Maximum results to return (default: 100)
- `contextLines` (number, optional): Context lines before/after match (default: 0)

**Example:**
```typescript
{
  pattern: 'function\\s+\\w+',
  paths: ['src/'],
  recursive: true,
  ignoreCase: false
}
```

### glob
Find files matching glob patterns.

**Parameters:**
- `pattern` (string, required): Glob pattern (e.g., `**/*.ts`, `src/**/*.{js,jsx}`)
- `cwd` (string, optional): Working directory (default: '.')
- `maxResults` (number, optional): Maximum results (default: 1000)
- `ignorePatterns` (string[], optional): Patterns to ignore (default: ['node_modules/**', '.git/**'])

**Example:**
```typescript
{
  pattern: '**/*.test.ts',
  cwd: 'packages/mimir-agents'
}
```

## Command Execution

### bash
Execute bash commands. **IMPORTANT: Use grep/glob tools for searching instead of grep/find in bash.**

**Parameters:**
- `command` (string, required): Bash command to execute
- `cwd` (string, optional): Working directory
- `timeout` (number, optional): Timeout in milliseconds (default: 30000)

**Example:**
```typescript
{
  command: 'npm test',
  cwd: '/path/to/project'
}
```

**Returns:**
```typescript
{
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

## Task Management

### todo
Manage todo lists for tracking task progress. **Use this frequently to show progress to the user.**

**Parameters:**
- `action` ('read' | 'write' | 'update', required): Action to perform
- `todos` (TodoItem[], optional): Todo items (required for write/update)

**TodoItem Structure:**
```typescript
{
  content: string;      // Task description
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;   // Present continuous form (e.g., "Running tests")
}
```

**Example - Read:**
```typescript
{
  action: 'read'
}
```

**Example - Write:**
```typescript
{
  action: 'write',
  todos: [
    {
      content: 'Run tests',
      status: 'in_progress',
      activeForm: 'Running tests'
    },
    {
      content: 'Fix bugs',
      status: 'pending',
      activeForm: 'Fixing bugs'
    }
  ]
}
```

## Sub-Agent Spawning

### task
Spawn a sub-agent to handle a complex task autonomously. Sub-agents run in isolation to avoid context pollution.

**Use this when:**
- Task requires multiple steps or exploration
- You want to offload work without polluting your context
- Task can run in parallel with other work

**Parameters:**
- `description` (string, required): Short description (3-5 words) of what the agent will do
- `prompt` (string, required): Detailed task prompt for the sub-agent
- `mode` ('blocking' | 'background', optional): Execution mode (default: 'blocking')
- `role` (string, optional): Agent role/specialization (e.g., "finder", "reviewer")
- `tools` (string[], optional): Tools to enable for sub-agent
- `maxIterations` (number, optional): Max iterations for sub-agent
- `agentId` (string, optional): Agent ID to resume (for getting results)

**Modes:**
- `blocking`: Wait for agent to complete before returning
- `background`: Start agent and return immediately. Use `agentId` to check later.

**Example - Blocking:**
```typescript
{
  description: 'Find all TypeScript errors',
  prompt: 'Search the codebase for TypeScript compilation errors and list them',
  mode: 'blocking',
  role: 'finder',
  tools: ['grep', 'glob', 'bash']
}
```

**Example - Background:**
```typescript
{
  description: 'Run comprehensive tests',
  prompt: 'Run all unit tests and integration tests, report failures',
  mode: 'background',
  maxIterations: 30
}
```

**Example - Check Result:**
```typescript
{
  agentId: 'agent-123456',
  mode: 'blocking'  // or 'background' for non-blocking check
}
```

**Returns (Completed):**
```typescript
{
  agentId: string;
  status: 'completed' | 'failed';
  result: string;           // Final response from agent
  steps: number;            // Number of steps executed
  tokens: number;           // Total tokens used
  cost: number;             // Total cost
  duration: number;         // Duration in milliseconds
}
```

**Returns (Running - background mode):**
```typescript
{
  agentId: string;
  status: 'running';
  message: string;
}
```

---

## Tool Usage Best Practices

### 1. Prefer Specialized Tools
- Use `grep` instead of `bash -c "grep ..."`
- Use `glob` instead of `bash -c "find ..."`
- This provides better error handling and structured output

### 2. Use Todo Tool Frequently
Update the todo list as you make progress:
```typescript
// At start
{ action: 'write', todos: [
  { content: 'Analyze codebase', status: 'in_progress', activeForm: 'Analyzing codebase' },
  { content: 'Generate report', status: 'pending', activeForm: 'Generating report' }
]}

// After completing first task
{ action: 'update', todos: [
  { content: 'Analyze codebase', status: 'completed', activeForm: 'Analyzing codebase' },
  { content: 'Generate report', status: 'in_progress', activeForm: 'Generating report' }
]}
```

### 3. Spawn Sub-Agents Wisely
Use sub-agents to:
- **Isolate context**: Keep your context clean for complex reasoning
- **Parallel work**: Run multiple investigations simultaneously (background mode)
- **Specialized roles**: Use role-specific tool sets

**Don't overuse:**
- For simple one-step tasks
- When you need immediate results and task is quick

### 4. Diff Before Writing
When modifying files, show diff first:
```typescript
// 1. Read current content
{ path: 'file.ts' }

// 2. Show diff
{ oldPath: 'file.ts', newContent: '...' }

// 3. Write if approved
{ path: 'file.ts', content: '...' }
```

---

## Token Costs

Each tool has an estimated token cost (added to system prompt):

| Tool | Token Cost |
|------|-----------|
| read_file | 50 |
| write_file | 60 |
| diff | 80 |
| bash | 90 |
| grep | 100 |
| glob | 70 |
| todo | 60 |
| task | 120 |

Total system prompt size = base prompt + sum of enabled tools' token costs.
