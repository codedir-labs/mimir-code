# Tool System - Implementation Plan

## Overview

Comprehensive tool system for Mimir, including built-in tools, MCP integration, and custom tools with TypeScript code execution.

## Goals

1. **Built-in Tools**: Core tools (file ops, bash, git, search)
2. **Tool Configuration**: Enable/disable tools, track token costs
3. **Custom Tools**: User-defined tools with TypeScript code
4. **MCP Integration**: Dynamic tool loading from MCP servers
5. **Permission System**: Inherit permission checks for all tools
6. **Token Tracking**: Show system prompt size impact per tool
7. **/tools Command**: Manage tools interactively

---

## Architecture

### 1. Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<any>; // Zod schema for argument validation
  enabled: boolean;
  tokenCost: number; // Estimated tokens this tool adds to system prompt
  source: 'built-in' | 'custom' | 'mcp' | 'teams';
  execute(args: any, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  // Platform abstractions
  platform: {
    fs: IFileSystem;
    executor: IProcessExecutor;
    docker: IDockerClient;
  };

  // Configuration
  config: Config;

  // Conversation context
  conversation?: {
    id: string;
    messages: Message[];
    workingDirectory: string;
  };

  // Utilities
  logger: Logger;
  llm: ILLMProvider; // Allow tools to call LLM if needed

  // Permissions
  permissions: PermissionChecker;
}

interface ToolResult {
  success: boolean;
  output: string; // Formatted output for LLM
  metadata?: {
    duration: number;
    tokensUsed?: number;
    cost?: number;
  };
  error?: string;
}
```

### 2. Tool Registry

```typescript
class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config: Config;

  constructor(
    private fs: IFileSystem,
    private teamsClient?: TeamsAPIClient
  ) {}

  async loadAll(config: Config): Promise<void> {
    this.config = config;

    // 1. Load built-in tools
    await this.loadBuiltInTools();

    // 2. Load Teams/Enterprise tools (if authenticated)
    if (config.teams?.enabled && config.teams.features.sharedTools) {
      await this.loadTeamsTools();
    }

    // 3. Load MCP tools (if configured)
    if (config.mcp?.enabled) {
      await this.loadMCPTools();
    }

    // 4. Load custom local tools (if allowed)
    if (!config.enforcement?.disableLocalTools) {
      await this.loadCustomTools();
    }

    // Filter by enabled status
    this.filterDisabledTools();
  }

  private async loadBuiltInTools(): Promise<void> {
    const builtInTools = [
      new FileOperationsTool(),
      new FileSearchTool(),
      new BashExecutionTool(),
      new GitTool(),
    ];

    for (const tool of builtInTools) {
      this.registerTool(tool);
    }
  }

  private async loadTeamsTools(): Promise<void> {
    const teamsTools = await this.teamsClient!.listTools(
      this.config.teams!.orgId
    );

    for (const toolDef of teamsTools) {
      const tool = await this.buildCustomTool(toolDef);
      this.registerTool(tool);
    }
  }

  private async loadMCPTools(): Promise<void> {
    const mcpClient = new MCPClient(this.config.mcp!);
    await mcpClient.connect();

    const mcpTools = await mcpClient.listTools();

    for (const mcpTool of mcpTools) {
      this.registerTool(new MCPToolAdapter(mcpTool, mcpClient));
    }
  }

  private async loadCustomTools(): Promise<void> {
    const toolsDir = '.mimir/tools/';

    if (!(await this.fs.exists(toolsDir))) {
      return;
    }

    const toolFiles = await this.fs.glob(`${toolsDir}/*.yml`);

    for (const file of toolFiles) {
      try {
        const toolDef = await this.loadToolDefinition(file);
        const tool = await this.buildCustomTool(toolDef);
        this.registerTool(tool);
      } catch (error) {
        console.warn(`Failed to load tool from ${file}:`, error);
      }
    }
  }

  private async loadToolDefinition(
    file: string
  ): Promise<CustomToolDefinition> {
    const content = await this.fs.readFile(file, 'utf-8');
    const parsed = yaml.parse(content);

    // Validate schema
    const schema = z.object({
      name: z.string(),
      description: z.string(),
      enabled: z.boolean().default(true),
      tokenCost: z.number().optional(),
      schema: z.object({
        type: z.literal('object'),
        properties: z.record(z.any()),
        required: z.array(z.string()).optional(),
      }),
      runtime: z.enum(['node', 'typescript']).default('typescript'),
      code: z.string(),
      permissions: z.object({
        allowlist: z.array(z.string()).optional(),
        autoAccept: z.boolean().optional(),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      }).optional(),
    });

    return schema.parse(parsed);
  }

  private async buildCustomTool(
    def: CustomToolDefinition
  ): Promise<Tool> {
    // Build Zod schema from JSON schema
    const zodSchema = this.jsonSchemaToZod(def.schema);

    // Compile and sandbox TypeScript code
    const executor = await this.createToolExecutor(def);

    return {
      name: def.name,
      description: def.description,
      schema: zodSchema,
      enabled: def.enabled ?? true,
      tokenCost: def.tokenCost ?? this.estimateTokenCost(def),
      source: 'custom',
      execute: async (args: any, context: ToolContext) => {
        return await executor.execute(args, context);
      },
    };
  }

  private async createToolExecutor(
    def: CustomToolDefinition
  ): Promise<CustomToolExecutor> {
    if (def.runtime === 'typescript') {
      return new TypeScriptToolExecutor(def, this.fs);
    }

    throw new Error(`Unsupported runtime: ${def.runtime}`);
  }

  private filterDisabledTools(): void {
    const toolsConfig = this.config.tools ?? {};

    for (const [name, tool] of this.tools.entries()) {
      // Check if disabled in config
      if (toolsConfig[name]?.enabled === false) {
        this.tools.delete(name);
      }
    }
  }

  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} already registered, skipping`);
      return;
    }

    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolsForLLM(): ToolDefinitionForLLM[] {
    return this.getAllTools()
      .filter(tool => tool.enabled)
      .map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.schema),
      }));
  }

  getTotalTokenCost(): number {
    return this.getAllTools()
      .filter(tool => tool.enabled)
      .reduce((sum, tool) => sum + tool.tokenCost, 0);
  }

  private estimateTokenCost(def: CustomToolDefinition): number {
    // Estimate based on description + schema size
    const descriptionTokens = Math.ceil(def.description.length / 4);
    const schemaTokens = Math.ceil(JSON.stringify(def.schema).length / 4);
    return descriptionTokens + schemaTokens;
  }

  private jsonSchemaToZod(schema: any): z.ZodObject<any> {
    // Convert JSON schema to Zod schema
    // (simplified implementation, full version would handle all JSON schema features)
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as any;

      if (propSchema.type === 'string') {
        shape[key] = z.string();
      } else if (propSchema.type === 'number') {
        shape[key] = z.number();
      } else if (propSchema.type === 'boolean') {
        shape[key] = z.boolean();
      } else if (propSchema.type === 'array') {
        shape[key] = z.array(z.any());
      } else {
        shape[key] = z.any();
      }

      if (propSchema.description) {
        shape[key] = shape[key].describe(propSchema.description);
      }

      if (!schema.required?.includes(key)) {
        shape[key] = shape[key].optional();
      }
    }

    return z.object(shape);
  }
}
```

### 3. Custom Tool Execution (TypeScript)

```typescript
interface CustomToolDefinition {
  name: string;
  description: string;
  enabled: boolean;
  tokenCost?: number;
  schema: JSONSchema;
  runtime: 'typescript' | 'node';
  code: string;
  permissions?: {
    allowlist?: string[];
    autoAccept?: boolean;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  };
}

class TypeScriptToolExecutor {
  private compiledCode?: string;
  private sandboxDocker: IDockerClient;

  constructor(
    private definition: CustomToolDefinition,
    private fs: IFileSystem
  ) {
    this.sandboxDocker = new DockerClient(); // For isolated execution
  }

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // 1. Compile TypeScript to JavaScript (if not already compiled)
    if (!this.compiledCode) {
      this.compiledCode = await this.compile();
    }

    // 2. Execute in Docker sandbox (isolated context)
    return await this.executeInSandbox(args, context);
  }

  private async compile(): Promise<string> {
    // Option 1: Use esbuild for fast compilation
    const result = await esbuild.build({
      stdin: {
        contents: this.definition.code,
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      write: false,
    });

    return result.outputFiles[0].text;

    // Option 2: Use tsc or tsx (slower but more compatible)
    // const tempFile = await this.fs.writeTemp('tool.ts', this.definition.code);
    // await this.executor.execute({ command: 'npx', args: ['tsc', tempFile] });
    // return await this.fs.readFile(tempFile.replace('.ts', '.js'));
  }

  private async executeInSandbox(
    args: any,
    context: ToolContext
  ): Promise<ToolResult> {
    // Create sandbox environment with limited context
    const sandboxContext = this.createSandboxContext(context);

    // Prepare execution script
    const script = this.buildExecutionScript(args, sandboxContext);

    // Run in Docker container (isolated)
    const result = await this.sandboxDocker.runContainer({
      image: 'mimir/tool-sandbox:node18',
      command: ['node', '-e', script],
      env: {
        ARGS: JSON.stringify(args),
        CONTEXT: JSON.stringify(sandboxContext),
      },
      timeout: 30000, // 30 second timeout
      memory: '256m',
      cpus: 1,
    });

    // Parse result
    try {
      const output = JSON.parse(result.stdout);
      return {
        success: result.exitCode === 0,
        output: output.result,
        metadata: {
          duration: result.duration,
        },
        error: output.error,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Tool execution failed: ${error.message}`,
      };
    }
  }

  private createSandboxContext(context: ToolContext): SandboxContext {
    // Provide limited, serializable context to sandbox
    return {
      config: {
        // Only expose non-sensitive config
        workingDirectory: context.conversation?.workingDirectory,
        // Don't expose API keys, tokens, etc.
      },
      conversation: context.conversation
        ? {
            id: context.conversation.id,
            workingDirectory: context.conversation.workingDirectory,
            // Don't include full message history (could be huge)
          }
        : undefined,
    };
  }

  private buildExecutionScript(
    args: any,
    sandboxContext: SandboxContext
  ): string {
    return `
      const { platform, logger } = require('./sandbox-runtime');

      // User's compiled tool code
      ${this.compiledCode}

      // Execute tool
      (async () => {
        try {
          const args = JSON.parse(process.env.ARGS);
          const context = {
            platform,
            logger,
            config: JSON.parse(process.env.CONTEXT).config,
            conversation: JSON.parse(process.env.CONTEXT).conversation,
          };

          const result = await execute(args, context);

          console.log(JSON.stringify({
            result: result,
            error: null
          }));
        } catch (error) {
          console.log(JSON.stringify({
            result: null,
            error: error.message
          }));
        }
      })();
    `;
  }
}

// Sandbox runtime (injected into Docker container)
// Provides safe platform abstractions
class SandboxRuntime {
  platform = {
    fs: {
      async readFile(path: string): Promise<string> {
        // Validate path (prevent escaping working directory)
        // Call host via IPC/API
      },
      async writeFile(path: string, content: string): Promise<void> {
        // Validate and call host
      },
      // ... other safe fs operations
    },
    executor: {
      async execute(command: string, args: string[]): Promise<any> {
        // Require permission check on host
        // Execute on host (not in sandbox)
      },
    },
  };

  logger = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
  };
}
```

### 4. Example Custom Tool Definition

```yaml
# .mimir/tools/run_tests.yml
name: run_tests
description: Run project tests and analyze failures. Returns test results with failure details.
enabled: true
tokenCost: 450  # Estimated tokens for description + schema

schema:
  type: object
  properties:
    pattern:
      type: string
      description: Test file pattern to match (e.g., "*.test.ts", "auth/**")
    coverage:
      type: boolean
      description: Include coverage report in output
    watch:
      type: boolean
      description: Run in watch mode (not recommended for LLM)
  required: [pattern]

runtime: typescript

permissions:
  # Commands this tool is allowed to run
  allowlist:
    - "yarn test*"
    - "npm test*"
    - "vitest*"
  autoAccept: false  # Prompt user before running
  riskLevel: medium

code: |
  interface TestArgs {
    pattern: string;
    coverage?: boolean;
    watch?: boolean;
  }

  interface TestResult {
    passed: number;
    failed: number;
    failures: Array<{
      file: string;
      test: string;
      error: string;
    }>;
    coverage?: {
      lines: number;
      branches: number;
      functions: number;
    };
  }

  export async function execute(
    args: TestArgs,
    context: ToolContext
  ): Promise<string> {
    const { platform, logger } = context;

    logger.info(`Running tests matching: ${args.pattern}`);

    // Build test command
    const testCmd = ['test', args.pattern];
    if (args.coverage) {
      testCmd.push('--coverage');
    }

    // Execute tests
    const result = await platform.executor.execute({
      command: 'yarn',
      args: testCmd,
      cwd: context.conversation?.workingDirectory,
    });

    // Parse test output (Vitest format)
    const testResult = parseTestOutput(result.stdout);

    // Format result for LLM
    if (testResult.failed === 0) {
      return `✓ All ${testResult.passed} tests passed!${
        args.coverage ? `\n\nCoverage: ${testResult.coverage?.lines}% lines` : ''
      }`;
    } else {
      let output = `✗ ${testResult.failed} tests failed (${testResult.passed} passed)\n\n`;
      output += 'Failures:\n';

      for (const failure of testResult.failures) {
        output += `\n${failure.file} > ${failure.test}\n`;
        output += `  ${failure.error}\n`;
      }

      return output;
    }
  }

  function parseTestOutput(stdout: string): TestResult {
    // Parse Vitest output format
    const lines = stdout.split('\n');

    const result: TestResult = {
      passed: 0,
      failed: 0,
      failures: [],
    };

    // Example parsing (simplified)
    for (const line of lines) {
      if (line.includes('PASS')) {
        result.passed++;
      } else if (line.includes('FAIL')) {
        result.failed++;
        // Parse failure details...
      }
    }

    return result;
  }
```

### 5. Configuration Schema (Extended)

```yaml
# .mimir/config.yml
tools:
  # Built-in tools
  file_operations:
    enabled: true
  file_search:
    enabled: true
  bash_execution:
    enabled: true
  git:
    enabled: true

  # Custom tools (can be disabled individually)
  run_tests:
    enabled: true
  analyze_dependencies:
    enabled: false  # Disable if not needed

  # Global tool settings
  showTokenCosts: true  # Show token cost in /tools command
  autoLoadCustomTools: true  # Auto-load from .mimir/tools/
  maxExecutionTime: 60000  # Max execution time per tool (ms)
```

### 6. /tools Command (In-Chat Management)

```typescript
class ToolsCommand {
  async execute(args: string[], config: Config): Promise<void> {
    const subcommand = args[0];

    switch (subcommand) {
      case 'list':
        await this.listTools();
        break;
      case 'enable':
        await this.enableTool(args[1]);
        break;
      case 'disable':
        await this.disableTool(args[1]);
        break;
      case 'info':
        await this.showToolInfo(args[1]);
        break;
      case 'tokens':
        await this.showTokenCosts();
        break;
      default:
        await this.listTools();
    }
  }

  private async listTools(): Promise<void> {
    const tools = this.registry.getAllTools();
    const totalTokens = this.registry.getTotalTokenCost();

    console.log('Available Tools:\n');

    for (const tool of tools) {
      const status = tool.enabled ? '✓' : '✗';
      const source = this.formatSource(tool.source);

      console.log(
        `${status} ${tool.name.padEnd(25)} ${source.padEnd(12)} ~${tool.tokenCost} tokens`
      );
    }

    console.log(`\nTotal system prompt cost: ~${totalTokens} tokens`);
    console.log('\nUsage:');
    console.log('  /tools enable <name>   - Enable a tool');
    console.log('  /tools disable <name>  - Disable a tool');
    console.log('  /tools info <name>     - Show tool details');
    console.log('  /tools tokens          - Show token breakdown');
  }

  private async showTokenCosts(): Promise<void> {
    const tools = this.registry.getAllTools();

    console.log('Token Cost Breakdown:\n');

    const sorted = tools
      .filter(t => t.enabled)
      .sort((a, b) => b.tokenCost - a.tokenCost);

    for (const tool of sorted) {
      const bar = this.createBar(tool.tokenCost, 50);
      console.log(`${tool.name.padEnd(25)} ${bar} ${tool.tokenCost}`);
    }

    const total = this.registry.getTotalTokenCost();
    console.log(`\nTotal: ${total} tokens (~$${this.estimateCost(total)})`);
  }

  private async enableTool(name: string): Promise<void> {
    const tool = this.registry.getTool(name);

    if (!tool) {
      console.error(`Tool not found: ${name}`);
      return;
    }

    if (tool.enabled) {
      console.log(`Tool already enabled: ${name}`);
      return;
    }

    // Update config
    await this.configManager.updateToolConfig(name, { enabled: true });

    console.log(`✓ Enabled tool: ${name} (+${tool.tokenCost} tokens)`);
  }

  private async disableTool(name: string): Promise<void> {
    const tool = this.registry.getTool(name);

    if (!tool) {
      console.error(`Tool not found: ${name}`);
      return;
    }

    if (!tool.enabled) {
      console.log(`Tool already disabled: ${name}`);
      return;
    }

    // Cannot disable if enforced by Teams
    if (this.isEnforced(tool)) {
      console.error(
        `Cannot disable tool: ${name} (enforced by enterprise policy)`
      );
      return;
    }

    // Update config
    await this.configManager.updateToolConfig(name, { enabled: false });

    console.log(`✗ Disabled tool: ${name} (-${tool.tokenCost} tokens)`);
  }

  private async showToolInfo(name: string): Promise<void> {
    const tool = this.registry.getTool(name);

    if (!tool) {
      console.error(`Tool not found: ${name}`);
      return;
    }

    console.log(`\nTool: ${tool.name}`);
    console.log(`Description: ${tool.description}`);
    console.log(`Source: ${this.formatSource(tool.source)}`);
    console.log(`Enabled: ${tool.enabled ? 'Yes' : 'No'}`);
    console.log(`Token Cost: ~${tool.tokenCost} tokens`);
    console.log('\nParameters:');

    const schema = zodToJsonSchema(tool.schema);
    console.log(JSON.stringify(schema, null, 2));
  }

  private formatSource(source: string): string {
    const badges = {
      'built-in': '[Built-in]',
      'custom': '[Custom]',
      'mcp': '[MCP]',
      'teams': '[Teams]',
    };
    return badges[source] || `[${source}]`;
  }

  private createBar(value: number, maxWidth: number): string {
    const max = 1000; // Max expected token cost
    const width = Math.min(Math.round((value / max) * maxWidth), maxWidth);
    return '█'.repeat(width) + '░'.repeat(maxWidth - width);
  }

  private estimateCost(tokens: number): string {
    // Rough estimate: $0.001 per 1000 tokens (varies by provider)
    return (tokens / 1000 * 0.001).toFixed(4);
  }

  private isEnforced(tool: Tool): boolean {
    // Check if tool is enforced by Teams config
    return tool.source === 'teams';
  }
}
```

Example output:
```
$ /tools

Available Tools:

✓ file_operations          [Built-in]   ~320 tokens
✓ file_search              [Built-in]   ~280 tokens
✓ bash_execution           [Built-in]   ~350 tokens
✓ git                      [Built-in]   ~420 tokens
✓ run_tests                [Custom]     ~450 tokens
✗ analyze_dependencies     [Custom]     ~380 tokens
✓ security_scan            [Teams]      ~520 tokens

Total system prompt cost: ~2720 tokens

Usage:
  /tools enable <name>   - Enable a tool
  /tools disable <name>  - Disable a tool
  /tools info <name>     - Show tool details
  /tools tokens          - Show token breakdown

$ /tools tokens

Token Cost Breakdown:

security_scan             ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 520
run_tests                 ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 450
git                       █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 420
bash_execution            ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 350
file_operations           ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 320
file_search               ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 280

Total: 2340 tokens (~$0.0023)
```

---

## Built-in Tools

### 1. File Operations Tool

```typescript
class FileOperationsTool implements Tool {
  name = 'file_operations';
  description = 'Read, write, edit, list, and delete files';
  enabled = true;
  tokenCost = 320;
  source = 'built-in' as const;

  schema = z.object({
    operation: z.enum(['read', 'write', 'edit', 'list', 'delete', 'exists']),
    path: z.string().describe('File or directory path'),
    content: z.string().optional().describe('Content to write (for write/edit)'),
    pattern: z.string().optional().describe('Search pattern for edit operation'),
    replacement: z.string().optional().describe('Replacement text for edit'),
    backup: z.boolean().optional().default(true).describe('Create backup before changes'),
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    const { operation, path } = args;

    switch (operation) {
      case 'read':
        return await this.read(path, context);
      case 'write':
        return await this.write(path, args.content, args.backup, context);
      case 'edit':
        return await this.edit(path, args.pattern, args.replacement, args.backup, context);
      case 'list':
        return await this.list(path, context);
      case 'delete':
        return await this.delete(path, context);
      case 'exists':
        return await this.exists(path, context);
      default:
        return { success: false, output: '', error: 'Unknown operation' };
    }
  }

  private async read(path: string, context: ToolContext): Promise<ToolResult> {
    try {
      const content = await context.platform.fs.readFile(path, 'utf-8');
      return {
        success: true,
        output: `Content of ${path}:\n\n${content}`,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to read ${path}: ${error.message}`,
      };
    }
  }

  // ... other operations
}
```

### 2. File Search Tool

```typescript
class FileSearchTool implements Tool {
  name = 'file_search';
  description = 'Search files using grep, glob patterns, or regex';
  enabled = true;
  tokenCost = 280;
  source = 'built-in' as const;

  schema = z.object({
    mode: z.enum(['grep', 'glob', 'regex']),
    query: z.string().describe('Search query or pattern'),
    path: z.string().optional().describe('Directory to search (default: current)'),
    include: z.array(z.string()).optional().describe('File patterns to include'),
    exclude: z.array(z.string()).optional().describe('File patterns to exclude'),
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // Implementation using ripgrep or native search
  }
}
```

### 3. Bash Execution Tool

```typescript
class BashExecutionTool implements Tool {
  name = 'bash_execution';
  description = 'Execute shell commands with permission checks';
  enabled = true;
  tokenCost = 350;
  source = 'built-in' as const;

  schema = z.object({
    command: z.string().describe('Command to execute'),
    args: z.array(z.string()).optional().describe('Command arguments'),
    timeout: z.number().optional().default(30000).describe('Timeout in ms'),
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // 1. Check permissions
    const allowed = await context.permissions.checkPermission(
      `${args.command} ${args.args?.join(' ') || ''}`,
      context.config
    );

    if (!allowed) {
      return {
        success: false,
        output: '',
        error: 'Permission denied',
      };
    }

    // 2. Execute
    try {
      const result = await context.platform.executor.execute({
        command: args.command,
        args: args.args,
        timeout: args.timeout,
      });

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message,
      };
    }
  }
}
```

### 4. Git Tool

```typescript
class GitTool implements Tool {
  name = 'git';
  description = 'Execute git operations (status, diff, log, commit, etc.)';
  enabled = true;
  tokenCost = 420;
  source = 'built-in' as const;

  schema = z.object({
    operation: z.enum(['status', 'diff', 'log', 'commit', 'branch', 'checkout']),
    args: z.array(z.string()).optional(),
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // Git operations with permission checks for destructive operations
  }
}
```

---

## MCP Integration

```typescript
class MCPToolAdapter implements Tool {
  constructor(
    private mcpTool: MCPToolDefinition,
    private mcpClient: MCPClient
  ) {}

  get name(): string {
    return `mcp_${this.mcpTool.server}_${this.mcpTool.name}`;
  }

  get description(): string {
    return this.mcpTool.description;
  }

  get enabled(): boolean {
    return true;
  }

  get tokenCost(): number {
    // Estimate based on MCP tool description
    return Math.ceil(this.description.length / 4) + 100;
  }

  get source(): 'mcp' {
    return 'mcp';
  }

  get schema(): z.ZodObject<any> {
    // Convert MCP schema to Zod
    return this.convertMCPSchemaToZod(this.mcpTool.schema);
  }

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // Forward to MCP server
    const result = await this.mcpClient.callTool(
      this.mcpTool.server,
      this.mcpTool.name,
      args
    );

    return {
      success: result.success,
      output: result.content,
      error: result.error,
    };
  }
}
```

---

## Testing Strategy

### Unit Tests
- Tool registry loading (built-in, custom, MCP, teams)
- Tool execution (mocked context)
- Permission checking
- Token cost estimation
- Config updates (/tools enable/disable)

### Integration Tests
- Custom tool compilation (TypeScript → JavaScript)
- Sandbox execution (Docker container)
- MCP tool loading and execution
- Teams tool sync

### End-to-End Tests
- Full tool lifecycle (load → execute → result)
- /tools command interactions
- Permission prompt flows

---

## Security Considerations

1. **Sandboxed Execution**: Custom tools run in Docker containers
2. **Permission Inheritance**: All tools go through permission system
3. **Path Validation**: Prevent directory traversal attacks
4. **Timeout Enforcement**: Prevent infinite loops
5. **Resource Limits**: CPU, memory limits for sandbox
6. **Code Review**: Teams tools reviewed by admin before deployment

---

## Implementation Phases

### Phase 1: Core Tool System
- [ ] Tool interface and registry
- [ ] Built-in tools (file ops, search, bash, git)
- [ ] Tool configuration schema
- [ ] Token cost tracking

### Phase 2: /tools Command
- [ ] List tools
- [ ] Enable/disable tools
- [ ] Show token costs
- [ ] Tool info display

### Phase 3: Custom Tools
- [ ] YAML definition loader
- [ ] TypeScript compilation (esbuild)
- [ ] Docker sandbox execution
- [ ] Context injection
- [ ] Permission system integration

### Phase 4: MCP Integration
- [ ] MCP tool adapter
- [ ] Dynamic MCP tool loading
- [ ] MCP server lifecycle management

### Phase 5: Teams Integration
- [ ] Teams tools loading
- [ ] Enforced tools (cannot be disabled)
- [ ] Teams allowlist integration

---

## Next Steps

1. Implement core tool registry
2. Build built-in tools
3. Add /tools command
4. Create custom tool system
5. Integrate with agent loop
