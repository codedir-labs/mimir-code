# Execution Modes & Security Architecture for Mimir

**Date**: 2025-12-28
**Status**: Architecture Design (Revised - Simplified)
**Replaces**: SANDBOXING-AND-CLOUD-CONTEXT.md (over-engineered approach)

---

## 🎯 Design Philosophy

**Key Principle**: Make it work like developers expect, not like we think they should work.

**Research Summary**:
- ✅ **Cursor, Windsurf, Continue.dev**: Run natively, NO Docker by default
- ✅ **Claude Code CLI**: Native execution, optional OS-level sandboxing
- ✅ **GitHub Copilot**: Native IDE integration
- ✅ **Primary security**: Permission systems (allowlist/deny), NOT containers
- ✅ **Performance**: Instant startup > Container overhead
- ✅ **UX**: Works with existing environment > Custom images

**Mimir's Approach**:
1. **Default to native** (fast, seamless)
2. **Support dev containers** (industry standard)
3. **Optional Docker** (user-provided images)
4. **Cloud for enterprise** (Teams compliance)
5. **NO custom Mimir images** (users provide their own or none)

---

## 📊 Execution Modes

### Overview

```
┌─────────────────────────────────────────────────────┐
│          Mimir Execution Modes (Priority)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Native (Default)                                │
│     ├─ Runs directly on host machine               │
│     ├─ Permission system for security               │
│     ├─ Instant startup, no overhead                 │
│     └─ Use case: 99% of development                 │
│                                                     │
│  2. Dev Container (Auto-detect)                     │
│     ├─ Uses existing .devcontainer/devcontainer.json│
│     ├─ Container isolation + permissions            │
│     ├─ Fast if image cached                         │
│     └─ Use case: Projects with dev containers       │
│                                                     │
│  3. Docker (User-provided)                          │
│     ├─ User's Dockerfile/image/docker-compose.yml   │
│     ├─ Full container isolation                     │
│     ├─ Slower startup (image pull)                  │
│     └─ Use case: Custom security requirements       │
│                                                     │
│  4. Cloud (Teams/Enterprise)                        │
│     ├─ Isolated VMs via Mimir Teams API             │
│     ├─ Centralized audit logs                       │
│     ├─ Network proxy with allowlisting              │
│     └─ Use case: Enterprise compliance              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🏗️ Mode 1: Native Execution (Default)

### Overview

**How it works**:
- Execute commands directly on host machine
- Permission system as primary security layer
- Filesystem restrictions (read anywhere, write in project only)
- Risk assessment before execution

**Configuration**:
```yaml
# .mimir/config.yml
execution:
  mode: native  # Default

# Primary security: Permission system
permissions:
  mode: prompt  # prompt | auto-accept | strict

  allowlist:
    # Specific allowed commands
    - type: bash
      pattern: 'npm run test:*'
    - type: bash
      pattern: 'git status'
    - type: file_write
      pattern: 'src/**/*.ts'

  denylist:
    # Explicit denials (override allows)
    - type: bash
      pattern: 'curl:*'
    - type: bash
      pattern: 'rm -rf *'
    - type: file_write
      pattern: '.env'
    - type: file_write
      pattern: '.git/**'

  # Risk assessment for unlisted commands
  riskAssessment:
    autoAccept: low     # Auto-accept low-risk
    prompt: medium      # Prompt for medium-risk
    deny: high          # Auto-deny high-risk
    deny: critical      # Auto-deny critical-risk

# Filesystem restrictions
filesystem:
  readAccess: anywhere  # Can read entire filesystem (like Claude Code)
  writeAccess:
    - ${PROJECT_DIR}/**  # Can only write in project
  deniedPaths:
    - ${HOME}/.ssh/**
    - /etc/**
    - /bin/**
```

### Security Model

**Permission Flow**:
```
Agent wants to execute command
          ↓
    Check allowlist
          ↓ Not found
    Check denylist
          ↓ Not found
    Risk assessment
          ↓
  ┌─────────────────┐
  │ Low risk?       │ → Auto-accept
  │ Medium risk?    │ → Prompt user
  │ High/Critical?  │ → Auto-deny
  └─────────────────┘
          ↓
    Execute (if approved)
          ↓
    Audit log
```

**Risk Levels**:
```typescript
enum RiskLevel {
  Low = 'low',           // ls, cat, echo, git status
  Medium = 'medium',     // npm install, git commit, file writes
  High = 'high',         // rm, mv, chmod, network commands
  Critical = 'critical', // rm -rf, curl, wget, dd
}
```

### Implementation

```typescript
/**
 * Native executor - runs commands directly on host
 */
export class NativeExecutor implements IExecutor {
  constructor(
    private fs: IFileSystem,
    private process: IProcessExecutor,
    private permissionManager: PermissionManager,
    private config: ExecutionConfig
  ) {}

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    // 1. Check permission
    const permission = await this.permissionManager.checkPermission({
      type: 'bash',
      command,
      workingDir: options.cwd || process.cwd(),
    });

    if (!permission.allowed) {
      throw new PermissionDeniedError(
        `Command denied: ${command}`,
        permission.reason
      );
    }

    // 2. Validate working directory (must be in project)
    const cwd = options.cwd || process.cwd();
    if (!this.isWithinProject(cwd)) {
      throw new SecurityError(
        `Working directory outside project: ${cwd}`
      );
    }

    // 3. Execute command
    const startTime = Date.now();
    try {
      const result = await this.process.execute(command, {
        cwd,
        env: options.env,
        timeout: options.timeout || 120_000,
      });

      // 4. Audit log
      await this.auditLog({
        type: 'bash',
        command,
        result: 'success',
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      // Audit log failure
      await this.auditLog({
        type: 'bash',
        command,
        result: 'failure',
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  async readFile(filePath: string): Promise<string> {
    // Can read anywhere (like Claude Code)
    return await this.fs.readFile(filePath, 'utf-8');
  }

  async writeFile(
    filePath: string,
    content: string
  ): Promise<void> {
    // Check if path is within allowed write locations
    if (!this.canWrite(filePath)) {
      throw new PermissionDeniedError(
        `Cannot write to ${filePath} (outside project)`
      );
    }

    // Check permission
    const permission = await this.permissionManager.checkPermission({
      type: 'file_write',
      path: filePath,
    });

    if (!permission.allowed) {
      throw new PermissionDeniedError(
        `Write denied: ${filePath}`,
        permission.reason
      );
    }

    await this.fs.writeFile(filePath, content, 'utf-8');
  }

  private isWithinProject(path: string): boolean {
    const projectDir = this.config.projectDir;
    const resolved = this.fs.resolve(path);
    return resolved.startsWith(projectDir);
  }

  private canWrite(filePath: string): boolean {
    const resolved = this.fs.resolve(filePath);
    const projectDir = this.config.projectDir;

    // Must be within project
    if (!resolved.startsWith(projectDir)) {
      return false;
    }

    // Check denied paths
    for (const deniedPath of this.config.filesystem.deniedPaths) {
      if (this.matchesGlob(resolved, deniedPath)) {
        return false;
      }
    }

    return true;
  }
}
```

---

## 🏗️ Mode 2: Dev Container (Auto-detect)

### Overview

**How it works**:
- Auto-detect `.devcontainer/devcontainer.json` in project
- Use user's existing dev container configuration
- NO custom Mimir images - use what's already there
- Same permission system on top of container isolation

**Configuration**:
```yaml
# .mimir/config.yml
execution:
  mode: devcontainer  # OR auto-detect

devcontainer:
  autoDetect: true  # Default: auto-detect .devcontainer/devcontainer.json

  # Optional: Custom path
  configPath: .devcontainer/devcontainer.json

  # Optional: Override specific settings
  overrides:
    network: limited
    allowedDomains:
      - github.com
      - npmjs.com
```

**Example `.devcontainer/devcontainer.json`** (user-provided):
```json
{
  "name": "My TypeScript Project",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",

  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  },

  "postCreateCommand": "npm install",
  "remoteUser": "node",

  "mounts": [
    "source=${localWorkspaceFolder},target=/workspace,type=bind"
  ]
}
```

### Implementation

```typescript
/**
 * Dev container executor - uses existing .devcontainer/devcontainer.json
 */
export class DevContainerExecutor implements IExecutor {
  private container: Docker.Container | null = null;
  private config: DevContainerConfig | null = null;

  constructor(
    private docker: Docker,
    private fs: IFileSystem,
    private permissionManager: PermissionManager,
    private projectDir: string
  ) {}

  /**
   * Auto-detect and load dev container config
   */
  async initialize(): Promise<void> {
    const configPath = path.join(
      this.projectDir,
      '.devcontainer/devcontainer.json'
    );

    if (!(await this.fs.exists(configPath))) {
      throw new Error('No .devcontainer/devcontainer.json found');
    }

    const configContent = await this.fs.readFile(configPath, 'utf-8');
    this.config = JSON.parse(configContent);

    // Create container from user's config
    await this.createContainer();
  }

  private async createContainer(): Promise<void> {
    if (!this.config) {
      throw new Error('Dev container config not loaded');
    }

    // Pull image if needed
    if (this.config.image) {
      console.log(`Pulling image: ${this.config.image}`);
      await this.pullImage(this.config.image);
    } else if (this.config.build?.dockerfile) {
      // Build from Dockerfile
      const dockerfilePath = path.join(
        this.projectDir,
        this.config.build.dockerfile
      );
      console.log(`Building from Dockerfile: ${dockerfilePath}`);
      await this.buildImage(dockerfilePath);
    }

    // Create container
    this.container = await this.docker.createContainer({
      Image: this.config.image || 'devcontainer-built',
      HostConfig: {
        Binds: this.buildMounts(),
      },
      WorkingDir: '/workspace',
      Env: this.buildEnv(),
      Cmd: ['/bin/sh', '-c', 'sleep infinity'], // Keep alive
    });

    await this.container.start();

    // Run postCreateCommand if specified
    if (this.config.postCreateCommand) {
      console.log('Running postCreateCommand...');
      await this.execute(this.config.postCreateCommand);
    }
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    if (!this.container) {
      throw new Error('Container not initialized');
    }

    // Check permission (same as native)
    const permission = await this.permissionManager.checkPermission({
      type: 'bash',
      command,
      workingDir: '/workspace',
    });

    if (!permission.allowed) {
      throw new PermissionDeniedError(
        `Command denied: ${command}`,
        permission.reason
      );
    }

    // Execute in container
    const exec = await this.container.exec({
      Cmd: ['/bin/sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options.cwd || '/workspace',
      Env: options.env,
    });

    const stream = await exec.start({});
    const output = await this.collectOutput(stream);
    const inspect = await exec.inspect();

    return {
      exitCode: inspect.ExitCode || 0,
      stdout: output.stdout,
      stderr: output.stderr,
    };
  }

  async cleanup(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      await this.container.remove();
    }
  }

  private buildMounts(): string[] {
    const mounts: string[] = [];

    // Default: Mount project directory
    mounts.push(`${this.projectDir}:/workspace`);

    // User-specified mounts from devcontainer.json
    if (this.config?.mounts) {
      for (const mount of this.config.mounts) {
        // Replace ${localWorkspaceFolder} with actual path
        const resolved = mount.replace(
          '${localWorkspaceFolder}',
          this.projectDir
        );
        mounts.push(resolved);
      }
    }

    return mounts;
  }

  private buildEnv(): string[] {
    const env: string[] = [];

    if (this.config?.containerEnv) {
      for (const [key, value] of Object.entries(this.config.containerEnv)) {
        env.push(`${key}=${value}`);
      }
    }

    return env;
  }
}
```

---

## 🏗️ Mode 3: Docker (User-provided)

### Overview

**How it works**:
- User provides their own `Dockerfile`, `docker-compose.yml`, or image name
- NO custom Mimir images required
- Full container isolation with permission system on top

**Configuration**:
```yaml
# .mimir/config.yml
execution:
  mode: docker

docker:
  # Option A: User's Dockerfile
  dockerfile: .mimir/Dockerfile

  # Option B: Pre-built image
  # image: node:20-alpine
  # image: my-company/dev-environment:latest

  # Option C: Docker Compose
  # composeFile: docker-compose.yml
  # service: app

  # Workspace mounting
  workspaceMount:
    containerPath: /workspace
    readOnly: false

  # Network (optional)
  network: limited  # disabled | limited | full
  allowedDomains:
    - github.com
    - npmjs.com
    - pypi.org

  # Resource limits (optional)
  resources:
    cpuLimit: '2.0'      # 2 cores
    memoryLimit: '4g'    # 4GB RAM
```

**Example User Dockerfile**:
```dockerfile
# .mimir/Dockerfile (user-provided)
FROM node:20-alpine

# Install additional tools
RUN apk add --no-cache git curl

# Set up workspace
WORKDIR /workspace

# Install global packages
RUN npm install -g typescript ts-node

# Keep container alive
CMD ["tail", "-f", "/dev/null"]
```

### Implementation

```typescript
/**
 * Docker executor - uses user-provided Dockerfile/image
 */
export class DockerExecutor implements IExecutor {
  private container: Docker.Container | null = null;

  constructor(
    private docker: Docker,
    private fs: IFileSystem,
    private permissionManager: PermissionManager,
    private config: DockerConfig
  ) {}

  async initialize(): Promise<void> {
    let imageName: string;

    if (this.config.dockerfile) {
      // Build from user's Dockerfile
      imageName = await this.buildFromDockerfile(this.config.dockerfile);
    } else if (this.config.image) {
      // Use pre-built image
      imageName = this.config.image;
      await this.pullImage(imageName);
    } else if (this.config.composeFile) {
      // Use docker-compose
      await this.startCompose(this.config.composeFile);
      return;
    } else {
      throw new Error('No Docker configuration provided');
    }

    // Create container
    this.container = await this.docker.createContainer({
      Image: imageName,
      HostConfig: {
        Binds: [
          `${this.config.projectDir}:${this.config.workspaceMount.containerPath}`,
        ],
        NetworkMode: this.getNetworkMode(),
        Memory: this.parseMemory(this.config.resources?.memoryLimit),
        NanoCpus: this.parseCpu(this.config.resources?.cpuLimit),
      },
      WorkingDir: this.config.workspaceMount.containerPath,
      Cmd: ['tail', '-f', '/dev/null'], // Keep alive
    });

    await this.container.start();
  }

  private async buildFromDockerfile(
    dockerfilePath: string
  ): Promise<string> {
    const absolutePath = path.join(this.config.projectDir, dockerfilePath);
    const dockerfileDir = path.dirname(absolutePath);
    const imageName = `mimir-user-${Date.now()}`;

    console.log(`Building Docker image from ${dockerfilePath}...`);

    const stream = await this.docker.buildImage(
      {
        context: dockerfileDir,
        src: [path.basename(absolutePath)],
      },
      { t: imageName }
    );

    await this.followProgress(stream);

    console.log(`Image built: ${imageName}`);
    return imageName;
  }

  // execute, cleanup, etc. - similar to DevContainerExecutor
}
```

---

## 🏗️ Mode 4: Cloud (Teams/Enterprise)

### Overview

**How it works**:
- Provision isolated VMs via Mimir Teams API
- Centralized context storage and audit logs
- Network proxy with domain allowlisting
- Enforced for enterprise compliance

**Configuration**:
```yaml
# Managed by Teams Admin Console (enforced)
execution:
  mode: cloud  # Cannot be overridden by users

cloud:
  region: us-east-1
  vmSize: standard  # standard | large

  # Network restrictions
  network: limited
  allowedDomains:
    - github.com
    - npmjs.com
    - internal.company.com

  # Auto-cleanup
  sessionTimeout: 3600  # 1 hour
```

### Implementation

```typescript
/**
 * Cloud executor - provisions VMs via Teams API
 */
export class CloudExecutor implements IExecutor {
  private sessionId: string | null = null;
  private vmId: string | null = null;

  constructor(
    private teamsAPI: TeamsAPIClient,
    private orgId: string,
    private config: CloudConfig
  ) {}

  async initialize(): Promise<void> {
    // Provision VM via Teams API
    const response = await this.teamsAPI.post(
      `/orgs/${this.orgId}/execution/provision`,
      {
        region: this.config.region,
        vmSize: this.config.vmSize,
        network: {
          mode: this.config.network,
          allowedDomains: this.config.allowedDomains,
        },
      }
    );

    this.sessionId = response.data.sessionId;
    this.vmId = response.data.vmId;

    console.log(`VM provisioned: ${this.vmId}`);
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    if (!this.sessionId) {
      throw new Error('Session not initialized');
    }

    // Execute via Teams API
    const response = await this.teamsAPI.post(
      `/orgs/${this.orgId}/execution/${this.sessionId}/execute`,
      {
        command,
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
      }
    );

    return {
      exitCode: response.data.exitCode,
      stdout: response.data.stdout,
      stderr: response.data.stderr,
    };
  }

  async cleanup(): Promise<void> {
    if (this.sessionId) {
      // Cleanup VM via Teams API
      await this.teamsAPI.delete(
        `/orgs/${this.orgId}/execution/${this.sessionId}`
      );
    }
  }
}
```

---

## 🔧 Unified Executor Interface

### Common Interface

```typescript
/**
 * Executor interface - all modes implement this
 */
export interface IExecutor {
  /**
   * Initialize executor (pull images, provision VMs, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Execute command
   */
  execute(
    command: string,
    options?: ExecuteOptions
  ): Promise<ExecuteResult>;

  /**
   * Read file
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Write file
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Cleanup (stop containers, delete VMs, etc.)
   */
  cleanup(): Promise<void>;
}

export interface ExecuteOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration?: number;
}
```

### Factory Pattern

```typescript
/**
 * Executor factory - creates appropriate executor based on config
 */
export class ExecutorFactory {
  constructor(
    private fs: IFileSystem,
    private process: IProcessExecutor,
    private permissionManager: PermissionManager,
    private config: MimirConfig
  ) {}

  async createExecutor(): Promise<IExecutor> {
    // 1. Teams enforcement (highest priority)
    if (this.config.teams?.enforceCloud) {
      return this.createCloudExecutor();
    }

    if (this.config.teams?.enforceSandbox) {
      return this.config.teams.enforceCloud
        ? this.createCloudExecutor()
        : this.createDockerExecutor();
    }

    // 2. User-specified mode
    const mode = this.config.execution?.mode || 'auto';

    switch (mode) {
      case 'native':
        return this.createNativeExecutor();

      case 'devcontainer':
        return this.createDevContainerExecutor();

      case 'docker':
        return this.createDockerExecutor();

      case 'cloud':
        return this.createCloudExecutor();

      case 'auto':
        return await this.autoDetectExecutor();

      default:
        throw new Error(`Unknown execution mode: ${mode}`);
    }
  }

  private async autoDetectExecutor(): Promise<IExecutor> {
    // Check for .devcontainer/devcontainer.json
    const devcontainerPath = path.join(
      this.config.projectDir,
      '.devcontainer/devcontainer.json'
    );

    if (await this.fs.exists(devcontainerPath)) {
      console.log('Detected .devcontainer/devcontainer.json, using devcontainer mode');
      return this.createDevContainerExecutor();
    }

    // Default to native
    console.log('Using native execution mode');
    return this.createNativeExecutor();
  }

  private createNativeExecutor(): IExecutor {
    return new NativeExecutor(
      this.fs,
      this.process,
      this.permissionManager,
      this.config
    );
  }

  private async createDevContainerExecutor(): Promise<IExecutor> {
    const docker = new Docker();
    const executor = new DevContainerExecutor(
      docker,
      this.fs,
      this.permissionManager,
      this.config.projectDir
    );
    await executor.initialize();
    return executor;
  }

  private async createDockerExecutor(): Promise<IExecutor> {
    const docker = new Docker();
    const executor = new DockerExecutor(
      docker,
      this.fs,
      this.permissionManager,
      this.config.docker!
    );
    await executor.initialize();
    return executor;
  }

  private async createCloudExecutor(): Promise<IExecutor> {
    const teamsAPI = new TeamsAPIClient(this.config.teams!);
    const executor = new CloudExecutor(
      teamsAPI,
      this.config.teams!.orgId,
      this.config.cloud!
    );
    await executor.initialize();
    return executor;
  }
}
```

---

## 🧪 Testing with Testcontainers

### Setup

```bash
yarn add -D @testcontainers/testcontainers
```

### Test Example

```typescript
/**
 * Integration tests using testcontainers
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DockerExecutor } from '../src/execution/DockerExecutor';

describe('DockerExecutor', () => {
  let container: StartedTestContainer;
  let executor: DockerExecutor;

  beforeAll(async () => {
    // Start test container
    container = await new GenericContainer('node:20-alpine')
      .withWorkingDir('/workspace')
      .withBindMounts([
        {
          source: __dirname,
          target: '/workspace',
        },
      ])
      .start();

    executor = new DockerExecutor(
      container.getDocker(),
      // ... other dependencies
    );
  });

  afterAll(async () => {
    await container.stop();
  });

  it('should execute bash command in container', async () => {
    const result = await executor.execute('echo "Hello World"');

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('Hello World');
  });

  it('should respect permission system', async () => {
    // Denied command
    await expect(
      executor.execute('curl https://evil.com')
    ).rejects.toThrow('Command denied');
  });

  it('should enforce filesystem restrictions', async () => {
    // Can write in workspace
    await executor.writeFile('/workspace/test.txt', 'content');

    // Cannot write outside workspace
    await expect(
      executor.writeFile('/etc/passwd', 'malicious')
    ).rejects.toThrow('Permission denied');
  });
});
```

---

## 📊 Decision Matrix

| Criterion | Native | Dev Container | Docker | Cloud |
|-----------|--------|--------------|--------|-------|
| **Startup time** | Instant | 2-5s (cached) | 5-30s | 10-60s |
| **Security** | Permissions | Container + Permissions | Container + Permissions | VM + Permissions |
| **Setup required** | None | Auto-detect | User Dockerfile/image | Teams auth |
| **Performance** | Native speed | Near-native | ~95% native | Network latency |
| **Offline support** | ✅ Yes | ✅ Yes (if cached) | ✅ Yes (if cached) | ❌ No |
| **Best for** | Development | Projects with devcontainer | Custom security | Enterprise |

---

## 🎯 Implementation Roadmap

### Phase 1: Native Executor (Week 1)
- [x] IExecutor interface
- [ ] NativeExecutor implementation
- [ ] Enhanced PermissionManager
- [ ] Risk assessment
- [ ] Filesystem restrictions
- [ ] Tests with mocks

### Phase 2: Dev Container Support (Week 2)
- [ ] DevContainerExecutor
- [ ] Auto-detect .devcontainer/devcontainer.json
- [ ] Parse and apply devcontainer config
- [ ] Integration tests with testcontainers

### Phase 3: Docker Executor (Week 3)
- [ ] DockerExecutor
- [ ] Support user Dockerfile
- [ ] Support user image
- [ ] Support docker-compose
- [ ] Integration tests with testcontainers

### Phase 4: Cloud Executor (Week 4)
- [ ] CloudExecutor
- [ ] Teams API integration
- [ ] VM provisioning
- [ ] Network proxy
- [ ] Integration tests (mocked API)

### Phase 5: Factory & Integration (Week 5)
- [ ] ExecutorFactory
- [ ] Auto-detection logic
- [ ] CLI integration
- [ ] Agent integration
- [ ] End-to-end tests

---

## 📚 References

**Industry Research**:
- [Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Claude Code Permissions Guide](https://www.eesel.ai/blog/claude-code-permissions)
- [Ultimate Guide to Dev Containers](https://www.daytona.io/dotfiles/ultimate-guide-to-dev-containers)
- [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/create-dev-container)
- [How to Safely Use Cursor and Windsurf](https://www.geeky-gadgets.com/cursor-windsurf-security-risks/)
- [AI Coding Agents Production Challenges](https://venturebeat.com/ai/why-ai-coding-agents-arent-production-ready-brittle-context-windows-broken)

---

**Generated**: 2025-12-28
**Status**: Architecture Complete (Simplified)
**Next**: Implementation Phase 1 (Native Executor)
